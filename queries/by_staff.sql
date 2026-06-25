-- Desglose de ventas por profesional para el cierre del día (o cualquier rango). Agrega las
-- ventas COMPLETADAS atribuidas a un profesional (`staff_id` no nulo) entre `:date_from` y
-- `:date_to` (ambos inclusive, comparados por la parte fecha con el helper portable `erp_date`,
-- ADR-0007 §4a → SQLite/Postgres). Importes en céntimos (ADR-0007). hub_id lo inyecta el runtime.
--
-- Es DATOS DE SALES SOLAMENTE: NO conoce `staff_member.commission_rate` (vive en el módulo staff;
-- prohibido el JOIN cross-módulo). El cálculo de comisión = gross_total × (commission_rate/100)
-- lo compone el llamador (cierre del día) cruzando estas filas con `staff.commissions.summary`
-- por `staff_id` (seam documentado en architecture/modules/sales.md y staff.md).
SELECT
    staff_id,
    COUNT(*)                AS sales_count,
    COALESCE(SUM(total),    0) AS gross_total,   -- céntimos: total cobrado (con descuentos)
    COALESCE(SUM(subtotal), 0) AS net_total,     -- céntimos: base imponible
    COALESCE(SUM(tax_amount), 0) AS tax_total    -- céntimos: IVA
FROM sales_sale
WHERE hub_id = :hub_id
  AND is_deleted = 0
  AND status = 'completed'
  AND staff_id IS NOT NULL
  AND erp_date(created_at) >= erp_date(:date_from)
  AND erp_date(created_at) <= erp_date(:date_to)
GROUP BY staff_id
ORDER BY gross_total DESC;
