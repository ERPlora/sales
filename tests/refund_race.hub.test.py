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

And a VOID of the same ticket fired with them (sales#511) — before, both went through (a 15,00 €
ticket ended voided with 7,50 € or 15,00 € handed back on top), and once refunds queued on the sale
the refund that lost to a void died with the generic `db`:

  4. A void and a partial refund of 7,50 € at once: whichever wins, the hub ends in ITS state and
     the loser gets its own refusal — `sales.refund_requires_completed` for a refund that came after
     the void, `sales.sale_already_refunded` for a void that came after the refund. Never both.
  5. The same with a full refund of 15,00 €.
  6. Two voids at once: one goes through, the other is refused with `sales.already_voided` instead
     of answering `ok` a second time.

Who wins is up to the race; what is checked is that every round ends in one of the two legal
outcomes. The order is pinned deterministically, with one request held in flight, in
`void_refund_race.postgres.test.py`.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys
import threading
import time

import hub_harness
from hub_harness import ONE, Hub, card_method_id, cents, key

CHARGED = 1500  # 15,00 € in cents
ROUNDS = 5
# How late the void leaves after the refund, per round of §4-5. Fired together the void wins almost
# every time (its handler reads less); leaving a few milliseconds later lets the refund win some
# rounds too — through the void's gate, not only through its handler's read — so both outcomes are
# walked against the real kernel and not only the one the scheduler happens to prefer.
VOID_DELAYS = [0.0, 0.0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15]


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


def fire_together(hub: Hub, calls: list, delays: list | None = None) -> list:
    """Fires every `(command, payload)` from its own thread, all released by the same barrier
    (each one `delays[i]` seconds after it, when given). Answers, in order: `"ok"` for a command
    that went through, its domain code for a refusal, `HTTP <n>` otherwise — so a bare `db` error
    is an answer the checks can see and refuse."""
    barrier = threading.Barrier(len(calls))
    answers: list = [None] * len(calls)
    delays = delays or [0.0] * len(calls)

    def one(i: int, name: str, payload: dict) -> None:
        barrier.wait()
        if delays[i]:
            time.sleep(delays[i])
        status, body = hub.command(name, payload)
        if status == 200 and (body or {}).get("ok"):
            answers[i] = "ok"
        else:
            code = (
                ((body or {}).get("error") or {}).get("code")
                if isinstance(body, dict)
                else None
            )
            answers[i] = code or f"HTTP {status}"

    threads = [
        threading.Thread(target=one, args=(i, name, payload))
        for i, (name, payload) in enumerate(calls)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return answers


def refund_call(sale_id: str, payment_id: str, amount: int, tag: str) -> tuple:
    return (
        "sales.refund",
        {
            "sale_id": sale_id,
            "reason": "race",
            "idempotency_key": key(tag),
            "allocations": [{"payment_id": payment_id, "amount": amount}],
        },
    )


def void_call(sale_id: str) -> tuple:
    return ("sales.void", {"sale_id": sale_id, "reason": "race"})


def fire_at_once(
    hub: Hub, sale_id: str, payment_id: str, amounts: list, tag: str
) -> list:
    """One `sales.refund` per amount, each with its own idempotency key, all fired together."""
    return fire_together(
        hub,
        [
            refund_call(sale_id, payment_id, amount, f"{tag}-{i}")
            for i, amount in enumerate(amounts)
        ],
    )


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


def void_against_refund(hub: Hub, card: str, amount: int, tag: str) -> None:
    """One void and one refund of `amount` on the same ticket, fired together. Either may win; the
    hub must end in the state of the winner and the loser must get ITS refusal, by name."""
    for r, delay in enumerate(VOID_DELAYS):
        sale_id = charge(hub, card, f"{tag}-{r}")
        void_answer, refund_answer = fire_together(
            hub,
            [
                void_call(sale_id),
                refund_call(sale_id, leg_of(hub, sale_id), amount, f"{tag}-{r}"),
            ],
            delays=[delay, 0.0],
        )
        state = status(hub, sale_id)
        back = refunded(hub, sale_id)
        print(f"  round {r} (void {delay * 1000:.0f} ms late): {'the void' if state == 'voided' else 'the refund'} won")
        if state == "voided":
            # The void won: nothing may have been handed back on top of it.
            hub.check(f"round {r}: void answer (void won)", void_answer, "ok")
            hub.check(
                f"round {r}: refund answer (void won)",
                refund_answer,
                "sales.refund_requires_completed",
            )
            hub.check(f"round {r}: refunded on a voided sale", back, 0)
            hub.check(f"round {r}: refund legs on a voided sale", legs_refunded(hub, sale_id), 0)
        else:
            # The refund won: the sale keeps it, and the void is refused for it.
            hub.check(f"round {r}: refund answer (refund won)", refund_answer, "ok")
            hub.check(
                f"round {r}: void answer (refund won)",
                void_answer,
                "sales.sale_already_refunded",
            )
            hub.check(f"round {r}: refunded", back, amount)
            hub.check(
                f"round {r}: sale status (refund won)",
                state,
                "refunded" if amount == CHARGED else "completed",
            )


def test_void_and_partial_refund_at_once(hub: Hub, card: str) -> None:
    print(f"\n4 · a void and a partial refund of 7,50 € at once on 15,00 €, {len(VOID_DELAYS)} rounds")
    void_against_refund(hub, card, 750, "void-half")


def test_void_and_full_refund_at_once(hub: Hub, card: str) -> None:
    print(f"\n5 · a void and a full refund of 15,00 € at once, {len(VOID_DELAYS)} rounds")
    void_against_refund(hub, card, CHARGED, "void-full")


def test_two_voids_at_once(hub: Hub, card: str) -> None:
    print(f"\n6 · two voids of the same ticket at once, {ROUNDS} rounds")
    for r in range(ROUNDS):
        sale_id = charge(hub, card, f"void-twice-{r}")
        out = fire_together(hub, [void_call(sale_id), void_call(sale_id)])
        hub.check(
            f"round {r}: answers", sorted(out), sorted(["ok", "sales.already_voided"])
        )
        hub.check(f"round {r}: sale status", status(hub, sale_id), "voided")


def main() -> int:
    hub = Hub("refund_race.hub")
    print(
        f"Hub battery · concurrent refunds and voids (sales#506, sales#511) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    card = card_method_id(hub)
    test_two_full_refunds_at_once(hub, card)
    test_five_partials_at_once(hub, card)
    test_two_partials_that_fit_close_the_sale(hub, card)
    test_void_and_partial_refund_at_once(hub, card)
    test_void_and_full_refund_at_once(hub, card)
    test_two_voids_at_once(hub, card)
    return hub.finish(
        "refunds and voids of the same ticket fired at once never hand back more than was "
        "charged, and the one that loses is refused by name"
    )


if __name__ == "__main__":
    sys.exit(main())
