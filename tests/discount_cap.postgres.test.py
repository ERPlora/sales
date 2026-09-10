#!/usr/bin/env python3
"""The cap the shop sets on a discount survives the round trip (sales#269) — real Postgres in Docker.

Anyone who could charge could take 100 % off a ticket and cash it. The control the trade uses is a
threshold: up to X whoever is charging decides, above X the manager approves. `max_discount_percent`
is that threshold, and it is enforced by the handler — which does not hold it in memory: it READS it
back, every checkout, through `sales.settings.get` (its declared `reads`).

That read is the whole reason this battery exists. A cap that is saved and not projected is not a
cap that works badly: it is a cap that is ALWAYS 100 — every ticket walks through the cashier's door
and the control is dead, with the settings screen still showing the 10 the owner typed. The very
same shape as sales#148 (charged, written and unreadable), and the sort of thing no unit test sees,
because both sides of it agree in memory.

Contract under test:

  1. THE DEFAULT IS NO CAP. A shop that updates from a version without the column keeps behaving
     exactly as it did. Nobody starts being asked for a PIN they never configured — the control is
     opted IN. The column is NOT NULL DEFAULT 100, so the row written before it existed reads 100.

  2. THE WRITE DOOR. `sales.settings.update` — the one the settings screen saves through — stores
     the cap on the singleton, on the row that is already there.

  3. THE HANDLER'S READ. `sales.settings.get` gives it back. This is the query the WASM handler
     names in its `reads`; the cap it enforces is whatever comes out of here.

  4. THE COUNTER'S READ. `sales.pos_settings.get` gives it back too, through the door a `cashier`
     can open. The till routes the charge with it (`ui/lib/discount-cap.ts`), and routing off a
     query the cashier cannot read would mean the screen decides one thing and the server another
     — for the manager only, which is invisible to whoever tests it.

  5. ZERO IS A VALUE. «No discount at all without the manager» is a shop's choice, not absence, and
     it must not fall back to 100. It is the one value where a `COALESCE`-shaped bug is silent.

  6. TENANCY. The neighbour's cap is not ours, in either direction, through either door.

Usage: tests/discount_cap.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import MANIFEST, Session

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-owner"
NOW = "2026-09-10T10:00:00+00:00"

COUNTER_READ = "sales.pos_settings.get"
HANDLER_READ = "sales.settings.get"

# The rest of the policy, which the settings screen always sends whole (the upsert binds every
# column, and a NOT NULL column bound NULL is how a save turns into a traceback).
POLICY = {
    "allow_cash": 1,
    "allow_card": 1,
    "allow_transfer": 0,
    "sync_products": 1,
    "sync_services": 1,
    "require_customer": 0,
    "allow_discounts": 1,
    "enable_parked_tickets": 1,
    "default_tax_included": 1,
    "receipt_header": "",
    "receipt_footer": "",
    "receipt_footer_image": "",
    "receipt_marketing_url": "",
    "receipt_marketing_text": "",
    "default_document_format": "ticket",
    "auto_invoice_with_tax_id": 0,
}


def save_policy(s: Session, row_id: str, cap: int, hub: str | None = None) -> bool:
    """The settings screen saving, through the manifest command and nothing else."""
    return s.command_ok(
        f"the shop saves a {cap} % cap" + (f" (hub {hub})" if hub else ""),
        "sales.settings.update",
        {"new_id": row_id, **POLICY, "max_discount_percent": cap},
        hub=hub,
    )


def cap_through(s: Session, query: str, hub: str | None = None):
    """The cap as that door hands it back — `<absent>` when the column is not projected at all,
    which is a different failure from a wrong number and has to read as one."""
    rows = s.query(query, {}, hub=hub)
    if not rows:
        return "<no row>"
    return rows[0].get("max_discount_percent", "<absent>")


def scenario(s: Session) -> None:
    print("\n1 · THE DEFAULT IS NO CAP — the shop that updates keeps its day-one till")
    s.check(
        # The portable `INTEGER` of ADR-0007 lands as BIGINT in Postgres — the runtime rewrites the
        # subset per dialect, and so does this harness. What is pinned is NOT NULL: a nullable cap
        # would give `discount_cap` a third state to guess at.
        "the column is a NOT NULL integer, so no row can answer «unknown»",
        s.q(
            "SELECT data_type || '/' || is_nullable FROM information_schema.columns "
            "WHERE table_name = 'sales_settings' AND column_name = 'max_discount_percent'"
        ),
        "bigint/NO",
    )
    # The row a hub saved BEFORE the column existed: the migration fills it with the default, and
    # this is exactly what every hub in the fleet gets on update.
    s.psql(
        [
            "-c",
            "INSERT INTO sales_settings (id, hub_id, is_deleted, created_at, updated_at) "
            f"VALUES ('set-1', '{HUB}', 0, '{NOW}', '{NOW}')",
        ]
    )
    s.check(
        "a row written before the column reads as 100 — no cap, nobody asked for a PIN",
        s.qi("SELECT max_discount_percent FROM sales_settings WHERE id = 'set-1'"),
        100,
    )
    s.check("and the handler reads that 100", cap_through(s, HANDLER_READ), 100)
    s.check("and so does the counter", cap_through(s, COUNTER_READ), 100)

    print("\n2 · THE WRITE DOOR — the owner types 10 in Ajustes")
    save_policy(s, "set-1", 10)
    s.check(
        "the singleton holds the cap, on the row that was already there",
        s.rows(
            f"SELECT id, max_discount_percent FROM sales_settings WHERE hub_id = '{HUB}' AND is_deleted = 0"
        ),
        [{"id": "set-1", "max_discount_percent": 10}],
    )

    print("\n3 · THE HANDLER'S READ — the door the cap is ENFORCED from")
    s.check("`sales.settings.get` hands the cap back", cap_through(s, HANDLER_READ), 10)
    # The control that gives the check above its meaning: the handler only ever sees this query
    # because the command declares it. Reading a query nobody declared answers nothing at all, and
    # `discount_cap` would fall back to 100 — the cap saved, shown on screen, and never applied.
    for command in ("sales.complete_sale", "sales.complete_sale_over_limit"):
        reads = MANIFEST["commands"].get(command, {}).get("reads", [])
        named = [r if isinstance(r, str) else r.get("query") for r in reads]
        s.check(f"`{command}` declares it among its reads", HANDLER_READ in named, True)

    print("\n4 · THE COUNTER'S READ — the door the TILL routes with")
    s.check(
        "`sales.pos_settings.get` hands the cap back", cap_through(s, COUNTER_READ), 10
    )

    print(
        "\n5 · ZERO IS A VALUE — «nothing without the manager» is a choice, not absence"
    )
    save_policy(s, "set-1", 0)
    s.check(
        "the handler reads 0 and not the 100 of absence",
        cap_through(s, HANDLER_READ),
        0,
    )
    s.check("and so does the counter", cap_through(s, COUNTER_READ), 0)

    print("\n6 · TENANCY — the neighbour runs his own shop")
    save_policy(s, "set-neighbour", 50, hub=OTHER_HUB)
    s.check(
        "the neighbour's cap is his", cap_through(s, HANDLER_READ, hub=OTHER_HUB), 50
    )
    s.check("ours is still ours", cap_through(s, HANDLER_READ), 0)
    s.check("and the counter reads ours, not his", cap_through(s, COUNTER_READ), 0)
    # A write is not the same statement the reads above proved: saving OUR policy must not touch
    # his row, and `hub_id` is injected by the runtime — the payload cannot name it.
    save_policy(s, "set-1", 25)
    s.check(
        "saving ours leaves his untouched",
        s.rows(
            "SELECT hub_id, max_discount_percent FROM sales_settings WHERE is_deleted = 0 ORDER BY hub_id"
        ),
        [
            {"hub_id": OTHER_HUB, "max_discount_percent": 50},
            {"hub_id": HUB, "max_discount_percent": 25},
        ],
    )


def main() -> int:
    s = Session(f"sales_discount_cap_{os.getpid()}", hub=HUB, user=USER, now=NOW)
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        scenario(s)
    finally:
        s.drop()
    return s.report(
        "the cap the shop set is stored and handed back to the handler that enforces it"
    )


if __name__ == "__main__":
    sys.exit(main())
