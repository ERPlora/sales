#!/usr/bin/env python3
"""A refund never announces «this one does not close the sale» when it does (sales#508), against a
REAL Postgres 18.

`sales.refund` says on its `sale.refunded` event, and in its answer, whether the refund closed the
sale (`fully_refunded`). `invoice` rectifies with it and a flow can trigger on it. The handler
computes it from `sales.refund_options`, read BEFORE the transaction: two partial refunds of 7,50 €
fired at once on a 15,00 € ticket both read «nothing refunded yet», both go through, the sale ends
`refunded` (`_mark_refunded` decides that against the rows, sales#506) — and BOTH events said
«this one does not close it». The handler cannot know better: what it read is all it has.

So the handler hands its verdict to the mark (`fully_refunded` 0/1) and `_refund_verdict.sql`, run
right after `_mark_refunded.sql` in the same transaction, matches the sale only when the mark agrees
with it. 0 rows is the command's `expect_rows` → `sales.refund_sale_changed`, the transaction rolls
back and the operator confirms again: the retry reads fresh and closes the sale saying so.

What is under test — each statement played the way the kernel plays a handler's output: ONE
transaction, the declared `expect_rows` judged on the rows of the statement it anchors:

  1. One after another: the second partial that closes the sale, sent with the stale «does not
     close», is refused and writes nothing; sent with «closes», it goes through.
  2. The other direction: a partial announced as «closes» is refused too.
  3. At the same time, for real: the second refund waits on `_refund_lock.sql` while the first one
     is in flight, and is judged with what the first one committed.
  4. Tenancy: a neighbour's sale with the SAME id, already `refunded`, never vouches for a verdict
     about this hub's sale.

Usage: tests/refund_verdict.postgres.test.py
  `erplora-test-pg-5433` by default (override: SALES_TEST_PG_CONTAINER). Creates a scratch
  database and DROPS it at the end, pass or fail. Never skips itself: without Postgres it fails.
"""

import os
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pg_harness
from pg_harness import MANIFEST, Session, sale_header_params

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-cashier"
NOW = "2026-10-04T11:00:00+00:00"
CHARGED = 1500  # 15,00 €
HALF = 750
DAY = "20261004"


# ── Seeding, through the manifest's doors ────────────────────────────────────────────────


def method(hub: str) -> str:
    return f"pm-card-{hub}"


def seed_method(s: Session, hub: str) -> None:
    s.command_ok(
        f"the card method ({hub})",
        "sales.create_payment_method",
        {"new_id": method(hub), "name": "Card", "type": "card", "sort_order": 0},
        hub=hub,
    )


def seed_sale(s: Session, sale_id: str, hub: str = HUB) -> None:
    """A 15,00 € sale charged by card in ONE leg. Its fiscal number comes from the day counter,
    the same sequence the handler runs: without it `sale_number` is born NULL."""
    s.command_ok(
        f"the day counter ({sale_id}, {hub})",
        "sales._bump_counter",
        {"day": DAY, "new_id": f"cnt-{hub}-{DAY}"},
        hub=hub,
    )
    s.command_ok(
        f"sale {sale_id} charged ({hub})",
        "sales._insert_sale",
        sale_header_params(
            sale_id=sale_id,
            day=DAY,
            subtotal=CHARGED,
            total=CHARGED,
            amount_tendered=CHARGED,
            payment_method_id=method(hub),
            payment_method_name="Card",
            idempotency_key=f"idem-{hub}-{sale_id}",
        ),
        hub=hub,
    )
    s.command_ok(
        f"its leg ({sale_id}, {hub})",
        "sales._insert_payment",
        {
            "payment_id": f"pay-{sale_id}",
            "sale_id": sale_id,
            "sort_order": 0,
            "payment_method_id": method(hub),
            "payment_method_name": "Card",
            "payment_method_type": "card",
            "amount": CHARGED,
            "amount_tendered": CHARGED,
            "change_due": 0,
            "reference": "",
        },
        hub=hub,
    )


def refund_calls(
    refund_id: str, sale_id: str, amount: int, verdict: int, hub: str
) -> list:
    """The operations `sales.refund` emits, in its order: head, leg, mark (with its verdict)."""
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
                "refund_payment_id": f"{refund_id}-leg",
                "refund_id": refund_id,
                "sale_id": sale_id,
                "payment_id": f"pay-{sale_id}",
                "payment_method_id": method(hub),
                "payment_method_name": "Card",
                "payment_method_type": "card",
                "amount": amount,
                "sort_order": 0,
            },
        ),
        ("sales._mark_refunded", {"sale_id": sale_id, "fully_refunded": verdict}),
    ]


