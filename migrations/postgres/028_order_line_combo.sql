-- sales#169 -- la linea de PEDIDO guarda de que MENU viene y que se eligio.
ALTER TABLE sales_order_item ADD COLUMN IF NOT EXISTS combo_group_ref TEXT;
ALTER TABLE sales_order_item ADD COLUMN IF NOT EXISTS combo TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_sales_order_item_combo_group
    ON sales_order_item (hub_id, combo_group_ref)
    WHERE combo_group_ref IS NOT NULL;

-- POR QUE. La 027 dio estas dos columnas a `sales_sale_item` y con eso un menu se puede COBRAR de
-- un tiron -- el camino del mostrador y el de la tienda de alimentacion. El del restaurante es
-- otro: abrir cuenta, anadir lineas, disparar a cocina y cobrar media hora despues. Y ahi la fila
-- del pedido no tenia donde guardar nada de esto.
--
-- El sintoma no era que el menu volviera a ser un plato normal. `addComboLine` pone el id del combo
-- en `product_id`, asi que al perderse la composicion la linea entra por el camino de catalogo, el
-- cobro busca ese id en `inventory.products.for_sale`, no lo encuentra, y RECHAZA la venta entera
-- con `sales.product_not_available`. La mesa que pidio el menu del dia no podia pagar, y el error
-- hablaba de un producto que el camarero no reconocia.
--
-- Es el mismo agujero que la 023 tapo para los suplementos, y por eso el criterio es el mismo:
-- ESTA FILA ES DE TRABAJO, NO LLEVA DINERO. `combo` guarda el id del menu y los `option_id`
-- elegidos EN SU ORDEN, con el nombre y la categoria de cada componente para poder pintarlos y
-- para que el KDS enrute cada uno a SU estacion al retomar la cuenta. El precio cerrado, el
-- reparto del art. 79.Dos y el snapshot fiscal los decide el COBRO contra `combos.options.all`, en
-- el mismo y UNICO recorrido de siempre (sales#152): guardar aqui lineas hermanas ya repartidas
-- seria el segundo recorrido que aquella rebanada quito a proposito.
--
-- Por eso el snapshot de esta tabla NO tiene la forma del de `sales_sale_item`: alli es el registro
-- congelado con precios y reparto, aqui es la composicion elegida. Igual que `modifiers`, que en la
-- venta lleva nombres y deltas y en el pedido solo los ids.
--
-- `combo_group_ref` lo MINTA EL SERVIDOR (el handler al abrir el pedido, el `:new_id` de la fila al
-- anadir la linea), nunca el payload: es la misma regla que el precio (sales#68). NULL en toda
-- linea que no venga de un combo -- que es la verdad de las cuentas ya abiertas, y por eso la
-- migracion es aditiva y no reescribe nada. El indice es parcial y va por hub: un grupo de combo no
-- es un nombre global.
--
-- Revertirla es apartar las dos columnas, y de eso se encarga el guard de migraciones (ADR-0387).
