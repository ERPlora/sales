-- sales#71: DESCUENTO DE TICKET (%) de una cuenta ABIERTA. Lo pone el TPV; el cobro lo manda como
-- `discount_percent` de `sales.complete_sale` y el servidor lo prorratea por línea antes de extraer
-- el IVA (allow_discounts se comprueba allí, en el servidor). Solo sobre pedidos abiertos: una
-- venta cobrada ya no se descuenta (guard, ADR-0141). El total provisional NO cambia aquí: es la
-- suma de líneas (display); el descuento global se ve en el TPV y se aplica al cobrar.
UPDATE sales_order
SET discount_percent = :discount_percent,
    discount_amount = COALESCE(:discount_amount, discount_amount), -- sales#113 (céntimos)
    updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND status = 'open' AND is_deleted = 0;
