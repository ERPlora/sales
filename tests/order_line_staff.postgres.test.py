#!/usr/bin/env python3
"""The professional survives the ORDER, not just the sale (sales#273) — real Postgres 18 in Docker.

Migration 034 gave `sales_sale_item` its own `staff_id` and `sales.by_staff` splits the close by it.
That fixed the half nobody can see. This is the half that decides whether the sale ever gets a value
to hold.

ADR-0141 does not keep the cart in memory: every tap writes a real `sales_order_item` row, and the
till REBUILDS the cart from that table — when the tablet reloads, when a parked check is resumed,
and after every fire to the kitchen (`loadOrderLines`, which re-reads the lines to lock the fired
round). So an attribution that lives only on the browser's cart line is gone before anyone pays, and
the sale silently falls back to the ticket's single professional. In a salon that is not a corner
case: it is Ana's cut landing in Marta's close, with nothing said.

That is pure SQL semantics — which column exists, which door binds it, what the resume query
projects, which rows travel — so it runs here, the way the runtime runs it (`execute_tx`): the
manifest command's statements in ONE transaction, the system params injected and not spoofable
(`:hub_id`, `:current_user_id`, `:now`), and any `:param` absent from the payload bound as NULL,
which is what the driver does (`DynNull`, hub/crates/db/src/lib.rs).

Contract under test:

  1. THE COLUMN AND THE DOOR. `sales_order_item.staff_id` exists and `sales._insert_order_line` —
     the ONE command every order line is written by, from both doors — binds it.

  2. RESUMING, the acceptance criterion. `queries/order_lines.sql` gives it back. A column that is
     written and not projected is the failure sales#148 already paid for with the supplements:
     stored, charged and unreadable.

  3. NULL, NOT "". A line nobody was named on stays NULL, which is what `by_staff` COALESCEs to the
     ticket's own professional. An empty string would be a third state belonging to no one, and it
     would not fall back.

  4. IT TRAVELS. Splitting a check and merging two moves WHOLE ROWS, so each line keeps its own
     professional on the other side. Paying half a salon ticket separately is the normal gesture,
     not the exotic one.

  5. TENANCY. The neighbour hub's line is not reachable through the resume query.

Usage: tests/order_line_staff.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session, order_line_params

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-cashier"
NOW = "2026-09-09T10:00:00+00:00"

ORDER = "ord-1"
SPLIT_ORDER = "ord-2"

ANA = "staff-ana"
MARTA = "staff-marta"
NEIGHBOUR = "staff-next-door"

CUT = 1800
COLOUR = 4500
ONE = 1_000_000  # one unit, fixed point 10⁶ (ADR-0147)


def open_order(s: Session, order_id: str, hub: str | None = None) -> None:
    s.command_ok(
        f"the check `{order_id}` is opened",
        "sales._insert_order",
        {
            "id": order_id,
            "status": "open",
            "provisional_total": 0,
            "notes": "",
            "label": "Mostrador",
            "source_module": "pos",
        },
        hub=hub,
    )


def add_line(
    s: Session,
    line_id: str,
    name: str,
    price: int,
    staff,
    hub: str | None = None,
    order_id: str = ORDER,
) -> None:
    """One line, through the door the handler really emits for BOTH `open` and `add_line`."""
    s.command_ok(
        f"«{name}» goes on the check"
        + (f" for {staff}" if staff else " with nobody named"),
        "sales._insert_order_line",
        order_line_params(
            id=line_id,
            order_id=order_id,
            product_id=f"s-{line_id}",
            product_name=name,
            quantity=ONE,
            unit_price=price,
            line_total=price,
            tax_category_key="service.generic",
            is_service=1,
            category_id="sc-pelo",
            staff_id=staff,
        ),
        hub=hub,
    )


def resumed(s: Session, order_id: str = ORDER, hub: str | None = None) -> dict:
    """The cart as the till rebuilds it: `id → staff_id`, straight out of the resume query."""
    rows = s.query("sales.order.lines", {"order_id": order_id}, hub=hub)
    return {r["id"]: r.get("staff_id") for r in rows}


def scenario(s: Session) -> None:
    print("\n1 · THE COLUMN AND THE DOOR — the row holds who did the work")
    open_order(s, ORDER)
    add_line(s, "l-cut", "Corte", CUT, ANA)
    add_line(s, "l-colour", "Color", COLOUR, MARTA)
    add_line(s, "l-shampoo", "Champú", 900, None)

    s.check(
        "the column is nullable TEXT, so every line written before it stays valid",
        s.q(
            "SELECT data_type || '/' || is_nullable FROM information_schema.columns "
            "WHERE table_name = 'sales_order_item' AND column_name = 'staff_id'"
        ),
        "text/YES",
    )
    s.check(
        "Ana's cut is Ana's",
        s.q(f"SELECT staff_id FROM sales_order_item WHERE id = 'l-cut'"),
        ANA,
    )
    s.check(
        "Marta's colour is Marta's — on the SAME check",
        s.q("SELECT staff_id FROM sales_order_item WHERE id = 'l-colour'"),
        MARTA,
    )

    print(
        "\n2 · RESUMING — the till rebuilds the cart from the row, so the row has to say it"
    )
    s.check(
        "each line comes back with its own professional",
        resumed(s),
        {"l-cut": ANA, "l-colour": MARTA, "l-shampoo": None},
    )

    print("\n3 · NULL, NOT the empty string")
    s.check(
        "a line nobody was named on is NULL, which falls back to the ticket's professional",
        s.q(
            "SELECT coalesce(staff_id, '<null>') FROM sales_order_item WHERE id = 'l-shampoo'"
        ),
        "<null>",
    )
    s.check(
        "and no line was written with an empty string, which would fall back to nothing",
        s.qi("SELECT count(*) FROM sales_order_item WHERE staff_id = ''"),
        0,
    )

    print(
        "\n4 · IT TRAVELS — paying half the ticket separately keeps each line with its own"
    )
    s.command_ok(
        "the colour is split off onto its own check",
        "sales.order.split",
        {
            "order_id": ORDER,
            "line_ids": ["l-colour"],
            "label": "Marta",
            # `:new_id` is the id the RUNTIME mints for the second check and gives back as
            # `new_ids[0]` — the payload cannot name it (`additionalProperties: false`). The
            # harness binds it the way the runtime does.
            "new_id": SPLIT_ORDER,
        },
    )
    s.check(
        "the split check carries Marta's colour, still hers",
        resumed(s, SPLIT_ORDER),
        {"l-colour": MARTA},
    )
    s.check(
        "and the original keeps Ana's", resumed(s), {"l-cut": ANA, "l-shampoo": None}
    )

    s.command_ok(
        "they change their mind and the two checks are merged back",
        "sales.order.merge",
        {"from_order_id": SPLIT_ORDER, "to_order_id": ORDER},
    )
    s.check(
        "both professionals survive the round trip",
        resumed(s),
        {"l-cut": ANA, "l-colour": MARTA, "l-shampoo": None},
    )

    print("\n5 · TENANCY — the neighbour's line is not ours")
    open_order(s, "ord-next-door", hub=OTHER_HUB)
    add_line(
        s,
        "l-next-door",
        "Corte",
        CUT,
        NEIGHBOUR,
        hub=OTHER_HUB,
        order_id="ord-next-door",
    )
    s.check(
        "our resume query cannot see the neighbour's check",
        resumed(s, "ord-next-door"),
        {},
    )
    s.check(
        "and the neighbour sees his own, seeded through the same door",
        resumed(s, "ord-next-door", hub=OTHER_HUB),
        {"l-next-door": NEIGHBOUR},
    )


def main() -> int:
    s = Session(f"sales_order_line_staff_{os.getpid()}", hub=HUB, user=USER, now=NOW)
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
        "the order line keeps the professional who did it, and the resumed cart reads it"
    )


if __name__ == "__main__":
    sys.exit(main())