# ── The kernel's judgement ───────────────────────────────────────────────────────────────


def first_missed_gate(calls: list, rows: list) -> str:
    """The code the kernel answers for a chain: the first command whose `expect_rows` (op `min`)
    missed on the statement it anchors, or `ok`. Read from module.json, so a gate that is not
    DECLARED is a gate that does not exist here either."""
    for name, _ in calls:
        gate = MANIFEST["commands"][name].get("expect_rows")
        if not gate:
            continue
        sql = MANIFEST["commands"][name]["sql"]
        anchor = gate.get("statement", sql[-1])
        touched = [n for (cmd, rel, n) in rows if cmd == name and rel == anchor]
        if not touched or touched[0] < gate["n"]:
            return gate["error"]
    return "ok"


def script(s: Session, calls: list, hub: str) -> str:
    return "\n".join(["BEGIN;", *s._chain_script(calls, hub=hub)]) + "\n"


# The harness reads a SELECT's rows as the lines after its marker; this closes the last statement
# before the ROLLBACK, so the word «ROLLBACK» is never counted as a row of it.
ROLLBACK = "\\echo '@@ end end'\nROLLBACK;\n"


def play(s: Session, calls: list, hub: str = HUB) -> str:
    """Run the chain like the kernel: judged, then COMMIT if every gate held, ROLLBACK if not."""
    res = subprocess.run(
        s._chain_cmd(),
        input=script(s, calls, hub) + ROLLBACK,
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        return f"sql error: {(res.stderr or res.stdout).strip().splitlines()[-1]}"
    verdict = first_missed_gate(calls, Session._rows_per_statement(res.stdout))
    if verdict == "ok":
        ok, err, _ = s.chain(calls, hub=hub)
        if not ok:
            return f"sql error: {err.splitlines()[-1]}"
    return verdict


def status_of(s: Session, sale_id: str, hub: str = HUB) -> str:
    return s.q(
        f"SELECT status FROM sales_sale WHERE id = '{sale_id}' AND hub_id = '{hub}'"
    )


def refunded(s: Session, sale_id: str, hub: str = HUB) -> int:
    return s.qi(
        "SELECT COALESCE(SUM(amount), 0) FROM sales_sale_refund_payment "
        f"WHERE sale_id = '{sale_id}' AND hub_id = '{hub}' AND is_deleted = 0"
    )


# ── 1 · one after another ────────────────────────────────────────────────────────────────


def step_1_the_closing_refund_sent_as_partial_is_refused(s: Session) -> None:
    print(
        "\n1 · 7,50 € + 7,50 € on 15,00 €: the second one, sent as «does not close», is refused"
    )
    seed_sale(s, "sale-1")
    s.check(
        "the first half goes through",
        play(s, refund_calls("r1-a", "sale-1", HALF, 0, HUB)),
        "ok",
    )
    s.check("...and leaves the sale completed", status_of(s, "sale-1"), "completed")

    s.check(
        "the second half with the stale verdict is refused",
        play(s, refund_calls("r1-b", "sale-1", HALF, 0, HUB)),
        "sales.refund_sale_changed",
    )
    s.check("...writes no money", refunded(s, "sale-1"), HALF)
    s.check("...and no mark", status_of(s, "sale-1"), "completed")

    s.check(
        "confirmed again, it reads fresh and says it closes: it goes through",
        play(s, refund_calls("r1-b", "sale-1", HALF, 1, HUB)),
        "ok",
    )
    s.check("the sale is refunded", status_of(s, "sale-1"), "refunded")
    s.check("with exactly what was charged", refunded(s, "sale-1"), CHARGED)


# ── 2 · the other direction ──────────────────────────────────────────────────────────────


def step_2_a_partial_announced_as_closing_is_refused(s: Session) -> None:
    print("\n2 · a 7,50 € partial announced as «closes the sale» is refused")
    seed_sale(s, "sale-2")
    s.check(
        "refused",
        play(s, refund_calls("r2-a", "sale-2", HALF, 1, HUB)),
        "sales.refund_sale_changed",
    )
    s.check("...writes no money", refunded(s, "sale-2"), 0)
    s.check(
        "a whole refund announced as closing goes through",
        play(s, refund_calls("r2-b", "sale-2", CHARGED, 1, HUB)),
        "ok",
    )
    s.check("...and the sale is refunded", status_of(s, "sale-2"), "refunded")


# ── 3 · at the same time ─────────────────────────────────────────────────────────────────


def waiting_on_a_lock(s: Session) -> int:
    return s.qi(
        "SELECT count(*) FROM pg_stat_activity "
        f"WHERE datname = '{s.db}' AND wait_event_type = 'Lock'"
    )


def holding_open(s: Session) -> int:
    # A held transaction that has run all its statements — and so owns its row locks — sits
    # «idle in transaction» until `.commit()`.
    return s.qi(
        "SELECT count(*) FROM pg_stat_activity "
        f"WHERE datname = '{s.db}' AND state = 'idle in transaction'"
    )


def step_3_at_once_the_second_is_judged_on_what_the_first_committed(s: Session) -> None:
    print(
        "\n3 · two halves at once: the second waits on the lock and is judged on fresh rows"
    )
    seed_sale(s, "sale-3")
    first_calls = refund_calls("r3-a", "sale-3", HALF, 0, HUB)
    second_calls = refund_calls(
        "r3-b", "sale-3", HALF, 0, HUB
    )  # read before the first committed

    first = s.hold(first_calls, hub=HUB)
    # `docker exec psql` starts late: without this wait the second one can take the lock first
    # and the battery measures the wrong order (1 run in 3 on 06/10).
    deadline = time.time() + 10
    while holding_open(s) < 1 and time.time() < deadline:
        time.sleep(0.05)
    s.check("the first refund holds its lock", holding_open(s), 1)
    second = subprocess.Popen(
        s._chain_cmd(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    second.stdin.write(script(s, second_calls, HUB) + ROLLBACK)
    second.stdin.flush()

    deadline = time.time() + 10
    while waiting_on_a_lock(s) < 1 and time.time() < deadline:
        time.sleep(0.05)
    s.check("the second refund is queued behind the first", waiting_on_a_lock(s), 1)

    ok, out, first_rows = first.commit()
    s.check("the first half commits", ok, True)
    s.check("...and its gates held", first_missed_gate(first_calls, first_rows), "ok")

    out, _ = second.communicate("", timeout=30)
    s.check("the second ran to the end", second.returncode, 0)
    s.check(
        "the second, announced as «does not close», is refused",
        first_missed_gate(second_calls, Session._rows_per_statement(out)),
        "sales.refund_sale_changed",
    )


# ── 4 · the neighbour ────────────────────────────────────────────────────────────────────


def step_4_a_neighbours_sale_never_vouches(s: Session) -> None:
    # `sales_sale.id` is the primary key of the whole table, so no two hubs share a sale id: the
    # way a neighbour's row could vouch for a verdict here is THIS hub's mark naming the
    # neighbour's sale. The mark itself writes nothing there (its own `hub_id`); the verdict must
    # not find the neighbour's `refunded` row either.
    print("\n4 · a neighbour's refunded sale vouches for nothing in this hub")
    seed_sale(s, "sale-4n", hub=OTHER_HUB)
    s.check(
        "the neighbour refunds its sale whole",
        play(s, refund_calls("r4-n", "sale-4n", CHARGED, 1, OTHER_HUB), hub=OTHER_HUB),
        "ok",
    )
    s.check(
        "the neighbour's sale is refunded",
        status_of(s, "sale-4n", OTHER_HUB),
        "refunded",
    )
    calls = [("sales._mark_refunded", {"sale_id": "sale-4n", "fully_refunded": 1})]
    s.check(
        "this hub's mark «closes» on that id is refused",
        play(s, calls),
        "sales.refund_sale_changed",
    )


def main() -> int:
    print(
        f"→ sales#508 · a refund's «fully refunded» is what the database wrote ({pg_harness.CONTAINER})"
    )
    s = Session(f"sales_refund_verdict_test_{os.getpid()}", hub=HUB, user=USER, now=NOW)
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        seed_method(s, HUB)
        seed_method(s, OTHER_HUB)
        step_1_the_closing_refund_sent_as_partial_is_refused(s)
        step_2_a_partial_announced_as_closing_is_refused(s)
        step_3_at_once_the_second_is_judged_on_what_the_first_committed(s)
        step_4_a_neighbours_sale_never_vouches(s)
    finally:
        s.drop()
    return s.report(
        "a refund that closes the sale never goes out saying it does not, alone or at the same "
        "time as another, and a neighbour's sale never vouches for it (sales#508)"
    )


if __name__ == "__main__":
    sys.exit(main())
