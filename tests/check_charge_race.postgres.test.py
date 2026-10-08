#!/usr/bin/env python3
"""Charging a check while one of its lines is voided or removed (sales#545), against a REAL Postgres.

`sales.complete_sale` reads the lines of the open check BEFORE its transaction (`sales.order.lines`
in `reads`). A void (`sales.order.void_line`) or a removal (`sales.order.remove_line`) committed
between that read and the checkout's writes went through, and so did the checkout: the sale
charged the plate the house had just voided, and the check said one total and the ticket another.

The fix is `_refund_lock.sql`'s recipe on the CHECK:

  * every door that takes a line off the check, and the checkout, first queue on the check's row
    (`commands/_order_lock.sql`, `SELECT … FOR UPDATE`) in a statement of its own;
  * the statements after it take a fresh snapshot (READ COMMITTED) and re-check: the checkout
    that the check is still open (`_order_open.sql`) and that every line it charges is still live
    and unpaid (`_order_line_live.sql`), both gated by `expect_rows` → `sales.order_changed`; the
    void that the check is still open (it already did); the removal, now, that too.

Whoever takes the check first wins and the other is refused by name, never both «ok».

The kernel plays every operation a handler emits in ONE transaction and judges each command's
`expect_rows` by the rows ITS statement touched. This battery plays the same chains with
`Session.chain`/`Session.hold`, reads those per-statement counts, and decides «queued» by asking
Postgres (`pg_stat_activity`: a backend waiting on a lock), never by a fixed sleep.

Points:

  1. CONTROL — a clean check charges through the queue and the re-checks.
  2. A void IN FLIGHT: the checkout waits, then is refused (`sales.order_changed`), the plate
     voided and not charged.
  3. A removal IN FLIGHT: same, for a line not yet sent.
  4. A checkout IN FLIGHT: the void waits, then is refused (`sales.order_line_not_voidable`) and
     the removal too (`sales.order_line_not_removable`): the charged lines stay on the check.
  5. Two checkouts of the same check at once: the second waits, then is refused — one sale.
  6. The screen is stale (the void already committed, nothing in flight): refused.
  7. The re-checks are scoped: a line of another check, a paid line, a deleted line, a deleted
     check, a check not open, and the neighbour hub naming our ids never pass them.
  8. The removal is scoped the same way: a paid, already removed or foreign line, a line of a
     check that is not open, and the neighbour hub reaching across, are all refused.
  9. The queue is per hub: the neighbour naming our check is answered at once, never queued
     behind our checkout.
 10-15. sales#546: the doors that change the check (quantity, comp, add, split, join).
 16-20. sales#553: a line or ticket discount put on or taken off — in flight, behind a checkout
     in flight (also a partial one), committed before the checkout queues, and the re-checks
     scoped to the row, the check and the hub.
 21. sales#554: a line split while another device changes its quantity (2 → 3, 3 → 2) or puts a
     discount on it — in flight or committed before the split queues: the split is refused
     (`sales.order_changed`) instead of losing or inventing a unit; the neighbour never gets in.

Usage: tests/check_charge_race.postgres.test.py — container `erplora-test-pg-5433` by default
(override: SALES_TEST_PG_CONTAINER). Scratch database, dropped at the end. Never skips itself.
"""

import json
import os
import pathlib
import subprocess
import sys
import threading
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session, bind

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text(encoding="utf-8"))

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
NOW = "2026-10-07T13:00:00+00:00"
CHANGED = "sales.order_changed"
DEADLINE = 15.0  # seconds a poll waits for Postgres to show the state it expects
ONE = 1_000_000  # one unit, fixed point 10⁶ (ADR-0147)


# ── Seeding ────────────────────────────────────────────────────────────────────────────────


def open_check(
    s: Session, order_id: str, status: str = "open", deleted: int = 0
) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted,"
                " created_at, updated_at) VALUES (:id, :hub_id, :status, 0, :deleted, :now, :now)",
                {
                    "id": order_id,
                    "hub_id": HUB,
                    "status": status,
                    "deleted": deleted,
                    "now": NOW,
                },
            ),
        ]
    )


def add_line(
    s: Session,
    order_id: str,
    line_id: str,
    line_total: int,
    fired: bool = True,
    sale_id=None,
    deleted: int = 0,
    hub: str = HUB,
    quantity: int = 1_000_000,
) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name,"
                " product_sku, quantity, unit_price, is_gift, gift_reason, line_total,"
                " tax_category_key, cost, round_no, fired_at, sale_id, is_deleted, created_by,"
                " updated_by, created_at, updated_at) VALUES (:id, :hub_id, :order_id, 'p-dish',"
                " 'Dish', '', :quantity, :line_total, 0, '', :line_total, '', 0, 1, :fired_at,"
                " :sale_id, :deleted, 'u-waiter', 'u-waiter', :now, :now)",
                {
                    "id": line_id,
                    "hub_id": hub,
                    "order_id": order_id,
                    "line_total": line_total,
                    "fired_at": NOW if fired else None,
                    "sale_id": sale_id,
                    "deleted": deleted,
                    "quantity": quantity,
                    "now": NOW,
                },
            ),
        ]
    )
    if not deleted and sale_id is None and hub == HUB:
        s.psql(
            [
                "-c",
                bind(
                    "UPDATE sales_order SET provisional_total = provisional_total + :t"
                    " WHERE id = :id AND hub_id = :hub_id",
                    {"t": line_total, "id": order_id, "hub_id": HUB},
                ),
            ]
        )


def steak_and_water(s: Session, order_id: str, water_fired: bool = True) -> None:
    """The issue's check: Entrecot 18,00 € (sent) + Agua 2,00 €."""
    open_check(s, order_id)
    add_line(s, order_id, f"{order_id}-steak", 1800)
    add_line(s, order_id, f"{order_id}-water", 200, fired=water_fired)


# ── The chains (handler/src/lib.rs: complete_sale_inner; module.json: the line doors) ──────


def checkout_ops(
    order_id: str,
    line_ids: list,
    qty=None,
    gift=None,
    partial: bool = False,
    disc=None,
    ticket=(0.0, 0),
) -> list:
    """What `sales.complete_sale` emits around the sale for a charge of `order_id`: the queue and
    the re-checks first — each row with the quantity, the comp flag and the discount the payload
    charges it at (sales#546, sales#553; one unit, not a comp, no discount unless `qty`/`gift`/
    `disc` say otherwise), when the charge closes the check the proof that no live line is left
    out of it, and the ticket discount it charges (`ticket` = percent, fixed amount; a partial
    charge compares the percent alone) —, the sale's own writes (not replayed here: they do not
    decide the race) and last the check's completion, or the marks of a partial charge."""
    qty, gift, disc = qty or {}, gift or {}, disc or {}
    percent, amount = ticket
    ops = [
        ("sales._order_lock", {"order_id": order_id}),
        *[
            (
                "sales._order_line_live",
                {
                    "order_id": order_id,
                    "line_id": l,
                    "quantity": qty.get(l, ONE),
                    "is_gift": gift.get(l, 0),
                    "discount_percent": disc.get(l, 0.0),
                },
            )
            for l in line_ids
        ],
    ]
    ticket_live = (
        "sales._order_discount_live",
        {
            "order_id": order_id,
            "discount_percent": percent,
            "discount_amount": None if partial else amount,
        },
    )
    if partial:
        return ops + [ticket_live] + [
            (
                "sales._mark_order_line_paid",
                {"line_id": l, "sale_id": f"sale-{order_id}"},
            )
            for l in line_ids
        ]
    return ops + [
        ("sales._order_lines_seen", {"order_id": order_id, "line_ids": line_ids}),
        ticket_live,
        ("sales._complete_order", {"order_id": order_id}),
    ]


