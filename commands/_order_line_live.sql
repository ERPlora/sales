-- sales#545 -- «is this line still on the check and unpaid?», asked once per row the checkout
-- charges, AFTER `sales._order_lock` queued it on the check (so the snapshot is fresh). Internal:
-- the only statement of `sales._order_line_live`. Matching 0 rows makes the command's
-- `expect_rows` answer `sales.order_changed`: the line was voided, removed or charged by another
-- device while the checkout waited, and the sale is not written. Scoped to its check and its hub.
--
-- sales#546 -- «… and does it still say what the sale charges?». The checkout prices a row from
-- the row, but takes HOW MANY and «is it a comp» from its payload: a quantity raised from 2 to 3
-- (or a line comped or un-comped) between the checkout's read and its transaction left the sale
-- charging 2 and the row marked paid at 3. The handler binds the quantity and the comp flag it
-- charges; a row only marked as paid by a partial charge (`line_ids`, no item) binds NULL and
-- compares nothing but «live and unpaid». Each parameter is used twice, so it is CAST to one type
-- (a parameter Postgres deduces two types for cannot be prepared).
SELECT id
  FROM sales_order_item
 WHERE id = :line_id
   AND order_id = :order_id
   AND hub_id = :hub_id
   AND is_deleted = 0
   AND sale_id IS NULL
   AND (CAST(:quantity AS BIGINT) IS NULL OR quantity = CAST(:quantity AS BIGINT))
   AND (CAST(:is_gift AS INTEGER) IS NULL OR is_gift = CAST(:is_gift AS INTEGER));
