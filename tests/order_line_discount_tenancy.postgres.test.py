#!/usr/bin/env python3
"""The write behind both LINE discount doors stays in its own hub and its live line (sales#385).

Since sales#385 a line discount on an open check is written by the internal sub-command
`sales._set_order_line_discount` (plus the provisional total recomputed), emitted by the handler of
`sales.order.set_line_discount` and of `sales.order.set_line_discount_over_limit` once the cap has
been judged. The handler names the order and the line: which hub the row belongs to is the
runtime's `hub_id`, never the payload. This battery plays that statement as the runtime does.

  1. Our hub writes the percent and the server-priced amount on its own live line, and the check's
     provisional total follows.
  2. The manager's door marks the LINE as approved (the manager the runtime names in
     `:approved_by`, or the caller when they hold the permission), `sales.order.lines` hands the
     mark back, and the usual door wipes it.
  3. The SAME ids written from the neighbour's hub touch nothing: it can neither discount, approve
     nor wipe our line.
  4. A line already fired to production is not rewritten.
  5. `sales._update_order_line` (the write behind `sales.order.update_line`, sales#394) no longer
     writes a discount: the ungated door is closed, and a
     quantity change keeps the approval the line carries.

Usage: tests/order_line_discount_tenancy.postgres.test.py
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session, bind

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
NOW = "2026-09-26T10:00:00+00:00"
WRITE = "sales._set_order_line_discount"


def open_check(s: Session, order_id: str) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted,"
                " created_at, updated_at) VALUES (:id, :hub_id, 'open', 300, 0, :now, :now)",
                {"id": order_id, "hub_id": HUB, "now": NOW},
            ),
        ]
    )


def add_line(s: Session, order_id: str, line_id: str, fired_at=None) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name,"
                " product_sku, quantity, unit_price, is_gift, gift_reason, line_total,"
                " tax_category_key, cost, round_no, fired_at, is_deleted, created_by, updated_by,"
                " created_at, updated_at) VALUES (:id, :hub_id, :order_id, 'p-cafe', 'Cafe', '',"
                " 2000000, 150, 0, '', 300, '', 0, 0, :fired_at, 0, 'u-waiter', 'u-waiter', :now, :now)",
                {
                    "id": line_id,
                    "hub_id": HUB,
                    "order_id": order_id,
                    "fired_at": fired_at,
                    "now": NOW,
                },
            ),
        ]
    )


def line(s: Session, line_id: str):
    return s.rows(
        "SELECT discount_percent, line_total, discount_approved_by FROM sales_order_item"
        f" WHERE id = '{line_id}'"
    )


def total(s: Session, order_id: str):
    return s.rows(f"SELECT provisional_total FROM sales_order WHERE id = '{order_id}'")


def write(
    percent: float,
    line_total: int,
    approved: int,
    approved_by: str = "",
    line_id="line-1",
):
    return {
        "order_id": "ord-1",
        "line_id": line_id,
        "discount_percent": percent,
        "line_total": line_total,
        "discount_approved": approved,
        "approved_by": approved_by,
    }


def scenario(s: Session) -> None:
    open_check(s, "ord-1")
    add_line(s, "ord-1", "line-1")

    print("\n1 · our hub writes its own line and the check's total follows")
    s.command_ok("the usual write", WRITE, write(10.0, 270, 0))
    s.check(
        "percent and amount stored, no approval",
        line(s, "line-1"),
        [{"discount_percent": 10, "line_total": 270, "discount_approved_by": None}],
    )
    s.check(
        "the provisional total is the sum of the lines",
        total(s, "ord-1"),
        [{"provisional_total": 270}],
    )

    print(
        "\n2 · the manager's door marks the line as approved; the usual door wipes it"
    )
    s.command_ok(
        "the manager's write, elevated by a PIN",
        WRITE,
        write(50.0, 150, 1, "u-manager"),
    )
    s.check(
        "the approval names the manager who gave the PIN",
        line(s, "line-1"),
        [
            {
                "discount_percent": 50,
                "line_total": 150,
                "discount_approved_by": "u-manager",
            }
        ],
    )
    s.check(
        "sales.order.lines hands the approval back",
        s.field(
            s.query("sales.order.lines", {"order_id": "ord-1"}), "discount_approved_by"
        ),
        "u-manager",
    )

    print(
        "\n5 · update_line changes the quantity, never the discount, and keeps the approval"
    )
    s.command_ok(
        "a quantity change carrying a discount it may no longer write",
        "sales._update_order_line",
        {
            "order_id": "ord-1",
            "line_id": "line-1",
            "quantity": 3000000,
            "line_total": 225,
            "is_gift": None,
            "gift_reason": None,
            "notes": None,
            "discount_percent": 100,
        },
    )
    s.check(
        "the discount is untouched and the approval survives the quantity change",
        line(s, "line-1"),
        [
            {
                "discount_percent": 50,
                "line_total": 225,
                "discount_approved_by": "u-manager",
            }
        ],
    )

    print("\n3 · the neighbour cannot reach our line by its ids")
    s.command_ok(
        "the neighbour's usual write runs", WRITE, write(0.0, 450, 0), hub=OTHER_HUB
    )
    s.check(
        "the neighbour cannot wipe our approval",
        line(s, "line-1"),
        [
            {
                "discount_percent": 50,
                "line_total": 225,
                "discount_approved_by": "u-manager",
            }
        ],
    )
    s.command_ok("the usual write", WRITE, write(5.0, 428, 0))
    s.check(
        "the usual door wipes the approval",
        line(s, "line-1"),
        [{"discount_percent": 5, "line_total": 428, "discount_approved_by": None}],
    )
    s.command_ok(
        "the neighbour's manager write runs",
        WRITE,
        write(90.0, 45, 1, "u-intruder"),
        hub=OTHER_HUB,
    )
    s.check(
        "the neighbour cannot approve our line",
        line(s, "line-1"),
        [{"discount_percent": 5, "line_total": 428, "discount_approved_by": None}],
    )
    s.command_ok(
        "a manager holding the permission themselves (no PIN)",
        WRITE,
        write(90.0, 45, 1),
    )
    s.check(
        "the approval names whoever holds the permission",
        line(s, "line-1"),
        [
            {
                "discount_percent": 90,
                "line_total": 45,
                "discount_approved_by": "u-waiter",
            }
        ],
    )

    print("\n4 · a line already fired to production is not rewritten")
    add_line(s, "ord-1", "line-fired", fired_at=NOW)
    s.command_ok(
        "the write on a fired line",
        WRITE,
        write(50.0, 150, 1, "u-manager", line_id="line-fired"),
    )
    s.check(
        "the fired line keeps no discount",
        line(s, "line-fired"),
        [{"discount_percent": 0, "line_total": 300, "discount_approved_by": None}],
    )


def main() -> int:
    s = Session(
        f"sales_order_line_discount_tenancy_{os.getpid()}",
        hub=HUB,
        user="u-waiter",
        now=NOW,
    )
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        scenario(s)
    finally:
        s.drop()
    return s.report("the line discount write stays inside its hub and its live line")


if __name__ == "__main__":
    sys.exit(main())
