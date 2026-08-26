#!/usr/bin/env python3
"""The price an OPEN CHECK was opened at survives, in a REAL Postgres 18 (sales#175).

Decided by the market (8 references + forums, on the issue and in its ADR): an open check is
charged at the price it had **when it was ordered**, not at the catalogue's when it is paid. Square
snapshots the order when it is created, Simphony excludes "menu items from a previous service round"
from a price change, Odoo does not recompute the lines of an order already created, and Lightspeed
demands a permission to re-price one by hand. Shopify tried the opposite in January 2025 and ended
up shipping its `price lock`.

That turns `sales_order_item.unit_price` into a column that **decides money**. Until sales#175 it
was a display preview: the checkout re-priced against `inventory.products.for_sale` and whatever sat
in there did not matter. Not any more. The handler tests prove the arithmetic — change the catalogue
and charge the same — because the catalogue is a read from ANOTHER module, not a table of `sales`'
own schema. What they cannot prove is what only a real database decides, which is what lives here:

  1. THE COLUMN THAT DECIDES. `unit_price` is an integer (minor units, ADR-0007/0123) and NOT NULL:
     a NULL slipping in there would be a check that cannot be charged.

  2. NOBODY REWRITES IT. No statement of the module does `UPDATE ... SET unit_price`. This is the
     guard that holds up the whole decision: the day someone adds a "refresh the order's prices",
     the freeze breaks **in silence** and no handler test notices.

  3. THE THREE FROZEN NUMBERS COME BACK. `sales.order.lines` — the door the checkout reads them
     through — returns `unit_price`, `cost` and `tax_category_key`. If one stops travelling, the
     checkout does not re-price: it REFUSES the sale, and the table cannot pay.

  4. A LINE ALREADY PAID DOES NOT COME BACK. The query filters `sale_id IS NULL`. With the price
     frozen that stops being a screen convenience: it is what makes charging the same line twice a
     refusal (`sales.order_line_not_available`) instead of a repeated charge.

  5. THE SUPPLEMENT IS FROZEN TOO (sales#200). `sales_order_item.modifiers` stopped being "ids
     without money": it carries each supplement's delta and its printed name, resolved by the
     server when the line was ordered. Two facts only a database gives: the snapshot ROUND-TRIPS
     through the TEXT column and comes back through `sales.order.lines` — if that column stopped
     travelling the checkout would charge the check without its supplements, in silence — and no
     statement of the module rewrites it, which is the same silent break as re-pricing.

  6. TENANCY, with a LIVE NEIGHBOUR. Two hubs, two open checks, a frozen price each, seeded through
     the door that enforces the isolation: the neighbour's price cannot show up. A scoping test with
     no neighbour, or seeded with a helper, proves nothing.

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
CHEESE_ORDER = "ord-table-7"

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

# Every parameter `sales._insert_order_line` binds, written out in full on purpose: this is the
# payload shape BOTH handlers produce (`open_order` and `add_order_line`), so if the command grows a
# parameter and the handler does not — or the other way round — this is where it shows.
#
# ⚠️ The `unit_price` here is NOT the till's: since sales#175 the row's price is resolved by the
# handler against `inventory.products.for_sale`. What travels here is the number it ALREADY
# resolved, which is exactly how it arrives in production.
def line_params(line_id: str, unit_price: int, order_id: str = ORDER, **over) -> dict:
    params = {
        "id": line_id,
        "order_id": order_id,
        "product_id": "p-burger",
        "product_name": "Hamburguesa",
        "product_sku": "",
        "quantity": 1_000_000,
        # 🔴 The number that decides the money.
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
    # ADR-0007/0123: money is ALWAYS an integer in minor units. A float here is a cent lost per
    # check and a cash-up that does not add up at the end of the day.
    check("and it is an integer, not a float (ADR-0007/0123)", q(
        "SELECT data_type FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='unit_price'"), "bigint")
    check("and NOT NULL — a check with a null price cannot be charged", q(
        "SELECT is_nullable FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='unit_price'"), "NO")
    # The other two numbers the checkout honours since sales#175, which are not re-derived either.
    check("`cost` travels with the line (gift cash-up)", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='cost'"), "1")
    check("`tax_category_key` too (VAT authority, ADR-0085)", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='tax_category_key'"), "1")


# ── 2 · nothing rewrites it ──────────────────────────────────────────────────────────────


def test_no_statement_of_the_module_rewrites_the_frozen_price() -> None:
    print("\n2 · no statement of the module rewrites `unit_price`")
    # The guard that holds up the whole decision. A "refresh the order's prices" added tomorrow
    # would break the freeze IN SILENCE: the handler would stay green and the table would pay
    # something else.
    setter = re.compile(r"\bset\b[^;]*?\bunit_price\s*=", re.IGNORECASE | re.DOTALL)
    offenders = []
    for sql_file in sorted((MODULE_DIR / "commands").glob("*.sql")):
        body = strip_comments(sql_file.read_text())
        if "update" not in body.lower():
            continue
        if setter.search(body):
            offenders.append(sql_file.name)
    check("no UPDATE ... SET unit_price anywhere in `commands/`", offenders, [])
    # And no migration touches it in a backfill either: that would re-price checks already open.
    mig_offenders = [
        m.name
        for m in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql"))
        if setter.search(strip_comments(m.read_text()))
    ]
    check("nor a migration that rewrites it", mig_offenders, [])


# ── 3-4 · the frozen numbers come back, and a paid line does not ─────────────────────────


def test_the_frozen_numbers_come_back_and_a_paid_line_does_not() -> None:
    print("\n3-4 · `sales.order.lines` returns what was frozen, and not what was already paid")
    seed_order()
    ok, err = run_command("sales._insert_order_line", line_params("line-1", 900))
    check("the line goes in through the door both handlers use", (ok, err), (True, ""))
    ok, err = run_command("sales._insert_order_line", line_params(
        "line-2", 250, product_id="p-cana", product_name="Caña"))
    check("and so does the second one", (ok, err), (True, ""))
    ok, err = run_command("sales._recompute_order_total", {"order_id": ORDER})
    check("the provisional total is recomposed by its own command", (ok, err), (True, ""))
    check("and it is the sum of the live lines", qi(
        f"SELECT provisional_total FROM sales_order WHERE id='{ORDER}'"), 1150)

    rows = {r["id"]: r for r in run_query("sales.order.lines", {"order_id": ORDER})}
    check("both lines come back", sorted(rows), ["line-1", "line-2"])
    # 🔴 THE POINT. These three numbers are the ones the checkout HONOURS since sales#175. If one
    # stops travelling, the checkout does not re-price: it refuses the sale and the table cannot pay.
    check("the FROZEN price comes back", rows.get("line-1", {}).get("unit_price"), 900)
    check("the frozen cost comes back", rows.get("line-1", {}).get("cost"), 400)
    check("the frozen tax category comes back",
          rows.get("line-1", {}).get("tax_category_key"), "restaurant.food")
    check("and the row's id, which is how the checkout line names it (`order_item_id`)",
          rows.get("line-1", {}).get("id"), "line-1")

    # 4 · a line ALREADY PAID does not come back. With the price frozen that stops being cosmetic:
    # it is what turns "charging the same line twice" into a refusal, not a repeated charge.
    psql(["-c", f"UPDATE sales_order_item SET sale_id='sale-1' WHERE id='line-2'"], db=DB)
    rows = run_query("sales.order.lines", {"order_id": ORDER})
    check("the line already paid disappears from the check", [r["id"] for r in rows], ["line-1"])


# ── 5 · the supplement is frozen too (sales#200) ─────────────────────────────────────────

# A real snapshot as `order_line_row` writes it: the delta the catalogue said when the waiter took
# the order, and the name that gets printed. Quotes and a non-ASCII name on purpose — it binds to a
# TEXT column, and the round trip is half of what this test is for.
FROZEN_CHEESE = [
    {
        "option_id": "o-queso",
        "group_id": "g-extras",
        "name": "Extra de queso",
        "kitchen_name": "+QUESO",
        "price_delta": 300,
        "tax_category_key": "",
    }
]


def test_the_frozen_supplement_survives_and_nobody_rewrites_it() -> None:
    print("\n5 · the supplement is frozen on the row and comes back whole (sales#200)")
    check("`modifiers` exists on the row", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='modifiers'"), "1")
    # The guard that holds up the decision, the twin of the one on `unit_price`: an "update the
    # line's supplements" added tomorrow would re-price every open check IN SILENCE.
    setter = re.compile(r"\bset\b[^;]*?\bmodifiers\s*=", re.IGNORECASE | re.DOTALL)
    offenders = [
        f.name
        for f in sorted((MODULE_DIR / "commands").glob("*.sql"))
        if "update" in strip_comments(f.read_text()).lower()
        and setter.search(strip_comments(f.read_text()))
    ]
    check("no UPDATE ... SET modifiers anywhere in `commands/`", offenders, [])
    mig_offenders = [
        m.name
        for m in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql"))
        if setter.search(strip_comments(m.read_text()))
    ]
    check("nor a migration that rewrites it", mig_offenders, [])

    # Its own check so the counts of the other blocks do not move.
    seed_order(order_id=CHEESE_ORDER)
    ok, err = run_command("sales._insert_order_line", line_params(
        "line-cheese", 900, order_id=CHEESE_ORDER,
        modifiers=json.dumps(FROZEN_CHEESE, separators=(",", ":"))))
    check("the line with its frozen supplement goes in", (ok, err), (True, ""))
    rows = {r["id"]: r for r in run_query("sales.order.lines", {"order_id": CHEESE_ORDER})}
    raw = rows.get("line-cheese", {}).get("modifiers")
    # 🔴 THE POINT. Without this column the checkout cannot tell "no supplements" from "the column
    # stopped travelling", and a table would pay 3,00 € less on every line that carries one.
    check("the snapshot comes back through `sales.order.lines`", raw is not None, True)
    back = json.loads(raw) if raw else []
    check("with the DELTA the check was opened at", [m.get("price_delta") for m in back], [300])
    check("and the name that gets printed", [m.get("kitchen_name") for m in back], ["+QUESO"])
    check("and it is still a list, not a string of a string", isinstance(back, list), True)


# ── 6 · tenancy, with a live neighbour ───────────────────────────────────────────────────


def test_the_frozen_price_never_crosses_hubs() -> None:
    print("\n6 · the neighbour's frozen price never shows up")
    # The NEIGHBOUR is real and alive: its own hub, its own open check, its own frozen price,
    # written through the SAME door. With no neighbour this test would pass because there is nothing
    # to filter.
    seed_order(order_id=OTHER_ORDER, hub=OTHER_HUB)
    ok, err = run_command("sales._insert_order_line", line_params(
        "line-vecino", 9900, order_id=OTHER_ORDER, product_name="Chuletón del vecino"), hub=OTHER_HUB)
    check("the neighbour's line is really written", (ok, err), (True, ""))

    # Positive control FIRST: if the neighbour could not read its own, the empty result below would
    # prove nothing about the filter — only that the query returns nothing.
    theirs = run_query("sales.order.lines", {"order_id": OTHER_ORDER}, hub=OTHER_HUB)
    check("control: the neighbour DOES read its line", [r["unit_price"] for r in theirs], [9900])
    leaked = run_query("sales.order.lines", {"order_id": OTHER_ORDER})
    check("and we never do, not even asking for its check by id", leaked, [])
    ours = run_query("sales.order.lines", {"order_id": ORDER})
    check("and our check keeps ITS price", [r["unit_price"] for r in ours], [900])


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
        test_the_frozen_supplement_survives_and_nobody_rewrites_it()
        test_the_frozen_price_never_crosses_hubs()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the price and the supplements the check was opened at survive, and nobody"
          " rewrites them (sales#175/#200)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
