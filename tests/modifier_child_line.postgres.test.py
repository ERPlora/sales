#!/usr/bin/env python3
"""The CHILD LINE of a supplement that taxes differently, in a real Postgres (sales#147 / ADR-0376).

`modifiers_option.tax_category_key` means «this supplement taxes differently» — a soft drink at
21 % inside a menu at 10 %. Part 1 of the issue REFUSED that sale, because `sales_sale_item` carries
one `tax_rate` per row and there was nowhere to put the second base. Part 2 gives it a row: the
delta stops folding into the parent's `unit_price` and becomes its own line, linked to its parent by
`parent_line_ref` (migration 031).

The handler's unit tests prove the DECISION — how many rows, at which rate, with which link. What
they cannot prove is the only thing the business cares about: that the schema HOLDS those rows in a
hub's database, that the doors the ticket reads give the link back, and that the check survives
being split and joined with its supplements attached. A database fact is only checked by running it.

🔴 This battery drives SQL only, never `cargo`. The shared gate does not build Rust (the handler
crate depends on the hub's `guest-sdk` by relative path, and a CI runner has no checkout of a
private repo), so a battery that needed it would report SKIPPED on every run — and a battery that
skips itself is as green as one that passes. What is played here is what the handler emits, bound
exactly as the runtime binds it.

Six points:

  1. THE SCHEMA HOLDS THE CHILD. Migration 031 lands the column and its partial index, and the
     parent/child pair of a real checkout is written by `sales._insert_line` with two rates.
  2. AND THE MONEY SQUARES, ROW BY ROW. base + quota = gross on BOTH lines, and the two add up to
     the sale's total. A breakdown that does not square is what the TEAC censures (RG 2233/2022).
  3. THE REPRINT READS THE LINK. `sales.lines` — the door the ticket and every reprint go through —
     gives `parent_line_ref` back. Until sales#148 the supplements were written and unreadable; a
     link nobody can read is the same bug with a new column.
  4. THE CHECK SPLITS WITH ITS SUPPLEMENTS ATTACHED. `sales.order.split` moves the ORDER line, and
     the picks travel inside it: there is no child row in `sales_order_item` to leave behind,
     because the child is materialised when the money is decided. Joining it back (`order.merge`)
     brings it whole.
  5. REOPENING CHANGES NOTHING. A line that goes back to a live check keeps its supplements.
  6. AND THE FOLD IS UNTOUCHED. A supplement with NO category of its own — the 99 % of them — still
     lands as ONE row with the delta inside its unit price. This is the control: if it went red, the
     fix would have broken every ticket with a «+cheese» on it.
  7. NONE OF IT CROSSES HUBS. A neighbour hub sees no row, no link and no supplement.

Usage: tests/modifier_child_line.postgres.test.py
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
DB = f"sales_modifier_child_line_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-cashier"
NOW = "2026-08-26T13:00:00+00:00"
DAY = "20260826"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


# ── Postgres plumbing ────────────────────────────────────────────────────────────────────


def psql(args: list[str], db: str | None = None, stdin: str | None = None) -> str:
    cmd = [
        "docker",
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
    ]
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
DDL_TYPES = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
    "TEXT": "TEXT",
}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)

# The runtime's bridge functions (ADR-0007 §4a): portable SQL names the translator rewrites per
# dialect. `sales._insert_sale` pads the day's counter into the fiscal number with `erp_pad`.
#
# `width` is a MINIMUM, never a ceiling (ERPlora/hub#1393). The bare `lpad` of Postgres imposes an
# EXACT width and CUTS the overflow, so `lpad('10000', 4, '0')` came out `'1000'` and the 10.000th
# sale of the day collided with the 1.000th on `uq_sale_number`: the till stopped charging
# (sales#241). A miniature runtime that keeps the old rendering is a mirror that puts the bug back
# in the one place nobody would look — the tests. Proved in `sale_number_width.postgres.test.py`.
BRIDGE_FUNCTIONS = """
CREATE OR REPLACE FUNCTION erp_pad(value anyelement, width integer) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
        SELECT lpad($1::text, greatest($2, length($1::text)), '0')
    $$;
"""


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
    translator does. A `:param` the payload does not carry binds as NULL, which is what the driver
    does (`DynNull`, hub/crates/db/src/lib.rs)."""

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
        lambda m: (
            m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))
        ),
        sql,
    )


