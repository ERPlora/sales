-- sales#545 -- «is this line still on the check and unpaid?», asked once per row the checkout
-- charges, AFTER `sales._order_lock` queued it on the check (so the snapshot is fresh). Internal:
-- the only statement of `sales._order_line_live`. Matching 0 rows makes the command's
-- `expect_rows` answer `sales.order_changed`: the line was voided, removed or charged by another
-- device while the checkout waited, and the sale is not written. Scoped to its check and its hub.
SELECT id
  FROM sales_order_item
 WHERE id = :line_id
   AND order_id = :order_id
   AND hub_id = :hub_id
   AND is_deleted = 0
   AND sale_id IS NULL;
