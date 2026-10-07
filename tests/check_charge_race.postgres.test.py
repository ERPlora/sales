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
) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name,"
                " product_sku, quantity, unit_price, is_gift, gift_reason, line_total,"
                " tax_category_key, cost, round_no, fired_at, sale_id, is_deleted, created_by,"
                " updated_by, created_at, updated_at) VALUES (:id, :hub_id, :order_id, 'p-dish',"
                " 'Dish', '', 1000000, :line_total, 0, '', :line_total, '', 0, 1, :fired_at,"
                " :sale_id, :deleted, 'u-waiter', 'u-waiter', :now, :now)",
                {
                    "id": line_id,
                    "hub_id": hub,
                    "order_id": order_id,
                    "line_total": line_total,
                    "fired_at": NOW if fired else None,
                    "sale_id": sale_id,
                    "deleted": deleted,
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


def checkout_ops(order_id: str, line_ids: list) -> list:
    """What `sales.complete_sale` emits around the sale for a FULL charge of `order_id`: the queue
    and the re-checks first, the sale's own writes (not replayed here: they do not decide the
    race) and the check's completion last."""
    return [
        ("sales._order_lock", {"order_id": order_id}),
        *[
            ("sales._order_line_live", {"order_id": order_id, "line_id": l})
            for l in line_ids
        ],
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


def verdict(calls: list, counts: list) -> str:
    """What the kernel answers for a chain it played: the error of the FIRST command whose gated
    statement touched fewer rows than its `expect_rows` asks (the kernel rolls back there), or
    `"ok"`. A command repeated in the chain is matched to its own run of the statement."""
    seen: dict = {}
    for name, _payload in calls:
        gate = MANIFEST["commands"][name].get("expect_rows")
        if not gate:
            continue
        rel = gate["statement"]
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
            gated.append(gate["n"] if gate and gate["statement"] == rel else None)
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
        return play(s, checkout_ops(order_id, [line_id])[:-1], hub=hub)

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
