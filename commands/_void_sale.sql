-- sales#26: anula una venta (NO la borra). Intención del handler WASM `void_sale`, que ya validó
-- contra `sales.get` que la venta existe en este hub, está `completed` y no lleva factura completa
-- (esa va por rectificativa, invoice#5). El `WHERE status = 'completed'` es el cinturón: dos
-- anulaciones concurrentes no pueden marcar la misma fila dos veces.
--
-- Auditoría estructurada: `voided_at` / `voided_by` / `void_reason` (020). El resto de la fila
-- —importes, líneas, desglose, documento— queda inmutable. Se conserva además la marca en `notes`
-- para que quien lea la venta como antes de la 020 siga viendo el motivo.
--
-- sales#247 — EL SEGUNDO CINTURÓN: con dinero ya devuelto, aquí no se entra.
--
-- El handler ya rechaza la venta con devoluciones (`sales.sale_already_refunded`) leyendo
-- `sales.refunds`, y ese es el rechazo TRADUCIDO que ve el cajero. Pero el handler mira y el SQL
-- escribe DESPUÉS: si una devolución aterriza en esa ventana —el cajero devuelve desde otra
-- tablet mientras el encargado anula— la decisión se tomó sobre un estado que dejó de ser cierto,
-- y sin esto la venta se anularía con dinero ya devuelto por detrás. La carrera solo la puede
-- cerrar el propio WHERE, que es atómico; el `NOT EXISTS` no es una segunda opinión de la
-- política, es lo que hace que la política no se pueda perder por tiempo.
--
-- Ojo con la parcial: `_mark_refunded` solo marca `refunded` cuando vuelve el ÚLTIMO céntimo, así
-- que una venta devuelta EN PARTE sigue `completed` y el cinturón de arriba la dejaba pasar entera.
--
-- sales#511: the WHERE alone did not close it. When a partial refund is in flight it holds the sale
-- row (`_refund_lock.sql`); an UPDATE that waits on a row re-checks the row's own conditions after
-- the wait but NOT its subqueries, which keep the snapshot taken before — and a partial refund does
-- not touch the sale row. So the void now queues FIRST, in its own statement (`sales._void_lock`),
-- and this UPDATE runs with a fresh snapshot that sees the committed refund. Matching 0 rows here
-- makes the command's `expect_rows` answer `sales.sale_already_refunded`; a voided sale never gets
-- this far (`_void_open.sql` is the earlier gate), so 0 rows here always means money went back.
--
-- `hub_id` va en el subselect SIEMPRE: la FK de `sales_sale_refund` apunta a `sales_sale(id)` a
-- secas, sin el hub, de modo que un vecino puede tener filas contra un id que no es suyo. Sin el
-- `hub_id` aquí, la devolución del hub de al lado bloquearía una anulación legítima de este.
-- El soft-delete también: una devolución ANULADA no cuenta, igual que en `sales.refund_options`.
UPDATE sales_sale
SET status = 'voided',
    voided_at = :now,
    voided_by = :voided_by,
    void_reason = :void_reason,
    notes = notes || '
' || '[VOIDED] ' || :void_reason,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :sale_id AND hub_id = :hub_id AND status = 'completed' AND is_deleted = 0
  AND NOT EXISTS (
        SELECT 1 FROM sales_sale_refund r
        WHERE r.sale_id = :sale_id AND r.hub_id = :hub_id AND r.is_deleted = 0
  );
