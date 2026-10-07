-- sales#545 -- queues on an OPEN CHECK every door that charges it or takes a line off it. Internal:
-- first statement of `sales._order_lock` (the checkout, `sales.complete_sale`, emits it before
-- anything else), and of `sales.order.void_line` and `sales.order.remove_line`.
--
-- The checkout reads the lines of the check BEFORE its transaction (`sales.order.lines` in
-- `reads`). A void or a removal committed between that read and the checkout's writes went
-- through, and so did the checkout: the sale charged the plate the house had just voided, and the
-- check said one total and the ticket another. Locking the check's row here makes whoever comes
-- second wait until the first commits; its NEXT statements then take a fresh snapshot under READ
-- COMMITTED, see what the first one wrote, and are refused by their own gate.
--
-- 🔴 It has to be its OWN statement, before the guarded ones (same rule as `_refund_lock.sql`):
-- when a statement waits on a row lock, Postgres re-checks the row's own conditions but NOT its
-- subqueries, which keep the snapshot taken before the wait — and «the check is still open» is a
-- subquery of the line doors.
--
-- Scoped to the hub: a check of another hub with the same id is never queued with this one. No
-- status filter on purpose: a door that waited on a check that just closed must still wait, and
-- then be refused by its own gate.
SELECT id
  FROM sales_order
 WHERE id = :order_id
   AND hub_id = :hub_id
   FOR UPDATE;
