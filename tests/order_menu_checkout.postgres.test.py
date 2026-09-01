#!/usr/bin/env python3
"""A MENU charged from a RESUMED check, in a REAL Postgres 18 (sales#238 / sales#169 / ADR-0381).

The counter charges a set menu in one go. The restaurant runs the other way round: open a check, add
the menu, park it, come back half an hour later and charge it. Both have to end at the same numbers,
and until this battery the two halves of that sentence were checked by two different things that
met nowhere:

  · `order_combo.postgres.test.py` proves the order ROW keeps the composition and gives it back
    through `sales.order.lines`;
  · `combo_split.postgres.test.py` proves the SALE rows land as sibling lines that add up;
  · the handler's unit tests prove a check parked and resumed is charged like one charged directly.

Nobody walked the whole way. And the way is where it broke: the POS puts the COMBO id in
`product_id`, so the moment the composition was lost the checkout took the line for a catalogue
article, looked that id up in `inventory.products.for_sale`, did not find it, and REFUSED THE WHOLE
SALE with `sales.product_not_available`. A table that had eaten could not pay.

WHAT THIS BATTERY IS ABOUT: the JOURNEY, not the arithmetic. The apportionment of art. 79.Dos — 6,00 €
closed over a 4,50 € sandwich at 10 % and a 2,00 € beer at 21 % is 4,15 € + 1,85 €, the residual cent
to the beer by largest remainder — is the HANDLER's decision, it is written below as a literal, and
it is NOT what is under test here (its own unit tests and `combo_split` cover it). What is under
test is that the row which comes back from Postgres is SUFFICIENT to reach that decision, and that
building the sale FROM THE ROW lands on the very same numbers as building it from the catalogue.
Point 3 of the issue, and it is not negotiable: the item is armed from the ROW, never from the
object that was sent when the check was opened. If the journey loses something, that is where it
shows.

Five steps:

  1. OPENING. `sales._insert_order` / `_insert_order_line` / `_recompute_order_total` — the menu on an
     open check, its group minted by the server, its composition frozen in the order of choice, and
     NO money in the row beyond the closed price (the split is decided at the checkout, in the one
     pass sales#152 left).
  2. RESUMING. `sales.order.lines` is the ONLY door the POS rehydrates the cart from. The row it
     gives back has to carry everything the checkout needs: the composition, the group, the frozen
     price, the fiscal category and the whole unit context — with `product_id` still holding the
     COMBO id, which is exactly why the rest has to be there.
  3. CHARGING THAT CHECK, armed from the row. Two sibling lines, one group, two rates, adding up to
     the closed price EXACTLY; no parent line with money and none at 0 € (the Odoo bug, odoo#187509);
     the check closed and its line nailed to the sale.
  4. CONTROL: the same menu charged DIRECT, with no check in between. The two sales have to be the
     same, cent for cent and snapshot for snapshot.
  5. TENANCY, with a live neighbour: neither door leaks a check across hubs.

🔴 THE POSITIVE CONTROL (`scenario_control`). The same check as it exists on a hub that upgraded
from a `sales` older than v2.16.9: the row is there, but `combo_group_ref` is NULL and `combo` is
the `'{}'` its column defaults to. The battery must SEE that the resumed row is INSUFFICIENT —
nothing to walk, no siblings to build, and the money gate short by the whole menu. That is
`sales.product_not_available` seen from the database. If this control ever stops firing, the battery
has gone blind and every green above is worthless.

🔴 WHAT IS NOT COVERED, and it is NAMED rather than faked. The apportionment itself and the refusals
around it (`sales.combo_catalog_unavailable`, `sales.combo_not_on_sale`,
`sales.combo_component_price_unknown`, `sales.product_not_available`) are decisions inside
`dist/handler.wasm`. They HAVE unit tests, in `handler/src/lib.rs`, and NO GATE RUNS THEM:
`erplora validate` compiles the handler when a checkout of the hub happens to sit beside the module
(and on a runner not even that, «handler WASM SIN VERIFICAR»), but `cargo test` of `handler/` is
executed by nobody, in any of the 21 modules with a Tier 2 handler — module-toolkit#146. The
cross-module half, `order.completed` closing the kitchen order in `kitchen` (kitchen#66/#67), needs
the LIVE kernel: that is the `*.hub.test.py` family, whose runner exists
(`erplora test --against-hub`) and which the shared gate does not call, so those batteries report
NOT RUN on every run — module-toolkit#112.

So this battery does NOT prove that 6,00 € splits into 4,15 € + 1,85 €. It proves that whatever the
handler decides, it decides it from a row that came back WHOLE — and that a check charged after
being parked reaches the same numbers as one charged on the spot.

This battery asserts the minimum version it speaks for: `sales` ≥ v2.16.9, the release that gave the
order row its `combo`/`combo_group_ref` columns (hub#1157's rule).

Usage: tests/order_menu_checkout.postgres.test.py
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
from pg_harness import (
    MODULE_DIR,
    Session,
    order_line_params,
    sale_header_params,
    sale_line_params,
)

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-waiter"
DAY = "20260901"
NOW = "2026-09-01T18:00:00+00:00"
LATER = "2026-09-01T18:40:00+00:00"

# The release from which the order row can hold a menu at all (sales#169). Asserted, not written in
# prose: a battery that names a version it no longer runs against is a comment, not a guarantee.
MIN_SALES_VERSION = (2, 16, 9)

COMBO_ID = "c-merienda"
COMBO_NAME = "Pack merienda"
CLOSED_PRICE = 600  # 6,00 € — what the customer pays for the menu, whole

# What the waiter chose, in the order they chose it. `product_name` and `category_id` ride along for
# DISPLAY and for kitchen routing — never for money. There is no price in here on purpose: the row
# of an open check carries the composition, and the split is decided when the money is.
MENU_CHOICES = [
    {
        "option_id": "o-sandwich",
        "source": "product",
        "source_ref": "p-sandwich",
        "product_name": "Bocadillo",
        "category_id": "cat-cocina",
    },
    {
        "option_id": "o-beer",
        "source": "product",
        "source_ref": "p-beer",
        "product_name": "Cerveza",
        "category_id": "cat-barra",
    },
]
WORKING_COMBO = {"combo_id": COMBO_ID, "combo_choices": MENU_CHOICES}
WORKING_COMBO_TEXT = json.dumps(
    WORKING_COMBO, separators=(",", ":"), ensure_ascii=False
)

# ── The handler's golden vector, as literals ─────────────────────────────────────────────
#
# 6,00 € closed over catalogue prices of 4,50 € (10 %) and 2,00 € (21 %) → 4,15 € + 1,85 €, the
# residual cent to the beer by largest remainder; then the quota half-even over each tax-included
# share (ADR-0123): 415 = 377 + 38, 185 = 153 + 32. The same vector `combo_split.postgres.test.py`
# uses, on purpose — two batteries that disagree about what the handler decided would be worse than
# either of them alone.
#
# 🔴 Written out and NOT recomputed. Deriving these here would only prove that the copy agrees with
# itself. They are the FIXED end of the comparison; what moves is where the picks came from.
SHARES = {
    "o-sandwich": {
        "product_id": "p-sandwich",
        "product_name": "Bocadillo",
        "category_id": "cat-cocina",
        "catalog_price": 450,
        "share": 415,
        "rate": 10.0,
        "tax_category_key": "shop.food",
        "net": 377,
        "tax": 38,
    },
    "o-beer": {
        "product_id": "p-beer",
        "product_name": "Cerveza",
        "category_id": "cat-barra",
        "catalog_price": 200,
        "share": 185,
        "rate": 21.0,
        "tax_category_key": "product.generic",
        "net": 153,
        "tax": 32,
    },
}
SUBTOTAL = 530
TAX_TOTAL = 70
BREAKDOWN = json.dumps(
    {
        "10.00": {"base": 377, "tax": 38, "kind": "tax"},
        "21.00": {"base": 153, "tax": 32, "kind": "tax"},
    },
    separators=(",", ":"),
)

ORDER = "ord-table-7"
ORDER_LINE = "oline-menu"
RESUMED_SALE = "sale-resumed"
DIRECT_SALE = "sale-direct"


# ── The doors, played in the order the handlers emit them ────────────────────────────────


def open_the_check(
    s: Session,
    order: str = ORDER,
    line: str = ORDER_LINE,
    hub=None,
    combo: str = WORKING_COMBO_TEXT,
    group_ref=...,
) -> None:
    """What `sales.order.open` emits for a check whose first line is a menu.

    `group_ref` defaults to the one the server mints for the first line of a new check
    (`<order_id>-<position>`); the control passes NULL to reproduce a row written before sales#169."""
    s.command_ok(
        f"the waiter opens {order}",
        "sales._insert_order",
        {
            "id": order,
            "status": "open",
            "provisional_total": 0,
            "notes": "",
            "label": "Mesa 7",
            "source_module": "pos",
        },
        hub=hub,
    )
    s.command_ok(
        "the menu goes on the check, its composition frozen",
        "sales._insert_order_line",
        order_line_params(
            id=line,
            order_id=order,
            # 🔴 The trap of sales#169: the POS puts the COMBO id where a product id goes. Everything
            # else on this row exists so the checkout does not have to look it up in the catalogue.
            product_id=COMBO_ID,
            product_name=COMBO_NAME,
            unit_price=CLOSED_PRICE,
            line_total=CLOSED_PRICE,
            combo_group_ref=(f"{order}-0" if group_ref is ... else group_ref),
            combo=combo,
        ),
        hub=hub,
    )
    s.command_ok(
        "the check is worth the closed price of the menu",
        "sales._recompute_order_total",
        {"order_id": order},
        hub=hub,
    )


