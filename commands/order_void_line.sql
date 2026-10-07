-- sales#521 · voids a line ALREADY SENT to the kitchen (`sales.order.void_line`). The line leaves
-- the check like a removed one (soft-delete, row contract §2.5) and keeps why and who; the
-- provisional total is recomputed by the 2nd statement (order_recompute_total.sql).
--
-- Only what the void door is for, every other case touches no row and the manifest's
-- `expect_rows` turns that into `sales.order_line_not_voidable` (nothing is emitted):
--   · a line still to send is REMOVED (`sales.order.remove_line`), not voided;
--   · a line already paid (`sale_id`) belongs to a sale: that is voided or refunded as a sale;
--   · the check has to be open, live and in this hub;
--   · a reason is mandatory, and a line already voided keeps its first one.
-- `:reason` is used twice, so it is typed once for Postgres to prepare it (sales#509).
UPDATE sales_order_item
SET is_deleted = 1, deleted_at = :now,
    void_reason = TRIM(CAST(:reason AS TEXT)),
    voided_by = COALESCE(NULLIF(:approved_by, ''), :current_user_id),
    voided_at = :now,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NOT NULL
  AND sale_id IS NULL
  AND TRIM(CAST(:reason AS TEXT)) <> ''
  AND EXISTS (
    SELECT 1 FROM sales_order o
    WHERE o.id = :order_id AND o.hub_id = :hub_id AND o.status = 'open' AND o.is_deleted = 0
  );
