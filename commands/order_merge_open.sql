-- sales#546 — JOIN, statement 2 of 5: «are both checks still ours to change?», asked AFTER
-- `order_merge_lock.sql` queued the join on them (so the snapshot is fresh). Matching 0 rows makes
-- the command's `expect_rows` answer `sales.order_changed`: the check was charged, voided or
-- deleted (by another device, while the join waited), or it is not of this hub, and nothing moves.
--
--   · the check that STAYS has to be open and live: lines moved into a closed check leave the
--     floor without being charged;
--   · the absorbed one has to be live and of this hub, and open — or already voided, which is
--     what a REPLAY of the same join finds (SALES-F24: «repeating it changes nothing»). The
--     statements after this one still move nothing out of a check that is not open.
SELECT t.id
  FROM sales_order t
  JOIN sales_order f
    ON f.id = :from_order_id
   AND f.hub_id = :hub_id
   AND f.is_deleted = 0
   AND f.status IN ('open', 'voided')
 WHERE t.id = :to_order_id
   AND t.hub_id = :hub_id
   AND t.status = 'open'
   AND t.is_deleted = 0;