def void_ops(order_id: str, line_id: str) -> list:
    return [
        (
            "sales.order.void_line",
            {
                "order_id": order_id,
                "line_id": line_id,
                "reason": "race",
                "approved_by": "u-mgr",
            },
        )
    ]


def remove_ops(order_id: str, line_id: str) -> list:
    return [("sales.order.remove_line", {"order_id": order_id, "line_id": line_id})]


def update_ops(
    order_id: str, line_id: str, quantity: int, line_total: int, is_gift=None
) -> list:
    """What `sales.order.update_line` emits (handler `update_order_line_inner`): the queue on the
    check (sales#546), the line, the check's total."""
    return [
        ("sales._order_lock", {"order_id": order_id}),
        (
            "sales._update_order_line",
            {
                "order_id": order_id,
                "line_id": line_id,
                "quantity": quantity,
                "line_total": line_total,
                "increment_value": None,
                "is_gift": is_gift,
                "gift_reason": None,
                "notes": None,
            },
        ),
        ("sales._recompute_order_total", {"order_id": order_id}),
    ]


def new_row(order_id: str, line_id: str, line_total: int, quantity: int = ONE) -> dict:
    """The parameters of `_insert_order_line.sql` for a plain row of one dish."""
    return {
        "id": line_id,
        "order_id": order_id,
        "product_id": "p-dish",
        "product_name": "Dish",
        "product_sku": "",
        "quantity": quantity,
        "unit_price": line_total,
        "is_gift": 0,
        "gift_reason": None,
        "line_total": line_total,
        "tax_category_key": None,
        "cost": None,
        "is_service": None,
        "category_id": None,
        "discount_percent": None,
        "discount_approved_by": None,
        "modifiers": None,
        "notes": None,
        "combo_group_ref": line_id,
        "combo": None,
        "staff_id": None,
        "unit_code": "ud",
        "unit_name": "",
        "factor_num": 1,
        "factor_den": 1,
        "increment_value": ONE,
        "price_quantity_value": ONE,
        "pricing_unit_code": "ud",
        "pricing_unit_name": "",
        "pricing_factor_num": 1,
        "pricing_factor_den": 1,
    }


def add_ops(order_id: str, line_id: str, line_total: int) -> list:
    """What `sales.order.add_line` emits (handler `add_order_line_inner`)."""
    return [
        ("sales._order_lock", {"order_id": order_id}),
        ("sales._insert_order_line", new_row(order_id, line_id, line_total)),
        ("sales._recompute_order_total", {"order_id": order_id}),
    ]


def split_line_ops(
    order_id: str,
    line_id: str,
    unit_total: int,
    clone_id: str,
    read_qty: int = 2 * ONE,
    read_percent: float = 0.0,
) -> list:
    """What `sales.order.split_line` emits (handler `split_order_line_inner`): the source drops to
    one unit and a clone of one is born per extra unit of the quantity it READ (`clone_id`,
    `clone_id-2`, …)."""
    parts = read_qty // ONE
    clones = [clone_id] + [f"{clone_id}-{i}" for i in range(2, parts)]
    return [
        ("sales._order_lock", {"order_id": order_id}),
        # sales#554: the row still says what the parts were counted and priced from.
        (
            "sales._order_line_live",
            {
                "order_id": order_id,
                "line_id": line_id,
                "quantity": read_qty,
                "is_gift": 0,
                "discount_percent": read_percent,
            },
        ),
        (
            "sales._update_order_line",
            {
                "order_id": order_id,
                "line_id": line_id,
                "quantity": ONE,
                "line_total": unit_total,
                "increment_value": None,
                "is_gift": None,
                "gift_reason": None,
                "notes": None,
            },
        ),
        *(
            ("sales._insert_order_line", new_row(order_id, c, unit_total))
            for c in clones
        ),
        ("sales._recompute_order_total", {"order_id": order_id}),
    ]


def split_ops(order_id: str, line_ids: list, new_id: str) -> list:
    return [
        (
            "sales.order.split",
            {"order_id": order_id, "line_ids": line_ids, "new_id": new_id, "label": ""},
        )
    ]


def merge_ops(from_order_id: str, to_order_id: str) -> list:
    return [
        (
            "sales.order.merge",
            {"from_order_id": from_order_id, "to_order_id": to_order_id},
        )
    ]


def gate_statement(name: str) -> str:
    """The statement a command's `expect_rows` counts. Unanchored, the kernel counts the whole
    batch (hub#1091), which for a one-statement command (`sales._set_order_discount`) is that
    statement; a longer unanchored batch is not modelled here and fails loudly."""
    cmd = MANIFEST["commands"][name]
    gate = cmd["expect_rows"]
    if "statement" in gate:
        return gate["statement"]
    if len(cmd["sql"]) != 1:
        raise RuntimeError(f"{name}: unanchored expect_rows over {len(cmd['sql'])} statements")
    return cmd["sql"][0]


def verdict(calls: list, counts: list) -> str:
    """What the kernel answers for a chain it played: the error of the FIRST command whose gated
    statement touched fewer rows than its `expect_rows` asks (the kernel rolls back there), or
    `"ok"`. A command repeated in the chain is matched to its own run of the statement."""
    seen: dict = {}
    for name, _payload in calls:
        gate = MANIFEST["commands"][name].get("expect_rows")
        if not gate:
            continue
        rel = gate_statement(name)
        nth = seen.get(rel, 0)
        seen[rel] = nth + 1
        runs = [rows for (_cmd, r, rows) in counts if r == rel]
        if nth >= len(runs):
            return f"<gate statement {rel!r} of {name} not in the chain>"
        if runs[nth] < gate.get("n", 1):
            return gate["error"]
    return "ok"


def kernel_chain(s: Session, calls: list, hub=None):
    """`s.chain`, but ended the way the kernel ends it (hub `execute_tx_gated`): every statement
    runs, then the gates are judged and the transaction is COMMITTED only if all of them hold —
    a refused chain is ROLLED BACK. `s.chain` always commits, which would leave a refused
    checkout's `_complete_order` written. Same `(ok, error, rows_per_statement)` answer."""
    try:
        body = s._chain_script(calls, hub)
    except RuntimeError as exc:
        return False, str(exc), []
    gated = []
    for name, _payload in calls:
        gate = MANIFEST["commands"][name].get("expect_rows")
        for rel in MANIFEST["commands"][name]["sql"]:
            gated.append(gate["n"] if gate and gate_statement(name) == rel else None)
    script, k = ["BEGIN;"], 0
    for line in body:
        script.append(line)
        if not line.startswith("\\echo"):
            script.append(f"\\set rc_{k} :ROW_COUNT")
            k += 1
    holds = [f":rc_{i} >= {n}" for i, n in enumerate(gated) if n is not None] or [
        "true"
    ]
    script += [
        "\\echo '@@ <kernel> <end>'",
        f"SELECT ({' AND '.join(holds)}) AS kernel_commits \\gset",
        "\\if :kernel_commits",
        "COMMIT;",
        "\\else",
        "ROLLBACK;",
        "\\endif",
    ]
    res = subprocess.run(
        s._chain_cmd(), input="\n".join(script), capture_output=True, text=True
    )
    if res.returncode != 0:
        return False, (res.stderr.strip() or res.stdout.strip()), []
    return True, "", s._rows_per_statement(res.stdout)


