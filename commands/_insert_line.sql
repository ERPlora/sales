-- Inserta una línea de venta (importes precalculados por el handler, half-even).
-- Runtime inyecta :hub_id, :now. :line_id y :sale_id los aporta el handler.
-- ADR-0085: la línea congela el snapshot fiscal (tax_category_key / tax_country_code /
-- tax_region_code / tax_rule_id); `tax_rate` es el % combinado (tax_rate_pct).
-- pm#93: `modifiers` congela los suplementos elegidos (JSON, en el ORDEN de eleccion). La
-- columna existia desde el principio y no la escribia nadie. El delta YA esta dentro de
-- unit_price, asi que aqui es snapshot puro, no dinero que recalcular.
-- sales#147: `parent_line_ref` = la fila de la que ESTA cuelga -- la hija de un suplemento con
-- tipo fiscal propio, que no se pliega en el precio del padre porque tributa distinto. NULL en
-- toda linea que no cuelgue de ninguna. Es OTRA relacion que `combo_group_ref`, y componen: una
-- hermana de combo puede traer su propia hija (ver migrations/postgres/031_line_parent_ref.sql).
-- sales#152 / ADR-0381: `combo_group_ref` hermana las lineas que salieron de UN combo (no hay
-- linea padre con dinero: el combo a 0 EUR en los informes es el fallo de Odoo) y `combo` congela
-- el snapshot del menu -- nombre, precio cerrado y componentes en su orden de eleccion -- del que
-- se pinta la cabecera del tique. NULL / '{}' en toda linea que no venga de un combo.
-- sales#12: `category_id` = categoría del producto congelada (routing de cocina), NULL sin clasificar.
-- sales#156: `notes` = the line's free-text note, frozen from the open check's row (or from the
-- call itself at the counter, where no row exists yet). The column has been here since the 001
-- and nobody ever wrote it, so a REPRINT could not say what the kitchen had been told.
-- sales#162: `is_covered` = la línea la pagó un TENDER EXTERNO por línea (el bono de `services`
-- cubre líneas enteras). Vale net/tax/total 0 y la marca es lo que deja al papel explicar por que.
-- sales#273: `staff_id` = QUIÉN hizo ESTA línea. Opaco a `staff` (nunca se hace JOIN). NULL en
-- toda línea anterior a la 034 y en todo negocio que no atribuya: `sales.by_staff` cae entonces
-- al de la cabecera, que es la atribución que había desde sales#179.
-- ADR-0147: `quantity` en punto fijo 10⁶ + contexto de unidades CONGELADO (§2.4): el histórico
-- no relee el maestro. El handler WASM aporta siempre los diez campos del contexto.
INSERT INTO sales_sale_item (
    id, hub_id, sale_id, product_id, product_name, product_sku, is_service,
    quantity, unit_price, discount_percent, tax_rate, tax_class_name,
    tax_category_key, tax_country_code, tax_region_code, tax_rule_id, is_gift, gift_reason,
    is_covered, category_id, modifiers, notes, combo_group_ref, combo, parent_line_ref,
    staff_id, net_amount, tax_amount, line_total, created_at,
    unit_code, unit_name, factor_num, factor_den, increment_value,
    price_quantity_value, pricing_unit_code, pricing_unit_name,
    pricing_factor_num, pricing_factor_den
) VALUES (
    :line_id, :hub_id, :sale_id, :product_id, :product_name, :product_sku, :is_service,
    :quantity, :unit_price, :discount_percent, :tax_rate, :tax_class_name,
    :tax_category_key, :tax_country_code, :tax_region_code, :tax_rule_id, :is_gift, :gift_reason,
    :is_covered, :category_id, :modifiers, COALESCE(:notes, ''), :combo_group_ref, :combo, :parent_line_ref,
    :staff_id, :net_amount, :tax_amount, :line_total, :now,
    :unit_code, :unit_name, :factor_num, :factor_den, :increment_value,
    :price_quantity_value, :pricing_unit_code, :pricing_unit_name,
    :pricing_factor_num, :pricing_factor_den
);
