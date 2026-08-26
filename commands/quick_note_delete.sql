-- Retire a quick note (sales#206). SOFT delete, like every catalogue row of the module: the notes
-- already typed on a check or frozen on a sale are TEXT on those rows and do not point here, so
-- retiring one changes nothing already charged — it only stops offering the chip.
UPDATE sales_quick_note
SET is_deleted = 1,
    deleted_at = :now,
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :quick_note_id AND hub_id = :hub_id AND is_deleted = 0;
