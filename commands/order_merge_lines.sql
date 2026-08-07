-- sales#61 (1/3) — JUNTAR dos comandas: las líneas del origen pasan al destino.
--
-- `tables.sessions.merge` re-apunta el pedido cuando la mesa destino no tiene ninguno, y ahí no hay
-- líneas que mover. Cuando las DOS traen pedido no puede resolverlo (no conoce las líneas) y deja
-- cada uno en su sesión: esta es esa mitad.
--
-- Se mueven FILAS, no se re-crean líneas. Re-crearlas era lo que hacía el bucle del navegador y
-- traía tres males: no era atómico (una caída a medias partía la cuenta en dos), no era
-- reejecutable (el mismo clic dos veces duplicaba la comanda) y estrenaba `fired_at` en NULL, así
-- que lo que ya estaba en fuego volvía a cocina.
--
-- Guardas — y por qué cada una:
--   · origen <> destino: una cuenta no puede tragarse a sí misma (se vaciaría en sí misma y luego
--     se anularía: la cuenta entera desaparecería).
--   · las dos ABIERTAS: meter líneas en un tiquet ya cobrado las saca de la sala sin cobrarlas.
--     Es además lo que hace IDEMPOTENTE el juntar: en el reenvío el origen ya está `voided`, así
--     que no queda nada que mover.
--   · `sale_id IS NULL`: lo ya cobrado se queda con la cuenta que lo vendió (ADR-0146).
UPDATE sales_order_item
SET order_id = :to_order_id, updated_by = :current_user_id, updated_at = :now
WHERE hub_id = :hub_id
  AND order_id = :from_order_id
  AND is_deleted = 0
  AND sale_id IS NULL
  AND CAST(:from_order_id AS TEXT) <> CAST(:to_order_id AS TEXT)
  AND EXISTS (
    SELECT 1 FROM sales_order f
    WHERE f.id = :from_order_id AND f.hub_id = :hub_id AND f.status = 'open' AND f.is_deleted = 0
  )
  AND EXISTS (
    SELECT 1 FROM sales_order t
    WHERE t.id = :to_order_id AND t.hub_id = :hub_id AND t.status = 'open' AND t.is_deleted = 0
  );
