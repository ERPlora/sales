-- sales#160 -- la CABECERA del documento de devolucion. Interno: lo emite el handler WASM de
-- `sales.refund`, dentro de la MISMA transaccion que sus patas.
--
-- El runtime inyecta :hub_id, :current_user_id y :now (no spoofables). El handler aporta
-- :refund_id (de `context.new_ids`, y ES la referencia que viaja como `refund_ref`) y el :total,
-- que ya cuadra con la suma de las patas porque esa comprobacion se hizo arriba, donde estan todas
-- a la vez. Repartirla entre N INSERT independientes seria no comprobarla.
INSERT INTO sales_sale_refund (
    id, hub_id, sale_id, total, reason, note, idempotency_key,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :refund_id, :hub_id, :sale_id, :total, :reason, :note, :idempotency_key,
    0, :current_user_id, :current_user_id, :now, :now
);
