-- sales#71: DESCUENTO MANUAL en el TPV — por LÍNEA y por TICKET, en % (Odoo, Square, Toast,
-- Lightspeed, Shopify, Clover, Zettle, WooCommerce POS y Business Central lo ofrecen todos; la
-- tabla de referencias vive en la issue).
--
-- El cobro ya lo soportaba (`sales_sale_item.discount_percent` desde 001; `discount_percent` de
-- la venta prorrateado antes de extraer el IVA), pero el PEDIDO no lo recordaba: el carrito se
-- materializa como filas y se reconstruye al RETOMAR la cuenta (ADR-0141), así que un descuento
-- puesto en la mesa 4 se perdía al cambiar de cuenta. Mismo molde que `is_service` (018).
--
-- Aditivas, DEFAULT 0: los pedidos ya escritos siguen sin descuento, que es lo que eran.
ALTER TABLE sales_order_item ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE sales_order ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
