-- sales#521 · A line already sent to the kitchen is VOIDED, not removed: it leaves the check like a
-- removed line (`is_deleted = 1`) but keeps WHY and WHO, which is what the market asks for when a
-- plate that is already being cooked comes off the bill (Toast, TouchBistro, LS Central: reason +
-- manager). Written only by `sales.order.void_line` (commands/order_void_line.sql).
--
--   void_reason  the reason the till sent (mandatory, trimmed)
--   voided_by    the hub_user the runtime names in `:approved_by` (the manager who gave the PIN),
--                or the caller when they hold `sales.void_sale` themselves
--   voided_at    when it was voided (ISO-8601 text, same shape as fired_at)
--
-- NULL on every line that was never voided.
--
-- Reversal: ALTER TABLE sales_order_item DROP COLUMN voided_at, DROP COLUMN voided_by,
--           DROP COLUMN void_reason;
ALTER TABLE sales_order_item ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE sales_order_item ADD COLUMN IF NOT EXISTS voided_by TEXT;
ALTER TABLE sales_order_item ADD COLUMN IF NOT EXISTS voided_at TEXT;
