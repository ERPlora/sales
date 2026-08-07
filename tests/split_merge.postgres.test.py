#!/usr/bin/env python3
"""Split & merge a check (sales#61) — runs against a REAL Postgres 18 in Docker.

Why a SQL-level test: `tables` already knows how to split and join the *floor* checks
(tables#12) — what it cannot do is move LINES and AMOUNTS, because it does not own them.
That half is `sales`, and it is pure SQL semantics: which rows travel, which order gets
voided, and whether the money still adds up afterwards. So this harness runs the manifest
`sql[]` chains exactly as the runtime does (`execute_tx`): every statement of a command in
ONE transaction, the runtime-injected params bound (`:hub_id`, `:current_user_id`, `:now`,
`:new_id`), and any `:param` absent from the payload bound as NULL — which is what the
driver does (`DynNull`, hub/crates/db/src/lib.rs).

Contract under test — the two halves ERPlora/sales#61 asks for:

  1. SPLIT. `tables.sessions.split` opens a second live check on the same table and it is born
     WITHOUT an order on purpose. `sales.order.split` materializes that second order and moves
     the selected lines into it. No cent may be lost or invented, and the per-tax-rate breakdown
     of each side must be RECOMPUTED from its live lines, never copied.

  2. MERGE. When BOTH tables carry an order, `tables.sessions.merge` cannot resolve it (it does
     not know the lines) and leaves each order on its session. `sales.order.merge` sums the
     source lines into the destination and voids the source: one check, every line, and a total
     that is the exact sum of the two.

Money contract: ADR-0123 (integer cents) + ADR-0187 (tax per line, via `tax_category_key`).
Nothing here DIVIDES an amount — whole rows travel with their `line_total` intact — so there is
no allocation to do; the day a "split by amount / by guests" mode is added it must repartition by
LARGEST REMAINDER (ADR-0210 §4), never HALF_UP per part.

Usage: tests/split_merge.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import uuid

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_split_merge_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-waiter"

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
    """Scalar query against the scratch DB. A missing relation/column is a RED result, not a
    crash: the run must report every acceptance point, not stop at the first one."""
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
# money columns land as int4 instead of BIGINT and the harness would not be running production's
# schema.
DDL_TYPES = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
    "TEXT": "TEXT",
}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        # Arrays/objects reach the driver as a compact JSON string (hub/crates/db/src/lib.rs:
        # `Some(other) => q.bind(other.to_string())`), so a module reads them back with a
        # `CAST(:param AS jsonb)`. Same shape here.
        value = json.dumps(value, separators=(",", ":"))
    return "'" + str(value).replace("'", "''") + "'"


def bind(sql: str, params: dict) -> str:
    """Single pass over the `:name` placeholders — a value that itself contains a colon (an ISO
    timestamp) must never be rescanned. `:name` inside a comment is left alone, exactly like the
    runtime's translator does."""

    def strip_comments(text: str) -> list[tuple[int, int]]:
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

    comments = strip_comments(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in comments)

    return PARAM.sub(
        lambda m: (
            m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))
        ),
        sql,
    )


def run_command(name: str, payload: dict, now: str) -> tuple[bool, str]:
    """Execute a manifest command's `sql[]` the way the runtime does: one transaction, system
    params injected. Returns (ok, error)."""
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
    params.setdefault("hub_id", HUB)
    params.setdefault("current_user_id", USER)
    params.setdefault("now", now)

    script = ["BEGIN;"]
    for rel in files:
        path = MODULE_DIR / rel
        if not path.exists():
            return False, f"`{name}` declares `{rel}`, which does not exist"
        stmt_params = dict(params)
        # `:new_id` is the SAME uuid for every statement of the command: the runtime binds one id
        # per operation, and the response hands it back as `new_ids[0]` so the caller can address
        # the row it just created.
        stmt_params.setdefault("new_id", params.get("new_id"))
        script.append(bind(path.read_text(), stmt_params))
    script.append("COMMIT;")

    try:
        psql([], db=DB, stdin="\n".join(script))
        return True, ""
    except RuntimeError as exc:
        return False, str(exc)


# ── Assertions ───────────────────────────────────────────────────────────────────────────


def check(label: str, expected, actual):
    if expected != actual:
        failures.append(f"{label} — expected [{expected}], got [{actual}]")
        print(f"  FAIL: {label} — expected [{expected}], got [{actual}]")
    else:
        print(f"  ok: {label} = {expected}")


