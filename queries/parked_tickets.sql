-- Tickets aparcados vigentes del hub (no expirados), más recientes primero. cart_data es el
-- JSON del carrito que guardó sales.park_ticket. expires_at se guarda normalizado (erp_dateadd);
-- erp_dt(:now) normaliza el RFC3339 inyectado a datetime comparable (portable SQLite/Postgres,
-- ADR-0007 §4a) para que la comparación sea correcta. Los expirados dejan de listarse.
SELECT id, ticket_number, cart_data, employee_id, notes, expires_at, created_at
FROM sales_parked_ticket
WHERE hub_id = :hub_id AND is_deleted = 0
  AND (expires_at IS NULL OR erp_dt(expires_at) > erp_dt(:now))
ORDER BY created_at DESC;