def run_command(name: str, payload: dict, hub: str = HUB) -> tuple[bool, str]:
    """Execute a manifest command's `sql[]` the way the runtime does: ONE transaction for the whole
    chain, system params injected."""
    cmd = MANIFEST["commands"].get(name)
    if cmd is None:
        return False, f"command `{name}` is not declared in module.json"
    files = cmd.get("sql")
    if not files:
        return (
            False,
            f"command `{name}` declares no sql[] (handler `{cmd.get('handler')}`)",
        )
    params = dict(payload)
    params.setdefault("hub_id", hub)
    params.setdefault("current_user_id", USER)
    params.setdefault("now", NOW)
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
        return False, str(exc)


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


# ── Assertions ───────────────────────────────────────────────────────────────────────────


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")
        print(f"  ✗ {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ✓ {label}")


def command_ok(label: str, name: str, payload: dict, hub: str = HUB) -> bool:
    ok, err = run_command(name, payload, hub)
    if not ok:
        detail = err.splitlines()[-1] if err else ""
        failures.append(f"{label} — `{name}` failed: {detail}")
        print(f"  ✗ {label} — `{name}` failed: {detail}")
    else:
        print(f"  ✓ {label}")
    return ok


# ── The checkout the handler emits, bound the way the runtime binds it ───────────────────
#
# A 10,00 € set menu at 10 % (`restaurant.food`) with a 2,00 € soft drink at 21 %
# (`product.generic`) on it. The handler resolves both against the catalogues and hands the host
# TWO `sales._insert_line` operations; these are their params, cent for cent.

SALE = "sale-1"
PARENT = "line-menu"
CHILD = "line-drink"

# The option snapshot the server froze: the CHILD row carries it so it says WHICH option it is.
DRINK_SNAPSHOT = [
    {
        "option_id": "o-refresco",
        "group_id": "g-bebida",
        "name": "Refresco",
        "kitchen_name": "+REFRESCO",
        "price_delta": 200,
        "tax_category_key": "product.generic",
    }
]

