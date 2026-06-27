-- Sales · 006 — ADR-0085: snapshot fiscal INMUTABLE en la línea de venta. La resolución del IVA
-- pasa de un `tax_rate_id` (ADR-0066) a la CATEGORÍA fiscal resuelta server-side por
-- (país+región del hub + categoría). Congelamos en la línea los 5 campos del snapshot para que
-- una venta/factura ya emitida NO cambie aunque cambie la regla. `tax_rate` (ya existente) ES el
-- tax_rate_pct combinado; añadimos los otros 4. Migración ADITIVA (append-only).
ALTER TABLE sales_sale_item ADD COLUMN tax_category_key TEXT;
ALTER TABLE sales_sale_item ADD COLUMN tax_country_code TEXT;
ALTER TABLE sales_sale_item ADD COLUMN tax_region_code  TEXT;
ALTER TABLE sales_sale_item ADD COLUMN tax_rule_id       TEXT;
