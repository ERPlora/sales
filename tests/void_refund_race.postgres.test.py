#!/usr/bin/env python3
"""A void and a refund of the SAME ticket at the same time (sales#511), against a REAL Postgres 18.

One after another the two doors already exclude each other: a sale with refunds cannot be voided
(`sales.sale_already_refunded`, sales#247) and a voided sale cannot be refunded
(`sales.refund_requires_completed`). Both rules are re-checked inside the transaction, by the
`WHERE` of the statement that writes. What was left open is the moment they arrive TOGETHER:

  * a partial refund in flight held the sale (`_refund_lock.sql`, sales#506) and the void's UPDATE
    waited on that row; when it was released Postgres re-checked the row's own conditions but NOT
    the `NOT EXISTS (… refunds …)` subquery, which kept its old snapshot — and a partial refund does
    not touch the sale row. The sale ended `voided` with money handed back on top.
  * a void in flight made the refund's head write nothing, but its leg still fitted the cap and
    crashed on the foreign key to the head that was never written: the cashier read the generic
    «could not complete» instead of the refusal with its reason.

The kernel plays every operation a handler emits in ONE transaction and judges each command's
`expect_rows` by the rows ITS statement touched. This battery plays the same chains with
`Session.chain`/`Session.hold` and reads those per-statement counts, so «the gate fires» is
asserted as the kernel would see it, and puts one request «in flight» (an open transaction holding
its locks) instead of racing for it — every point here is deterministic. The racing version, with
the real kernel answering the codes, is `refund_race.hub.test.py` §4-6.

Points:

  1. CONTROL — a clean sale voids through the full chain.
  2. A partial refund in flight: the void WAITS, and then voids nothing (gate → already refunded).
  3. A void in flight: the refund WAITS, and then writes nothing, without a SQL error (the head's
     gate → refund requires completed).
  4. A void in flight: a second void waits and is refused as already voided, not as refunded.
  5. A sale a full refund just closed: the void is refused as REFUNDED, not as «already voided».
  6. The void's still-open check is scoped: a deleted sale, and the neighbour hub, never pass it.
  7. A refund leg only lands under ITS OWN head: the same refund id in the neighbour hub, on
     another sale of this hub, or another head of the same sale does not let it through.

Usage: tests/void_refund_race.postgres.test.py — container `erplora-test-pg-5433` by default
(override: SALES_TEST_PG_CONTAINER). Scratch database, dropped at the end. Never skips itself.
"""

import os
import pathlib
import sys
import threading
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pg_harness
from pg_harness import Session, sale_header_params

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-manager"
NOW = "2026-10-04T11:00:00+00:00"
DAY = "20261004"
CHARGED = 1_500  # 15,00 €, one card leg
HALF = 750
WAIT = 1.5  # seconds a request is left blocked before the one in flight commits


# ── Seeding, through the manifest's doors ──────────────────────────────────────────────────


def seed_card_method(s: Session, hub: str) -> None:
    s.command_ok(
        f"the card method ({hub})",
        "sales.create_payment_method",
        {"new_id": f"pm-card-{hub}", "name": "Card", "type": "card", "sort_order": 0},
        hub=hub,
    )


def seed_sale(s: Session, sale_id: str, hub: str = HUB) -> None:
    """A completed sale of 15,00 € charged by ONE card leg (`pay-<sale_id>`)."""
    s.command_ok(
        f"day counter ({sale_id})",
        "sales._bump_counter",
        {"day": DAY, "new_id": f"cnt-{hub}-{DAY}"},
        hub=hub,
    )
    s.command_ok(
        f"sale {sale_id} charged",
        "sales._insert_sale",
        sale_header_params(
            sale_id=sale_id,
            day=DAY,
            subtotal=CHARGED,
            total=CHARGED,
            amount_tendered=CHARGED,
            payment_method_id=f"pm-card-{hub}",
            payment_method_name="Card",
            idempotency_key=f"idem-{hub}-{sale_id}",
        ),
        hub=hub,
    )
    s.command_ok(
        f"its charge leg ({sale_id})",
        "sales._insert_payment",
        {
            "payment_id": f"pay-{sale_id}",
            "sale_id": sale_id,
            "sort_order": 0,
            "payment_method_id": f"pm-card-{hub}",
            "payment_method_name": "Card",
            "payment_method_type": "card",
            "amount": CHARGED,
            "amount_tendered": CHARGED,
            "change_due": 0,
            "reference": "",
        },
        hub=hub,
    )


# ── The chains the handlers emit (handler/src/lib.rs: void_sale_inner, refund_sale_inner) ──


def void_ops(sale_id: str, reason: str = "the manager picked the wrong sale") -> list:
    return [
        ("sales._void_lock", {"sale_id": sale_id}),
        (
            "sales._void_sale",
            {"sale_id": sale_id, "void_reason": reason, "voided_by": USER},
        ),
    ]