UNITS = {
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


def line_params(**over) -> dict:
    base = {
        "sale_id": SALE,
        "product_id": None,
        "product_sku": "",
        "is_service": 0,
        "quantity": 1_000_000,
        "discount_percent": 0,
        "tax_class_name": "",
        "tax_country_code": "ES",
        "tax_region_code": "",
        "is_gift": 0,
        "gift_reason": "",
        "is_covered": 0,
        "category_id": None,
        "modifiers": "[]",
        "combo_group_ref": None,
        "combo": "{}",
        "parent_line_ref": None,
        **UNITS,
    }
    base.update(over)
    return base


def checkout(hub: str = HUB, sale_id: str = SALE) -> bool:
    """Play the whole checkout: counter, header, the two lines. One `_bump_counter` per sale, like
    the runtime does — the fiscal number comes out of it."""
    ok = command_ok(
        f"counter of the day ({hub})",
        "sales._bump_counter",
        {"day": DAY, "new_id": f"cnt-{hub}"},
        hub,
    )
    ok = (
        command_ok(
            f"sale header ({hub})",
            "sales._insert_sale",
            {
                "sale_id": sale_id,
                "day": DAY,
                "status": "completed",
                "subtotal": 1074,
                "tax_amount": 126,
                "tax_breakdown": json.dumps(
                    {
                        "10.00": {"base": 909, "tax": 91, "kind": "tax"},
                        "21.00": {"base": 165, "tax": 35, "kind": "tax"},
                    },
                    separators=(",", ":"),
                ),
                "discount_amount": 0,
                "discount_percent": 0,
                "total": 1200,
                "gift_total": 0,
                "payment_method_id": "pm-1",
                "payment_method_name": "Efectivo",
                "amount_tendered": 1200,
                "change_due": 0,
                "customer_id": None,
                "customer_name": "",
                "notes": "",
                "source_module": "pos",
                "channel": "dine_in",
                "order_id": None,
                "staff_id": USER,
                "appointment_id": None,
                "document_type": "ticket",
                "idempotency_key": f"idem-{sale_id}-{hub}",
            },
            hub,
        )
        and ok
    )
    ok = (
        command_ok(
            f"parent line, 10,00 € at 10 % ({hub})",
            "sales._insert_line",
            line_params(
                line_id=f"{PARENT}-{hub}" if hub != HUB else PARENT,
                sale_id=sale_id,
                product_id="p-menu",
                product_name="Menú del día",
                unit_price=1000,
                tax_rate=10.0,
                tax_category_key="restaurant.food",
                tax_rule_id="r-es-10",
                net_amount=909,
                tax_amount=91,
                line_total=1000,
            ),
            hub,
        )
        and ok
    )
    ok = (
        command_ok(
            f"child line, 2,00 € at 21 % ({hub})",
            "sales._insert_line",
            line_params(
                line_id=f"{CHILD}-{hub}" if hub != HUB else CHILD,
                sale_id=sale_id,
                product_name="Refresco",
                unit_price=200,
                tax_rate=21.0,
                tax_category_key="product.generic",
                tax_rule_id="r-es-21",
                net_amount=165,
                tax_amount=35,
                line_total=200,
                modifiers=json.dumps(DRINK_SNAPSHOT, separators=(",", ":")),
                # 🔴 The link, minted by the SERVER from the batch of ids — never from the payload.
                parent_line_ref=f"{PARENT}-{hub}" if hub != HUB else PARENT,
            ),
            hub,
        )
        and ok
    )
    return ok


# ── 1 · The schema holds the child ───────────────────────────────────────────────────────


def test_the_schema_holds_the_child_line() -> None:
    print("\n1. Migration 031 lands the column, and a checkout writes the pair")
    check(
        "`parent_line_ref` exists on sales_sale_item",
        q(
            "SELECT data_type FROM information_schema.columns WHERE table_name = 'sales_sale_item' "
            "AND column_name = 'parent_line_ref'"
        ),
        "text",
    )
    check(
        "and its partial index, so a parent is read with its children",
        qi(
            "SELECT count(*) FROM pg_indexes WHERE tablename = 'sales_sale_item' "
            "AND indexname = 'idx_sales_sale_item_parent_line'"
        ),
        1,
    )
    checkout()
    check(
        "the sale has TWO lines",
        qi(
            f"SELECT count(*) FROM sales_sale_item WHERE sale_id = '{SALE}' AND hub_id = '{HUB}'"
        ),
        2,
    )
    check(
        "the parent hangs from nobody",
        q(
            f"SELECT COALESCE(parent_line_ref, '<null>') FROM sales_sale_item WHERE id = '{PARENT}'"
        ),
        "<null>",
    )
    check(
        "the child names its parent",
        q(f"SELECT parent_line_ref FROM sales_sale_item WHERE id = '{CHILD}'"),
        PARENT,
    )
    check(
        "and it is NOT a set menu: that column groups siblings with no parent (ADR-0381)",
        q(
            f"SELECT COALESCE(combo_group_ref, '<null>') FROM sales_sale_item WHERE id = '{CHILD}'"
        ),
        "<null>",
    )
    check(
        "the child is not an article of the catalogue either",
        q(
            f"SELECT COALESCE(product_id, '<null>') FROM sales_sale_item WHERE id = '{CHILD}'"
        ),
        "<null>",
    )


# ── 2 · And the money squares, row by row ────────────────────────────────────────────────


def test_the_money_squares_on_both_rows() -> None:
    print("\n2. base + quota = gross on BOTH rows, and the two make the total")
    rows = q(
        "SELECT id || '|' || tax_rate::text || '|' || net_amount::text || '|' || tax_amount::text "
        f"|| '|' || line_total::text FROM sales_sale_item WHERE sale_id = '{SALE}' "
        f"AND hub_id = '{HUB}' ORDER BY unit_price DESC"
    )
    check(
        "the two rows, each with its own rate",
        [r for r in rows.splitlines() if r.strip()],
        [f"{PARENT}|10|909|91|1000", f"{CHILD}|21|165|35|200"],
    )
    check(
        "no row is off by a cent",
        qi(
            f"SELECT count(*) FROM sales_sale_item WHERE sale_id = '{SALE}' AND hub_id = '{HUB}' "
            "AND net_amount + tax_amount <> line_total"
        ),
        0,
    )
    check(
        "and the lines add up to what the customer paid",
        qi(
            f"SELECT SUM(line_total) FROM sales_sale_item WHERE sale_id = '{SALE}' AND hub_id = '{HUB}'"
        ),
        qi(f"SELECT total FROM sales_sale WHERE id = '{SALE}' AND hub_id = '{HUB}'"),
    )
    # The declared quota: ONE entry per RATE over the AGGREGATED base (ADR-0123 §4). It is the only
    # thing VeriFactu's `DetalleDesglose` can represent, and the child line is what makes the second
    # entry exist at all.
    breakdown = json.loads(
        q(f"SELECT tax_breakdown FROM sales_sale WHERE id = '{SALE}'")
    )
    check("the breakdown declares TWO rates", sorted(breakdown), ["10.00", "21.00"])
    for rate, entry in breakdown.items():
        expected = round(entry["base"] * float(rate) / 100)
        check(f"quota of {rate} % squares with base × rate", entry["tax"], expected)


# ── 3 · The reprint reads the link ───────────────────────────────────────────────────────


def test_the_reprint_reads_the_link() -> None:
    print(
        "\n3. `sales.lines` — the door every ticket and reprint go through — gives the link back"
    )
    rows = run_query("sales.lines", {"sale_id": SALE})
    check("both lines come back", len(rows), 2)
    by_id = {r["id"]: r for r in rows}
    check(
        "the child's link survives the round trip",
        by_id.get(CHILD, {}).get("parent_line_ref"),
        PARENT,
    )
    check("the parent's is null", by_id.get(PARENT, {}).get("parent_line_ref"), None)
    # The child row says WHICH option it is: the audit lives on the row, not deduced from ordering.
    snapshot = json.loads(by_id.get(CHILD, {}).get("modifiers") or "[]")
    check(
        "and it says which option it came from",
        [o["option_id"] for o in snapshot],
        ["o-refresco"],
    )
    check(
        "with the frozen delta that priced it",
        [o["price_delta"] for o in snapshot],
        [200],
    )
    check("the parent folded nothing", by_id.get(PARENT, {}).get("modifiers"), "[]")


# ── 4 · The check splits with its supplements attached ───────────────────────────────────

ORDER = "ord-1"
ORDER_LINE = "oline-1"
SPLIT_ORDER = "ord-2"


def open_order(order_id: str, label: str, hub: str = HUB) -> None:
    psql(
        [
            "-c",
            "INSERT INTO sales_order (id, hub_id, status, provisional_total, notes, label, "
            "source_module, is_deleted, created_by, updated_by, created_at, updated_at) VALUES "
            f"('{order_id}', '{hub}', 'open', 0, '', '{label}', 'pos', 0, '{USER}', '{USER}', "
            f"'{NOW}', '{NOW}')",
        ],
        db=DB,
    )


def add_order_line(line_id: str, order_id: str, hub: str = HUB) -> None:
    """The row the waiter's order writes: the menu, with the drink's picks FROZEN inside it
    (sales#200). There is no child row here on purpose — see the head of migration 031."""
    psql(
        [
            "-c",
            "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name, "
            "product_sku, quantity, unit_price, is_gift, gift_reason, line_total, tax_category_key, "
            "cost, sale_id, round_no, fired_at, modifiers, is_deleted, created_by, updated_by, "
            "created_at, updated_at) VALUES "
            f"('{line_id}', '{hub}', '{order_id}', 'p-menu', 'Menú del día', '', 1000000, 1000, 0, "
            f"'', 1000, 'restaurant.food', 0, NULL, 0, NULL, "
            f"{literal(json.dumps(DRINK_SNAPSHOT, separators=(',', ':')))}, 0, '{USER}', '{USER}', "
            f"'{NOW}', '{NOW}')",
        ],
        db=DB,
    )


def picks_of(line_id: str, hub: str = HUB) -> list:
    raw = q(
        f"SELECT modifiers FROM sales_order_item WHERE id = '{line_id}' AND hub_id = '{hub}'"
    )
    try:
        return json.loads(raw)
    except ValueError:
        return [raw]


def test_the_check_splits_and_joins_with_its_supplements() -> None:
    print("\n4. Splitting and joining a check move the supplement WITH its line")
    open_order(ORDER, "Mesa 4")
    add_order_line(ORDER_LINE, ORDER)
    # 🔴 The point of the design: `sales_order_item` has NO child row to leave behind. The child is
    # materialised when the money is decided, so every door that moves order lines moves the
    # supplement for free — nothing to keep in step, nothing to orphan.
    check(
        "the open check has ONE row, picks inside",
        qi(
            f"SELECT count(*) FROM sales_order_item WHERE order_id = '{ORDER}' AND hub_id = '{HUB}' "
            "AND is_deleted = 0"
        ),
        1,
    )
    check(
        "and no row of it hangs from another",
        qi(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'sales_order_item' "
            "AND column_name = 'parent_line_ref'"
        ),
        0,
    )

    command_ok(
        "split the check",
        "sales.order.split",
        {
            "order_id": ORDER,
            "new_id": SPLIT_ORDER,
            "label": "Mesa 4 (2)",
            "line_ids": json.dumps([ORDER_LINE]),
        },
    )
    check(
        "the menu moved to the new check",
        q(
            f"SELECT order_id FROM sales_order_item WHERE id = '{ORDER_LINE}' AND hub_id = '{HUB}'"
        ),
        SPLIT_ORDER,
    )
    check(
        "and its supplement went with it, frozen delta included",
        [
            (o["option_id"], o["price_delta"], o["tax_category_key"])
            for o in picks_of(ORDER_LINE)
        ],
        [("o-refresco", 200, "product.generic")],
    )
    check(
        "the new check is worth the menu",
        qi(
            f"SELECT provisional_total FROM sales_order WHERE id = '{SPLIT_ORDER}' AND hub_id = '{HUB}'"
        ),
        1000,
    )

    command_ok(
        "join the two checks back",
        "sales.order.merge",
        {
            "from_order_id": SPLIT_ORDER,
            "to_order_id": ORDER,
        },
    )
    check(
        "the menu came back",
        q(
            f"SELECT order_id FROM sales_order_item WHERE id = '{ORDER_LINE}' AND hub_id = '{HUB}'"
        ),
        ORDER,
    )
    check(
        "with its supplement still attached",
        [o["option_id"] for o in picks_of(ORDER_LINE)],
        ["o-refresco"],
    )
    check(
        "and the source check is voided, not left half alive",
        q(
            f"SELECT status FROM sales_order WHERE id = '{SPLIT_ORDER}' AND hub_id = '{HUB}'"
        ),
        "voided",
    )


# ── 5 · Reopening changes nothing ────────────────────────────────────────────────────────


def test_reopening_keeps_the_supplement() -> None:
    print("\n5. A line that goes back to a live check keeps its supplements")
    # `order.split` refuses a line already tied to a sale (`sale_id IS NULL` in its WHERE), which is
    # what stops a paid line from travelling. Untie it — that is what reopening does — and the picks
    # are exactly the ones that were frozen when it was ordered.
    psql(
        [
            "-c",
            f"UPDATE sales_order_item SET sale_id = '{SALE}' WHERE id = '{ORDER_LINE}'",
        ],
        db=DB,
    )
    check(
        "a PAID line does not travel",
        (
            run_command(
                "sales.order.split",
                {
                    "order_id": ORDER,
                    "new_id": "ord-3",
                    "label": "Mesa 4 (3)",
                    "line_ids": json.dumps([ORDER_LINE]),
                },
            )[0],
            q(f"SELECT order_id FROM sales_order_item WHERE id = '{ORDER_LINE}'"),
        ),
        (True, ORDER),
    )
    psql(
        ["-c", f"UPDATE sales_order_item SET sale_id = NULL WHERE id = '{ORDER_LINE}'"],
        db=DB,
    )
    check(
        "reopened, its supplements are the ones it was ordered with",
        [(o["option_id"], o["price_delta"]) for o in picks_of(ORDER_LINE)],
        [("o-refresco", 200)],
    )


# ── 6 · The FOLD still lands, untouched ──────────────────────────────────────────────────

FOLDED_SALE = "sale-folded"
FOLDED_LINE = "line-folded"


def test_a_supplement_that_folds_still_lands_as_ONE_row() -> None:
    print(
        "\n6. The 99 % of supplements — no category of their own — still land as ONE row"
    )
    # The no-regression control, and it is the one that matters most: a «+cheese» has no tax
    # category, so its delta goes on folding into the parent's unit price. If this went red, the fix
    # would have broken every ticket with a supplement on it.
    command_ok(
        "counter of the day",
        "sales._bump_counter",
        {"day": DAY, "new_id": "cnt-folded"},
    )
    command_ok(
        "sale header",
        "sales._insert_sale",
        {
            "sale_id": FOLDED_SALE,
            "day": DAY,
            "status": "completed",
            "subtotal": 1091,
            "tax_amount": 109,
            "tax_breakdown": '{"10.00":{"base":1091,"tax":109,"kind":"tax"}}',
            "discount_amount": 0,
            "discount_percent": 0,
            "total": 1200,
            "gift_total": 0,
            "payment_method_id": "pm-1",
            "payment_method_name": "Efectivo",
            "amount_tendered": 1200,
            "change_due": 0,
            "customer_id": None,
            "customer_name": "",
            "notes": "",
            "source_module": "pos",
            "channel": "dine_in",
            "order_id": None,
            "staff_id": USER,
            "appointment_id": None,
            "document_type": "ticket",
            "idempotency_key": "idem-folded",
        },
    )
    command_ok(
        "one line, 12,00 € at 10 %",
        "sales._insert_line",
        line_params(
            line_id=FOLDED_LINE,
            sale_id=FOLDED_SALE,
            product_id="p-menu",
            product_name="Menú del día",
            unit_price=1200,
            tax_rate=10.0,
            tax_category_key="restaurant.food",
            tax_rule_id="r-es-10",
            net_amount=1091,
            tax_amount=109,
            line_total=1200,
            modifiers='[{"option_id":"o-queso","name":"Queso","price_delta":200}]',
        ),
    )
    check(
        "ONE row, not two",
        qi(
            f"SELECT count(*) FROM sales_sale_item WHERE sale_id = '{FOLDED_SALE}' "
            f"AND hub_id = '{HUB}'"
        ),
        1,
    )
    check(
        "the delta is INSIDE the unit price",
        qi(f"SELECT unit_price FROM sales_sale_item WHERE id = '{FOLDED_LINE}'"),
        1200,
    )
    check(
        "and nothing hangs from it",
        q(
            f"SELECT COALESCE(parent_line_ref, '<null>') FROM sales_sale_item "
            f"WHERE id = '{FOLDED_LINE}'"
        ),
        "<null>",
    )
    rows = run_query("sales.lines", {"sale_id": FOLDED_SALE})
    check(
        "the ticket still names the supplement under its line",
        [o["option_id"] for o in json.loads(rows[0]["modifiers"])] if rows else [],
        ["o-queso"],
    )


# ── 7 · And none of it crosses hubs ──────────────────────────────────────────────────────


def test_nothing_crosses_hubs() -> None:
    print("\n7. A neighbour hub sees no row, no link and no supplement")
    checkout(hub=OTHER_HUB, sale_id="sale-neighbour")
    check(
        "the neighbour's sale does not reach this hub through the ticket's door",
        len(run_query("sales.lines", {"sale_id": "sale-neighbour"}, hub=HUB)),
        0,
    )
    check(
        "nor does its child line exist for us",
        qi(
            f"SELECT count(*) FROM sales_sale_item WHERE hub_id = '{HUB}' "
            f"AND parent_line_ref = '{PARENT}-{OTHER_HUB}'"
        ),
        0,
    )
    check(
        "and the neighbour keeps its own pair",
        qi(
            f"SELECT count(*) FROM sales_sale_item WHERE hub_id = '{OTHER_HUB}' "
            "AND sale_id = 'sale-neighbour'"
        ),
        2,
    )
    check(
        "with the link pointing at ITS parent",
        q(
            f"SELECT parent_line_ref FROM sales_sale_item WHERE id = '{CHILD}-{OTHER_HUB}'"
        ),
        f"{PARENT}-{OTHER_HUB}",
    )


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print(f"→ sales#147 · the child line, against Postgres ({CONTAINER}, db {DB})")
    try:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB}"])
        psql(["-c", f"CREATE DATABASE {DB}"])
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        psql([], db=DB, stdin=BRIDGE_FUNCTIONS)
        load_migrations()
        test_the_schema_holds_the_child_line()
        test_the_money_squares_on_both_rows()
        test_the_reprint_reads_the_link()
        test_the_check_splits_and_joins_with_its_supplements()
        test_reopening_keeps_the_supplement()
        test_a_supplement_that_folds_still_lands_as_ONE_row()
        test_nothing_crosses_hubs()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"✗ {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ the child line lands, squares, reads back, and survives split · merge · reopen"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
