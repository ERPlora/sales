-- Fase 6 (base declarativa): enlace inverso venta→pedido. Columna aditiva y NULLable → no rompe
-- el handler WASM actual (que aún no la rellena). Cuando se recompile sales/handler para insertar
-- order_id y emitirlo en `sale.completed`, el módulo `orders` enlazará el pedido automáticamente
-- (su listener ya escucha `sale.completed` y hace UPDATE ... WHERE id=:order_id, no-op si es NULL).
ALTER TABLE sales_sale ADD COLUMN order_id TEXT;
