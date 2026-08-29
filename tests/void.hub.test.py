#!/usr/bin/env python3
"""Voiding a sale (`sales.void`) against the REAL kernel — the `sales` half of the hub's
`void_reversal_e2e.rs` (ERPlora/hub#1264, contract «El Hub se CIERRA como KERNEL» §5).

That e2e proves the CHAIN `sales.void` → `sale.voided` → cash_register (`_reverse_sale`) +
inventory (`_restock_on_void`), and its assertions belong to those two modules: they are the ones
that reverse the drawer and put the stock back. What `sales` owes the chain is its first link,
and that is what this battery pins (sales#26):

  1. A void needs a reason: without one it is refused with `sales.void_reason_required` and the
     sale stays `completed`.
  2. A void does not delete: the sale turns `voided`, keeps its money, and records who voided it,
     when and why.
  3. It emits `sale.voided` exactly once, with the sale's id and total — the payload the two
     listeners downstream key on.
  4. A second void of the same sale is refused with `sales.already_voided`; a sale this hub does
     not have, with `sales.sale_not_found`.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys
import uuid

import hub_harness
from hub_harness import ONE, Hub, cash_method_id, cents, key


def charge(hub: Hub, cash: str, tag: str) -> str:
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key(tag),
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": 3000,
            "items": [
                {
                    "product_name": "Café",
                    "price": 1500,
                    "quantity": 2 * ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    return out["new_ids"][0]


def sale(hub: Hub, sale_id: str) -> dict:
    rows = hub.query("sales.get", {"sale_id": sale_id})
    return rows[0] if rows else {}


def test_a_void_needs_a_reason(hub: Hub, sale_id: str) -> None:
    print("\n1 · a void without a reason is refused and changes nothing")
    hub.refused(
        "void with an empty reason",
        "sales.void",
        {"sale_id": sale_id, "reason": "  "},
        "sales.void_reason_required",
    )
    hub.check(
        "the sale is still completed", sale(hub, sale_id).get("status"), "completed"
    )


def test_a_void_marks_not_deletes(hub: Hub, sale_id: str) -> str:
    print(
        "\n2 · a void turns the sale `voided` and records who / when / why — the money stays"
    )
    before = sale(hub, sale_id)
    reason = f"wrong table {uuid.uuid4().hex[:6]}"
    hub.run("sales.void", {"sale_id": sale_id, "reason": reason})
    after = sale(hub, sale_id)
    hub.check("status", after.get("status"), "voided")
    hub.check("void_reason", after.get("void_reason"), reason)
    hub.check("voided_by = the session user", after.get("voided_by"), hub.user)
    hub.check_true(
        "voided_at is stamped",
        bool(after.get("voided_at")),
        str(after.get("voided_at")),
    )
    hub.check(
        "the total is untouched", cents(after.get("total")), cents(before.get("total"))
    )
    hub.check(
        "the sale number is untouched",
        after.get("sale_number"),
        before.get("sale_number"),
    )
    return reason


def test_sale_voided_is_emitted_with_id_and_total(hub: Hub, sale_id: str) -> None:
    print("\n3 · sale.voided is emitted with the sale's id and total")
    shape = hub.event_shape("sale.voided")
    hub.check_true(
        "sale.voided has been emitted",
        shape is not None and shape.get("samples", 0) >= 1,
        str(shape),
    )
    sid = hub.event_field("sale.voided", "sale_id") or {}
    hub.check("the newest sale.voided names THIS sale", sid.get("sample"), sale_id)
    total = hub.event_field("sale.voided", "total") or {}
    hub.check(
        "…with its total",
        cents(total.get("sample")),
        cents(sale(hub, sale_id).get("total")),
    )
    reason = hub.event_field("sale.voided", "reason") or {}
    hub.check_true(
        "…and the reason (free text, withheld by the shape)", bool(reason), str(shape)
    )


def test_a_second_void_is_refused(hub: Hub, sale_id: str) -> None:
    print("\n4 · once only: a second void and a foreign id are refused by code")
    hub.refused(
        "void twice",
        "sales.void",
        {"sale_id": sale_id, "reason": "again"},
        "sales.already_voided",
    )
    hub.refused(
        "void a sale this hub never had",
        "sales.void",
        {"sale_id": f"no-such-sale-{uuid.uuid4().hex[:8]}", "reason": "x"},
        "sales.sale_not_found",
    )
    hub.check("still exactly `voided`", sale(hub, sale_id).get("status"), "voided")


def main() -> int:
    hub = Hub("void.hub")
    print(
        f"Hub battery · void (hub#1264 ← void_reversal_e2e.rs, sales half) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    cash = cash_method_id(hub)
    sale_id = charge(hub, cash, "to-void")
    test_a_void_needs_a_reason(hub, sale_id)
    test_a_void_marks_not_deletes(hub, sale_id)
    test_sale_voided_is_emitted_with_id_and_total(hub, sale_id)
    test_a_second_void_is_refused(hub, sale_id)
    return hub.finish(
        "a void marks, announces once and never deletes, against the real kernel"
    )


if __name__ == "__main__":
    sys.exit(main())
