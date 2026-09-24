-- Historial de ventas (sales.list). El motor de listas del hub envuelve esta query como tabla
-- derivada y añade el WHERE de cada filtro declarado (`sub.<col> <= :f_<col>_to`, ADR-0007).
--
-- `erp_date` (sales#125): la parte FECHA de `created_at`, como TEXTO ISO `YYYY-MM-DD` — el mismo
-- helper portable que ya usa `sales.stats` (`erp_date`), proyectado aquí para que el filtro de
-- rango compare DÍAS con DÍAS. Antes el rango se declaraba sobre `created_at` (TIMESTAMP en texto
-- ISO) y el motor comparaba la columna cruda: «hasta hoy» era `<= '2026-08-22'`, o sea hasta las
-- 00:00 de hoy, y «Hoy»/«7 días»/«30 días» salían siempre vacías mientras los KPIs de la misma
-- pantalla sí contaban el día en curso.
--
-- Es CAST a TEXT a propósito: el motor bindea el valor del filtro como texto y Postgres no tiene
-- `date <= text` — una proyección `date` haría ERROR en vez de filtrar. Días ISO en texto se
-- comparan lexicográficamente correctos, ambos extremos inclusivos. `created_at` (timestamp
-- completo) sigue viajando para ordenar y pintar la hora de cada venta.
--
-- `sale_seq` (sales#243): la clave de ORDEN de la columna «Nº». NO es el número de la venta y no
-- se pinta en ninguna parte — `sale_number` sigue siendo lo que se muestra, lo que se filtra y lo
-- que se busca. Es dato fiscal: se ordena por otra columna, jamás se reescribe.
--
-- Por qué hace falta. `sale_number` es TEXTO `YYYYMMDD-<secuencia>` y el ancho del relleno es un
-- MÍNIMO, no un techo (hub#1393, tras el fallo de sales#241): pasada la venta 9.999 del día la
-- secuencia mide 5 dígitos y el orden lexicográfico deja de coincidir con el numérico — la 10.000
-- caía entre la 1.000 y la 2.000. El motor de listas ordena por UNA columna
-- (`crates/runtime/src/queries.rs`), así que el orden compuesto (día, secuencia como número) tiene
-- que colapsar en una sola clave comparable, igual que `movement_seq` en
-- `services.packages.redemption_history`.
--
-- Cómo. Se conserva `YYYYMMDD-` tal cual (ancho fijo: como texto ya ordena por día) y delante de
-- la secuencia se antepone SU LONGITUD rellenada a dos dígitos. Comparar texto pasa a ser comparar
-- (día, nº de dígitos, secuencia), que es exactamente el orden numérico a CUALQUIER ancho:
--
--     20260901-0999    → 20260901-040999
--     20260901-10000   → 20260901-0510000
--     20260901-1000000 → 20260901-071000000
--
-- Se prefiere a rellenar la secuencia a un ancho grande porque eso sería volver a fijar un techo
-- —el mismo error que hub#1393 quitó del número— y habría que subirlo el día que se rebase. La
-- longitud va DETRÁS del día a propósito: delante, un día de números de 4 dígitos ordenaría antes
-- que uno de 5 y el historial se recolocaría por ancho en vez de por fecha.
--
-- `erp_pad` es la función-puente del subconjunto portable (ADR-0007) y su ancho es un suelo, así
-- que para longitudes de 0 a 99 devuelve exactamente dos caracteres. `substr`/`length` están en el
-- subconjunto portable y significan lo mismo en SQLite y en Postgres. Un `sale_number` que no
-- tuviera esta forma no rompe nada: da una clave estable igualmente, solo que sin significado.
-- `refunded_total` (sales#247): lo que YA ha vuelto de esta venta, en céntimos. No se pinta como
-- columna: es lo que la fila necesita para saber si la puerta de «Anular» sigue abierta. Una
-- devolución PARCIAL deja la venta `completed` (`_mark_refunded` solo marca con el último
-- céntimo), así que `status` por sí solo no distingue una venta intacta de una medio devuelta —
-- y sobre la segunda no se anula: se devuelve el resto (Square, Lightspeed, Dynamics 365 BC).
--
-- Va como subconsulta agrupada y no como JOIN directo contra `sales_sale_refund` a propósito: una
-- venta con dos devoluciones duplicaría su fila en el historial. `COALESCE` a 0 porque el LEFT
-- JOIN no encuentra nada en el caso normal, que es el de casi todas las ventas. Las devoluciones
-- ANULADAS (soft-delete) no cuentan, igual que en `sales.refund_options` y en el cinturón de
-- `sales._void_sale`: las tres puertas tienen que estar de acuerdo o la fila diría una cosa y el
-- servidor haría otra.
--
-- THE BUSINESS DAY (sales#323). `created_at` is a UTC instant; its day is read on the business
-- clock — `:timezone`, the IANA zone the runtime binds in every declarative SQL (hub#1022,
-- `settings::timezone_of`) — never as its UTC date part, which filed everything charged between
-- local midnight and 02:00 (summer in Spain) under the previous day. Same idiom as invoice#78 and
-- `appointments`; the COALESCE degrades to UTC like the runtime does (`timezone_name()`), because
-- `AT TIME ZONE NULL` would silently drop every row.
SELECT s.id, s.sale_number, s.status, s.total, s.tax_amount, s.payment_method_name,
       s.customer_name, s.channel, s.staff_id, s.created_at,
       CAST(CAST(CAST(CAST(s.created_at AS TEXT) AS timestamptz) AT TIME ZONE COALESCE(NULLIF(TRIM(CAST(:timezone AS TEXT)), ''), 'UTC') AS date) AS TEXT) AS erp_date,
       COALESCE(r.refunded_total, 0) AS refunded_total,
       substr(s.sale_number, 1, 9)
         || erp_pad(length(substr(s.sale_number, 10)), 2)
         || substr(s.sale_number, 10) AS sale_seq
FROM sales_sale s
LEFT JOIN (
        SELECT sale_id, SUM(total) AS refunded_total
        FROM sales_sale_refund
        WHERE hub_id = :hub_id AND is_deleted = 0
        GROUP BY sale_id
    ) r ON r.sale_id = s.id
WHERE s.hub_id = :hub_id AND s.is_deleted = 0
