#!/usr/bin/env python3
"""A salon can sell a haircut at the till, against the REAL kernel with `services` installed (sales#278).

sales#273 was a salon whose till showed not one service: 22 shelf products, «No products» when
searching «Corte», every family tab at 0. Its fix made a BROKEN `services` read visible and kept the
unit tests green, but nobody went back to a real hub to see a haircut charged — and the two
explanations the triage left standing (a stale `sales`, or `sync_services` reaching 0) were never
ruled out. This battery is that check, kept in the suite so it cannot silently rot again.

It walks the till's own path, request by request, as captured from the browser on a real hub
(hub:stable + the salon chain + the «Peluquería» template, 26/09):

  1. THE SWITCH. `sales.pos_settings.get` — the door the till reads its policy through — leaves
     `sync_services` ON. With it off the till never asks `services` for anything and the grid is
     exactly the one the salon saw.
  2. THE CATALOGUE. A service family and a service created through `services`' own commands come
     back from `services.services.list` (every page, the way `queryAllOptional` reads it) with the
     four fields the till maps (price, family, tax category, pricing type), and the family from
     `services.categories.list` counts the service — not 0 (sales#99).
  3. THE SALE. `sales.order.open` → `sales.checkout.preview` → `sales.complete_sale` with the
     line the till builds for a service (`is_service: true`), paid by card: the sale is completed
     for the service's price, and its line keeps the service's NAME and says it is a service.

`services` is NOT in `depends_on` on purpose (ADR-0127: a restaurant must not be forced to install
it), so the runtime only has it when the catalogue is installed next to `sales` — which is what
`erplora test --against-hub` does since module-toolkit#135 and what the hub's
`test-hub-modules.yml` does for every module. Without `services` this battery FAILS: a salon check
that passes on a hub with no salon in it would prove nothing.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys
import uuid

from hub_harness import ONE, Hub, card_method_id, cents, ensure_business_identity, key

PRICE = 2500  # 25,00 € — a ladies' cut
TAX_CATEGORY = "service.generic"


def whole_list(hub: Hub, name: str, params: dict | None = None) -> list:
    """Every row of a `list` query, page after page — what `queryAllOptional` hands the till."""
    rows: list = []
    offset = 0
    while True:
        page = hub.page(name, {**(params or {}), "offset": offset})
        batch = page.get("rows", [])
        rows.extend(batch)
        total = page.get("total")
        offset += len(batch)
        if not batch or (total is not None and offset >= int(total)):
            return rows


def main() -> int:
    hub = Hub("service_sale", needs=("taxes", "sales", "services"))
    ensure_business_identity(hub)
    run = uuid.uuid4().hex[:6]
    family_name = f"Corte y peinado {run}"
    service_name = f"Corte de señora {run}"

    family_id = hub.run("services.categories.create", {"name": family_name})["new_ids"][
        0
    ]
    service_id = hub.run(
        "services.services.create",
        {
            "name": service_name,
            "tax_category_key": TAX_CATEGORY,
            "category_id": family_id,
            "pricing_type": "fixed",
            "price": PRICE,
            "duration_minutes": 45,
        },
    )["new_ids"][0]

    print("1 · the till's policy keeps the service catalogue on")
    policy = hub.query("sales.pos_settings.get")
    # No row yet = the till's defaults, where `sync_services` is on (pinned against the schema by
    # `ui/lib/settings-defaults-contract.test.ts` and against the column by pos_catalog_sources).
    sync_services = policy[0].get("sync_services") if policy else 1
    hub.check("sales.pos_settings.get → sync_services", sync_services, 1)

    print("2 · the service and its family reach the till's catalogue reads")
    services = whole_list(hub, "services.services.list")
    mine = next((s for s in services if s.get("id") == service_id), None)
    hub.check_true(
        "services.services.list carries the new service",
        mine is not None,
        f"{len(services)} rows, none with id {service_id}",
    )
    if mine is not None:
        hub.check("service name", mine.get("name"), service_name)
        hub.check("service price (cents)", cents(mine.get("price")), PRICE)
        hub.check("service family", mine.get("category_id"), family_id)
        hub.check("service tax category", mine.get("tax_category_key"), TAX_CATEGORY)
        hub.check("service pricing type", mine.get("pricing_type"), "fixed")
    families = whole_list(
        hub, "services.categories.list", {"sort": "name", "dir": "asc"}
    )
    hub.check_true(
        "services.categories.list carries the family",
        any(
            c.get("id") == family_id and c.get("name") == family_name for c in families
        ),
        f"{len(families)} families, none {family_id}",
    )
    hub.check(
        "the family tab counts its service (not 0, sales#99)",
        sum(1 for s in services if s.get("category_id") == family_id),
        1,
    )

    print("3 · the service goes on a check and is charged")
    # The line exactly as the till builds it for a service (`loadServices` + `add`).
    line = {
        "product_id": service_id,
        "product_name": service_name,
        "product_sku": "",
        "price": PRICE,
        "quantity": ONE,
        "is_gift": False,
        "gift_reason": "",
        "is_service": True,
        "tax_category_key": TAX_CATEGORY,
        "cost": 0,
        "category_id": family_id,
        "discount": 0,
        "staff_id": None,
        "notes": "",
        "modifiers": [],
    }
    order_id = hub.run("sales.order.open", {"items": [line]})["new_ids"][0]
    order_lines = hub.query("sales.order.lines", {"order_id": order_id})
    hub.check("the check holds one line", len(order_lines), 1)
    if len(order_lines) != 1:
        return hub.finish("")
    hub.check(
        "the check's line is the service", order_lines[0].get("product_id"), service_id
    )
    hub.check(
        "the check's line says it is a service", order_lines[0].get("is_service"), 1
    )

    charged = {
        **{
            k: v for k, v in line.items() if k not in ("notes", "modifiers", "staff_id")
        },
        "tax_rate": 21,
        "order_item_id": order_lines[0]["id"],
        "unit_code": "ud",
        "factor_num": 1,
        "factor_den": 1,
        "increment_value": ONE,
        "price_quantity_value": ONE,
        "pricing_unit_code": "ud",
        "pricing_factor_num": 1,
        "pricing_factor_den": 1,
    }
    preview = hub.run(
        "sales.checkout.preview",
        {
            "items": [charged],
            "discount_percent": 0,
            "tax_included": True,
            "order_id": order_id,
        },
    )
    hub.check("preview total", cents((preview.get("result") or {}).get("total")), PRICE)

    idem = key("service-sale")
    sale = hub.run(
        "sales.complete_sale",
        {
            "items": [charged],
            "discount_percent": 0,
            "idempotency_key": idem,
            "line_ids": None,
            "keep_order_open": False,
            "tax_included": True,
            "payment_method_id": card_method_id(hub),
            "payment_method_name": "Card",
            "channel": "pos",
            "source_module": "pos",
            "order_id": order_id,
            "appointment_id": None,
            "staff_id": None,
            "customer_id": None,
            "customer_name": "",
            "customer_tax_id": "",
            "customer_address": "",
            "customer_country": "",
            "customer_id_type": "",
            "document_type": "ticket",
        },
    )
    sale_id = sale["new_ids"][0]
    header = hub.query("sales.get", {"sale_id": sale_id})
    hub.check("the sale exists", len(header), 1)
    if header:
        hub.check("sale status", header[0].get("status"), "completed")
        hub.check("sale total (cents)", cents(header[0].get("total")), PRICE)
        hub.check("sale paid by", header[0].get("payment_method_name"), "Card")
    lines = hub.query("sales.lines", {"sale_id": sale_id})
    hub.check("the sale holds one line", len(lines), 1)
    if lines:
        hub.check("sold line name", lines[0].get("product_name"), service_name)
        hub.check("sold line is a service", lines[0].get("is_service"), 1)
        hub.check("sold line product", lines[0].get("product_id"), service_id)
        hub.check("sold line total (cents)", cents(lines[0].get("line_total")), PRICE)
        hub.check("sold line quantity", int(lines[0].get("quantity")), ONE)

    return hub.finish(
        "a salon's service is listed by the till's reads, goes on a check and is charged"
    )


if __name__ == "__main__":
    sys.exit(main())
