-- sales#20 — IDEMPOTENCIA del cierre de venta.
--
-- Un cobro se reintenta: se cae el wifi entre el `INSERT` y la respuesta, el camarero vuelve a
-- pulsar «Cobrar», el navegador reenvía. Sin clave, cada reintento era una venta NUEVA — con su
-- stock descontado, su apunte de caja y su factura. La clave la genera el cliente por INTENTO de
-- cobro (no por petición) y `complete_sale` la congela aquí.
--
-- El índice único es la autoridad FINAL: la sonda `sales.by_idempotency_key` que el runtime
-- pre-carga para el handler resuelve el reintento normal (no-op limpio), pero dos peticiones
-- simultáneas leen ambas «no existe» y solo el índice puede decidir. La segunda revienta y su
-- transacción entera se revierte: ni venta, ni líneas, ni eventos en el outbox.
--
-- Parcial (`WHERE idempotency_key <> ''`) porque el histórico ya escrito no la tiene: las ventas
-- anteriores a esta migración comparten la cadena vacía y el índice las ignora en vez de
-- declararlas duplicadas. Es la razón de que la columna sea NOT NULL DEFAULT '' y no NULL.
ALTER TABLE sales_sale ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_sale_idempotency
    ON sales_sale (hub_id, idempotency_key)
    WHERE idempotency_key <> '';
