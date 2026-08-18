-- sales#12: la CATEGORÍA del producto es snapshot de la línea (pedido y venta).
--
-- Kitchen enruta cada comanda a su estación por la categoría del producto
-- (`kitchen_category_station`, «si el caller aporta :category_id»). El caller es `sales.order.fire`,
-- que hasta ahora no la mandaba: la regla categoría→estación no se aplicaba nunca. Y aunque el
-- TPV la mande desde su mapa en memoria, una cuenta RETOMADA reconstruye el carrito desde
-- `sales_order_item` y la perdía.
--
-- Regla del doc de arquitectura (`architecture/modules/sales.md`): dependencia FUNCIONAL
-- (inventory/taxes) = snapshot en la línea. Mismo molde que el snapshot fiscal (006): una comanda
-- ya enviada no puede cambiar de estación porque mañana alguien recategorice el producto.
--
-- Aditiva y NULL por defecto: NULL = «sin clasificar» (precio libre, servicio sin categoría). Nada
-- de FK: la categoría es de `inventory`/`services`, otro módulo (ADR-0263), y para `sales` es un
-- id opaco.
ALTER TABLE sales_order_item ADD COLUMN category_id TEXT;
ALTER TABLE sales_sale_item ADD COLUMN category_id TEXT;
