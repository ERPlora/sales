-- Edit the name, the tax category or the position of a department (sales#267).
--
-- `hub_id` and `is_deleted = 0` are in the WHERE, not implied: this is the door that applies the
-- tenancy, so another hub's row matches nothing — and matching nothing is not silence, the
-- command's `expect_rows` turns it into `sales.department_not_found`.
--
-- Changing the tax category does NOT reprice anything already sold: the category was frozen onto
-- the line at checkout, which is what keeps a VAT change from rewriting last month's takings.
UPDATE sales_department
SET name             = :name,
    tax_category_key = :tax_category_key,
    sort_order       = :sort_order,
    updated_by       = :current_user_id,
    updated_at       = :now
WHERE id = :department_id AND hub_id = :hub_id AND is_deleted = 0;
