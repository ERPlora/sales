-- The quick notes the business configured for the line-note sheet (sales#206). Runtime injects
-- `:hub_id`.
--
-- It reads with `sales.view_sale`, NOT with `sales.manage_settings`, and that is the whole point:
-- the people who tap these chips are the `cashier` and the `employee`, and neither holds
-- `manage_settings` (`role_permissions` in module.json). A catalogue behind the manager's
-- permission would paint the chips for whoever configured them and nothing for the till — the
-- exact failure `sales.pos_settings.get` was created to fix (sales#205).
--
-- Writing them stays where it belongs: `sales.quick_notes.create/update/delete`, all three behind
-- `sales.manage_settings`.
SELECT id, text, sort_order
FROM sales_quick_note
WHERE hub_id = :hub_id AND is_deleted = 0
