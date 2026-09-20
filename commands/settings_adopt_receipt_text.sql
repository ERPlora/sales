-- sales.settings.adopt_receipt_text — the receipt text MOVES IN from Printing (printing#44).
--
-- Since hub#1921 both papers (the ticket that comes out on its own at checkout and the one the
-- print button sends) are the sales viewer's document, which reads `sales.pos_settings.get`. The
-- two boxes on the Printing screen stopped reaching any paper, so the shops that typed their
-- branding there have it stranded in `printing_settings`. This is the door that brings it over.
--
-- It is NOT `sales.settings.update`, and the two differences are the whole point:
--   * that one takes the WHOLE snapshot (the settings screen always sends every column), so a
--     caller holding two strings would blank the other sixteen settings with the schema defaults;
--   * and it OVERWRITES. This one only ever fills an EMPTY field, per field. What the shop wrote
--     here is the shop's, and a migration able to overwrite it would stamp a blueprint's demo
--     header onto somebody's real ticket.
--
-- Blanks are not text on either side: a stored header of spaces prints nothing (so it counts as
-- empty and may be replaced) and an incoming header of spaces is not worth adopting. `BTRIM` and
-- not a bare `TRIM` because the bare one strips SPACES ONLY: a footer of "  \n " survived it and
-- was adopted as if it were text. The character set here is the one Rust's `str::trim()` strips,
-- so this agrees with the checklist's `truthy()` (hub/crates/runtime/src/setup_status.rs).
--
-- The `DO UPDATE` REVIVES a soft-deleted singleton: `uq_sales_settings_hub` is not a partial
-- index, so the soft-deleted row keeps the `ON CONFLICT` slot, and without `is_deleted = 0` the
-- command would report success while writing into a row `sales.pos_settings.get` filters out —
-- exactly the trap `printing.settings.update` fell into (printing#25).
--
-- Binds: :new_id, :receipt_header, :receipt_footer (+ :hub_id, :current_user_id, :now injected by
-- the runtime). The CASTs are not decoration: a bare parameter in a SELECT list has no inferable
-- type in Postgres ("could not determine data type of parameter").
INSERT INTO sales_settings (
    id, hub_id, receipt_header, receipt_footer,
    is_deleted, created_by, updated_by, created_at, updated_at
)
SELECT CAST(:new_id AS TEXT),
       CAST(:hub_id AS TEXT),
       CASE WHEN BTRIM(COALESCE(CAST(:receipt_header AS TEXT), ''), E' \t\n\r') = ''
            THEN '' ELSE CAST(:receipt_header AS TEXT) END,
       CASE WHEN BTRIM(COALESCE(CAST(:receipt_footer AS TEXT), ''), E' \t\n\r') = ''
            THEN '' ELSE CAST(:receipt_footer AS TEXT) END,
       0,
       CAST(:current_user_id AS TEXT),
       CAST(:current_user_id AS TEXT),
       CAST(:now AS TEXT),
       CAST(:now AS TEXT)
-- Nothing to move ⇒ no row is born. A blank call must not turn "this hub never saved its till
-- settings" into "it did".
WHERE BTRIM(COALESCE(CAST(:receipt_header AS TEXT), ''), E' \t\n\r') <> ''
   OR BTRIM(COALESCE(CAST(:receipt_footer AS TEXT), ''), E' \t\n\r') <> ''
ON CONFLICT (hub_id) DO UPDATE SET
    receipt_header = CASE
        WHEN BTRIM(COALESCE(sales_settings.receipt_header, ''), E' \t\n\r') = ''
         AND BTRIM(COALESCE(CAST(:receipt_header AS TEXT), ''), E' \t\n\r') <> ''
        THEN CAST(:receipt_header AS TEXT)
        ELSE sales_settings.receipt_header END,
    receipt_footer = CASE
        WHEN BTRIM(COALESCE(sales_settings.receipt_footer, ''), E' \t\n\r') = ''
         AND BTRIM(COALESCE(CAST(:receipt_footer AS TEXT), ''), E' \t\n\r') <> ''
        THEN CAST(:receipt_footer AS TEXT)
        ELSE sales_settings.receipt_footer END,
    is_deleted = 0,
    deleted_at = NULL,
    updated_by = CAST(:current_user_id AS TEXT),
    updated_at = CAST(:now AS TEXT)
-- Only when something is actually adopted: a call that changes nothing must not bump `updated_at`
-- nor revive a row the shop is not asking about.
WHERE (BTRIM(COALESCE(sales_settings.receipt_header, ''), E' \t\n\r') = ''
       AND BTRIM(COALESCE(CAST(:receipt_header AS TEXT), ''), E' \t\n\r') <> '')
   OR (BTRIM(COALESCE(sales_settings.receipt_footer, ''), E' \t\n\r') = ''
       AND BTRIM(COALESCE(CAST(:receipt_footer AS TEXT), ''), E' \t\n\r') <> '');
