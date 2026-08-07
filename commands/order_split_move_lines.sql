-- sales#61 (2/3) — DIVIDIR: las líneas elegidas se MUEVEN a la cuenta nueva.
--
-- Se mueve la FILA, no se copia: así el importe viaja intacto (nada que repartir ni redondear, ver
-- la nota del manifest sobre ADR-0210), la categoría fiscal congelada sigue con su línea (ADR-0085:
-- el desglose de cada mitad se recalcula solo, desde sus propias líneas) y `round_no`/`fired_at`
-- también — una línea que ya salió a cocina no puede volver al estado «pendiente», o el siguiente
-- disparo mandaría la misma comida por segunda vez.
--
-- El `EXISTS` sobre la cuenta nueva es lo que apaga esta sentencia cuando la 1/3 no insertó nada
-- (origen cerrado, de otro hub, o reintento sin líneas que mover): sin él, las líneas se irían a un
-- `order_id` que no existe y desaparecerían de la sala.
UPDATE sales_order_item
SET order_id = :new_id, updated_by = :current_user_id, updated_at = :now
WHERE hub_id = :hub_id
  AND order_id = :order_id
  AND is_deleted = 0
  AND sale_id IS NULL
  AND id IN (
    SELECT jsonb_array_elements_text(CAST(COALESCE(CAST(:line_ids AS TEXT), '[]') AS jsonb))
  )
  AND EXISTS (
    SELECT 1 FROM sales_order n
    WHERE n.id = :new_id AND n.hub_id = :hub_id AND n.is_deleted = 0
  );
