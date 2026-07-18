-- ADR-0141: líneas de un pedido (materializadas). hub_id lo auto-inyecta el runtime.
SELECT id, order_id, product_id, product_name, product_sku, quantity, unit_price, is_gift, line_total
FROM sales_order_item
WHERE order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
ORDER BY created_at ASC;
