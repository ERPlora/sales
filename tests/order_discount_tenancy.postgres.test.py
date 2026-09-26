#!/usr/bin/env python3
"""The write behind both discount doors stays in its own hub (sales#284) — real Postgres in Docker.

Since sales#284 the ticket discount of an open check is written by the internal sub-command
`sales._set_order_discount`, emitted by the handler of `sales.order.set_discount` and of
`sales.order.set_discount_over_limit` once the cap has been judged. The handler only names the
order: which hub the row belongs to is the runtime's `hub_id`, never the payload. This battery
plays that statement as the runtime does and checks the neighbour's check is out of reach.

  1. Our hub writes the percent and the fixed amount on its own open check.
  2. An absent amount (`null`) keeps the stored one — the percent-only apply does not wipe it.
  3. The SAME order id written from the neighbour's hub touches nothing.
  4. A check that is no longer open is not rewritten.
  5. sales#386 — the manager's door marks the discount as APPROVED on the check (who: the manager
     the runtime names in `:approved_by`, or the caller when they hold the permission themselves),
     `sales.order.get` hands the mark back, the usual door wipes it, and the neighbour's hub can
     neither set nor wipe ours.

Usage: tests/order_discount_tenancy.postgres.test.py
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session, bind

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
NOW = "2026-09-26T10:00:00+00:00"
WRITE = "sales._set_order_discount"


def open_check(s: Session, order_id: str, status: str = "open") -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted,"
                " created_at, updated_at) VALUES (:id, :hub_id, :status, 300, 0, :now, :now)",
                {"id": order_id, "hub_id": HUB, "status": status, "now": NOW},
            ),
        ]
    )


def discount(s: Session, order_id: str):
    return s.rows(
        f"SELECT discount_percent, discount_amount FROM sales_order WHERE id = '{order_id}'"
    )


def approval(s: Session, order_id: str):
    return s.rows(f"SELECT discount_approved_by FROM sales_order WHERE id = '{order_id}'")


def scenario(s: Session) -> None:
    open_check(s, "ord-1")

    print("\n1 · our hub writes its own check")
    s.command_ok("the write", WRITE, {"order_id": "ord-1", "discount_percent": 90.0, "discount_amount": 30})
    s.check("percent and amount stored", discount(s, "ord-1"), [{"discount_percent": 90, "discount_amount": 30}])

    print("\n2 · a percent-only apply keeps the stored amount")
    s.command_ok("percent only", WRITE, {"order_id": "ord-1", "discount_percent": 5.0, "discount_amount": None})
    s.check("amount kept", discount(s, "ord-1"), [{"discount_percent": 5, "discount_amount": 30}])

    print("\n3 · the neighbour cannot reach our check by its id")
    s.command_ok(
        "the neighbour's write runs",
        WRITE,
        {"order_id": "ord-1", "discount_percent": 100.0, "discount_amount": 300},
        hub=OTHER_HUB,
    )
    s.check("our check is untouched", discount(s, "ord-1"), [{"discount_percent": 5, "discount_amount": 30}])

    print("\n4 · a check that is no longer open is not rewritten")
    open_check(s, "ord-done", status="completed")
    s.command_ok("the write on a closed check", WRITE, {"order_id": "ord-done", "discount_percent": 50.0, "discount_amount": 0})
    s.check("the closed check keeps no discount", discount(s, "ord-done"), [{"discount_percent": 0, "discount_amount": 0}])

    print("\n5 · the manager's door marks the discount as approved; the usual door wipes it")
    open_check(s, "ord-2")
    s.check("a fresh check carries no approval", approval(s, "ord-2"), [{"discount_approved_by": None}])
    s.command_ok(
        "the manager's write, elevated by a PIN",
        WRITE,
        {"order_id": "ord-2", "discount_percent": 90.0, "discount_amount": 0, "discount_approved": 1, "approved_by": "u-manager"},
    )
    s.check("the approval names the manager who gave the PIN", approval(s, "ord-2"), [{"discount_approved_by": "u-manager"}])
    s.check(
        "sales.order.get hands the approval back",
        s.field(s.query("sales.order.get", {"order_id": "ord-2"}), "discount_approved_by"),
        "u-manager",
    )
    s.command_ok(
        "the neighbour's usual write runs",
        WRITE,
        {"order_id": "ord-2", "discount_percent": 0.0, "discount_amount": 0, "discount_approved": 0, "approved_by": ""},
        hub=OTHER_HUB,
    )
    s.check("the neighbour cannot wipe our approval", approval(s, "ord-2"), [{"discount_approved_by": "u-manager"}])
    s.command_ok(
        "the usual write",
        WRITE,
        {"order_id": "ord-2", "discount_percent": 5.0, "discount_amount": 0, "discount_approved": 0, "approved_by": ""},
    )
    s.check("the usual door wipes the approval", approval(s, "ord-2"), [{"discount_approved_by": None}])
    s.command_ok(
        "a manager holding the permission themselves (no PIN)",
        WRITE,
        {"order_id": "ord-2", "discount_percent": 90.0, "discount_amount": 0, "discount_approved": 1, "approved_by": ""},
    )
    s.check("the approval names whoever holds the permission", approval(s, "ord-2"), [{"discount_approved_by": "u-waiter"}])

    open_check(s, "ord-3")
    s.command_ok(
        "the neighbour's manager write runs",
        WRITE,
        {"order_id": "ord-3", "discount_percent": 90.0, "discount_amount": 0, "discount_approved": 1, "approved_by": "u-intruder"},
        hub=OTHER_HUB,
    )
    s.check("the neighbour cannot approve our check", approval(s, "ord-3"), [{"discount_approved_by": None}])


def main() -> int:
    s = Session(f"sales_order_discount_tenancy_{os.getpid()}", hub=HUB, user="u-waiter", now=NOW)
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        scenario(s)
    finally:
        s.drop()
    return s.report("the discount write stays inside its hub and its open check")


if __name__ == "__main__":
    sys.exit(main())
