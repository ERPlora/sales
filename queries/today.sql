-- Métricas de HOY del hub (una fila). Importe vendido y nº de tickets de ventas completadas
-- cuya fecha (parte día, sin hora) coincide con la de :now. erp_date normaliza el texto ISO a la
-- parte fecha de forma portable (SQLite/Postgres, ADR-0007 §4a). Alimenta los widgets de dashboard
-- "Ventas hoy" (kpi) y "Tickets hoy" (kpi). hub_id y now los inyecta el runtime (§2.5/§2.9).
SELECT
    COALESCE(SUM(total), 0) AS total,
    COUNT(*)                AS tickets
FROM sales_sale
WHERE hub_id = :hub_id
  AND is_deleted = 0
  AND status = 'completed'
  AND erp_date(created_at) = erp_date(:now);
