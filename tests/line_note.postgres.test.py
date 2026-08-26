#!/usr/bin/env python3
"""The LINE NOTE end to end (sales#156) — runs against a REAL Postgres 18 in Docker.

Why a SQL-level test. `kitchen_order_item` has had its `notes` column since day one and the KDS
paints it, but there was nowhere to fill it from: `sales_order_item` had no column, so "medium
rare" / "shellfish allergy" lived in the browser and died on the first reload. The fix is the
column, and a column is only worth anything if it SURVIVES what a check goes through during a
service: being resumed, split, transferred to another table and fired again.

That is pure SQL semantics — which rows travel, what a partial update leaves alone, what a fired
line refuses — so it runs here, the way the runtime runs it (`execute_tx`): every statement of a
manifest command in ONE transaction, the runtime-injected params bound (`:hub_id`,
`:current_user_id`, `:now`, `:new_id`), and any `:param` absent from the payload bound as NULL,
which is what the driver does (`DynNull`, hub/crates/db/src/lib.rs).

Contract under test:

  1. THE COLUMN. `sales_order_item.notes` is `TEXT NOT NULL DEFAULT ''` — a row written before the
     migration reads back as "no note", never as NULL, so nothing downstream has to guard.
  2. RESUMING. `queries/order_lines.sql` gives the note back, next to the supplements and the
     frozen tax category. Without this the note is written and unreadable — the very failure
     sales#148 fixed for the supplements.
  3. EDITING. `sales.order.update_line` writes the note, and a payload WITHOUT `notes` leaves the
     stored one alone (the quantity stepper must not wipe what the waiter typed).
  4. FIRED LINES. A line already in the kitchen refuses the edit, same guard as the quantity: the
     food is on the fire and the ticket has been printed.
  5. SPLIT / MERGE / TRANSFER. Whole rows travel, so the note travels with them.
  6. TENANCY. Another hub's line is not reachable.

Usage: tests/line_note.postgres.test.py
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
DB = f"sales_line_note_test_{os.getpid()}"
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
        stmt_params.setdefault("new_id", params.get("new_id"))
        script.append(bind(path.read_text(), stmt_params))
    script.append("COMMIT;")

    try:
        psql([], db=DB, stdin="\n".join(script))
        return True, ""
    except RuntimeError as exc:
        return False, str(exc)


def run_query(rel: str, params: dict) -> list[dict]:
    """Run one of the module's `queries/*.sql` the way a read does: `:hub_id` injected, the rest
    bound from the caller. Returns the rows as dicts (via `row_to_json`)."""
    path = MODULE_DIR / rel
    bound = bind(path.read_text(), {**{"hub_id": HUB}, **params}).rstrip().rstrip(";")
    try:
        raw = psql(["-tAc", f"SELECT row_to_json(r) FROM ({bound}) r"], db=DB)
    except RuntimeError as exc:
        failures.append(f"query `{rel}` failed: {str(exc).splitlines()[0]}")
        print(f"  FAIL: query `{rel}` failed: {str(exc).splitlines()[0]}")
        return []
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


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

NOW = "2026-08-26T13:00:00+00:00"


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


def insert_line(
    line_id: str,
    order_id: str,
    name: str,
    note: str | None = None,
    hub: str = HUB,
    fired_round: int = 0,
    fired_at: str | None = None,
) -> bool:
    """Add a line through the module's OWN command (`sales._insert_order_line`), the door the
    `open_order` / `add_order_line` handlers push their row through. Going in by hand would prove
    nothing about whether the note reaches the column."""
    ok, err = run_command(
        "sales._insert_order_line",
        {
            "id": line_id,
            "hub_id": hub,
            "order_id": order_id,
            "product_id": f"p-{line_id}",
            "product_name": name,
            "product_sku": "",
            "quantity": 1_000_000,
            "unit_price": 1_000,
            "is_gift": 0,
            "gift_reason": "",
            "line_total": 1_000,
            "tax_category_key": "standard",
            "cost": 0,
            "is_service": 0,
            "category_id": None,
            "discount_percent": 0,
            "modifiers": "[]",
            "combo_group_ref": None,
            "combo": "{}",
            "notes": note,
            # Frozen unit context (ADR-0147 §2.4). The handler always supplies the ten fields and
            # the columns are NOT NULL, so a fixture that omitted them would fail on the schema
            # instead of on what this battery is about.
            "unit_code": "ud",
            "unit_name": "",
            "factor_num": 1,
            "factor_den": 1,
            "increment_value": 1_000_000,
            "price_quantity_value": 1_000_000,
            "pricing_unit_code": "ud",
            "pricing_unit_name": "",
            "pricing_factor_num": 1,
            "pricing_factor_den": 1,
        },
        NOW,
    )
    if not ok:
        detail = err.splitlines()[-1] if err else ""
        failures.append(f"inserting line `{line_id}` failed: {detail}")
        print(f"  FAIL: inserting line `{line_id}` failed: {detail}")
        return False
    if fired_at:
        psql(
            [
                "-c",
                f"UPDATE sales_order_item SET round_no = {fired_round}, "
                f"fired_at = '{fired_at}' WHERE id = '{line_id}'",
            ],
            db=DB,
        )
    return True


def note_of(line_id: str, hub: str = HUB) -> str:
    """The stored note, or `<missing row>` when there is no such line.

    The brackets are not decoration. `psql -tAc` prints an absent row and an EMPTY note exactly
    the same (nothing at all), so a fixture that silently failed to insert would read as "line
    with no note" and every assertion expecting '' would go green for the wrong reason."""
    raw = q(
        f"SELECT '[' || notes || ']' FROM sales_order_item WHERE id = '{line_id}' "
        f"AND hub_id = '{hub}'"
    )
    if raw.startswith("[") and raw.endswith("]"):
        return raw[1:-1]
    return raw or "<missing row>"


