-- ADR-0141 Gate 3/6: añade una línea a un pedido MUTABLE abierto. `:new_id` lo inyecta el runtime.
-- Escritura TRANSACCIONAL INMEDIATA (sustituye al blob con debounce de 400 ms del camino viejo).
-- El total del pedido se recompone en la 2ª sentencia (order_recompute_total.sql).
INSERT INTO sales_order_item
  (id, hub_id, order_id, product_id, product_name, product_sku, quantity, unit_price,
   is_gift, gift_reason, line_total, tax_category_key, cost,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :order_id, :product_id, :product_name, COALESCE(:product_sku, ''),
   :quantity, :unit_price, COALESCE(:is_gift, 0), COALESCE(:gift_reason, ''), :line_total,
   COALESCE(:tax_category_key, ''), COALESCE(:cost, 0),
   0, :current_user_id, :current_user_id, :now, :now);
