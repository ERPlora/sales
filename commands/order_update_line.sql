-- ADR-0141 Gate 3: cambia la cantidad (y su line_total provisional) de una línea de un pedido
-- abierto. Solo sobre líneas vivas del pedido/hub (aislamiento por contrato). Recompone el total
-- en la 2ª sentencia (order_recompute_total.sql).
UPDATE sales_order_item
SET quantity = :quantity, line_total = :line_total, updated_by = :current_user_id, updated_at = :now
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0;
