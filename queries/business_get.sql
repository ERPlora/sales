-- The hub's BUSINESS IDENTITY, as the paper prints it (sales#180).
--
-- It comes from no `sales` table: it lives in `hub_settings` (single source, ADR-0061) and the
-- runtime injects it as a system parameter into ALL of a module's SQL (`:business_legal_name`,
-- `:business_tax_id` -- crates/runtime/src/queries.rs). That is why this read touches no table and
-- needs no `hub_id`: the parameters arrive already resolved for THE hub that is asking, and the
-- browser cannot influence them.
--
-- It exists apart from `sales.settings.get` for two reasons, and both matter:
--   1) that one requires `sales.manage_settings`, and whoever prints the bill is the CASHIER;
--   2) that one returns ZERO rows until somebody has saved the till settings, which is exactly the
--      freshly built hub where the bill came out headed with the generic default name.
--
-- The CAST is mandatory in Postgres: a bare parameter in the SELECT list has no inferable type
-- ("could not determine data type of parameter").
SELECT CAST(:business_legal_name AS TEXT) AS name,
       CAST(:business_tax_id AS TEXT)     AS tax_id;
