-- ADR-0141 Gate 3: recompone el total PROVISIONAL del pedido = suma de las líneas vivas. Se ejecuta
-- como 2ª sentencia de add/update/remove_line, en la MISMA transacción, para que el total no derive.
-- NO es fiscal: la cuota HALF_UP + el desglose por tipo se congelan al cobrar (complete_sale).
UPDATE sales_order
SET provisional_total = COALESCE((
      SELECT SUM(line_total) FROM sales_order_item
      WHERE order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
    ), 0),
    updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND is_deleted = 0;
