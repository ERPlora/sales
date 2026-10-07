-- ADR-0141 Gate 3: removes a line from an open check (soft-delete, row contract §2.5). The
-- provisional total is recomputed by the last statement (order_recompute_total.sql); the first one
-- (`_order_lock.sql`) queued this removal on the check, so this one sees a fresh snapshot.
UPDATE sales_order_item
SET is_deleted = 1, deleted_at = :now, updated_by = :current_user_id, updated_at = :now
-- `fired_at IS NULL`: a line already sent to the kitchen is not removed from the till
-- (2026-07-19): it is voided with a reason (`sales.order.void_line`, sales#521).
-- sales#545: a line already charged (`sale_id`) belongs to its sale, and a check that is no
-- longer open (charged or voided while this removal waited on it) keeps its lines.
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NULL
  AND sale_id IS NULL
  AND EXISTS (
    SELECT 1 FROM sales_order o
    WHERE o.id = :order_id AND o.hub_id = :hub_id AND o.status = 'open' AND o.is_deleted = 0
  );
