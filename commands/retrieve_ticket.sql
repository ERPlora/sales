-- Marca un ticket aparcado como recuperado (soft-delete §2.5, no se borra físicamente).
-- La UI ya tiene cart_data de la query sales.parked_tickets: recupera las líneas al carrito
-- y este command retira el ticket de la lista para que no se recupere dos veces.
UPDATE sales_parked_ticket
SET is_deleted = 1,
    deleted_at = :now,
    updated_by = :current_user_id,
    updated_at = :now
WHERE id = :ticket_id AND hub_id = :hub_id AND is_deleted = 0;
