-- sales#160 -- inserts ONE leg of the refund: which leg of the charge the money comes out of
-- (:payment_id) and which method it goes back through (:payment_method_*). Internal, one per leg.
--
-- Both axes live in the same row on purpose. The origin rules the CAP (a leg never gives back more
-- than it charged), the destination rules the DRAWER (only `cash` touches it). Keeping only one
-- would force guessing the other: that is Odoo's bug, where refunding through a different method
-- ends with the method on both sides of the same entry.
--
-- Nothing is decided about the destination here: name and type come from the hub's catalogue,
-- resolved by the handler, never from the browser's label (same rule as the charge, sales#20).
--
-- sales#506: the CAP is re-checked HERE, against the legs already written, and not only by the
-- handler against `sales.refund_options` — a read taken before the transaction that two refunds
-- fired at once share. `_refund_lock.sql` queued this refund behind any other of the same sale, so
-- this statement sees what the earlier one wrote. A leg that no longer fits writes 0 rows and the
-- command's `expect_rows` rolls the whole refund back with `sales.refund_exceeds_tender`, the same
-- refusal an over-the-cap refund always got. A voided refund (soft-delete) does not count, as in
-- `refund_options.sql`.
--
-- sales#511: and it only lands under ITS OWN head — this refund's id, of this hub and this sale.
-- When the head wrote nothing (a void committed while this refund waited in `_refund_lock.sql`, or
-- another refund closed the sale), the leg used to still fit the cap and crash on the foreign key
-- to the missing head: a SQL error, which the kernel answers with the generic `db`, before the
-- head's `expect_rows` (judged at the END of the transaction) could say why. Now the leg writes 0
-- rows too and the refusal is the head's own: `sales.refund_requires_completed` — the kernel reports
-- the first gate that missed, and the head's comes first.
--
-- `:amount` is used twice — written into a BIGINT column and compared against a NUMERIC sum — so
-- the comparison says its type out loud: left bare, Postgres deduces two different types for the
-- one parameter and cannot PREPARE the statement unless the caller happens to send the type.
INSERT INTO sales_sale_refund_payment (
    id, hub_id, refund_id, sale_id, payment_id,
    payment_method_id, payment_method_name, payment_method_type,
    amount, sort_order,
    is_deleted, created_by, updated_by, created_at, updated_at
)
SELECT :refund_payment_id, :hub_id, :refund_id, p.sale_id, p.id,
       :payment_method_id, :payment_method_name, :payment_method_type,
       :amount, :sort_order,
       0, :current_user_id, :current_user_id, :now, :now
  FROM sales_sale_payment p
 WHERE p.id = :payment_id
   AND p.sale_id = :sale_id
   AND p.hub_id = :hub_id
   AND p.is_deleted = 0
   AND EXISTS (
           SELECT 1
             FROM sales_sale_refund h
            WHERE h.id = :refund_id
              AND h.hub_id = :hub_id
              AND h.sale_id = :sale_id
       )
   AND p.amount - COALESCE((
           SELECT SUM(r.amount)
             FROM sales_sale_refund_payment r
            WHERE r.payment_id = p.id
              AND r.sale_id = p.sale_id
              AND r.hub_id = p.hub_id
              AND r.is_deleted = 0
       ), 0) >= CAST(:amount AS BIGINT);
