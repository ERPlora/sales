-- Fija el tipo de documento de una venta ('ticket' | 'invoice'). Lo usa el POS como override
-- tras cobrar (Tier 0, sin tocar el handler WASM). Binds: :sale_id, :document_type (+ inyectados).
UPDATE sales_sale
SET document_type = :document_type,
    updated_by    = :current_user_id,
    updated_at    = :now
WHERE id = :sale_id AND hub_id = :hub_id AND is_deleted = 0;
