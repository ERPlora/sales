-- Sales · sales#269: the shop decides how big a discount whoever is charging may give ALONE.
--
-- Until today the only lever was `allow_discounts`, a yes/no: either everybody could take 100 %
-- off a ticket with nobody authorising it, or nobody could discount at all. Every till in the
-- market (Toast, Square, Lightspeed) draws the line with a threshold instead: up to X the cashier
-- decides, above X the manager approves.
--
-- Types: portable "ERPlora SQL" subset (ADR-0007) — a percentage is an INTEGER, 0-100.
--
-- 🔴 DEFAULT 100 and NOT NULL on purpose: 100 means «no cap», so a shop that updates keeps
-- behaving exactly as it did and nobody starts being asked for a PIN they never configured. The
-- control is opted IN, never switched on underneath a business. The same 100 is the default of
-- `schemas/settings_update.json` and of `POS_SETTINGS_DEFAULTS`, and `settings-defaults-contract`
-- pins the three together.
ALTER TABLE sales_settings
  ADD COLUMN IF NOT EXISTS max_discount_percent INTEGER NOT NULL DEFAULT 100;
