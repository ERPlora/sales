#!/usr/bin/env python3
"""«Sales, last 7 days» always draws the SEVEN business days, a day without sales at 0 (sales#472).

The symptom (hub#2392 bench, sales on the 23rd, 25th, 26th, 28th and 29th): the home chart drew
five bars side by side — the 24th and the 27th were simply missing, so nobody could compare the week
day by day, and a single sale in the week filled the whole card with one bar. The query grouped
`sales_sale` by day, so a day without rows had no row. A day without sales at 0 is not an invented
figure: it is that day's real total. Square, Shopify, Toast and Lightspeed all draw it.

The contract, on the BUSINESS clock (`:timezone`, sales#323): exactly one row per day from today − 6
to today, oldest first, `total` = the completed, live sales of THIS hub that day, 0 when none.

Clock pinned: `:now` = 2026-09-18T22:30:00Z = 00:30 on the 19th in Madrid (CEST, UTC+2), so the
window is the 13th → the 19th, and its edges sit across a UTC midnight on purpose.

Usage: tests/last_7_days.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import sys

from pg_harness import MANIFEST, MODULE_DIR, Session, bind, lower

NOW = "2026-09-18T22:30:00+00:00"  # 00:30 on 19/09 in Madrid
TZ = "Europe/Madrid"

s = Session(db=f"sales_last_7_days_test_{os.getpid()}", now=NOW)


def insert_sale(
    sale_id: str,
    created_at: str,
    total: int,
    hub: str = "hub-test",
    status: str = "completed",
    is_deleted: int = 0,
) -> None:
    s.psql(
        [
            "-c",
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, subtotal, tax_amount, "
            "total, payment_method_name, customer_name, channel, staff_id, is_deleted, created_by, "
            "updated_by, created_at, updated_at) VALUES "
            f"('{sale_id}', '{hub}', 'T-{sale_id}', '{status}', {total}, 0, {total}, 'Cash', '', "
            f"'pos', 'st-ana', {is_deleted}, 'u1', 'u1', '{created_at}', '{created_at}')",
        ]
    )


def chart(timezone, hub: str = "hub-test") -> list:
    """The widget's door, lowered like the runtime lowers it and with `hub_id` injected."""
    spec = MANIFEST["queries"]["sales.last_7_days"]
    sql = (MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";")
    bound = bind(lower(sql), {"now": NOW, "timezone": timezone, "hub_id": hub})
    try:
        raw = s.psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"]).strip()
    except RuntimeError as exc:
        s.failures.append(
            f"query `sales.last_7_days` failed: {str(exc).splitlines()[0]}"
        )
        return []
    return [(str(r["day"]), r["total"]) for r in (json.loads(raw) if raw else [])]


def main() -> int:
    s.create()
    try:
        # The window's first day, 00:30 local on the 13th — still the 12th in UTC: IN.
        insert_sale("s-0030-13", "2026-09-12T22:30:00+00:00", 50)
        # 23:50 local on the 12th, the day before the window: OUT.
        insert_sale("s-2350-12", "2026-09-12T21:50:00+00:00", 5)
        # A busy 15th, next to what never counts that day: a voided sale and a deleted one.
        insert_sale("s-noon-15", "2026-09-15T10:00:00+00:00", 1000)
        insert_sale("s-void-15", "2026-09-15T11:00:00+00:00", 777, status="voided")
        insert_sale("s-del-15", "2026-09-15T12:00:00+00:00", 333, is_deleted=1)
        # Today, 00:05 local — still the 18th in UTC.
        insert_sale("s-0005-19", "2026-09-18T22:05:00+00:00", 300)
        # A sale stamped TOMORROW (a device with its clock ahead) is not a bar of this week.
        insert_sale("s-noon-20", "2026-09-20T10:00:00+00:00", 4000)
        # The neighbour sold on the 17th, a day this hub sold nothing: that day stays at 0 here.
        insert_sale(
            "s-neighbour-17", "2026-09-17T10:00:00+00:00", 9900, hub="hub-neighbour"
        )

        print("sales.last_7_days (dashboard chart)")
        s.check(
            "seven business days, oldest first, a day without sales at 0",
            chart(TZ),
            [
                ("2026-09-13", 50),
                ("2026-09-14", 0),
                ("2026-09-15", 1000),
                ("2026-09-16", 0),
                ("2026-09-17", 0),
                ("2026-09-18", 0),
                ("2026-09-19", 300),
            ],
        )
        s.check(
            "a hub that has never sold still gets its seven days, all at 0",
            chart(TZ, hub="hub-empty"),
            [(f"2026-09-{d}", 0) for d in range(13, 20)],
        )
        # Positive control: without a zone the door falls back to UTC like the runtime does
        # (`timezone_name()`) — the window moves a day back and the two edge sales land on the 12th,
        # proving the fixture really sits across the two midnights.
        s.check(
            "without a zone the seven days are the UTC ones (runtime fallback)",
            chart(None),
            [
                ("2026-09-12", 55),
                ("2026-09-13", 0),
                ("2026-09-14", 0),
                ("2026-09-15", 1000),
                ("2026-09-16", 0),
                ("2026-09-17", 0),
                ("2026-09-18", 300),
            ],
        )
    finally:
        s.drop()
    return s.report("«Sales, last 7 days» draws the seven business days")


if __name__ == "__main__":
    sys.exit(main())