def command_ok(label: str, name: str, payload: dict, now: str):
    ok, err = run_command(name, payload, now)
    if not ok:
        detail = err.splitlines()[-1] if err else ""
        failures.append(f"{label} — {name} failed: {detail}")
        print(f"  FAIL: {label} — `{name}` failed: {detail}")
    else:
        print(f"  ok: {label}")
    return ok


# ── Fixtures ─────────────────────────────────────────────────────────────────────────────

NOW = "2026-08-07T13:00:00+00:00"


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


def add_line(
    line_id: str,
    order_id: str,
    name: str,
    qty_micro: int,
    unit_price: int,
    line_total: int,
    tax_key: str,
    hub: str = HUB,
    fired_round: int = 0,
    fired_at: str | None = None,
    sale_id: str | None = None,
) -> None:
    psql(
        [
            "-c",
            "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name, "
            "product_sku, quantity, unit_price, is_gift, gift_reason, line_total, "
            "tax_category_key, cost, sale_id, round_no, fired_at, is_deleted, created_by, "
            "updated_by, created_at, updated_at) VALUES "
            f"('{line_id}', '{hub}', '{order_id}', 'p-{line_id}', '{name}', '', {qty_micro}, "
            f"{unit_price}, 0, '', {line_total}, '{tax_key}', 0, "
            f"{literal(sale_id)}, {fired_round}, {literal(fired_at)}, 0, '{USER}', '{USER}', "
            f"'{NOW}', '{NOW}')",
        ],
        db=DB,
    )


def total_of(order_id: str) -> int:
    return qi(
        f"SELECT provisional_total FROM sales_order WHERE id = '{order_id}' AND hub_id = '{HUB}'"
    )


def status_of(order_id: str) -> str:
    return q(
        f"SELECT status FROM sales_order WHERE id = '{order_id}' AND hub_id = '{HUB}'"
    )


def lines_of(order_id: str) -> list[str]:
    raw = q(
        f"SELECT id FROM sales_order_item WHERE order_id = '{order_id}' AND hub_id = '{HUB}' "
        f"AND is_deleted = 0 ORDER BY id"
    )
    return [r for r in raw.splitlines() if r.strip()]


def sum_lines(order_id: str) -> int:
    return qi(
        f"SELECT COALESCE(SUM(line_total), 0) FROM sales_order_item WHERE order_id = '{order_id}' "
        f"AND hub_id = '{HUB}' AND is_deleted = 0"
    )


def breakdown(order_id: str) -> dict:
    """Amount per tax category of an order's live lines. This is the shape the checkout freezes
    into the fiscal breakdown (ADR-0085/0187): if it does not add up here, the invoice will not
    add up either."""
    raw = q(
        "SELECT tax_category_key || '=' || SUM(line_total)::text FROM sales_order_item "
        f"WHERE order_id = '{order_id}' AND hub_id = '{HUB}' AND is_deleted = 0 "
        "GROUP BY tax_category_key ORDER BY tax_category_key"
    )
    out = {}
    for row in raw.splitlines():
        if "=" in row:
            k, v = row.rsplit("=", 1)
            out[k] = int(v)
    return out


def new_order_ids(exclude: set[str]) -> list[str]:
    raw = q(
        f"SELECT id FROM sales_order WHERE hub_id = '{HUB}' ORDER BY created_at, id"
    )
    return [r for r in raw.splitlines() if r.strip() and r.strip() not in exclude]


# ── 1. Splitting a check hands out the lines without touching the money ──────────────────


