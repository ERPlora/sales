#!/usr/bin/env python3
"""Refunds of the SAME ticket fired at the same time (sales#506) against the REAL kernel.

One after another, `sales.refund` already keeps the money inside what was charged: the second one
is refused with «more than what is left». What only a live runtime with its own Postgres can prove
is the other half — two tablets confirming the same refund in the same instant, or one operator
firing several requests in a burst. The cap used to be read BEFORE the transaction
(`sales.refund_options` in `reads`), so every request saw the same «nothing refunded yet» and all
of them went through: a 15,00 € ticket ended with 30,00 € or 50,00 € handed back.

Each round fires its requests from separate threads released by one barrier, with DIFFERENT
idempotency keys (the same key is a retry, sales#160, and is covered elsewhere). The sales are
charged by CARD: the race does not depend on the method, and a cash refund would move the drawer
that `void_chain.hub.test.py` measures in the same hub. The judge is what the hub stored
afterwards, read through its own queries:

  1. Two full refunds at once: exactly one goes through; the other gets the refusal a refund on an
     already-refunded ticket gets (`sales.refund_requires_completed`); 15,00 € came back, not 30.
  2. Five partial refunds of 10,00 € at once on 15,00 €: exactly one goes through, the other four
     are refused with `sales.refund_exceeds_tender`; 10,00 € came back and the sale is still live.
  3. Two partial refunds of 7,50 € at once on 15,00 €: BOTH fit, both go through, and the sale
     ends `refunded` — the «is it fully refunded now?» decision cannot ride on the stale read either.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys
import threading

import hub_harness
from hub_harness import ONE, Hub, card_method_id, cents, key

CHARGED = 1500  # 15,00 € in cents
ROUNDS = 5


def charge(hub: Hub, card: str, tag: str) -> str:
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key(tag),
            "payment_method_id": card,
            "tax_included": True,
            "items": [
                {
                    "product_name": "Café",
                    "price": CHARGED,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    return out["new_ids"][0]


def leg_of(hub: Hub, sale_id: str) -> str:
    legs = hub.query("sales.refund_options", {"sale_id": sale_id})
    if len(legs) != 1:
        raise AssertionError(f"a one-tender sale has one leg: {legs}")
    return legs[0]["payment_id"]


def fire_at_once(
    hub: Hub, sale_id: str, payment_id: str, amounts: list, tag: str
) -> list:
    """Fires one `sales.refund` per amount, all released by the same barrier. Answers, in order:
    `"ok"` for a refund that went through, its domain code for a refusal, `HTTP <n>` otherwise."""
    barrier = threading.Barrier(len(amounts))
    answers: list = [None] * len(amounts)

    def one(i: int, amount: int) -> None:
        payload = {
            "sale_id": sale_id,
            "reason": "race",
            "idempotency_key": key(f"{tag}-{i}"),
            "allocations": [{"payment_id": payment_id, "amount": amount}],
        }
        barrier.wait()
        status, body = hub.command("sales.refund", payload)
        if status == 200 and (body or {}).get("ok"):
            answers[i] = "ok"
        else:
            code = (
                ((body or {}).get("error") or {}).get("code")
                if isinstance(body, dict)
                else None
            )
            answers[i] = code or f"HTTP {status}"

    threads = [threading.Thread(target=one, args=(i, a)) for i, a in enumerate(amounts)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return answers


def refunded(hub: Hub, sale_id: str) -> int:
    return sum(
        cents(r["total"]) for r in hub.query("sales.refunds", {"sale_id": sale_id})
    )


def legs_refunded(hub: Hub, sale_id: str) -> int:
    return sum(
        cents(o["refunded"])
        for o in hub.query("sales.refund_options", {"sale_id": sale_id})
    )


def status(hub: Hub, sale_id: str) -> str:
    rows = hub.query("sales.get", {"sale_id": sale_id})
    return rows[0]["status"] if rows else ""


def test_two_full_refunds_at_once(hub: Hub, card: str) -> None:
    print(f"\n1 · two full refunds of 15,00 € at once, {ROUNDS} rounds")
    for r in range(ROUNDS):
        sale_id = charge(hub, card, f"full-{r}")
        out = fire_at_once(
            hub, sale_id, leg_of(hub, sale_id), [CHARGED, CHARGED], f"full-{r}"
        )
        hub.check(
            f"round {r}: answers",
            sorted(out),
            sorted(["ok", "sales.refund_requires_completed"]),
        )
        hub.check(f"round {r}: refund documents total", refunded(hub, sale_id), CHARGED)
        hub.check(f"round {r}: refund legs total", legs_refunded(hub, sale_id), CHARGED)
        hub.check(f"round {r}: sale status", status(hub, sale_id), "refunded")


def test_five_partials_at_once(hub: Hub, card: str) -> None:
    print(f"\n2 · five partial refunds of 10,00 € at once on 15,00 €, {ROUNDS} rounds")
    for r in range(ROUNDS):
        sale_id = charge(hub, card, f"burst-{r}")
        out = fire_at_once(hub, sale_id, leg_of(hub, sale_id), [1000] * 5, f"burst-{r}")
        hub.check(
            f"round {r}: answers",
            sorted(out),
            sorted(["ok"] + ["sales.refund_exceeds_tender"] * 4),
        )
        hub.check(f"round {r}: refund documents total", refunded(hub, sale_id), 1000)
        hub.check(f"round {r}: refund legs total", legs_refunded(hub, sale_id), 1000)
        hub.check(f"round {r}: sale status", status(hub, sale_id), "completed")


def test_two_partials_that_fit_close_the_sale(hub: Hub, card: str) -> None:
    print(f"\n3 · two partial refunds of 7,50 € at once on 15,00 €, {ROUNDS} rounds")
    for r in range(ROUNDS):
        sale_id = charge(hub, card, f"halves-{r}")
        out = fire_at_once(
            hub, sale_id, leg_of(hub, sale_id), [750, 750], f"halves-{r}"
        )
        hub.check(f"round {r}: answers", out, ["ok", "ok"])
        hub.check(f"round {r}: refund documents total", refunded(hub, sale_id), CHARGED)
        hub.check(f"round {r}: sale status", status(hub, sale_id), "refunded")


def main() -> int:
    hub = Hub("refund_race.hub")
    print(
        f"Hub battery · concurrent refunds (sales#506) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    card = card_method_id(hub)
    test_two_full_refunds_at_once(hub, card)
    test_five_partials_at_once(hub, card)
    test_two_partials_that_fit_close_the_sale(hub, card)
    return hub.finish(
        "refunds of the same ticket fired at once never hand back more than was charged"
    )


if __name__ == "__main__":
    sys.exit(main())
