-- ADR-0141: líneas de un pedido (materializadas). Devuelve también la categoría fiscal y el coste
-- porque el COBRO los necesita al reanudar un pedido (autoridad del IVA en servidor, ADR-0085).
-- hub_id lo auto-inyecta el runtime.
SELECT id, order_id, product_id, product_name, product_sku, quantity, unit_price,
       is_gift, gift_reason, line_total, tax_category_key, cost
FROM sales_order_item
-- `sale_id IS NULL` = lo que queda POR PAGAR (ADR-0146): en un pedido cobrado a medias,
-- las líneas ya pagadas no vuelven a la pantalla ni se cobran dos veces.
WHERE order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0 AND sale_id IS NULL
ORDER BY created_at ASC;
