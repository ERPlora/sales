-- The business day right now (one row, `today` = ISO `YYYY-MM-DD`), sales#368. The history screen
-- anchors «Hoy» / «7 días» / «30 días» on it instead of on the DEVICE clock: since sales#323 every
-- door files a sale under the business day, so a tablet on the wrong zone (or the owner looking
-- from abroad) used to ask for a day the server does not count and «Hoy» came out empty.
--
-- `:now` and `:timezone` are bound by the runtime in every declarative SQL (§2.5/§2.9, hub#1022).
-- Same expression as `sales.today`, so the screen and the dashboard widget agree on the day; the
-- COALESCE degrades to UTC like the runtime does (`timezone_name()`).
SELECT CAST(CAST(CAST(CAST(:now AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) AS TEXT) AS today;
