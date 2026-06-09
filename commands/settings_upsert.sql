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
   pos_layout, default_document_format, auto_invoice_with_tax_id,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id,
   :allow_cash, :allow_card, :allow_transfer,
   :sync_products, :sync_services,
   :require_customer, :allow_discounts,
   :enable_parked_tickets, :default_tax_included, :ticket_expiry_hours,
   :receipt_header, :receipt_footer, :receipt_footer_image,
   :pos_layout, :default_document_format, :auto_invoice_with_tax_id,
   0, :current_user_id, :current_user_id, :now, :now)
ON CONFLICT (hub_id) DO UPDATE SET
  allow_cash               = :allow_cash,
  allow_card               = :allow_card,
  allow_transfer           = :allow_transfer,
  sync_products            = :sync_products,
  sync_services            = :sync_services,
  require_customer         = :require_customer,
  allow_discounts          = :allow_discounts,
  enable_parked_tickets    = :enable_parked_tickets,
  default_tax_included     = :default_tax_included,
  ticket_expiry_hours      = :ticket_expiry_hours,
  receipt_header           = :receipt_header,
  receipt_footer           = :receipt_footer,
  receipt_footer_image     = :receipt_footer_image,
  pos_layout               = :pos_layout,
  default_document_format  = :default_document_format,
  auto_invoice_with_tax_id = :auto_invoice_with_tax_id,
  updated_by               = :current_user_id,
  updated_at               = :now;
