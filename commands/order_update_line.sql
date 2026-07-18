-- ADR-0141 Gate 3/6: cambia cantidad (y su line_total provisional) de una línea de un pedido
-- abierto; también permite alternar INVITACIÓN (is_gift/gift_reason), que cambia el importe.
-- COALESCE deja intacto lo que no se envía. Solo líneas vivas del pedido/hub (aislamiento).
-- El total del pedido se recompone en la 2ª sentencia (order_recompute_total.sql).
UPDATE sales_order_item
SET quantity    = :quantity,
    line_total  = :line_total,
    is_gift     = COALESCE(:is_gift, is_gift),
    gift_reason = COALESCE(:gift_reason, gift_reason),
    updated_by  = :current_user_id,
    updated_at  = :now
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0;
