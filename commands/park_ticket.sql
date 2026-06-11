-- Aparca el carrito en curso como ticket recuperable (sales_parked_ticket).
-- Binds del caller: :ticket_number, :cart_data (JSON), :notes (opcional → '').
-- expires_at lo calcula la BD: :now + ticket_expiry_hours de sales_settings
-- (24 h por defecto si aún no existe la fila de ajustes del hub).
INSERT INTO sales_parked_ticket
  (id, hub_id, ticket_number, cart_data, employee_id, notes, expires_at,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :ticket_number, :cart_data, :current_user_id, COALESCE(:notes, ''),
   datetime(:now, '+' || COALESCE(
     (SELECT ticket_expiry_hours FROM sales_settings WHERE hub_id = :hub_id AND is_deleted = 0),
     24) || ' hours'),
   0, :current_user_id, :current_user_id, :now, :now);
