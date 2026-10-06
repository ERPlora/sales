#!/usr/bin/env python3
"""A set menu fired from the till reaches the kitchen as the DISHES the table chose — against the
REAL kernel with `combos`, `kitchen`, `inventory` and `modifiers` installed next to `sales`
(sales#522, SALES-F12, SALES-F20, KITCHEN-F06, COMBOS-F11, MODIFIERS-F08).

Until sales#522 `sales.order.fire` sent a menu as ONE line «Menú del día»: no starter, no main, and
in «No station» unless the menu itself had a route. `kitchen` already knew how to expand a menu
(`kitchen/tests/combos.hub.test.py` proves it through its listener); nobody sent it the dishes.

  1. A table orders a «Menú del día» choosing a salad (cold station) and a steak (grill): firing
     the round opens ONE kitchen ticket with TWO lines, each on the station of ITS dish, grouped
     under the menu's kitchen name, the dish names taken from the product catalogue, the menu's
     note on both, and the closed price counted once.
  2. A supplement renamed in the catalogue between ordering and firing reaches the ticket with the
     name it was ORDERED with — the row froze it (sales#200), the kitchen used to reread today's.
  3. A supplement charged on the MENU line itself is printed on every dish the menu expands into:
     kitchen prints each dish's own supplements, so on the menu line alone it would be paid for
     and never read by the cook.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on its
own: without a runtime it fails, it does not skip.
"""

import sys
import uuid

import hub_harness
from hub_harness import ONE, Hub, wait_until

NEEDS = ("taxes", "sales", "inventory", "combos", "kitchen", "modifiers")


def tag() -> str:
    return uuid.uuid4().hex[:8]


def create_product(hub: Hub, name: str, price: int) -> str:
    out = hub.run(
        "inventory.products.create",
        {
            "name": name,
            "sku": f"{name[:3].upper()}-{tag()}",
            "price": price,
            "cost": price // 2,
            "stock": 100 * ONE,
            "low_stock_threshold": 5 * ONE,
            "product_type": "physical",
            "ean13": None,
            "description": "",
            "tax_category_key": "product.generic",
            "image": "",
        },
    )
    return out["new_ids"][0]


def create_station(hub: Hub, name: str, product_id: str) -> str:
    out = hub.run(
        "kitchen.stations.create",
        {"name": name, "destination": "both", "printer_role": "kitchen"},
    )
    station_id = out["new_ids"][0]
    hub.run(
        "kitchen.stations.set_routing",
        {"station_id": station_id, "product_id": product_id},
    )
    return station_id


def create_menu(
    hub: Hub, name: str, kitchen_name: str, courses: list
) -> tuple[str, list]:
    """A closed-price menu with one single-choice group per course. Answers the combo id and, per
    course, the option id of its one dish."""
    combo_id = hub.run(
        "combos.combos.create",
        {
            "name": name,
            "kitchen_name": kitchen_name,
            "price": 1350,
            "tax_category_key": "product.generic",
            "supply_kind": "service",
            "is_active": 1,
        },
    )["new_ids"][0]
    options = []
    for i, (course, product_id) in enumerate(courses):
        group_id = hub.run(
            "combos.groups.create",
            {
                "combo_id": combo_id,
                "name": course,
                "min_choices": 1,
                "max_choices": 1,
                "sort_order": i,
            },
        )["new_ids"][0]
        options.append(
            hub.run(
                "combos.options.create",
                {
                    "group_id": group_id,
                    "source": "product",
                    "source_ref": product_id,
                    "price_delta": 0,
                },
            )["new_ids"][0]
        )
    return combo_id, options


def open_order(hub: Hub, items: list) -> str:
    out = hub.run("sales.order.open", {"items": items})
    order_id = (out.get("new_ids") or [None])[0]
    if not isinstance(order_id, str) or not order_id:
        raise AssertionError(f"sales.order.open did not answer the order id: {out}")
    return order_id


def ticket_of(hub: Hub, order_id: str) -> dict:
    """The kitchen ticket `order.fired` opened for this check (the listener is asynchronous)."""

    def read():
        return [
            t
            for t in hub.query("kitchen.orders.list")
            if t.get("source_order_id") == order_id
        ]

    tickets = wait_until(read, lambda ts: len(ts) >= 1)
    hub.check("one round fired = ONE kitchen ticket", len(tickets or []), 1)
    return (tickets or [{}])[0]


