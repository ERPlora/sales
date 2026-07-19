-- Seed canónico de FORMAS DE PAGO del TPV (rediseño 2026-07-19). DML IDEMPOTENTE por hub: el
-- instalador lo aplica tras migrar con :hub_id/:now/:current_user_id inyectados. Re-ejecutable
-- sin duplicar (WHERE NOT EXISTS por la clave natural (hub_id, type) — si el dueño ya creó o
-- renombró un método de ese tipo, se respeta el suyo). Mismo SQL en SQLite y Postgres.
--
-- Sin este seed la tabla nacía VACÍA: el TPV no ofrecía NINGÚN método y el cobro caía a un
-- efectivo implícito — «no hay pago con tarjeta». Efectivo y tarjeta son el mínimo universal
-- (tienda, peluquería, restaurante); Bizum/vales los crea el dueño desde Ajustes.
--
-- Nombres en inglés canónico (ADR-0055, patrón del seed de unidades de inventory): la UI los
-- muestra TRADUCIDOS mientras conserven el nombre de fábrica (payMethodDisplayName); renombrados,
-- manda el texto del dueño. `requires_change` decide el flujo de cobro (1 = pide entregado y
-- calcula cambio; 0 = importe exacto, datáfono) — es dato, no hardcode (needsTendered).

INSERT INTO sales_payment_method (id, hub_id, name, type, icon, is_active, sort_order, opens_cash_drawer, requires_change, is_deleted, created_by, updated_by, created_at, updated_at)
SELECT (:hub_id || '|paymethod|cash'), :hub_id, 'Cash', 'cash', '', 1, 10, 1, 1, 0, :current_user_id, :current_user_id, :now, :now
WHERE NOT EXISTS (SELECT 1 FROM sales_payment_method WHERE hub_id = :hub_id AND type = 'cash' AND is_deleted = 0);

INSERT INTO sales_payment_method (id, hub_id, name, type, icon, is_active, sort_order, opens_cash_drawer, requires_change, is_deleted, created_by, updated_by, created_at, updated_at)
SELECT (:hub_id || '|paymethod|card'), :hub_id, 'Card', 'card', '', 1, 20, 0, 0, 0, :current_user_id, :current_user_id, :now, :now
WHERE NOT EXISTS (SELECT 1 FROM sales_payment_method WHERE hub_id = :hub_id AND type = 'card' AND is_deleted = 0);
