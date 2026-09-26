-- sales#284: the internal write of `sales._set_order_discount` — TICKET discount (%) and/or a
-- fixed amount (cents) on an OPEN order. Emitted by the WASM handler of BOTH public doors
-- (`sales.order.set_discount` / `sales.order.set_discount_over_limit`, `set_order_discount_inner`
-- in handler/src/lib.rs) only after the shop's max_discount_percent cap has already been checked
-- there — this statement itself has no cap logic. Only on open orders: a charged sale is never
-- discounted this way (guard, ADR-0141). The provisional total does NOT change here: it is the sum
-- of the lines (display); the ticket discount is shown by the till and applied at checkout.
UPDATE sales_order
SET discount_percent = :discount_percent,
    discount_amount = COALESCE(:discount_amount, discount_amount), -- sales#113 (céntimos)
    updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND status = 'open' AND is_deleted = 0;
