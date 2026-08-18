-- Inserta una línea de venta (importes precalculados por el handler, half-even).
-- Runtime inyecta :hub_id, :now. :line_id y :sale_id los aporta el handler.
-- ADR-0085: la línea congela el snapshot fiscal (tax_category_key / tax_country_code /
-- tax_region_code / tax_rule_id); `tax_rate` es el % combinado (tax_rate_pct).
-- sales#12: `category_id` = categoría del producto congelada (routing de cocina), NULL sin clasificar.
-- ADR-0147: `quantity` en punto fijo 10⁶ + contexto de unidades CONGELADO (§2.4): el histórico
-- no relee el maestro. El handler WASM aporta siempre los diez campos del contexto.
INSERT INTO sales_sale_item (
    id, hub_id, sale_id, product_id, product_name, product_sku, is_service,
    quantity, unit_price, discount_percent, tax_rate, tax_class_name,
    tax_category_key, tax_country_code, tax_region_code, tax_rule_id, is_gift, gift_reason,
    category_id,
    net_amount, tax_amount, line_total, created_at,
    unit_code, unit_name, factor_num, factor_den, increment_value,
    price_quantity_value, pricing_unit_code, pricing_unit_name,
    pricing_factor_num, pricing_factor_den
) VALUES (
    :line_id, :hub_id, :sale_id, :product_id, :product_name, :product_sku, :is_service,
    :quantity, :unit_price, :discount_percent, :tax_rate, :tax_class_name,
    :tax_category_key, :tax_country_code, :tax_region_code, :tax_rule_id, :is_gift, :gift_reason,
    :category_id,
    :net_amount, :tax_amount, :line_total, :now,
    :unit_code, :unit_name, :factor_num, :factor_den, :increment_value,
    :price_quantity_value, :pricing_unit_code, :pricing_unit_name,
    :pricing_factor_num, :pricing_factor_den
);
