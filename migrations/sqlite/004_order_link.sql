-- Fase 6: enlace inverso venta→pedido. Columna aditiva y NULLable. El handler WASM
-- `complete_sale` lee `payload.order_id`, lo inserta vía `_insert_sale` y lo emite (junto a
-- `order_number`) en `sale.completed`; el módulo `orders` enlaza el pedido automáticamente
-- (su listener escucha `sale.completed` y hace UPDATE ... WHERE id=:order_id, no-op si es NULL).
ALTER TABLE sales_sale ADD COLUMN order_id TEXT;
