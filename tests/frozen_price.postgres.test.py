#!/usr/bin/env python3
"""The price an OPEN CHECK was opened at survives, in a REAL Postgres 18 (sales#175).

Decidido por el mercado (8 referencias + foros, en la issue y en ADR-0402): una cuenta abierta se
cobra al precio que tenía **cuando se pidió**, no al del catálogo cuando se paga. Square congela el
pedido al crearlo, Simphony excluye del cambio de precio «menu items from a previous service round»,
Odoo no recalcula las líneas de un pedido ya creado y Lightspeed exige permiso para re-preciar una a
mano. Shopify probó lo contrario en enero de 2025 y acabó publicando su `price lock`.

Eso convierte `sales_order_item.unit_price` en una columna que **decide dinero**. Hasta sales#175 era
un provisional de display: el cobro re-preciaba contra `inventory.products.for_sale` y daba igual lo
que pusiera ahí. Ahora no. Los tests del handler prueban la aritmética —cambiar el catálogo y cobrar
igual— porque el catálogo es una lectura de OTRO módulo, no una tabla del esquema de `sales`. Lo que
no pueden probar es lo que solo decide una base de datos de verdad, que es lo que hay aquí:

  1. LA COLUMNA QUE DECIDE. `unit_price` es entero (unidad mínima, ADR-0007/0123) y NOT NULL: un
     NULL colándose ahí sería una cuenta que no se puede cobrar.

  2. NADIE LA REESCRIBE. Ninguna sentencia del módulo hace `UPDATE ... SET unit_price`. Es el guard
     que sostiene la decisión entera: el día que alguien añada un «refrescar precios» del pedido, la
     congelación se rompe **en silencio** y ningún test de handler se entera.

  3. LOS TRES NÚMEROS CONGELADOS VUELVEN. `sales.order.lines` —la puerta por la que el cobro los
     lee— devuelve `unit_price`, `cost` y `tax_category_key`. Si uno deja de viajar, el cobro no
     re-precia: RECHAZA la venta, y la mesa no puede pagar.

  4. UNA LÍNEA YA COBRADA NO VUELVE. La query filtra `sale_id IS NULL`. Con el precio congelado eso
     deja de ser una comodidad de pantalla: es lo que hace que cobrar dos veces la misma línea sea
     un rechazo (`sales.order_line_not_available`) en vez de un cargo repetido.

  5. TENANCY, con un VECINO VIVO. Dos hubs, dos cuentas abiertas, un precio congelado cada una,
     sembradas por la puerta que aplica el aislamiento: el precio del vecino no puede asomar. Un
     test de aislamiento sin vecino, o sembrado con un helper, no prueba nada.

Usage: tests/frozen_price.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail. It NEVER skips itself: a
  battery that goes green because it could not reach Postgres is worse than no battery at all.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_frozen_price_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-waiter"
ORDER = "ord-table-4"
OTHER_ORDER = "ord-next-door"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")
        print(f"  ✗ {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ✓ {label}")


# ── Postgres plumbing ────────────────────────────────────────────────────────────────────


def psql(args: list[str], db: str | None = None, stdin: str | None = None) -> str:
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"]
    if db:
        cmd += ["-d", db]
    cmd += args
    res = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res.stdout


def q(sql: str) -> str:
    try:
        return psql(["-tAc", sql], db=DB).strip()
    except RuntimeError as exc:
        return f"<sql error: {str(exc).splitlines()[0]}>"


def qi(sql: str) -> int:
    raw = q(sql)
    try:
        return int(raw)
    except ValueError:
        return -1


# ── The runtime, in miniature ────────────────────────────────────────────────────────────

PARAM = re.compile(r":([a-z_][a-z0-9_]*)", re.IGNORECASE)
DDL_TYPES = {"INTEGER": "BIGINT", "REAL": "DOUBLE PRECISION", "BLOB": "BYTEA", "TEXT": "TEXT"}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        value = json.dumps(value, separators=(",", ":"))
    return "'" + str(value).replace("'", "''") + "'"


def comment_spans(text: str) -> list[tuple[int, int]]:
    spans, i, n = [], 0, len(text)
    while i < n:
        if text.startswith("--", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            spans.append((i, j))
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i)
            j = n if j < 0 else j + 2
            spans.append((i, j))
            i = j
        else:
            i += 1
    return spans


def strip_comments(sql: str) -> str:
    out, last = [], 0
    for a, b in comment_spans(sql):
        out.append(sql[last:a])
        last = b
    out.append(sql[last:])
    return "".join(out)


def bind(sql: str, params: dict) -> str:
    spans = comment_spans(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in spans)

    return PARAM.sub(
        lambda m: (m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))),
        sql,
    )


def run_command(name: str, payload: dict, hub: str = HUB, now: str = "2026-08-25T10:00:00+00:00"):
    cmd = MANIFEST["commands"].get(name)
    if cmd is None:
        return False, f"command `{name}` is not declared in module.json"
    files = cmd.get("sql")
    if not files:
        return False, f"command `{name}` declares no sql[] (handler `{cmd.get('handler')}`)"

    params = dict(payload)
    params.setdefault("hub_id", hub)
    params.setdefault("current_user_id", USER)
    params.setdefault("now", now)

    script = ["BEGIN;"]
    for rel in files:
        path = MODULE_DIR / rel
        if not path.exists():
            return False, f"`{name}` declares `{rel}`, which does not exist"
        script.append(bind(path.read_text(), params))
    script.append("COMMIT;")
    try:
        psql([], db=DB, stdin="\n".join(script))
        return True, ""
    except RuntimeError as exc:
        return False, str(exc).splitlines()[0]


def run_query(name: str, params: dict, hub: str = HUB) -> list[dict]:
    spec = MANIFEST["queries"].get(name)
    if spec is None:
        failures.append(f"query `{name}` is not declared in module.json")
        return []
    sql = (MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";")
    bound = bind(sql, {**params, "hub_id": hub})
    try:
        raw = psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"], db=DB).strip()
    except RuntimeError as exc:
        failures.append(f"query `{name}` failed: {str(exc).splitlines()[0]}")
        return []
    return json.loads(raw) if raw and raw != "" else []


def load_migrations() -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        sql = DDL_TOKEN.sub(lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text())
        psql([], db=DB, stdin=sql)


# ── the row, exactly as the handlers bind it ─────────────────────────────────────────────

# Todos los parámetros que bindea `sales._insert_order_line`, escritos enteros a propósito: es la
# forma del payload que producen los DOS handlers (`open_order` y `add_order_line`), así que si el
# command crece un parámetro y el handler no —o al revés— es aquí donde se ve.
def line_params(line_id: str, unit_price: int, order_id: str = ORDER, **over) -> dict:
    params = {
        "id": line_id,
        "order_id": order_id,
        "product_id": "p-burger",
        "product_name": "Hamburguesa",
        "product_sku": "",
        "quantity": 1_000_000,
        # 🔴 El número que decide el dinero. Lo resolvió el handler contra el catálogo; aquí llega ya
        # resuelto, que es exactamente como llega en producción.
        "unit_price": unit_price,
        "is_gift": 0,
        "gift_reason": "",
        "line_total": unit_price,
        "tax_category_key": "restaurant.food",
        "cost": 400,
        "is_service": 0,
        "category_id": "cat-cocina",
        "discount_percent": 0.0,
        "modifiers": "[]",
        "combo": "{}",
        "combo_group_ref": None,
        "unit_code": "ud",
        "unit_name": "unidad",
        "factor_num": 1,
        "factor_den": 1,
        "increment_value": 1_000_000,
        "price_quantity_value": 1_000_000,
        "pricing_unit_code": "ud",
        "pricing_unit_name": "unidad",
        "pricing_factor_num": 1,
        "pricing_factor_den": 1,
    }
    params.update(over)
    return params


def seed_order(order_id: str = ORDER, hub: str = HUB) -> None:
    psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted,"
                " created_at, updated_at)"
                " VALUES (:id, :hub_id, 'open', 0, 0, :now, :now)",
                {"id": order_id, "hub_id": hub, "now": "2026-08-25T09:00:00+00:00"},
            ),
        ],
        db=DB,
    )


# ── 1 · the column that decides the money ────────────────────────────────────────────────


def test_the_column_that_decides_the_money_is_an_integer_and_not_null() -> None:
    print("\n1 · sales_order_item.unit_price is the frozen money of the check")
    check("`unit_price` exists", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='unit_price'"), "1")
    # ADR-0007/0123: dinero SIEMPRE entero en la unidad mínima. Un float aquí es un céntimo que se
    # pierde por cuenta y un arqueo que no cuadra al final del día.
    check("and it is an integer, not a float (ADR-0007/0123)", q(
        "SELECT data_type FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='unit_price'"), "bigint")
    check("and NOT NULL — una cuenta con precio nulo no se puede cobrar", q(
        "SELECT is_nullable FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='unit_price'"), "NO")
    # Los otros dos números que el cobro honra desde sales#175 y que tampoco se re-derivan.
    check("`cost` viaja con la línea (arqueo de invitaciones)", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='cost'"), "1")
    check("`tax_category_key` también (autoridad del IVA, ADR-0085)", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='tax_category_key'"), "1")


# ── 2 · nothing rewrites it ──────────────────────────────────────────────────────────────


def test_no_statement_of_the_module_rewrites_the_frozen_price() -> None:
    print("\n2 · ninguna sentencia del módulo reescribe `unit_price`")
    # El guard que sostiene la decisión entera. Un «refrescar precios del pedido» añadido mañana
    # rompería la congelación EN SILENCIO: el handler seguiría verde y la mesa pagaría otra cosa.
    setter = re.compile(r"\bset\b[^;]*?\bunit_price\s*=", re.IGNORECASE | re.DOTALL)
    offenders = []
    for sql_file in sorted((MODULE_DIR / "commands").glob("*.sql")):
        body = strip_comments(sql_file.read_text())
        if "update" not in body.lower():
            continue
        if setter.search(body):
            offenders.append(sql_file.name)
    check("ningún UPDATE ... SET unit_price en `commands/`", offenders, [])
    # Y la migración tampoco lo toca en un backfill: eso re-preciaría cuentas ya abiertas.
    mig_offenders = [
        m.name
        for m in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql"))
        if setter.search(strip_comments(m.read_text()))
    ]
    check("ni una migración que lo reescriba", mig_offenders, [])


# ── 3-4 · the frozen numbers come back, and a paid line does not ─────────────────────────


def test_the_frozen_numbers_come_back_and_a_paid_line_does_not() -> None:
    print("\n3-4 · `sales.order.lines` devuelve lo congelado, y no lo ya cobrado")
    seed_order()
    ok, err = run_command("sales._insert_order_line", line_params("line-1", 900))
    check("la línea entra por la puerta que usan los dos handlers", (ok, err), (True, ""))
    ok, err = run_command("sales._insert_order_line", line_params(
        "line-2", 250, product_id="p-cana", product_name="Caña"))
    check("y la segunda también", (ok, err), (True, ""))
    ok, err = run_command("sales._recompute_order_total", {"order_id": ORDER})
    check("el total provisional se recompone en su propio command", (ok, err), (True, ""))
    check("y es la suma de las líneas vivas", qi(
        f"SELECT provisional_total FROM sales_order WHERE id='{ORDER}'"), 1150)

    rows = {r["id"]: r for r in run_query("sales.order.lines", {"order_id": ORDER})}
    check("las dos líneas vuelven", sorted(rows), ["line-1", "line-2"])
    # 🔴 EL PUNTO. Estos tres números son los que el cobro HONRA desde sales#175. Si uno deja de
    # viajar, el cobro no re-precia: rechaza la venta y la mesa no puede pagar.
    check("vuelve el precio CONGELADO", rows.get("line-1", {}).get("unit_price"), 900)
    check("vuelve el coste congelado", rows.get("line-1", {}).get("cost"), 400)
    check("vuelve la categoría fiscal congelada",
          rows.get("line-1", {}).get("tax_category_key"), "restaurant.food")
    check("y el id de la fila, que es como la línea del cobro la nombra (`order_item_id`)",
          rows.get("line-1", {}).get("id"), "line-1")

    # 4 · una línea YA COBRADA no vuelve. Con el precio congelado eso deja de ser cosmético: es lo
    # que convierte «cobrar dos veces la misma línea» en un rechazo y no en un cargo repetido.
    psql(["-c", f"UPDATE sales_order_item SET sale_id='sale-1' WHERE id='line-2'"], db=DB)
    rows = run_query("sales.order.lines", {"order_id": ORDER})
    check("la línea ya cobrada desaparece de la cuenta", [r["id"] for r in rows], ["line-1"])


# ── 5 · tenancy, with a live neighbour ───────────────────────────────────────────────────


def test_the_frozen_price_never_crosses_hubs() -> None:
    print("\n5 · el precio congelado del vecino no asoma")
    # El VECINO es real y está vivo: su hub, su cuenta abierta, su precio congelado, escrito por la
    # MISMA puerta. Sin vecino, este test pasaría porque no hay nada que filtrar.
    seed_order(order_id=OTHER_ORDER, hub=OTHER_HUB)
    ok, err = run_command("sales._insert_order_line", line_params(
        "line-vecino", 9900, order_id=OTHER_ORDER, product_name="Chuletón del vecino"), hub=OTHER_HUB)
    check("la línea del vecino se escribe de verdad", (ok, err), (True, ""))

    # Control positivo PRIMERO: si el vecino no pudiera leer la suya, el vacío de abajo no probaría
    # el filtro, solo una query que no devuelve nada.
    theirs = run_query("sales.order.lines", {"order_id": OTHER_ORDER}, hub=OTHER_HUB)
    check("control: el vecino SÍ lee su línea", [r["unit_price"] for r in theirs], [9900])
    leaked = run_query("sales.order.lines", {"order_id": OTHER_ORDER})
    check("y nosotros nunca, ni pidiendo su cuenta por id", leaked, [])
    ours = run_query("sales.order.lines", {"order_id": ORDER})
    check("y nuestra cuenta sigue con SU precio", [r["unit_price"] for r in ours], [900])


def main() -> int:
    running = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER],
        capture_output=True,
        text=True,
    )
    if "true" not in running.stdout:
        subprocess.run(["docker", "start", CONTAINER], capture_output=True)

    psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])
    psql(["-c", f"CREATE DATABASE {DB}"])
    try:
        load_migrations()
        test_the_column_that_decides_the_money_is_an_integer_and_not_null()
        test_no_statement_of_the_module_rewrites_the_frozen_price()
        test_the_frozen_numbers_come_back_and_a_paid_line_does_not()
        test_the_frozen_price_never_crosses_hubs()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — el precio con el que se abrió la cuenta sobrevive y nadie lo reescribe (sales#175)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
