-- sales#160 -- ya se devolvio con ESTA clave de idempotencia?
--
-- Dos consumidores, el mismo contrato, calcado de `sales.by_idempotency_key` (sales#20):
--   * el runtime la pre-carga para `sales.refund` (`reads`, filtrada por
--     `payload.idempotency_key`) y el handler la usa para que un reintento sea un no-op limpio en
--     vez de una SEGUNDA devolucion -- o sea, en vez de que el dinero salga dos veces;
--   * el TPV la consulta tras devolver para recuperar EXACTAMENTE el documento que acaba de crear,
--     que es el `refund_ref` que `services` necesita para devolver la sesion al bono.
-- La cadena vacia es el historico anterior a la migracion 026: nunca casa (la excluye el indice
-- parcial y la excluye este WHERE).
SELECT id, sale_id, total, reason, created_at
FROM sales_sale_refund
WHERE hub_id = :hub_id
  AND idempotency_key = :idempotency_key
  AND idempotency_key <> ''
  AND is_deleted = 0
LIMIT 1
