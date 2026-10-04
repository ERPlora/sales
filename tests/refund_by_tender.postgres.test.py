#!/usr/bin/env python3
"""Devolución por TENDER ELEGIBLE con reparto editable (sales#160 / ADR-0386 decisión 3), contra un
Postgres 18 REAL.

Por qué una batería SQL encima de los tests del handler: el handler decide QUÉ vuelve a cada pata,
pero esa decisión solo existe si la fila donde aterriza existe de verdad, lleva el contrato de fila
del hub, y —lo que aquí es el corazón— la puerta que calcula el TOPE y la ELEGIBILIDAD devuelve lo
que el handler cree que devuelve. Ese cálculo es SQL: es lo ya devuelto contra lo cobrado, más un
JOIN contra el catálogo de métodos. Un tope mal calculado no se ve en un test del handler, porque
allí el tope llega dado.

Lo que está bajo prueba, y por qué cada punto está aquí:

  1. LAS TABLAS. `sales_sale_refund` (el documento) y `sales_sale_refund_payment` (a qué pata vuelve
     cada euro) existen con el contrato de fila del hub (`hub_id`, soft-delete, auditoría). Una
     tabla hija sin `hub_id` es un agujero de tenancy; y sin soft-delete no se corrige un histórico
     pegado a lo fiscal sin borrarlo.

  2. LAS PUERTAS. `sales._insert_refund`, `sales._insert_refund_payment` y `sales._mark_refunded` —
     los comandos que el handler emite— bindean y corren EXACTAMENTE como los corre el runtime
     (`execute_tx`: una transacción, parámetros de sistema inyectados). Un statement que Postgres no
     puede ni PREPARAR es un comando que no existe en ningún hub (ADR-0154).

  3. EL TOPE Y LA ELEGIBILIDAD (`sales.refund_options`). Es la puerta de la que cuelga toda la
     issue:
       * lo cobrado menos lo ya devuelto = lo que queda, al céntimo;
       * una pata devuelta entera sale `refundable = 0` con motivo `already_refunded`;
       * una pata cuyo método se desactivó sale `refundable = 0` con motivo `method_unavailable`
         y `remaining > 0` — el dinero SÍ puede salir, pero por otra puerta. Es el caso de Square
         («even if the gift card does not exist or has been reused»), y distinguirlo del anterior
         es lo que separa «no se puede devolver» de «no se puede devolver AQUÍ»;
       * y devuelve SIEMPRE una fila por pata, también cuando no hay nada que devolver, para que
         «no hay filas» y «no devolvible» no se confundan (mismo criterio que
         `services.packages.refund_check`).

  4. TENANCY. Dos hubs, el mismo id de venta y de pata: ni el tope ni el histórico del vecino
     asoman. Sembrado por la puerta que aplica el scope, con el vecino VIVO — un test de scoping
     sin vecino no prueba nada.

  5. IDEMPOTENCIA. `refund_ref` es el id del documento y tiene que ser ESTABLE: lo pidió `services`
     en la issue, porque es su clave de idempotencia al devolver la sesión al bono. La sonda
     `sales.refund_by_idempotency_key` resuelve el reintento normal, y el índice único parcial es
     la autoridad FINAL para dos peticiones simultáneas, que ambas leen «no existe».

Contrato de dinero: ADR-0123 (céntimos enteros). Aquí nada se divide: cada pata lleva los céntimos
que el operador le asignó, así que no hay reparto que redondear.

Uso: tests/refund_by_tender.postgres.test.py
  Usa el contenedor `erplora-test-pg-5433` por defecto (override: SALES_TEST_PG_CONTAINER; el
  toolkit lo fija por job de CI). Crea una base de datos de usar y tirar y la BORRA al final, pase
  o falle. NUNCA se salta a sí mismo: una batería que sale verde porque no pudo llegar a Postgres es
  peor que no tener batería.
"""

