-- Edit the text or the position of a quick note (sales#206).
--
-- `hub_id` and `is_deleted = 0` are in the WHERE, not implied: this is the door that applies the
-- tenancy, so another hub's row matches nothing — and matching nothing is not silence, the
-- command's `expect_rows` turns it into `sales.quick_note_not_found`.
UPDATE sales_quick_note
SET text       = :text,
    sort_order = :sort_order,
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :quick_note_id AND hub_id = :hub_id AND is_deleted = 0;
