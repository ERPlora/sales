-- Limpia el carrito activo del empleado actual (soft-delete §2.5; cart_save lo resucita con
-- is_deleted=0 en el siguiente upsert). Sin binds del caller (todo inyectado).
UPDATE sales_active_cart
SET is_deleted = 1,
    deleted_at = :now,
    updated_by = :current_user_id,
    updated_at = :now
WHERE hub_id = :hub_id AND employee_id = :current_user_id AND is_deleted = 0;