def test_split_shares_out_the_lines():
    print(
        "\n== 1. splitting a check moves the chosen lines and the money still adds up =="
    )

    # Table 4: three courses at two different VAT rates. 21% on the wine, 10% on the food —
    # the mix is the point: a split that only preserves the TOTAL but scrambles the rates
    # produces an invoice that no longer matches its own breakdown.
    open_order("O1", "Table 4")
    add_line("l1", "O1", "Wine", 1_000_000, 1_895, 1_895, "standard")
    add_line("l2", "O1", "Paella", 2_000_000, 1_450, 2_900, "reduced")
    add_line("l3", "O1", "Coffee", 3_000_000, 137, 411, "reduced")
    psql(
        ["-c", f"UPDATE sales_order SET provisional_total = 5206 WHERE id = 'O1'"],
        db=DB,
    )
    original_total = total_of("O1")
    original_breakdown = breakdown("O1")
    check("the check starts at 52,06 €", 5206, original_total)

    split_id = str(uuid.uuid4())
    command_ok(
        "the wine and the coffee leave for the second check",
        "sales.order.split",
        {
            "order_id": "O1",
            "line_ids": ["l1", "l3"],
            "label": "Table 4 · 2",
            "new_id": split_id,
        },
        "2026-08-07T13:30:00+00:00",
    )

    check("a SECOND order now exists", "open", status_of(split_id))
    check("the source check stays open", "open", status_of("O1"))
    check("the chosen lines travelled", ["l1", "l3"], lines_of(split_id))
    check("the rest stayed put", ["l2"], lines_of("O1"))

    # THE invariant: nothing is created and nothing evaporates. Whole rows travel with their
    # `line_total`, so the two halves must add up to the cent.
    check(
        "no cent is lost or invented",
        original_total,
        total_of("O1") + total_of(split_id),
    )
    check(
        "the source total is RECOMPUTED from its lines", sum_lines("O1"), total_of("O1")
    )
    check(
        "the new total is RECOMPUTED from its lines",
        sum_lines(split_id),
        total_of(split_id),
    )

    # ...and the per-rate breakdown adds up too, which is the half a bare total cannot prove.
    joined = dict(breakdown("O1"))
    for k, v in breakdown(split_id).items():
        joined[k] = joined.get(k, 0) + v
    check("the per-rate breakdown still adds up", original_breakdown, joined)
    check(
        "the second check keeps its own rates",
        {"reduced": 411, "standard": 1895},
        breakdown(split_id),
    )

    # The label is opaque (ADR-0144): `sales` writes what the floor gave it and does not read it.
    check(
        "the new check carries the label the floor gave it",
        "Table 4 · 2",
        q(
            f"SELECT label FROM sales_order WHERE id = '{split_id}' AND hub_id = '{HUB}'"
        ),
    )


def test_split_an_empty_check():
    print("\n== 2. an empty check can still be split (the second one starts blank) ==")

    open_order("O2", "Bar")
    blank_id = str(uuid.uuid4())
    command_ok(
        "splitting with nothing selected opens a blank second check",
        "sales.order.split",
        {"order_id": "O2", "label": "Bar · 2", "new_id": blank_id},
        "2026-08-07T13:40:00+00:00",
    )
    check("the blank check exists", "open", status_of(blank_id))
    check("and it is empty", [], lines_of(blank_id))
    check("at zero", 0, total_of(blank_id))
    check("the source is untouched", "open", status_of("O2"))


def test_split_guards():
    print("\n== 3. what split must REFUSE to do ==")

    # A check that was already paid is not splittable: it is history.
    open_order("O3", "Closed")
    add_line("l4", "O3", "Beer", 1_000_000, 250, 250, "standard")
    psql(["-c", "UPDATE sales_order SET status = 'completed' WHERE id = 'O3'"], db=DB)
    ghost = str(uuid.uuid4())
    run_command(
        "sales.order.split",
        {"order_id": "O3", "line_ids": ["l4"], "new_id": ghost},
        "2026-08-07T13:45:00+00:00",
    )
    check("a completed check spawns no second order", "", status_of(ghost))
    check("and keeps its line", ["l4"], lines_of("O3"))

    # A line that belongs to somebody else's check cannot be dragged along.
    open_order("O4", "Table 9")
    add_line("l5", "O4", "Water", 1_000_000, 150, 150, "standard")
    open_order("O5", "Table 10")
    add_line("l6", "O5", "Bread", 1_000_000, 120, 120, "reduced")
    mixed = str(uuid.uuid4())
    command_ok(
        "splitting O4 while naming a line of O5",
        "sales.order.split",
        {"order_id": "O4", "line_ids": ["l5", "l6"], "new_id": mixed},
        "2026-08-07T13:50:00+00:00",
    )
    check("only the line of the split check moved", ["l5"], lines_of(mixed))
    check("the other check keeps its line", ["l6"], lines_of("O5"))
    check("and its total", 120, sum_lines("O5"))

    # Another hub's rows are invisible — the tenant is never negotiable (row contract §2.5).
    open_order("O6", "Neighbour", hub=OTHER_HUB)
    add_line("l7", "O6", "Not mine", 1_000_000, 999, 999, "standard", hub=OTHER_HUB)
    intruder = str(uuid.uuid4())
    run_command(
        "sales.order.split",
        {"order_id": "O6", "line_ids": ["l7"], "new_id": intruder},
        "2026-08-07T13:55:00+00:00",
    )
    check("another hub's check cannot be split from here", "", status_of(intruder))
    check(
        "and its line stays where it was",
        "O6",
        q(
            f"SELECT order_id FROM sales_order_item WHERE id = 'l7' AND hub_id = '{OTHER_HUB}'"
        ),
    )


