-- ADR-0141: lista de pedidos. Sirve tanto «pedidos abiertos» (status='open', el ticket en curso)
-- como la lectura cruzada «pedidos por cliente/mesa» (ADR-0127): los satélites (tables/customers)
-- guardan solo el FK y llaman aquí filtrando por ids. hub_id lo auto-inyecta el runtime.
SELECT id, status, provisional_total, notes, label, source_module, created_at, discount_percent, discount_amount,
       discount_approved_by, -- sales#386: who approved the discount the check stores
       -- sales#280: la cita de la que nació la cuenta, para que el enlace vuelva CON ella.
       appointment_id
FROM sales_order
WHERE hub_id = :hub_id AND is_deleted = 0
ORDER BY created_at DESC;
