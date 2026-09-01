#!/usr/bin/env python3
"""The SUPPLEMENT chain, end to end, in a REAL Postgres 18 (sales#237 / pm#93 / ADR-0376).

A supplement crosses five subsystems and, until this battery, every one of them was checked ALONE:
`frozen_price` proves the picks are frozen on the order row, `modifier_child_line` proves the
checkout writes the child row and reads it back, `split_merge` proves lines travel. What nobody
checked is that the CABLE IS PLUGGED IN — and that is exactly where the money went missing.

THE SYMPTOM (sales#148). The POS did not send `modifiers` to `complete_sale`, so the delta was 0
and the frozen snapshot was `'[]'`: **the burger with cheese was charged at the price of a burger**.
The sale closed green, the ticket squared with itself, and the only thing wrong was that a euro was
not there. Each end was right and tested; what did not exist was the proof that the two ends meet.

THE GATE THIS BATTERY ADDS, in one sentence: **what the check is worth and what the till took have
to be the same number**. The open check's `provisional_total` is built by the module's own
`order_recompute_total.sql` from the rows the waiter created — supplements folded in — and the sale
is built by `_insert_line` from what the checkout decided. Nothing else in this repo compares them,
and that comparison is the whole of sales#148 seen from the database.

Six links, every one through the module's OWN declared door:

  1. THE TILL WRITES THE CHECK. `sales._insert_order` / `_insert_order_line` / `_recompute_order_total` write
     the check. The picks are frozen ON THE ROW, in the ORDER OF CHOICE, with the two names they
     carry, and the paid delta is already inside the row's `unit_price` (sales#175 / sales#200).
  2. THE CHECK GOES TO THE KITCHEN. `sales.order.fire` emits `sales._mark_lines_fired`, and it builds the
     kitchen ticket from `sales.order.lines` (`kitchen_items_from_lines`), never from the browser's
     payload. So the door has to hand over the `kitchen_name` — the text the pass reads, which is
     NOT the commercial one — and a line already fired must never be fired again.
  3. THE CHECK SPLITS. `sales.order.split` moves the beer to a second check; the two halves add up
     to the original by construction, and the fired line does not go back to «pending».
  4. THE CHECKOUT. `_bump_counter` / `_insert_sale` / `_insert_line` / `_insert_payment` /
     `_mark_order_line_paid` / `_complete_order` — the six operations the checkout emits, in the
     order it emits them. Then THE MONEY GATE, and the ADR-0146 contract: a paid line stops coming
     back through `sales.order.lines`, so the resumed screen cannot charge it twice.
  5. THE PAPER. `sales.lines` gives the snapshot back with the COMMERCIAL name under its line. Two
     doors, two texts, both frozen — and different on purpose.
  6. REOPENING AND REPRINTING. Untying a paid line puts it back on the check with its picks intact,
     and the reprint of the sale is byte for byte what was charged.

🔴 THE POSITIVE CONTROL (`scenario_control`). The same chain, charged the way it was charged BEFORE
sales#148 — the checkout reads the check and drops the picks, so the line lands at the bare
product's price. The battery must SEE it: the shortfall must be exactly the delta the check carried.
If that control ever stops firing, this battery has gone blind and every green above is worthless.
A check that cannot catch the positive is not a check.

🔴 WHAT IS NOT COVERED HERE, and it is NAMED rather than faked. Two halves of the chain stay out,
each for a reason that lives in the toolkit and not in this module:

  · the AUTHORITATIVE valuation, inside `dist/handler.wasm` (`catalog_modifier`): that the delta
    comes from `modifiers.options.all` and never from the payload, and the closed failure
    `sales.modifier_catalog_unavailable` when `modifiers` is not installed. Those decisions have
    unit tests — `handler/src/lib.rs` — and NO GATE RUNS THEM: `erplora validate` compiles the
    handler when a checkout of the hub happens to sit beside the module (and on a runner not even
    that, «handler WASM SIN VERIFICAR»), but `cargo test` of `handler/` is executed by nobody, in
    any of the 21 modules with a Tier 2 handler. That is module-toolkit#146, not something this
    battery can close from here;
  · the DELIVERY of `order.fired` to `kitchen` and of `order.completed` closing the kitchen order
    (kitchen#66/#67). A cross-module event needs the LIVE kernel, which is the `*.hub.test.py`
    family: the command that runs them exists (`erplora test --against-hub`) and the shared gate
    does not call it, so this module's four hub batteries report NOT RUN on every single run —
    module-toolkit#112.

So: this battery does NOT prove that the server ignores a tampered `price_delta`, and it does not
prove that the comanda reached the pass. What it proves is everything those two decisions travel
THROUGH — which is precisely where sales#148 broke, with both ends right and tested.

Usage: tests/modifier_chain.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER; the
  toolkit sets it per CI job). Creates scratch databases and DROPS them at the end, pass or fail.
  It NEVER skips itself: a battery that goes green because it could not reach Postgres is worse
  than no battery at all.
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pg_harness
from pg_harness import Session, order_line_params, sale_header_params, sale_line_params

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-waiter"
DAY = "20260901"
NOW = "2026-09-01T13:00:00+00:00"
LATER = "2026-09-01T13:35:00+00:00"

# ── The catalogue the handler resolved against, written out as literals ───────────────────
#
# These are the rows `inventory.products.for_sale` and `modifiers.options.all` hand the handler.
# They are here as CONSTANTS and never recomputed: the numbers below are what the handler already
# decided, exactly as they arrive at the doors in production.
BURGER_PRICE = 800  # 8,00 € — `restaurant.food`, 10 %
BEER_PRICE = 250  # 2,50 € — `product.generic`, 21 %
CHEESE_DELTA = 100  # 1,00 € — the supplement that COSTS money

# The snapshot `resolve_modifiers` freezes, IN THE ORDER OF CHOICE. `kitchen_name` is the text the
# pass reads and `name` the one the customer's paper says; they are different on purpose, and a
# battery that used the same string for both could not tell the two doors apart.
PICKS = [
    {
        "option_id": "o-cheese",
        "group_id": "g-extras",
        "name": "Queso",
        "kitchen_name": "+QUESO",
        "price_delta": CHEESE_DELTA,
        "tax_category_key": "",
    },
    {
        "option_id": "o-no-onion",
        "group_id": "g-sin",
        "name": "Sin cebolla",
        "kitchen_name": "-CEBOLLA",
        "price_delta": 0,
        "tax_category_key": "",
    },
]
PICKS_TEXT = json.dumps(PICKS, separators=(",", ":"), ensure_ascii=False)

# 8,00 € + 1,00 € of cheese. The delta is INSIDE the row's price (ADR-0376: a supplement with no tax
# category of its own folds), which is why the paper prints no amount beside it.
BURGER_CHARGED = BURGER_PRICE + CHEESE_DELTA
CHECK_TOTAL = BURGER_CHARGED + BEER_PRICE

ORDER = "ord-table-4"
SPLIT_ORDER = "ord-table-4-b"
L_BURGER = "oline-burger"
L_BEER = "oline-beer"
SALE_BURGER = "sale-burger"
SALE_BEER = "sale-beer"


# ── The doors, played in the order the handlers emit them ────────────────────────────────


def open_the_check(
    s: Session, hub=None, order=ORDER, burger=L_BURGER, beer=L_BEER
) -> None:
    """What `sales.order.open` emits: the header, the lines, the recompute — one per line, in the
    same transaction each, exactly as the runtime runs them."""
    s.command_ok(
        "the waiter opens Mesa 4",
        "sales._insert_order",
        {
            "id": order,
            "status": "open",
            "provisional_total": 0,
            "notes": "",
            "label": "Mesa 4",
            "source_module": "pos",
        },
        hub=hub,
    )
    s.command_ok(
        "burger with cheese and no onion, the delta already folded in",
        "sales._insert_order_line",
        order_line_params(
            id=burger,
            order_id=order,
            product_id="p-burger",
            product_name="Hamburguesa",
            unit_price=BURGER_CHARGED,
            line_total=BURGER_CHARGED,
            tax_category_key="restaurant.food",
            category_id="cat-grill",
            modifiers=PICKS_TEXT,
            notes="poco hecha",
        ),
        hub=hub,
    )
    s.command_ok(
        "and a beer, with no supplements at all",
        "sales._insert_order_line",
        order_line_params(
            id=beer,
            order_id=order,
            product_id="p-beer",
            product_name="Caña",
            unit_price=BEER_PRICE,
            line_total=BEER_PRICE,
            tax_category_key="product.generic",
            category_id="cat-bar",
        ),
        hub=hub,
    )
    s.command_ok(
        "the check is worth what its lines are worth",
        "sales._recompute_order_total",
        {"order_id": order},
        hub=hub,
    )


def charge(
    s: Session,
    sale_id: str,
    order_id: str,
    line_id: str,
    order_line_id: str,
    *,
    product_id: str,
    product_name: str,
    unit_price: int,
    rate: float,
    category: str,
    net: int,
    tax: int,
    modifiers: str,
    category_id=None,
    notes: str = "",
    hub=None,
) -> None:
    """The six operations `sales.complete_sale` emits for a one-line check, in its order.

    The amounts are the handler's — half-even over the tax-included price (ADR-0123) — written out
    as literals by the caller. Recomputing them here would only prove that the copy agrees with
    itself; what is under test is that they SURVIVE the journey and square once written."""
    total = unit_price
    s.command_ok(
        f"the day's counter ({sale_id})",
        "sales._bump_counter",
        {"day": DAY, "new_id": f"cnt-{hub or s.hub}-{DAY}"},
        hub=hub,
        now=LATER,
    )
    s.command_ok(
        f"the sale header ({sale_id})",
        "sales._insert_sale",
        sale_header_params(
            sale_id=sale_id,
            day=DAY,
            subtotal=net,
            tax_amount=tax,
            tax_breakdown=json.dumps(
                {f"{rate:.2f}": {"base": net, "tax": tax, "kind": "tax"}},
                separators=(",", ":"),
            ),
            total=total,
            amount_tendered=total,
            order_id=order_id,
            staff_id=USER,
            idempotency_key=f"idem-{sale_id}",
        ),
        hub=hub,
        now=LATER,
    )
    s.command_ok(
        f"the line, with its snapshot frozen ({sale_id})",
        "sales._insert_line",
        sale_line_params(
            line_id=line_id,
            sale_id=sale_id,
            product_id=product_id,
            product_name=product_name,
            unit_price=unit_price,
            tax_rate=rate,
            tax_category_key=category,
            tax_rule_id=f"r-es-{int(rate)}",
            category_id=category_id,
            modifiers=modifiers,
            notes=notes,
            net_amount=net,
            tax_amount=tax,
            line_total=unit_price,
        ),
        hub=hub,
        now=LATER,
    )
    s.command_ok(
        f"the cash leg ({sale_id})",
        "sales._insert_payment",
        {
            "payment_id": f"pay-{sale_id}",
            "sale_id": sale_id,
            "sort_order": 0,
            "payment_method_id": "pm-cash",
            "payment_method_name": "Efectivo",
            "payment_method_type": "cash",
            "amount": total,
            "amount_tendered": total,
            "change_due": 0,
            "reference": "",
        },
        hub=hub,
        now=LATER,
    )
    s.command_ok(
        f"the check's line is nailed to the sale that paid it ({sale_id})",
        "sales._mark_order_line_paid",
        {"line_id": order_line_id, "sale_id": sale_id},
        hub=hub,
        now=LATER,
    )
    s.command_ok(
        f"and the check is closed ({sale_id})",
        "sales._complete_order",
        {"order_id": order_id},
        hub=hub,
        now=LATER,
    )


# ── 1 · the till writes the check ────────────────────────────────────────────────────────────────────


def link_1_the_order_freezes_the_picks(s: Session) -> None:
    print(
        "\n1 · the till writes the check: the picks are frozen on the row, in the order of choice"
    )
    open_the_check(s)
    check_total = s.qi(
        f"SELECT provisional_total FROM sales_order WHERE id = '{ORDER}' AND hub_id = '{HUB}'"
    )
    s.check(
        "the check is worth the burger WITH its cheese, plus the beer",
        check_total,
        CHECK_TOTAL,
    )
    s.check(
        "the paid delta is INSIDE the row's price — the paper prints no amount beside a supplement",
        s.qi(f"SELECT unit_price FROM sales_order_item WHERE id = '{L_BURGER}'"),
        BURGER_CHARGED,
    )
    frozen = json.loads(
        s.q(f"SELECT modifiers FROM sales_order_item WHERE id = '{L_BURGER}'")
    )
    s.check(
        "both picks are on the row, in the ORDER they were chosen",
        [o["option_id"] for o in frozen],
        ["o-cheese", "o-no-onion"],
    )
    s.check(
        "each with the delta that priced it",
        [o["price_delta"] for o in frozen],
        [CHEESE_DELTA, 0],
    )
    s.check(
        "the beer carries none, and that is a list and not a NULL",
        s.q(f"SELECT modifiers FROM sales_order_item WHERE id = '{L_BEER}'"),
        "[]",
    )


# ── 2 · the check goes to the kitchen ─────────────────────────────────────────────────────────────────


def link_2_the_kitchen_door_hands_over_the_kitchen_name(s: Session) -> None:
    print(
        "\n2 · to the kitchen: `sales.order.lines` is what the fire builds the ticket from"
    )
    rows = {r["id"]: r for r in s.query("sales.order.lines", {"order_id": ORDER})}
    s.check(
        "both lines come back to be fired", sorted(rows), sorted([L_BURGER, L_BEER])
    )
    picks = json.loads(rows.get(L_BURGER, {}).get("modifiers") or "[]")
    # 🔴 The pass reads THIS text. `fire_order` names the supplements with
    # `name_modifiers_for_kitchen`, and it reads them from HERE — not from the browser — so a
    # resumed check that lost them would send the plate out wrong and nothing would say so.
    s.check(
        "the door hands the KITCHEN name over, in the order of choice",
        [o["kitchen_name"] for o in picks],
        ["+QUESO", "-CEBOLLA"],
    )
    s.check(
        "and the waiter's note travels with it (sales#156)",
        rows.get(L_BURGER, {}).get("notes"),
        "poco hecha",
    )
    s.check(
        "the snapshot routes each line to its station (sales#12)",
        [
            rows.get(L_BURGER, {}).get("category_id"),
            rows.get(L_BEER, {}).get("category_id"),
        ],
        ["cat-grill", "cat-bar"],
    )

    s.command_ok(
        "fire the round",
        "sales._mark_lines_fired",
        {"order_id": ORDER, "round_no": 1},
        now=NOW,
    )
    s.check(
        "both lines went out on round 1",
        s.qi(
            f"SELECT count(*) FROM sales_order_item WHERE order_id = '{ORDER}' "
            "AND hub_id = '" + HUB + "' AND round_no = 1 AND fired_at IS NOT NULL"
        ),
        2,
    )
    # The `fired_at IS NULL` guard is the contract: firing again must find NOTHING new, or the same
    # food goes out twice. Nobody exercised it until now.
    s.command_ok(
        "fire again with nothing new on the check",
        "sales._mark_lines_fired",
        {"order_id": ORDER, "round_no": 2},
        now=LATER,
    )
    s.check(
        "and the second fire sends nothing: no plate goes out twice",
        s.qi(
            f"SELECT count(*) FROM sales_order_item WHERE order_id = '{ORDER}' AND round_no = 2"
        ),
        0,
    )


# ── 3 · the check splits ─────────────────────────────────────────────────────────────────


def link_3_the_check_splits_without_losing_a_cent(s: Session) -> None:
    print("\n3 · the beer moves to a second check, and the two halves still add up")
    s.command_ok(
        "split the check",
        "sales.order.split",
        {
            "order_id": ORDER,
            "new_id": SPLIT_ORDER,
            "label": "Mesa 4 (2)",
            "line_ids": json.dumps([L_BEER]),
        },
        now=LATER,
    )
    s.check(
        "the beer is on the new check",
        s.q(f"SELECT order_id FROM sales_order_item WHERE id = '{L_BEER}'"),
        SPLIT_ORDER,
    )
    # A line already on the fire cannot go back to «pending», or the next round sends it again.
    s.check(
        "and it is still fired, on its round",
        s.qi(f"SELECT round_no FROM sales_order_item WHERE id = '{L_BEER}'"),
        1,
    )
    halves = [
        s.qi(f"SELECT provisional_total FROM sales_order WHERE id = '{ORDER}'"),
        s.qi(f"SELECT provisional_total FROM sales_order WHERE id = '{SPLIT_ORDER}'"),
    ]
    s.check(
        "the two halves are the burger and the beer",
        halves,
        [BURGER_CHARGED, BEER_PRICE],
    )
    s.check("and together they are still the whole check", sum(halves), CHECK_TOTAL)
    s.check(
        "the supplement travelled inside its line, nothing left behind",
        [
            o["option_id"]
            for o in json.loads(
                s.q(f"SELECT modifiers FROM sales_order_item WHERE id = '{L_BURGER}'")
            )
        ],
        ["o-cheese", "o-no-onion"],
    )


# ── 4 · the checkout — and THE MONEY GATE ───────────────────────────────────────────────────────


def link_4_what_the_check_was_worth_is_what_the_till_took(s: Session) -> int:
    print(
        "\n4 · the checkout: what the check is worth and what the till took are the SAME number"
    )
    # 9,00 € tax-included at 10 % → 818 + 82; 2,50 € at 21 % → 207 + 43. The handler's numbers.
    charge(
        s,
        SALE_BURGER,
        ORDER,
        "line-burger",
        L_BURGER,
        product_id="p-burger",
        product_name="Hamburguesa",
        unit_price=BURGER_CHARGED,
        rate=10.0,
        category="restaurant.food",
        net=818,
        tax=82,
        modifiers=PICKS_TEXT,
        category_id="cat-grill",
        notes="poco hecha",
    )
    charge(
        s,
        SALE_BEER,
        SPLIT_ORDER,
        "line-beer",
        L_BEER,
        product_id="p-beer",
        product_name="Caña",
        unit_price=BEER_PRICE,
        rate=21.0,
        category="product.generic",
        net=207,
        tax=43,
        modifiers="[]",
        category_id="cat-bar",
    )

    # 🔴 THE GATE. `provisional_total` is built by the module's own SQL from the waiter's rows;
    # `line_total` is built by the checkout from what it decided. sales#148 is the day those two
    # numbers stopped being equal and nothing noticed.
    charged = s.qi(
        "SELECT COALESCE(SUM(line_total), 0) FROM sales_sale_item WHERE hub_id = '"
        + HUB
        + f"' AND sale_id IN ('{SALE_BURGER}', '{SALE_BEER}')"
    )
    s.check("the till took exactly what the check was worth", charged, CHECK_TOTAL)
    s.check(
        "and neither half is off by a cent against its own check",
        [
            s.qi(f"SELECT total FROM sales_sale WHERE id = '{SALE_BURGER}'"),
            s.qi(f"SELECT total FROM sales_sale WHERE id = '{SALE_BEER}'"),
        ],
        [BURGER_CHARGED, BEER_PRICE],
    )
    s.check(
        "no row is off by a cent inside itself",
        s.qi(
            "SELECT count(*) FROM sales_sale_item WHERE net_amount + tax_amount <> line_total"
        ),
        0,
    )
    s.check(
        "both checks are closed, and each line names the sale that paid it",
        s.rows(
            "SELECT o.id AS order_id, o.status, i.sale_id FROM sales_order o "
            "JOIN sales_order_item i ON i.order_id = o.id AND i.hub_id = o.hub_id "
            f"WHERE o.hub_id = '{HUB}' ORDER BY o.id"
        ),
        [
            {"order_id": ORDER, "status": "completed", "sale_id": SALE_BURGER},
            {"order_id": SPLIT_ORDER, "status": "completed", "sale_id": SALE_BEER},
        ],
    )
    # ADR-0146: what a resumed screen still owes. A paid line that came back would be charged twice.
    s.check(
        "a paid line stops coming back through the door the POS resumes from",
        s.query("sales.order.lines", {"order_id": ORDER}),
        [],
    )
    return charged


# ── 5 · the paper ────────────────────────────────────────────────────────────────────────────


def link_5_the_paper_says_the_commercial_name(s: Session) -> None:
    print("\n5 · the paper: `sales.lines` gives the COMMERCIAL name, not the kitchen's")
    rows = s.query("sales.lines", {"sale_id": SALE_BURGER})
    s.check("the sale has one line", len(rows), 1)
    printed = s.parsed(rows, "modifiers", []) or []
    s.check(
        "the paper names both supplements, in the order they were chosen",
        [o["name"] for o in printed],
        ["Queso", "Sin cebolla"],
    )
    # The two doors carry two texts, frozen on the same row. If they were the same string this
    # assertion would pass without proving anything — hence both, and the difference asserted.
    s.check(
        "and it is NOT the text the pass read",
        [o["kitchen_name"] for o in printed],
        ["+QUESO", "-CEBOLLA"],
    )
    s.check(
        "the two doors really do say different things",
        [o["name"] == o["kitchen_name"] for o in printed],
        [False, False],
    )
    s.check(
        "the beer's ticket names no supplement",
        s.parsed(s.query("sales.lines", {"sale_id": SALE_BEER}), "modifiers", None),
        [],
    )
    s.check(
        "the supplement folded: ONE row, no child, no combo (that is `modifier_child_line`'s case)",
        s.rows(
            "SELECT parent_line_ref, combo_group_ref FROM sales_sale_item "
            f"WHERE sale_id = '{SALE_BURGER}'"
        ),
        [{"parent_line_ref": None, "combo_group_ref": None}],
    )


# ── 6 · reopening and reprinting ─────────────────────────────────────────────────────────────


def link_6_reopening_and_reprinting_change_nothing(s: Session) -> None:
    print(
        "\n6 · reopening puts the line back with its picks; the reprint is what was charged"
    )
    before = s.field(s.query("sales.lines", {"sale_id": SALE_BURGER}), "modifiers")
    # Reopening is what unties a line from its sale (`sale_id IS NULL` is the whole guard in every
    # door that moves order lines).
    s.psql(
        ["-c", f"UPDATE sales_order_item SET sale_id = NULL WHERE id = '{L_BURGER}'"]
    )
    resumed = s.query("sales.order.lines", {"order_id": ORDER})
    s.check("the line is back on the check", [r["id"] for r in resumed], [L_BURGER])
    s.check(
        "with the picks it was ordered with, untouched",
        [
            (o["option_id"], o["price_delta"], o["kitchen_name"])
            for o in (s.parsed(resumed, "modifiers", []) or [])
        ],
        [("o-cheese", CHEESE_DELTA, "+QUESO"), ("o-no-onion", 0, "-CEBOLLA")],
    )
    s.check(
        "and the reprint of the sale is byte for byte what was charged",
        s.field(s.query("sales.lines", {"sale_id": SALE_BURGER}), "modifiers"),
        before,
    )


# ── 7 · none of it crosses hubs ──────────────────────────────────────────────────────────


def link_7_nothing_crosses_hubs(s: Session) -> None:
    print("\n7 · a neighbour hub, live, with its own check: neither door leaks")
    open_the_check(
        s,
        hub=OTHER_HUB,
        order="ord-next-door",
        burger="oline-next-door-burger",
        beer="oline-next-door-beer",
    )
    s.check(
        "its check does not come back through ours",
        s.query("sales.order.lines", {"order_id": "ord-next-door"}, hub=HUB),
        [],
    )
    s.check(
        "and it is really there for its owner — the control that this check can see a positive",
        [
            r["id"]
            for r in s.query(
                "sales.order.lines", {"order_id": "ord-next-door"}, hub=OTHER_HUB
            )
        ],
        ["oline-next-door-burger", "oline-next-door-beer"],
    )
    s.check(
        "our reopened check is not visible to the neighbour either",
        s.query("sales.order.lines", {"order_id": ORDER}, hub=OTHER_HUB),
        [],
    )


# ── 🔴 THE POSITIVE CONTROL: the battery has to SEE sales#148 ────────────────────────────


def scenario_control(s: Session) -> None:
    """The same chain, charged the way it was charged BEFORE sales#148.

    The checkout reads the check and DROPS the picks — `chosen_modifiers` returning an empty list in
    silence, which is exactly the failure `sales.order_line_modifiers_unreadable` exists to prevent:
    «that silence would undercharge the check by the whole delta». The line lands at the bare
    product's price and the snapshot lands as `'[]'`.

    Nothing here asserts that the old behaviour is right. What is asserted is that THE GATE FIRES:
    the money gate of link 4 must come out short, and short by exactly the delta. A battery that
    could not tell the two runs apart would be a green that proves nothing."""
    print("\n🔴 control · the checkout drops the picks, as it did before sales#148")
    open_the_check(s)
    check_total = s.qi(
        f"SELECT provisional_total FROM sales_order WHERE id = '{ORDER}'"
    )
    s.check(
        "the check is still worth the burger WITH its cheese", check_total, CHECK_TOTAL
    )
    charge(
        s,
        SALE_BURGER,
        ORDER,
        "line-burger",
        L_BURGER,
        product_id="p-burger",
        product_name="Hamburguesa",
        # 🔴 The bug, in one line: the delta never reached the checkout, so the burger with cheese
        # is charged at the price of a burger and the snapshot is empty.
        unit_price=BURGER_PRICE,
        rate=10.0,
        category="restaurant.food",
        net=727,
        tax=73,
        modifiers="[]",
        category_id="cat-grill",
    )
    charge(
        s,
        SALE_BEER,
        ORDER,
        "line-beer",
        L_BEER,
        product_id="p-beer",
        product_name="Caña",
        unit_price=BEER_PRICE,
        rate=21.0,
        category="product.generic",
        net=207,
        tax=43,
        modifiers="[]",
        category_id="cat-bar",
    )
    charged = s.qi(
        "SELECT COALESCE(SUM(line_total), 0) FROM sales_sale_item WHERE hub_id = '"
        + HUB
        + f"' AND sale_id IN ('{SALE_BURGER}', '{SALE_BEER}')"
    )
    s.check(
        "control: the money gate FIRES — the till took less than the check",
        charged == check_total,
        False,
    )
    s.check(
        "control: and it is short by exactly the supplement that was dropped",
        check_total - charged,
        CHEESE_DELTA,
    )
    s.check(
        "control: the ticket names no supplement — charged, written, and silent",
        s.parsed(s.query("sales.lines", {"sale_id": SALE_BURGER}), "modifiers", None),
        [],
    )


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    prefix = f"sales_modifier_chain_test_{os.getpid()}"
    print(
        f"→ sales#237 · the supplement chain, against Postgres ({pg_harness.CONTAINER})"
    )
    chain = Session(f"{prefix}_chain", hub=HUB, user=USER, now=NOW)
    control = Session(f"{prefix}_control", hub=HUB, user=USER, now=NOW)
    try:
        chain.create()
        control.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        link_1_the_order_freezes_the_picks(chain)
        link_2_the_kitchen_door_hands_over_the_kitchen_name(chain)
        link_3_the_check_splits_without_losing_a_cent(chain)
        link_4_what_the_check_was_worth_is_what_the_till_took(chain)
        link_5_the_paper_says_the_commercial_name(chain)
        link_6_reopening_and_reprinting_change_nothing(chain)
        link_7_nothing_crosses_hubs(chain)
        scenario_control(control)
    finally:
        chain.drop()
        control.drop()

    chain.failures.extend(control.failures)
    return chain.report(
        "TPV → comanda → cocina → cobro → tique: the delta the check carried is the delta the "
        "till took, and the battery still sees it when it is not"
    )


if __name__ == "__main__":
    sys.exit(main())
