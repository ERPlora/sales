-- ADR-0141: inserta la cabecera de un pedido MUTABLE (status='open'). Intención emitida por el
-- handler WASM `open_order`. hub_id/created_by/updated_by/created_at se inyectan desde el contexto
-- (:hub_id, :current_user_id, :now), igual que `_insert_sale`. NO lleva `table_id`: `sales` es
-- agnóstico de la mesa Y del cliente: esas asociaciones las OWNean `tables` y `customers` en sus
-- junctions. `provisional_total` NO es fiscal.
INSERT INTO sales_order (
    id, hub_id, status, provisional_total, notes, label, source_module,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :id, :hub_id, :status, :provisional_total, :notes, :label, :source_module,
    0, :current_user_id, :current_user_id, :now, :now
);
