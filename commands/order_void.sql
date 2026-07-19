-- ADR-0141 Gate 3: anula un pedido ABIERTO (cancelación del ticket antes de cobrar). El ciclo de
-- vida del `order` es open → completed → voided; solo se anula si sigue abierto (guard).
UPDATE sales_order
SET status = 'voided', updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND status = 'open' AND is_deleted = 0;
