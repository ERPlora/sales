-- ADR-0141: inserta una línea del pedido (materialización temprana). Intención del handler WASM
-- `open_order`. `line_total` es PROVISIONAL (display); la cuota fiscal se congela al cobrar.
-- `tax_category_key`/`cost` viajan porque el COBRO los necesita y no se re-derivan tras recargar
-- (la categoría es la autoridad del IVA en servidor, ADR-0085; el coste alimenta el arqueo de
-- invitaciones).
INSERT INTO sales_order_item (
    id, hub_id, order_id, product_id, product_name, product_sku,
    quantity, unit_price, is_gift, gift_reason, line_total, tax_category_key, cost,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :id, :hub_id, :order_id, :product_id, :product_name, :product_sku,
    :quantity, :unit_price, :is_gift, COALESCE(:gift_reason, ''), :line_total,
    COALESCE(:tax_category_key, ''), COALESCE(:cost, 0),
    0, :current_user_id, :current_user_id, :now, :now
);