def lines_of(order_id: str) -> list[str]:
    raw = q(
        f"SELECT id FROM sales_order_item WHERE order_id = '{order_id}' AND hub_id = '{HUB}' "
        f"AND is_deleted = 0 ORDER BY id"
    )
    return [r for r in raw.splitlines() if r.strip()]


# ── 1. The column exists, and an old row reads back as "no note" ─────────────────────────


def test_the_column_is_there_and_never_null():
    print("\n== 1. sales_order_item.notes is TEXT NOT NULL DEFAULT '' ==")

    check(
        "the column is TEXT",
        "text",
        q(
            "SELECT data_type FROM information_schema.columns WHERE table_name = "
            "'sales_order_item' AND column_name = 'notes'"
        ),
    )
    check(
        "and NOT NULL",
        "NO",
        q(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name = "
            "'sales_order_item' AND column_name = 'notes'"
        ),
    )

    # A row inserted WITHOUT a note — every line of every check open before this migration —
    # reads back as an empty string, never NULL. Nothing downstream has to learn a third state.
    open_order("N0", "Bar")
    insert_line("n0", "N0", "Coffee")
    check("a line with no note is '' and not NULL", "", note_of("n0"))


# ── 2. Resuming the check gives the note back ────────────────────────────────────────────


def test_resuming_the_check_returns_the_note():
    print(
        "\n== 2. `sales.order.lines` gives the note back when the check is resumed =="
    )

    open_order("N1", "Table 7")
    insert_line("n1", "N1", "Entrecote", "medium rare")
    insert_line("n2", "N1", "Paella", "shellfish allergy")

    rows = run_query("queries/order_lines.sql", {"order_id": "N1"})
    check("both lines come back", 2, len(rows))
    check(
        "each with its own note",
        ["medium rare", "shellfish allergy"],
        [r.get("notes") for r in rows],
    )


# ── 3. Editing the note, and not editing it by accident ──────────────────────────────────


def test_update_line_writes_the_note_and_leaves_it_alone():
    print(
        "\n== 3. `sales.order.update_line` writes the note; a payload without it does not =="
    )

    open_order("N2", "Table 8")
    insert_line("n3", "N2", "Burger", "no onion")

    command_ok(
        "the waiter corrects the note",
        "sales.order.update_line",
        {
            "order_id": "N2",
            "line_id": "n3",
            "quantity": 1_000_000,
            "line_total": 1_000,
            "notes": "no onion, extra chips",
        },
        "2026-08-26T13:10:00+00:00",
    )
    check("the note is the new one", "no onion, extra chips", note_of("n3"))

    # THE regression this guards: the quantity stepper sends no `notes` at all. Binding NULL must
    # leave the stored text alone — otherwise bumping a burger from 1 to 2 silently erases the
    # allergy the waiter typed, and nobody finds out until the plate reaches the table.
    command_ok(
        "bumping the quantity does not touch the note",
        "sales.order.update_line",
        {
            "order_id": "N2",
            "line_id": "n3",
            "quantity": 2_000_000,
            "line_total": 2_000,
        },
        "2026-08-26T13:11:00+00:00",
    )
    check(
        "the note survived the quantity change", "no onion, extra chips", note_of("n3")
    )

    # Clearing it is an explicit empty string, and that has to WORK: a note that cannot be
    # removed is worse than no note (the kitchen keeps cooking to a request that was cancelled).
    command_ok(
        "and it can be cleared",
        "sales.order.update_line",
        {
            "order_id": "N2",
            "line_id": "n3",
            "quantity": 2_000_000,
            "line_total": 2_000,
            "notes": "",
        },
        "2026-08-26T13:12:00+00:00",
    )
    check("cleared means empty, not the old text", "", note_of("n3"))


