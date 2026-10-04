#!/usr/bin/env python3
"""The legal cash limit (sales#498) against the REAL kernel.

Ley 7/2012 art. 7 (as worded by Ley 11/2021): in Spain an operation where one party is a business
cannot be paid in cash when its amount is 1.000,00 € or more. The handler's unit tests prove the
rule on a hand-written `context`; what only a live runtime can prove is the other half — that the
kernel really hands the handler the hub's country (`context.country_code`, from `hub_settings`)
and that a refused charge writes NOTHING:

  1. 999,99 € in cash closes: the limit is «1.000 € or more», not «more than 1.000 €».
  2. 1.000,00 € in cash is refused with `sales.cash_limit_exceeded` and no sale is written.
  3. A MIXED payment does not escape: 999 € in cash + 1 € on card over a 1.000 € sale is refused —
     the cash part counts against the whole operation (it is how the AEAT computes the fine).
  4. The same 1.000 € by card closes: the law limits cash, not the sale.
  5. The checkout preview publishes the limit the charge enforces, so the till can disable cash.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys

import hub_harness
from hub_harness import ONE, Hub, card_method_id, cash_method_id, key, sale_by_key

LIMIT = 100_000  # 1.000,00 € in cents


def items(cents: int) -> list:
    return [
        {"product_name": "Reloj", "price": cents, "quantity": ONE, "tax_rate": 21.0}
    ]


def ensure_spanish_hub(hub: Hub) -> None:
    """The country is the hub's fiscal identity, written through the real admin door — the same
    `PUT /api/settings` the setup wizard makes. Idempotent across the batteries of a run."""
    status, body = hub._request("PUT", "/api/settings", {"country_code": "ES"})
    if status != 200:
        print(
            f"{hub.battery}: PUT /api/settings (country_code) answered {status}: {body}"
        )
        sys.exit(1)


def test_just_below_the_limit_closes(hub: Hub, cash: str) -> None:
    print("\n1 · 999,99 € in cash closes")
    k = key("cash-999")
    hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": k,
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": LIMIT,
            "items": items(LIMIT - 1),
        },
    )
    hub.check("the sale is written", len(sale_by_key(hub, k)), 1)


def test_cash_at_the_limit_is_refused(hub: Hub, cash: str) -> None:
    print("\n2 · 1.000,00 € in cash is refused and writes nothing")
    k = key("cash-1000")
    hub.refused(
        "1.000,00 € in cash",
        "sales.complete_sale",
        {
            "idempotency_key": k,
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": LIMIT,
            "items": items(LIMIT),
        },
        "sales.cash_limit_exceeded",
    )
    hub.check("no sale under that attempt", len(sale_by_key(hub, k)), 0)


def test_a_mixed_payment_does_not_escape(hub: Hub, cash: str, card: str) -> None:
    print("\n3 · 999 € in cash + 1 € on card over a 1.000 € sale is refused")
    k = key("mixed-1000")
    hub.refused(
        "mixed 999 cash + 1 card",
        "sales.complete_sale",
        {
            "idempotency_key": k,
            "tax_included": True,
            "items": items(LIMIT),
            "payments": [
                {
                    "payment_method_id": cash,
                    "amount": LIMIT - 100,
                    "amount_tendered": LIMIT - 100,
                },
                {"payment_method_id": card, "amount": 100},
            ],
        },
        "sales.cash_limit_exceeded",
    )
    hub.check("no sale under that attempt", len(sale_by_key(hub, k)), 0)


def test_card_closes_any_amount(hub: Hub, card: str) -> None:
    print("\n4 · the same 1.000,00 € by card closes")
    k = key("card-1000")
    hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": k,
            "payment_method_id": card,
            "tax_included": True,
            "items": items(LIMIT),
        },
    )
    hub.check("the sale is written", len(sale_by_key(hub, k)), 1)


def test_the_preview_publishes_the_limit(hub: Hub) -> None:
    print("\n5 · the checkout preview publishes the limit the charge enforces")
    # A handler command answers through its own channel (hub#70): `data.result`, as the till reads it.
    data = hub.run("sales.checkout.preview", {"tax_included": True, "items": items(LIMIT)})
    result = (data or {}).get("result") or {}
    hub.check("total of the previewed ticket", result.get("total"), LIMIT)
    hub.check("cash_limit in the preview", result.get("cash_limit"), LIMIT)


def main() -> int:
    hub = Hub("cash_limit.hub")
    print(
        f"Hub battery · cash limit (sales#498) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    ensure_spanish_hub(hub)
    cash = cash_method_id(hub)
    card = card_method_id(hub)
    test_just_below_the_limit_closes(hub, cash)
    test_cash_at_the_limit_is_refused(hub, cash)
    test_a_mixed_payment_does_not_escape(hub, cash, card)
    test_card_closes_any_amount(hub, card)
    test_the_preview_publishes_the_limit(hub)
    return hub.finish(
        "a Spanish hub refuses cash from 1.000 € on, mixed payments included, against the real kernel"
    )


if __name__ == "__main__":
    sys.exit(main())
