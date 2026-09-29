#!/usr/bin/env python3
"""«Hoy» is the BUSINESS day, not the UTC one (sales#323) — runs against a REAL Postgres 18.

The symptom (QA on a Spanish hub, 19/09 at 02:09 local): «Ventas › Hoy» said «1 ticket, 11,90 €»
when six had been charged since midnight. Every door that cuts by day compared the UTC date part of
`created_at` (`erp_date`), so between local midnight and 02:00 (summer; 01:00 in winter) the night's
sales counted as «yesterday».

The runtime binds the business zone as `:timezone` in every declarative SQL (hub#1022, the same
`settings::timezone_of` the flows kernel uses), so each door reads `created_at` — and `:now` — on
the business clock. Same idiom as `invoice` (invoice#78) and `appointments`.

Clock pinned: `:now` = 2026-09-18T22:30:00Z = 00:30 on the 19th in Madrid (CEST, UTC+2).

Usage: tests/business_day.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import sys

from pg_harness import MANIFEST, MODULE_DIR, Session, bind, lower

NOW = "2026-09-18T22:30:00+00:00"  # 00:30 on 19/09 in Madrid
TZ = "Europe/Madrid"
TODAY = "2026-09-19"  # the business day at NOW
YESTERDAY = "2026-09-18"

s = Session(db=f"sales_business_day_test_{os.getpid()}", now=NOW)


def insert_sale(
    sale_id: str, created_at: str, total: int, hub: str = "hub-test"
) -> None:
    s.psql(
        [
            "-c",
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, subtotal, tax_amount, "
            "total, payment_method_name, customer_name, channel, staff_id, is_deleted, created_by, "
            "updated_by, created_at, updated_at) VALUES "
            f"('{sale_id}', '{hub}', 'T-{sale_id}', 'completed', {total}, 0, {total}, 'Cash', '', "
            f"'pos', 'st-ana', 0, 'u1', 'u1', '{created_at}', '{created_at}')",
        ]
    )


def query(name: str, params: dict) -> list:
    sql = (
        (MODULE_DIR / MANIFEST["queries"][name]["sql"]).read_text().strip().rstrip(";")
    )
    bound = bind(lower(sql), {**params, "hub_id": s.hub})
    try:
        raw = s.psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"]).strip()
    except RuntimeError as exc:
        s.failures.append(f"query `{name}` failed: {str(exc).splitlines()[0]}")
        return []
    return json.loads(raw) if raw else []


def main() -> int:
    s.create()
    try:
        # 00:30 local on the 12th, still the 11th in UTC: each door files it on the business day.
        insert_sale("s-0030-12", "2026-09-11T22:30:00+00:00", 50)
        # …and noon on the 11th, the day before on both clocks.
        insert_sale("s-noon-11", "2026-09-11T10:00:00+00:00", 5)
        # Yesterday on the business clock: noon and 23:50 local.
        insert_sale("s-noon-18", "2026-09-18T10:00:00+00:00", 1000)
        insert_sale("s-2350-18", "2026-09-18T21:50:00+00:00", 2000)
        # Today on the business clock — after local midnight, still the 18th in UTC.
        insert_sale("s-0005-19", "2026-09-18T22:05:00+00:00", 300)
        insert_sale("s-0020-19", "2026-09-18T22:20:00+00:00", 400)
        # The 00:05 sale has a LINE attended by someone else: `by_staff` credits lines to whoever
        # made them, through its first branch — the one a header-only fixture would never reach.
        s.psql(
            [
                "-c",
                "INSERT INTO sales_sale_item (id, hub_id, sale_id, product_name, quantity, "
                "unit_price, net_amount, tax_amount, line_total, staff_id) VALUES ('i-0005', "
                "'hub-test', 's-0005-19', 'Caña', 1000000, 300, 300, 0, 300, 'st-luis')",
            ]
        )
        # Another hub's sale at the same instant never leaks.
        insert_sale(
            "s-neighbour", "2026-09-18T22:10:00+00:00", 9900, hub="hub-neighbour"
        )

        print("sales.today (dashboard KPIs)")
        rows = query("sales.today", {"now": NOW, "timezone": TZ})
        s.check(
            "«hoy» at 00:30 counts what was charged since 00:00 local",
            s.field(rows, "tickets"),
            2,
        )
        s.check(
            "«hoy» amount is the night's, not yesterday's", s.field(rows, "total"), 700
        )
        # Positive control: with no zone the door falls back to UTC — the old answer, proving the
        # fixture does sit across the two midnights.
        rows = query("sales.today", {"now": NOW, "timezone": None})
        s.check(
            "without a zone it stays on the UTC day (runtime fallback)",
            s.field(rows, "tickets"),
            4,
        )

        # sales#368 — the screen no longer computes «today» on the DEVICE clock: it asks the hub.
        # A tablet with the wrong zone (or the owner abroad) used to ask for a day the server
        # does not count, and «Hoy» came out empty or with yesterday's sales.
        print("sales.business_day (the day the history screen anchors its ranges on)")
        rows = query("sales.business_day", {"now": NOW, "timezone": TZ})
        s.check(
            "at 00:30 local the business day is already the 19th",
            s.field(rows, "today"),
            TODAY,
        )
        # Positive control: the same instant without a zone is the UTC day, like every door.
        rows = query("sales.business_day", {"now": NOW, "timezone": None})
        s.check(
            "without a zone it stays on the UTC day (runtime fallback)",
            s.field(rows, "today"),
            YESTERDAY,
        )

        print("sales.stats (history KPIs, range = the screen's local days)")
        rows = query(
            "sales.stats", {"date_from": TODAY, "date_to": TODAY, "timezone": TZ}
        )
        s.check("«hoy» tickets", s.field(rows, "count"), 2)
        s.check("«hoy» revenue", s.field(rows, "total_revenue"), 700)
        rows = query(
            "sales.stats",
            {"date_from": YESTERDAY, "date_to": YESTERDAY, "timezone": TZ},
        )
        s.check("«ayer» keeps only yesterday's local sales", s.field(rows, "count"), 2)
        s.check("«ayer» revenue", s.field(rows, "total_revenue"), 3000)

        print("sales.list (the `erp_date` column the range filter compares)")
        rows = query("sales.list", {"timezone": TZ})
        days = {r["id"]: r["erp_date"] for r in rows}
        s.check(
            "each sale is dated with its business day",
            days,
            {
                "s-noon-11": "2026-09-11",
                "s-0030-12": "2026-09-12",
                "s-noon-18": YESTERDAY,
                "s-2350-18": YESTERDAY,
                "s-0005-19": TODAY,
                "s-0020-19": TODAY,
            },
        )

        print("sales.last_7_days (dashboard chart)")
        rows = query("sales.last_7_days", {"now": NOW, "timezone": TZ})
        s.check(
            # The seven days end on the BUSINESS today (the 19th); their edges and the days at 0
            # are pinned in last_7_days.postgres.test.py (sales#472).
            "one bar per business day, yesterday's and today's on their local day",
            [(str(r["day"]), r["total"]) for r in rows],
            [(f"2026-09-{d}", 0) for d in range(13, 18)] + [(YESTERDAY, 3000), (TODAY, 700)],
        )

        print("sales.by_staff (per-person close)")
        rows = query(
            "sales.by_staff", {"date_from": TODAY, "date_to": TODAY, "timezone": TZ}
        )
        s.check(
            "the night's sales are credited to today's close, line by line and by header",
            [(r["staff_id"], r["sales_count"], r["gross_total"]) for r in rows],
            [("st-ana", 1, 400), ("st-luis", 1, 300)],
        )
        rows = query(
            "sales.by_staff",
            {"date_from": YESTERDAY, "date_to": YESTERDAY, "timezone": TZ},
        )
        s.check(
            "yesterday's close stops at the local midnight (upper bound, both branches)",
            [(r["staff_id"], r["sales_count"], r["gross_total"]) for r in rows],
            [("st-ana", 2, 3000)],
        )
    finally:
        s.drop()
    return s.report("«Hoy» is the business day in every door")


if __name__ == "__main__":
    sys.exit(main())
