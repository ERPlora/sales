-- ADR-0141 Gate 3/6: changes the quantity (and its provisional line_total) of a line on an open
-- order; also toggles a COMP (is_gift/gift_reason), which changes the amount.
-- `quantity` is fixed point 10⁶ (ADR-0147). The frozen unit context is NOT touched here: it was
-- set when the line was added and changing the quantity does not change what it means — the one
-- exception is `increment_value` (sales#399, see the comment next to that column).
-- COALESCE leaves alone whatever is not sent. Only live lines of the order/hub (isolation).
-- The order total is recomputed in the 2nd statement (order_recompute_total.sql).
--
-- sales#385: the line discount is NOT written here any more — it goes through the capped doors
-- `sales.order.set_line_discount` / `sales.order.set_line_discount_over_limit`, which price the
-- `line_total` on the server. A quantity change keeps the discount and its approval
-- (`discount_approved_by`) as they were: `schemas/update_order_line.json` refuses a payload that
-- carries `discount_percent`.
UPDATE sales_order_item
SET quantity    = :quantity,
    line_total  = :line_total,
    is_gift     = COALESCE(:is_gift, is_gift),
    gift_reason = COALESCE(:gift_reason, gift_reason),
    -- sales#156: the line's free-text note. COALESCE is load-bearing here, not decoration: the
    -- quantity stepper sends no `notes` at all, so binding NULL has to leave the stored text
    -- alone. Without it, bumping a burger from 1 to 2 would silently erase the allergy the waiter
    -- typed, and nobody would find out until the plate reached the table. Clearing it is an
    -- explicit empty string, which this does honour.
    notes       = COALESCE(:notes, notes),
    -- sales#399: only bound (to 0) when a line with no unit takes a fractional quantity, so the
    -- row drops the whole-unit step it inferred; NULL keeps the frozen step.
    increment_value = COALESCE(:increment_value, increment_value),
    updated_by  = :current_user_id,
    updated_at  = :now
-- `fired_at IS NULL`: a line ALREADY SENT to the kitchen is not edited from the till (tandas,
-- 2026-07-19) — the food is on the fire; correcting it means a new round or a comp, and taking
-- it off means voiding it (`sales.order.void_line`, sales#521).
--
-- sales#546: `sale_id IS NULL` — a line a partial charge already paid is bound to its sale and
-- does not change any more. The door queues on the check first (`sales._order_lock`, which also
-- refuses a check that is no longer open), and matching 0 rows here answers `sales.order_changed`
-- (`expect_rows` of `sales._update_order_line`): the change is refused by name, never «ok».
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NULL
  AND sale_id IS NULL;
