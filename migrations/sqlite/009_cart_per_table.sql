-- 009_cart_per_table.sql — comanda por MESA (flujo de sala del POS, puntos 1+2).
-- ANTES: un único carrito activo por (hub_id, employee_id) → cambiar de mesa reusaba el mismo.
-- AHORA: la comanda se ata a la MESA (`table_id`) y se recupera al tocarla; el carrito de
-- mostrador (sin mesa) queda como `u:<employee_id>`. Se re-keya con `cart_key` = table_id o
-- 'u:'+employee_id, con índice único (hub_id, cart_key). Backfill: las filas existentes (carritos
-- sueltos) pasan a la clave 'u:'+employee_id, así el carrito en curso sobrevive a la migración.
ALTER TABLE sales_active_cart ADD COLUMN cart_key TEXT NOT NULL DEFAULT '';
UPDATE sales_active_cart SET cart_key = 'u:' || employee_id WHERE cart_key = '';
DROP INDEX IF EXISTS uq_active_cart;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_cart_key ON sales_active_cart (hub_id, cart_key);
