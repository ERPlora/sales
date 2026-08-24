-- sales#152 / ADR-0381: un combo NO es una linea, es un GRUPO de lineas HERMANAS.
--
-- Cuantas lineas tenga lo decide cuantos TIPOS impositivos distintos hay dentro, nunca cuantos
-- componentes se eligieron: un menu del dia servido en el local va entero al 10 % (art. 91.Uno.2.2
-- LIVA, prestacion unica) y sale como UNA linea con el precio cerrado; un pack de tienda con
-- bocadillo al 10 % y cerveza al 21 % es una entrega de bienes de diversa naturaleza (art. 79.Dos)
-- y sale como UNA LINEA POR COMPONENTE, con el precio cerrado repartido en proporcion al precio de
-- catalogo y el centimo residual por resto mayor.
--
-- POR QUE NO HAY LINEA PADRE. Es el fallo documentado de Odoo (odoo#187509 y el hilo 279266): al
-- prorratear, el producto combo queda a 0 EUR en el informe diario de ventas y el operador cree que
-- lo ha regalado. Aqui no existe esa fila. Las hermanas se reconocen por `combo_group_ref` y la
-- cabecera del tique se pinta desde `combo`, el snapshot congelado en cada una de ellas.
--
-- `combo_group_ref` es NULL en toda linea que no venga de un combo -- que es la verdad de las
-- ventas ya escritas, y por eso la migracion es aditiva y no reescribe nada.
--
-- `combo` guarda el snapshot INMUTABLE (regla 6 de ADR-0381): nombre y `kitchen_name` del combo, el
-- precio cerrado, y cada componente con su grupo, su `price_delta`, su categoria fiscal, su precio
-- de catalogo y lo que le toco del reparto, EN EL ORDEN de eleccion. Cambiar el menu manana no
-- reescribe la comanda de ayer, igual que ADR-0140 y que la regla 2 de `modifiers`. Default '{}'
-- por coherencia con la columna `modifiers` de esta misma tabla, que ya usaba objeto vacio.
--
-- Revertirla es apartar las dos columnas, y de eso se encarga el guard de migraciones (ADR-0387).
ALTER TABLE sales_sale_item ADD COLUMN IF NOT EXISTS combo_group_ref TEXT;
ALTER TABLE sales_sale_item ADD COLUMN IF NOT EXISTS combo TEXT NOT NULL DEFAULT '{}';

-- Las hermanas se leen SIEMPRE juntas (el tique, la comanda, el informe de ventas), asi que el
-- indice va por hub + grupo. Parcial: solo las lineas que de verdad vienen de un combo.
CREATE INDEX IF NOT EXISTS idx_sales_sale_item_combo_group
    ON sales_sale_item (hub_id, combo_group_ref)
    WHERE combo_group_ref IS NOT NULL;
