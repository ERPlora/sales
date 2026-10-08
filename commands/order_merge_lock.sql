-- sales#546 — JOIN, statement 1 of 5: queue on BOTH checks before anything moves. The same
-- recipe as `_order_lock.sql` (sales#545), for the two checks a join touches.
--
-- A join used to run beside a checkout of either check: lines moved into a check whose checkout
-- had already read its lines were left unpaid when that checkout closed it, and lines moved out of
-- a check being charged travelled to the other table after the sale charged them. Locking the two
-- rows here makes the join wait for a checkout in flight (and a checkout wait for the join); the
-- next statement then takes a fresh snapshot under READ COMMITTED and is refused by its gate
-- (`order_merge_open.sql`) if either check was charged meanwhile.
--
-- 🔴 Its OWN statement, before the gate: Postgres re-checks a waited-on row's own conditions but
-- NOT the subqueries, which keep the snapshot taken before the wait (`_refund_lock.sql`).
-- `ORDER BY id` takes the two locks in the same order for every join, so two joins of the same
-- pair in opposite directions queue instead of deadlocking. Scoped to the hub: a check of another
-- hub with the same id is never queued with ours. No status filter on purpose (see
-- `_order_lock.sql`).
SELECT id
  FROM sales_order
 WHERE id IN (:from_order_id, :to_order_id)
   AND hub_id = :hub_id
 ORDER BY id
   FOR UPDATE;
