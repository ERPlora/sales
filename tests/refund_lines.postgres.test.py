#!/usr/bin/env python3
"""A refund records WHICH lines of the sale go back, and a line goes back once (services#158),
against a REAL Postgres 18.

A ticket with a haircut and a voucher; the customer returns only the voucher. `sales.refund` now
takes the lines the operator marked, writes one `sales_sale_refund_line` row per line
(`sales._insert_refund_line`) and announces them on `sale.refunded`, so `services` voids the
voucher of THAT line. If the same line could go back twice, the second refund would make
`services` void ANOTHER voucher of the same package: the handler refuses it with the read
`sales.refund_lines`, and the statement re-checks it inside the transaction (the read is taken
before it, and two refunds of the same sale queue on `_refund_lock.sql`).

What is under test — each statement played the way the kernel plays a handler's output: ONE
transaction, the declared `expect_rows` judged on the rows of the statement it anchors:

  1. The voucher line goes back: one row, and `sales.refund_lines` names it (and only it).
  2. A second refund naming the same line is refused with `sales.refund_line_already_returned`
     and writes nothing — no head, no money, no line.
  3. A line of another sale is never recorded under this one.
  4. Tenancy: a neighbour hub reads none of this hub's returned lines and cannot record one.
  5. Each guard of the statement holds on its own (a missing head, another sale's head, a
     neighbour's forged head).
  6. A soft-deleted returned line is neither listed nor blocks the line from going back.

Usage: tests/refund_lines.postgres.test.py
  `erplora-test-pg-5433` by default (override: SALES_TEST_PG_CONTAINER). Creates a scratch
  database and DROPS it at the end, pass or fail. Never skips itself: without Postgres it fails.
"""

import os
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pg_harness
from pg_harness import MANIFEST, Session, sale_header_params, sale_line_params

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-manager"
NOW = "2026-10-08T11:00:00+00:00"
DAY = "20261008"
CUT = 2000  # 20,00 €
VOUCHER = 5000  # 50,00 €
CHARGED = CUT + VOUCHER


def method(hub: str) -> str:
    return f"pm-card-{hub}"


