-- The counter's OWN policy: everything the POS screen and the paper decide with. Singleton per
-- hub, exactly like `sales.settings.get`.
--
-- It exists APART from `sales.settings.get` for one reason, and it is the same one that created
-- `sales.business.get` (sales#180): that query requires `sales.manage_settings`, and neither the
-- `cashier` nor the `employee` role has it (`role_permissions` in `module.json`). Reading the
-- policy through it gives a till that behaves one way for the manager who configured it and
-- another for the person standing at it — which is how a switch ends up "not working" for
-- everybody who actually uses the screen.
--
-- sales#25 opened it with the four fields that decide which catalogues feed the grid and how the
-- checkout opens. sales#203 widened it to the WHOLE operational policy, because the other twelve
-- were inert for a cashier in exactly the same way and for exactly the same reason: card-only,
-- no discounts, no parked tickets, net prices and the shop's own receipt all came back at the
-- factory default for the two roles that stand at the counter all day. The till now reads its
-- settings through this query and only this one, so the screen is the same for an admin and for a
-- cashier — a difference between the two is invisible by nature, because whoever tests it is an
-- admin.
--
-- It is a NARROWER door, never a wider one:
--   * READ-ONLY. Writing still goes through `sales.settings.update` and its `sales.manage_settings`.
--   * NOTHING SENSITIVE. Shop-floor configuration plus the receipt text the cashier prints anyway:
--     no secret, no credential, no other tenant's datum.
--   * NO `expose_api`. It is reachable through the dispatcher, never as a public HTTP surface.
--   * `id` STAYS OUT. The singleton's primary key is row identity, not policy, and nothing at the
--     counter uses it — the settings SCREEN saves against it, and that screen is the admin's.
--     `ticket_expiry_hours` and `restaurant_mode` stay out too: no reader anywhere.
--
-- No row = the defaults apply (see `schemas/settings_update.json`), which is what a freshly
-- installed hub gets.
SELECT allow_cash,
       allow_card,
       allow_transfer,
       sync_products,
       sync_services,
       require_customer,
       allow_discounts,
       max_discount_percent,
       enable_parked_tickets,
       default_tax_included,
       receipt_header,
       receipt_footer,
       receipt_footer_image,
       receipt_marketing_url,
       receipt_marketing_text,
       default_document_format,
       auto_invoice_with_tax_id
FROM sales_settings
WHERE hub_id = :hub_id AND is_deleted = 0
LIMIT 1;
