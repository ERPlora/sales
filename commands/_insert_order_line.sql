-- ADR-0141: inserta una línea del pedido (materialización temprana). Intención del handler WASM
-- `open_order`. `line_total` es PROVISIONAL (display); la cuota fiscal se congela al cobrar.
-- `tax_category_key`/`cost` viajan porque el COBRO los necesita y no se re-derivan tras recargar
-- (la categoría es la autoridad del IVA en servidor, ADR-0085; el coste alimenta el arqueo de
-- invitaciones).
-- ADR-0147: `quantity` en punto fijo 10⁶ + contexto de unidades CONGELADO (§2.4).
-- sales#12: `category_id` (opaco, NULL = sin clasificar) es el snapshot que enruta la comanda.
INSERT INTO sales_order_item (
    id, hub_id, order_id, product_id, product_name, product_sku,
    quantity, unit_price, is_gift, gift_reason, line_total, tax_category_key, cost, is_service,
    category_id, discount_percent, modifiers,
    is_deleted, created_by, updated_by, created_at, updated_at,
    unit_code, unit_name, factor_num, factor_den, increment_value,
    price_quantity_value, pricing_unit_code, pricing_unit_name,
    pricing_factor_num, pricing_factor_den
) VALUES (
    :id, :hub_id, :order_id, :product_id, :product_name, :product_sku,
    :quantity, :unit_price, :is_gift, COALESCE(:gift_reason, ''), :line_total,
    COALESCE(:tax_category_key, ''), COALESCE(:cost, 0), COALESCE(:is_service, 0),
    :category_id, COALESCE(:discount_percent, 0), COALESCE(:modifiers, '[]'),
    0, :current_user_id, :current_user_id, :now, :now,
    :unit_code, :unit_name, :factor_num, :factor_den, :increment_value,
    :price_quantity_value, :pricing_unit_code, :pricing_unit_name,
    :pricing_factor_num, :pricing_factor_den
);
