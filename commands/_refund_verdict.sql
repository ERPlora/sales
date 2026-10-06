-- sales#508 -- «does the sale's mark say what this refund announces?», asked right after
-- `_mark_refunded.sql`, in the same command (`sales._mark_refunded`), which the `sales.refund`
-- handler emits after the legs of every refund.
--
-- The handler announces whether this refund closes the sale (`fully_refunded` on `sale.refunded`
-- and in its answer; `invoice` rectifies «what is left» with it, a flow can trigger on it). It
-- computes that from `sales.refund_options`, read BEFORE the transaction. Two partial refunds of
-- 7,50 € fired at once on a 15,00 € ticket both read «nothing refunded yet»: the second one, queued
-- by `_refund_lock.sql`, closes the sale — `_mark_refunded` decides that against the rows — while
-- its event says it does not. The handler cannot know better, so the database checks it: the sale
-- matches only when its status after the mark agrees with the verdict (`:fully_refunded`, 0 or 1).
-- Matching 0 rows makes the command's `expect_rows` answer `sales.refund_sale_changed`, the whole
-- refund rolls back, and confirming again reads fresh and closes the sale saying so.
--
-- `hub_id` ALWAYS: this hub's verdict is about this hub's sale, never a neighbour's row. No
-- `is_deleted`: a deleted sale never gets this far (`_insert_refund.sql` refuses it first, and the
-- kernel reports the first gate that missed), and `id` is the table's primary key.
SELECT id
  FROM sales_sale
 WHERE id = :sale_id
   AND hub_id = :hub_id
   AND CASE WHEN status = 'refunded' THEN 1 ELSE 0 END = CAST(:fully_refunded AS INTEGER);
