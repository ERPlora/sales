#!/usr/bin/env python3
"""The void CHAIN, walked whole against the real kernel — what was left of the hub's
`crates/runtime/tests/void_reversal_e2e.rs` (ERPlora/hub#1264, contract «El Hub se CIERRA como
KERNEL» §5).

That e2e proved ONE promise: a sale that put money in the drawer and took stock off the shelf,
once voided, gives BOTH back. Its assertions have been split across the modules that own each
half — `cash_register/tests/reverse_on_void.hub.test.py` (slice 4) owns the compensating refund and
the arqueo, `inventory/tests/listeners.hub.test.py` (slice 6) owns the restitution and its ledger —
and each of those batteries deliberately looks at ITS half only. Three things the original proved
survived neither split, and they are what this battery pins, from the module that FIRES the event:

  1. **The fan-out itself.** One `sales.void` on one real sale reaches BOTH listeners: the drawer
     comes back to the opening net AND the stock comes back to the shelf, from a single gesture.
     Each half being green on its own does not say that one void serves both — a `sale.voided` that
     only ever reached one of them would leave both module batteries green.
  2. **The card leg.** `void_reversal_e2e::card_sale_void_restocks_but_no_cash_refund`: a card sale
     never moved the physical drawer, so its void must not post a refund — but the stock must come
     back all the same. `reverse_on_void.hub` §2 owns the first half; the second half (stock back
     after voiding a CARD sale) is asserted nowhere else — `listeners.hub` §2/§5/§6 all sell cash.
  3. **The service line.** `void_reversal_e2e::service_line_void_reverts_cash_without_touching_stock`:
     a sale with no product at all reverses the drawer and writes NOTHING to the stock ledger.
     cash_register verified its half by reading `_reverse_sale.sql` (it never reads sale lines) and
     did not port the scenario; inventory has no case for it. It is the one that would catch a
     restitution that invented stock for a line that never had any.

What this battery does NOT re-assert, on purpose: the shape of each half. Whether the refund is
`-total` and never mutates the original movement is `cash_register`'s contract, whether the ledger
row is a `void` of the exact quantity is `inventory`'s, and whether the void marks-not-deletes and
emits once is `sales`' own `void.hub.test.py`. Here the assertions are the ones that are only true
of the CHAIN, so a change to either module's internals does not make this file red twice over.

`install_registers_void_listeners` (the registry check of the original) has no equivalent and needs
none: a battery cannot introspect `listeners_for`, and §1 proves the stronger thing — that both
listeners actually RAN. The registration mechanism is the kernel's, and the KCS owns it.

Redelivery idempotency (the original's third assertion: draining the outbox twice duplicates
nothing) is NOT here either. It cannot be: no public door replays a delivered event, only the
Rust-internal `rt.drain_outbox()` could invoke a listener twice. It is a KERNEL guarantee
(`_event_delivery`), and it moved to the hub's KCS with this slice — see hub#1264.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on its
own: without a runtime it fails, it does not skip.
"""

import sys
import time
import uuid

import hub_harness
from hub_harness import ONE, Hub, card_method_id, cash_method_id, cents, key, wait_until

#: One relay tick, plus slack. The only way to assert a NEGATIVE about a listener (it did not post
#: a refund, it did not touch the ledger) is to give the relay time to have done it and then look.
RELAY_TICK = 2.5


# ── the hub, seen from the three modules the chain crosses ───────────────────────────────


def own_the_only_session(hub: Hub, opening: int) -> str:
    """Opens THIS battery's cash session and returns its id.

    `cash_register` allows a single open session per hub (`cash_register.session_already_open`) and
    the batteries of a run share one hub, so a leftover open session would refuse the open. The
    battery closes whatever it finds and opens its own, so the figures it reads afterwards are its
    own arithmetic and not somebody else's leftovers.
    """
    for open_session in hub.query("cash_register.current_session"):
        hub.run(
            "cash_register.session.close",
            {
                "session_id": open_session["id"],
                "closing_balance": 0,
                "closing_notes": "",
            },
        )
    out = hub.run(
        "cash_register.session.open",
        {"register_id": None, "opening_balance": opening, "opening_notes": ""},
    )
    return out["new_ids"][0]


