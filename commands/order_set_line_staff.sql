-- Sales · CORRIGE el profesional de una línea del pedido sin rehacer la línea (sales#277).
--
-- La 035 le dio su `staff_id` a `sales_order_item` y el TPV lo SELLA al añadir la línea, con quien
-- estuviera en el chip (sales#273). Sellar no es acertar: si la recepcionista movió el chip tarde,
-- hasta hoy la única salida era borrar la línea y volver a añadirla — y con ella se iban la nota,
-- el descuento de línea y los suplementos que ya llevara.
--
-- Es un UPDATE de UNA columna a propósito: el profesional NO mueve dinero (el importe de la línea
-- no depende de quién la hizo), así que no recompone el total del pedido ni entra en la misma
-- puerta que `order_update_line`, cuyo `COALESCE(:staff_id, staff_id)` no sabría distinguir «no lo
-- toques» de «devuélvelo a la cabecera». Aquí NULL es un valor, no una ausencia: significa
-- exactamente «que lo atribuya la cabecera», que es lo que `by_staff` hace con COALESCE.
--
-- `fired_at IS NULL`: una línea ya enviada a producción no se edita desde el TPV (misma regla que
-- `order_update_line`). En un salón no hay cocina y ninguna línea se dispara, así que esto no le
-- quita nada; en un bar impide reescribir lo que ya está en fuego.
--
-- `is_deleted = 0` y `hub_id = :hub_id` (inyectado por el runtime, no falsificable) son el
-- aislamiento: la línea del hub vecino no es alcanzable ni nombrándola. Que no case ninguna fila
-- NO es silencio — `expect_rows` lo convierte en `sales.order_line_not_available` y el TPV lo
-- pinta: una corrección que no se guarda y no se dice es peor que no poder corregir.
UPDATE sales_order_item
SET staff_id   = :staff_id,
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NULL;
