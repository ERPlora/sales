#!/usr/bin/env python3
"""The business's own open-price DEPARTMENTS end to end (sales#267) — against a REAL Postgres 18.

Why a SQL-level test. The buttons are painted from a catalogue the business writes, and everything
that can go wrong with that catalogue is SQL semantics the browser tests cannot see: which rows a
soft-delete keeps offering, whether another hub's department is reachable, whether two departments
may share one tax category, and — the one that matters — whether an update that matches NOTHING
answers "done". That last one is why the two write commands carry `expect_rows`
(`sales.department_not_found`): a mutation that affects zero rows and answers `200 ok` puts a
change on screen that was never made.

It runs the way the runtime runs it (`execute_tx`): every statement of a manifest command in ONE
transaction, the runtime-injected params bound (`:hub_id`, `:current_user_id`, `:now`, `:new_id`),
and any `:param` absent from the payload bound as NULL, which is what the driver does (`DynNull`,
hub/crates/db/src/lib.rs).

Contract under test:

  1. THE TABLE. `sales_department` carries the hub's row contract — `hub_id`, soft-delete, audit —
     exactly like `sales_quick_note`, the catalogue it is modelled on.
  2. CREATING. `sales.departments.create` writes the row through the module's own command.
  3. READING. `queries/departments_list.sql` gives back this hub's live departments and nothing
     else.
  4. EDITING. `sales.departments.update` changes the name, the VAT it charges and the position.
  5. RETIRING. `sales.departments.delete` is a SOFT delete: the row stays, the till stops offering
     it, and a line ALREADY SOLD keeps the name and the tax category frozen on it — which is what
     makes retiring a department safe for what is already declared.
  6. NOTHING TO TOUCH. Update and delete against another hub's department, or one already retired,
     affect ZERO rows — which is what `expect_rows` turns into a 409 instead of a silent success.
  7. TWO DEPARTMENTS, ONE TAX CATEGORY. «Refrescos y alcohol» and «Droguería» are both 21% in
     Spain. They must BOTH survive: a unique index on `tax_category_key` would collapse them and
     the receipt would name the wrong family.
  8. THE DOORS. Reading is `sales.view_sale` (the till's, sales#205); writing is
     `sales.manage_settings`. A catalogue the cashier cannot read is a button nobody can tap.

Usage: tests/departments.postgres.test.py
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
DB = f"sales_departments_test_{os.getpid()}"
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

NOW = "2026-09-08T13:00:00+00:00"


def affected(sql_file: str, params: dict) -> int:
    """Rows a single command statement touches, run exactly as the runtime binds it.

    This is what `expect_rows` counts. Reading it here is the only way to prove the gate has
    something to fire on: a WHERE that silently matches nothing is indistinguishable from a
    successful write when all you look at is «the command did not raise»."""
    path = MODULE_DIR / sql_file
    bound = bind(path.read_text(), {**params})
    try:
        raw = psql(
            [
                "-tAc",
                f"WITH touched AS ({bound.rstrip().rstrip(';')} RETURNING 1) SELECT count(*) FROM touched",
            ],
            db=DB,
        )
    except RuntimeError as exc:
        failures.append(f"`{sql_file}` failed: {str(exc).splitlines()[0]}")
        print(f"  FAIL: `{sql_file}` failed: {str(exc).splitlines()[0]}")
        return -1
    return int(raw.strip() or 0)


def create_dept(
    dept_id: str, name: str, key: str, sort_order: int, hub: str = HUB
) -> bool:
    return command_ok(
        f"the business adds “{name}”",
        "sales.departments.create",
        {
            "new_id": dept_id,
            "hub_id": hub,
            "name": name,
            "tax_category_key": key,
            "sort_order": sort_order,
        },
        NOW,
    )


# ── 1. The table carries the hub's row contract ──────────────────────────────────────────


def test_the_table_carries_the_row_contract():
    print("\n== 1. sales_department carries hub_id + soft-delete + audit ==")

    for column, kind in [
        ("id", "text"),
        ("hub_id", "text"),
        ("name", "text"),
        ("tax_category_key", "text"),
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
                f"'sales_department' AND column_name = '{column}'"
            ),
        )

    # The only access path the till has is «this hub's live departments, in order».
    check(
        "the read path has its index",
        "1",
        q(
            "SELECT count(*) FROM pg_indexes WHERE tablename = 'sales_department' "
            "AND indexname = 'ix_sales_department_hub'"
        ),
    )


# ── 2 & 3. Creating and reading ──────────────────────────────────────────────────────────


def test_create_then_read_gives_the_catalogue_back():
    print(
        "\n== 2/3. the departments are created by the command and read back in order =="
    )

    create_dept("d-meat", "Carnicería", "product.reduced", 20)
    create_dept("d-veg", "Frutas y verduras", "product.super_reduced", 10)
    create_dept("d-x", "Barra", "restaurant.drink", 10, hub=OTHER_HUB)

    rows_out = run_query("queries/departments_list.sql", {})
    check("only this hub's departments come back", 2, len(rows_out))
    check(
        "and the order the business gave them",
        ["Frutas y verduras", "Carnicería"],
        [r["name"] for r in sorted(rows_out, key=lambda r: r["sort_order"])],
    )
    check(
        "each one carries the VAT it charges",
        "product.super_reduced",
        next((r["tax_category_key"] for r in rows_out if r["id"] == "d-veg"), ""),
    )
    check(
        "the audit trail is filled in",
        USER,
        q("SELECT created_by FROM sales_department WHERE id = 'd-veg'"),
    )


# ── 4. Editing ───────────────────────────────────────────────────────────────────────────


def test_update_changes_the_name_the_vat_and_the_position():
    print(
        "\n== 4. `sales.departments.update` changes the name, the VAT and the position =="
    )

    command_ok(
        "the business renames one and moves it",
        "sales.departments.update",
        {
            "department_id": "d-veg",
            "name": "Frutería",
            "tax_category_key": "product.super_reduced",
            "sort_order": 5,
        },
        "2026-09-08T13:10:00+00:00",
    )
    check(
        "the name is the new one",
        "Frutería",
        q("SELECT name FROM sales_department WHERE id = 'd-veg'"),
    )
    check(
        "and so is the position",
        "5",
        q("SELECT sort_order FROM sales_department WHERE id = 'd-veg'"),
    )
    check(
        "the edit is stamped",
        "2026-09-08T13:10:00+00:00",
        q("SELECT updated_at FROM sales_department WHERE id = 'd-veg'"),
    )

    command_ok(
        "and the VAT it charges can be corrected",
        "sales.departments.update",
        {
            "department_id": "d-meat",
            "name": "Carnicería",
            "tax_category_key": "product.generic",
            "sort_order": 20,
        },
        "2026-09-08T13:11:00+00:00",
    )
    check(
        "the tax category is the new one",
        "product.generic",
        q("SELECT tax_category_key FROM sales_department WHERE id = 'd-meat'"),
    )


# ── 5. Retiring ──────────────────────────────────────────────────────────────────────────


def test_delete_is_soft_and_leaves_what_was_already_sold_alone():
    print(
        "\n== 5. retiring a department stops offering it and rewrites nothing already sold =="
    )

    # A sale line charged through that very department. Its name and its tax category are FROZEN
    # on the line and point nowhere, which is the reason retiring a department is safe at all —
    # and why it cannot rewrite anything already declared to the tax office.
    psql(
        [
            "-c",
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, subtotal, tax_amount, "
            "total, is_deleted, created_by, updated_by, created_at, updated_at) VALUES "
            f"('S1', '{HUB}', 'T-1', 'completed', 340, 14, 354, 0, '{USER}', '{USER}', '{NOW}', '{NOW}')",
        ],
        db=DB,
    )
    psql(
        [
            "-c",
            "INSERT INTO sales_sale_item (id, hub_id, sale_id, product_id, product_name, "
            "quantity, unit_price, line_total, tax_category_key, created_at) VALUES "
            f"('L1', '{HUB}', 'S1', NULL, 'Frutería', 1, 340, 354, 'product.super_reduced', '{NOW}')",
        ],
        db=DB,
    )

    command_ok(
        "the business retires “Frutería”",
        "sales.departments.delete",
        {"department_id": "d-veg"},
        "2026-09-08T13:20:00+00:00",
    )
    check(
        "the row is still there",
        "1",
        q("SELECT count(*) FROM sales_department WHERE id = 'd-veg'"),
    )
    check(
        "marked deleted",
        "1",
        q("SELECT is_deleted FROM sales_department WHERE id = 'd-veg'"),
    )
    check(
        "with the moment it happened",
        "2026-09-08T13:20:00+00:00",
        q("SELECT deleted_at FROM sales_department WHERE id = 'd-veg'"),
    )

    rows_out = run_query("queries/departments_list.sql", {})
    check("the till stops offering it", ["Carnicería"], [r["name"] for r in rows_out])
    check(
        "and the line already sold keeps its name",
        "Frutería",
        q("SELECT product_name FROM sales_sale_item WHERE id = 'L1'"),
    )
    check(
        "and the VAT it was charged with",
        "product.super_reduced",
        q("SELECT tax_category_key FROM sales_sale_item WHERE id = 'L1'"),
    )


# ── 6. Nothing to touch is a FAILURE, not a success ──────────────────────────────────────


def test_a_write_that_matches_nothing_affects_zero_rows():
    print(
        "\n== 6. another hub's department, and one already retired, match ZERO rows =="
    )

    base = {"hub_id": HUB, "current_user_id": USER, "now": "2026-09-08T13:30:00+00:00"}

    check(
        "editing the neighbour's department touches nothing",
        0,
        affected(
            "commands/department_update.sql",
            {
                **base,
                "department_id": "d-x",
                "name": "hijacked",
                "tax_category_key": "product.generic",
                "sort_order": 0,
            },
        ),
    )
    check(
        "and the neighbour's department is untouched",
        "Barra",
        q("SELECT name FROM sales_department WHERE id = 'd-x'"),
    )

    check(
        "deleting the neighbour's department touches nothing",
        0,
        affected("commands/department_delete.sql", {**base, "department_id": "d-x"}),
    )
    check(
        "and it is still live for its own hub",
        "0",
        q("SELECT is_deleted FROM sales_department WHERE id = 'd-x'"),
    )

    check(
        "retiring an already retired department touches nothing",
        0,
        affected("commands/department_delete.sql", {**base, "department_id": "d-veg"}),
    )

    # Zero rows is only harmless because the manifest turns it into a domain error instead of a
    # `200 ok`. Without this the three checks above would be describing a silent no-op.
    for name in ("sales.departments.update", "sales.departments.delete"):
        check(
            f"`{name}` refuses zero rows with a domain code",
            {"op": "min", "n": 1, "error": "sales.department_not_found"},
            MANIFEST["commands"][name].get("expect_rows"),
        )


# ── 7. Two departments may share ONE tax category ────────────────────────────────────────


def test_two_departments_can_share_one_tax_category():
    print(
        "\n== 7. «Refrescos y alcohol» and «Droguería» are both 21% and both survive =="
    )

    create_dept("d-drink", "Refrescos y alcohol", "product.generic", 30)
    create_dept("d-clean", "Droguería", "product.generic", 40)

    rows_out = run_query("queries/departments_list.sql", {})
    same = [r["name"] for r in rows_out if r["tax_category_key"] == "product.generic"]
    check(
        "both 21% departments are offered, each with its own name",
        ["Carnicería", "Droguería", "Refrescos y alcohol"],
        sorted(same),
    )

    # A unique index on `tax_category_key` would collapse them into one and the receipt would name
    # the wrong family. There must not be one.
    check(
        "and nothing makes the tax category unique",
        "0",
        q(
            "SELECT count(*) FROM pg_indexes WHERE tablename = 'sales_department' "
            "AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%tax_category_key%'"
        ),
    )


# ── 8. The doors ─────────────────────────────────────────────────────────────────────────


def test_the_read_is_the_tills_and_the_write_is_the_managers():
    print("\n== 8. the till reads it; only the manager writes it ==")

    check(
        "reading is `sales.view_sale`",
        "sales.view_sale",
        MANIFEST["queries"]["sales.departments.list"]["permission"],
    )
    for name in (
        "sales.departments.create",
        "sales.departments.update",
        "sales.departments.delete",
    ):
        check(
            f"`{name}` is `sales.manage_settings`",
            "sales.manage_settings",
            MANIFEST["commands"][name]["permission"],
        )
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
        test_update_changes_the_name_the_vat_and_the_position()
        test_delete_is_soft_and_leaves_what_was_already_sold_alone()
        test_a_write_that_matches_nothing_affects_zero_rows()
        test_two_departments_can_share_one_tax_category()
        test_the_read_is_the_tills_and_the_write_is_the_managers()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("all green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
