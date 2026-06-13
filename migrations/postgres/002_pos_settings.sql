-- Sales · esquema inicial (Postgres / Aurora cloud). Equivalente a
-- migrations/sqlite/002_pos_settings.sql — mismas tablas, índices, FK y contrato de fila del
-- hub (§2.5): hub_id + soft-delete + auditoría. Generado por paridad mecánica.
--
-- Tipos: subconjunto portable "ERPlora SQL" (ADR-0007):
--   * ids/refs → TEXT (UUIDs del runtime como texto);
--   * flags 0/1 → INTEGER (los commands bindean 0/1; Postgres no castea entero→bool);
--   * importes → NUMERIC;
--   * FECHAS → TEXT ISO-8601 (NO TIMESTAMPTZ): el motor de sync (ADR-0031) compara
--     updated_at como string lexicográfico; timestamptz rompería el LWW entre dialectos.

ALTER TABLE sales_settings ADD COLUMN pos_layout TEXT NOT NULL DEFAULT 'touch';
ALTER TABLE sales_settings ADD COLUMN default_document_format TEXT NOT NULL DEFAULT 'ticket';
ALTER TABLE sales_settings ADD COLUMN auto_invoice_with_tax_id INTEGER NOT NULL DEFAULT 1;