import collections
import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_refund_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-manager"
SALE = "sale-1"
OTHER_SALE = "sale-next-door"
NOW = "2026-08-24T10:00:00+00:00"

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
    """Scalar query. A missing relation/column is a RED result, not a crash: the run must report
    every acceptance point, not stop at the first one."""
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
# Portable type subset → native Postgres type (ADR-0007 §4b, `shim_ddl_types`). Without this the
# money columns land as int4 instead of BIGINT and the harness would not run production's schema.
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


def bind(sql: str, params: dict) -> str:
    """Single pass over the `:name` placeholders — a value that itself contains a colon (an ISO
    timestamp) must never be rescanned. `:name` inside a comment is left alone, like the runtime's
    translator does."""

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

    spans = comment_spans(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in spans)

    return PARAM.sub(
        lambda m: (m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))),
        sql,
    )


def run_command(name: str, payload: dict, hub: str = HUB, now: str = "2026-08-24T10:00:00+00:00"):
    """Execute a manifest command's `sql[]` the way the runtime does: one transaction, system
    params injected. Returns (ok, error)."""
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
    """Execute a manifest query the way the runtime does, returning rows as dicts."""
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




# ── El banco: una venta de 70,00 € cobrada con DOS medios ────────────────────────────────
#
# ⚠️ La fixture se siembra COMPLETA a propósito. En esta misma cadena han salido tres fixtures
# mentirosas —métodos sin `type`, importes en euros donde el TPV lee céntimos, productos sin
# categoría fiscal— y cada una costó un diagnóstico entero antes de descubrirse que el banco era el
# que mentía. Aquí los métodos llevan `type` y `is_active`, y el dinero va en CÉNTIMOS.


def seed_methods(hub: str = HUB, suffix: str = "") -> None:
    # El id del metodo es clave primaria, asi que dos hubs en la MISMA base de datos no pueden
    # compartirlo (en produccion cada hub tiene su propia BD, ADR-0201). Lo que si comparten aqui
    # —y es lo que el test necesita— son los ids de VENTA y de PATA.
    for pm_id, name, kind, active in (
        ("pm-card" + suffix, "Tarjeta", "card", 1),
        ("pm-cash" + suffix, "Efectivo", "cash", 1),
    ):
        psql(["-c", bind(
            "INSERT INTO sales_payment_method (id, hub_id, name, type, is_active, is_deleted,"
            " created_at, updated_at) VALUES (:id, :hub_id, :name, :type, :active, 0, :now, :now)",
            {"id": pm_id, "hub_id": hub, "name": name, "type": kind, "active": active, "now": NOW},
        )], db=DB)


def seed_sale(sale_id: str = SALE, hub: str = HUB) -> None:
    psql(["-c", bind(
        "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted, created_at,"
        " updated_at) VALUES (:id, :hub_id, '20260824-0007', 'completed', 7000, 0, :now, :now)",
        {"id": sale_id, "hub_id": hub, "now": NOW},
    )], db=DB)


def seed_legs(sale_id: str = SALE, hub: str = HUB, prefix: str = "pay", suffix: str = "") -> None:
    """Las patas del cobro, por la MISMA puerta que las escribe en producción."""
    for order, (leg, pm_id, name, kind, amount) in enumerate((
        (f"{prefix}-card", "pm-card" + suffix, "Tarjeta", "card", 5000),
        (f"{prefix}-cash", "pm-cash" + suffix, "Efectivo", "cash", 2000),
    )):
        ok, err = run_command("sales._insert_payment", {
            "payment_id": leg, "sale_id": sale_id, "sort_order": order,
            "payment_method_id": pm_id, "payment_method_name": name,
            "payment_method_type": kind, "amount": amount, "amount_tendered": amount,
            "change_due": 0, "reference": "",
        }, hub=hub)
        check(f"seed leg `{leg}` in {hub}", (ok, err), (True, ""))


