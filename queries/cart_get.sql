-- Comanda activa de una MESA (:table_id) o, si viene vacío, el carrito suelto del empleado actual
-- (0 o 1 filas). La clave la deriva el SQL: table_id no vacío → esa mesa; vacío → 'u:'||current_user_id
-- (el empleado lo inyecta el runtime, no falsificable). cart_data es el JSON que guardó cart_save;
-- si no hay fila, la pantalla de venta arranca con el carrito vacío.
SELECT id, cart_data, updated_at
FROM sales_active_cart
WHERE hub_id = :hub_id
  AND cart_key = COALESCE(NULLIF(:table_id, ''), 'u:' || :current_user_id)
  AND is_deleted = 0
LIMIT 1;