def play(s: Session, calls: list, hub=None) -> str:
    ok, err, counts = kernel_chain(s, calls, hub=hub)
    if not ok:
        return f"<sql error: {err.splitlines()[-1] if err else ''}>"
    return verdict(calls, counts)


def hold(s: Session, calls: list):
    """`s.hold(calls)` once Postgres shows its transaction idle with its locks taken."""
    before = idle_in_transaction(s)
    held = s.hold(calls)
    if not poll(lambda: idle_in_transaction(s) > before):
        held.commit()
        raise AssertionError(
            "the transaction put in flight never reached its last statement"
        )
    return held


def in_background(s: Session, calls: list, hub=None):
    """Starts `kernel_chain(s, calls)` in a thread. Returns `(thread, result_box)`."""
    box: dict = {}

    def run() -> None:
        box["result"] = kernel_chain(s, calls, hub=hub)

    t = threading.Thread(target=run)
    t.start()
    return t, box


def finish(s: Session, calls: list, thread, box) -> str:
    thread.join(timeout=60)
    ok, err, counts = box.get("result", (False, "no answer", []))
    if not ok:
        return f"<sql error: {err.splitlines()[-1] if err else ''}>"
    return verdict(calls, counts)


def poll(cond, deadline: float = DEADLINE) -> bool:
    end = time.monotonic() + deadline
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.05)
    return cond()


def idle_in_transaction(s: Session) -> int:
    return s.qi(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
        " AND state = 'idle in transaction'"
    )


def waiting_on_a_lock(s: Session) -> int:
    return s.qi(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
        " AND wait_event_type = 'Lock'"
    )


def line_state(s: Session, line_id: str) -> str:
    return s.q(
        "SELECT is_deleted || '|' || COALESCE(sale_id, '-') FROM sales_order_item"
        f" WHERE id = '{line_id}'"
    )


def check_status(s: Session, order_id: str) -> str:
    return s.q(f"SELECT status FROM sales_order WHERE id = '{order_id}'")


# ── 1 · control ────────────────────────────────────────────────────────────────────────────


def step_1_a_clean_check_charges(s: Session) -> None:
    print("\n1 · CONTROL — a clean check charges through the queue and the re-checks")
    steak_and_water(s, "ord-clean")
    s.check(
        "the checkout is accepted",
        play(s, checkout_ops("ord-clean", ["ord-clean-steak", "ord-clean-water"])),
        "ok",
    )
    s.check("the check is completed", check_status(s, "ord-clean"), "completed")


# ── 2-3 · a line leaving the check in flight, the checkout arrives ─────────────────────────


def a_door_in_flight_makes_the_checkout_wait_and_lose(
    s: Session, label: str, order_id: str, door_calls: list, gone: str
) -> None:
    held = hold(s, door_calls)
    calls = checkout_ops(order_id, [f"{order_id}-steak", f"{order_id}-water"])
    thread, box = in_background(s, calls)
    s.check(
        f"{label}: the checkout is queued behind it",
        poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
        True,
    )
    ok, out, _ = held.commit()
    s.check(
        f"{label}: it commits", (ok, out.splitlines()[-1] if not ok else ""), (True, "")
    )
    s.check(
        f"{label}: the checkout is refused — the check changed while it was being charged",
        finish(s, calls, thread, box),
        CHANGED,
    )
    s.check(
        f"{label}: the line is off the check and unpaid", line_state(s, gone), "1|-"
    )
    s.check(f"{label}: the check is still open", check_status(s, order_id), "open")


def step_2_a_void_in_flight(s: Session) -> None:
    print("\n2 · a void IN FLIGHT: the checkout waits and is refused")
    steak_and_water(s, "ord-void")
    a_door_in_flight_makes_the_checkout_wait_and_lose(
        s, "void", "ord-void", void_ops("ord-void", "ord-void-steak"), "ord-void-steak"
    )


def step_3_a_removal_in_flight(s: Session) -> None:
    print(
        "\n3 · a removal IN FLIGHT (a line not sent yet): the checkout waits and is refused"
    )
    steak_and_water(s, "ord-rm", water_fired=False)
    a_door_in_flight_makes_the_checkout_wait_and_lose(
        s, "removal", "ord-rm", remove_ops("ord-rm", "ord-rm-water"), "ord-rm-water"
    )


# ── 4 · the checkout in flight, a line tries to leave ──────────────────────────────────────


def step_4_a_checkout_in_flight(s: Session) -> None:
    print("\n4 · a checkout IN FLIGHT: the void and the removal wait and are refused")
    for label, door, error in (
        ("void", void_ops, "sales.order_line_not_voidable"),
        ("removal", remove_ops, "sales.order_line_not_removable"),
    ):
        order_id = f"ord-pay-{label}"
        steak_and_water(s, order_id, water_fired=(label == "void"))
        line_id = f"{order_id}-water"
        held = hold(s, checkout_ops(order_id, [f"{order_id}-steak", line_id]))
        calls = door(order_id, line_id)
        thread, box = in_background(s, calls)
        s.check(
            f"{label}: it is queued behind the checkout",
            poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
            True,
        )
        s.check(f"{label}: the checkout commits", held.commit()[0], True)
        s.check(f"{label}: it is refused by name", finish(s, calls, thread, box), error)
        s.check(
            f"{label}: the charged line stays on the check",
            line_state(s, line_id),
            "0|-",
        )
        s.check(
            f"{label}: the check is completed", check_status(s, order_id), "completed"
        )


# ── 5 · two checkouts of one check ─────────────────────────────────────────────────────────


def step_5_two_checkouts_charge_once(s: Session) -> None:
    print(
        "\n5 · two checkouts of the same check at once: the second waits and is refused"
    )
    steak_and_water(s, "ord-twice")
    calls = checkout_ops("ord-twice", ["ord-twice-steak", "ord-twice-water"])
    held = hold(s, calls)
    thread, box = in_background(s, calls)
    s.check(
        "the second checkout is queued behind the first",
        poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
        True,
    )
    s.check("the first checkout commits", held.commit()[0], True)
    s.check("the second is refused", finish(s, calls, thread, box), CHANGED)


# ── 6 · a stale screen ─────────────────────────────────────────────────────────────────────


def step_6_a_stale_screen(s: Session) -> None:
    print(
        "\n6 · the void already committed and the till still charges what it read: refused"
    )
    steak_and_water(s, "ord-stale")
    s.check(
        "the void goes through", play(s, void_ops("ord-stale", "ord-stale-steak")), "ok"
    )
    s.check(
        "the checkout of the stale lines is refused",
        play(s, checkout_ops("ord-stale", ["ord-stale-steak", "ord-stale-water"])),
        CHANGED,
    )
    s.check(
        "the checkout of what is left goes through",
        play(s, checkout_ops("ord-stale", ["ord-stale-water"])),
        "ok",
    )


# ── 7 · the re-checks are scoped ───────────────────────────────────────────────────────────


