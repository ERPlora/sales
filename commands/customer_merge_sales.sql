UPDATE sales_sale
   SET customer_id = :surviving_id,
       updated_by  = :current_user_id,
       updated_at  = :now
 WHERE hub_id = :hub_id
   AND customer_id = :absorbed_id
   AND CAST(:surviving_id AS TEXT) <> CAST(:absorbed_id AS TEXT);

-- Sales · `customer.merged` — re-point a merged customer's sales to the survivor
-- (customers#86/customers#87).
--
-- This runs from the outbox relay: the payload is the emitter's own params
-- (`surviving_id`, `absorbed_id`), so there is no `schema` here — the runtime injects
-- `hub_id`, `current_user_id` and `now` from the event's delivery context, not the payload.
--
-- The `hub_id` guard is load-bearing: `customer_id` is an opaque id with no cross-module
-- foreign key, and the very same string may name someone else entirely in another hub.
--
-- ALL sales move, whatever their status (completed, voided, refunded) or document type,
-- live and soft-deleted alike — this is the customer's purchase history, not just the
-- open till. `sales_sale` is the only table here that carries a customer: the open order
-- carries none by design (ADR-0141, `customers` owns that link in its own junction) and the
-- legacy cart blobs were dropped in migration 013.
--
-- 🔴 VeriFactu rule: a sale already issued/filed with the AEAT keeps the customer it was
-- issued to — only the LINK moves. `customer_name` (the name printed on the ticket or
-- invoice) and every fiscal column (number, document type, totals, tax breakdown, status,
-- void data) are never rewritten. The customer's tax id and address never live in this
-- table either — they travel only in the `sale.completed` event, straight to invoice and
-- verifactu.
--
-- No unique index includes `customer_id`, so a blind re-point cannot collide with anything.
-- This statement never reads `customers`, so it does not need the absorbed sheet to still
-- exist. The surviving<>absorbed guard turns a degenerate event into a no-op. It is
-- IDEMPOTENT: the outbox is at-least-once, and a redelivery simply matches zero rows.
-- No `expect_rows` on the command either — merging a customer who never bought anything
-- here is a perfectly normal outcome.
