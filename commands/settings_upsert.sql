-- PG-compat (auditoría pm#16, 07-17): los binds BOOLEANOS del schema van envueltos en
-- CASE WHEN :x THEN 1 WHEN NOT :x THEN 0 END — las columnas son INTEGER 0/1 por contrato
-- (§2.5) y Postgres NO castea boolean→bigint (SQLite sí lo toleraba). El tri-estado
-- preserva NULL para los COALESCE de opcionales.
-- Upsert de la configuración singleton del módulo sales (una fila por hub_id).
-- La UI/SDK envía SIEMPRE el conjunto completo de campos (los no tocados se reenvían con su
-- valor actual). Binds: :new_id + todos los campos + :current_user_id, :now (+ :hub_id inyectado).
INSERT INTO sales_settings
  (id, hub_id,
   allow_cash, allow_card, allow_transfer,
   sync_products, sync_services,
   require_customer, allow_discounts,
   enable_parked_tickets, default_tax_included, ticket_expiry_hours,
   receipt_header, receipt_footer, receipt_footer_image,
   receipt_marketing_url, receipt_marketing_text,
   pos_layout, default_document_format, auto_invoice_with_tax_id,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id,
   CASE WHEN :allow_cash THEN 1 WHEN NOT :allow_cash THEN 0 END, CASE WHEN :allow_card THEN 1 WHEN NOT :allow_card THEN 0 END, CASE WHEN :allow_transfer THEN 1 WHEN NOT :allow_transfer THEN 0 END,
   CASE WHEN :sync_products THEN 1 WHEN NOT :sync_products THEN 0 END, CASE WHEN :sync_services THEN 1 WHEN NOT :sync_services THEN 0 END,
   CASE WHEN :require_customer THEN 1 WHEN NOT :require_customer THEN 0 END, CASE WHEN :allow_discounts THEN 1 WHEN NOT :allow_discounts THEN 0 END,
   CASE WHEN :enable_parked_tickets THEN 1 WHEN NOT :enable_parked_tickets THEN 0 END, CASE WHEN :default_tax_included THEN 1 WHEN NOT :default_tax_included THEN 0 END, :ticket_expiry_hours,
   :receipt_header, :receipt_footer, :receipt_footer_image,
   :receipt_marketing_url, :receipt_marketing_text,
   :pos_layout, :default_document_format, CASE WHEN :auto_invoice_with_tax_id THEN 1 WHEN NOT :auto_invoice_with_tax_id THEN 0 END,
   0, :current_user_id, :current_user_id, :now, :now)
ON CONFLICT (hub_id) DO UPDATE SET
  allow_cash               = CASE WHEN :allow_cash THEN 1 WHEN NOT :allow_cash THEN 0 END,
  allow_card               = CASE WHEN :allow_card THEN 1 WHEN NOT :allow_card THEN 0 END,
  allow_transfer           = CASE WHEN :allow_transfer THEN 1 WHEN NOT :allow_transfer THEN 0 END,
  sync_products            = CASE WHEN :sync_products THEN 1 WHEN NOT :sync_products THEN 0 END,
  sync_services            = CASE WHEN :sync_services THEN 1 WHEN NOT :sync_services THEN 0 END,
  require_customer         = CASE WHEN :require_customer THEN 1 WHEN NOT :require_customer THEN 0 END,
  allow_discounts          = CASE WHEN :allow_discounts THEN 1 WHEN NOT :allow_discounts THEN 0 END,
  enable_parked_tickets    = CASE WHEN :enable_parked_tickets THEN 1 WHEN NOT :enable_parked_tickets THEN 0 END,
  default_tax_included     = CASE WHEN :default_tax_included THEN 1 WHEN NOT :default_tax_included THEN 0 END,
  ticket_expiry_hours      = :ticket_expiry_hours,
  receipt_header           = :receipt_header,
  receipt_footer           = :receipt_footer,
  receipt_footer_image     = :receipt_footer_image,
  receipt_marketing_url    = :receipt_marketing_url,
  receipt_marketing_text   = :receipt_marketing_text,
  pos_layout               = :pos_layout,
  default_document_format  = :default_document_format,
  auto_invoice_with_tax_id = CASE WHEN :auto_invoice_with_tax_id THEN 1 WHEN NOT :auto_invoice_with_tax_id THEN 0 END,
  updated_by               = :current_user_id,
  updated_at               = :now;
