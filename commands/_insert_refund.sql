-- sales#160 -- the HEAD of the refund document. Internal: emitted by the `sales.refund` WASM
-- handler, inside the SAME transaction as its legs.
--
-- The runtime injects :hub_id, :current_user_id and :now (not spoofable). The handler brings
-- :refund_id (from `context.new_ids`, and it IS the reference that travels as `refund_ref`) and
-- the :total, which already matches the sum of the legs because that check was made above, where
-- they are all together. Splitting it across N independent INSERTs would be not checking it.
--
-- sales#506: it only writes while the sale is STILL `completed`, read after `_refund_lock.sql` has
-- queued this refund behind any other of the same sale. Two full refunds fired at once both passed
-- the handler's read; the second one now finds the sale `refunded` by the first, writes 0 rows and
-- the command's `expect_rows` refuses it with `sales.refund_requires_completed` — the same answer a
-- refund on an already-refunded ticket always got.
INSERT INTO sales_sale_refund (
    id, hub_id, sale_id, total, reason, note, idempotency_key,
    is_deleted, created_by, updated_by, created_at, updated_at
)
SELECT :refund_id, :hub_id, s.id, :total, :reason, :note, :idempotency_key,
       0, :current_user_id, :current_user_id, :now, :now
  FROM sales_sale s
 WHERE s.id = :sale_id
   AND s.hub_id = :hub_id
   AND s.status = 'completed'
   AND s.is_deleted = 0;
