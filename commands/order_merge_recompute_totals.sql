-- sales#61 (3/3) — JUNTAR: las dos cuentas recomponen su total desde sus líneas vivas.
--
-- La superviviente pasa a valer la suma exacta de las dos (porque tiene ahora todas las filas) y la
-- absorbida cae a cero. Recalculado, no sumado a mano: sumar el total de una a la otra arrastraría
-- cualquier deriva previa entre cabecera y líneas en vez de corregirla, y dejaría un número que ya
-- no se puede reconstruir desde la comanda.
--
-- Sigue sin ser fiscal (ADR-0141): el desglose por tipo lo congela el COBRO a partir de la
-- `tax_category_key` de cada línea, que viajó con su fila.
UPDATE sales_order o
SET provisional_total = COALESCE((
      SELECT SUM(i.line_total) FROM sales_order_item i
      WHERE i.order_id = o.id AND i.hub_id = o.hub_id AND i.is_deleted = 0
    ), 0),
    updated_by = :current_user_id, updated_at = :now
WHERE o.hub_id = :hub_id
  AND o.is_deleted = 0
  AND o.id IN (:from_order_id, :to_order_id);
