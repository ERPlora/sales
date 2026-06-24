-- Ventas de los últimos 7 días del hub: una fila por día con la fecha (parte día) y el importe
-- total vendido (ventas completadas). erp_date normaliza el texto ISO a la parte fecha portable.
-- La ventana se acota sumando 7 días a la fecha de la venta y exigiendo que alcance el día de hoy
-- (erp_dateadd con n POSITIVO → portable SQLite/Postgres, ADR-0007 §4a; evita el modificador
-- '+-7 days' inválido en SQLite). Días sin ventas no aparecen (no inventamos ceros: el widget
-- grafica solo los días con datos reales). Alimenta el widget "Ventas últimos 7 días" (chart bar).
-- hub_id y now los inyecta el runtime (§2.5/§2.9).
SELECT
    erp_date(created_at)    AS day,
    COALESCE(SUM(total), 0) AS total
FROM sales_sale
WHERE hub_id = :hub_id
  AND is_deleted = 0
  AND status = 'completed'
  AND erp_date(erp_dateadd(created_at, 7, 'days')) >= erp_date(:now)
GROUP BY erp_date(created_at)
ORDER BY day ASC;
