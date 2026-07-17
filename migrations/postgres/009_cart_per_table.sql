-- 009_cart_per_table.sql — comanda por MESA (paridad Postgres de la migración sqlite).
-- Re-keya sales_active_cart de (hub_id, employee_id) a (hub_id, cart_key), donde cart_key =
-- table_id o 'u:'+employee_id (carrito de mostrador). Backfill de las filas existentes.
ALTER TABLE sales_active_cart ADD COLUMN IF NOT EXISTS cart_key TEXT NOT NULL DEFAULT '';
UPDATE sales_active_cart SET cart_key = 'u:' || employee_id WHERE cart_key = '';
DROP INDEX IF EXISTS uq_active_cart;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_cart_key ON sales_active_cart (hub_id, cart_key);
