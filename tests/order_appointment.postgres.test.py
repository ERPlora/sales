#!/usr/bin/env python3
"""The BOOKING carried by the check (sales#280) — runs against a REAL Postgres 18 in Docker.

Why a SQL-level test. The screen half of this fix is covered by
`ui/components/erp-pos-touch/erp-pos-appointment-remount.test.ts`, but that suite talks to a
double: it can prove the till ASKS for the link and reads it back, and it cannot prove the link
lands anywhere. The column, the guard on the command and — above all — the fact that
`queries/orders_list.sql` still SELECTs `appointment_id` are invisible to it. Drop that one field
from the query and every browser test stays green while, in a real salon, the check comes back
from the server with no booking on it and the agenda keeps showing the haircut as unpaid.

So this is the guard for the half that only Postgres can answer.

Contract under test:

  1. THE COLUMN. `sales_order.appointment_id` is TEXT and NULLable: a check opened before the
     migration — or one that never came from the agenda — reads back as "no booking", which is
     what travels to checkout as `null`.
  2. THE LINK. `sales.order.set_appointment` writes it on an OPEN check, and stamps the audit
     columns like every other write.
  3. RESUMING. `queries/orders_list.sql` gives the booking back with the check. This is the point
     of the whole change: the copy of the till that charges is almost never the copy that armed
     the check.
  4. RELEASING. Writing NULL clears it, so a check that is no longer somebody's booking stops
     closing it (appointments#154, at the layer where it persists).
  5. A CHARGED CHECK IS CLOSED. `completed`/`voided`/soft-deleted rows do not change booking:
     re-pointing a sale that is already in the fiscal chain is exactly what ADR-0141 forbids.
  6. TENANCY. Another hub's check is not reachable, not even knowing its id.

Usage: tests/order_appointment.postgres.test.py
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
DB = f"sales_order_appointment_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-cashier"
OTHER_USER = "u-opener"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


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
    """Scalar query against the scratch DB. A missing relation/column is a RED result, not a
    crash: the run must report every acceptance point, not stop at the first one."""
    try:
        return psql(["-tAc", sql], db=DB).strip()
    except RuntimeError as exc:
        return f"<sql error: {str(exc).splitlines()[0]}>"


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
        lambda m: (m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))),
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
        return False, f"command `{name}` declares no sql[] (handler `{cmd.get('handler')}`)"

    params = dict(payload)
    params.setdefault("hub_id", HUB)
    params.setdefault("current_user_id", USER)
    params.setdefault("now", now)

    script = ["BEGIN;"]
    for rel in files:
        path = MODULE_DIR / rel
        if not path.exists():
            return False, f"`{name}` declares `{rel}`, which does not exist"
        script.append(bind(path.read_text(), dict(params)))
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

NOW = "2026-09-10T13:00:00+00:00"
LATER = "2026-09-10T13:05:00+00:00"


def open_order(
    order_id: str,
    hub: str = HUB,
    status: str = "open",
    is_deleted: int = 0,
    appointment_id: str | None = None,
) -> None:
    """A check on the server. Written by hand on purpose: `sales.order.open` is a WASM handler, so
    there is no `sql[]` to replay here — and what this battery is about is the column, not who
    filled it."""
    psql(
        [
            "-c",
            "INSERT INTO sales_order (id, hub_id, status, provisional_total, notes, label, "
            "source_module, appointment_id, is_deleted, created_by, updated_by, created_at, "
            f"updated_at) VALUES ('{order_id}', '{hub}', '{status}', 0, '', '', 'pos', "
            f"{literal(appointment_id)}, {is_deleted}, '{OTHER_USER}', '{OTHER_USER}', "
            f"'{NOW}', '{NOW}')",
        ],
        db=DB,
    )


def booking_of(order_id: str, hub: str = HUB) -> str:
    return q(
        f"SELECT COALESCE(appointment_id, '<none>') FROM sales_order "
        f"WHERE id = '{order_id}' AND hub_id = '{hub}'"
    )


# ── The acceptance points ────────────────────────────────────────────────────────────────


def test_the_column_is_there_and_is_optional():
    print("\n1. The column — TEXT, NULLable, and 'no booking' by default")
    check(
        "sales_order.appointment_id is TEXT",
        "text",
        q(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'sales_order' AND column_name = 'appointment_id'"
        ),
    )
    check(
        "it is optional — a check that never came from the agenda is not an error",
        "YES",
        q(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'sales_order' AND column_name = 'appointment_id'"
        ),
    )
    open_order("ord-walkin")
    check("a walk-in check has no booking on it", "<none>", booking_of("ord-walkin"))


def test_the_link_is_written_on_an_open_check():
    print("\n2. The link — `sales.order.set_appointment` on an OPEN check")
    open_order("ord-ana")
    command_ok(
        "the agenda's check is linked to its booking",
        "sales.order.set_appointment",
        {"order_id": "ord-ana", "appointment_id": "ap-ana"},
        LATER,
    )
    check("the booking is on the check", "ap-ana", booking_of("ord-ana"))
    # `updated_at` is TEXT and keeps the ISO string the runtime injects, verbatim (ADR-0007).
    check(
        "and the write is attributed, like every other one",
        f"{USER}|{LATER}",
        q("SELECT updated_by || '|' || updated_at FROM sales_order WHERE id = 'ord-ana'"),
    )


def test_resuming_the_check_gives_the_booking_back():
    print("\n3. Resuming — `queries/orders_list.sql` hands the booking over with the check")
    rows = run_query("queries/orders_list.sql", {})
    by_id = {r["id"]: r for r in rows}
    if "ord-ana" not in by_id:
        failures.append("the linked check is not in `orders_list.sql`")
        print("  FAIL: the linked check is not in `orders_list.sql`")
        return
    check(
        "the list SELECTs appointment_id — without this the till gets the check back with no "
        "booking and the agenda never closes",
        "ap-ana",
        by_id["ord-ana"].get("appointment_id"),
    )
    check(
        "and a walk-in check comes back with none, not with somebody else's",
        None,
        by_id["ord-walkin"].get("appointment_id"),
    )


def test_releasing_the_check_clears_the_booking():
    print("\n4. Releasing — a check that is no longer a booking stops closing one")
    command_ok(
        "the booking is released",
        "sales.order.set_appointment",
        {"order_id": "ord-ana", "appointment_id": None},
        LATER,
    )
    check("nothing is left pointing at Ana's booking", "<none>", booking_of("ord-ana"))


def test_a_check_that_is_no_longer_open_keeps_its_booking():
    print("\n5. A charged, voided or deleted check does not change booking")
    for order_id, status, deleted in [
        ("ord-done", "completed", 0),
        ("ord-void", "voided", 0),
        ("ord-gone", "open", 1),
    ]:
        open_order(order_id, status=status, is_deleted=deleted, appointment_id="ap-old")
        run_command(
            "sales.order.set_appointment",
            {"order_id": order_id, "appointment_id": "ap-someone-else"},
            LATER,
        )
        check(
            f"`{status}`{' + deleted' if deleted else ''} keeps the booking it was charged with",
            "ap-old",
            booking_of(order_id),
        )


def test_another_hub_cannot_link_the_check():
    print("\n6. Tenancy — the neighbour's check is not reachable")
    open_order("ord-neighbour", hub=OTHER_HUB)
    run_command(
        "sales.order.set_appointment",
        {"order_id": "ord-neighbour", "appointment_id": "ap-ana"},
        LATER,
    )
    check(
        "the neighbour's check is untouched even knowing its id",
        "<none>",
        booking_of("ord-neighbour", hub=OTHER_HUB),
    )
    # The positive of the same probe: the command DOES work here, so a green line above is the
    # tenancy filter and not a typo in the fixture.
    open_order("ord-mine")
    run_command(
        "sales.order.set_appointment",
        {"order_id": "ord-mine", "appointment_id": "ap-ana"},
        LATER,
    )
    check("...and the same call on our own check does land", "ap-ana", booking_of("ord-mine"))


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

        test_the_column_is_there_and_is_optional()
        test_the_link_is_written_on_an_open_check()
        test_resuming_the_check_gives_the_booking_back()
        test_releasing_the_check_clears_the_booking()
        test_a_check_that_is_no_longer_open_keeps_its_booking()
        test_another_hub_cannot_link_the_check()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the booking travels with the CHECK, not with the screen (sales#280)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
