-- Sales of the hub's last 7 days: exactly one row per BUSINESS day, from today − 6 to today, oldest
-- first, with the total sold that day (completed, live sales) — 0 on a day without sales (sales#472).
-- A day at 0 is not an invented figure: it is that day's real total, and without it the chart drew
-- the days with sales side by side and hid the gaps. Feeds the "Sales last 7 days" widget (chart
-- bar). hub_id, now and timezone are injected by the runtime (§2.5/§2.9, hub#1022).
--
-- THE WINDOW is the seven days themselves, not a lower bound on the sales: the days are generated
-- from «today» with a VALUES list of offsets (portable, no `generate_series`, ADR-0007) and the sales
-- are joined to them on the LEFT, so a day with no rows keeps its row and one stamped outside the
-- seven days (before, or tomorrow from a device whose clock runs ahead) never adds a bar.
--
-- THE BUSINESS DAY (sales#323). `created_at` is a UTC instant; its day is read on the business
-- clock — `:timezone`, the IANA zone the runtime binds in every declarative SQL (hub#1022,
-- `settings::timezone_of`) — never as its UTC date part, which filed everything charged between
-- local midnight and 02:00 (summer in Spain) under the previous day. «Today» is `:now` on that same
-- clock. Same idiom as invoice#78 and `appointments`; the COALESCE degrades to UTC like the runtime
-- does (`timezone_name()`), because `AT TIME ZONE NULL` would silently drop every row.
-- Each day is computed once in its own SELECT and grouped by name: repeating the expression in the
-- GROUP BY would bind `:timezone` twice, and Postgres cannot match two parameters as one expression.
WITH today AS (
    SELECT CAST(CAST(CAST(:now AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) AS day
),
days AS (
    SELECT erp_date(erp_dateadd(today.day, o.n, 'days')) AS day
    FROM today
    CROSS JOIN (VALUES (-6), (-5), (-4), (-3), (-2), (-1), (0)) AS o(n)
),
sold AS (
    SELECT CAST(CAST(CAST(created_at AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) AS day, total
    FROM sales_sale
    WHERE hub_id = :hub_id
      AND is_deleted = 0
      AND status = 'completed'
)
SELECT
    days.day,
    COALESCE(SUM(sold.total), 0) AS total
FROM days
LEFT JOIN sold ON sold.day = days.day
GROUP BY days.day
ORDER BY days.day ASC;
