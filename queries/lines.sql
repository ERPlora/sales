SELECT id, product_id, product_name, product_sku, is_service,
       quantity, unit_price, discount_percent, tax_rate, tax_class_name,
       tax_category_key, tax_country_code, tax_region_code, tax_rule_id, is_gift, gift_reason,
       net_amount, tax_amount, line_total
FROM sales_sale_item
WHERE sale_id = :sale_id AND hub_id = :hub_id
ORDER BY created_at ASC;
