-- Limpia (soft-delete §2.5) la comanda de una MESA (:table_id) o el carrito suelto del empleado
-- actual; cart_save la resucita con is_deleted=0 en el siguiente upsert. La clave la deriva el SQL:
-- table_id no vacío → esa mesa; vacío → 'u:'||current_user_id. Bind del caller: :table_id.
UPDATE sales_active_cart
SET is_deleted = 1,
    deleted_at = :now,
    updated_by = :current_user_id,
    updated_at = :now
WHERE hub_id = :hub_id
  AND cart_key = COALESCE(NULLIF(:table_id, ''), 'u:' || :current_user_id)
  AND is_deleted = 0;
