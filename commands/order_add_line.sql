-- ADR-0141 Gate 3: añade una línea a un pedido MUTABLE abierto. `:new_id` lo inyecta el runtime.
-- `line_total` es PROVISIONAL (display); la cuota fiscal se congela al cobrar. Se recompone el total
-- del pedido en la 2ª sentencia del command (order_recompute_total.sql).
INSERT INTO sales_order_item
  (id, hub_id, order_id, product_id, product_name, product_sku, quantity, unit_price, is_gift, line_total,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :order_id, :product_id, :product_name, COALESCE(:product_sku, ''),
   :quantity, :unit_price, COALESCE(:is_gift, 0), :line_total,
   0, :current_user_id, :current_user_id, :now, :now);
