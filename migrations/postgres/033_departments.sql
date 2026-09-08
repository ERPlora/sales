-- Sales · sales#267 — the DEPARTMENTS the business offers on the open-price sheet.
--
-- Types: portable "ERPlora SQL" subset (ADR-0007):
--   * ids/refs → TEXT (the runtime's UUIDs as text);
--   * 0/1 flags → INTEGER (the commands bind 0/1; Postgres does not cast integer to bool);
--   * DATES → TEXT ISO-8601 (NOT TIMESTAMPTZ): the sync engine (ADR-0031) compares `updated_at`
--     as a lexicographic string, and timestamptz would break LWW between dialects.
--
-- WHY A TABLE IN `sales` AND NOT A CURATION OF `taxes`. Until now the sheet painted one department
-- per ACTIVE TAX CATEGORY, and that catalogue is identical in every hub: the `taxes` seed plants
-- ten `is_system=1` rows in all of them. A grocer had to pick between «Restaurant — alcohol» and
-- «Service — healthcare» and could not find «Fruit and veg».
--
-- Turning the unwanted ones off in `taxes` would not have worked, and the reason is a contract, not
-- a missing feature: a seed guarded PER ROW declares REFERENCE data (ADR-0444), which the export
-- omits (`export::is_module_seeded` skips `is_system=1`) and the module replants at the
-- destination. A curation of it could therefore never travel inside a sector template — which is
-- the entire point of having departments. The department is the SHOP's datum, so it lives here and
-- travels in `data/sales.sql` like any other row of this module.
--
-- THE TAX CATEGORY IS AN ATTRIBUTE, NOT THE IDENTITY. Two departments legitimately share one
-- category: in Spain «Refrescos y alcohol» and «Droguería» are both 21%. Keying by
-- `tax_category_key` would collapse them into a single button and freeze the wrong family name on
-- the receipt. There is no unique index on `tax_category_key` on purpose.
--
-- NO FK TO `taxes_category`: modules do not own each other's tables (ADR-0085 links by canonical
-- KEY, never by row id). A key that resolves no rule prices nothing, which the checkout already
-- says out loud — the same way a catalogue product with an unknown category does.
--
-- THIS ROW CARRIES NO MONEY. The name and the category are FROZEN onto the line at the moment of
-- sale (`sales_sale_item.product_name` / `tax_category_key`), so retiring a department changes
-- nothing already charged and nothing already declared.
--
-- REVERTING IT is dropping the table, and that is the migration guard's job (ADR-0387): this file
-- is `expand` — it creates and never touches a row anybody else wrote, so a hub that rolls the
-- module back to the previous version keeps every check, every sale and every department typed.
CREATE TABLE IF NOT EXISTS sales_department (
    id                TEXT PRIMARY KEY,
    hub_id            TEXT NOT NULL,
    -- What the cashier reads on the button: the shop's own word ("Frutas y verduras"), never the
    -- fiscal wording. 60 chars is the ceiling the schema enforces — it has to fit on a till key.
    name              TEXT NOT NULL,
    -- The canonical tax category (ADR-0085) this department charges at. Same vocabulary a
    -- catalogue product uses, so the pricing path is the one that already exists.
    tax_category_key  TEXT NOT NULL,
    -- The order the business gave them in the back office is the order the till paints them in.
    sort_order        INTEGER NOT NULL DEFAULT 0,
    -- Retiring one is the SOFT delete below and nothing else. An `is_active` next to `is_deleted`
    -- would be two switches for one decision, and the back office would have to explain the
    -- difference between "retired" and "deleted" to somebody who only wants the button gone.
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT
);

-- The till reads the whole (small) catalogue of its own hub, ordered, on every service. This is
-- the only access path there is, so it is the only index there is.
CREATE INDEX IF NOT EXISTS ix_sales_department_hub ON sales_department (hub_id, is_deleted, sort_order);
