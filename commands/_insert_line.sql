-- Inserta una línea de venta (importes precalculados por el handler, half-even).
-- Runtime inyecta :hub_id, :now. :line_id y :sale_id los aporta el handler.
-- ADR-0085: la línea congela el snapshot fiscal (tax_category_key / tax_country_code /
-- tax_region_code / tax_rule_id); `tax_rate` es el % combinado (tax_rate_pct).
INSERT INTO sales_sale_item (
    id, hub_id, sale_id, product_id, product_name, product_sku, is_service,
    quantity, unit_price, discount_percent, tax_rate, tax_class_name,
    tax_category_key, tax_country_code, tax_region_code, tax_rule_id,
    net_amount, tax_amount, line_total, created_at
) VALUES (
    :line_id, :hub_id, :sale_id, :product_id, :product_name, :product_sku, :is_service,
    :quantity, :unit_price, :discount_percent, :tax_rate, :tax_class_name,
    :tax_category_key, :tax_country_code, :tax_region_code, :tax_rule_id,
    :net_amount, :tax_amount, :line_total, :now
);
