-- Añade una línea a un pedido abierto, resolviendo el pedido contra el hub inyectado (pm#146).
--
-- `:order_id` venía del payload tal cual, y este command es de cara al cliente
-- (`permission: sales.add_sale`): el id llega de quien pulsa en el TPV, no de un handler que ya
-- validó. Una línea podía colgar del pedido de otro negocio — y la segunda sentencia del command
-- (`order_recompute_total.sql`) recalcula el total de ESE pedido, así que el importe del vecino
-- cambiaba también.
--
-- Si el pedido no es de este hub, está borrado o ya no está abierto, no se selecciona nada y
-- `expect_rows` lo convierte en un error de negocio. Sin esa guarda el command devolvería OK
-- habiendo escrito cero líneas, y en un TPV eso es peor que un error: el camarero ve que «se
-- añadió» y cobra sin ella.
--
-- ⚠️ `product_id` NO se comprueba aquí a propósito: apunta a `inventory`, otro módulo. Un `EXISTS`
-- contra `inventory_product` rompería el aislamiento de ADR-0263 y ataría `sales` a que
-- `inventory` esté instalado. Esa mitad no se arregla en SQL.
INSERT INTO sales_order_item
  (id, hub_id, order_id, product_id, product_name, product_sku, quantity, unit_price,
   is_gift, gift_reason, line_total, tax_category_key, cost, is_service, category_id, discount_percent,
   modifiers,
   is_deleted, created_by, updated_by, created_at, updated_at,
   unit_code, unit_name, factor_num, factor_den, increment_value,
   price_quantity_value, pricing_unit_code, pricing_unit_name,
   pricing_factor_num, pricing_factor_den)
SELECT
  :new_id, :hub_id, o.id, :product_id, :product_name, COALESCE(:product_sku, ''),
  :quantity, :unit_price, COALESCE(:is_gift, 0), COALESCE(:gift_reason, ''), :line_total,
  COALESCE(:tax_category_key, ''), COALESCE(:cost, 0), COALESCE(:is_service, 0), :category_id, COALESCE(:discount_percent, 0),
  -- pm#93: los option_id elegidos, en su orden. Nombre y precio los resuelve el cobro.
  COALESCE(:modifiers, '[]'),
  0, :current_user_id, :current_user_id, :now, :now,
  COALESCE(:unit_code, 'ud'), COALESCE(:unit_name, ''),
  COALESCE(:factor_num, 1), COALESCE(:factor_den, 1),
  COALESCE(:increment_value, 1000000), COALESCE(:price_quantity_value, 1000000),
  COALESCE(:pricing_unit_code, COALESCE(:unit_code, 'ud')), COALESCE(:pricing_unit_name, ''),
  COALESCE(:pricing_factor_num, 1), COALESCE(:pricing_factor_den, 1)
FROM sales_order o
WHERE o.id = :order_id AND o.hub_id = :hub_id AND o.is_deleted = 0;
