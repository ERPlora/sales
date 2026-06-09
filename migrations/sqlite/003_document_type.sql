-- Fase 3 POS: tipo de documento elegido para la venta ('ticket' = factura simplificada F2,
-- 'invoice' = factura completa F1). Aditivo y con default → no rompe el handler WASM actual;
-- el POS lo fija con `sales.set_document_type` tras cobrar (override). Lo lee `sales.get` y
-- viaja en `sale.completed` para que `invoice` elija F1/F2. (La versión atómica —fijarlo dentro
-- del handler WASM— es una mejora futura cuando se recompile el handler.)
ALTER TABLE sales_sale ADD COLUMN document_type TEXT NOT NULL DEFAULT 'ticket';
