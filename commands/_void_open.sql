-- sales#511 -- «is this sale still not voided?», asked AFTER `_refund_lock.sql` queued the void on
-- the sale. Internal: second statement of `sales._void_lock`, which the `sales.void` handler emits
-- before `sales._void_sale`.
--
-- The handler already refused a voided sale, but it read BEFORE the transaction. Two voids of the
-- same ticket fired at once both read `completed`; the second one waited on the lock and then found
-- the sale voided by the first. Its `_void_sale` UPDATE touched no row and the command still
-- answered `ok` and emitted a second `sale.voided` (cash_register and inventory reverse on it).
--
-- Matching 0 rows here makes the command's `expect_rows` answer `sales.already_voided`. It is the
-- FIRST gate of the void on purpose: `_void_sale`'s gate (`sales.sale_already_refunded`) would also
-- fire on a voided sale, and «it already has refunds» would be false for it.
--
-- `status <> 'voided'` and not `= 'completed'`: a sale a full refund just closed is `refunded`,
-- and it must pass this check so that `_void_sale` refuses it as REFUNDED, which is what happened.
-- Scoped to the hub and to live rows, like every read of the sale.
SELECT id
  FROM sales_sale
 WHERE id = :sale_id
   AND hub_id = :hub_id
   AND is_deleted = 0
   AND status <> 'voided';
