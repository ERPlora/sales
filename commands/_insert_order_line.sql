-- ADR-0141: inserta una línea del pedido (materialización temprana). Intención del handler WASM
-- `open_order`. `line_total` es PROVISIONAL (display); la cuota fiscal se congela al cobrar.
INSERT INTO sales_order_item (
    id, hub_id, order_id, product_id, product_name, product_sku,
    quantity, unit_price, is_gift, line_total,
    is_deleted, created_by, updated_by, created_at, updated_at
) VALUES (
    :id, :hub_id, :order_id, :product_id, :product_name, :product_sku,
    :quantity, :unit_price, :is_gift, :line_total,
    0, :current_user_id, :current_user_id, :now, :now
);
