-- Etiqueta OPACA de una cuenta ABIERTA («Mesa 4», «Ana — terraza», «15:07»): la escribe quien la
-- conoce (el POS al asignar mesa, o el nombre tecleado al aparcar) y `sales` no la interpreta
-- (ADR-0144). Solo sobre pedidos abiertos: una venta cobrada ya no se renombra (guard, ADR-0141).
UPDATE sales_order
SET label = :label, updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND status = 'open' AND is_deleted = 0;
