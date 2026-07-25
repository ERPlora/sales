-- Marca como ENVIADAS a cocina las líneas aún pendientes del pedido (tandas, 2026-07-19).
-- Interno: lo emite el handler WASM de `sales.order.fire` cuando el POS manda `round_no`.
-- El filtro `fired_at IS NULL` es el contrato: una línea ya enviada JAMÁS se re-marca (y el
-- siguiente disparo solo encuentra lo nuevo). Soft-delete fuera, como siempre.
UPDATE sales_order_item
SET round_no = :round_no, fired_at = :now, updated_by = :current_user_id, updated_at = :now
WHERE hub_id = :hub_id AND order_id = :order_id AND fired_at IS NULL AND is_deleted = 0;