def test_a_fired_menu_sends_each_dish_to_its_station(hub: Hub) -> None:
    print(
        "\n1 · a fired menu reaches the kitchen as its dishes, each on ITS station, as ONE menu"
    )
    t = tag()
    salad = create_product(hub, f"Ensalada {t}", 600)
    steak = create_product(hub, f"Entrecot {t}", 1500)
    cold = create_station(hub, f"Fría {t}", salad)
    grill = create_station(hub, f"Plancha {t}", steak)
    combo_id, (o_salad, o_steak) = create_menu(
        hub, f"Menú del día {t}", f"MENÚ {t}", [("Primero", salad), ("Segundo", steak)]
    )

    # Exactly what the till sends: the menu, what was chosen, the names it showed.
    order_id = open_order(
        hub,
        [
            {
                "combo_id": combo_id,
                "product_id": combo_id,
                "product_name": f"Menú del día {t}",
                "price": 1350,
                "quantity": ONE,
                "notes": "alergia al marisco",
                "combo_choices": [
                    {"option_id": o_salad, "product_name": "Ensalada"},
                    {"option_id": o_steak, "product_name": "Entrecot"},
                ],
            }
        ],
    )
    hub.run(
        "sales.order.fire",
        {"order_id": order_id, "round_no": 1, "label": "Mesa 7", "channel": "dine_in"},
    )

    ticket = ticket_of(hub, order_id)
    hub.check("the closed price counts ONCE", ticket.get("total"), 1350)
    lines = hub.query("kitchen.orders.items", {"order_id": ticket.get("id")})
    hub.check(
        "two dishes chosen, TWO kitchen lines (not one «Menú del día»)", len(lines), 2
    )
    hub.check(
        "each dish on the station of ITS product, never «No station»",
        {l.get("product_name"): l.get("station_id") for l in lines},
        {f"Ensalada {t}": cold, f"Entrecot {t}": grill},
    )
    hub.check(
        "grouped under the menu's KITCHEN name",
        sorted({l.get("combo_name") for l in lines}),
        [f"MENÚ {t}"],
    )
    hub.check_true(
        "one group for the menu",
        len({l.get("combo_ref") for l in lines}) == 1 and lines[0].get("combo_ref"),
        str([l.get("combo_ref") for l in lines]),
    )
    hub.check(
        "the menu's note reaches every dish",
        [l.get("notes") for l in lines],
        ["alergia al marisco", "alergia al marisco"],
    )


def test_a_renamed_supplement_reaches_the_kitchen_as_it_was_ordered(hub: Hub) -> None:
    print(
        "\n2 · a supplement renamed before firing is printed with the name it was ORDERED with"
    )
    t = tag()
    burger = create_product(hub, f"Hamburguesa {t}", 900)
    group_id = hub.run("modifiers.groups.create", {"name": f"Extras {t}"})["new_ids"][0]
    option_id = hub.run(
        "modifiers.options.create",
        {
            "group_id": group_id,
            "name": "Queso",
            "kitchen_name": "QUESO",
            "price_delta": 100,
        },
    )["new_ids"][0]
    order_id = open_order(
        hub,
        [
            {
                "product_id": burger,
                "product_name": f"Hamburguesa {t}",
                "price": 900,
                "quantity": ONE,
                "modifiers": [{"option_id": option_id}],
            }
        ],
    )
    hub.run(
        "modifiers.options.update",
        {
            "option_id": option_id,
            "name": "Queso vegano",
            "kitchen_name": "VEGANO",
            "price_delta": 100,
        },
    )
    hub.run(
        "sales.order.fire",
        {"order_id": order_id, "round_no": 1, "label": "Mesa 8", "channel": "dine_in"},
    )

    ticket = ticket_of(hub, order_id)
    lines = hub.query("kitchen.orders.items", {"order_id": ticket.get("id")})
    hub.check("one line", len(lines), 1)
    printed = str((lines or [{}])[0].get("modifiers"))
    hub.check_true("the ticket says what was ordered", "QUESO" in printed, printed)
    hub.check_true("and not today's name", "VEGANO" not in printed, printed)


def test_a_supplement_on_the_menu_line_reaches_every_dish(hub: Hub) -> None:
    print(
        "\n3 · a supplement charged on the MENU line is printed on every dish of the menu"
    )
    t = tag()
    salad = create_product(hub, f"Ensalada {t}", 600)
    steak = create_product(hub, f"Entrecot {t}", 1500)
    combo_id, (o_salad, o_steak) = create_menu(
        hub, f"Menú del día {t}", f"MENÚ {t}", [("Primero", salad), ("Segundo", steak)]
    )
    group_id = hub.run("modifiers.groups.create", {"name": f"Extras {t}"})["new_ids"][0]
    option_id = hub.run(
        "modifiers.options.create",
        {
            "group_id": group_id,
            "name": "Guarnición extra",
            "kitchen_name": "EXTRA GUARN",
            "price_delta": 200,
        },
    )["new_ids"][0]
    # The till's sheet offers no supplement on a menu, but the door takes one (the assistant, the
    # API) and the check charges it: the cook has to read it.
    order_id = open_order(
        hub,
        [
            {
                "combo_id": combo_id,
                "product_id": combo_id,
                "product_name": f"Menú del día {t}",
                "price": 1350,
                "quantity": ONE,
                "modifiers": [{"option_id": option_id}],
                "combo_choices": [
                    {"option_id": o_salad, "product_name": "Ensalada"},
                    {"option_id": o_steak, "product_name": "Entrecot"},
                ],
            }
        ],
    )
    row = (hub.query("sales.order.lines", {"order_id": order_id}) or [{}])[0]
    hub.check("the check charges the supplement", row.get("line_total"), 1550)
    hub.run(
        "sales.order.fire",
        {"order_id": order_id, "round_no": 1, "label": "Mesa 9", "channel": "dine_in"},
    )

    ticket = ticket_of(hub, order_id)
    lines = hub.query("kitchen.orders.items", {"order_id": ticket.get("id")})
    hub.check(
        "every dish of the menu prints the supplement",
        [l.get("modifiers") for l in lines],
        ["EXTRA GUARN", "EXTRA GUARN"],
    )


def main() -> int:
    hub = Hub("combo_fire.hub", needs=NEEDS)
    print(
        f"Hub battery · a menu reaches the kitchen as its dishes (sales#522) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    test_a_fired_menu_sends_each_dish_to_its_station(hub)
    test_a_renamed_supplement_reaches_the_kitchen_as_it_was_ordered(hub)
    test_a_supplement_on_the_menu_line_reaches_every_dish(hub)
    return hub.finish("a fired menu reaches each station as the dishes the table chose")


if __name__ == "__main__":
    sys.exit(main())
