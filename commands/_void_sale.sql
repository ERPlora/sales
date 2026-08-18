-- sales#26: anula una venta (NO la borra). Intención del handler WASM `void_sale`, que ya validó
-- contra `sales.get` que la venta existe en este hub, está `completed` y no lleva factura completa
-- (esa va por rectificativa, invoice#5). El `WHERE status = 'completed'` es el cinturón: dos
-- anulaciones concurrentes no pueden marcar la misma fila dos veces.
--
-- Auditoría estructurada: `voided_at` / `voided_by` / `void_reason` (020). El resto de la fila
-- —importes, líneas, desglose, documento— queda inmutable. Se conserva además la marca en `notes`
-- para que quien lea la venta como antes de la 020 siga viendo el motivo.
UPDATE sales_sale
SET status = 'voided',
    voided_at = :now,
    voided_by = :voided_by,
    void_reason = :void_reason,
    notes = notes || '
' || '[VOIDED] ' || :void_reason,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :sale_id AND hub_id = :hub_id AND status = 'completed' AND is_deleted = 0;
