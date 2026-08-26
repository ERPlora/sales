-- `quantity` en punto fijo, escala 10⁶ (ADR-0147): 0,5 kg = 500000. La UI formatea con
-- format_quantity; aquí viaja la representación cruda. El contexto de unidades congelado
-- (§2.4) sale con la línea para reimprimir/recalcular sin releer el maestro.
SELECT id, product_id, product_name, product_sku, is_service,
       quantity, unit_price, discount_percent, tax_rate, tax_class_name,
       tax_category_key, tax_country_code, tax_region_code, tax_rule_id, is_gift, gift_reason,
       -- sales#162: la marca de linea pagada por un TENDER EXTERNO viaja al documento. Sin ella el
       -- tique ensena un 0,00 sin explicacion, que se lee como un error de precio.
       is_covered,
       category_id,
       net_amount, tax_amount, line_total,
       unit_code, unit_name, factor_num, factor_den, increment_value,
       price_quantity_value, pricing_unit_code, pricing_unit_name,
       pricing_factor_num, pricing_factor_den,
       -- pm#93 / sales#148: el snapshot de los suplementos que congelo el cobro. La columna
       -- existia y el handler la escribia, pero esta puerta no la devolvia: el tique y su
       -- reimpresion leen la venta por AQUI, asi que lo cobrado estaba escrito y era ilegible,
       -- y el cliente pagaba un «+ queso» que su papel no nombraba.
       modifiers,
       -- sales#156: the line's free-text note, frozen at checkout. The ticket and its REPRINT
       -- read the sale through HERE, so without it the customer's paper would say less than the
       -- kitchen ticket did — the exact failure sales#148 fixed for the supplements.
       notes,
       -- sales#152 / ADR-0381: las lineas de un combo son HERMANAS y no hay fila padre, asi que
       -- la cabecera del menu en el tique se pinta agrupando por `combo_group_ref` y leyendo el
       -- snapshot congelado en `combo`. Sin devolverlas por AQUI, lo cobrado quedaria escrito y
       -- seria ilegible -- que es exactamente lo que le paso a `modifiers` hasta sales#148.
       combo_group_ref, combo,
       -- sales#147: la fila de la que ESTA cuelga -- la hija de un suplemento con tipo fiscal
       -- propio. El papel la imprime BAJO su padre leyendo esto, y no el orden de las filas: todas
       -- las lineas de una venta comparten `created_at`, asi que ordenar por el es un empate.
       parent_line_ref
FROM sales_sale_item
WHERE sale_id = :sale_id AND hub_id = :hub_id
ORDER BY created_at ASC;
