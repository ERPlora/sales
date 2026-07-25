-- ADR-0141 Gate 4: marca un pedido como COMPLETADO (open → completed) al cobrarlo. Intención
-- emitida por el handler WASM `complete_sale` en el cobro FINAL (no en un split parcial). Guard:
-- solo si sigue abierto (idempotente / no re-completa). Corre en la MISMA transacción que la venta.
UPDATE sales_order
SET status = 'completed', updated_by = :current_user_id, updated_at = :now
WHERE id = :order_id AND hub_id = :hub_id AND status = 'open' AND is_deleted = 0;
