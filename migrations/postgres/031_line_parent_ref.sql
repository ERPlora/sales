-- sales#147 / enmienda de ADR-0376 (architecture#409): un suplemento con TIPO FISCAL PROPIO deja
-- de plegarse en el precio de su linea y se materializa como SU PROPIA LINEA, hija de aquella.
--
-- POR QUE HACE FALTA UNA COLUMNA. `sales_sale_item` lleva UN solo `tax_rate` por fila, asi que un
-- refresco al 21 % dentro de un menu al 10 % no tenia donde poner su segunda base: se cobraba al
-- tipo del padre y la factura salia mal desglosada EN SILENCIO. Con la fila hija hay dos bases,
-- cada una con su tipo, y `base + cuota` cuadra al centimo en las dos -- que es justo lo unico que
-- el XML de VeriFactu sabe representar (`DetalleDesglose` es POR TIPO).
--
-- POR QUE NO SE REUTILIZA `combo_group_ref` (027). Son relaciones DISTINTAS y ademas COMPONEN:
--
--   1. `combo_group_ref` hermana N lineas SIN fila padre (ADR-0381, regla 4). Su razon de ser es
--      que NO exista una fila que lleve el dinero del grupo -- el combo a 0 EUR en el informe de
--      ventas es el fallo documentado de Odoo (odoo#187509). Aqui pasa lo contrario: el padre SI
--      lleva su dinero y la hija cuelga de el.
--   2. Un componente de menu puede traer su propio suplemento (ADR-0376 sin cambios: el modificador
--      cuelga de la linea de SU componente), asi que una hija puede necesitar A LA VEZ el grupo del
--      combo y el enlace a su padre. Una sola columna no puede con las dos, y si la hija se colara
--      en el grupo, `paper-combos` la pintaria como un componente del menu que nunca fue.
--   3. `combo` (027) es NOT NULL DEFAULT '{}' y guarda el snapshot del menu en CADA hermana; la
--      cabecera del tique se pinta de ahi. Una hija de un producto suelto no tiene menu que
--      congelar: quedaria un grupo cuya cabecera no se puede pintar.
--
-- QUE GUARDA. El `id` de la fila padre, que lo MINTA EL SERVIDOR con el id de la tanda del host
-- (`new_ids`), nunca el payload -- la misma regla que el precio (sales#68) y que `combo_group_ref`.
-- NULL en toda linea que no cuelgue de ninguna, que es la verdad de todas las ventas ya escritas, y
-- por eso la migracion es aditiva y no reescribe nada.
--
-- POR QUE NO HAY COLUMNA EN `sales_order_item`. La hija se materializa AL COBRAR, igual que las
-- hermanas de un combo (ver la 028): la cuenta abierta sigue guardando los `option_id` con su delta
-- congelado en `modifiers`, y el COBRO decide el reparto contra `modifiers.options.all`. Eso es lo
-- que hace que dividir (`sales.order.split`), fusionar (`order.merge`), transferir y reabrir muevan
-- padre y suplemento JUNTOS sin tocar nada: no hay fila hija suelta que se pueda quedar huerfana,
-- porque no existe hasta que se decide el dinero.
--
-- Revertirla es apartar la columna, y de eso se encarga el guard de migraciones (ADR-0387).
ALTER TABLE sales_sale_item ADD COLUMN IF NOT EXISTS parent_line_ref TEXT;

-- La hija se lee SIEMPRE con su padre (el tique, la reimpresion, el informe de ventas), asi que el
-- indice va por hub + padre. Parcial: solo las filas que de verdad cuelgan de otra.
CREATE INDEX IF NOT EXISTS idx_sales_sale_item_parent_line
    ON sales_sale_item (hub_id, parent_line_ref)
    WHERE parent_line_ref IS NOT NULL;
