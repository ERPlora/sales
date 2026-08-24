-- sales#160 -- QUE se puede devolver de esta venta, pata a pata: el TOPE y la ELEGIBILIDAD.
--
-- Es la puerta de la que cuelga la issue entera, y la lee el mismo par que decide: la PANTALLA,
-- para proponer el reparto y pintar los motivos, y el HANDLER (`reads`), para aplicar el tope. Una
-- sola verdad: si la pantalla calculara el tope por su cuenta, el operador veria un numero y el
-- servidor otro.
--
-- DEVUELVE SIEMPRE UNA FILA POR PATA, tambien cuando no queda nada que devolver. Es deliberado y es
-- el mismo criterio que `services.packages.refund_check`: si la pata desapareciera de la lista al
-- agotarse, «no hay filas» y «no devolvible» serian indistinguibles, y la pantalla no tendria como
-- explicar por que falta.
--
-- LOS DOS CAMPOS NO SON EL MISMO. `remaining` es CUANTO dinero puede salir de esta pata; `refundable`
-- es si puede salir POR SU PROPIA PUERTA. Una tarjeta cuyo metodo se desactivo tiene `refundable = 0`
-- y `remaining = 5000`: el dinero sigue siendo devolvible, solo que el operador tiene que nombrar
-- otro destino. Colapsar los dos en un booleano es exactamente el bug de Square, que obliga al
-- tender original «even if the gift card does not exist or has been reused».
--
-- Motivos (`reason`), traducidos en el catalogo del modulo:
--   * ''                   -> se puede devolver por donde se cobro;
--   * 'already_refunded'   -> esta pata ya volvio entera;
--   * 'method_unavailable' -> el metodo con el que se cobro ya no esta activo en este hub.
--
-- Una devolucion ANULADA (soft-delete) no cuenta para el tope: el borrado logico existe para poder
-- corregir, y si siguiera restando, el dinero quedaria atrapado para siempre.
SELECT p.id                                              AS payment_id,
       p.sort_order,
       p.payment_method_id,
       p.payment_method_name,
       p.payment_method_type,
       p.amount                                          AS charged,
       COALESCE(r.refunded, 0)                           AS refunded,
       p.amount - COALESCE(r.refunded, 0)                AS remaining,
       CASE
           WHEN p.amount - COALESCE(r.refunded, 0) <= 0 THEN 0
           WHEN m.id IS NULL THEN 0
           ELSE 1
       END                                               AS refundable,
       CASE
           WHEN p.amount - COALESCE(r.refunded, 0) <= 0 THEN 'already_refunded'
           WHEN m.id IS NULL THEN 'method_unavailable'
           ELSE ''
       END                                               AS reason
FROM sales_sale_payment p
LEFT JOIN (
        SELECT payment_id, SUM(amount) AS refunded
        FROM sales_sale_refund_payment
        WHERE hub_id = :hub_id AND sale_id = :sale_id AND is_deleted = 0
        GROUP BY payment_id
    ) r ON r.payment_id = p.id
LEFT JOIN sales_payment_method m
       ON m.id = p.payment_method_id
      AND m.hub_id = p.hub_id
      AND m.is_deleted = 0
      AND m.is_active = 1
WHERE p.sale_id = :sale_id AND p.hub_id = :hub_id AND p.is_deleted = 0
ORDER BY p.sort_order ASC, p.created_at ASC