def step_7_the_rechecks_are_scoped(s: Session) -> None:
    print(
        "\n7 · the re-checks only pass a live, unpaid line of THIS open check of THIS hub"
    )
    open_check(s, "ord-scope")
    add_line(s, "ord-scope", "l-live", 500)
    add_line(s, "ord-scope", "l-paid", 500, sale_id="sale-earlier")
    add_line(s, "ord-scope", "l-deleted", 500, deleted=1)
    open_check(s, "ord-other")
    add_line(s, "ord-other", "l-other", 500)
    open_check(s, "ord-done", status="completed")
    add_line(s, "ord-done", "l-done", 500)
    open_check(s, "ord-voided", status="voided")
    add_line(s, "ord-voided", "l-voided", 500)
    open_check(s, "ord-gone", deleted=1)
    add_line(s, "ord-gone", "l-gone", 500)

    def charge(order_id: str, line_id: str, hub=None) -> str:
        # The queue and the per-line re-check only: `_order_lines_seen` (sales#546) would refuse
        # most of these on its own (l-live is left out) and hide a hole in `_order_line_live`;
        # the ticket's re-check (sales#553) and the completion go too.
        return play(s, checkout_ops(order_id, [line_id])[:-3], hub=hub)

    s.check(
        "a live line of this open check passes", charge("ord-scope", "l-live"), "ok"
    )
    s.check("a line already paid does not", charge("ord-scope", "l-paid"), CHANGED)
    s.check(
        "a line taken off the check does not", charge("ord-scope", "l-deleted"), CHANGED
    )
    s.check("a line of ANOTHER check does not", charge("ord-scope", "l-other"), CHANGED)
    s.check("a completed check does not", charge("ord-done", "l-done"), CHANGED)
    s.check("a voided check does not", charge("ord-voided", "l-voided"), CHANGED)
    s.check("a deleted check does not", charge("ord-gone", "l-gone"), CHANGED)
    s.check(
        "the neighbour hub naming our check and line does not",
        charge("ord-scope", "l-live", hub=OTHER_HUB),
        CHANGED,
    )
    s.check(
        "nor does the neighbour hub reach our line through its own open check",
        play(
            s,
            [("sales._order_line_live", {"order_id": "ord-nb", "line_id": "l-live"})],
            hub=OTHER_HUB,
        )
        if open_neighbour_check(s, "ord-nb")
        else "<seed failed>",
        CHANGED,
    )
    add_line(s, "ord-nb", "l-cross", 500)
    s.check(
        "nor does the neighbour hub pass a row of OUR hub filed under its check's id",
        play(
            s,
            [("sales._order_line_live", {"order_id": "ord-nb", "line_id": "l-cross"})],
            hub=OTHER_HUB,
        ),
        CHANGED,
    )
    s.check(
        "nor does the neighbour hub find our check open by queuing on it alone",
        play(s, [("sales._order_lock", {"order_id": "ord-scope"})], hub=OTHER_HUB),
        CHANGED,
    )


# ── 8 · the removal is scoped ──────────────────────────────────────────────────────────────


def step_8_the_removal_is_scoped(s: Session) -> None:
    print(
        "\n8 · the removal only takes an unsent, unpaid line of THIS open check of THIS hub"
    )
    open_check(s, "rm-open")
    add_line(s, "rm-open", "rm-live", 500, fired=False)
    add_line(s, "rm-open", "rm-paid", 500, fired=False, sale_id="sale-earlier")
    add_line(s, "rm-open", "rm-deleted", 500, fired=False, deleted=1)
    add_line(s, "rm-open", "rm-nb-line", 500, fired=False, hub=OTHER_HUB)
    for order_id, status, deleted in (
        ("rm-other", "open", 0),
        ("rm-done", "completed", 0),
        ("rm-voided", "voided", 0),
        ("rm-gone", "open", 1),
    ):
        open_check(s, order_id, status=status, deleted=deleted)
        add_line(s, order_id, f"{order_id}-line", 500, fired=False)

    def remove(order_id: str, line_id: str, hub=None) -> str:
        return play(s, remove_ops(order_id, line_id), hub=hub)

    refused = "sales.order_line_not_removable"
    s.check("a line already charged stays", remove("rm-open", "rm-paid"), refused)
    s.check(
        "a line already taken off is refused", remove("rm-open", "rm-deleted"), refused
    )
    s.check(
        "a line of ANOTHER check is not taken through this one",
        remove("rm-open", "rm-other-line"),
        refused,
    )
    s.check(
        "a line of a charged check stays (another check of the hub is open)",
        remove("rm-done", "rm-done-line"),
        refused,
    )
    s.check(
        "a line of a voided check stays", remove("rm-voided", "rm-voided-line"), refused
    )
    s.check(
        "a line of a deleted check stays", remove("rm-gone", "rm-gone-line"), refused
    )
    s.check(
        "the neighbour's line is not removed by us",
        remove("rm-open", "rm-nb-line"),
        refused,
    )
    s.check(
        "the neighbour does not remove its line through OUR open check",
        remove("rm-open", "rm-nb-line", hub=OTHER_HUB),
        refused,
    )
    s.check("a live, unsent, unpaid line goes", remove("rm-open", "rm-live"), "ok")
    s.check("and only that one", line_state(s, "rm-live"), "1|-")


# ── 9 · the queue is per hub ───────────────────────────────────────────────────────────────


def step_9_the_neighbour_never_queues_on_our_check(s: Session) -> None:
    print(
        "\n9 · the neighbour hub naming our check is never queued behind our checkout"
    )
    steak_and_water(s, "ord-q")
    held = hold(s, checkout_ops("ord-q", ["ord-q-steak", "ord-q-water"]))
    calls = [("sales._order_lock", {"order_id": "ord-q"})]
    thread, box = in_background(s, calls, hub=OTHER_HUB)
    s.check(
        "it is answered while our checkout is still in flight",
        poll(lambda: not thread.is_alive()),
        True,
    )
    s.check("our checkout commits", held.commit()[0], True)
    s.check("and the neighbour was refused", finish(s, calls, thread, box), CHANGED)


# ── 10-15 · sales#546: the doors that CHANGE the check, against the checkout ───────────────


def qty_of(s: Session, line_id: str) -> str:
    return s.q(f"SELECT quantity FROM sales_order_item WHERE id = '{line_id}'")


def lines_of(s: Session, order_id: str) -> str:
    return s.q(
        "SELECT COALESCE(string_agg(id, ',' ORDER BY id COLLATE \"C\"), '') FROM sales_order_item"
        f" WHERE order_id = '{order_id}' AND is_deleted = 0"
    )


def unsent_check(s: Session, order_id: str) -> None:
    """The issue's check before it goes to the kitchen: Entrecot 18,00 € + Agua 2,00 €, both
    still editable (a line sent to the kitchen no longer changes, SALES-F20)."""
    steak_and_water(s, order_id, water_fired=False)
    s.psql(
        [
            "-c",
            f"UPDATE sales_order_item SET fired_at = NULL WHERE id = '{order_id}-steak'",
        ]
    )


def a_second_table(s: Session, order_id: str) -> None:
    """The check of another table, with its own plate: what a join brings in."""
    open_check(s, order_id)
    add_line(s, order_id, f"{order_id}-paella", 2400)


# label, how the check is seeded, the edit, the quantities the checkout read before the edit
EDITS = (
    (
        "a quantity raised",
        lambda s, o: unsent_check(s, o),
        lambda o: update_ops(o, f"{o}-steak", 2 * ONE, 3600),
        {},
    ),
    (
        "a line added",
        lambda s, o: unsent_check(s, o),
        lambda o: add_ops(o, f"{o}-wine", 1500),
        {},
    ),
    (
        "a line split in two",
        lambda s, o: (
            open_check(s, o),
            add_line(s, o, f"{o}-steak", 3600, fired=False, quantity=2 * ONE),
            add_line(s, o, f"{o}-water", 200, fired=False),
        ),
        lambda o: split_line_ops(o, f"{o}-steak", 1800, f"{o}-steak-2"),
        {"steak": 2 * ONE},
    ),
    (
        "the check split",
        lambda s, o: unsent_check(s, o),
        lambda o: split_ops(o, [f"{o}-water"], f"{o}-half"),
        {},
    ),
    (
        "another table joined into it",
        lambda s, o: (unsent_check(s, o), a_second_table(s, f"{o}-z")),
        lambda o: merge_ops(f"{o}-z", o),
        {},
    ),
)


