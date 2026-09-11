-- sales#280 — enlaza una cuenta ABIERTA con la cita que la originó (ADR-0077).
--
-- Se escribe al sembrar el TPV desde la agenda, y es lo que hace que el enlace sobreviva a que el
-- shell reconstruya la pantalla o a un F5: la cuenta se recupera del servidor con su cita puesta.
-- Solo sobre pedidos abiertos: una venta ya cobrada no cambia de cita (guard, ADR-0141).
UPDATE sales_order
SET appointment_id = :appointment_id, updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND status = 'open' AND is_deleted = 0;
