-- Sales · atribución por profesional + traza cita→venta (Postgres / Aurora cloud).
-- Equivalente a migrations/sqlite/005_staff_attribution.sql — columnas aditivas y NULLables.
-- Referencias OPACAS a staff.*/appointments.* (TEXT, sin FK cross-módulo, ADR-0007).
ALTER TABLE sales_sale ADD COLUMN staff_id TEXT;
ALTER TABLE sales_sale ADD COLUMN appointment_id TEXT;

CREATE INDEX IF NOT EXISTS ix_sale_hub_staff ON sales_sale (hub_id, staff_id);
