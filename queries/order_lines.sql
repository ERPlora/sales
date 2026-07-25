-- ADR-0141: líneas de un pedido (materializadas). Devuelve también la categoría fiscal y el coste
-- porque el COBRO los necesita al reanudar un pedido (autoridad del IVA en servidor, ADR-0085).
-- hub_id lo auto-inyecta el runtime.
-- `quantity` en punto fijo, escala 10⁶ (ADR-0147); el contexto de unidades congelado viaja con la
-- línea para que un pedido REANUDADO siga significando 0,5 kg aunque el maestro haya cambiado.
SELECT id, order_id, product_id, product_name, product_sku, quantity, unit_price,
       is_gift, gift_reason, line_total, tax_category_key, cost,
       unit_code, unit_name, factor_num, factor_den, increment_value,
       price_quantity_value, pricing_unit_code, pricing_unit_name,
       pricing_factor_num, pricing_factor_den,
       round_no, fired_at
FROM sales_order_item
-- `sale_id IS NULL` = lo que queda POR PAGAR (ADR-0146): en un pedido cobrado a medias,
-- las líneas ya pagadas no vuelven a la pantalla ni se cobran dos veces.
WHERE order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0 AND sale_id IS NULL
ORDER BY created_at ASC;
