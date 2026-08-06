-- sales#20 — ¿ya se cobró ESTA clave de idempotencia?
--
-- Dos consumidores, el mismo contrato:
--   * el runtime la pre-carga para `complete_sale` (`reads`, filtrada por `payload.idempotency_key`)
--     y el handler la usa para que un reintento sea un no-op limpio en vez de una segunda venta;
--   * el TPV la consulta tras cobrar para recuperar EXACTAMENTE la venta que acaba de crear —
--     antes pedía «la última venta» (`sales.list` limit 1), que en dos cajas a la vez devuelve la
--     del compañero.
-- La cadena vacía es el histórico anterior a la migración 017: nunca casa (la excluye el índice
-- parcial y la excluye este WHERE).
SELECT id, sale_number, total, document_type, created_at
FROM sales_sale
WHERE hub_id = :hub_id
  AND idempotency_key = :idempotency_key
  AND idempotency_key <> ''
  AND is_deleted = 0
LIMIT 1
