#!/usr/bin/env python3
"""The discount on an OPEN check is authorised when it is APPLIED (sales#284) — real kernel.

`sales.order.set_discount` used to be a bare UPDATE: anybody who could sell put 90 % on a table,
the check showed the reduced total to the customer, and the manager was only asked at Charge
(sales#269). Now applying it goes through the same two doors as the checkout:

  1. With the shop's cap at 10 %, a 90 % ticket discount through `sales.order.set_discount` is
     REFUSED with `sales.discount_over_limit` and the check keeps what it had.
  2. The same payload through `sales.order.set_discount_over_limit` (the manager's door, behind
     `sales.discount.over_limit`) is accepted and the check stores it.
  3. A fixed amount is judged as its share of the open lines: 30 cents of 3,00 € are the
     cashier's, 31 are not.
  4. A discount within the cap goes through the usual door, as before.
  5. An order that is not open is still `sales.order_unavailable`, on either door.

The cap is restored to what the hub had at the end, pass or fail: the settings row is the
hub's singleton and other batteries charge against it.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]`. Never on its own: without a
runtime it fails, it does not skip.
"""

import json
import pathlib
import sys

import hub_harness
from hub_harness import ONE, Hub, cents

SETTINGS_COLUMNS = (
    "allow_cash", "allow_card", "allow_transfer", "sync_products", "sync_services",
    "require_customer", "allow_discounts", "max_discount_percent", "enable_parked_tickets",
    "default_tax_included", "receipt_header", "receipt_footer", "receipt_footer_image",
    "receipt_marketing_url", "receipt_marketing_text", "default_document_format",
    "auto_invoice_with_tax_id",
)
DEFAULTS = {
    "allow_cash": 1, "allow_card": 1, "allow_transfer": 0, "sync_products": 1, "sync_services": 1,
    "require_customer": 0, "allow_discounts": 1, "max_discount_percent": 100,
    "enable_parked_tickets": 1, "default_tax_included": 1, "receipt_header": "",
    "receipt_footer": "", "receipt_footer_image": "", "receipt_marketing_url": "",
    "receipt_marketing_text": "", "default_document_format": "ticket",
    "auto_invoice_with_tax_id": 0,
}


def current_policy(hub: Hub) -> dict:
    rows = hub.query("sales.settings.get")
    row = rows[0] if rows else {}
    return {c: (row.get(c) if row.get(c) is not None else DEFAULTS[c]) for c in SETTINGS_COLUMNS}


#: The settings door validates its payload against this schema: the switches travel as booleans
#: even though the row stores them as 0/1, so the payload is shaped from the schema, not the row.
SETTINGS_SCHEMA = json.loads(
    (pathlib.Path(__file__).resolve().parent.parent / "schemas" / "settings_update.json").read_text()
)["properties"]


def save_policy(hub: Hub, policy: dict) -> None:
    payload = {
        c: bool(v) if SETTINGS_SCHEMA.get(c, {}).get("type") == "boolean" else v
        for c, v in policy.items()
    }
    hub.run("sales.settings.update", payload)


def open_check(hub: Hub) -> str:
    """Three 1,00 € lines: 3,00 € open, so the cap at 10 % is worth exactly 30 cents."""
    items = [
        {"product_name": f"Caña {n}", "price": 100, "quantity": ONE, "tax_rate": 21.0}
        for n in range(3)
    ]
    out = hub.run("sales.order.open", {"items": items})
    order_id = (out.get("new_ids") or [None])[0]
    if not isinstance(order_id, str) or not order_id:
        raise AssertionError(f"sales.order.open did not answer the order id: {out}")
    return order_id


def stored(hub: Hub, order_id: str) -> tuple[float, int]:
    rows = hub.query("sales.order.get", {"order_id": order_id})
    row = rows[0] if rows else {}
    return float(row.get("discount_percent") or 0), cents(row.get("discount_amount") or 0)


def scenario(hub: Hub) -> None:
    order_id = open_check(hub)

    print("\n1 · above the cap, the usual door refuses and the check keeps what it had")
    hub.refused(
        "90 % on the usual door with the cap at 10",
        "sales.order.set_discount",
        {"order_id": order_id, "discount_percent": 90, "discount_amount": 0},
        "sales.discount_over_limit",
    )
    hub.check("the check still has no discount", stored(hub, order_id), (0.0, 0))

    print("\n2 · the manager's door stores it")
    hub.run(
        "sales.order.set_discount_over_limit",
        {"order_id": order_id, "discount_percent": 90, "discount_amount": 0},
    )
    hub.check("the check carries the authorised 90 %", stored(hub, order_id), (90.0, 0))

    print("\n3 · a fixed amount is judged as its share of the open lines")
    hub.refused(
        "31 cents of 3,00 € on the usual door",
        "sales.order.set_discount",
        {"order_id": order_id, "discount_percent": 0, "discount_amount": 31},
        "sales.discount_over_limit",
    )
    hub.check("the refused amount did not land", stored(hub, order_id), (90.0, 0))
    hub.run("sales.order.set_discount", {"order_id": order_id, "discount_percent": 0, "discount_amount": 30})
    hub.check("30 cents are the cashier's", stored(hub, order_id), (0.0, 30))

    print("\n4 · within the cap, the usual door as before")
    hub.run("sales.order.set_discount", {"order_id": order_id, "discount_percent": 10, "discount_amount": 0})
    hub.check("10 % stored", stored(hub, order_id), (10.0, 0))

    print("\n5 · an order that is not open is still unavailable, on either door")
    hub.run("sales.order.void", {"order_id": order_id})
    for door in ("sales.order.set_discount", "sales.order.set_discount_over_limit"):
        hub.refused(
            f"{door} on a voided check",
            door,
            {"order_id": order_id, "discount_percent": 5, "discount_amount": 0},
            "sales.order_unavailable",
        )


def main() -> int:
    hub = Hub("order_discount_cap.hub")
    print(f"Hub battery · discount on an open check (sales#284) · {hub_harness.BASE} · hub {hub.hub_id}")
    before = current_policy(hub)
    save_policy(hub, {**before, "allow_discounts": 1, "max_discount_percent": 10})
    try:
        scenario(hub)
    finally:
        save_policy(hub, before)
    return hub.finish("the discount on an open check is authorised when it is applied")


if __name__ == "__main__":
    sys.exit(main())
