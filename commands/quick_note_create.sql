-- New quick note (sales#206). `:new_id` is the runtime's; `sort_order` comes from the schema's
-- default when the form leaves it empty, so COALESCE is not needed here the way it was in
-- `create_payment_method` (that one has no schema at all, which is why the binder sent NULL).
INSERT INTO sales_quick_note
  (id, hub_id, text, sort_order, is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :text, :sort_order, 0, :current_user_id, :current_user_id, :now, :now);
