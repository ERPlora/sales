-- KPIs del historial de ventas (sales#27): para el RANGO que pide la pantalla (hoy por defecto),
-- no acumulados de toda la vida. `date_from`/`date_to` son opcionales e inclusivos (días ISO):
-- vacíos = sin límite por ese lado, que es lo que era esta query antes. `erp_date` es la función
-- portable del runtime (parte fecha de un texto ISO), la misma que usa `sales.by_staff`.
--
-- Cuenta lo COBRADO (`completed`); las anuladas van aparte (`voided_count`) — un cierre de día
-- necesita ver ambas y no mezclarlas. Impuesto y descuento salen de la cabecera de la venta
-- (`tax_amount`, `discount_amount`, céntimos).
--
-- THE BUSINESS DAY (sales#323). `created_at` is a UTC instant; its day is read on the business
-- clock — `:timezone`, the IANA zone the runtime binds in every declarative SQL (hub#1022,
-- `settings::timezone_of`) — never as its UTC date part, which filed everything charged between
-- local midnight and 02:00 (summer in Spain) under the previous day. Same idiom as invoice#78 and
-- `appointments`; the COALESCE degrades to UTC like the runtime does (`timezone_name()`), because
-- `AT TIME ZONE NULL` would silently drop every row.
SELECT COUNT(*) FILTER (WHERE status = 'completed')                    AS count,
       COALESCE(SUM(total)           FILTER (WHERE status = 'completed'), 0) AS total_revenue,
       COALESCE(AVG(total)           FILTER (WHERE status = 'completed'), 0) AS avg_ticket,
       COALESCE(SUM(tax_amount)      FILTER (WHERE status = 'completed'), 0) AS tax_total,
       COALESCE(SUM(subtotal)        FILTER (WHERE status = 'completed'), 0) AS net_total,
       COALESCE(SUM(discount_amount) FILTER (WHERE status = 'completed'), 0) AS discount_total,
       COUNT(*) FILTER (WHERE status = 'voided')                       AS voided_count
FROM sales_sale
WHERE hub_id = :hub_id AND is_deleted = 0
  AND (COALESCE(:date_from, '') = '' OR CAST(CAST(CAST(created_at AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) >= erp_date(:date_from))
  AND (COALESCE(:date_to,   '') = '' OR CAST(CAST(CAST(created_at AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) <= erp_date(:date_to));