def refund_ops(sale_id: str, refund_id: str, amount: int, hub: str = HUB) -> list:
    return [
        (
            "sales._insert_refund",
            {
                "refund_id": refund_id,
                "sale_id": sale_id,
                "total": amount,
                "reason": "race",
                "note": "",
                "idempotency_key": refund_id,
            },
        ),
        (
            "sales._insert_refund_payment",
            {
                "refund_payment_id": f"{refund_id}-{sale_id}-leg",
                "refund_id": refund_id,
                "sale_id": sale_id,
                "payment_id": f"pay-{sale_id}",
                "payment_method_id": f"pm-card-{hub}",
                "payment_method_name": "Card",
                "payment_method_type": "card",
                "amount": amount,
                "sort_order": 0,
            },
        ),
        ("sales._mark_refunded", {"sale_id": sale_id}),
    ]


def rows_of(counts: list, sql_file: str):
    """Rows the statement `commands/<sql_file>` touched — what the kernel's gate reads."""
    hits = [n for (_cmd, rel, n) in counts if rel == f"commands/{sql_file}"]
    return hits[0] if len(hits) == 1 else f"<{len(hits)} runs of {sql_file}>"


def in_background(s: Session, calls: list, hub: str = HUB):
    """Starts `s.chain(calls)` in a thread. Returns `(thread, result_box)`."""
    box: dict = {}

    def run() -> None:
        box["result"] = s.chain(calls, hub=hub)

    t = threading.Thread(target=run)
    t.start()
    return t, box


def status_of(s: Session, sale_id: str, hub: str = HUB) -> str:
    return s.q(
        f"SELECT status FROM sales_sale WHERE id = '{sale_id}' AND hub_id = '{hub}'"
    )


def refunds_of(s: Session, sale_id: str) -> int:
    return s.qi(
        f"SELECT COALESCE(SUM(amount), 0) FROM sales_sale_refund_payment"
        f" WHERE sale_id = '{sale_id}' AND hub_id = '{HUB}'"
    )


def first_error(err: str) -> str:
    return err.splitlines()[0] if err else ""


# ── 1 · control ────────────────────────────────────────────────────────────────────────────


def step_1_a_clean_sale_voids(s: Session) -> None:
    print("\n1 · CONTROL — a clean sale voids through the whole chain")
    seed_sale(s, "sale-clean")
    ok, err, counts = s.chain(void_ops("sale-clean"))
    s.check("the void chain runs", (ok, first_error(err)), (True, ""))
    s.check("the still-open check passes", rows_of(counts, "_void_open.sql"), 1)
    s.check("the void writes its row", rows_of(counts, "_void_sale.sql"), 1)
    s.check("the sale is voided", status_of(s, "sale-clean"), "voided")


# ── 2 · refund in flight, void arrives ─────────────────────────────────────────────────────


def step_2_a_refund_in_flight_makes_the_void_wait_and_lose(s: Session) -> None:
    print(
        "\n2 · a partial refund of 7,50 € IN FLIGHT: the void waits and then voids nothing"
    )
    seed_sale(s, "sale-r-first")
    held = s.hold(refund_ops("sale-r-first", "ref-in-flight", HALF))
    time.sleep(0.5)
    thread, box = in_background(s, void_ops("sale-r-first"))
    time.sleep(WAIT)
    s.check("the void is queued behind the refund", thread.is_alive(), True)
    ok, out, counts = held.commit()
    s.check("the refund commits", (ok, first_error(out) if not ok else ""), (True, ""))
    s.check(
        "the refund wrote its leg", rows_of(counts, "_insert_refund_payment.sql"), 1
    )
    thread.join(timeout=30)
    ok, err, counts = box.get("result", (False, "no answer", []))
    s.check("the void runs without a SQL error", (ok, first_error(err)), (True, ""))
    s.check(
        "the void's write touches NO row — its gate answers sales.sale_already_refunded",
        rows_of(counts, "_void_sale.sql"),
        0,
    )
    s.check("the sale is still completed", status_of(s, "sale-r-first"), "completed")
    s.check("with its 7,50 € refunded", refunds_of(s, "sale-r-first"), HALF)
    s.check(
        "and no void trace",
        s.q(
            "SELECT COALESCE(void_reason, '') FROM sales_sale"
            f" WHERE id = 'sale-r-first' AND hub_id = '{HUB}'"
        ),
        "",
    )


# ── 3 · void in flight, refund arrives ─────────────────────────────────────────────────────


