-- ADR-0141 Gate 3/6: añade una línea a un pedido MUTABLE abierto. `:new_id` lo inyecta el runtime.
-- Escritura TRANSACCIONAL INMEDIATA (sustituye al blob con debounce de 400 ms del camino viejo).
-- El total del pedido se recompone en la 2ª sentencia (order_recompute_total.sql).
-- ADR-0147: `quantity` en punto fijo 10⁶; el POS manda el contexto de unidades congelado del
-- producto (§2.4). COALESCE = compat con llamadores que aún no lo envían (unidad suelta).
INSERT INTO sales_order_item
  (id, hub_id, order_id, product_id, product_name, product_sku, quantity, unit_price,
   is_gift, gift_reason, line_total, tax_category_key, cost,
   is_deleted, created_by, updated_by, created_at, updated_at,
   unit_code, unit_name, factor_num, factor_den, increment_value,
   price_quantity_value, pricing_unit_code, pricing_unit_name,
   pricing_factor_num, pricing_factor_den)
VALUES
  (:new_id, :hub_id, :order_id, :product_id, :product_name, COALESCE(:product_sku, ''),
   :quantity, :unit_price, COALESCE(:is_gift, 0), COALESCE(:gift_reason, ''), :line_total,
   COALESCE(:tax_category_key, ''), COALESCE(:cost, 0),
   0, :current_user_id, :current_user_id, :now, :now,
   COALESCE(:unit_code, 'ud'), COALESCE(:unit_name, ''),
   COALESCE(:factor_num, 1), COALESCE(:factor_den, 1),
   COALESCE(:increment_value, 1000000), COALESCE(:price_quantity_value, 1000000),
   COALESCE(:pricing_unit_code, COALESCE(:unit_code, 'ud')), COALESCE(:pricing_unit_name, ''),
   COALESCE(:pricing_factor_num, 1), COALESCE(:pricing_factor_den, 1));
