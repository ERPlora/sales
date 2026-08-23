-- `quantity` en punto fijo, escala 10⁶ (ADR-0147): 0,5 kg = 500000. La UI formatea con
-- format_quantity; aquí viaja la representación cruda. El contexto de unidades congelado
-- (§2.4) sale con la línea para reimprimir/recalcular sin releer el maestro.
SELECT id, product_id, product_name, product_sku, is_service,
       quantity, unit_price, discount_percent, tax_rate, tax_class_name,
       tax_category_key, tax_country_code, tax_region_code, tax_rule_id, is_gift, gift_reason,
       category_id,
       net_amount, tax_amount, line_total,
       unit_code, unit_name, factor_num, factor_den, increment_value,
       price_quantity_value, pricing_unit_code, pricing_unit_name,
       pricing_factor_num, pricing_factor_den,
       -- pm#93 / sales#148: el snapshot de los suplementos que congelo el cobro. La columna
       -- existia y el handler la escribia, pero esta puerta no la devolvia: el tique y su
       -- reimpresion leen la venta por AQUI, asi que lo cobrado estaba escrito y era ilegible,
       -- y el cliente pagaba un «+ queso» que su papel no nombraba.
       modifiers
FROM sales_sale_item
WHERE sale_id = :sale_id AND hub_id = :hub_id
ORDER BY created_at ASC;
