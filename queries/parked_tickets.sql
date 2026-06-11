-- Tickets aparcados vigentes del hub (no expirados), más recientes primero. cart_data es el
-- JSON del carrito que guardó sales.park_ticket. expires_at se guarda en formato datetime()
-- de SQLite (UTC); datetime(:now) normaliza el RFC3339 inyectado al mismo formato para que
-- la comparación sea correcta. Los expirados simplemente dejan de listarse.
SELECT id, ticket_number, cart_data, employee_id, notes, expires_at, created_at
FROM sales_parked_ticket
WHERE hub_id = :hub_id AND is_deleted = 0
  AND (expires_at IS NULL OR expires_at > datetime(:now))
ORDER BY created_at DESC;