def refund(refund_id: str, legs: list[tuple[str, str, int]], *, hub: str = HUB,
           idem: str = "", total: int | None = None) -> tuple[bool, str]:
    """Un documento de devolución completo, por las puertas del manifiesto."""
    amount = total if total is not None else sum(a for _, _, a in legs)
    ok, err = run_command("sales._insert_refund", {
        "refund_id": refund_id, "sale_id": SALE, "total": amount,
        "reason": "el cliente devuelve el producto", "note": "", "idempotency_key": idem,
    }, hub=hub)
    if not ok:
        return ok, err
    for order, (leg_id, payment_id, leg_amount) in enumerate(legs):
        ok, err = run_command("sales._insert_refund_payment", {
            "refund_payment_id": leg_id, "refund_id": refund_id, "sale_id": SALE,
            "payment_id": payment_id, "payment_method_id": "pm-cash",
            "payment_method_name": "Efectivo", "payment_method_type": "cash",
            "amount": leg_amount, "sort_order": order,
        }, hub=hub)
        if not ok:
            return ok, err
    return True, ""


def options(hub: str = HUB, sale_id: str = SALE) -> dict[str, dict]:
    """Las patas indexadas por id. Una pata que falte no revienta la pasada: se anota y se sigue,
    porque una batería que se corta en el primer fallo esconde los otros seis."""
    rows = {r["payment_id"]: r for r in run_query(
        "sales.refund_options", {"sale_id": sale_id}, hub=hub)}
    missing = {"payment_id": "", "charged": -1, "refunded": -1, "remaining": -1,
               "refundable": -1, "reason": "<missing row>", "payment_method_name": ""}
    return collections.defaultdict(lambda: dict(missing), rows)


# ── 1 · las tablas y su contrato de fila ─────────────────────────────────────────────────


def test_the_tables_carry_the_hub_row_contract() -> None:
    print("\n1 · sales_sale_refund y sales_sale_refund_payment con el contrato de fila del hub")
    for table, cols in (
        ("sales_sale_refund",
         ("id", "hub_id", "sale_id", "total", "reason", "note", "idempotency_key")),
        ("sales_sale_refund_payment",
         ("id", "hub_id", "refund_id", "sale_id", "payment_id", "payment_method_id",
          "payment_method_name", "payment_method_type", "amount", "sort_order")),
    ):
        present = {
            c for c in q(
                "SELECT string_agg(column_name, ',') FROM information_schema.columns"
                f" WHERE table_name = '{table}'"
            ).split(",") if c
        }
        for col in cols + ("is_deleted", "deleted_at", "created_by", "updated_by",
                           "created_at", "updated_at"):
            check(f"{table}.{col}", col in present, True)

    # El dinero es un entero de céntimos ANCHO. En int4 un total de más de 21 millones de euros
    # desborda, y el desbordamiento de Postgres es un error, no un número raro — pero llegaría en
    # medio de una devolución.
    check(
        "sales_sale_refund_payment.amount es bigint",
        q("SELECT data_type FROM information_schema.columns WHERE table_name ="
          " 'sales_sale_refund_payment' AND column_name = 'amount'"),
        "bigint",
    )


# ── 2 · las puertas, tal como las corre el runtime ───────────────────────────────────────


