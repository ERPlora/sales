-- Sales of the hub's last 7 days: one row per BUSINESS day with the total sold (completed sales).
-- The window is bounded by adding 7 days to the sale's day and requiring it to reach today
-- (erp_dateadd with a POSITIVE n, ADR-0007 §4a). Days without sales do not appear (no invented
-- zeros: the widget plots only days with real data). Feeds the "Sales last 7 days" widget (chart
-- bar). hub_id, now and timezone are injected by the runtime (§2.5/§2.9, hub#1022).
--
-- THE BUSINESS DAY (sales#323). `created_at` is a UTC instant; its day is read on the business
-- clock — `:timezone`, the IANA zone the runtime binds in every declarative SQL (hub#1022,
-- `settings::timezone_of`) — never as its UTC date part, which filed everything charged between
-- local midnight and 02:00 (summer in Spain) under the previous day. Same idiom as invoice#78 and
-- `appointments`; the COALESCE degrades to UTC like the runtime does (`timezone_name()`), because
-- `AT TIME ZONE NULL` would silently drop every row.
-- The day is computed once in the inner SELECT and grouped by name: repeating the expression in the
-- GROUP BY would bind `:timezone` twice, and Postgres cannot match two parameters as one expression.
SELECT
    day,
    COALESCE(SUM(total), 0) AS total
FROM (
    SELECT CAST(CAST(CAST(created_at AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) AS day, total
    FROM sales_sale
    WHERE hub_id = :hub_id
      AND is_deleted = 0
      AND status = 'completed'
) d
WHERE erp_date(erp_dateadd(day, 7, 'days')) >= CAST(CAST(CAST(:now AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date)
GROUP BY day
ORDER BY day ASC;
