-- ADR-0141: un pedido por id (cabecera). hub_id lo auto-inyecta el runtime.
SELECT id, status, provisional_total, customer_id, notes, source_module, created_at
FROM sales_order
WHERE id = :order_id AND hub_id = :hub_id AND is_deleted = 0;
