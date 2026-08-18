-- sales#113: descuento de IMPORTE FIJO al ticket («5 € menos»), en céntimos, persistido con la
-- cuenta ABIERTA como el porcentual (021): el carrito se reconstruye desde las filas al retomar.
-- El reparto por línea (resto mayor, ADR-0210) lo hace el servidor al cobrar (`complete_sale`
-- `discount_amount`); aquí solo se recuerda. Aditiva, DEFAULT 0.
ALTER TABLE sales_order ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