def create_product(hub: Hub, name: str, price: int, stock: int) -> str:
    """A tracked physical product with a known balance, through the public command."""
    out = hub.run(
        "inventory.products.create",
        {
            "name": name,
            "sku": f"{name[:3].upper()}-{uuid.uuid4().hex[:6]}",
            "price": price,
            "cost": price // 2,
            "stock": stock,
            "low_stock_threshold": 5 * ONE,
            "product_type": "physical",
            "ean13": None,
            "description": "",
            "tax_category_key": "product.generic",
            "image": "",
        },
    )
    return out["new_ids"][0]


def stock_of(hub: Hub, product_id: str) -> int:
    rows = hub.query("inventory.products.get", {"product_id": product_id})
    if len(rows) != 1:
        raise AssertionError(f"inventory.products.get({product_id}) answered {rows}")
    return int(rows[0]["stock"])


def ledger_of_sale(hub: Hub, sale_id: str) -> list:
    """Every stock movement this sale left in `inventory`'s ledger, whichever product it names."""
    return hub.query("inventory.stock.movements", {"f_reference": sale_id})


def movements_of_sale(hub: Hub, session_id: str, sale_id: str) -> list:
    return [
        m
        for m in hub.query("cash_register.movements.list", {"session_id": session_id})
        if m.get("sale_reference") == sale_id
    ]


def live_drawer(hub: Hub, session_id: str) -> tuple[int, int]:
    """`(current_session.expected_total, session.summary.expected_cash)` — the two readings of the
    drawer WHILE the session is open. Both are read because they are two separate SQL files
    (`queries/current_session.sql`, `queries/session_summary.sql`) computing the same rule."""
    current = hub.query("cash_register.current_session")
    if len(current) != 1 or current[0].get("id") != session_id:
        raise AssertionError(
            f"current_session should be this battery's session {session_id}, got {current}"
        )
    summary = hub.query("cash_register.session.summary", {"session_id": session_id})
    if len(summary) != 1:
        raise AssertionError(f"session.summary({session_id}) answered {summary}")
    return cents(current[0]["expected_total"]), cents(summary[0]["expected_cash"])


def settled_drawer(
    hub: Hub, session_id: str, quiet_for: float = 1.5, timeout: float = 20.0
) -> tuple[int, int]:
    """The drawer once the relay has gone quiet: polls until two readings `quiet_for` apart agree,
    and returns that pair as this section's BASELINE.

    The batteries of a run share one hub and `cash_register.record_sale` posts into whichever
    session is open WHEN THE RELAY DELIVERS, not when the sale was charged — so the checkout the
    previous battery rang up can land in this one's session a second later. Measured against a
    settled baseline (and asserted as a delta, [`bumped`]) the arithmetic below is this battery's
    own, whatever else the run left in flight.
    """
    deadline = time.monotonic() + timeout
    previous = live_drawer(hub, session_id)
    while time.monotonic() < deadline:
        time.sleep(quiet_for)
        current = live_drawer(hub, session_id)
        if current == previous:
            return current
        previous = current
    raise AssertionError(
        f"the drawer of {session_id} never settled in {timeout}s; last reading {previous}"
    )


def bumped(base: tuple[int, int], delta: int) -> tuple[int, int]:
    """The baseline pair moved by `delta` — both readings of the drawer answer the same rule."""
    return base[0] + delta, base[1] + delta


def arqueo(hub: Hub, session_id: str) -> int:
    """Closes the session and returns the `expected_balance` the close froze — the reconciliation
    the original bug named («el arqueo queda inflado por cada anulación»)."""
    hub.run(
        "cash_register.session.close",
        {"session_id": session_id, "closing_balance": 0, "closing_notes": ""},
    )
    row = next(
        s for s in hub.query("cash_register.sessions.list") if s["id"] == session_id
    )
    return cents(row["expected_balance"])