def read_qty(o: str, qty: dict) -> dict:
    return {f"{o}-{k}": v for k, v in qty.items()}


def step_10_an_edit_in_flight(s: Session) -> None:
    print("\n10 · an edit IN FLIGHT: the checkout waits and is refused")
    for n, (label, seed, edit, qty) in enumerate(EDITS):
        o = f"e10-{n}"
        seed(s, o)
        held = hold(s, edit(o))
        calls = checkout_ops(o, [f"{o}-steak", f"{o}-water"], qty=read_qty(o, qty))
        thread, box = in_background(s, calls)
        s.check(
            f"{label}: the checkout is queued behind it",
            poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
            True,
        )
        s.check(f"{label}: it commits", held.commit()[0], True)
        s.check(
            f"{label}: the checkout is refused — the check changed while it was being charged",
            finish(s, calls, thread, box),
            CHANGED,
        )
        s.check(f"{label}: the check is still open", check_status(s, o), "open")


def step_11_a_checkout_in_flight_refuses_the_edits(s: Session) -> None:
    print("\n11 · a checkout IN FLIGHT: every edit waits and is refused")
    for n, (label, seed, edit, qty) in enumerate(
        EDITS
        + (
            (
                "this check joined into another",
                lambda s, o: (unsent_check(s, o), a_second_table(s, f"{o}-z")),
                lambda o: merge_ops(o, f"{o}-z"),
                {},
            ),
        )
    ):
        o = f"e11-{n}"
        seed(s, o)
        before = lines_of(s, o), qty_of(s, f"{o}-steak"), lines_of(s, f"{o}-z")
        held = hold(
            s, checkout_ops(o, [f"{o}-steak", f"{o}-water"], qty=read_qty(o, qty))
        )
        calls = edit(o)
        thread, box = in_background(s, calls)
        s.check(
            f"{label}: the edit is queued behind the checkout",
            poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
            True,
        )
        s.check(f"{label}: the checkout commits", held.commit()[0], True)
        s.check(
            f"{label}: the edit is refused by name",
            finish(s, calls, thread, box),
            CHANGED,
        )
        s.check(
            f"{label}: the charged check keeps exactly what was charged",
            (lines_of(s, o), qty_of(s, f"{o}-steak"), lines_of(s, f"{o}-z")),
            before,
        )
        s.check(f"{label}: the check is completed", check_status(s, o), "completed")
        s.check(
            f"{label}: no second check was opened",
            s.qi(f"SELECT count(*) FROM sales_order WHERE id = '{o}-half'"),
            0,
        )


def step_12_a_partial_charge_in_flight(s: Session) -> None:
    print(
        "\n12 · a PARTIAL charge in flight: the charged line cannot change, the rest can"
    )
    o = "e12"
    unsent_check(s, o)
    held = hold(s, checkout_ops(o, [f"{o}-steak"], partial=True))
    calls = update_ops(o, f"{o}-steak", 2 * ONE, 3600)
    thread, box = in_background(s, calls)
    s.check(
        "the change of the line being charged is queued behind the charge",
        poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
        True,
    )
    s.check("the partial charge commits", held.commit()[0], True)
    s.check("the change is refused by name", finish(s, calls, thread, box), CHANGED)
    s.check(
        "the charged line keeps the quantity charged", qty_of(s, f"{o}-steak"), str(ONE)
    )
    s.check(
        "a line the charge left on the check still changes",
        play(s, update_ops(o, f"{o}-water", 2 * ONE, 400)),
        "ok",
    )
    s.check("and so it did", qty_of(s, f"{o}-water"), str(2 * ONE))


def step_13_an_edit_committed_before_the_checkout_queues(s: Session) -> None:
    print(
        "\n13 · the edit already committed and the till charges what it read: refused"
    )
    gift = (
        "a line comped",
        lambda s, o: unsent_check(s, o),
        lambda o: update_ops(o, f"{o}-steak", ONE, 0, is_gift=1),
        {},
    )
    now_holds = {
        "a quantity raised": ([], {"steak": 2 * ONE}, {}),
        "a line added": (["wine"], {}, {}),
        "a line split in two": (["steak-2"], {}, {}),
        "the check split": (None, {}, {}),
        "another table joined into it": (["z-paella"], {}, {}),
        "a line comped": ([], {}, {"steak": 1}),
    }
    for n, (label, seed, edit, qty) in enumerate(EDITS + (gift,)):
        o = f"e13-{n}"
        seed(s, o)
        s.check(f"{label}: the edit goes through", play(s, edit(o)), "ok")
        s.check(
            f"{label}: the checkout of what it read is refused",
            play(
                s, checkout_ops(o, [f"{o}-steak", f"{o}-water"], qty=read_qty(o, qty))
            ),
            CHANGED,
        )
        extra, now_qty, now_gift = now_holds[label]
        lines = (
            [f"{o}-steak"]
            + ([] if extra is None else [f"{o}-water"])
            + [f"{o}-{x}" for x in (extra or [])]
        )
        s.check(
            f"{label}: the checkout of what the check now holds goes through",
            play(
                s,
                checkout_ops(
                    o, lines, qty=read_qty(o, now_qty), gift=read_qty(o, now_gift)
                ),
            ),
            "ok",
        )