def test_the_commands_run_the_way_the_runtime_runs_them() -> None:
    print("\n2 · los comandos del handler bindean y corren")
    seed_methods()
    seed_sale()
    seed_legs()

    ok, err = refund("ref-1", [("ref-leg-1", "pay-cash", 2000)], idem="idem-0001")
    check("`sales._insert_refund` + `_insert_refund_payment`", (ok, err), (True, ""))

    check("la cabecera guarda su total", qi(
        f"SELECT total FROM sales_sale_refund WHERE id='ref-1' AND hub_id='{HUB}'"), 2000)
    check("las patas suman la cabecera, al céntimo", qi(
        "SELECT COALESCE(SUM(amount),0) FROM sales_sale_refund_payment"
        f" WHERE refund_id='ref-1' AND hub_id='{HUB}' AND is_deleted=0"), 2000)
    check("y la auditoría llega escrita", q(
        f"SELECT created_by FROM sales_sale_refund WHERE id='ref-1'"), USER)

    # sales#506: the handler emits `sales._mark_refunded` after EVERY refund, and the statement
    # decides against the legs written. 20,00 € of 70,00 € back: the sale stays live.
    ok, err = run_command("sales._mark_refunded", {"sale_id": SALE})
    check("`sales._mark_refunded` corre", (ok, err), (True, ""))
    check("a partial refund leaves the sale `completed`", q(
        f"SELECT status FROM sales_sale WHERE id='{SALE}' AND hub_id='{HUB}'"), "completed")

    # The last cent, on a sale of its own so the cap of the next points stays as it was.
    psql(["-c", bind(
        "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted, created_at,"
        " updated_at) VALUES ('sale-whole', :hub_id, '20260824-0008', 'completed', 500, 0, :now, :now)",
        {"hub_id": HUB, "now": NOW},
    )], db=DB)
    ok, err = run_command("sales._insert_payment", {
        "payment_id": "pay-whole", "sale_id": "sale-whole", "sort_order": 0,
        "payment_method_id": "pm-cash", "payment_method_name": "Efectivo",
        "payment_method_type": "cash", "amount": 500, "amount_tendered": 500,
        "change_due": 0, "reference": "",
    })
    check("seed leg `pay-whole`", (ok, err), (True, ""))
    ok, err = run_command("sales._insert_refund", {
        "refund_id": "ref-whole", "sale_id": "sale-whole", "total": 500,
        "reason": "whole", "note": "", "idempotency_key": "idem-whole",
    })
    check("the whole refund's head", (ok, err), (True, ""))
    ok, err = run_command("sales._insert_refund_payment", {
        "refund_payment_id": "ref-leg-whole", "refund_id": "ref-whole", "sale_id": "sale-whole",
        "payment_id": "pay-whole", "payment_method_id": "pm-cash",
        "payment_method_name": "Efectivo", "payment_method_type": "cash",
        "amount": 500, "sort_order": 0,
    })
    check("the whole refund's leg", (ok, err), (True, ""))
    ok, err = run_command("sales._mark_refunded", {"sale_id": "sale-whole"})
    check("`sales._mark_refunded` on the last cent", (ok, err), (True, ""))
    check("y deja la venta en `refunded`", q(
        f"SELECT status FROM sales_sale WHERE id='sale-whole' AND hub_id='{HUB}'"), "refunded")

    # sales#506: the doors re-check when they WRITE, not only the handler's read before the
    # transaction. No refund head on a sale that is no longer `completed`…
    run_command("sales._insert_refund", {
        "refund_id": "ref-late", "sale_id": "sale-whole", "total": 1,
        "reason": "late", "note": "", "idempotency_key": "idem-late",
    })
    check("no refund head on a sale already refunded", qi(
        "SELECT COUNT(*) FROM sales_sale_refund WHERE id='ref-late'"), 0)
    # …and no leg over what is left on it, counted over the legs already written.
    run_command("sales._insert_refund_payment", {
        "refund_payment_id": "ref-leg-over", "refund_id": "ref-1", "sale_id": SALE,
        "payment_id": "pay-cash", "payment_method_id": "pm-cash",
        "payment_method_name": "Efectivo", "payment_method_type": "cash",
        "amount": 1, "sort_order": 1,
    })
    check("no leg over what is left (pay-cash: 20,00 € charged, 20,00 € back)", qi(
        "SELECT COUNT(*) FROM sales_sale_refund_payment WHERE id='ref-leg-over'"), 0)

    # Y solo desde `completed`. Dos devoluciones concurrentes llegan las dos a esta línea: la
    # segunda tiene que actualizar CERO filas, no reescribir un estado que ya cambió. Se prueba
    # sobre una venta anulada, que es el mismo filtro visto desde el otro lado.
    psql(["-c", bind(
        "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted, created_at,"
        " updated_at) VALUES ('sale-anulada', :hub_id, '20260824-0009', 'voided', 500, 0, :now, :now)",
        {"hub_id": HUB, "now": NOW},
    )], db=DB)
    run_command("sales._mark_refunded", {"sale_id": "sale-anulada"})
    check("una venta que no está `completed` no se reescribe", q(
        f"SELECT status FROM sales_sale WHERE id='sale-anulada' AND hub_id='{HUB}'"), "voided")