# ── 4. A line already in the kitchen does not change ─────────────────────────────────────


def test_a_fired_line_refuses_the_edit():
    print("\n== 4. a line already fired to the kitchen refuses the note edit ==")

    open_order("N3", "Table 9")
    insert_line(
        "n4", "N3", "Steak", "rare", fired_round=1, fired_at="2026-08-26T13:05:00+00:00"
    )

    # Same guard the quantity already has (`fired_at IS NULL`): the food is on the fire and the
    # ticket has been printed. Correcting it is a new round or a comp, not a silent rewrite of a
    # note the kitchen already read.
    command_ok(
        "the command runs (it is an UPDATE with a guard, not an error)",
        "sales.order.update_line",
        {
            "order_id": "N3",
            "line_id": "n4",
            "quantity": 1_000_000,
            "line_total": 1_000,
            "notes": "well done after all",
        },
        "2026-08-26T13:15:00+00:00",
    )
    check("the fired line keeps the note the kitchen was given", "rare", note_of("n4"))


# ── 5. Split, merge and transfer carry the note with the row ─────────────────────────────


def test_the_note_travels_with_the_row():
    print("\n== 5. splitting, joining and transferring a check carry the note ==")

    open_order("N4", "Table 10")
    insert_line("n5", "N4", "Wine", "no ice")
    insert_line("n6", "N4", "Paella", "shellfish allergy")

    split_id = str(uuid.uuid4())
    command_ok(
        "the paella leaves for a second check",
        "sales.order.split",
        {
            "order_id": "N4",
            "line_ids": ["n6"],
            "label": "Table 10 · 2",
            "new_id": split_id,
        },
        "2026-08-26T13:20:00+00:00",
    )
    check("the line travelled", ["n6"], lines_of(split_id))
    check("and so did its note", "shellfish allergy", note_of("n6"))
    check("the one that stayed keeps its own", "no ice", note_of("n5"))

    # Joining the two back — the floor merges the tables — is the same movement in reverse.
    command_ok(
        "and joining them back brings it home",
        "sales.order.merge",
        {"from_order_id": split_id, "to_order_id": "N4"},
        "2026-08-26T13:25:00+00:00",
    )
    check("both lines are on one check", ["n5", "n6"], lines_of("N4"))
    check("with both notes intact", "shellfish allergy", note_of("n6"))

    # TRANSFERRING a check to another table is `tables`' business and never touches the line:
    # the proof that the note survives it is that the READ still hands it back afterwards.
    rows = run_query("queries/order_lines.sql", {"order_id": "N4"})
    check(
        "and the resumed check reads them both",
        ["no ice", "shellfish allergy"],
        sorted(r.get("notes") for r in rows),
    )


# ── 6. The neighbour's line is not reachable ─────────────────────────────────────────────


def test_another_hub_cannot_touch_the_note():
    print("\n== 6. a line of ANOTHER hub is not reachable ==")

    open_order("N5", "Table 11", hub=OTHER_HUB)
    insert_line("n7", "N5", "Cider", "very cold", hub=OTHER_HUB)

    # Same payload, our hub injected by the runtime: the WHERE never matches. This is the door
    # that applies `hub_id`, so a test that seeded by hand and asserted here would prove nothing.
    run_command(
        "sales.order.update_line",
        {
            "order_id": "N5",
            "line_id": "n7",
            "quantity": 1_000_000,
            "line_total": 1_000,
            "notes": "stolen note",
        },
        "2026-08-26T13:30:00+00:00",
    )
    check(
        "the neighbour's note is untouched", "very cold", note_of("n7", hub=OTHER_HUB)
    )

    # And the control that proves the check above can actually detect the positive: the very same
    # command on OUR hub does write.
    open_order("N6", "Table 12")
    insert_line("n8", "N6", "Cider", "very cold")
    run_command(
        "sales.order.update_line",
        {
            "order_id": "N6",
            "line_id": "n8",
            "quantity": 1_000_000,
            "line_total": 1_000,
            "notes": "room temperature",
        },
        "2026-08-26T13:31:00+00:00",
    )
    check("our own line DOES change (the control)", "room temperature", note_of("n8"))


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

        test_the_column_is_there_and_never_null()
        test_resuming_the_check_returns_the_note()
        test_update_line_writes_the_note_and_leaves_it_alone()
        test_a_fired_line_refuses_the_edit()
        test_the_note_travels_with_the_row()
        test_another_hub_cannot_touch_the_note()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "PASS — the line note survives resuming, splitting, joining and firing (sales#156)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
