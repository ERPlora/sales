-- sales#160 / ADR-0386 decision 3 -- DEVOLVER una venta cobrada con varios medios.
--
-- Hasta aqui la unica marcha atras era `sales.void`, que ni mira las patas del cobro (solo hace
-- `UPDATE sales_sale SET status='voided'`) y ademas RECHAZA la venta facturada. O sea: una venta
-- cobrada con tarjeta + efectivo no tenia forma de volver, y una venta con factura no tenia
-- reverso ninguno en el TPV.
--
-- POR QUE UN DOCUMENTO Y NO UN FLAG. Una devolucion es PARCIAL y REPETIBLE: hoy vuelven 15 EUR de
-- la tarjeta y la semana que viene los 35 restantes. Un flag en la cabecera no puede contar eso, y
-- deducirlo restando totales pierde lo unico que hace falta saber: a QUE pata volvio cada euro.
-- Sin eso, el arqueo de manana no sabe si sacar del cajon o abonar en el datafono.
--
-- LOS DOS EJES, que confundirlos es el bug de medio mercado:
--   * DE DONDE sale el dinero  -> `payment_id`, la pata original de `sales_sale_payment`. Su tope
--     es lo que esa pata cobro menos lo que ya se le devolvio. Ese tope lo calcula
--     `queries/refund_options.sql` y lo aplica el handler.
--   * A DONDE va -> `payment_method_id/_name/_type`, el metodo de destino. Por defecto el de la
--     propia pata (se devuelve por donde se cobro), pero el operador puede nombrar otro cuando
--     aquel ya no existe. Es exactamente lo que le falta a Square, que obliga al tender original
--     «even if the gift card does not exist or has been reused» -- reportado en 2018, sin solucion
--     en 2021. Marcar la pata como no elegible y no dejar salida seria el mismo bug con mejores
--     palabras.
--
-- NO ES UN REGISTRO FISCAL. Igual que el cobro (migracion 024), el medio de pago no aparece en el
-- suministro de la AEAT: esto es TESORERIA. La devolucion es el hecho economico y la rectificativa
-- es su documento (invoice#5 / hub#1023), que emite `invoice`, no esta tabla.
--
-- LA REFERENCIA ES EL ID. `services` devuelve la sesion al bono con `refund_ref` como clave de
-- idempotencia (services#71), y pidio por escrito que sea el id ESTABLE del documento y no un uuid
-- nuevo por intento -- si no, el segundo reintento se rechaza como doble devolucion del bono, que
-- es el comportamiento correcto pero se lee como un fallo. De ahi `idempotency_key` + su indice.
--
-- Tipos: subconjunto portable «ERPlora SQL» (ADR-0007) -- importes INTEGER en centimos (shim ->
-- BIGINT), fechas TEXT ISO-8601, flags 0/1 INTEGER. Contrato de fila del hub: hub_id + soft-delete
-- + auditoria. Revertirla es apartar las dos tablas; no toca ninguna columna existente.
CREATE TABLE IF NOT EXISTS sales_sale_refund (
    id              TEXT PRIMARY KEY,
    hub_id          TEXT NOT NULL,
    sale_id         TEXT NOT NULL,
    -- Lo devuelto por ESTE documento, en centimos. Las patas de abajo suman esto AL CENTIMO: el
    -- handler rechaza el descuadre en vez de absorberlo.
    total           INTEGER NOT NULL DEFAULT 0,
    -- Obligatorio, como en el anulado (sales#26): sin motivo, el historico no explica nada y en
    -- una inspeccion no hay con que responder. Regla de mercado (Toast, Lightspeed, Holded).
    reason          TEXT NOT NULL DEFAULT '',
    note            TEXT NOT NULL DEFAULT '',
    -- La clave del INTENTO, no de la peticion. Vacia = historico anterior a esta migracion.
    idempotency_key TEXT NOT NULL DEFAULT '',
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT,
    FOREIGN KEY (sale_id) REFERENCES sales_sale (id) ON DELETE CASCADE
);

-- La lectura real: las devoluciones de UNA venta, de ESTE hub, sin las anuladas.
CREATE INDEX IF NOT EXISTS ix_sale_refund_sale ON sales_sale_refund (hub_id, sale_id, is_deleted);

-- Autoridad FINAL de la idempotencia. La sonda `sales.refund_by_idempotency_key` que el runtime
-- pre-carga resuelve el reintento normal (no-op limpio), pero dos peticiones simultaneas leen ambas
-- «no existe» y solo el indice puede decidir: la segunda revienta y su transaccion entera se
-- revierte -- ni documento, ni patas, ni eventos en el outbox. Parcial porque la cadena vacia es el
-- historico y no puede declararse duplicada consigo misma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_refund_idempotency
    ON sales_sale_refund (hub_id, idempotency_key)
    WHERE idempotency_key <> '';

CREATE TABLE IF NOT EXISTS sales_sale_refund_payment (
    id                  TEXT PRIMARY KEY,
    hub_id              TEXT NOT NULL,
    refund_id           TEXT NOT NULL,
    -- Denormalizado a proposito: el tope se calcula por venta y sin esto cada lectura tendria que
    -- pasar por la cabecera para saber de que venta habla.
    sale_id             TEXT NOT NULL,
    -- EL ORIGEN: la pata de `sales_sale_payment` cuyo dinero vuelve. Es sobre esto sobre lo que
    -- manda el tope. Sin FK, igual que la cabecera del cobro: el historico tiene que seguir
    -- diciendo de donde salio aunque la pata se corrija.
    payment_id          TEXT NOT NULL,
    -- EL DESTINO, resuelto del catalogo del hub por el servidor (nunca la etiqueta del navegador).
    payment_method_id   TEXT,
    payment_method_name TEXT NOT NULL DEFAULT '',
    -- Tipo CANONICO (cash|card|transfer|other). Es lo que mira el arqueo: solo `cash` sale del
    -- cajon (hub#778), y devolver en efectivo lo cobrado con tarjeta SI cambia el efectivo
    -- esperado. Por eso el destino se guarda, y no se asume el de la pata de origen.
    payment_method_type TEXT NOT NULL DEFAULT 'cash',
    -- Lo que vuelve por esta pata, en centimos. Siempre positivo: el signo lo pone el documento.
    amount              INTEGER NOT NULL DEFAULT 0,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT,
    FOREIGN KEY (refund_id) REFERENCES sales_sale_refund (id) ON DELETE CASCADE
);

-- El tope se calcula agrupando por pata dentro de una venta y un hub: ese es el indice.
CREATE INDEX IF NOT EXISTS ix_sale_refund_payment_tender
    ON sales_sale_refund_payment (hub_id, sale_id, payment_id, is_deleted);
