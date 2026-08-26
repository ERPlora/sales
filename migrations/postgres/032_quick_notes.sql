-- Sales · sales#206 — the QUICK NOTES the business preconfigures for the line-note sheet.
--
-- Types: portable "ERPlora SQL" subset (ADR-0007):
--   * ids/refs → TEXT (the runtime's UUIDs as text);
--   * 0/1 flags → INTEGER (the commands bind 0/1; Postgres does not cast integer to bool);
--   * DATES → TEXT ISO-8601 (NOT TIMESTAMPTZ): the sync engine (ADR-0031) compares `updated_at`
--     as a lexicographic string, and timestamptz would break LWW between dialects.
--
-- WHY A TABLE AND NOT A COLUMN ON `sales_settings`. The shell paints a module's settings screen
-- from its JSON Schema and knows four controls — toggle, select, number, text
-- (`hub/apps/web/src/lib/module-settings.ts`). A list has no control there, so a JSON column
-- reached through `settings.schema` would land on the business as raw JSON in a text box, and the
-- reorder Lightspeed's Back Office offers would have to be typed as JSON too. The module already
-- has this exact shape and it is a table: `sales_payment_method` — an ordered catalogue of rows
-- with `sort_order`, soft-delete and audit. This is that row, with one text on it.
--
-- THIS ROW CARRIES NO MONEY. It is production text, like the line note it feeds: stored verbatim,
-- interpreted by nobody, never part of the fiscal chain. Deleting one changes nothing already
-- charged — the note is FROZEN on the line and on `sales_sale_item.notes` at checkout.
--
-- REVERTING IT is dropping the table, and that is the migration guard's job (ADR-0387): this file
-- is `expand` — it creates and never touches a row anybody else wrote, so a hub that rolls the
-- module back to the previous version keeps every check, every sale and every note already typed.
CREATE TABLE IF NOT EXISTS sales_quick_note (
    id         TEXT PRIMARY KEY,
    hub_id     TEXT NOT NULL,
    -- What the chip says, and what is appended to the note. 80 chars is the ceiling the schema
    -- enforces: a chip is an instruction ("no salt"), not a paragraph — that is what the free
    -- keyboard underneath is for.
    text       TEXT NOT NULL,
    -- The order the business gave them in the Back Office is the order the till paints them in.
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT
);

-- The till reads the whole (small) catalogue of its own hub, ordered, on every service. This is
-- the only access path there is, so it is the only index there is.
CREATE INDEX IF NOT EXISTS ix_sales_quick_note_hub ON sales_quick_note (hub_id, is_deleted, sort_order);
