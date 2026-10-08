-- sales#571 · A line with several units goes back PART by part, over several refunds.
--
-- Three identical shampoos on one line; the customer returns one. Migration 041 let a line go back
-- ONCE, whole: `uq_sale_refund_line_once (hub_id, sale_item_id)` refused a second row for the same
-- line, so «1 of 3» could not be said and the other two could never follow. Now each refund records
-- how many units of the line it took back (`quantity`, fixed point 10^6, ADR-0147), and the line
-- can go back again until its units run out. That cap is checked by `sales._insert_refund_line`
-- inside the refund's transaction, queued behind `_refund_lock.sql` (two refunds of the same sale
-- run one after the other, and the second reads what the first committed).
--
-- What stays unique is the line inside ONE refund: a refund names each line once.
--
-- Reversal: DROP INDEX IF EXISTS uq_sale_refund_line_per_refund;
--           CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_refund_line_once
--               ON sales_sale_refund_line (hub_id, sale_item_id) WHERE is_deleted = 0;
--           (the second statement fails while a line has gone back in parts: undo those rows
--           first, or leave the reversal at the first statement.)
DROP INDEX IF EXISTS uq_sale_refund_line_once;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_refund_line_per_refund
    ON sales_sale_refund_line (hub_id, refund_id, sale_item_id)
    WHERE is_deleted = 0;
