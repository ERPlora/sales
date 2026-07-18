-- ADR-0141: lista de pedidos. Sirve tanto «pedidos abiertos» (status='open', el ticket en curso)
-- como la lectura cruzada «pedidos por cliente/mesa» (ADR-0127): los satélites (tables/customers)
-- guardan solo el FK y llaman aquí filtrando por ids. hub_id lo auto-inyecta el runtime.
SELECT id, status, provisional_total, customer_id, notes, source_module, created_at
FROM sales_order
WHERE hub_id = :hub_id AND is_deleted = 0
ORDER BY created_at DESC;
