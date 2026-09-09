-- ADR-0141: inserta una línea del pedido (materialización temprana). Intención del handler WASM
-- `open_order`. `line_total` es PROVISIONAL (display); la cuota fiscal se congela al cobrar.
-- `tax_category_key`/`cost` viajan porque el COBRO los necesita y no se re-derivan tras recargar
-- (la categoría es la autoridad del IVA en servidor, ADR-0085; el coste alimenta el arqueo de
-- invitaciones).
-- ADR-0147: `quantity` en punto fijo 10⁶ + contexto de unidades CONGELADO (§2.4).
-- sales#12: `category_id` (opaco, NULL = sin clasificar) es el snapshot que enruta la comanda.
-- sales#273: `staff_id` = QUIÉN hace ESTA línea. El TPV reconstruye el carrito desde esta tabla
-- (ADR-0141), así que si el profesional no se escribe AQUÍ se pierde al recargar, al retomar la
-- cuenta y tras cada disparo a cocina — y la venta cae entera sobre el de la cabecera. Opaco a
-- `staff` (nunca se hace JOIN); NULL = nadie nombrado, que es lo que `sales.by_staff` hace caer a
-- la cabecera. El handler es quien normaliza el vacío a NULL (`order_line_row`).
-- sales#169: `combo`/`combo_group_ref` congelan la COMPOSICIÓN del menú (fila de trabajo, sin
-- dinero): el precio cerrado y el reparto los decide el COBRO contra `combos.options.all`.
INSERT INTO sales_order_item (
    id, hub_id, order_id, product_id, product_name, product_sku,
    quantity, unit_price, is_gift, gift_reason, line_total, tax_category_key, cost, is_service,
    category_id, discount_percent, modifiers, notes, combo_group_ref, combo, staff_id,
    is_deleted, created_by, updated_by, created_at, updated_at,
    unit_code, unit_name, factor_num, factor_den, increment_value,
    price_quantity_value, pricing_unit_code, pricing_unit_name,
    pricing_factor_num, pricing_factor_den
) VALUES (
    :id, :hub_id, :order_id, :product_id, :product_name, :product_sku,
    :quantity, :unit_price, :is_gift, COALESCE(:gift_reason, ''), :line_total,
    COALESCE(:tax_category_key, ''), COALESCE(:cost, 0), COALESCE(:is_service, 0),
    :category_id, COALESCE(:discount_percent, 0), COALESCE(:modifiers, '[]'),
    -- sales#156: the waiter's free-text note. Verbatim: it is production text for the cook, and
    -- `sales` interprets none of it. NULL/absent = '', so a caller that never heard of the column
    -- writes the same row it wrote yesterday.
    COALESCE(:notes, ''),
    -- sales#169: de qué MENÚ viene la línea y qué se eligió, en su orden. NULL/'{}' = no es un
    -- combo, que es lo que son casi todas las líneas. El grupo lo minta el handler, no el payload.
    :combo_group_ref, COALESCE(:combo, '{}'), :staff_id,
    0, :current_user_id, :current_user_id, :now, :now,
    :unit_code, :unit_name, :factor_num, :factor_den, :increment_value,
    :price_quantity_value, :pricing_unit_code, :pricing_unit_name,
    :pricing_factor_num, :pricing_factor_den
);
