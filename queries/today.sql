-- Today's metrics for the hub (one row): amount sold and number of completed tickets on the
-- business day that contains :now. Feeds the dashboard widgets "Sales today" and "Tickets today"
-- (kpi). hub_id, now and timezone are injected by the runtime (§2.5/§2.9, hub#1022).
--
-- THE BUSINESS DAY (sales#323). `created_at` is a UTC instant; its day is read on the business
-- clock — `:timezone`, the IANA zone the runtime binds in every declarative SQL (hub#1022,
-- `settings::timezone_of`) — never as its UTC date part, which filed everything charged between
-- local midnight and 02:00 (summer in Spain) under the previous day. Same idiom as invoice#78 and
-- `appointments`; the COALESCE degrades to UTC like the runtime does (`timezone_name()`), because
-- `AT TIME ZONE NULL` would silently drop every row.
SELECT
    COALESCE(SUM(total), 0) AS total,
    COUNT(*)                AS tickets
FROM sales_sale
WHERE hub_id = :hub_id
  AND is_deleted = 0
  AND status = 'completed'
  AND CAST(CAST(CAST(created_at AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) = CAST(CAST(CAST(:now AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date);
