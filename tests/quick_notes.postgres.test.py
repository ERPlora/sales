#!/usr/bin/env python3
"""The configurable QUICK NOTES end to end (sales#206) — against a REAL Postgres 18 in Docker.

Why a SQL-level test. The chips are painted from a catalogue the business writes, and everything
that can go wrong with that catalogue is SQL semantics the browser tests cannot see: which rows a
soft-delete keeps offering, whether another hub's note is reachable, and — the one that matters —
whether an update that matches NOTHING answers "done". That last one is why the two write commands
carry `expect_rows` (`sales.quick_note_not_found`): a mutation that affects zero rows and answers
`200 ok` puts a change on screen that was never made.

It runs the way the runtime runs it (`execute_tx`): every statement of a manifest command in ONE
transaction, the runtime-injected params bound (`:hub_id`, `:current_user_id`, `:now`, `:new_id`),
and any `:param` absent from the payload bound as NULL, which is what the driver does (`DynNull`,
hub/crates/db/src/lib.rs).

Contract under test:

  1. THE TABLE. `sales_quick_note` carries the hub's row contract — `hub_id`, soft-delete, audit —
     exactly like `sales_payment_method`, the catalogue it is modelled on.
  2. CREATING. `sales.quick_notes.create` writes the row through the module's own command.
  3. READING. `queries/quick_notes_list.sql` gives back this hub's live notes and nothing else.
  4. EDITING. `sales.quick_notes.update` changes the text and the position.
  5. RETIRING. `sales.quick_notes.delete` is a SOFT delete: the row stays, the list stops offering
     it, and a note already typed on a check keeps its text — it is text on its own row, it does
     not point here, so retiring a chip never rewrites what the kitchen was told.
  6. NOTHING TO TOUCH. Update and delete against a note of ANOTHER hub, or one already retired,
     affect ZERO rows — which is what `expect_rows` turns into a 409 instead of a silent success.
  7. THE DOORS. Reading is `sales.view_sale` (the till's, sales#205); writing is
     `sales.manage_settings`. A catalogue the cashier cannot read is a chip nobody can tap.

Usage: tests/quick_notes.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_quick_notes_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-manager"

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


def affected(sql_file: str, params: dict) -> int:
    """Rows a single command statement touches, run exactly as the runtime binds it.

    This is what `expect_rows` counts. Reading it here is the only way to prove the gate has
    something to fire on: a WHERE that silently matches nothing is indistinguishable from a
    successful write when all you look at is «the command did not raise»."""
    path = MODULE_DIR / sql_file
    bound = bind(path.read_text(), {**params})
    try:
        raw = psql(["-tAc", f"WITH touched AS ({bound.rstrip().rstrip(';')} RETURNING 1) SELECT count(*) FROM touched"], db=DB)
    except RuntimeError as exc:
        failures.append(f"`{sql_file}` failed: {str(exc).splitlines()[0]}")
        print(f"  FAIL: `{sql_file}` failed: {str(exc).splitlines()[0]}")
        return -1
    return int(raw.strip() or 0)


def create_note(note_id: str, text: str, sort_order: int, hub: str = HUB) -> bool:
    return command_ok(
        f"the business adds “{text}”",
        "sales.quick_notes.create",
        {"new_id": note_id, "hub_id": hub, "text": text, "sort_order": sort_order},
        NOW,
    )


# ── 1. The table carries the hub's row contract ──────────────────────────────────────────


def test_the_table_carries_the_row_contract():
    print("\n== 1. sales_quick_note carries hub_id + soft-delete + audit ==")

    for column, kind in [
        ("id", "text"),
        ("hub_id", "text"),
        ("text", "text"),
        ("sort_order", "bigint"),
        ("is_deleted", "bigint"),
        ("deleted_at", "text"),
        ("created_by", "text"),
        ("updated_by", "text"),
        ("created_at", "text"),
        ("updated_at", "text"),
    ]:
        check(
            f"`{column}` is {kind}",
            kind,
            q(
                "SELECT data_type FROM information_schema.columns WHERE table_name = "
                f"'sales_quick_note' AND column_name = '{column}'"
            ),
        )

    # The only access path the till has is «this hub's live notes, in order», so that is the index.
    check(
        "the read path has its index",
        "1",
        q(
            "SELECT count(*) FROM pg_indexes WHERE tablename = 'sales_quick_note' "
            "AND indexname = 'ix_sales_quick_note_hub'"
        ),
    )


# ── 2 & 3. Creating and reading ──────────────────────────────────────────────────────────


def test_create_then_read_gives_the_catalogue_back():
    print("\n== 2/3. the notes are created by the command and read back in order ==")

    create_note("qn-2", "no salt", 20)
    create_note("qn-1", "medium rare", 10)
    create_note("qn-x", "sin hielo", 30, hub=OTHER_HUB)

    rows_out = run_query("queries/quick_notes_list.sql", {})
    check("only this hub's notes come back", 2, len(rows_out))
    check(
        "and the order the business gave them",
        ["medium rare", "no salt"],
        [r["text"] for r in sorted(rows_out, key=lambda r: r["sort_order"])],
    )
    check("the audit trail is filled in", USER, q("SELECT created_by FROM sales_quick_note WHERE id = 'qn-1'"))


# ── 4. Editing ───────────────────────────────────────────────────────────────────────────


def test_update_changes_the_text_and_the_position():
    print("\n== 4. `sales.quick_notes.update` changes the text and where the chip sits ==")

    command_ok(
        "the business rewords a note",
        "sales.quick_notes.update",
        {"quick_note_id": "qn-1", "text": "very rare", "sort_order": 5},
        "2026-08-26T13:10:00+00:00",
    )
    check("the text is the new one", "very rare", q("SELECT text FROM sales_quick_note WHERE id = 'qn-1'"))
    check("and so is the position", "5", q("SELECT sort_order FROM sales_quick_note WHERE id = 'qn-1'"))
    check(
        "the edit is stamped",
        "2026-08-26T13:10:00+00:00",
        q("SELECT updated_at FROM sales_quick_note WHERE id = 'qn-1'"),
    )


# ── 5. Retiring ──────────────────────────────────────────────────────────────────────────


def test_delete_is_soft_and_leaves_the_notes_already_typed_alone():
    print("\n== 5. retiring a chip stops offering it and rewrites nothing already said ==")

    # A line that was annotated with that very text. It is TEXT on its own row and points nowhere,
    # which is the reason retiring a chip is safe at all.
    psql(
        [
            "-c",
            "INSERT INTO sales_order (id, hub_id, status, provisional_total, notes, label, "
            "source_module, is_deleted, created_by, updated_by, created_at, updated_at) VALUES "
            f"('O1', '{HUB}', 'open', 0, '', 'Table 3', 'pos', 0, '{USER}', '{USER}', '{NOW}', '{NOW}')",
        ],
        db=DB,
    )
    psql(
        [
            "-c",
            "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name, "
            "quantity, unit_price, line_total, notes, is_deleted, created_by, updated_by, "
            f"created_at, updated_at) VALUES ('L1', '{HUB}', 'O1', 'p-1', 'Entrecote', 1000000, "
            f"1000, 1000, 'no salt', 0, '{USER}', '{USER}', '{NOW}', '{NOW}')",
        ],
        db=DB,
    )

    command_ok(
        "the business retires “no salt”",
        "sales.quick_notes.delete",
        {"quick_note_id": "qn-2"},
        "2026-08-26T13:20:00+00:00",
    )
    check("the row is still there", "1", q("SELECT count(*) FROM sales_quick_note WHERE id = 'qn-2'"))
    check("marked deleted", "1", q("SELECT is_deleted FROM sales_quick_note WHERE id = 'qn-2'"))
    check(
        "with the moment it happened",
        "2026-08-26T13:20:00+00:00",
        q("SELECT deleted_at FROM sales_quick_note WHERE id = 'qn-2'"),
    )

    rows_out = run_query("queries/quick_notes_list.sql", {})
    check("the till stops offering it", ["very rare"], [r["text"] for r in rows_out])
    check("and the line keeps what the waiter typed", "no salt", q("SELECT notes FROM sales_order_item WHERE id = 'L1'"))


# ── 6. Nothing to touch is a FAILURE, not a success ──────────────────────────────────────


def test_a_write_that_matches_nothing_affects_zero_rows():
    print("\n== 6. another hub's note, and one already retired, match ZERO rows ==")

    base = {"hub_id": HUB, "current_user_id": USER, "now": "2026-08-26T13:30:00+00:00"}

    check(
        "editing the neighbour's note touches nothing",
        0,
        affected("commands/quick_note_update.sql", {**base, "quick_note_id": "qn-x", "text": "hijacked", "sort_order": 0}),
    )
    check("and the neighbour's note is untouched", "sin hielo", q(f"SELECT text FROM sales_quick_note WHERE id = 'qn-x'"))

    check(
        "deleting the neighbour's note touches nothing",
        0,
        affected("commands/quick_note_delete.sql", {**base, "quick_note_id": "qn-x"}),
    )
    check("and it is still live for its own hub", "0", q("SELECT is_deleted FROM sales_quick_note WHERE id = 'qn-x'"))

    check(
        "retiring an already retired note touches nothing",
        0,
        affected("commands/quick_note_delete.sql", {**base, "quick_note_id": "qn-2"}),
    )

    # Zero rows is only harmless because the manifest turns it into a domain error instead of a
    # `200 ok`. Without this the three checks above would be describing a silent no-op.
    for name in ("sales.quick_notes.update", "sales.quick_notes.delete"):
        check(
            f"`{name}` refuses zero rows with a domain code",
            {"op": "min", "n": 1, "error": "sales.quick_note_not_found"},
            MANIFEST["commands"][name].get("expect_rows"),
        )


# ── 7. The doors ─────────────────────────────────────────────────────────────────────────


def test_the_read_is_the_tills_and_the_write_is_the_managers():
    print("\n== 7. the till reads it; only the manager writes it ==")

    check(
        "reading is `sales.view_sale`",
        "sales.view_sale",
        MANIFEST["queries"]["sales.quick_notes.list"]["permission"],
    )
    for name in ("sales.quick_notes.create", "sales.quick_notes.update", "sales.quick_notes.delete"):
        check(f"`{name}` is `sales.manage_settings`", "sales.manage_settings", MANIFEST["commands"][name]["permission"])
    check(
        "and the cashier holds the read permission",
        True,
        "sales.view_sale" in MANIFEST["role_permissions"]["cashier"],
    )
    check(
        "but not the write one",
        False,
        "sales.manage_settings" in MANIFEST["role_permissions"]["cashier"],
    )


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

        test_the_table_carries_the_row_contract()
        test_create_then_read_gives_the_catalogue_back()
        test_update_changes_the_text_and_the_position()
        test_delete_is_soft_and_leaves_the_notes_already_typed_alone()
        test_a_write_that_matches_nothing_affects_zero_rows()
        test_the_read_is_the_tills_and_the_write_is_the_managers()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the quick notes are created, read, edited and retired, and a write that matches nothing fails (sales#206)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
