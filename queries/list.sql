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
SELECT id, sale_number, status, total, tax_amount, payment_method_name,
       customer_name, channel, staff_id, created_at,
       CAST(erp_date(created_at) AS TEXT) AS erp_date
FROM sales_sale
WHERE hub_id = :hub_id AND is_deleted = 0
