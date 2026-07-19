-- ADR-0146 etapa 5 — «cada uno paga lo suyo». Una línea del pedido queda atada a la venta que la
-- cobró; las que aún no tienen venta son lo que queda por pagar.
--
-- Sin esto, al reanudar un pedido cobrado a medias volverían a salir las líneas ya pagadas y se
-- cobrarían dos veces. Aditiva: NULL = pendiente, que es el estado de todo lo que ya existe.
ALTER TABLE sales_order_item ADD COLUMN sale_id TEXT;
CREATE INDEX IF NOT EXISTS ix_order_item_sale ON sales_order_item (hub_id, sale_id);