def step_14_the_new_rechecks_are_scoped(s: Session) -> None:
    print("\n14 · the re-checks of sales#546 compare the right row, and only ours")
    open_check(s, "g-live")
    add_line(s, "g-live", "g-l", 500)

    def live(quantity, is_gift) -> str:
        return play(
            s,
            [
                (
                    "sales._order_line_live",
                    {
                        "order_id": "g-live",
                        "line_id": "g-l",
                        "quantity": quantity,
                        "is_gift": is_gift,
                    },
                )
            ],
        )

    s.check("the quantity and the comp flag the row has pass", live(ONE, 0), "ok")
    s.check("another quantity does not", live(2 * ONE, 0), CHANGED)
    s.check("another comp flag does not", live(ONE, 1), CHANGED)
    s.check("a row only marked as paid compares neither", live(None, None), "ok")

    open_check(s, "g-seen")
    add_line(s, "g-seen", "g-seen-a", 500)
    add_line(s, "g-seen", "g-seen-paid", 500, sale_id="sale-earlier")
    add_line(s, "g-seen", "g-seen-gone", 500, deleted=1)
    add_line(s, "g-seen", "g-seen-nb", 500, hub=OTHER_HUB)
    open_check(s, "g-seen-other")
    add_line(s, "g-seen-other", "g-seen-elsewhere", 500)

    def seen(line_ids, order_id="g-seen") -> str:
        return play(
            s,
            [("sales._order_lines_seen", {"order_id": order_id, "line_ids": line_ids})],
        )

    s.check(
        "every live unpaid line charged: a paid, a removed, another check's and the neighbour's"
        " row under our id do not count",
        seen(["g-seen-a"]),
        "ok",
    )
    s.check("a live line the charge does not carry is caught", seen([]), CHANGED)
    add_line(s, "g-seen", "g-seen-late", 500)
    s.check("and so is a line added after the read", seen(["g-seen-a"]), CHANGED)

    open_check(s, "g-upd")
    add_line(s, "g-upd", "g-upd-live", 500, fired=False)
    add_line(s, "g-upd", "g-upd-fired", 500)
    add_line(s, "g-upd", "g-upd-paid", 500, fired=False, sale_id="sale-earlier")
    add_line(s, "g-upd", "g-upd-gone", 500, fired=False, deleted=1)
    add_line(s, "g-upd", "g-upd-nb", 500, fired=False, hub=OTHER_HUB)
    open_check(s, "g-upd-other")
    add_line(s, "g-upd-other", "g-upd-elsewhere", 500, fired=False)

    def update(line_id: str, hub=None) -> str:
        return play(s, update_ops("g-upd", line_id, 2 * ONE, 1000)[1:2], hub=hub)

    s.check("a line already charged does not change", update("g-upd-paid"), CHANGED)
    s.check(
        "a line sent to the kitchen does not change", update("g-upd-fired"), CHANGED
    )
    s.check("a line taken off does not change", update("g-upd-gone"), CHANGED)
    s.check(
        "a line of another check does not change through this one",
        update("g-upd-elsewhere"),
        CHANGED,
    )
    s.check(
        "the neighbour's line under our check does not change",
        update("g-upd-nb"),
        CHANGED,
    )
    s.check(
        "nor does the neighbour change ours",
        update("g-upd-live", hub=OTHER_HUB),
        CHANGED,
    )
    s.check("a live, unsent, unpaid line changes", update("g-upd-live"), "ok")
    s.check(
        "and none of the others moved",
        s.q(
            "SELECT string_agg(DISTINCT quantity::text, ',') FROM sales_order_item"
            " WHERE id LIKE 'g-upd-%' AND id <> 'g-upd-live'"
        ),
        str(ONE),
    )


def step_15_split_and_join_gates(s: Session) -> None:
    print("\n15 · split and join refuse a check that is no longer theirs to change")
    for order_id, status, deleted in (
        ("j-open", "open", 0),
        ("j-to", "open", 0),
        ("j-done", "completed", 0),
        ("j-voided", "voided", 0),
        ("j-gone", "open", 1),
        ("j-from", "open", 0),
        ("j-from-done", "completed", 0),
        ("j-from-gone", "open", 1),
    ):
        open_check(s, order_id, status=status, deleted=deleted)
        add_line(s, order_id, f"{order_id}-line", 500)
    open_neighbour_check(s, "j-nb")

    s.check(
        "joining into a charged check is refused",
        play(s, merge_ops("j-from", "j-done")),
        CHANGED,
    )
    s.check(
        "joining into a voided check is refused",
        play(s, merge_ops("j-from", "j-voided")),
        CHANGED,
    )
    s.check(
        "joining into a deleted check is refused",
        play(s, merge_ops("j-from", "j-gone")),
        CHANGED,
    )
    s.check(
        "joining into the neighbour's check is refused",
        play(s, merge_ops("j-from", "j-nb")),
        CHANGED,
    )
    s.check(
        "joining a charged check is refused",
        play(s, merge_ops("j-from-done", "j-to")),
        CHANGED,
    )
    s.check(
        "joining a deleted check is refused",
        play(s, merge_ops("j-from-gone", "j-to")),
        CHANGED,
    )
    s.check(
        "joining the neighbour's check is refused",
        play(s, merge_ops("j-nb", "j-to")),
        CHANGED,
    )
    s.check(
        "the lines of the refused joins stayed home",
        lines_of(s, "j-from"),
        "j-from-line",
    )
    s.check("two open checks join", play(s, merge_ops("j-from", "j-to")), "ok")
    s.check("the lines moved", lines_of(s, "j-to"), "j-from-line,j-to-line")
    s.check(
        "replaying the join changes nothing and is not refused",
        play(s, merge_ops("j-from", "j-to")),
        "ok",
    )

    s.check(
        "splitting a charged check is refused",
        play(s, split_ops("j-done", [], "j-done-half")),
        CHANGED,
    )
    s.check(
        "splitting a deleted check is refused",
        play(s, split_ops("j-gone", [], "j-gone-half")),
        CHANGED,
    )
    s.check(
        "the neighbour does not split our check",
        play(s, split_ops("j-open", [], "j-nb-half"), hub=OTHER_HUB),
        CHANGED,
    )
    add_line(s, "j-open", "j-open-paid", 500, sale_id="sale-earlier")
    s.check(
        "splitting off only lines already charged is refused",
        play(s, split_ops("j-open", ["j-open-paid"], "j-paid-half")),
        CHANGED,
    )
    s.check(
        "a blank split of an open check opens the second check",
        play(s, split_ops("j-open", [], "j-open-half")),
        "ok",
    )
    s.check(
        "and only that one",
        s.qi("SELECT count(*) FROM sales_order WHERE id LIKE 'j-%-half'"),
        1,
    )

    steak_and_water(s, "j-q")
    held = hold(s, checkout_ops("j-q", ["j-q-steak", "j-q-water"]))
    calls = merge_ops("j-q", "j-to")
    thread, box = in_background(s, calls, hub=OTHER_HUB)
    s.check(
        "the neighbour joining our checks is answered while our checkout is in flight",
        poll(lambda: not thread.is_alive()),
        True,
    )
    s.check("our checkout commits", held.commit()[0], True)
    s.check("and the neighbour was refused", finish(s, calls, thread, box), CHANGED)


# ── 16-20 · sales#553: a discount put on or taken off while the check is being charged ─────


def line_discount_ops(order_id: str, line_id: str, percent: float, line_total: int) -> list:
    """What `sales.order.set_line_discount` emits (handler `set_order_line_discount_inner`): the
    queue on the check (sales#553), then the line and the check's total."""
    return [
        ("sales._order_lock", {"order_id": order_id}),
        (
            "sales._set_order_line_discount",
            {
                "order_id": order_id,
                "line_id": line_id,
                "discount_percent": percent,
                "line_total": line_total,
                "discount_approved": 0,
                "approved_by": "",
            },
        ),
    ]


def ticket_discount_ops(order_id: str, percent: float, amount: int) -> list:
    """What `sales.order.set_discount` emits (handler `set_order_discount_inner`): the queue on
    the check (sales#553), then the header."""
    return [
        ("sales._order_lock", {"order_id": order_id}),
        (
            "sales._set_order_discount",
            {
                "order_id": order_id,
                "discount_percent": percent,
                "discount_amount": amount,
                "discount_approved": 0,
                "approved_by": "",
            },
        ),
    ]


def line_discounted(s: Session, line_id: str, percent: float, line_total: int) -> None:
    s.psql(
        [
            "-c",
            f"UPDATE sales_order_item SET discount_percent = {percent}, line_total = {line_total}"
            f" WHERE id = '{line_id}'",
        ]
    )


def ticket_discounted(s: Session, order_id: str, percent: float, amount: int) -> None:
    s.psql(
        [
            "-c",
            f"UPDATE sales_order SET discount_percent = {percent}, discount_amount = {amount}"
            f" WHERE id = '{order_id}'",
        ]
    )


def discounts_of(s: Session, order_id: str) -> str:
    """The check's ticket discount and each line's, as one string to compare before and after."""
    return s.q(
        "SELECT o.discount_percent || '/' || o.discount_amount || '|' || COALESCE(string_agg("
        "i.id || '=' || i.discount_percent || '@' || i.line_total, ',' ORDER BY i.id COLLATE \"C\"), '')"
        " FROM sales_order o LEFT JOIN sales_order_item i ON i.order_id = o.id AND i.is_deleted = 0"
        f" WHERE o.id = '{order_id}' GROUP BY o.discount_percent, o.discount_amount"
    )


