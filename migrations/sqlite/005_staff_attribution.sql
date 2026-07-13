-- Atribución por profesional + traza cita→venta. Columnas aditivas y NULLables (no rompen
-- ventas existentes; SQLite las rellena a NULL en filas previas).
--
-- * `staff_id`     — profesional (staff_member) que ATENDIÓ/ejecutó la venta. Distinto de
--                    `employee_id` (= usuario logueado / cajero, :current_user_id). En un salón
--                    la recepcionista (employee_id) cobra el servicio del estilista (staff_id).
--                    Referencia OPACA al id de staff.* (sin FK cross-módulo, igual que order_id);
--                    se resuelve por la query pública de staff. NULL si la venta no se atribuye.
-- * `appointment_id` — traza de la cita de origen cuando la venta nace de una cita
--                    (`sales.create_from_appointment`). Referencia opaca a appointments.*; NULL
--                    para ventas de TPV normales. El handler la emite en
--                    `sales.sale.created_from_appointment` para que appointments marque la cita
--                    convertida (sales NO edita appointments — ver architecture/modules/sales.md).
ALTER TABLE sales_sale ADD COLUMN staff_id TEXT;
ALTER TABLE sales_sale ADD COLUMN appointment_id TEXT;

-- Índice para el desglose/comisión por profesional (sales.by_staff agrupa por staff_id).
CREATE INDEX IF NOT EXISTS ix_sale_hub_staff ON sales_sale (hub_id, staff_id);