def siblings_from(picks: list, sale_id: str, group_ref: str) -> list:
    """The sibling lines the checkout materialises, walked FROM THE PICKS IT WAS GIVEN.

    This is the joint under test. Feed it the picks that came back out of Postgres and it builds the
    resumed sale; feed it the ones the POS sent and it builds the direct one. A pick that was lost,
    reordered or mangled on the round trip cannot come out the other side as the same line — which
    is the whole point, and the reason the shares are looked UP by `option_id` instead of being
    zipped positionally onto whatever arrived.
    """
    snapshot = {
        "combo_id": COMBO_ID,
        "name": COMBO_NAME,
        "price": CLOSED_PRICE,
        "price_charged": CLOSED_PRICE,
        "supply_kind": "goods",
        "components": [
            {
                "option_id": p["option_id"],
                "source_ref": SHARES[p["option_id"]]["product_id"],
                "name": SHARES[p["option_id"]]["product_name"],
                "tax_category_key": SHARES[p["option_id"]]["tax_category_key"],
                "catalog_price": SHARES[p["option_id"]]["catalog_price"],
                "share": SHARES[p["option_id"]]["share"],
            }
            for p in picks
            if p.get("option_id") in SHARES
        ],
    }
    text = json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False)
    lines = []
    for pos, pick in enumerate(picks):
        spec = SHARES.get(pick.get("option_id"))
        if spec is None:
            continue
        lines.append(
            sale_line_params(
                line_id=f"{sale_id}-{pos}",
                sale_id=sale_id,
                product_id=spec["product_id"],
                product_name=spec["product_name"],
                unit_price=spec["share"],
                tax_rate=spec["rate"],
                tax_category_key=spec["tax_category_key"],
                tax_rule_id=f"r-es-{int(spec['rate'])}",
                category_id=spec["category_id"],
                # ADR-0381 rule 6: the SAME snapshot frozen on EVERY sister, so changing the menu
                # tomorrow does not rewrite yesterday's ticket.
                combo=text,
                combo_group_ref=group_ref,
                net_amount=spec["net"],
                tax_amount=spec["tax"],
                line_total=spec["share"],
            )
        )
    return lines


