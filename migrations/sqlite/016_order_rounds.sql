-- TANDAS del pedido de restaurante (decisión Ioan 2026-07-19). La pertenencia vive en la LÍNEA:
-- `round_no` = ronda a la que se envió (0 = aún sin enviar, la ronda EN CURSO editable) y
-- `fired_at` = cuándo salió a cocina (NULL = pendiente). Disparar marca SOLO lo pendiente — eso
-- mata el bug de reenviar el carrito entero en cada fire (comida duplicada). `kitchen` sigue
-- numerando sus rondas (ADR-0144): este número es la vista LOCAL del pedido.
ALTER TABLE sales_order_item ADD COLUMN round_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_order_item ADD COLUMN fired_at TEXT;
-- Modo restaurante del TPV: activa el segment Pedido/Tandas del carrito. Solo UI: sin él, el TPV
-- de tienda/peluquería sigue plano (flag por hub, patrón Odoo «Is a Bar/Restaurant»).
ALTER TABLE sales_settings ADD COLUMN restaurant_mode INTEGER NOT NULL DEFAULT 0;
