-- The till's OWN policy: the handful of settings the POS screen needs to decide what it shows
-- (sales#25). Singleton per hub, exactly like `sales.settings.get`.
--
-- It exists APART from `sales.settings.get` for one reason, and it is the same one that created
-- `sales.business.get` (sales#180): that query requires `sales.manage_settings`, and neither the
-- `cashier` nor the `employee` role has it (`role_permissions` in `module.json`). Reading the
-- policy through it gives a till that behaves one way for the manager who configured it and
-- another for the person standing at it — which is how a switch ends up "not working" for
-- everybody who actually uses the screen.
--
-- It is a NARROWER door, never a wider one: read-only, four non-sensitive columns of shop-floor
-- configuration, no `expose_api`. Writing them still goes through `sales.settings.update` and its
-- `sales.manage_settings`.
--
-- No row = the defaults apply (see `schemas/settings_update.json`): products and services both
-- shown, ticket format, no automatic invoice.
SELECT sync_products,
       sync_services,
       default_document_format,
       auto_invoice_with_tax_id
FROM sales_settings
WHERE hub_id = :hub_id AND is_deleted = 0
LIMIT 1;
