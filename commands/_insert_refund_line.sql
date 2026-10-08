-- services#158 / sales#571 -- records the units of ONE line that go back with the refund.
-- Internal, one per line the operator marked; the handler resolved the product from the sale's own
-- line and how many units go back (what was asked, or what is left of the line).
--
-- It only lands when the line is a line of THIS sale, of this hub, under this refund's own head,
-- and the units asked still fit in what is left of the line: its quantity minus what the refunds
-- still alive already took back. The handler already refused the cases it could see with its read
-- (`sales.refund_lines`), but that read is taken before the transaction: a second refund of the
-- same sale waits on `_refund_lock.sql` and sees here what the first one committed. A line that no
-- longer fits writes 0 rows and the command's `expect_rows` rolls the whole refund back with
-- `sales.refund_line_already_returned` — no head, no money, no line.
--
-- `:quantity` is cast where it is used: a parameter bound twice cannot be prepared untyped.
INSERT INTO sales_sale_refund_line (
    id, hub_id, refund_id, sale_id, sale_item_id, product_id, quantity,
    is_deleted, created_by, updated_by, created_at, updated_at
)
SELECT :refund_line_id, :hub_id, :refund_id, i.sale_id, i.id, :product_id, CAST(:quantity AS BIGINT),
       0, :current_user_id, :current_user_id, :now, :now
  FROM sales_sale_item i
 WHERE i.id = :sale_item_id
   AND i.sale_id = :sale_id
   AND i.hub_id = :hub_id
   AND EXISTS (
           SELECT 1
             FROM sales_sale_refund h
            WHERE h.id = :refund_id
              AND h.hub_id = :hub_id
              AND h.sale_id = :sale_id
       )
   AND CAST(:quantity AS BIGINT) > 0
   AND CAST(:quantity AS BIGINT) + COALESCE((
           SELECT SUM(r.quantity)
             FROM sales_sale_refund_line r
            WHERE r.sale_item_id = i.id
              AND r.hub_id = i.hub_id
              AND r.is_deleted = 0
       ), 0) <= i.quantity;