# ── 3 · el tope y la elegibilidad — el corazón de la issue ───────────────────────────────


def test_the_cap_is_what_is_left_not_what_was_charged() -> None:
    print("\n3 · `sales.refund_options`: lo cobrado − lo ya devuelto, al céntimo")
    rows = options()
    check("una fila POR PATA, siempre", sorted(rows), ["pay-card", "pay-cash"])

    card, cash = rows["pay-card"], rows["pay-cash"]
    check("la tarjeta cobró 50,00 €", card["charged"], 5000)
    check("y no se le ha devuelto nada", card["refunded"], 0)
    check("así que su tope son los 50,00 €", card["remaining"], 5000)
    check("y es elegible", (card["refundable"], card["reason"]), (1, ""))

    # El efectivo ya devolvió sus 20,00 € en el test anterior: tope cero y motivo propio.
    check("el efectivo ya se devolvió entero", cash["refunded"], 2000)
    check("su tope es cero", cash["remaining"], 0)
    check("no elegible, con su motivo", (cash["refundable"], cash["reason"]),
          (0, "already_refunded"))

    # 🔴 Una devolución PARCIAL sobre la tarjeta: el tope baja, no se queda en lo cobrado.
    ok, err = refund("ref-2", [("ref-leg-2", "pay-card", 1500)], idem="idem-0002")
    check("segunda devolución, parcial", (ok, err), (True, ""))
    card = options()["pay-card"]
    check("lo devuelto se acumula", card["refunded"], 1500)
    check("y el tope es lo que QUEDA, no lo cobrado", card["remaining"], 3500)
    check("sigue elegible mientras quede algo", card["refundable"], 1)

    # Una devolución BORRADA no cuenta: el soft-delete existe para poder corregir, y si el tope
    # siguiera contándola el dinero quedaría atrapado para siempre.
    psql(["-c", f"UPDATE sales_sale_refund_payment SET is_deleted=1 WHERE refund_id='ref-2'"], db=DB)
    check("una devolución anulada libera su tope", options()["pay-card"]["remaining"], 5000)


def test_a_dead_payment_method_is_not_eligible_but_the_money_is_still_refundable() -> None:
    print("\n4 · el caso de Square: el método murió, el dinero NO")
    # La tarjeta con la que se cobró se desactiva (o se borra) del catálogo del hub.
    psql(["-c", f"UPDATE sales_payment_method SET is_active=0 WHERE id='pm-card' AND hub_id='{HUB}'"],
         db=DB)
    card = options()["pay-card"]
    check("no elegible por su propia puerta", card["refundable"], 0)
    check("y el motivo lo dice", card["reason"], "method_unavailable")
    # 🔴 Y esto es lo que Square NO hace: el tope sigue siendo dinero devolvible, solo que por otra
    # puerta. Si `remaining` cayera a 0 aquí, el dinero quedaría encerrado y habríamos implementado
    # el bug con mejores palabras.
    check("pero el dinero SIGUE siendo devolvible", card["remaining"], 5000)

    # Un método BORRADO se comporta igual que uno desactivado: la pata guarda su nombre histórico.
    psql(["-c", f"UPDATE sales_payment_method SET is_deleted=1 WHERE id='pm-card' AND hub_id='{HUB}'"],
         db=DB)
    card = options()["pay-card"]
    check("borrado = igual de no elegible", (card["refundable"], card["reason"]),
          (0, "method_unavailable"))
    check("y el histórico conserva el nombre con el que se cobró", card["payment_method_name"],
          "Tarjeta")
    psql(["-c", "UPDATE sales_payment_method SET is_active=1, is_deleted=0 WHERE id='pm-card'"],
         db=DB)


