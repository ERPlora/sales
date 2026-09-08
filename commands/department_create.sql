-- New open-price department (sales#267). `:new_id` is the runtime's; `sort_order` comes from the
-- schema's default when the form leaves it empty, the same way `quick_note_create` gets it.
INSERT INTO sales_department
  (id, hub_id, name, tax_category_key, sort_order, is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :name, :tax_category_key, :sort_order, 0, :current_user_id, :current_user_id, :now, :now);
