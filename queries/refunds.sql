-- sales#160 -- las devoluciones de UNA venta, de la mas reciente a la mas antigua.
--
-- Sin esta puerta el documento seria de solo escritura: la pantalla de la venta y su reimpresion
-- necesitan contar que ya volvieron 15,00 EUR el martes -- el mismo agujero que sales#148 destapo
-- con los suplementos. Las patas de cada documento se leen con `sales.refund_options`, que ademas
-- es lo que hace falta para decidir.
SELECT id, sale_id, total, reason, note, created_by, created_at
FROM sales_sale_refund
WHERE sale_id = :sale_id AND hub_id = :hub_id AND is_deleted = 0
ORDER BY created_at DESC, id DESC
