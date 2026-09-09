-- Desglose de ventas por profesional para el cierre del día (o cualquier rango). Agrega las ventas
-- COMPLETADAS atribuidas a un profesional entre `:date_from` y `:date_to` (ambos inclusive,
-- comparados por la parte fecha con el helper portable `erp_date`, ADR-0007 §4a → SQLite/Postgres).
-- Importes en céntimos (ADR-0007). hub_id lo inyecta el runtime.
--
-- sales#273 — LA ATRIBUCIÓN ES DE LA LÍNEA, NO DEL TICKET. Hasta aquí esto agregaba
-- `FROM sales_sale GROUP BY staff_id`, o sea el ticket entero a una sola persona. En una
-- peluquería ese es el caso NORMAL y no el raro: Ana corta, Marta tiñe y la clienta paga UNA vez,
-- así que el cierre por profesional no podía cuadrar y la comisión que se calcula encima tampoco.
--
-- `COALESCE(i.staff_id, s.staff_id)` es la compatibilidad, y no es cosmética: toda línea escrita
-- antes de la migración 034 tiene `staff_id` NULL, y sin la caída a la cabecera el cierre de ayer
-- se vaciaría. Una línea sin atribución por ninguno de los dos lados sigue siendo INVISIBLE (no
-- hay cubo «desconocido»), que es lo que decidió sales#179 y esto no ensancha.
--
-- 🔴 EL SEGUNDO BRAZO DEL `UNION ALL` NO ES DEFENSA VACÍA: es dinero. Una venta SIN líneas
-- desaparecería de un `JOIN` a secas, y con ella su importe, dejando un cierre que no cuadra y
-- ninguna señal de por qué. Se atribuye entonces por la cabecera con sus propios totales, que es
-- exactamente lo que este informe hacía antes de sales#273. `NOT EXISTS` mantiene los dos brazos
-- disjuntos, así que ninguna venta se cuenta dos veces.
--
-- LAS CIFRAS CUADRAN CON EL TICKET, y no por casualidad: sales#113 reparte el descuento global
-- entre las líneas antes de guardarlas, así que `sale.total` ES la suma de `line_total` y
-- `sale.subtotal` ES la suma de `net_amount`. Partir el informe por línea suma exactamente lo que
-- se cobró: ningún descuento se evapora ni se cuenta dos veces.
--
-- `tax_total` sale de la RESTA (bruto − base) y no de `SUM(tax_amount)`, para que cada fila cumpla
-- bruto = base + impuesto sin un céntimo de deriva. Ojo: la cuota DECLARADA de la venta se calcula
-- una vez por tipo sobre la base agregada (ADR-0123 §4), así que esta columna es la cifra
-- INFORMATIVA de las líneas y puede separarse de `sales_sale.tax_amount` en algún céntimo. Para
-- los libros manda la cabecera; esto es un reparto de caja por persona.
--
-- `sales_count` cuenta TICKETS (`COUNT(DISTINCT ...)`), no líneas: dos líneas de la misma
-- profesional en un ticket es UNA venta suya. Contar líneas inflaría todo ticket medio del cierre.
--
-- Es DATOS DE SALES SOLAMENTE: NO conoce `staff_member.commission_rate` (vive en el módulo staff;
-- prohibido el JOIN cross-módulo). El cálculo de comisión = gross_total × (commission_rate/100)
-- lo compone el llamador (cierre del día) cruzando estas filas con `staff.commissions.summary`
-- por `staff_id` (seam documentado en architecture/modules/sales.md y staff.md).
--
-- Subconsulta en el FROM y no un CTE a propósito: el runtime puede envolver esta consulta, y un
-- `WITH` inicial no sobrevive a `SELECT * FROM (<sql>)`.
SELECT
    staff_id,
    COUNT(DISTINCT sale_id)                                  AS sales_count,
    COALESCE(SUM(gross), 0)                                  AS gross_total,  -- céntimos: cobrado
    COALESCE(SUM(net), 0)                                    AS net_total,    -- céntimos: base
    COALESCE(SUM(gross), 0) - COALESCE(SUM(net), 0)          AS tax_total     -- céntimos: bruto−base
FROM (
    -- La atribución NORMAL: una fila por línea, a quien la hizo (y si no lo dice, a la cabecera).
    SELECT COALESCE(i.staff_id, s.staff_id) AS staff_id,
           s.id                             AS sale_id,
           i.line_total                     AS gross,
           i.net_amount                     AS net
    FROM sales_sale s
    -- `i.hub_id = s.hub_id`: la línea lleva su propio `hub_id` y el JOIN tiene que exigirlo. Sin
    -- eso una línea de OTRO hub casaría por `sale_id` y su dinero entraría en este cierre.
    JOIN sales_sale_item i ON i.sale_id = s.id AND i.hub_id = s.hub_id
    WHERE s.hub_id = :hub_id
      AND s.is_deleted = 0
      AND s.status = 'completed'
      AND erp_date(s.created_at) >= erp_date(:date_from)
      AND erp_date(s.created_at) <= erp_date(:date_to)

    UNION ALL

    -- Y la venta que no tiene ni una línea, por la cabecera y con sus propios totales.
    SELECT s.staff_id, s.id, s.total, s.subtotal
    FROM sales_sale s
    WHERE s.hub_id = :hub_id
      AND s.is_deleted = 0
      AND s.status = 'completed'
      AND erp_date(s.created_at) >= erp_date(:date_from)
      AND erp_date(s.created_at) <= erp_date(:date_to)
      AND NOT EXISTS (
            SELECT 1 FROM sales_sale_item i2
            WHERE i2.sale_id = s.id AND i2.hub_id = s.hub_id
      )
) attributed
WHERE staff_id IS NOT NULL
GROUP BY staff_id
ORDER BY gross_total DESC;
