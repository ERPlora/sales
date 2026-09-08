-- The departments the business configured for the open-price sheet (sales#267). Runtime injects
-- `:hub_id`.
--
-- It reads with `sales.view_sale`, NOT with `sales.manage_settings`, and that is the whole point:
-- the person who taps these buttons is the `cashier` or the `employee`, and neither holds
-- `manage_settings` (`role_permissions` in module.json). A catalogue behind the manager's
-- permission would paint the departments for whoever configured them and NOTHING for the till —
-- the exact failure `sales.pos_settings.get` was created to fix (sales#205), and here it would be
-- worse than a wrong default: with no departments the till falls back to the tax catalogue, so the
-- cashier would silently get the ten seeded categories back and nobody would know why.
--
-- Writing them stays where it belongs: `sales.departments.create/update/delete`, all three behind
-- `sales.manage_settings`.
--
-- The back office reads this SAME query: retiring a department is the soft delete, so "what the
-- till offers" and "what the business manages" are the same list. Two lists would mean two
-- notions of retired, and the screen would have to explain the difference.
SELECT id, name, tax_category_key, sort_order
FROM sales_department
WHERE hub_id = :hub_id AND is_deleted = 0