# ── 5 · tenancy, con el vecino VIVO ──────────────────────────────────────────────────────


def test_a_neighbour_hub_never_shows_up() -> None:
    print("\n5 · el hub vecino no mueve nuestro tope, ni siquiera citando NUESTRA pata")
    # El vecino tiene su propia venta y sus propias patas (id de venta y de metodo son clave
    # primaria: en produccion cada hub tiene su BD, ADR-0201). Lo que SI puede compartir —y es
    # justo el agujero que hay que cerrar— es el `payment_id` y el `sale_id` que denormaliza
    # `sales_sale_refund_payment`, que no son clave de nada.
    seed_methods(OTHER_HUB, suffix="-v")
    psql(["-c", bind(
        "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted, created_at,"
        " updated_at) VALUES (:id, :hub_id, '20260824-0001', 'completed', 7000, 0, :now, :now)",
        {"id": OTHER_SALE, "hub_id": OTHER_HUB, "now": NOW},
    )], db=DB)
    seed_legs(OTHER_SALE, OTHER_HUB, prefix="pay-v", suffix="-v")

    ok, err = run_command("sales._insert_refund", {
        "refund_id": "ref-vecino", "sale_id": OTHER_SALE, "total": 2000,
        "reason": "lo suyo", "note": "", "idempotency_key": "idem-vecino",
    }, hub=OTHER_HUB)
    check("el vecino devuelve lo suyo", (ok, err), (True, ""))

    # 🔴 THE ADVERSARIAL ROW: the neighbour's refund points at OUR `sale_id` and OUR leg. It is
    # what a tenancy bug does before anyone calls it that. If the cap's subquery did not filter by
    # `hub_id`, these 20,00 € would come off our card.
    #
    # sales#506: the leg door itself no longer writes it — it only takes a leg of a charge of ITS
    # hub — so the refusal is asserted first and the row is planted by hand for the read below.
    ok, err = run_command("sales._insert_refund_payment", {
        "refund_payment_id": "ref-leg-vecino", "refund_id": "ref-vecino", "sale_id": SALE,
        "payment_id": "pay-card", "payment_method_id": "pm-cash-v",
        "payment_method_name": "Efectivo", "payment_method_type": "cash",
        "amount": 2000, "sort_order": 0,
    }, hub=OTHER_HUB)
    check("the neighbour's leg door writes nothing on our leg", qi(
        "SELECT COUNT(*) FROM sales_sale_refund_payment WHERE id='ref-leg-vecino'"), 0)
    psql(["-c", bind(
        "INSERT INTO sales_sale_refund_payment (id, hub_id, refund_id, sale_id, payment_id,"
        " payment_method_id, payment_method_name, payment_method_type, amount, sort_order,"
        " is_deleted, created_at, updated_at) VALUES ('ref-leg-vecino', :hub_id, 'ref-vecino',"
        " :sale_id, 'pay-card', 'pm-cash-v', 'Efectivo', 'cash', 2000, 0, 0, :now, :now)",
        {"hub_id": OTHER_HUB, "sale_id": SALE, "now": NOW},
    )], db=DB)

    # Control positivo: el vecino existe y tiene datos. Sin esto, este test pasaría con el scope
    # roto, porque «no hay nada del vecino» sería literalmente cierto.
    check("control positivo: la fila del vecino ESTÁ escrita", qi(
        "SELECT COUNT(*) FROM sales_sale_refund_payment"
        f" WHERE hub_id='{OTHER_HUB}' AND sale_id='{SALE}' AND payment_id='pay-card'"), 1)

    ours = options()
    check("nuestro tope no lo mueve el vecino", ours["pay-card"]["remaining"], 5000)
    check("ni su elegibilidad", ours["pay-card"]["refundable"], 1)
    check("y lo nuestro sigue contando", ours["pay-cash"]["refunded"], 2000)

    theirs = options(hub=OTHER_HUB, sale_id=OTHER_SALE)
    check("y el vecino ve SOLO sus patas", sorted(theirs), ["pay-v-card", "pay-v-cash"])


