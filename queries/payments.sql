-- Las patas del cobro de UNA venta (ADR-0386), en el orden en que se tomaron.
--
-- Sin esta puerta la tabla hija seria de solo escritura: el tique, su reimpresion y la pantalla
-- de la venta leen por aqui, asi que un cobro mixto quedaria guardado y sin forma de contarlo
-- -- el mismo agujero que sales#148 destapo con los suplementos.
--
-- `amount` es lo que cubrio la pata; `amount_tendered - change_due` es lo que se quedo (solo
-- difieren en efectivo). El arqueo filtra por `payment_method_type = 'cash'`, nunca por el
-- nombre localizado (hub#778).
SELECT id, sale_id, sort_order,
       payment_method_id, payment_method_name, payment_method_type,
       amount, amount_tendered, change_due, reference
FROM sales_sale_payment
WHERE sale_id = :sale_id AND hub_id = :hub_id AND is_deleted = 0
ORDER BY sort_order ASC, created_at ASC;
