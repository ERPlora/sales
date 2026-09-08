-- Retire a department (sales#267). SOFT delete, like every catalogue row of the module: the name
-- and the tax category are frozen on the lines already sold (`sales_sale_item.product_name` /
-- `tax_category_key`) and do not point here, so retiring one changes nothing already charged and
-- nothing already declared — it only stops offering the button.
--
-- Retiring the LAST one is allowed and is not a dead end: with no departments the till falls back
-- to the active tax categories, which is exactly how it behaved before this table existed.
UPDATE sales_department
SET is_deleted = 1,
    deleted_at = :now,
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :department_id AND hub_id = :hub_id AND is_deleted = 0;