# label, how the check is seeded, the discount door, what the checkout read before it (line
# percents, ticket), and what the check holds after it (line percents, ticket)
DISCOUNTS = (
    (
        "a line discount put on",
        lambda s, o: unsent_check(s, o),
        lambda o: line_discount_ops(o, f"{o}-steak", 10.0, 1620),
        ({}, (0.0, 0)),
        ({"steak": 10.0}, (0.0, 0)),
    ),
    (
        "a line discount taken off",
        lambda s, o: (unsent_check(s, o), line_discounted(s, f"{o}-steak", 12.5, 1575)),
        lambda o: line_discount_ops(o, f"{o}-steak", 0.0, 1800),
        ({"steak": 12.5}, (0.0, 0)),
        ({}, (0.0, 0)),
    ),
    (
        "a ticket percent put on",
        lambda s, o: unsent_check(s, o),
        lambda o: ticket_discount_ops(o, 10.0, 0),
        ({}, (0.0, 0)),
        ({}, (10.0, 0)),
    ),
    (
        "a ticket amount put on",
        lambda s, o: unsent_check(s, o),
        lambda o: ticket_discount_ops(o, 0.0, 300),
        ({}, (0.0, 0)),
        ({}, (0.0, 300)),
    ),
    (
        "the ticket discount taken off",
        lambda s, o: (unsent_check(s, o), ticket_discounted(s, o, 12.5, 300)),
        lambda o: ticket_discount_ops(o, 0.0, 0),
        ({}, (12.5, 300)),
        ({}, (0.0, 0)),
    ),
)


def read_disc(o: str, disc: dict) -> dict:
    return {f"{o}-{k}": v for k, v in disc.items()}


def step_16_a_discount_in_flight(s: Session) -> None:
    print("\n16 · a discount IN FLIGHT: the checkout of the old amount waits and is refused")
    for n, (label, seed, door, (disc, ticket), _now) in enumerate(DISCOUNTS):
        o = f"d16-{n}"
        seed(s, o)
        held = hold(s, door(o))
        calls = checkout_ops(
            o, [f"{o}-steak", f"{o}-water"], disc=read_disc(o, disc), ticket=ticket
        )
        thread, box = in_background(s, calls)
        s.check(
            f"{label}: the checkout is queued behind it",
            poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
            True,
        )
        s.check(f"{label}: it commits", held.commit()[0], True)
        s.check(
            f"{label}: the checkout is refused — the check changed while it was being charged",
            finish(s, calls, thread, box),
            CHANGED,
        )
        s.check(f"{label}: the check is still open", check_status(s, o), "open")


def step_17_a_checkout_in_flight_refuses_the_discount(s: Session) -> None:
    print("\n17 · a checkout IN FLIGHT: the discount waits and is refused")
    for n, (label, seed, door, (disc, ticket), _now) in enumerate(DISCOUNTS):
        o = f"d17-{n}"
        seed(s, o)
        before = discounts_of(s, o)
        held = hold(
            s,
            checkout_ops(
                o, [f"{o}-steak", f"{o}-water"], disc=read_disc(o, disc), ticket=ticket
            ),
        )
        calls = door(o)
        thread, box = in_background(s, calls)
        s.check(
            f"{label}: the discount is queued behind the checkout",
            poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
            True,
        )
        s.check(f"{label}: the checkout commits", held.commit()[0], True)
        s.check(
            f"{label}: the discount is refused by name",
            finish(s, calls, thread, box),
            CHANGED,
        )
        s.check(
            f"{label}: the charged check keeps the discount it was charged with",
            discounts_of(s, o),
            before,
        )
        s.check(f"{label}: the check is completed", check_status(s, o), "completed")


def step_18_a_partial_charge_in_flight_refuses_the_line_discount(s: Session) -> None:
    print(
        "\n18 · a PARTIAL charge in flight: the charged line keeps its discount, the rest changes"
    )
    o = "d18"
    unsent_check(s, o)
    held = hold(s, checkout_ops(o, [f"{o}-steak"], partial=True))
    calls = line_discount_ops(o, f"{o}-steak", 10.0, 1620)
    thread, box = in_background(s, calls)
    s.check(
        "the discount of the line being charged is queued behind the charge",
        poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
        True,
    )
    s.check("the partial charge commits", held.commit()[0], True)
    s.check(
        "the discount of the charged line is refused by name",
        finish(s, calls, thread, box),
        CHANGED,
    )
    s.check(
        "the charged line keeps the amount charged",
        s.q(f"SELECT discount_percent || '@' || line_total FROM sales_order_item WHERE id = '{o}-steak'"),
        "0@1800",
    )
    s.check(
        "a line the charge left on the check still takes its discount",
        play(s, line_discount_ops(o, f"{o}-water", 50.0, 100)),
        "ok",
    )
    s.check(
        "and so it did",
        s.q(f"SELECT discount_percent || '@' || line_total FROM sales_order_item WHERE id = '{o}-water'"),
        "50@100",
    )


def step_19_a_discount_committed_before_the_checkout_queues(s: Session) -> None:
    print(
        "\n19 · the discount already committed and the till charges what it read: refused"
    )
    for n, (label, seed, door, (disc, ticket), (now_disc, now_ticket)) in enumerate(
        DISCOUNTS
    ):
        o = f"d19-{n}"
        seed(s, o)
        lines = [f"{o}-steak", f"{o}-water"]
        s.check(f"{label}: the discount goes through", play(s, door(o)), "ok")
        s.check(
            f"{label}: the checkout of what it read is refused",
            play(s, checkout_ops(o, lines, disc=read_disc(o, disc), ticket=ticket)),
            CHANGED,
        )
        s.check(
            f"{label}: the checkout of what the check now holds goes through",
            play(
                s, checkout_ops(o, lines, disc=read_disc(o, now_disc), ticket=now_ticket)
            ),
            "ok",
        )


def step_20_the_discount_rechecks_are_scoped(s: Session) -> None:
    print("\n20 · the discount re-checks compare the right row, and only ours")
    open_check(s, "dg-live")
    add_line(s, "dg-live", "dg-l", 500)
    line_discounted(s, "dg-l", 33.33, 334)

    def line(percent) -> str:
        return play(
            s,
            [
                (
                    "sales._order_line_live",
                    {
                        "order_id": "dg-live",
                        "line_id": "dg-l",
                        "quantity": ONE,
                        "is_gift": 0,
                        "discount_percent": percent,
                    },
                )
            ],
        )

    s.check("the percent the row has passes", line(33.33), "ok")
    s.check("another percent does not", line(30.0), CHANGED)
    s.check("no discount charged on a discounted row does not", line(0.0), CHANGED)
    s.check("a row only marked as paid compares none", line(None), "ok")

    open_check(s, "dg-t")
    ticket_discounted(s, "dg-t", 12.5, 300)
    open_check(s, "dg-plain")

    def ticket(percent, amount, order_id="dg-t", hub=None) -> str:
        return play(
            s,
            [
                (
                    "sales._order_discount_live",
                    {
                        "order_id": order_id,
                        "discount_percent": percent,
                        "discount_amount": amount,
                    },
                )
            ],
            hub=hub,
        )

    s.check("the ticket discount the check has passes", ticket(12.5, 300), "ok")
    s.check("another percent does not", ticket(10.0, 300), CHANGED)
    s.check("another amount does not", ticket(12.5, 0), CHANGED)
    s.check("a partial charge compares the percent alone", ticket(12.5, None), "ok")
    s.check("and still the percent", ticket(0.0, None), CHANGED)
    s.check(
        "another check of the hub holding that discount does not stand in for ours",
        ticket(12.5, 300, order_id="dg-plain"),
        CHANGED,
    )
    s.check(
        "the neighbour hub naming our check does not pass",
        ticket(12.5, 300, hub=OTHER_HUB),
        CHANGED,
    )


