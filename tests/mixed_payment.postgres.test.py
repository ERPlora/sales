#!/usr/bin/env python3
"""Mixed payment — the child table of tenders (sales#158 / ADR-0386), against a REAL Postgres 18.

Why a SQL-level battery on top of the handler's unit tests: the handler decides HOW the money is
split, but the split only survives if the row it lands in really exists, really carries the hub's
row contract, and is really reachable by the door that reads it back. Those three are schema
facts, and the only way to check a schema fact is to run it.

What is under test, and why each point is here:

  1. THE TABLE. `sales_sale_payment` exists with the hub row contract (`hub_id`, soft-delete,
     audit). A child table without `hub_id` is a tenancy hole, and one without soft-delete cannot
     be corrected without deleting fiscal-adjacent history.

  2. THE DOOR. `sales._insert_payment` — the manifest command the handler emits — binds and runs
     exactly as the runtime runs it (`execute_tx`: one transaction, system params injected). A
     statement Postgres cannot PREPARE is a command that does not exist in any hub (ADR-0154).

  3. TENANCY. Two hubs, the same sale id: reading through `sales.payments` must never show the
     neighbour's leg. Seeded through the enforcing door, with a LIVE neighbour — a scoping test
     without a neighbour proves nothing.

  4. THE COUNT (`cash_register`). The claim ADR-0386 makes is that the drawer needs no schema
     change: `expected_cash` already sums `WHERE payment_method_type = 'cash'` across N movements.
     Reproduced here over the legs of a mixed sale: of 121,00 € charged as 50,00 € card +
     71,00 € cash (90,00 € handed over), only 71,00 € is drawer money. The 19,00 € of change is
     booked against the CASH leg, so cash-in minus change is the 71,00 € that stayed in the till.

     ⚠️ This proves the DATA supports the count. It does NOT prove `cash_register` posts one
     movement per leg — it does not, yet: `record_sale` still books ONE movement for the whole
     total with the principal tender's type (ERPlora/cash_register#…, opened with this PR). That
     fan-out has to land before the mixed-payment SCREEN (sales#159) ships, or a card+cash sale
     books its card half into the drawer.

Money contract: ADR-0123 (integer cents). Nothing here divides an amount — each leg carries the
cents it was charged — so there is no allocation to round.

Usage: tests/mixed_payment.postgres.test.py
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
DB = f"sales_mixed_payment_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-cashier"
SALE = "sale-1"
OTHER_SALE = "sale-next-door"

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


def seed_sale(sale_id: str = SALE, hub: str = HUB) -> None:
    psql(
        ["-c", bind(
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted, created_at, updated_at)"
            " VALUES (:id, :hub_id, '20260824-0001', 'completed', 12100, 0, :now, :now)",
            {"id": sale_id, "hub_id": hub, "now": "2026-08-24T10:00:00+00:00"},
        )],
        db=DB,
    )


# ── 1 · the table and its row contract ───────────────────────────────────────────────────


def test_the_table_carries_the_hub_row_contract() -> None:
    print("\n1 · sales_sale_payment exists with the hub row contract")
    cols = {
        c
        for c in q(
            "SELECT string_agg(column_name, ',') FROM information_schema.columns"
            " WHERE table_name = 'sales_sale_payment'"
        ).split(",")
        if c
    }
    for col in (
        "id", "hub_id", "sale_id", "sort_order",
        "payment_method_id", "payment_method_name", "payment_method_type",
        "amount", "amount_tendered", "change_due", "reference",
        "is_deleted", "deleted_at", "created_by", "updated_by", "created_at", "updated_at",
    ):
        check(f"column `{col}`", col in cols, True)

    # Money is BIGINT cents (ADR-0007/0123), never a float: a REAL column would silently round a
    # leg and the legs would stop adding up to the total.
    for col in ("amount", "amount_tendered", "change_due"):
        check(
            f"`{col}` is bigint (cents)",
            q(
                "SELECT data_type FROM information_schema.columns"
                f" WHERE table_name='sales_sale_payment' AND column_name='{col}'"
            ),
            "bigint",
        )
    check(
        "`hub_id` is NOT NULL",
        q(
            "SELECT is_nullable FROM information_schema.columns"
            " WHERE table_name='sales_sale_payment' AND column_name='hub_id'"
        ),
        "NO",
    )


# ── 2 · the door the handler actually calls ──────────────────────────────────────────────


def test_the_insert_command_runs_the_way_the_runtime_runs_it() -> None:
    print("\n2 · sales._insert_payment binds and inserts")
    seed_sale()
    ok, err = run_command(
        "sales._insert_payment",
        {
            "payment_id": "pay-1",
            "sale_id": SALE,
            "sort_order": 0,
            "payment_method_id": "pm-card",
            "payment_method_name": "Tarjeta",
            "payment_method_type": "card",
            "amount": 5000,
            "amount_tendered": 5000,
            "change_due": 0,
            "reference": "AUTH-7788",
        },
    )
    check("the command runs", (ok, err), (True, ""))
    check("the row is there", qi(f"SELECT count(*) FROM sales_sale_payment WHERE id='pay-1'"), 1)
    check(
        "the hub is stamped by the runtime, not by the caller",
        q("SELECT hub_id FROM sales_sale_payment WHERE id='pay-1'"),
        HUB,
    )
    check("soft-delete starts closed", qi("SELECT is_deleted FROM sales_sale_payment WHERE id='pay-1'"), 0)
    check(
        "audit is stamped",
        q("SELECT created_by || '|' || updated_by FROM sales_sale_payment WHERE id='pay-1'"),
        f"{USER}|{USER}",
    )
    check("the reference survives", q("SELECT reference FROM sales_sale_payment WHERE id='pay-1'"), "AUTH-7788")


# ── 3 · tenancy, with a LIVE neighbour ───────────────────────────────────────────────────


def test_a_neighbour_hub_never_shows_up() -> None:
    print("\n3 · the neighbouring hub's leg is invisible")
    # A LIVE neighbour with a real sale of its own. `sales_sale.id` is globally unique (UUIDs), so
    # the leak to guard against is not an id collision — it is knowing the OTHER hub's sale id and
    # reading its payments through our own session. That is what this checks.
    seed_sale(OTHER_SALE, OTHER_HUB)
    ok, err = run_command(
        "sales._insert_payment",
        {
            "payment_id": "pay-neighbour",
            "sale_id": OTHER_SALE,
            "sort_order": 0,
            "payment_method_id": "pm-cash",
            "payment_method_name": "Efectivo",
            "payment_method_type": "cash",
            "amount": 999_99,
            "amount_tendered": 999_99,
            "change_due": 0,
            "reference": "",
        },
        hub=OTHER_HUB,
    )
    check("the neighbour's leg was really written", (ok, err), (True, ""))
    check(
        "and it really is live next door",
        qi(f"SELECT count(*) FROM sales_sale_payment WHERE hub_id='{OTHER_HUB}'"),
        1,
    )

    rows = run_query("sales.payments", {"sale_id": SALE})
    check("only this hub's legs come back", sorted(r["id"] for r in rows), ["pay-1"])
    check("and the amount is not the neighbour's", sum(r["amount"] for r in rows), 5000)

    # 🔴 The door, asked directly for the neighbour's sale id. Without `hub_id` in the WHERE this
    # returns the neighbour's 999,99 € — a tenancy hole that a same-hub-only test never sees.
    leaked = run_query("sales.payments", {"sale_id": OTHER_SALE})
    check("asking for the neighbour's sale id leaks nothing", leaked, [])

    # And the control that proves the check above can actually SEE something: the same query, from
    # the hub that owns it, does return the row. A scoping assertion that passes because the query
    # is broken proves nothing.
    owned = run_query("sales.payments", {"sale_id": OTHER_SALE}, hub=OTHER_HUB)
    check("positive control — its owner does see it", [r["id"] for r in owned], ["pay-neighbour"])


# ── 4 · the count: only the cash leg is drawer money ─────────────────────────────────────


def test_only_the_cash_leg_reaches_the_drawer() -> None:
    print("\n4 · a mixed sale: only the cash leg is drawer money")
    # 121,00 € = 50,00 € card (already inserted above) + 71,00 € cash, 90,00 € handed over.
    ok, err = run_command(
        "sales._insert_payment",
        {
            "payment_id": "pay-2",
            "sale_id": SALE,
            "sort_order": 1,
            "payment_method_id": "pm-cash",
            "payment_method_name": "Efectivo",
            "payment_method_type": "cash",
            "amount": 7100,
            "amount_tendered": 9000,
            "change_due": 1900,
            "reference": "",
        },
    )
    check("the cash leg is written", (ok, err), (True, ""))

    rows = run_query("sales.payments", {"sale_id": SALE})
    check("both legs come back, in order", [r["sort_order"] for r in rows], [0, 1])
    check("and they add up to the sale total", sum(r["amount"] for r in rows), 12100)

    # The very filter `cash_register.session.summary` applies to `expected_cash` (hub#778): the
    # canonical TYPE, never the localized name — «Efectivo» and «Cash» are the same `cash`.
    drawer = qi(
        "SELECT COALESCE(SUM(amount), 0) FROM sales_sale_payment"
        f" WHERE hub_id='{HUB}' AND sale_id='{SALE}' AND is_deleted = 0"
        " AND COALESCE(payment_method_type,'cash') = 'cash'"
    )
    check("only 71,00 € is drawer money (the card half never entered)", drawer, 7100)

    # The change came out of the drawer, so cash handed in minus change is what stayed in it.
    stayed = qi(
        "SELECT COALESCE(SUM(amount_tendered - change_due), 0) FROM sales_sale_payment"
        f" WHERE hub_id='{HUB}' AND sale_id='{SALE}' AND is_deleted = 0"
        " AND COALESCE(payment_method_type,'cash') = 'cash'"
    )
    check("cash in minus change = the cash leg", stayed, 7100)

    # 🔴 The Odoo bug (PR#194284), stated as a schema fact: the change is on the CASH leg and
    # nowhere else. Prorating it onto the card leg is what makes the receipt and the database
    # disagree, and it is exactly what this assertion forbids.
    check(
        "no change is booked against a non-cash leg",
        qi(
            "SELECT COUNT(*) FROM sales_sale_payment"
            f" WHERE hub_id='{HUB}' AND change_due <> 0"
            " AND COALESCE(payment_method_type,'cash') <> 'cash'"
        ),
        0,
    )


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
        test_the_table_carries_the_hub_row_contract()
        test_the_insert_command_runs_the_way_the_runtime_runs_it()
        test_a_neighbour_hub_never_shows_up()
        test_only_the_cash_leg_reaches_the_drawer()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — one sale, N tenders: the legs are rows, scoped by hub, and only cash is drawer money (sales#158)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
