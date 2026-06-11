-- Carrito activo del empleado actual (0 o 1 filas). cart_data es el JSON que guardó cart_save;
-- si no hay fila, la pantalla de venta arranca con el carrito vacío.
SELECT id, cart_data, updated_at
FROM sales_active_cart
WHERE hub_id = :hub_id AND employee_id = :current_user_id AND is_deleted = 0
LIMIT 1;