def charge(
    hub: Hub, payment_method_id: str, tag: str, items: list[dict]
) -> tuple[str, int]:
    """Charges a REAL sale and returns `(sale_id, total)`.

    The total is READ BACK from `sales.get` rather than computed here: with a `product_id` on the
    line the server prices from the catalogue and ignores what the client proposed (sales#20), so a
    total worked out from the payload would be a second implementation of the rule — and the wrong
    one.
    """
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key(tag),
            "payment_method_id": payment_method_id,
            "tax_included": True,
            "items": items,
        },
    )
    sale_id = (out.get("new_ids") or [None])[0]
    if not isinstance(sale_id, str) or not sale_id:
        raise AssertionError(f"sales.complete_sale did not answer the sale id: {out}")
    rows = hub.query("sales.get", {"sale_id": sale_id})
    if len(rows) != 1:
        raise AssertionError(f"sales.get({sale_id}) answered {rows}")
    return sale_id, cents(rows[0]["total"])


# ── the three walks ──────────────────────────────────────────────────────────────────────


def test_one_void_gives_back_both_the_drawer_and_the_stock(hub: Hub, cash: str) -> None:
    print("\n1 · one void, two listeners: the drawer AND the stock come back together")
    session = own_the_only_session(hub, 10_000)
    base = settled_drawer(hub, session)
    product = create_product(hub, "Cafe", price=1_000, stock=10 * ONE)

    sale_id, total = charge(
        hub,
        cash,
        "chain-cash",
        [
            {
                "product_id": product,
                "product_name": "Cafe",
                "price": 1_000,
                "quantity": 2 * ONE,
                "tax_rate": 21.0,
            }
        ],
    )

    # Both listeners ran on `sale.completed` first — the precondition the void has to undo. The old
    # e2e SEEDED this by hand to stay clear of in-flight work in `sales`; here `sales` IS the repo,
    # so the money and the stock move through the real command.
    hub.check(
        "the cash sale put its total in the drawer",
        wait_until(
            lambda: live_drawer(hub, session),
            lambda pair: pair == bumped(base, total),
        ),
        bumped(base, total),
    )
    hub.check(
        "…and took 2 units off the shelf",
        wait_until(lambda: stock_of(hub, product), lambda v: v == 8 * ONE),
        8 * ONE,
    )

    hub.run("sales.void", {"sale_id": sale_id, "reason": "hub#1264 chain battery"})

    # ONE gesture, both halves back. Each half is waited for and checked SEPARATELY so a red run
    # names WHICH listener did not run — «the drawer never came back» and «the stock never came
    # back» are different bugs in different modules, and a single combined wait would hide which.
    hub.check(
        "the void takes the drawer back to where it started",
        wait_until(lambda: live_drawer(hub, session), lambda pair: pair == base),
        base,
    )
    hub.check(
        "…and the same void puts the stock back on the shelf",
        wait_until(lambda: stock_of(hub, product), lambda v: v == 10 * ONE),
        10 * ONE,
    )
    hub.check(
        "the sale itself is voided, not deleted",
        hub.query("sales.get", {"sale_id": sale_id})[0]["status"],
        "voided",
    )
    hub.check("and the arqueo closes at that same net", arqueo(hub, session), base[0])


