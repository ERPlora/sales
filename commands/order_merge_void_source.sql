-- sales#61 (2/3) — JUNTAR: la cuenta absorbida queda ANULADA, no borrada.
--
-- `voided` es una lápida: la cuenta ya no está en la sala, pero la fila queda como rastro de que
-- existió y de dónde fueron sus líneas. Borrarla dejaría un pedido cobrado a medias sin pasado.
--
-- Mismas guardas que 1/3, y son las que impiden el escenario feo: si el destino no está abierto,
-- la sentencia anterior no movió nada — anular aquí sin comprobarlo dejaría la cuenta origen
-- anulada CON sus líneas dentro, es decir, la mesa cobrando cero.
UPDATE sales_order
SET status = 'voided', updated_by = :current_user_id, updated_at = :now
WHERE id = :from_order_id
  AND hub_id = :hub_id
  AND status = 'open'
  AND is_deleted = 0
  AND CAST(:from_order_id AS TEXT) <> CAST(:to_order_id AS TEXT)
  AND EXISTS (
    SELECT 1 FROM sales_order t
    WHERE t.id = :to_order_id AND t.hub_id = :hub_id AND t.status = 'open' AND t.is_deleted = 0
  );