# ── 6 · idempotencia: `refund_ref` es ESTABLE ────────────────────────────────────────────


def test_the_same_key_can_never_write_a_second_refund() -> None:
    print("\n6 · la misma clave no escribe una segunda devolución")
    found = run_query("sales.refund_by_idempotency_key", {"idempotency_key": "idem-0001"})
    check("la sonda encuentra el documento ya escrito", [r["id"] for r in found], ["ref-1"])
    check("y responde con su total, que es lo que el reintento devuelve", found[0]["total"], 2000)

    # La sonda resuelve el reintento normal; el índice único es la autoridad FINAL, para dos
    # peticiones simultáneas que ambas leen «no existe».
    ok, err = refund("ref-otro-id", [("ref-leg-x", "pay-card", 100)], idem="idem-0001")
    check("el índice único refuse la segunda", ok, False)
    check("y lo dice por duplicado, no por otra cosa", "uq_sales_refund_idempotency" in err, True)

    # La clave vacía es el histórico: nunca casa y nunca colisiona consigo misma.
    ok1, _ = refund("ref-sin-clave-1", [("ref-leg-y", "pay-card", 100)], idem="")
    ok2, _ = refund("ref-sin-clave-2", [("ref-leg-z", "pay-card", 100)], idem="")
    check("dos documentos sin clave conviven", (ok1, ok2), (True, True))
    check("y la sonda no los confunde con nada", run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": ""}), [])


# ── 6b · sales#456: la sonda de la pantalla, con el vecino VIVO ─────────────────────────
#
# Tras un «no sabemos si se registró», la pantalla de devolución pregunta ella sola por la clave del
# intento, y al reabrirla pregunta por la clave que quedó pendiente. Lo que conteste la sonda decide
# si la pantalla da la devolución por hecha o deja repetirla — así que una respuesta que se cuele de
# otro hub diría «ya consta» sobre un dinero que aquí NO ha salido, o al revés.


def test_the_probe_answers_only_for_this_hub() -> None:
    print("\n6b · la sonda por clave contesta SOLO lo de este hub (sales#456)")
    # La misma clave en los dos hubs: el índice único es por (hub_id, clave), así que es legítimo.
    ok, err = run_command("sales._insert_refund", {
        "refund_id": "ref-vecino-comp", "sale_id": OTHER_SALE, "total": 700,
        "reason": "lo suyo", "note": "", "idempotency_key": "idem-compartida",
    }, hub=OTHER_HUB)
    check("el vecino escribe con la clave compartida", (ok, err), (True, ""))

    # Control positivo: la sonda SÍ ve la fila cuando se la pide su hub.
    check("control positivo: el vecino encuentra lo suyo", [r["id"] for r in run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-compartida"},
        hub=OTHER_HUB)], ["ref-vecino-comp"])
    check("y su clave de antes también", [r["id"] for r in run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-vecino"},
        hub=OTHER_HUB)], ["ref-vecino"])

    # 🔴 Nuestro hub pregunta por las claves del vecino: «no consta», jamás su documento.
    check("la clave del vecino no nos contesta con su devolución", run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-vecino"}), [])
    check("ni la compartida mientras aquí no se haya escrito", run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-compartida"}), [])

    # Nuestro intento con la MISMA clave entra, y cada hub ve el suyo.
    ok, err = refund("ref-comp", [("ref-leg-comp", "pay-cash", 100)], idem="idem-compartida")
    check("nuestro documento con la clave compartida entra", (ok, err), (True, ""))
    check("y la sonda contesta el NUESTRO", [r["id"] for r in run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-compartida"})], ["ref-comp"])
    check("y el vecino sigue viendo el SUYO", [r["id"] for r in run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-compartida"},
        hub=OTHER_HUB)], ["ref-vecino-comp"])


def test_a_partial_refund_retried_under_its_key_is_found_not_rewritten() -> None:
    print("\n6c · una devolución PARCIAL en duda: la sonda la encuentra y la clave no admite otra")
    # El caso de la revisión de sales#457: se devuelve UNA PARTE, se pierde la respuesta, se cierra
    # y se reabre. La pantalla reabierta usa la clave pendiente; esto es lo que el hub le contesta.
    ok, err = refund("ref-parcial", [("ref-leg-parcial", "pay-card", 300)], idem="idem-parcial")
    check("la parte se escribe", (ok, err), (True, ""))
    found = run_query("sales.refund_by_idempotency_key", {"idempotency_key": "idem-parcial"})
    check("la sonda la encuentra: la pantalla dice «sí se registró»",
          [r["id"] for r in found], ["ref-parcial"])
    check("con el importe de la parte, no el de la venta", found[0]["total"] if found else None, 300)
    card_before = options()["pay-card"]["remaining"]
    # La misma parte otra vez con la misma clave: el índice la rechaza y el tope no se mueve.
    ok, err = refund("ref-parcial-2", [("ref-leg-parcial-2", "pay-card", 300)], idem="idem-parcial")
    check("la misma parte con la misma clave NO se escribe dos veces", ok, False)
    check("por la clave duplicada", "uq_sales_refund_idempotency" in err, True)
    check("y lo que queda por devolver en tarjeta no baja otra vez",
          options()["pay-card"]["remaining"], card_before)

    # Una devolución borrada (contrato de fila) no cuenta como «ya consta».
    psql(["-c", f"UPDATE sales_sale_refund SET is_deleted = 1 WHERE hub_id = '{HUB}'"
                " AND id = 'ref-parcial'"], db=DB)
    check("una fila borrada no contesta a la sonda", run_query(
        "sales.refund_by_idempotency_key", {"idempotency_key": "idem-parcial"}), [])
    psql(["-c", f"UPDATE sales_sale_refund SET is_deleted = 0 WHERE hub_id = '{HUB}'"
                " AND id = 'ref-parcial'"], db=DB)


# ── 7 · el histórico se puede contar ─────────────────────────────────────────────────────


def test_the_refunds_of_a_sale_come_back_out() -> None:
    print("\n7 · `sales.refunds` cuenta lo devuelto de una venta")
    rows = run_query("sales.refunds", {"sale_id": SALE})
    ids = [r["id"] for r in rows]
    check("salen las devoluciones de ESTE hub", "ref-1" in ids, True)
    check("y no la del vecino", "ref-vecino" in ids, False)
    row = next(r for r in rows if r["id"] == "ref-1")
    check("con su total", row["total"], 2000)
    check("y su motivo", row["reason"], "el cliente devuelve el producto")


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
        test_the_tables_carry_the_hub_row_contract()
        test_the_commands_run_the_way_the_runtime_runs_them()
        test_the_cap_is_what_is_left_not_what_was_charged()
        test_a_dead_payment_method_is_not_eligible_but_the_money_is_still_refundable()
        test_a_neighbour_hub_never_shows_up()
        test_the_same_key_can_never_write_a_second_refund()
        test_the_probe_answers_only_for_this_hub()
        test_a_partial_refund_retried_under_its_key_is_found_not_rewritten()
        test_the_refunds_of_a_sale_come_back_out()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — devolver por tender elegible: el tope es lo que queda, el método muerto no"
          " encierra el dinero, y la referencia es estable (sales#160)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
