-- sales#160 -- la venta pasa a `refunded` cuando vuelve el ULTIMO centimo. Interno: el handler solo
-- lo emite cuando lo ya devuelto mas esta devolucion alcanzan el total de la venta.
--
-- Sin esta marca la lista de ventas seguiria diciendo `completed` sobre una venta que ya no tiene
-- dinero detras, y el historico mentiria en la unica pantalla que el dueno mira a diario. El estado
-- `refunded` ya estaba previsto en la migracion 001 y `erp-sales-list` ya sabe pintarlo.
--
-- El original NO se toca por lo demas: la venta es inmutable (`records.sale`), asi que ni importes
-- ni lineas se reescriben. Solo cambia el estado, y con el la puerta: `refund_sale_pure` exige
-- `completed`, de modo que una venta ya devuelta entera no admite una segunda devolucion.
--
-- Filtra `status = 'completed'` ademas del id: si dos devoluciones concurrentes llegaran a esta
-- linea, la segunda actualiza 0 filas en vez de reescribir el estado -- y `hub_id` va SIEMPRE, para
-- que un id compartido con otro hub no pise la venta del vecino.
UPDATE sales_sale
SET status = 'refunded',
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :sale_id
  AND hub_id = :hub_id
  AND status = 'completed'
  AND is_deleted = 0;
