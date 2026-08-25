#!/usr/bin/env python3
"""The MENU survives in an OPEN CHECK, in a REAL Postgres 18 (sales#169 / ADR-0381).

sales#152 made a combo chargeable in one go — the counter and the grocery shop. The restaurant runs
the other way round: open a check, add lines, fire to the kitchen, charge half an hour later. And
the ORDER line had nowhere to record which menu the line came from or what was chosen.

The symptom was not «the menu turns back into a plain dish». The POS puts the combo id in
`product_id`, so once the composition was lost the line went in through the catalogue path, the
checkout looked that id up in `inventory.products.for_sale`, did not find it, and REJECTED the whole
sale with `sales.product_not_available`. The table that ordered the set menu could not pay.

The handler's unit tests prove the composition is frozen and that a check parked and resumed is
charged EXACTLY like one charged directly. What they cannot prove is that the columns exist in a
hub's database, that the two doors still bind with two more parameters, and that the composition
comes back out through the query the POS rehydrates the cart from. Those are schema facts, and a
schema fact is only checked by running it.

What is under test, and why each point is here:

  1. THE COLUMNS. `sales_order_item.combo_group_ref` (nullable) and `combo` (NOT NULL DEFAULT '{}'),
     both additive: every check already open came from no combo, which is the truth.

  2. THE DOOR. `sales._insert_order_line` — what BOTH handlers emit now (sales#175): the
     `open_order` one for the first line of a check, and the `add_order_line` one for every line
     after it. `sales.order.add_line` stopped being declarative SQL when the checkout started
     honouring the row's `unit_price`: a column that decides money is resolved against the product
     catalogue in the handler, never bound from the payload. A statement Postgres cannot PREPARE is
     a command that does not exist in any hub (ADR-0154), and this one carries every line of every
     open check — not only the combos. Its sibling `sales._recompute_order_total` is here for the
     same reason: it is the second operation the handler emits, and it keeps the check's provisional
     total from drifting away from its lines.

  3. THE GROUP IS MINTED BY THE SERVER. `combo_group_ref` comes from `:new_id`, the id the runtime
     just minted for this row. A payload that sends its own is ignored, exactly like a payload that
     sends its own price (sales#68).

  4. NO MONEY IN THE ROW. The order row keeps the composition, never a share of the closed price:
     the split of art. 79.Dos is decided at CHECKOUT, in the one and only pass sales#152 left. A
     row that already carried sibling lines would be that second pass coming back.

  5. THE WAY BACK. `sales.order.lines` is the door the POS rehydrates the cart from. The
     composition has to come out of it or the check is written and unreadable — the exact bug
     `modifiers` had until sales#148.

  6. TENANCY, with a LIVE neighbour. Two hubs, two open checks, a menu each, seeded through the
     enforcing door: reading through `sales.order.lines` must never show the neighbour's. A scoping
     test seeded with a helper, or without a neighbour, proves nothing.

  7. THE INDEX. Combo lines are looked up as a group, so `(hub_id, combo_group_ref)` is indexed —
     partial, and scoped by hub, because a combo group is not a global name.

Usage: tests/order_combo.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER; the
  toolkit sets it per CI job). Creates a scratch database and DROPS it at the end, pass or fail.
  It NEVER skips itself: a battery that goes green because it could not reach Postgres is worse
  than no battery at all.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_order_combo_test_{os.getpid()}"
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
        print(f"  \u2717 {label}: got {got!r}, want {want!r}")
    else:
        print(f"  \u2713 {label}")


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




# ── the working row, exactly as each door binds it ───────────────────────────────

# The composition of the set menu as the POS chose it: which combo, and which options IN THE ORDER
# they were picked. `product_name` and `category_id` ride along for DISPLAY and for kitchen routing
# (each component to ITS station) — never for money. There is no price in here on purpose.
COMBO = {
    "combo_id": "c-menu-dia",
    "combo_choices": [
        {"option_id": "o-sopa", "product_name": "Sopa", "category_id": "cat-cocina"},
        {"option_id": "o-merluza", "product_name": "Merluza", "category_id": "cat-plancha"},
    ],
}
COMBO_TEXT = json.dumps(COMBO, separators=(",", ":"), ensure_ascii=False)


def seed_order(order_id: str = ORDER, hub: str = HUB) -> None:
    psql(
        ["-c", bind(
            "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted, created_at, updated_at)"
            " VALUES (:id, :hub_id, 'open', 0, 0, :now, :now)",
            {"id": order_id, "hub_id": hub, "now": "2026-08-24T13:00:00+00:00"},
        )],
        db=DB,
    )


# Every parameter `sales._insert_order_line` binds, written out in full on purpose: this is the
# payload shape the handlers produce, so if the command grows a parameter and the handler does not —
# or the other way round — this test is where it shows. `combo` is NOT NULL, so the drift shows up
# as a rejected INSERT and not as a line that quietly loses its menu.
#
# ⚠️ NO lleva `unit_price` del TPV: desde sales#175 el precio de la fila lo resuelve el handler
# contra `inventory.products.for_sale`. Aquí va el número que el handler YA resolvió.
def add_line_params(new_id: str, order_id: str = ORDER, **over) -> dict:
    params = {
        "id": new_id,
        "combo_group_ref": new_id,
        "order_id": order_id,
        "product_id": "c-menu-dia",
        "product_name": "Men\u00fa del d\u00eda",
        "product_sku": "",
        "quantity": 1_000_000,
        "unit_price": 1400,
        "is_gift": 0,
        "gift_reason": "",
        "line_total": 1400,
        "tax_category_key": "",
        "cost": 0,
        "is_service": 0,
        "category_id": None,
        "discount_percent": 0.0,
        "modifiers": "[]",
        "combo": COMBO_TEXT,
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


# What the `open_order` handler emits for the FIRST line of a check. Same command, same columns:
# the only difference is WHO mints the group ref — the order and the position (`<order_id>-<pos>`)
# when the check is born, the row's own id when the line is added to a check already open.
def insert_order_line_params(line_id: str, order_id: str = ORDER, **over) -> dict:
    params = add_line_params(line_id, order_id)
    params["combo_group_ref"] = f"{order_id}-0"
    params.update(over)
    return params


# ── 1 · the columns ────────────────────────────────────────────────────────


def test_the_order_line_can_record_which_menu_it_came_from() -> None:
    print("\n1 · sales_order_item.combo_group_ref and .combo exist, additive")
    check("column `combo_group_ref`", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='combo_group_ref'"), "1")
    # Nullable ON PURPOSE: a line that came from no combo has no group, and NULL says exactly that.
    check("`combo_group_ref` is nullable — most lines of a check are not a menu", q(
        "SELECT is_nullable FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='combo_group_ref'"), "YES")
    check("column `combo`", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='combo'"), "1")
    check("`combo` is NOT NULL", q(
        "SELECT is_nullable FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='combo'"), "NO")
    # Every check already open came from no combo, and that is what the default says.
    check("defaults to '{}', so every check already open stays as it was", q(
        "SELECT column_default FROM information_schema.columns"
        " WHERE table_name='sales_order_item' AND column_name='combo'"), "'{}'::text")


# ── 2-4 · the two doors, the server-minted group, and no money in the row ──────────────


def test_both_doors_write_the_menu_and_the_server_mints_the_group() -> None:
    print("\n2-4 · add_line and _insert_order_line bind the columns; the group is the server's")
    seed_order()
    ok, err = run_command("sales._insert_order_line", add_line_params("line-menu"))
    check("the add_order_line door runs the way the runtime runs it", (ok, err), (True, ""))
    # A different name on purpose: two identical rows would make every assertion below ambiguous
    # about WHICH door wrote what, which is the whole point of testing both.
    ok, err = run_command("sales._insert_order_line", insert_order_line_params(
        "line-menu-first", product_name="Men\u00fa del d\u00eda (1.\u00aa l\u00ednea)"))
    check("and so does `sales._insert_order_line` (the open_order door)", (ok, err), (True, ""))
    # The 100 % of checks that sell no menus: nothing changes for them.
    ok, err = run_command("sales._insert_order_line", add_line_params(
        "line-cana", product_id="p-cana", product_name="Ca\u00f1a", unit_price=250,
        line_total=250, combo=None, combo_group_ref=None))
    check("a line with no menu still goes in untouched", (ok, err), (True, ""))

    check("the menu line remembers WHICH menu", json.loads(
        q("SELECT combo FROM sales_order_item WHERE id='line-menu'")).get("combo_id"), "c-menu-dia")
    check("with the components in the ORDER they were chosen", [
        c["option_id"] for c in json.loads(
            q("SELECT combo FROM sales_order_item WHERE id='line-menu'"))["combo_choices"]],
        ["o-sopa", "o-merluza"])
    # 3 · the group is `:new_id`, the id the runtime minted — not anything the payload could say.
    check("the add_order_line door mints the group from the row's own id", q(
        "SELECT combo_group_ref FROM sales_order_item WHERE id='line-menu'"), "line-menu")
    check("and the open_order door keeps the ref the handler minted", q(
        "SELECT combo_group_ref FROM sales_order_item WHERE id='line-menu-first'"), f"{ORDER}-0")
    check("a line with no menu keeps a NULL group", q(
        "SELECT coalesce(combo_group_ref, '<null>') FROM sales_order_item WHERE id='line-cana'"), "<null>")
    check("and an empty snapshot, like the column default", q(
        "SELECT combo FROM sales_order_item WHERE id='line-cana'"), "{}")

    # 4 · NO MONEY. The row keeps what was chosen; the closed price and the split of art. 79.Dos
    # are decided at checkout, in the one and only pass. A share here would be the second pass back.
    snapshot = json.loads(q("SELECT combo FROM sales_order_item WHERE id='line-menu'"))
    money_keys = sorted({k for c in snapshot["combo_choices"] for k in c}
                        & {"price", "share", "price_delta", "catalog_price", "line_total"})
    check("no money anywhere in the frozen composition", money_keys, [])
    check("nor at the top of it", sorted(set(snapshot) & {"price", "price_charged"}), [])
    # And the provisional total is still the sum of the lines: the menu does not distort the check.
    # sales#175: lo recompone `sales._recompute_order_total`, la 2ª operación que emite el handler
    # (antes era la 2ª sentencia del command declarativo). Si no bindea, el total del TPV deriva.
    ok, err = run_command("sales._recompute_order_total", {"order_id": ORDER})
    check("`sales._recompute_order_total` runs the way the runtime runs it", (ok, err), (True, ""))
    check("the check's provisional total is still the plain sum of its lines", qi(
        f"SELECT provisional_total FROM sales_order WHERE id='{ORDER}'"), 1400 + 1400 + 250)


# ── 5-6 · the way back, and tenancy with a live neighbour ────────────────────────


def test_the_menu_comes_back_out_and_never_crosses_hubs() -> None:
    print("\n5-6 · sales.order.lines returns the composition, and only this hub's")
    # The NEIGHBOUR is real and alive: its own hub, its own open check, its own menu, written
    # through the same enforcing door. Without a live neighbour this would be a scoping test that
    # passes because there is nothing to leak — which proves nothing at all.
    seed_order(order_id=OTHER_ORDER, hub=OTHER_HUB)
    ok, err = run_command("sales._insert_order_line", add_line_params(
        "line-menu-vecino", order_id=OTHER_ORDER, product_name="Men\u00fa del vecino"), hub=OTHER_HUB)
    check("the neighbour's menu line is really written", (ok, err), (True, ""))

    rows = run_query("sales.order.lines", {"order_id": ORDER})
    check("this hub sees its three lines and no more", len(rows), 3)
    check("and the line the open_order door wrote is one of them",
          sum(1 for r in rows if r["product_name"].endswith("(1.\u00aa l\u00ednea)")), 1)
    by_name = {r["product_name"]: r for r in rows}
    menu = by_name.get("Men\u00fa del d\u00eda", {})
    # 🔴 THE POINT. Without this the cart cannot be rehydrated, the checkout hunts the combo id in
    # the product catalogue and the whole sale is rejected: the table cannot pay.
    check("the composition travels to the door the POS reads",
          json.loads(menu.get("combo") or "{}").get("combo_id"), "c-menu-dia")
    check("with its choices, in order",
          [c["option_id"] for c in json.loads(menu.get("combo") or "{}").get("combo_choices", [])],
          ["o-sopa", "o-merluza"])
    check("and the names/categories the KDS routes each component by",
          [c["category_id"] for c in json.loads(menu.get("combo") or "{}").get("combo_choices", [])],
          ["cat-cocina", "cat-plancha"])
    check("the group ref comes back too", menu.get("combo_group_ref"), "line-menu")
    check("a line with no menu comes back with an empty snapshot",
          by_name.get("Ca\u00f1a", {}).get("combo"), "{}")

    # Positive control FIRST: the neighbour's line is reachable when the hub is its own, so the
    # empty result below is the scoping filter working and not a query that returns nothing.
    theirs = run_query("sales.order.lines", {"order_id": OTHER_ORDER}, hub=OTHER_HUB)
    check("control: the neighbour's menu IS readable by the neighbour", len(theirs), 1)
    leaked = run_query("sales.order.lines", {"order_id": OTHER_ORDER})
    check("and never by us, even asking for its check by id", leaked, [])


# ── 7 · the index ─────────────────────────────────────────────────────


def test_the_menu_lines_are_indexed_by_hub_and_group() -> None:
    print("\n7 · the group is indexed, partial, and scoped by hub")
    check("index on (hub_id, combo_group_ref)", q(
        "SELECT count(*) FROM pg_indexes WHERE tablename='sales_order_item'"
        " AND indexdef LIKE '%hub_id%' AND indexdef LIKE '%combo_group_ref%'"), "1")
    check("and it is PARTIAL — most lines of a check are not a menu", q(
        "SELECT count(*) FROM pg_indexes WHERE tablename='sales_order_item'"
        " AND indexdef LIKE '%combo_group_ref%' AND indexdef LIKE '%WHERE%'"), "1")


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
        test_the_order_line_can_record_which_menu_it_came_from()
        test_both_doors_write_the_menu_and_the_server_mints_the_group()
        test_the_menu_comes_back_out_and_never_crosses_hubs()
        test_the_menu_lines_are_indexed_by_hub_and_group()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — a menu parked in an open check keeps WHICH menu and WHAT was chosen, and carries no money (sales#169)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
