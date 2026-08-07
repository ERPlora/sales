-- sales#61 (3/3) — DIVIDIR: las DOS cuentas recomponen su total desde sus líneas vivas.
--
-- Recalculado, nunca copiado: restar un importe de un lado y sumarlo al otro es exactamente donde
-- se pierde (o se inventa) un céntimo. Sumando las filas que cada cuenta tiene AHORA, las dos
-- mitades suman el original por construcción. Mismo criterio que `order_recompute_total.sql`, en
-- una sola sentencia para las dos.
--
-- Sigue sin ser fiscal (ADR-0141): la cuota HALF_UP y el desglose por tipo se congelan al COBRAR
-- (`sales.complete_sale`), y cada mitad lo resuelve con las categorías de SUS líneas.
UPDATE sales_order o
SET provisional_total = COALESCE((
      SELECT SUM(i.line_total) FROM sales_order_item i
      WHERE i.order_id = o.id AND i.hub_id = o.hub_id AND i.is_deleted = 0
    ), 0),
    updated_by = :current_user_id, updated_at = :now
WHERE o.hub_id = :hub_id
  AND o.is_deleted = 0
  AND o.id IN (:order_id, :new_id);
