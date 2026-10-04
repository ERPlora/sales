-- sales#160 -- the sale turns `refunded` when its LAST cent goes back. Internal: the handler emits
-- it after the legs of every refund.
--
-- Without this mark the sales list would keep saying `completed` over a sale with no money behind
-- it, and the history would lie on the one screen the owner looks at every day. The `refunded`
-- status was already foreseen by migration 001 and `erp-sales-list` already knows how to paint it.
--
-- The original is NOT touched otherwise: the sale is immutable (`records.sale`), so neither amounts
-- nor lines are rewritten. Only the status changes, and with it the door: `sales.refund` demands
-- `completed`, so a sale already refunded in full takes no second refund.
--
-- sales#506: «is this the last cent?» is answered HERE, by the legs already written in this
-- transaction and the ones committed before it (`_refund_lock.sql` queued them), not by the
-- handler's read. Two partial refunds of 7,50 € fired at once on a 15,00 € ticket both read
-- «nothing refunded yet», both fit, and neither one alone reached the total: decided by the read,
-- the sale stayed `completed` with all its money handed back. A partial refund matches 0 rows here,
-- which is the expected answer, so this statement carries no `expect_rows`.
--
-- Filters `status = 'completed'` as well as the id, so the status is never rewritten, and `hub_id`
-- ALWAYS, so an id shared with another hub never touches the neighbour's sale or reads its legs.
UPDATE sales_sale
SET status = 'refunded',
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :sale_id
  AND hub_id = :hub_id
  AND status = 'completed'
  AND is_deleted = 0
  AND total > 0
  AND total <= (
      SELECT COALESCE(SUM(r.amount), 0)
        FROM sales_sale_refund_payment r
       WHERE r.sale_id = sales_sale.id
         AND r.hub_id = sales_sale.hub_id
         AND r.is_deleted = 0
  );
