-- sales#160 -- inserta UNA pata de la devolucion: de que pata del cobro sale el dinero
-- (:payment_id) y por que metodo vuelve (:payment_method_*). Interno, uno por pata.
--
-- Los dos ejes van en la misma fila a proposito. El de origen manda sobre el TOPE (no se devuelve
-- por una pata mas de lo que cobro), el de destino manda sobre la CAJA (solo `cash` toca el cajon).
-- Guardar solo uno de los dos obligaria a adivinar el otro: es el bug de Odoo, que al devolver por
-- un metodo distinto acaba con el metodo al debe y al haber en el mismo asiento.
--
-- Aqui no se decide nada: el nombre y el tipo salen del catalogo del hub resueltos por el handler,
-- no de la etiqueta que mando el navegador (mismo criterio que el cobro, sales#20).
INSERT INTO sales_sale_refund_payment (
    id, hub_id, refund_id, sale_id, payment_id,
    payment_method_id, payment_method_name, payment_method_type,
    amount, sort_order,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :refund_payment_id, :hub_id, :refund_id, :sale_id, :payment_id,
    :payment_method_id, :payment_method_name, :payment_method_type,
    :amount, :sort_order,
    0, :current_user_id, :current_user_id, :now, :now
);
