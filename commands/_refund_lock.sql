-- sales#506 -- queues every refund of the same sale. Internal: first statement of
-- `sales._insert_refund`, which the `sales.refund` handler emits before the legs.
--
-- The cap of a refund is read BEFORE the transaction (`sales.refund_options` in `reads`), so two
-- refunds of the same ticket fired at once both saw «nothing refunded yet» and both wrote: a
-- 15,00 € ticket ended with 30,00 € handed back. Locking the sale row here makes the second refund
-- wait until the first commits; the NEXT statements (the head, each leg, the mark) then take a
-- fresh snapshot under READ COMMITTED, see what the first one wrote, and re-check the cap there.
--
-- 🔴 It has to be its OWN statement, before the guarded ones (same rule as
-- `services/_grant_lock.sql`): when a statement waits on a row lock, Postgres re-checks the row's
-- own conditions but NOT its subqueries, which keep the snapshot taken before the wait — and the
-- cap is a subquery.
--
-- Scoped to the hub: a sale of another hub with the same id is never queued with this one. No
-- status filter on purpose: a refund that waited on a sale that just turned `refunded` must still
-- wait, and then be refused by the head's own rule.
SELECT id
  FROM sales_sale
 WHERE id = :sale_id
   AND hub_id = :hub_id
   FOR UPDATE;
