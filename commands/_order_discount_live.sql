-- sales#553 -- «does the check still hold the ticket discount this checkout charges?», asked once,
-- AFTER `sales._order_lock` queued the checkout on the check (so the snapshot is fresh). Internal:
-- the only statement of `sales._order_discount_live`. The sale takes the ticket percent and the
-- fixed amount from its payload; a ticket discount put on, changed or taken off by another device
-- while the checkout waited left the sale charging the old one and the check storing the new one.
-- Matching 0 rows makes the command's `expect_rows` answer `sales.order_changed` and the sale is
-- not written. The percent is compared on every charge; the amount only on the charge that closes
-- the check (a partial charge does not carry it and binds NULL). Each parameter is used twice, so
-- it is CAST to the column's Postgres type (a parameter Postgres deduces two types for cannot be
-- prepared): the portable REAL column is DOUBLE PRECISION there, a CAST to REAL would be float4.
-- «Still open and live» is not asked again: `sales._order_lock` proved it under the same lock.
SELECT id
  FROM sales_order
 WHERE id = :order_id
   AND hub_id = :hub_id
   AND discount_percent = CAST(:discount_percent AS DOUBLE PRECISION)
   AND (CAST(:discount_amount AS BIGINT) IS NULL OR discount_amount = CAST(:discount_amount AS BIGINT));
