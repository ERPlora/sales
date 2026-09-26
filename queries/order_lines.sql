-- ADR-0141: líneas de un pedido (materializadas). Devuelve también la categoría fiscal y el coste
-- porque el COBRO los necesita al reanudar un pedido (autoridad del IVA en servidor, ADR-0085).
-- hub_id lo auto-inyecta el runtime.
-- `quantity` en punto fijo, escala 10⁶ (ADR-0147); el contexto de unidades congelado viaja con la
-- línea para que un pedido REANUDADO siga significando 0,5 kg aunque el maestro haya cambiado.
-- `is_service` (sales#89) vuelve con la línea: un pedido REANUDADO tiene que seguir sabiendo que
-- cobra un corte de pelo y no un producto, o el cobro lo mediría contra el catálogo de inventory.
-- `category_id` (sales#12): snapshot de la categoría del producto — es lo que enruta la comanda en
-- kitchen y tiene que sobrevivir a retomar la cuenta.
SELECT id, order_id, product_id, product_name, product_sku, quantity, unit_price,
       is_gift, gift_reason, line_total, tax_category_key, cost, is_service,
       unit_code, unit_name, factor_num, factor_den, increment_value,
       price_quantity_value, pricing_unit_code, pricing_unit_name,
       pricing_factor_num, pricing_factor_den,
       round_no, fired_at, category_id, discount_percent,
       -- sales#385: the LINE discount approval travels with the line, like the ticket's
       -- (`sales_order.discount_approved_by`) — the checkout reads it here, never from the payload.
       discount_approved_by,
       -- pm#93: los suplementos tienen que sobrevivir a retomar la cuenta, como el IVA o el
       -- contexto de unidades. Sin esto el camarero elige «sin cebolla» y al volver ya no está.
       modifiers,
       -- sales#156: the waiter's free-text note («medium rare», «shellfish allergy») has to come
       -- back with the line for the same reason as the supplements. It is what the KITCHEN reads,
       -- so the fire command builds its ticket from HERE (`kitchen_items_from_lines`), not from
       -- the browser's payload: a resumed check that lost the note would send the plate out wrong
       -- and nothing would say so.
       notes,
       -- sales#169: la COMPOSICIÓN del menú tiene que volver con la línea o la cuenta retomada no
       -- se puede ni cobrar (el cobro busca el id del combo en el catálogo de productos y rechaza
       -- la venta entera). Es el error que costó sales#148 con los suplementos: escritos, cobrados
       -- e ilegibles.
       combo_group_ref, combo,
       -- sales#273: QUIÉN hace la línea vuelve con ella. Es el criterio de aceptación de la
       -- atribución por línea: el TPV reconstruye el carrito desde aquí (ADR-0141) cada vez que
       -- se recarga, se retoma una cuenta o se dispara a cocina, así que una columna escrita y no
       -- proyectada es el fallo que sales#148 ya pagó con los suplementos — guardado, cobrado e
       -- ilegible: el corte de Ana volvería sin dueño y el cierre lo cargaría a la cabecera.
       staff_id
FROM sales_order_item
-- `sale_id IS NULL` = lo que queda POR PAGAR (ADR-0146): en un pedido cobrado a medias,
-- las líneas ya pagadas no vuelven a la pantalla ni se cobran dos veces.
WHERE order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0 AND sale_id IS NULL
ORDER BY created_at ASC;
