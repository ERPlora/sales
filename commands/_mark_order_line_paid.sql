-- ADR-0146: ata una línea del pedido a la venta que acaba de cobrarla (split-bill).
-- `sale_id IS NULL` en el WHERE lo hace idempotente y evita que un reintento reasigne una línea ya
-- pagada a otra venta: quién pagó qué no puede reescribirse.
UPDATE sales_order_item SET
    sale_id    = :sale_id,
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :line_id AND hub_id = :hub_id AND is_deleted = 0 AND sale_id IS NULL;
