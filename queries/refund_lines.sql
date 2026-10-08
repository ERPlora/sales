-- services#158 -- the lines of a sale that already went back with a refund. `sales.refund` reads it
-- to refuse returning a line twice, and the «Devolver» window to show it as «Ya devuelta».
SELECT r.sale_item_id, r.refund_id, r.product_id, r.quantity, r.created_at
  FROM sales_sale_refund_line r
 WHERE r.sale_id = :sale_id
   AND r.hub_id = :hub_id
   AND r.is_deleted = 0
 ORDER BY r.created_at ASC, r.sale_item_id ASC;
