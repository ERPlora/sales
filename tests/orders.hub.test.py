#!/usr/bin/env python3
"""Open checks (`sales.order.*`) against the REAL kernel — ported from the hub's `sales_e2e.rs`
(ERPlora/hub#1264, contract «El Hub se CIERRA como KERNEL» §5).

ADR-0141: the order is the MUTABLE entity of a sale — opened with its lines materialised early,
edited while the table eats, and frozen into one or more IMMUTABLE sales at checkout (split-bill
= 1 order → N sales). `sales.order.open` and `sales.order.add_line` are Tier 2 handlers and the
rest are declarative commands; all of them only mean something inside the runtime that mints
their ids and wraps their transaction, so they are proven here, through HTTP, and nowhere else.

  1. `order.open` materialises header + lines (`operations` = 3 for two lines), the order is born
     `open`, its provisional total is the sum of the lines, and the response carries the order's
     id in `new_ids[0]` — the POS needs it to add lines (ADR-0141 gate 6).
  2. The order knows NOTHING about customers: no `customer_id` on it, by design (a grocery sells
     without one; the junction is owned by `customers`).
  3. A line added, changed and removed recomputes the provisional total each time; `add_line`
     answers the id of the row it created (ADR-0144: without it the waiter's fifth tap raised the
     quantity on screen and persisted nothing), and with that id the quantity really moves.
  4. Checking out an order (`complete_sale` with `order_id`) freezes one sale linked to it and
     marks it `completed`.
  5. Split-bill: two partial checkouts of one order (`keep_order_open`) produce two sales, both
     linked to the same order, and the FINAL one completes it.
  6. «Each pays their own» (ADR-0146): a partial checkout with `line_ids` retires those lines from
     the open check — what was paid never comes back to the screen, so it is never charged twice.
  7. Voiding an open order cancels the ticket before any money moves.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys

import hub_harness
from hub_harness import ONE, Hub, cash_method_id, cents, key, sale_by_key


def open_order(hub: Hub, items: list[dict]) -> tuple[str, dict]:
    out = hub.run("sales.order.open", {"items": items})
    order_id = (out.get("new_ids") or [None])[0]
    if not isinstance(order_id, str) or not order_id:
        raise AssertionError(
            f"sales.order.open did not answer the order id in new_ids[0]: {out}"
        )
    return order_id, out


def order(hub: Hub, order_id: str) -> dict:
    rows = hub.query("sales.order.get", {"order_id": order_id})
    return rows[0] if rows else {}


def lines(hub: Hub, order_id: str) -> list[dict]:
    return hub.query("sales.order.lines", {"order_id": order_id})


def test_open_materialises_the_lines_and_answers_the_id(hub: Hub) -> None:
    print("\n1 · order.open: header + lines materialised early, id in new_ids[0]")
    oid, out = open_order(
        hub,
        [
            {"product_name": "Café", "price": 121, "quantity": 2 * ONE},
            {"product_name": "Agua", "price": 110, "quantity": ONE},
        ],
    )
    hub.check("operations = 1 header + 2 lines", out.get("operations"), 3)
    o = order(hub, oid)
    hub.check("the id returned identifies the order", o.get("id"), oid)
    hub.check("born open (mutable)", o.get("status"), "open")
    hub.check("provisional_total = 121×2 + 110", cents(o.get("provisional_total")), 352)
    listed = [r["id"] for r in hub.query("sales.orders.list")]
    hub.check_true("orders.list carries it", oid in listed, str(listed[:5]))
    ls = lines(hub, oid)
    hub.check("one real row per item", len(ls), 2)
    cafe = next((l for l in ls if l.get("product_name") == "Café"), {})
    hub.check("fixed-point quantity (ADR-0147)", cafe.get("quantity"), 2 * ONE)
    hub.check("provisional line_total", cents(cafe.get("line_total")), 242)
    hub.check("the line hangs from the order", cafe.get("order_id"), oid)


def test_the_order_knows_nothing_about_customers(hub: Hub) -> None:
    print(
        "\n2 · the order carries no customer (ADR-0141: the junction is owned by customers)"
    )
    oid, _ = open_order(hub, [{"product_name": "Café", "price": 121, "quantity": ONE}])
    o = order(hub, oid)
    hub.check_true(
        "no `customer_id` on the order", "customer_id" not in o, str(sorted(o))
    )


def test_mutating_an_open_order_recomputes_its_total(hub: Hub) -> None:
    print(
        "\n3 · add / update / remove recompute the provisional total; add_line answers its id"
    )
    oid, _ = open_order(
        hub, [{"product_name": "Café", "price": 121, "quantity": 2 * ONE}]
    )

    added = hub.run(
        "sales.order.add_line",
        {
            "order_id": oid,
            "product_name": "Agua",
            "unit_price": 110,
            "quantity": ONE,
            "line_total": 110,
        },
    )
    agua_id = (added.get("new_ids") or [None])[0]
    hub.check_true(
        "add_line answers the id of the row it created",
        isinstance(agua_id, str) and bool(agua_id),
        str(added),
    )
    hub.check(
        "after add_line: 242 + 110",
        cents(order(hub, oid).get("provisional_total")),
        352,
    )
    ls = lines(hub, oid)
    hub.check(
        "the returned id IS the new row",
        [l["id"] for l in ls if l.get("product_name") == "Agua"],
        [agua_id],
    )
    cafe_id = next(l["id"] for l in ls if l.get("product_name") == "Café")

    hub.run(
        "sales.order.update_line",
        {"order_id": oid, "line_id": cafe_id, "quantity": 3 * ONE, "line_total": 363},
    )
    hub.check(
        "after update_line: 363 + 110",
        cents(order(hub, oid).get("provisional_total")),
        473,
    )
    cafe = next(l for l in lines(hub, oid) if l["id"] == cafe_id)
    hub.check(
        "the quantity really moved (five taps, five coffees)",
        cafe.get("quantity"),
        3 * ONE,
    )

    hub.run("sales.order.remove_line", {"order_id": oid, "line_id": agua_id})
    hub.check(
        "after remove_line: 363", cents(order(hub, oid).get("provisional_total")), 363
    )
    hub.check("one line left", len(lines(hub, oid)), 1)

    hub.run("sales.order.void", {"order_id": oid})
    hub.check("void cancels the open ticket", order(hub, oid).get("status"), "voided")


def test_checkout_completes_the_order_and_links_the_sale(hub: Hub, cash: str) -> None:
    print(
        "\n4 · checkout freezes one immutable sale linked to the order and completes it"
    )
    oid, _ = open_order(
        hub, [{"product_name": "Café", "price": 121, "quantity": 2 * ONE}]
    )
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key("checkout"),
            "payment_method_id": cash,
            "order_id": oid,
            "amount_tendered": 300,
            "items": [
                {
                    "product_name": "Café",
                    "price": 121,
                    "quantity": 2 * ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    hub.check(
        "the order is completed by the charge",
        order(hub, oid).get("status"),
        "completed",
    )
    sale = hub.query("sales.get", {"sale_id": out["new_ids"][0]})[0]
    hub.check("the sale points at the order", sale.get("order_id"), oid)
    hub.check("and is immutable: completed", sale.get("status"), "completed")


def test_split_bill_one_order_two_sales(hub: Hub, cash: str) -> None:
    print("\n5 · split-bill: 1 order → 2 sales; the final charge completes the order")
    oid, _ = open_order(
        hub,
        [
            {"product_name": "Plato A", "price": 1000, "quantity": ONE},
            {"product_name": "Plato B", "price": 500, "quantity": ONE},
        ],
    )
    first = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key("split-a"),
            "payment_method_id": cash,
            "order_id": oid,
            "keep_order_open": True,
            "amount_tendered": 1000,
            "items": [
                {
                    "product_name": "Plato A",
                    "price": 1000,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    hub.check(
        "a partial charge leaves the order open", order(hub, oid).get("status"), "open"
    )
    second = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key("split-b"),
            "payment_method_id": cash,
            "order_id": oid,
            "amount_tendered": 500,
            "items": [
                {
                    "product_name": "Plato B",
                    "price": 500,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    hub.check(
        "the final charge completes the order",
        order(hub, oid).get("status"),
        "completed",
    )
    ids = [first["new_ids"][0], second["new_ids"][0]]
    hub.check("two distinct sales", len(set(ids)), 2)
    for sid in ids:
        hub.check(
            f"sale {sid[:8]}… points at the order",
            hub.query("sales.get", {"sale_id": sid})[0].get("order_id"),
            oid,
        )


def test_each_diner_pays_their_own_lines(hub: Hub, cash: str) -> None:
    print(
        "\n6 · each pays their own: the paid line never comes back to the screen (ADR-0146)"
    )
    oid, _ = open_order(
        hub,
        [
            {"product_name": "Menú A", "price": 1200, "quantity": ONE},
            {"product_name": "Menú B", "price": 1500, "quantity": ONE},
        ],
    )
    ls = lines(hub, oid)
    hub.check("two lines to pay", len(ls), 2)
    line_a = next(l["id"] for l in ls if l.get("product_name") == "Menú A")

    k1 = key("own-first")
    hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": k1,
            "payment_method_id": cash,
            "order_id": oid,
            "keep_order_open": True,
            "line_ids": [line_a],
            "amount_tendered": 1200,
            "tax_included": True,
            "items": [
                {
                    "product_name": "Menú A",
                    "price": 1200,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    pending = lines(hub, oid)
    hub.check(
        "only the OTHER line is still to pay",
        [l.get("product_name") for l in pending],
        ["Menú B"],
    )
    hub.check("somebody still has to pay", order(hub, oid).get("status"), "open")

    k2 = key("own-second")
    hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": k2,
            "payment_method_id": cash,
            "order_id": oid,
            "amount_tendered": 1500,
            "tax_included": True,
            "items": [
                {
                    "product_name": "Menú B",
                    "price": 1500,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    hub.check(
        "the second charge closes the check", order(hub, oid).get("status"), "completed"
    )
    hub.check(
        "one check → two sales, each with its own",
        len(sale_by_key(hub, k1)) + len(sale_by_key(hub, k2)),
        2,
    )


def main() -> int:
    hub = Hub("orders.hub")
    print(
        f"Hub battery · open checks (hub#1264 ← sales_e2e.rs) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    cash = cash_method_id(hub)
    test_open_materialises_the_lines_and_answers_the_id(hub)
    test_the_order_knows_nothing_about_customers(hub)
    test_mutating_an_open_order_recomputes_its_total(hub)
    test_checkout_completes_the_order_and_links_the_sale(hub, cash)
    test_split_bill_one_order_two_sales(hub, cash)
    test_each_diner_pays_their_own_lines(hub, cash)
    return hub.finish(
        "open checks behave as ADR-0141/0146 promise, against the real kernel"
    )


if __name__ == "__main__":
    sys.exit(main())