# ── 21 · sales#554: splitting a line while its quantity or its discount changes ─────────────


def haircuts(s: Session, order_id: str, quantity: int) -> None:
    """The issue's check: «Corte × N» at 18,00 € each, not sent, plus a 2,00 € product."""
    open_check(s, order_id)
    add_line(
        s,
        order_id,
        f"{order_id}-cut",
        1800 * (quantity // ONE),
        fired=False,
        quantity=quantity,
    )
    add_line(s, order_id, f"{order_id}-water", 200, fired=False)


def cut_lines(s: Session, order_id: str) -> str:
    """`<lines of the cut>|<units of the cut on the check>|<provisional total>`: a split that
    loses or invents a unit moves the second number away from the cut's quantity."""
    return s.q(
        "SELECT count(*) || '|' || CAST(COALESCE(sum(i.quantity), 0) AS BIGINT) / 1000000 || '|'"
        " || (SELECT provisional_total FROM sales_order WHERE id = i.order_id)"
        f" FROM sales_order_item i WHERE i.order_id = '{order_id}' AND i.is_deleted = 0"
        f" AND (i.id = '{order_id}-cut' OR i.id LIKE '{order_id}-part%') GROUP BY i.order_id"
    )


def split_cut(o: str, read_qty: int, read_percent: float = 0.0) -> list:
    return split_line_ops(
        o, f"{o}-cut", 1800, f"{o}-part", read_qty=read_qty, read_percent=read_percent
    )


def a_split_behind(s: Session, label: str, o: str, door: list, split: list) -> None:
    """`door` held on the check, `split` (what the screen read before it) queued behind it."""
    held = hold(s, door)
    thread, box = in_background(s, split)
    s.check(
        f"{label}: the split is queued behind it",
        poll(lambda: waiting_on_a_lock(s) >= 1) and thread.is_alive(),
        True,
    )
    s.check(f"{label}: it commits", held.commit()[0], True)
    s.check(
        f"{label}: the split is refused — the line changed while it waited",
        finish(s, split, thread, box),
        CHANGED,
    )


def step_21_a_line_split_while_it_changes(s: Session) -> None:
    print("\n21 · a line split while its quantity or its discount changes (sales#554)")
    haircuts(s, "s21-clean", 2 * ONE)
    s.check(
        "CONTROL: a clean split is accepted",
        play(s, split_cut("s21-clean", 2 * ONE)),
        "ok",
    )
    s.check(
        "CONTROL: two lines of one, the check worth the same",
        cut_lines(s, "s21-clean"),
        "2|2|3800",
    )

    haircuts(s, "s21-up", 2 * ONE)
    a_split_behind(
        s,
        "2 → 3",
        "s21-up",
        update_ops("s21-up", "s21-up-cut", 3 * ONE, 5400),
        split_cut("s21-up", 2 * ONE),
    )
    s.check(
        "2 → 3: the third haircut is still on the check",
        cut_lines(s, "s21-up"),
        "1|3|5600",
    )

    haircuts(s, "s21-down", 3 * ONE)
    a_split_behind(
        s,
        "3 → 2",
        "s21-down",
        update_ops("s21-down", "s21-down-cut", 2 * ONE, 3600),
        split_cut("s21-down", 3 * ONE),
    )
    s.check("3 → 2: no haircut is invented", cut_lines(s, "s21-down"), "1|2|3800")

    haircuts(s, "s21-disc", 2 * ONE)
    a_split_behind(
        s,
        "a line discount put on",
        "s21-disc",
        line_discount_ops("s21-disc", "s21-disc-cut", 10.0, 3240),
        split_cut("s21-disc", 2 * ONE),
    )
    s.check(
        "a line discount put on: the line keeps its discount and its two units",
        s.q(
            "SELECT quantity / 1000000 || '|' || discount_percent || '|' || line_total"
            " FROM sales_order_item WHERE id = 's21-disc-cut'"
        ),
        "2|10|3240",
    )

    # The screen read the line, the other device's change COMMITTED, and only then the split
    # reached the check: nothing is in flight, the row is simply not what was read.
    haircuts(s, "s21-stale", 2 * ONE)
    s.check(
        "a stale screen: the other device's change goes through",
        play(s, update_ops("s21-stale", "s21-stale-cut", 3 * ONE, 5400)),
        "ok",
    )
    s.check(
        "a stale screen: the split of the old quantity is refused",
        play(s, split_cut("s21-stale", 2 * ONE)),
        CHANGED,
    )
    s.check(
        "a stale screen: the three haircuts are still one line",
        cut_lines(s, "s21-stale"),
        "1|3|5600",
    )

    # The re-check is the hub's: the neighbour naming our check and our line is never let through.
    haircuts(s, "s21-nb", 2 * ONE)
    s.check(
        "the neighbour hub splitting our line is refused",
        play(s, split_cut("s21-nb", 2 * ONE), hub=OTHER_HUB),
        CHANGED,
    )
    s.check("and our line is untouched", cut_lines(s, "s21-nb"), "1|2|3800")


def open_neighbour_check(s: Session, order_id: str) -> bool:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted,"
                " created_at, updated_at) VALUES (:id, :hub_id, 'open', 0, 0, :now, :now)",
                {"id": order_id, "hub_id": OTHER_HUB, "now": NOW},
            ),
        ]
    )
    return True


def main() -> int:
    s = Session(
        f"sales_check_charge_race_{os.getpid()}", hub=HUB, user="u-cashier", now=NOW
    )
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        for step in (
            step_1_a_clean_check_charges,
            step_2_a_void_in_flight,
            step_3_a_removal_in_flight,
            step_4_a_checkout_in_flight,
            step_5_two_checkouts_charge_once,
            step_6_a_stale_screen,
            step_7_the_rechecks_are_scoped,
            step_8_the_removal_is_scoped,
            step_9_the_neighbour_never_queues_on_our_check,
            step_10_an_edit_in_flight,
            step_11_a_checkout_in_flight_refuses_the_edits,
            step_12_a_partial_charge_in_flight,
            step_13_an_edit_committed_before_the_checkout_queues,
            step_14_the_new_rechecks_are_scoped,
            step_15_split_and_join_gates,
            step_16_a_discount_in_flight,
            step_17_a_checkout_in_flight_refuses_the_discount,
            step_18_a_partial_charge_in_flight_refuses_the_line_discount,
            step_19_a_discount_committed_before_the_checkout_queues,
            step_20_the_discount_rechecks_are_scoped,
            step_21_a_line_split_while_it_changes,
        ):
            try:
                step(s)
            except (AssertionError, RuntimeError) as exc:
                s.check(f"{step.__name__} ran to the end", str(exc).splitlines()[0], "")
    finally:
        s.drop()
    return s.report(
        "a check is charged OR a line leaves it, never both: the loser is refused by name"
    )


if __name__ == "__main__":
    sys.exit(main())
