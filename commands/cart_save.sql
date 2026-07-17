-- Upsert de la comanda de una MESA (:table_id) o del carrito suelto del empleado. La clave
-- (cart_key) la deriva el SQL: table_id no vacío → esa mesa; vacío → 'u:'||current_user_id.
-- Índice único uq_active_cart_key (hub_id, cart_key). employee_id queda como auditoría (quién
-- tocó la comanda por última vez; una comanda de mesa la comparten los camareros). El empleado
-- es SIEMPRE el usuario actual (:current_user_id inyectado por el runtime, no falsificable).
-- Binds: :cart_data (JSON del carrito), :table_id (+ :new_id/:hub_id/:current_user_id/:now inyectados).
INSERT INTO sales_active_cart
  (id, hub_id, employee_id, cart_key, cart_data,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :current_user_id,
   COALESCE(NULLIF(:table_id, ''), 'u:' || :current_user_id), :cart_data,
   0, :current_user_id, :current_user_id, :now, :now)
ON CONFLICT (hub_id, cart_key) DO UPDATE SET
  cart_data  = :cart_data,
  is_deleted = 0,
  deleted_at = NULL,
  updated_by = :current_user_id,
  updated_at = :now;