def seed_sale(s: Session, sale_id: str, hub: str = HUB) -> None:
    """A 70,00 € ticket charged by card: a haircut line and a voucher line."""
    s.command_ok(
        f"the card method ({sale_id}, {hub})",
        "sales.create_payment_method",
        {
            "new_id": f"{method(hub)}-{sale_id}",
            "name": "Card",
            "type": "card",
            "sort_order": 0,
        },
        hub=hub,
    )
    s.command_ok(
        f"the day counter ({sale_id}, {hub})",
        "sales._bump_counter",
        {"day": DAY, "new_id": f"cnt-{hub}-{sale_id}"},
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
            payment_method_id=f"{method(hub)}-{sale_id}",
            payment_method_name="Card",
            idempotency_key=f"idem-{hub}-{sale_id}",
        ),
        hub=hub,
    )
    for line_id, product, total in (
        (f"{sale_id}-cut", "svc-cut", CUT),
        (f"{sale_id}-voucher", "pkg-5", VOUCHER),
    ):
        s.command_ok(
            f"line {line_id} ({hub})",
            "sales._insert_line",
            sale_line_params(
                line_id=line_id,
                sale_id=sale_id,
                product_id=product,
                product_name=product,
                is_service=1,
                unit_price=total,
                net_amount=total,
                line_total=total,
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
            "payment_method_id": f"{method(hub)}-{sale_id}",
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
    refund_id: str,
    sale_id: str,
    amount: int,
    lines: list,
    hub: str,
    verdict: int = 0,
) -> list:
    """The operations `sales.refund` emits, in its order: head, leg, returned lines, mark."""
    calls = [
        (
            "sales._insert_refund",
            {
                "refund_id": refund_id,
                "sale_id": sale_id,
                "total": amount,
                "reason": "returns the voucher",
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
                "payment_method_id": f"{method(hub)}-{sale_id}",
                "payment_method_name": "Card",
                "payment_method_type": "card",
                "amount": amount,
                "sort_order": 0,
            },
        ),
    ]
    for idx, (line_id, product) in enumerate(lines):
        calls.append(
            (
                "sales._insert_refund_line",
                {
                    "refund_line_id": f"{refund_id}-line-{idx}",
                    "refund_id": refund_id,
                    "sale_id": sale_id,
                    "sale_item_id": line_id,
                    "product_id": product,
                    "quantity": 1_000_000,
                },
            )
        )
    calls.append(
        ("sales._mark_refunded", {"sale_id": sale_id, "fully_refunded": verdict})
    )
    return calls


def first_missed_gate(calls: list, rows: list) -> str:
    """The code the kernel answers for a chain: the first command whose `expect_rows` (op `min`)
    missed on the statement it anchors, or `ok`. Read from module.json, so a gate that is not
    DECLARED is a gate that does not exist here either."""
    for name, _ in calls:
        spec = MANIFEST["commands"].get(name)
        if spec is None:
            return f"undeclared command {name}"
        gate = spec.get("expect_rows")
        if not gate:
            continue
        anchor = gate.get("statement", spec["sql"][-1])
        touched = [n for (cmd, rel, n) in rows if cmd == name and rel == anchor]
        # A command played more than once (one row per returned line): every run must hold.
        if not touched or min(touched) < gate["n"]:
            return gate["error"]
    return "ok"


ROLLBACK = "\\echo '@@ end end'\nROLLBACK;\n"


def play(s: Session, calls: list, hub: str = HUB) -> str:
    """Run the chain like the kernel: judged, then COMMIT if every gate held."""
    if any(name not in MANIFEST["commands"] for name, _ in calls):
        return "undeclared command"
    script = "\n".join(["BEGIN;", *s._chain_script(calls, hub=hub)]) + "\n"
    res = subprocess.run(
        s._chain_cmd(), input=script + ROLLBACK, capture_output=True, text=True
    )
    if res.returncode != 0:
        return f"sql error: {(res.stderr or res.stdout).strip().splitlines()[-1]}"
    verdict = first_missed_gate(calls, Session._rows_per_statement(res.stdout))
    if verdict == "ok":
        ok, err, _ = s.chain(calls, hub=hub)
        if not ok:
            return f"sql error: {err.splitlines()[-1]}"
    return verdict


def returned(s: Session, sale_id: str, hub: str = HUB) -> list:
    return sorted(
        r.get("sale_item_id")
        for r in s.query("sales.refund_lines", {"sale_id": sale_id}, hub=hub)
    )


def refunded(s: Session, sale_id: str, hub: str = HUB) -> int:
    return s.qi(
        "SELECT COALESCE(SUM(amount), 0) FROM sales_sale_refund_payment "
        f"WHERE sale_id = '{sale_id}' AND hub_id = '{hub}' AND is_deleted = 0"
    )


def step_1_the_voucher_line_goes_back(s: Session) -> None:
    print("\n1 · the voucher line of a ticket with a haircut goes back")
    seed_sale(s, "sale-1")
    s.check(
        "the refund with its line goes through",
        play(
            s, refund_calls("r1", "sale-1", VOUCHER, [("sale-1-voucher", "pkg-5")], HUB)
        ),
        "ok",
    )
    s.check(
        "sales.refund_lines names the voucher line, only it",
        returned(s, "sale-1"),
        ["sale-1-voucher"],
    )
    rows = s.query("sales.refund_lines", {"sale_id": "sale-1"})
    s.check(
        "...with the refund that took it back", Session.field(rows, "refund_id"), "r1"
    )
    s.check("...and its product", Session.field(rows, "product_id"), "pkg-5")


def step_2_the_same_line_twice_is_refused(s: Session) -> None:
    print("\n2 · a second refund naming the same line is refused and writes nothing")
    s.check(
        "refused",
        play(s, refund_calls("r2", "sale-1", CUT, [("sale-1-voucher", "pkg-5")], HUB)),
        "sales.refund_line_already_returned",
    )
    s.check("...no money went out with it", refunded(s, "sale-1"), VOUCHER)
    s.check(
        "...and the line is still returned once",
        returned(s, "sale-1"),
        ["sale-1-voucher"],
    )
    s.check(
        "the haircut can still go back (and closes the sale)",
        play(
            s,
            refund_calls(
                "r3", "sale-1", CUT, [("sale-1-cut", "svc-cut")], HUB, verdict=1
            ),
        ),
        "ok",
    )
    s.check(
        "both lines are returned now",
        returned(s, "sale-1"),
        ["sale-1-cut", "sale-1-voucher"],
    )


def step_3_a_line_of_another_sale_is_not_recorded(s: Session) -> None:
    print("\n3 · a line of another sale is never recorded under this one")
    seed_sale(s, "sale-3a")
    seed_sale(s, "sale-3b")
    s.check(
        "refused",
        play(
            s,
            refund_calls("r4", "sale-3a", VOUCHER, [("sale-3b-voucher", "pkg-5")], HUB),
        ),
        "sales.refund_line_already_returned",
    )
    s.check(
        "...nothing recorded on either sale",
        returned(s, "sale-3a") + returned(s, "sale-3b"),
        [],
    )


def step_4_tenancy(s: Session) -> None:
    print("\n4 · a neighbour hub reads none of it and cannot record this hub's line")
    seed_sale(s, "sale-4n", hub=OTHER_HUB)
    s.check(
        "the neighbour reads no returned line of this hub's sale",
        returned(s, "sale-1", hub=OTHER_HUB),
        [],
    )
    s.check(
        "the neighbour naming this hub's line under its own sale is refused",
        play(
            s,
            refund_calls(
                "r5", "sale-4n", VOUCHER, [("sale-1-cut", "svc-cut")], OTHER_HUB
            ),
            hub=OTHER_HUB,
        ),
        "sales.refund_line_already_returned",
    )
    s.check(
        "the neighbour returns its own voucher line",
        play(
            s,
            refund_calls(
                "r6", "sale-4n", VOUCHER, [("sale-4n-voucher", "pkg-5")], OTHER_HUB
            ),
            hub=OTHER_HUB,
        ),
        "ok",
    )
    s.check("...which this hub does not see", returned(s, "sale-4n"), [])
    s.check(
        "...and the neighbour does",
        returned(s, "sale-4n", hub=OTHER_HUB),
        ["sale-4n-voucher"],
    )


def one_line(refund_id: str, sale_id: str, line_id: str) -> list:
    """`sales._insert_refund_line` ALONE: each of its guards judged without the rest of the chain
    covering for it (the head would already refuse most of these cases)."""
    return [
        (
            "sales._insert_refund_line",
            {
                "refund_line_id": f"{refund_id}-{line_id}",
                "refund_id": refund_id,
                "sale_id": sale_id,
                "sale_item_id": line_id,
                "product_id": "pkg-5",
                "quantity": 1_000_000,
            },
        )
    ]


def step_5_each_guard_on_its_own(s: Session) -> None:
    print("\n5 · each guard of the statement holds on its own")
    seed_sale(s, "sale-5")
    s.check(
        "the haircut of sale-5 goes back (sale-5 has a real head now)",
        play(s, refund_calls("r7", "sale-5", CUT, [("sale-5-cut", "svc-cut")], HUB)),
        "ok",
    )
    s.check(
        "a line under a head that does not exist is refused",
        play(s, one_line("r-ghost", "sale-5", "sale-5-voucher")),
        "sales.refund_line_already_returned",
    )
    s.check(
        "a line under the head of ANOTHER sale is refused",
        play(s, one_line("r1", "sale-5", "sale-5-voucher")),
        "sales.refund_line_already_returned",
    )
    # A head in the neighbour hub that names THIS hub's sale.
    s.q(
        "INSERT INTO sales_sale_refund (id, hub_id, sale_id, total, reason, note, "
        "idempotency_key, is_deleted) "
        f"VALUES ('r-forged', '{OTHER_HUB}', 'sale-5', {VOUCHER}, 'forged', '', 'r-forged', 0)"
    )
    s.check(
        "this hub naming the neighbour's head is refused",
        play(s, one_line("r-forged", "sale-5", "sale-5-voucher")),
        "sales.refund_line_already_returned",
    )
    s.check(
        "the neighbour's head cannot record this hub's line",
        play(s, one_line("r-forged", "sale-5", "sale-5-voucher"), hub=OTHER_HUB),
        "sales.refund_line_already_returned",
    )
    s.check(
        "...only the haircut is returned on sale-5",
        returned(s, "sale-5"),
        ["sale-5-cut"],
    )
    s.check(
        "...and nothing under the neighbour",
        s.qi(
            "SELECT COUNT(*) FROM sales_sale_refund_line "
            f"WHERE hub_id = '{OTHER_HUB}' AND sale_id = 'sale-5'"
        ),
        0,
    )
    # A returned line in the NEIGHBOUR hub that names this hub's line id must not count as
    # «already returned» here: only this hub's own refunds can take the line back.
    s.q(
        "INSERT INTO sales_sale_refund_line (id, hub_id, refund_id, sale_id, sale_item_id, "
        "product_id, quantity, is_deleted) "
        f"VALUES ('rl-forged', '{OTHER_HUB}', 'r-forged', 'sale-5', 'sale-5-voucher', "
        "'pkg-5', 1000000, 0)"
    )
    s.check(
        "a neighbour's returned line does not block this hub's own voucher line",
        play(
            s,
            refund_calls(
                "r8", "sale-5", VOUCHER, [("sale-5-voucher", "pkg-5")], HUB, verdict=1
            ),
        ),
        "ok",
    )
    s.check(
        "...which is now returned here",
        returned(s, "sale-5"),
        ["sale-5-cut", "sale-5-voucher"],
    )


def step_6_a_deleted_returned_line_does_not_count(s: Session) -> None:
    print("\n6 · a soft-deleted returned line is neither listed nor blocks the line")
    seed_sale(s, "sale-6")
    s.q(
        "INSERT INTO sales_sale_refund (id, hub_id, sale_id, total, reason, note, "
        "idempotency_key, is_deleted) "
        f"VALUES ('r-old', '{HUB}', 'sale-6', {VOUCHER}, 'old', '', 'r-old', 1)"
    )
    s.q(
        "INSERT INTO sales_sale_refund_line (id, hub_id, refund_id, sale_id, sale_item_id, "
        "product_id, quantity, is_deleted) "
        f"VALUES ('rl-old', '{HUB}', 'r-old', 'sale-6', 'sale-6-voucher', 'pkg-5', 1000000, 1)"
    )
    s.check("a deleted returned line is not listed", returned(s, "sale-6"), [])
    s.check(
        "...and does not block the voucher line from going back",
        play(
            s, refund_calls("r9", "sale-6", VOUCHER, [("sale-6-voucher", "pkg-5")], HUB)
        ),
        "ok",
    )
    s.check("...which is now returned", returned(s, "sale-6"), ["sale-6-voucher"])


def main() -> int:
    print(
        f"→ services#158 · a refund records the lines that go back, once ({pg_harness.CONTAINER})"
    )
    s = Session(f"sales_refund_lines_test_{os.getpid()}", hub=HUB, user=USER, now=NOW)
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        step_1_the_voucher_line_goes_back(s)
        step_2_the_same_line_twice_is_refused(s)
        step_3_a_line_of_another_sale_is_not_recorded(s)
        step_4_tenancy(s)
        step_5_each_guard_on_its_own(s)
        step_6_a_deleted_returned_line_does_not_count(s)
    finally:
        s.drop()
    return s.report(
        "a refund records which lines go back, a line goes back once, and a neighbour hub neither "
        "reads nor records them (services#158)"
    )


if __name__ == "__main__":
    sys.exit(main())