def step_3_a_void_in_flight_makes_the_refund_wait_and_lose_by_name(s: Session) -> None:
    print(
        "\n3 · a void IN FLIGHT: the refund waits and then writes nothing, without a SQL error"
    )
    for amount, label in ((HALF, "partial"), (CHARGED, "full")):
        sale_id = f"sale-v-first-{label}"
        seed_sale(s, sale_id)
        held = s.hold(void_ops(sale_id))
        time.sleep(0.5)
        thread, box = in_background(s, refund_ops(sale_id, f"ref-late-{label}", amount))
        time.sleep(WAIT)
        s.check(
            f"{label}: the refund is queued behind the void", thread.is_alive(), True
        )
        ok, out, _counts = held.commit()
        s.check(f"{label}: the void commits", ok, True)
        thread.join(timeout=30)
        ok, err, counts = box.get("result", (False, "no answer", []))
        # Before sales#511 the leg still fitted the cap and died on the foreign key to a head that
        # was never written: a SQL error, which the kernel reports as the generic `db`.
        s.check(
            f"{label}: the refund runs without a SQL error",
            (ok, first_error(err)),
            (True, ""),
        )
        s.check(
            f"{label}: its head writes NO row — the gate answers sales.refund_requires_completed",
            rows_of(counts, "_insert_refund.sql"),
            0,
        )
        s.check(
            f"{label}: its leg writes no row either",
            rows_of(counts, "_insert_refund_payment.sql"),
            0,
        )
        s.check(f"{label}: the sale stays voided", status_of(s, sale_id), "voided")
        s.check(f"{label}: nothing was handed back", refunds_of(s, sale_id), 0)


# ── 4 · two voids ──────────────────────────────────────────────────────────────────────────


def step_4_a_second_void_waits_and_is_refused_as_already_voided(s: Session) -> None:
    print(
        "\n4 · a void IN FLIGHT: a second void waits and is refused as ALREADY VOIDED"
    )
    seed_sale(s, "sale-two-voids")
    held = s.hold(void_ops("sale-two-voids", "first"))
    time.sleep(0.5)
    thread, box = in_background(s, void_ops("sale-two-voids", "second"))
    time.sleep(WAIT)
    s.check("the second void is queued behind the first", thread.is_alive(), True)
    s.check("the first void commits", held.commit()[0], True)
    thread.join(timeout=30)
    ok, err, counts = box.get("result", (False, "no answer", []))
    s.check(
        "the second void runs without a SQL error", (ok, first_error(err)), (True, "")
    )
    # The still-open check is the FIRST gate: it fires before the refunds one, so the second void
    # reads «already voided», not «already has refunds» (which would be a lie: it has none).
    s.check(
        "its still-open check touches NO row — the gate answers sales.already_voided",
        rows_of(counts, "_void_open.sql"),
        0,
    )
    s.check(
        "the first reason stays",
        s.q(
            f"SELECT void_reason FROM sales_sale WHERE id = 'sale-two-voids' AND hub_id = '{HUB}'"
        ),
        "first",
    )


# ── 5 · a sale a full refund just closed ───────────────────────────────────────────────────


def step_5_a_fully_refunded_sale_is_refused_as_refunded(s: Session) -> None:
    print("\n5 · a sale a full refund just closed: the void is refused as REFUNDED")
    seed_sale(s, "sale-full")
    ok, err, _ = s.chain(refund_ops("sale-full", "ref-full", CHARGED))
    s.check("the full refund lands", (ok, first_error(err)), (True, ""))
    s.check("the sale is refunded", status_of(s, "sale-full"), "refunded")
    ok, err, counts = s.chain(void_ops("sale-full"))
    s.check("the void runs without a SQL error", (ok, first_error(err)), (True, ""))
    s.check(
        "the still-open check passes (a refunded sale is not «already voided»)",
        rows_of(counts, "_void_open.sql"),
        1,
    )
    s.check(
        "and the void's write touches NO row — the gate answers sales.sale_already_refunded",
        rows_of(counts, "_void_sale.sql"),
        0,
    )
    s.check("the sale stays refunded", status_of(s, "sale-full"), "refunded")


# ── 6 · the still-open check is scoped ─────────────────────────────────────────────────────


def step_6_the_still_open_check_is_scoped(s: Session) -> None:
    print(
        "\n6 · the still-open check: a deleted sale and the neighbour hub never pass it"
    )
    seed_sale(s, "sale-deleted")
    s.psql(
        [
            "-c",
            f"UPDATE sales_sale SET is_deleted = 1 WHERE id = 'sale-deleted' AND hub_id = '{HUB}'",
        ]
    )
    ok, err, counts = s.chain(void_ops("sale-deleted"))
    s.check("deleted: the chain runs", (ok, first_error(err)), (True, ""))
    s.check(
        "deleted: the still-open check touches no row",
        rows_of(counts, "_void_open.sql"),
        0,
    )

    seed_sale(s, "sale-mine")
    ok, err, counts = s.chain(void_ops("sale-mine"), hub=OTHER_HUB)
    s.check("neighbour: the chain runs", (ok, first_error(err)), (True, ""))
    s.check(
        "neighbour: the still-open check touches no row of this hub",
        rows_of(counts, "_void_open.sql"),
        0,
    )
    s.check("and my sale is untouched", status_of(s, "sale-mine"), "completed")