def test_split_replay_changes_nothing():
    print("\n== 4. the same split arriving twice ==")

    open_order("O7", "Table 7")
    add_line("l8", "O7", "Steak", 1_000_000, 2_100, 2_100, "reduced")
    add_line("l9", "O7", "Soda", 1_000_000, 260, 260, "standard")
    psql(
        ["-c", "UPDATE sales_order SET provisional_total = 2360 WHERE id = 'O7'"], db=DB
    )

    first = str(uuid.uuid4())
    command_ok(
        "the split runs",
        "sales.order.split",
        {"order_id": "O7", "line_ids": ["l9"], "new_id": first},
        "2026-08-07T14:00:00+00:00",
    )
    replay = str(uuid.uuid4())
    run_command(
        "sales.order.split",
        {"order_id": "O7", "line_ids": ["l9"], "new_id": replay},
        "2026-08-07T14:00:05+00:00",
    )

    # The retry asks for a line that already left: there is nothing to split off, so it must not
    # leave a stray empty check behind on the floor.
    check("the replay opens no second empty check", "", status_of(replay))
    check("the line did not come back", ["l8"], lines_of("O7"))
    check("nor was it duplicated", ["l9"], lines_of(first))
    check("and the money is untouched", 2360, total_of("O7") + total_of(first))


# ── 5. Joining two tables that BOTH ordered ──────────────────────────────────────────────


def test_merge_joins_two_checks():
    print("\n== 5. joining two tables that both ordered leaves ONE check ==")

    open_order("M1", "Table 1")
    add_line("m1", "M1", "Vermouth", 2_000_000, 380, 760, "standard")
    add_line("m2", "M1", "Olives", 1_000_000, 295, 295, "reduced")
    psql(
        ["-c", "UPDATE sales_order SET provisional_total = 1055 WHERE id = 'M1'"], db=DB
    )

    open_order("M2", "Table 2")
    add_line("m3", "M2", "Croquettes", 1_000_000, 890, 890, "reduced")
    psql(
        ["-c", "UPDATE sales_order SET provisional_total = 890 WHERE id = 'M2'"], db=DB
    )

    before = total_of("M1") + total_of("M2")
    joined_breakdown = dict(breakdown("M1"))
    for k, v in breakdown("M2").items():
        joined_breakdown[k] = joined_breakdown.get(k, 0) + v

    command_ok(
        "table 1 is joined into table 2",
        "sales.order.merge",
        {"from_order_id": "M1", "to_order_id": "M2"},
        "2026-08-07T14:10:00+00:00",
    )

    check(
        "every line ended up on the surviving check", ["m1", "m2", "m3"], lines_of("M2")
    )
    check("the absorbed check is left empty", [], lines_of("M1"))
    check("the absorbed check is voided, not deleted", "voided", status_of("M1"))
    check("the survivor is still open", "open", status_of("M2"))
    check("the total is the exact sum of the two", before, total_of("M2"))
    check(
        "the survivor's total is RECOMPUTED from its lines",
        sum_lines("M2"),
        total_of("M2"),
    )
    check("the emptied check drops to zero", 0, total_of("M1"))
    check(
        "the per-rate breakdown is the union of both", joined_breakdown, breakdown("M2")
    )


def test_merge_keeps_the_kitchen_rounds():
    print("\n== 6. merging must not send the food to the kitchen twice ==")

    # The lines of the absorbed check were already fired. If the merge RE-CREATED them (instead of
    # moving the rows) they would come back with `fired_at IS NULL` — and the next fire would send
    # the same food to the pass a second time.
    open_order("M3", "Table 3")
    add_line(
        "m4",
        "M3",
        "Ribs",
        1_000_000,
        1_600,
        1_600,
        "reduced",
        fired_round=1,
        fired_at=NOW,
    )
    open_order("M4", "Table 5")
    add_line("m5", "M4", "Salad", 1_000_000, 700, 700, "reduced")

    command_ok(
        "the fired check is absorbed",
        "sales.order.merge",
        {"from_order_id": "M3", "to_order_id": "M4"},
        "2026-08-07T14:20:00+00:00",
    )
    check(
        "the moved line is still marked as fired",
        NOW,
        q(
            f"SELECT fired_at FROM sales_order_item WHERE id = 'm4' AND hub_id = '{HUB}'"
        ),
    )
    check(
        "and keeps its round",
        1,
        qi(
            f"SELECT round_no FROM sales_order_item WHERE id = 'm4' AND hub_id = '{HUB}'"
        ),
    )
    check("the line is on the surviving check", ["m4", "m5"], lines_of("M4"))


