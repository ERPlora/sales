-- Upsert del carrito activo del empleado (una fila por (hub_id, employee_id), índice uq_active_cart).
-- El empleado es SIEMPRE el usuario actual (:current_user_id inyectado por el runtime, no falsificable).
-- Binds: :cart_data (JSON serializado del carrito) (+ :new_id/:hub_id/:current_user_id/:now inyectados).
INSERT INTO sales_active_cart
  (id, hub_id, employee_id, cart_data,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :current_user_id, :cart_data,
   0, :current_user_id, :current_user_id, :now, :now)
ON CONFLICT (hub_id, employee_id) DO UPDATE SET
  cart_data  = :cart_data,
  is_deleted = 0,
  deleted_at = NULL,
  updated_by = :current_user_id,
  updated_at = :now;
