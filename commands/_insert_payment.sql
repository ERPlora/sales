-- ADR-0386 -- inserta UNA pata del cobro. Interno: lo emite el handler WASM de `complete_sale`,
-- una operacion por pata, dentro de la MISMA transaccion que la cabecera y las lineas.
--
-- El runtime inyecta :hub_id, :current_user_id y :now (no spoofables). El handler aporta
-- :payment_id (de `context.new_ids`), :sale_id y los importes YA decididos por el servidor:
-- el nombre y el tipo salen del catalogo del hub, no del payload, y el `change_due` solo es
-- distinto de 0 en una pata de EFECTIVO (el cambio sale del cajon, no se prorratea).
--
-- Aqui no se calcula nada: si esta fila cuadra o no con el total es una decision que ya se tomo
-- arriba, donde estan todas las patas a la vez. Repartir esa comprobacion entre N INSERTs
-- independientes seria no comprobarla.
INSERT INTO sales_sale_payment (
    id, hub_id, sale_id, sort_order,
    payment_method_id, payment_method_name, payment_method_type,
    amount, amount_tendered, change_due, reference,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :payment_id, :hub_id, :sale_id, :sort_order,
    :payment_method_id, :payment_method_name, :payment_method_type,
    :amount, :amount_tendered, :change_due, :reference,
    0, :current_user_id, :current_user_id, :now, :now
);