def test_merge_leaves_paid_lines_alone():
    print("\n== 7. a line that is already paid does not travel ==")

    # "Everyone pays their own" (ADR-0146): a paid line is nailed to the sale that charged it.
    # Dragging it into another check would put it up for sale a second time.
    open_order("M5", "Table 6")
    add_line("m6", "M5", "Menu", 1_000_000, 1_400, 1_400, "reduced", sale_id="S-1")
    add_line("m7", "M5", "Dessert", 1_000_000, 450, 450, "reduced")
    open_order("M6", "Table 8")

    command_ok(
        "the half-paid check is joined",
        "sales.order.merge",
        {"from_order_id": "M5", "to_order_id": "M6"},
        "2026-08-07T14:30:00+00:00",
    )
    check("the unpaid line travels", ["m7"], lines_of("M6"))
    check("the paid one stays with the check that sold it", ["m6"], lines_of("M5"))


def test_merge_guards_and_replay():
    print("\n== 8. what merge must refuse, and what a redelivery does ==")

    open_order("M7", "Table 11")
    add_line("m8", "M7", "Toast", 1_000_000, 320, 320, "reduced")
    open_order("M8", "Table 12")
    add_line("m9", "M8", "Juice", 1_000_000, 240, 240, "standard")

    command_ok(
        "the tables are joined",
        "sales.order.merge",
        {"from_order_id": "M7", "to_order_id": "M8"},
        "2026-08-07T14:40:00+00:00",
    )
    check("one check holds both lines", ["m8", "m9"], lines_of("M8"))
    check("total after the merge", 560, total_of("M8"))

    # The same click lands twice (a retried request, a re-rendered picker). Replaying must be a
    # clean no-op: the source is already voided, so there is nothing left to move.
    command_ok(
        "the very same merge is replayed",
        "sales.order.merge",
        {"from_order_id": "M7", "to_order_id": "M8"},
        "2026-08-07T14:40:05+00:00",
    )
    check("no line is duplicated", ["m8", "m9"], lines_of("M8"))
    check("and the total does not move", 560, total_of("M8"))

    # Merging a check into ITSELF would empty it into itself and then void it — the whole check
    # would vanish. It must be a no-op.
    open_order("M9", "Table 13")
    add_line("m10", "M9", "Cider", 1_000_000, 300, 300, "standard")
    run_command(
        "sales.order.merge",
        {"from_order_id": "M9", "to_order_id": "M9"},
        "2026-08-07T14:45:00+00:00",
    )
    check("a check cannot swallow itself", "open", status_of("M9"))
    check("and keeps its line", ["m10"], lines_of("M9"))

    # A destination that is no longer open cannot receive anything: the lines would land on a
    # closed ticket and disappear from the floor.
    open_order("M10", "Table 14")
    add_line("m11", "M10", "Wine", 1_000_000, 410, 410, "standard")
    open_order("M11", "Closed table")
    psql(["-c", "UPDATE sales_order SET status = 'completed' WHERE id = 'M11'"], db=DB)
    run_command(
        "sales.order.merge",
        {"from_order_id": "M10", "to_order_id": "M11"},
        "2026-08-07T14:50:00+00:00",
    )
    check("nothing moves into a closed check", [], lines_of("M11"))
    check("the source is NOT voided", "open", status_of("M10"))
    check("and keeps its line", ["m11"], lines_of("M10"))


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def load_migrations() -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        sql = DDL_TOKEN.sub(lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text())
        psql([], db=DB, stdin=sql)


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

        test_split_shares_out_the_lines()
        test_split_an_empty_check()
        test_split_guards()
        test_split_replay_changes_nothing()
        test_merge_joins_two_checks()
        test_merge_keeps_the_kitchen_rounds()
        test_merge_leaves_paid_lines_alone()
        test_merge_guards_and_replay()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — a check can be split and two checks can be joined (sales#61)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
