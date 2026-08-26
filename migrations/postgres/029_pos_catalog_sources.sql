-- Sales - sales#25: the two switches that decide WHICH catalogue feeds the till get a reader, and
-- the defaults stop disagreeing with the form.
--
-- Types: portable "ERPlora SQL" subset (ADR-0007):
--   * 0/1 flags -> INTEGER (commands bind 0/1, Postgres does not cast integer to bool).
--
-- 1) sync_services becomes ON by default. Services have shown in the till since sales#89 whenever
--    the services module was installed, without anyone looking at this flag. Now that it gets a
--    real reader, leaving it at 0 would switch off the service catalogue of EVERY salon on the
--    next update of the module. The flag exists so it can be turned OFF, not so somebody has to
--    remember to turn it on.
--
-- 2) The rows already saved are set to 1 for the same reason: until today the value produced no
--    observable effect, so a stored 0 expresses no decision by the business. Only the rows sitting
--    at 0 are touched, and only this column.
--
-- 3) auto_invoice_with_tax_id was born with DEFAULT 1 in the column and "false" in the form's
--    schema. The form wins -- it is what the business sees and saves, and it is what the till
--    already does when there is no row: a TICKET by default, with the automatic invoice by tax id
--    asked for. It is also what the market does. Square, Shopify POS, Toast and Lightspeed print a
--    receipt and the invoice is an explicit action, and Odoo makes you press Invoice.

ALTER TABLE sales_settings ALTER COLUMN sync_services SET DEFAULT 1;

UPDATE sales_settings SET sync_services = 1 WHERE sync_services = 0;

ALTER TABLE sales_settings ALTER COLUMN auto_invoice_with_tax_id SET DEFAULT 0;
