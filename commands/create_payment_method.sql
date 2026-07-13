-- Guardarraíl QA 2026-06-27 (rama feat): el binder del runtime pasa NULL para los opcionales
-- omitidos (sin schema en la mutadora) y NO aplica los DEFAULT de columna → el alta petaba con
-- NOT NULL en type/icon/sort_order/requires_change/opens_cash_drawer. COALESCE re-aplica los
-- defaults de schema/columna por-parámetro (arreglo real = binder del runtime, columna del humano).
INSERT INTO sales_payment_method
  (id, hub_id, name, type, icon, is_active, sort_order, opens_cash_drawer, requires_change,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :name,
   COALESCE(:type, 'cash'), COALESCE(:icon, ''), 1, COALESCE(:sort_order, 0),
   COALESCE(:opens_cash_drawer, 0), COALESCE(:requires_change, 0),
   0, :current_user_id, :current_user_id, :now, :now);