# ── 7 · a leg only lands under its own head ────────────────────────────────────────────────


def step_7_a_leg_only_lands_under_its_own_head(s: Session) -> None:
    print("\n7 · a refund leg only lands under ITS OWN head")

    # 7a — the neighbour has a head with the same id, on its own sale. My sale is voided, so my
    # head writes nothing; my leg must not hang from the neighbour's head.
    seed_sale(s, "sale-their", hub=OTHER_HUB)
    ok, err, _ = s.chain(
        refund_ops("sale-their", "ref-shared", HALF, hub=OTHER_HUB), hub=OTHER_HUB
    )
    s.check(
        "7a: the neighbour's refund lands on its own sale",
        (ok, first_error(err)),
        (True, ""),
    )
    seed_sale(s, "sale-7a")
    s.check("7a: my sale is voided", s.chain(void_ops("sale-7a"))[0], True)
    ok, err, counts = s.chain(refund_ops("sale-7a", "ref-shared", HALF))
    s.check(
        "7a: my refund runs without a SQL error", (ok, first_error(err)), (True, "")
    )
    s.check(
        "7a: my leg writes no row", rows_of(counts, "_insert_refund_payment.sql"), 0
    )
    s.check("7a: nothing handed back on my sale", refunds_of(s, "sale-7a"), 0)

    # 7b — the same id is a head of ANOTHER sale of this hub.
    seed_sale(s, "sale-7b-other")
    ok, err, _ = s.chain(refund_ops("sale-7b-other", "ref-7b", HALF))
    s.check(
        "7b: a refund of another sale of mine lands", (ok, first_error(err)), (True, "")
    )
    seed_sale(s, "sale-7b")
    s.check("7b: this sale is voided", s.chain(void_ops("sale-7b"))[0], True)
    ok, err, counts = s.chain(refund_ops("sale-7b", "ref-7b", HALF))
    s.check(
        "7b: the refund runs without a SQL error", (ok, first_error(err)), (True, "")
    )
    s.check(
        "7b: its leg writes no row", rows_of(counts, "_insert_refund_payment.sql"), 0
    )
    s.check("7b: nothing handed back on this sale", refunds_of(s, "sale-7b"), 0)

    # 7c — the SAME sale has another head (an earlier partial refund), and this refund's head
    # writes nothing because the sale was deleted since. The leg must look for ITS head by id.
    seed_sale(s, "sale-7c")
    ok, err, _ = s.chain(refund_ops("sale-7c", "ref-7c-1", HALF))
    s.check("7c: the earlier partial refund lands", (ok, first_error(err)), (True, ""))
    s.psql(
        [
            "-c",
            f"UPDATE sales_sale SET is_deleted = 1 WHERE id = 'sale-7c' AND hub_id = '{HUB}'",
        ]
    )
    ok, err, counts = s.chain(refund_ops("sale-7c", "ref-7c-2", HALF))
    s.check(
        "7c: the late refund runs without a SQL error",
        (ok, first_error(err)),
        (True, ""),
    )
    s.check(
        "7c: its leg writes no row", rows_of(counts, "_insert_refund_payment.sql"), 0
    )
    s.check(
        "7c: only the earlier 7,50 € were handed back", refunds_of(s, "sale-7c"), HALF
    )


# ── Runner ─────────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print(
        f"→ sales#511 · a void and a refund of the same ticket at once ({pg_harness.CONTAINER})"
    )
    s = Session(
        f"sales_void_refund_race_test_{os.getpid()}", hub=HUB, user=USER, now=NOW
    )
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        seed_card_method(s, HUB)
        seed_card_method(s, OTHER_HUB)
        step_1_a_clean_sale_voids(s)
        step_2_a_refund_in_flight_makes_the_void_wait_and_lose(s)
        step_3_a_void_in_flight_makes_the_refund_wait_and_lose_by_name(s)
        step_4_a_second_void_waits_and_is_refused_as_already_voided(s)
        step_5_a_fully_refunded_sale_is_refused_as_refunded(s)
        step_6_the_still_open_check_is_scoped(s)
        step_7_a_leg_only_lands_under_its_own_head(s)
    finally:
        s.drop()

    return s.report(
        "a void and a refund of the same ticket never both land: the late one waits, writes "
        "nothing and is refused by its own gate, never by a SQL error (sales#511)"
    )


if __name__ == "__main__":
    sys.exit(main())
