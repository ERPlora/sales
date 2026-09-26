-- sales#385: the internal write of `sales._set_order_line_discount` — the manual LINE discount (%)
-- and its server-priced amount (cents) on a live, unfired line of an OPEN order. Emitted by the WASM
-- handler of BOTH public doors (`sales.order.set_line_discount` / `sales.order.set_line_discount_over_limit`,
-- `set_order_line_discount_inner` in handler/src/lib.rs) only after the shop's max_discount_percent
-- cap has already been checked there — this statement itself has no cap logic. Only a live line of
-- an open, unfired check: `fired_at IS NULL` (already in production, ADR-0141) and `sale_id IS NULL`
-- (already paid, ADR-0146) are never rewritten this way.
--
-- sales#385, mirrors sales#386 for the ticket: `discount_approved_by` records WHO cleared the cap
-- for the discount THIS line stores, so the checkout can honour it without asking for the PIN a
-- second time. `:discount_approved` comes as 1 from the manager's door and 0 from the usual door:
-- the usual door always wipes the column, since a discount it accepts on its own never needed
-- approval. `:approved_by` is the manager the runtime named when the PIN was typed; it arrives empty
-- when the caller already held the permission themselves, in which case the approval names the
-- caller (`:current_user_id`).
UPDATE sales_order_item
SET discount_percent = :discount_percent,
    line_total = :line_total,
    discount_approved_by = CASE WHEN :discount_approved = 1 THEN COALESCE(NULLIF(:approved_by, ''), :current_user_id) ELSE NULL END,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :line_id AND order_id = :order_id AND hub_id = :hub_id AND is_deleted = 0
  AND fired_at IS NULL AND sale_id IS NULL;
