-- services#158 · A refund says WHICH lines of the sale go back, not only how much money.
--
-- A ticket with a haircut and a voucher; the customer returns only the voucher. The money went
-- back by tender (026) and nothing recorded that the voucher line went with it, so `services`
-- could only void the voucher when the WHOLE ticket went back. One row per line the operator
-- marked in «Qué se devuelve», written by `sales._insert_refund_line` and announced in
-- `sale.refunded.lines`.
--
--   refund_id     the refund document the line went back with (sales_sale_refund.id)
--   sale_id       the sale (denormalised, like the legs: every read is per sale)
--   sale_item_id  the line of the sale (sales_sale_item.id)
--   product_id    what the line sold, frozen from the sale line (a voucher's package id)
--   quantity      the line's quantity, fixed point 10^6 (ADR-0147), the whole line
--
-- A line goes back ONCE: the partial unique index is the final authority when two refunds race
-- past the handler's read (`sales.refund_lines`); the insert re-checks it first so the normal case
-- answers with the command's own refusal instead of a constraint error.
--
-- Hub row contract: hub_id + soft-delete + audit. Types: «ERPlora SQL» subset (ADR-0007).
--
-- Reversal: DROP TABLE IF EXISTS sales_sale_refund_line;
CREATE TABLE IF NOT EXISTS sales_sale_refund_line (
    id           TEXT PRIMARY KEY,
    hub_id       TEXT NOT NULL,
    refund_id    TEXT NOT NULL,
    sale_id      TEXT NOT NULL,
    sale_item_id TEXT NOT NULL,
    product_id   TEXT,
    quantity     INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT,
    FOREIGN KEY (refund_id) REFERENCES sales_sale_refund (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sale_refund_line_sale ON sales_sale_refund_line (hub_id, sale_id, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_refund_line_once
    ON sales_sale_refund_line (hub_id, sale_item_id)
    WHERE is_deleted = 0;
