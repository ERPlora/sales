-- ADR-0141 Gate 3: quita una línea de un pedido abierto (soft-delete, contrato de fila §2.5).
-- Recompone el total en la 2ª sentencia (order_recompute_total.sql).
UPDATE sales_order_item
SET is_deleted = 1, deleted_at = :now, updated_by = :current_user_id, updated_at = :now
-- `fired_at IS NULL`: lo ya enviado a cocina no se borra desde el TPV (tandas, 2026-07-19);
-- corregirlo = invitación o anular el pedido. ⚠️ A CONFIRMAR EN REVIEW (recomendación aplicada).
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NULL;
