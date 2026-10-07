-- sales#545 -- «is this check still open?», asked AFTER `_order_lock.sql` queued the checkout on
-- it. Internal: second statement of `sales._order_lock`. Matching 0 rows makes the command's
-- `expect_rows` answer `sales.order_changed`: another device charged or voided the check while
-- this checkout waited. Scoped to the hub and to live rows, like every read of the check.
SELECT id
  FROM sales_order
 WHERE id = :order_id
   AND hub_id = :hub_id
   AND status = 'open'
   AND is_deleted = 0;
