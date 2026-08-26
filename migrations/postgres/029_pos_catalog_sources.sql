-- Sales · sales#25 — the two switches that decide WHICH catalogue feeds the till get a reader, and
-- the defaults stop disagreeing with the form.
--
-- Tipos: subconjunto portable "ERPlora SQL" (ADR-0007):
--   * flags 0/1 -> INTEGER (los commands bindean 0/1, Postgres no castea entero->bool).
--
-- 1) sync_services pasa a estar ENCENDIDO por defecto. Los servicios se muestran en el TPV desde
--    sales#89 siempre que el modulo services este instalado, sin mirar este flag. Al darle lector
--    de verdad, dejarlo en 0 apagaria el catalogo de servicios de TODAS las peluquerias en la
--    siguiente actualizacion del modulo. El flag existe para poder APAGARLO, no para tener que
--    acordarse de encenderlo.
--
-- 2) Las filas ya guardadas se ponen en 1 por lo mismo: hasta hoy el valor no producia ningun
--    efecto observable, asi que un 0 guardado no expresa ninguna decision del comercio. Solo se
--    tocan las filas que estan en 0, y solo esta columna.
--
-- 3) auto_invoice_with_tax_id nacio con DEFAULT 1 en la columna y "false" en el schema del
--    formulario. Manda el formulario (es lo que ve y guarda el comercio) y es lo que hace el TPV
--    cuando no hay fila: por defecto se emite TIQUE, y la factura automatica por NIF se pide. Es
--    ademas lo que hace el mercado: Square, Shopify POS, Toast y Lightspeed emiten recibo y la
--    factura es una accion explicita; en Odoo hay que pulsar Invoice.

ALTER TABLE sales_settings ALTER COLUMN sync_services SET DEFAULT 1;

UPDATE sales_settings SET sync_services = 1 WHERE sync_services = 0;

ALTER TABLE sales_settings ALTER COLUMN auto_invoice_with_tax_id SET DEFAULT 0;