def charge(
    s: Session,
    sale_id: str,
    lines: list,
    order_id=None,
    order_line=None,
    hub=None,
) -> None:
    """The operations `sales.complete_sale` emits, in its order: counter, header, one line per
    sister, the cash leg — and, when a check is behind it, the two that close it."""
    total = sum(line["line_total"] for line in lines)
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
            subtotal=SUBTOTAL,
            tax_amount=TAX_TOTAL,
            tax_breakdown=BREAKDOWN,
            total=total,
            amount_tendered=total,
            order_id=order_id,
            staff_id=USER,
            idempotency_key=f"idem-{sale_id}",
        ),
        hub=hub,
        now=LATER,
    )
    for pos, line in enumerate(lines):
        s.command_ok(
            f"sister {pos + 1}/{len(lines)} of the menu ({sale_id})",
            "sales._insert_line",
            line,
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
    if order_id:
        s.command_ok(
            f"the check's line is nailed to the sale that paid it ({sale_id})",
            "sales._mark_order_line_paid",
            {"line_id": order_line, "sale_id": sale_id},
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


def charged_lines(s: Session, sale_id: str) -> list:
    """The sale as the ticket reads it (`sales.lines`), projected onto everything that is NOT an id.

    The ids differ between the two paths by construction — they come from `context.new_ids` — so
    comparing them would be comparing the harness with itself. Everything else must match, and
    `combo_group_ref` is normalised to its POSITION so that «both sisters share one group» is still
    part of the comparison without pinning the id it happens to have."""
    rows = s.query("sales.lines", {"sale_id": sale_id})
    groups: dict = {}
    out = []
    for row in rows:
        ref = row.get("combo_group_ref")
        groups.setdefault(ref, len(groups))
        out.append(
            {
                "group": groups[ref],
                "product_id": row["product_id"],
                "product_name": row["product_name"],
                "unit_price": row["unit_price"],
                "tax_rate": row["tax_rate"],
                "tax_category_key": row["tax_category_key"],
                "category_id": row["category_id"],
                "net_amount": row["net_amount"],
                "tax_amount": row["tax_amount"],
                "line_total": row["line_total"],
                "combo": row["combo"],
                "parent_line_ref": row["parent_line_ref"],
            }
        )
    return out


# ── 0 · the version this battery speaks for ──────────────────────────────────────────────


def step_0_the_version_it_speaks_for(s: Session) -> None:
    print("\n0 · the release from which a check can hold a menu at all")
    raw = json.loads((MODULE_DIR / "package.json").read_text())["version"]
    version = tuple(int(p) for p in raw.split("-")[0].split("."))
    s.check(
        f"`sales` is at least v{'.'.join(str(p) for p in MIN_SALES_VERSION)} (running v{raw})",
        version >= MIN_SALES_VERSION,
        True,
    )


# ── 1 · opening the check ────────────────────────────────────────────────────────────────────────────


def step_1_the_menu_goes_on_the_check(s: Session) -> None:
    print(
        "\n1 · opening: the composition is frozen on the row, and no money beyond the closed price"
    )
    open_the_check(s)
    s.check(
        "the check is worth the closed price",
        s.qi(f"SELECT provisional_total FROM sales_order WHERE id = '{ORDER}'"),
        CLOSED_PRICE,
    )
    s.check(
        "ONE row, not a group: the split is decided at the checkout (sales#152)",
        s.qi(f"SELECT count(*) FROM sales_order_item WHERE order_id = '{ORDER}'"),
        1,
    )
    s.check(
        "the group is minted by the server from the check and the position",
        s.q(f"SELECT combo_group_ref FROM sales_order_item WHERE id = '{ORDER_LINE}'"),
        f"{ORDER}-0",
    )
    frozen = json.loads(
        s.q(f"SELECT combo FROM sales_order_item WHERE id = '{ORDER_LINE}'")
    )
    s.check("it says which menu it came from", frozen.get("combo_id"), COMBO_ID)
    s.check(
        "and what was chosen, in the order it was chosen",
        [c["option_id"] for c in frozen.get("combo_choices", [])],
        ["o-sandwich", "o-beer"],
    )
    s.check(
        "no share, no price, no rate in the row: the money is not decided yet",
        sorted(set().union(*(set(c) for c in frozen.get("combo_choices", []))))
        if frozen.get("combo_choices")
        else [],
        ["category_id", "option_id", "product_name", "source", "source_ref"],
    )


# ── 2 · resuming it ──────────────────────────────────────────────────────────────────────────


def step_2_the_resumed_row_is_sufficient(s: Session) -> list:
    print(
        "\n2 · resuming: the row `sales.order.lines` gives back has to be enough to charge it"
    )
    rows = s.query("sales.order.lines", {"order_id": ORDER})
    s.check("the check comes back with its line", [r["id"] for r in rows], [ORDER_LINE])
    row = rows[0] if rows else {}
    # 🔴 sales#169 in one assertion: the product id on the line is the MENU's, so if the rest of the
    # row did not travel the checkout would look this up in `inventory.products.for_sale`, not find
    # it, and refuse the whole sale. The table could not pay.
    s.check(
        "its `product_id` is the MENU, not an article", row.get("product_id"), COMBO_ID
    )
    s.check("so the group has to come back", row.get("combo_group_ref"), f"{ORDER}-0")
    resumed = json.loads(row.get("combo") or "{}")
    s.check("and the composition with it", resumed.get("combo_id"), COMBO_ID)
    picks = resumed.get("combo_choices", [])
    s.check(
        "with every pick, in the order they were chosen and with the article behind each",
        [(p["option_id"], p["source_ref"]) for p in picks],
        [("o-sandwich", "p-sandwich"), ("o-beer", "p-beer")],
    )
    s.check("the frozen price comes back whole", row.get("unit_price"), CLOSED_PRICE)
    s.check(
        "and so does the unit context, so half a kilo still means half a kilo (ADR-0147)",
        [row.get("quantity"), row.get("unit_code"), row.get("increment_value")],
        [1_000_000, "ud", 1_000_000],
    )
    s.check(
        "the round trip changed NOTHING about what was chosen",
        picks,
        MENU_CHOICES,
    )
    return picks


# ── 3 · charging THAT check, armed from the row ──────────────────────────────────────────


def step_3_charging_the_resumed_check(s: Session, picks: list) -> None:
    print(
        "\n3 · charging: the sale is armed FROM THE ROW, never from the opening payload"
    )
    charge(
        s,
        RESUMED_SALE,
        siblings_from(picks, RESUMED_SALE, f"{RESUMED_SALE}-g"),
        order_id=ORDER,
        order_line=ORDER_LINE,
    )
    rows = s.query("sales.lines", {"sale_id": RESUMED_SALE})
    s.check("the menu lands as TWO sisters", len(rows), 2)
    s.check(
        "one group, and both of them in it",
        len({r["combo_group_ref"] for r in rows}),
        1,
    )
    s.check(
        "at two different rates — the case that gets split (art. 79.Dos)",
        sorted(r["tax_rate"] for r in rows),
        [10.0, 21.0],
    )
    # 🔴 THE MONEY GATE: what the check was worth is what the till took.
    s.check(
        "and they add up to the closed price EXACTLY",
        s.qi(
            f"SELECT COALESCE(SUM(line_total), 0) FROM sales_sale_item WHERE sale_id = '{RESUMED_SALE}'"
        ),
        s.qi(f"SELECT provisional_total FROM sales_order WHERE id = '{ORDER}'"),
    )
    s.check(
        "no row is off by a cent inside itself",
        s.qi(
            f"SELECT count(*) FROM sales_sale_item WHERE sale_id = '{RESUMED_SALE}' "
            "AND net_amount + tax_amount <> line_total"
        ),
        0,
    )
    # The point of the whole design: Odoo's prorated combo shows up at 0 € in the sales report and
    # the operator believes it was given away (odoo#187509).
    s.check(
        "no parent line with money, and none at 0 € either",
        s.qi(
            f"SELECT count(*) FROM sales_sale_item WHERE sale_id = '{RESUMED_SALE}' "
            f"AND (line_total = 0 OR product_id = '{COMBO_ID}')"
        ),
        0,
    )
    s.check(
        "every sister carries the SAME frozen snapshot (ADR-0381 rule 6)",
        len({r.get("combo") for r in rows}),
        1,
    )
    s.check(
        "and it names the components in the order they were chosen",
        [
            c.get("option_id")
            for c in (s.parsed(rows, "combo", {}) or {}).get("components", [])
        ],
        ["o-sandwich", "o-beer"],
    )
    s.check(
        "the check is closed and its line names the sale that paid it",
        s.rows(
            "SELECT o.status, i.sale_id FROM sales_order o JOIN sales_order_item i "
            f"ON i.order_id = o.id AND i.hub_id = o.hub_id WHERE o.id = '{ORDER}'"
        ),
        [{"status": "completed", "sale_id": RESUMED_SALE}],
    )
    s.check(
        "and a paid line stops coming back through the door the POS resumes from (ADR-0146)",
        s.query("sales.order.lines", {"order_id": ORDER}),
        [],
    )


# ── 4 · the control: charging it DIRECT has to give the same ──────────────────────────────


def step_4_direct_checkout_matches(s: Session) -> None:
    print("\n4 · control: the same menu charged DIRECT, with no check in between")
    # The picks here are the POS's own, not Postgres's. The two sales being identical is what says
    # the journey through the database changed nothing — the sisters, the money, the snapshot and
    # the grouping all come out the same.
    charge(s, DIRECT_SALE, siblings_from(MENU_CHOICES, DIRECT_SALE, f"{DIRECT_SALE}-g"))
    s.check(
        "the direct sale hangs from no check",
        s.q(
            f"SELECT COALESCE(order_id, '<null>') FROM sales_sale WHERE id = '{DIRECT_SALE}'"
        ),
        "<null>",
    )
    s.check(
        "and the two are worth the same",
        s.qi(f"SELECT total FROM sales_sale WHERE id = '{DIRECT_SALE}'"),
        s.qi(f"SELECT total FROM sales_sale WHERE id = '{RESUMED_SALE}'"),
    )
    s.check(
        "line by line, cent by cent and snapshot by snapshot: resumed == charged direct",
        charged_lines(s, RESUMED_SALE),
        charged_lines(s, DIRECT_SALE),
    )
    s.check(
        "including the declared quota — one entry per RATE (ADR-0123 §4)",
        s.q(f"SELECT tax_breakdown FROM sales_sale WHERE id = '{RESUMED_SALE}'"),
        s.q(f"SELECT tax_breakdown FROM sales_sale WHERE id = '{DIRECT_SALE}'"),
    )


# ── 5 · tenancy, with a live neighbour ───────────────────────────────────────────────────


def step_5_nothing_crosses_hubs(s: Session) -> None:
    print("\n5 · a neighbour hub, live, with its own menu on its own check")
    open_the_check(s, order="ord-next-door", line="oline-next-door", hub=OTHER_HUB)
    s.check(
        "its check does not come back through ours",
        s.query("sales.order.lines", {"order_id": "ord-next-door"}, hub=HUB),
        [],
    )
    s.check(
        "and it is really there for its owner — the control that this check sees a positive",
        [
            r["id"]
            for r in s.query(
                "sales.order.lines", {"order_id": "ord-next-door"}, hub=OTHER_HUB
            )
        ],
        ["oline-next-door"],
    )
    s.check(
        "nor does our charged sale reach the neighbour's ticket",
        s.query("sales.lines", {"sale_id": RESUMED_SALE}, hub=OTHER_HUB),
        [],
    )


# ── 🔴 THE POSITIVE CONTROL: a check written before sales#169 ────────────────────────────


def scenario_control(s: Session) -> None:
    """The check as it sits on a hub upgraded from a `sales` older than v2.16.9.

    The row is there and it looks fine: the menu's name, the closed price, the quantity. What is
    missing is the only thing that matters — `combo_group_ref` is NULL and `combo` is the `'{}'` its
    column defaults to, because the columns did not exist when the check was opened.

    Nothing here asserts the old behaviour is right. What is asserted is THAT THE BATTERY SEES IT:
    the resumed row has no picks to walk, so no sister can be built, and the money gate comes out
    short by the whole menu. From here the real checkout takes the line for a catalogue article and
    refuses the sale with `sales.product_not_available` — the table that had eaten and could not
    pay. If this control ever stops firing, every green above is worthless."""
    print(
        "\n🔴 control · a check opened before sales#169: the composition never travelled"
    )
    open_the_check(s, combo="{}", group_ref=None)
    rows = s.query("sales.order.lines", {"order_id": ORDER})
    row = rows[0] if rows else {}
    s.check(
        "control: the row still names the MENU as its product",
        row.get("product_id"),
        COMBO_ID,
    )
    s.check("control: but there is no group on it", row.get("combo_group_ref"), None)
    picks = json.loads(row.get("combo") or "{}").get("combo_choices", [])
    s.check("control: and nothing to walk", picks, [])

    sisters = siblings_from(picks, RESUMED_SALE, f"{RESUMED_SALE}-g")
    s.check("control: so NO sister can be built from the row", sisters, [])
    charge(s, RESUMED_SALE, sisters, order_id=ORDER, order_line=ORDER_LINE)
    check_total = s.qi(
        f"SELECT provisional_total FROM sales_order WHERE id = '{ORDER}'"
    )
    charged = s.qi(
        f"SELECT COALESCE(SUM(line_total), 0) FROM sales_sale_item WHERE sale_id = '{RESUMED_SALE}'"
    )
    s.check(
        "control: the money gate FIRES — nothing was charged for the menu",
        charged == check_total,
        False,
    )
    s.check(
        "control: short by the whole closed price", check_total - charged, CLOSED_PRICE
    )
    s.check(
        "control: and the ticket of that sale has no line at all",
        s.query("sales.lines", {"sale_id": RESUMED_SALE}),
        [],
    )


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    prefix = f"sales_order_menu_checkout_test_{os.getpid()}"
    print(f"→ sales#238 · a menu charged from a resumed check ({pg_harness.CONTAINER})")
    chain = Session(f"{prefix}_chain", hub=HUB, user=USER, now=NOW)
    control = Session(f"{prefix}_control", hub=HUB, user=USER, now=NOW)
    try:
        chain.create()
        control.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        step_0_the_version_it_speaks_for(chain)
        step_1_the_menu_goes_on_the_check(chain)
        picks = step_2_the_resumed_row_is_sufficient(chain)
        step_3_charging_the_resumed_check(chain, picks)
        step_4_direct_checkout_matches(chain)
        step_5_nothing_crosses_hubs(chain)
        scenario_control(control)
    finally:
        chain.drop()
        control.drop()

    chain.failures.extend(control.failures)
    return chain.report(
        "abrir → retomar → cobrar gives the same money, the same sisters and the same snapshot as "
        "charging the menu directly, and the battery still sees it when the composition is lost"
    )


if __name__ == "__main__":
    sys.exit(main())
