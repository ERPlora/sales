-- sales#61 (1/3) — DIVIDIR la cuenta: nace el SEGUNDO pedido.
--
-- `tables` ya abrió la segunda cuenta de sala y la dejó a propósito SIN pedido, porque las líneas y
-- los importes no son suyos (tables#12). Aquí se materializa ese pedido; `sales` sigue sin saber
-- nada de mesas ni de sesiones — `label` es una cadena OPACA que reenvía sin interpretar (ADR-0144)
-- y el enganche con la cuenta lo escribe su dueño al recibir `erp:order-linked`.
--
-- `INSERT ... SELECT` en vez de `VALUES` para que la guarda viaje en el propio WHERE: si la cuenta
-- de origen no existe, no es de este hub o ya se cobró, no se inserta NADA (0 filas) y las
-- sentencias siguientes se apagan solas al no encontrar el pedido nuevo.
--
-- La segunda guarda es la que hace REEJECUTABLE la división: si el llamador pidió líneas concretas
-- y ninguna sigue en la cuenta de origen (porque la división ya corrió), no se abre un segundo
-- pedido. Sin ella, un reintento dejaba una cuenta vacía huérfana en la sala. Pedir la división
-- SIN líneas (`line_ids` ausente o vacío) sí abre la cuenta en blanco: es una petición legítima
-- («abre la segunda cuenta y ya iré pasando cosas»), no un reintento.
INSERT INTO sales_order (
    id, hub_id, status, provisional_total, notes, label, source_module,
    is_deleted, created_by, updated_by, created_at, updated_at
)
SELECT :new_id, :hub_id, 'open', 0, '', COALESCE(:label, ''), o.source_module,
       0, :current_user_id, :current_user_id, :now, :now
FROM sales_order o
WHERE o.id = :order_id
  AND o.hub_id = :hub_id
  AND o.status = 'open'
  AND o.is_deleted = 0
  AND (
    jsonb_array_length(CAST(COALESCE(CAST(:line_ids AS TEXT), '[]') AS jsonb)) = 0
    OR EXISTS (
      SELECT 1 FROM sales_order_item i
      WHERE i.hub_id = :hub_id
        AND i.order_id = :order_id
        AND i.is_deleted = 0
        -- Una línea ya cobrada está clavada a su venta (ADR-0146): no se reparte, se queda.
        AND i.sale_id IS NULL
        AND i.id IN (
          SELECT jsonb_array_elements_text(CAST(COALESCE(CAST(:line_ids AS TEXT), '[]') AS jsonb))
        )
    )
  );
