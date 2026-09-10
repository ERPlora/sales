#!/usr/bin/env python3
"""The counter reads the WHOLE shop policy, and only what is policy (sales#203).

`sales.settings.get` is gated by `sales.manage_settings`, which neither `cashier` nor `employee`
holds, so every setting the POS read through it was inert for the two roles that stand at the till
all day: card-only came back as every method, no-discounts as discounts, the shop's own receipt as
a blank one. sales#25 had already opened `sales.pos_settings.get` for four of them; sales#203
widens that same door to the entire operational policy.

The permission itself is the runtime's to enforce — this battery cannot deny anything. What it CAN
check is the half that lives in our SQL, and it is the half that decides whether the fix works at
all against a live column:

  1. THE PROJECTION. Every operational column comes back, with the value the shop saved and not the
     schema default. A field missing here is a switch that goes back to being admin-only, silently.
  2. WHAT STAYS OUT. `id` is row identity, not policy, and `ticket_expiry_hours` and
     `restaurant_mode` have no reader anywhere. A read-only counter query does not hand out more
     than it is read for. (`pos_layout` is not on that list because migration 013 DROPPED it — the
     negative control below is what caught that, and it is why the control is there.)
  3. THE TENANT. Answers THIS hub with a live neighbour holding a different policy in the table.
  4. ABSENCE. No row (and a soft-deleted row) comes back empty, which is what makes the screen fall
     back to the schema defaults instead of borrowing somebody else's configuration.
  5. NEGATIVE CONTROL. The same projection asked of the neighbour returns the NEIGHBOUR's values —
     without it, a query that ignored `:hub_id` would pass every check above.

Usage: tests/pos_settings_read.postgres.test.py
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
DB = f"sales_pos_settings_read_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
COUNTER_READ = "sales.pos_settings.get"

# The policy this shop saved. Every value is the OPPOSITE of the column default, so a field that
# silently fell back to the default cannot pass as read.
CONFIGURED = {
    "allow_cash": 0,
    "allow_card": 0,
    "allow_transfer": 1,
    "sync_products": 0,
    "sync_services": 0,
    "require_customer": 1,
    "allow_discounts": 0,
    # sales#269 — the cap is policy too: the till ROUTES the charge with it, so a counter read that
    # stopped projecting it would leave every ticket going through the cashier's door.
    "max_discount_percent": 10,
    "enable_parked_tickets": 0,
    "default_tax_included": 0,
    "receipt_header": "Pepe Bar\n1 Main Street",
    "receipt_footer": "Thanks for your visit",
    "receipt_footer_image": "data:image/png;base64,AAAA",
    "receipt_marketing_url": "https://g.page/r/review",
    "receipt_marketing_text": "Leave us a review",
    "default_document_format": "invoice",
    "auto_invoice_with_tax_id": 1,
}

# Columns of `sales_settings` the counter must NOT be handed. `id` above all: the singleton's
# primary key is row identity, and the screen that saves against it is the admin's.
WITHHELD = ["id", "ticket_expiry_hours", "restaurant_mode"]

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


# ── Postgres plumbing ────────────────────────────────────────────────────────────────────

DDL_TYPES = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
    "TEXT": "TEXT",
}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)
PARAM = re.compile(r"(?<!:):([a-z_][a-z0-9_]*)", re.IGNORECASE)


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


def apply_migrations() -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        psql(
            [],
            db=DB,
            stdin=DDL_TOKEN.sub(
                lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text()
            ),
        )


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def run_query(name: str, hub: str) -> list[dict]:
    spec = MANIFEST["queries"].get(name)
    if spec is None:
        failures.append(f"query `{name}` is not declared in module.json")
        return []
    sql = (MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";")
    bound = PARAM.sub(lambda m: literal({"hub_id": hub}.get(m.group(1))), sql)
    try:
        raw = psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"], db=DB).strip()
    except RuntimeError as exc:
        failures.append(f"query `{name}` failed: {str(exc).splitlines()[0]}")
        return []
    return json.loads(raw) if raw else []


def insert_settings(row_id: str, hub: str, policy: dict) -> None:
    columns = ["id", "hub_id", "is_deleted", "created_at", "updated_at", *policy]
    values = [
        row_id,
        hub,
        0,
        "2026-08-01T00:00:00+00:00",
        "2026-08-01T00:00:00+00:00",
        *policy.values(),
    ]
    psql(
        [
            "-c",
            f"INSERT INTO sales_settings ({', '.join(columns)}) "
            f"VALUES ({', '.join(literal(v) for v in values)})",
        ],
        db=DB,
    )


# ── The battery ──────────────────────────────────────────────────────────────────────────


def test_the_counter_gets_the_whole_policy_the_shop_saved() -> None:
    print(
        "\n· the counter read carries every operational setting, with the SAVED value"
    )
    mine = run_query(COUNTER_READ, hub=HUB)
    check("exactly one row", len(mine), 1)
    if not mine:
        return
    row = mine[0]
    for column, want in CONFIGURED.items():
        check(f"{column} comes back as the shop saved it", row.get(column), want)


def test_what_is_not_policy_stays_out() -> None:
    print("\n· the counter read hands out nothing that is not policy")
    mine = run_query(COUNTER_READ, hub=HUB)
    if not mine:
        return
    for column in WITHHELD:
        check(f"{column} is not served to the counter", column in mine[0], False)
    # And the control that gives the four checks above their meaning: the column really EXISTS in
    # the table, so "absent from the answer" means withheld and not misspelled.
    live = psql(
        [
            "-tAc",
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_settings'",
        ],
        db=DB,
    ).split()
    for column in WITHHELD:
        check(
            f"{column} does exist in sales_settings (so the check above means something)",
            column in live,
            True,
        )


def test_the_policy_is_scoped_to_the_asking_hub() -> None:
    print(
        "\n· the policy is THIS hub's, with a live neighbour holding the opposite one"
    )
    theirs = run_query(COUNTER_READ, hub=OTHER_HUB)
    check("the neighbour has a row too", len(theirs), 1)
    if not theirs:
        return
    # The neighbour saved the defaults; this hub saved their opposite. A query that ignored
    # `:hub_id` would answer one of them for both.
    check("the neighbour keeps cash", theirs[0]["allow_cash"], 1)
    check("the neighbour keeps discounts", theirs[0]["allow_discounts"], 1)
    check(
        "the neighbour keeps its own receipt header",
        theirs[0]["receipt_header"],
        "Neighbour SL",
    )


def test_absence_is_answered_as_absence() -> None:
    print("\n· no row, and a soft-deleted row, come back empty")
    check(
        "a hub that never saved settings gets no row",
        run_query(COUNTER_READ, hub="hub-brand-new"),
        [],
    )
    psql(
        ["-c", f"UPDATE sales_settings SET is_deleted = 1 WHERE hub_id = '{HUB}'"],
        db=DB,
    )
    check("a soft-deleted policy is not served", run_query(COUNTER_READ, hub=HUB), [])


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print(
        f"Postgres battery · the counter's settings read (sales#203) · db {DB} · container {CONTAINER}"
    )
    psql(["-c", f'CREATE DATABASE "{DB}"'])
    try:
        apply_migrations()
        insert_settings("s-mine", HUB, CONFIGURED)
        insert_settings("s-theirs", OTHER_HUB, {"receipt_header": "Neighbour SL"})
        test_the_counter_gets_the_whole_policy_the_shop_saved()
        test_what_is_not_policy_stays_out()
        test_the_policy_is_scoped_to_the_asking_hub()
        test_absence_is_answered_as_absence()
    finally:
        psql(["-c", f'DROP DATABASE IF EXISTS "{DB}" WITH (FORCE)'])

    print()
    if failures:
        print(f"✗ {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ the counter reads the whole shop policy, its own hub's, and nothing that is not policy"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
