-- Configuración singleton del módulo sales para el hub. Si no hay fila, la UI/SDK aplica
-- los defaults (allow_cash=1, pos_layout='touch', default_document_format='ticket', etc.).
SELECT id,
       allow_cash, allow_card, allow_transfer,
       sync_products, sync_services,
       require_customer, allow_discounts,
       enable_parked_tickets, default_tax_included, ticket_expiry_hours,
       receipt_header, receipt_footer, receipt_footer_image,
       receipt_marketing_url, receipt_marketing_text,
       pos_layout, default_document_format, auto_invoice_with_tax_id
FROM sales_settings
WHERE hub_id = :hub_id AND is_deleted = 0
LIMIT 1;
