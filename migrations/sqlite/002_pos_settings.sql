-- Fase 1 POS: ajustes de pantalla de venta y formato de documento por defecto.
-- Se añaden a la config singleton `sales_settings` (creada en 001_init).
--   pos_layout               → pantalla de venta por defecto del negocio ('touch' | 'desktop').
--   default_document_format  → documento por defecto de la venta ('ticket' | 'invoice').
--   auto_invoice_with_tax_id → si el cliente tiene NIF/CIF, emitir factura A4 (F1) en vez de tiquet.
ALTER TABLE sales_settings ADD COLUMN pos_layout TEXT NOT NULL DEFAULT 'touch';
ALTER TABLE sales_settings ADD COLUMN default_document_format TEXT NOT NULL DEFAULT 'ticket';
ALTER TABLE sales_settings ADD COLUMN auto_invoice_with_tax_id INTEGER NOT NULL DEFAULT 1;