def test_a_card_sale_gives_the_stock_back_without_touching_the_drawer(
    hub: Hub, card: str
) -> None:
    print(
        "\n2 · a CARD sale: voiding it restocks, and the drawer never moved either way"
    )
    session = own_the_only_session(hub, 5_000)
    base = settled_drawer(hub, session)
    product = create_product(hub, "Te", price=1_000, stock=7 * ONE)

    sale_id, total = charge(
        hub,
        card,
        "chain-card",
        [
            {
                "product_id": product,
                "product_name": "Te",
                "price": 1_000,
                "quantity": 3 * ONE,
                "tax_rate": 21.0,
            }
        ],
    )
    hub.check_true("the card sale was charged for something", total > 0, str(total))

    hub.check(
        "the card sale took 3 units off the shelf",
        wait_until(lambda: stock_of(hub, product), lambda v: v == 4 * ONE),
        4 * ONE,
    )
    hub.check(
        "…and no card money is ever counted as drawer cash",
        live_drawer(hub, session),
        base,
    )

    hub.run("sales.void", {"sale_id": sale_id, "reason": "hub#1264 chain battery"})

    hub.check(
        "voiding a CARD sale restocks all the same",
        wait_until(lambda: stock_of(hub, product), lambda v: v == 7 * ONE),
        7 * ONE,
    )

    # A negative never resolves by waiting: the relay is given its tick and then the drawer is read
    # outright. A refund posted here would be money handed back out of a till that never took it.
    time.sleep(RELAY_TICK)
    refunds = [
        m
        for m in movements_of_sale(hub, session, sale_id)
        if m["movement_type"] == "refund"
    ]
    hub.check_true(
        "no refund is posted for a sale the drawer never took",
        refunds == [],
        str(refunds),
    )
    hub.check("the drawer is exactly where it started", live_drawer(hub, session), base)
    hub.check("and so is the arqueo", arqueo(hub, session), base[0])


def test_a_service_only_sale_reverses_the_drawer_and_writes_no_stock_row(
    hub: Hub, cash: str
) -> None:
    print(
        "\n3 · a SERVICE-only sale: the drawer reverses, the stock ledger stays empty"
    )
    session = own_the_only_session(hub, 0)
    base = settled_drawer(hub, session)
    # A tracked product that takes no part in the sale: if the restitution ever stopped keying on
    # this sale's own ledger rows, an untouched shelf is where it would show.
    bystander = create_product(hub, "Control", price=500, stock=5 * ONE)

    sale_id, total = charge(
        hub,
        cash,
        "chain-service",
        [
            {
                "product_name": "Corte de pelo",
                "price": 2_000,
                "quantity": ONE,
                "tax_rate": 21.0,
                "is_service": True,
            }
        ],
    )
    hub.check("a service line is priced from what was charged", total, 2_000)

    hub.check(
        "the service cashed in raised the drawer",
        wait_until(
            lambda: live_drawer(hub, session), lambda pair: pair == bumped(base, total)
        ),
        bumped(base, total),
    )
    hub.check_true(
        "a service sale writes no stock ledger row",
        ledger_of_sale(hub, sale_id) == [],
        str(ledger_of_sale(hub, sale_id)),
    )

    hub.run("sales.void", {"sale_id": sale_id, "reason": "hub#1264 chain battery"})

    hub.check(
        "the void reverses the drawer",
        wait_until(lambda: live_drawer(hub, session), lambda pair: pair == base),
        base,
    )

    time.sleep(RELAY_TICK)
    hub.check_true(
        "…and the void invents no stock movement out of a line that never had any",
        ledger_of_sale(hub, sale_id) == [],
        str(ledger_of_sale(hub, sale_id)),
    )
    hub.check(
        "the bystander's shelf is untouched from first to last",
        stock_of(hub, bystander),
        5 * ONE,
    )
    hub.check("the arqueo closes back where it started", arqueo(hub, session), base[0])


def main() -> int:
    hub = Hub(
        "void_chain.hub",
        needs=("taxes", "inventory", "customers", "cash_register", "sales"),
    )
    print(
        f"Hub battery · void chain (hub#1264 ← void_reversal_e2e.rs) · {hub_harness.BASE} · "
        f"hub {hub.hub_id} · user {hub.user}"
    )
    cash = cash_method_id(hub)
    card = card_method_id(hub)
    test_one_void_gives_back_both_the_drawer_and_the_stock(hub, cash)
    test_a_card_sale_gives_the_stock_back_without_touching_the_drawer(hub, card)
    test_a_service_only_sale_reverses_the_drawer_and_writes_no_stock_row(hub, cash)
    return hub.finish(
        "one void reaches every listener of `sale.voided`, against the real kernel"
    )


if __name__ == "__main__":
    sys.exit(main())
