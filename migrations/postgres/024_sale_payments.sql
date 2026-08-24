-- ADR-0386 (sales#158) -- una venta, N cobros: el desglose del pago es una TABLA HIJA.
--
-- Hasta aqui la venta era mono-pago: `sales_sale` llevaba los ESCALARES payment_method_id /
-- payment_method_name / amount_tendered / change_due, asi que «mitad en tarjeta y mitad en
-- efectivo» no se podia ni representar. Los escalares NO se tocan: siguen ahi, derivados del
-- tender principal, mientras queden consumidores leyendolos (`sales.get`, el tique, `invoice`).
--
-- POR QUE UNA TABLA HIJA Y NO COLUMNAS. Porque el medio de pago NO es un campo del registro
-- fiscal, y meterlo en la cabecera invitaria a creer que si. Verificado en el ADR sobre el PDF
-- del servicio web de la AEAT y sobre `SuministroInformacion.xsd`: CERO coincidencias de
-- `MedioPago` / `FormaPago` / «medio de pago» / «forma de pago», con control positivo de 91 de
-- `IDFactura|RegistroAlta|Huella` -- o sea que la extraccion funcionaba y la ausencia es real.
-- Ninguno de los 31 hijos de `RegistroFacturacionAltaType` es de pago. Igual en TicketBAI v1.1.
-- Una venta cobrada de tres formas sigue siendo UN registro, UNA huella y UN eslabon de cadena.
-- Esto de aqui es TESORERIA: vive por debajo del cobro y el libro no se entera.
--
-- EL CAMBIO VIVE EN LA PATA DE EFECTIVO (`change_due` de su fila), nunca prorrateado. Es el bug
-- de Odoo PR#194284: 120 EUR pagados con 100 de banco + 50 en efectivo imputan los 30 de cambio
-- al BANCO, y desde ahi el tique y la base de datos dicen cosas distintas y el arqueo no cuadra.
-- El cambio sale fisicamente del cajon, asi que se carga al cajon. Sin pata de efectivo no hay
-- cambio: se cobra el importe exacto.
--
-- Tipos: subconjunto portable «ERPlora SQL» (ADR-0007) -- importes INTEGER en centimos (shim ->
-- BIGINT), fechas TEXT ISO-8601, flags 0/1 INTEGER. Contrato de fila del hub (§2.5): hub_id +
-- soft-delete + auditoria.
CREATE TABLE IF NOT EXISTS sales_sale_payment (
    id                  TEXT PRIMARY KEY,
    hub_id              TEXT NOT NULL,
    sale_id             TEXT NOT NULL,
    -- Orden en que la cajera tomo los cobros. El tique los imprime en el.
    sort_order          INTEGER NOT NULL DEFAULT 0,
    -- Id del catalogo (`sales_payment_method`). NULL solo en el caso degradado en que el runtime
    -- no entregue el catalogo: sin el no hay nada contra lo que validar y cobrar es lo ultimo que
    -- puede romperse. Sin FK a proposito, igual que la cabecera: el metodo se puede desactivar y
    -- el historico tiene que seguir diciendo con que se pago.
    payment_method_id   TEXT,
    -- Nombre RESUELTO del catalogo del hub (localizado, lo que ve el cajero), no la etiqueta que
    -- mando el navegador (sales#20).
    payment_method_name TEXT NOT NULL DEFAULT '',
    -- Tipo CANONICO (cash|card|transfer|other) del catalogo (hub#778): es el valor sobre el que se
    -- decide, no el `name` localizado. El arqueo compara contra esto -- «Efectivo» y «Cash» son el
    -- mismo `cash`, y solo `cash` suma al efectivo esperado del cajon.
    payment_method_type TEXT NOT NULL DEFAULT 'cash',
    -- Lo que ESTA pata cubre del total, en centimos. Las patas suman el total AL CENTIMO: el
    -- handler rechaza el descuadre en vez de aceptarlo callando.
    amount              INTEGER NOT NULL DEFAULT 0,
    -- Lo que el cliente entrego en esta pata. Solo una pata `cash` puede superar su `amount`.
    amount_tendered     INTEGER NOT NULL DEFAULT 0,
    -- `amount_tendered - amount`, y solo distinto de 0 en una pata de EFECTIVO (ver arriba).
    change_due          INTEGER NOT NULL DEFAULT 0,
    -- Traza libre: codigo de autorizacion de la tarjeta, referencia de la transferencia. Opaca
    -- para `sales` -- se guarda y se imprime, no se interpreta.
    reference           TEXT NOT NULL DEFAULT '',
    is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
    created_by TEXT, updated_by TEXT, created_at TEXT, updated_at TEXT,
    FOREIGN KEY (sale_id) REFERENCES sales_sale (id) ON DELETE CASCADE
);

-- La lectura real: las patas de UNA venta, de ESTE hub, sin las borradas.
CREATE INDEX IF NOT EXISTS ix_sale_payment_sale ON sales_sale_payment (hub_id, sale_id, is_deleted);
