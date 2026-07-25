-- ADR-0141 Gate 3/6: cambia cantidad (y su line_total provisional) de una línea de un pedido
-- abierto; también permite alternar INVITACIÓN (is_gift/gift_reason), que cambia el importe.
-- `quantity` en punto fijo 10⁶ (ADR-0147). El contexto de unidades congelado NO se toca aquí:
-- se fijó al añadir la línea y cambiar la cantidad no cambia lo que significa.
-- COALESCE deja intacto lo que no se envía. Solo líneas vivas del pedido/hub (aislamiento).
-- El total del pedido se recompone en la 2ª sentencia (order_recompute_total.sql).
UPDATE sales_order_item
SET quantity    = :quantity,
    line_total  = :line_total,
    is_gift     = COALESCE(:is_gift, is_gift),
    gift_reason = COALESCE(:gift_reason, gift_reason),
    updated_by  = :current_user_id,
    updated_at  = :now
-- `fired_at IS NULL`: una línea YA ENVIADA a cocina no se edita desde el TPV (tandas,
-- 2026-07-19) — la comida está en fuego; corregirla = ronda nueva o invitación. ⚠️ A CONFIRMAR
-- EN REVIEW (recomendación aplicada).
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NULL;
