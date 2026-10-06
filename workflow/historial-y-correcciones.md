# WORKFLOW — Ventas / TPV · Historial, anulaciones y devoluciones

Prefijo: SALES

## Flujos

### SALES-F28 Consultar el historial y las cifras de ventas
Estado: parcial — «Ingresos» no resta las devoluciones parciales y una venta devuelta entera desaparece de las cifras; el desglose por profesional solo existe por el asistente o la API, y nadie lo cruza con la comisión de Personal (STAFF-F21)
Vertical: comun
Actor: empleado, responsable
Pantalla: Ventas
Pasos:
1. Abre **Ventas / TPV → Ventas**. Arriba, el periodo («Hoy» por defecto, «7 días», «30 días», «Todo»), contado en el día del negocio.
2. Las cifras del periodo: «Tickets», «Ingresos», «Ticket medio», «IVA», «Descuentos» y «Anuladas».
3. La tabla: Fecha, Número, Cliente, Pago, Estado (Completada, Anulada, Devuelta; con «Por devolver <importe>» si se devolvió una parte) y Total. Busca con «Buscar número o cliente…», filtra por columna (el pago y el estado, con su nombre en español) u ordena.
4. Toca una fila para ver su documento (SALES-F29). La tabla se recarga sola cuando se cobra una venta.
5. En el panel de inicio, los paneles «Ventas hoy», «Tickets hoy» y «Ventas últimos 7 días» piden permiso de informes; «Actividad reciente» lo ve cualquiera que vea ventas.
Entra: nada de otros componentes.
Sale: nada.
Si falla: «Error cargando métricas» (las cifras salen como «—»); si no cargan las formas de pago, el filtro de pago desaparece con «No se han podido cargar las formas de pago, así que el filtro por pago no está disponible…». Vacía: «Aún no hay ventas.». Las cifras necesitan permiso de informes: un empleado ve la tabla y las cifras sin datos, con el aviso de error (texto exacto sin confirmar).
Implicados: INVENTORY-F16, STAFF-F21, REC_PELUQUERIA-F15, HUB_SHELL-F36
QA: R-10, B-07

### SALES-F29 Ver y reimprimir el documento de una venta
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Documento de venta
Pasos:
1. En **Ventas**, toca la fila o la acción «Documento»; también se abre solo tras cobrar.
2. Se ve el tique (o la factura A4) con sus líneas, IVA, total, forma de pago y, si hay VeriFactu, el QR con «Escanea para comprobar este tique en la AEAT» (o su CSV cuando la AEAT contesta). Un tique simplificado lleva además el QR «Pide tu factura».
3. Pulsa la impresora del pie para imprimirlo, o «Reimprimir» en la fila para una copia sin abrirlo. Toda impresión desde **Ventas** sale con «DUPLICADO»; solo el primer papel justo tras cobrar es el original.
Entra: la factura de Facturación y el registro de VeriFactu de esa venta.
Sale: el papel; reimprimir no crea venta ni documento fiscal.
Si falla: «Cargando documento…» y «Error cargando el documento». Si la venta aún no tiene factura (se emite un instante después del cobro, o quedó en reintentos o en «Eventos caídos»: INVOICE-F06), tras la espera el documento sale sin número de factura (lleva el número de la venta) y sin QR. Sin impresora: «El tique está en espera: aún no hay ninguna impresora dada de alta. Da una de alta y saldrá solo.»; si falla: «No se pudo imprimir». Con la impresora de red del dispositivo apagada o sin papel no hay ningún aviso y el papel se pierde (PRINTING-F07). Una factura sin NIF del cliente avisa «Esta factura no tiene el NIF del cliente: la impresora de tiques no puede sacarla como factura completa.».
Implicados: INVOICE-F04, INVOICE-F06, INVOICE-F20, PRINTING-F08, VERIFACTU-F19, REC_FISCAL-F07, REC_FISCAL-F09, REC_FISCAL-F10, HUB-F16, HUB_SHELL-F76
QA: R-11, L-02, L-04, L-05

### SALES-F30 Anular una venta cobrada
Estado: parcial — anular un tique no toca su factura simplificada ni su registro de VeriFactu (Facturación no escucha la anulación: el tique sigue declarado y sin registro de anulación); un tique que el cliente canjeó después por factura completa («Pide tu factura») se anula igual y su factura completa sigue viva; la sesión de bono gastada no vuelve al bono y la cita cobrada sigue como cobrada; anular un cobro parcial cierra la mesa con la cuenta todavía abierta; sin caja abierta y sin el bloqueo de Caja armado, la venta queda anulada pero Caja rechaza el apunte de vuelta del efectivo (con el bloqueo armado, la anulación se rechaza con un aviso que no menciona la caja: SALES-F08)
Vertical: comun
Actor: responsable
Pantalla: Ventas
Pasos:
1. En **Ventas**, en una venta Completada sin devoluciones, pulsa «Anular».
2. En «Anular la venta <número>» escribe el «Motivo (obligatorio)» y pulsa «Anular».
3. Sale «Venta anulada»; la fila pasa a Anulada y la cifra «Anuladas» sube.
Entra: la venta elegida.
Sale: la venta queda marcada como anulada con hora, quién y motivo, y el motivo se copia en sus notas; no se borra (avisa: sale.voided). Caja devuelve el efectivo que la venta tenía vivo en la caja abierta, Inventario repone el stock, Clientes marca la compra como anulada y Mesas deja de contar lo cobrado y además cierra la sesión de la mesa enlazada a esa cuenta y la libera, también si era un cobro parcial y la cuenta sigue abierta. Nadie más reacciona: Facturación no escucha la anulación (INVOICE-F07), así que el tique sigue «Emitida» y su registro sigue declarado en VeriFactu, sin registro de anulación; si el tique se había canjeado por factura completa (INVOICE-F04), esa factura completa también sigue viva. Servicios no devuelve la sesión de bono gastada (SERVICES-F27) ni anula el bono que se vendió en esa venta (SERVICES-F14) y Citas deja la cita marcada como cobrada, con su «Cobrar» en gris, así que no se puede volver a cobrar desde la agenda.
Si falla: sin motivo, «Hace falta un motivo para anular una venta»; si se cobró como factura completa, «Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla» (un tique canjeado después por factura completa no se rechaza); con devoluciones, «Esta venta ya tiene devoluciones: devuelve el importe que queda en vez de anularla»; anulada desde otro dispositivo a la vez, «Esta venta ya está anulada». Sin permiso no aparece «Anular». Con la caja cerrada y el bloqueo de Caja armado, «No se ha podido anular la venta» (SALES-F08). Sin bloqueo, sin caja abierta y con efectivo, la venta queda anulada pero Caja rechaza el apunte y, tras los reintentos, queda en la cola de avisos fallidos sin aviso en pantalla (CASH_REGISTER-F14).
Implicados: APPOINTMENTS-F17, CASH_REGISTER-F14, CUSTOMERS-F21, INVENTORY-F23, INVOICE-F07, SERVICES-F14, SERVICES-F27, TABLES-F19, REC_FISCAL-F13, REC_PELUQUERIA-F14, REC_RESTAURANTE-F15
QA: R-11, B-08, L-04 (discrepa), L-06, qa-hub-restaurant §7.13

### SALES-F31 Devolver una venta (toda, una parte o por otro medio)
Estado: parcial — se devuelve dinero, no artículos: no se eligen líneas ni cantidades y no vuelve stock; Clientes no resta la devolución del historial del cliente; sin caja abierta y sin el bloqueo de Caja armado, la parte en efectivo no se apunta en Caja (queda en la cola de avisos fallidos); si la venta se devuelve antes de que exista su factura, no se rectifica nada (INVOICE-F06, INVOICE-F09); la ventana no se actualiza si otra tablet devuelve a la vez (sales#514)
Vertical: comun
Actor: responsable
Pantalla: Devolver
Pasos:
1. En **Ventas**, en una venta Completada (también con factura), pulsa «Devolver».
2. «Devolver la venta <número>» enseña una tarjeta por cada forma en que se pagó: «Cobrado», «Ya devuelto» y «Devolvible», con una propuesta de devolución total ya repartida («Devolver todo» la repone).
3. Cambia el «Importe a devolver» de cada forma si solo vuelve una parte. Si el medio original ya no existe, elige otro en «Devolver por».
4. Escribe el «Motivo» y pulsa «Devolver <importe>».
5. Sale «Devolución registrada.»; la lista se recarga y, si ya no queda nada por devolver, la venta pasa a Devuelta; si queda, la fila dice «Por devolver <importe>».
Entra: lo cobrado y lo ya devuelto por cada forma de pago.
Sale: el documento de devolución con una fila por forma de pago, su motivo y quién la hizo (avisa: sale.refunded). Caja apunta la salida por cada forma en la caja abierta; sin caja abierta, la parte en efectivo se rechaza y, tras los reintentos, queda en la cola de avisos fallidos (la de tarjeta no se apunta) (CASH_REGISTER-F15). Facturación emite una rectificativa R1 por lo devuelto, en negativo y en la serie RECT; si con ella se devuelve todo, la original pasa a «Cancelada» (INVOICE-F09, INVOICE-F10). VeriFactu la registra como alta rectificativa por diferencias, y como R5 si es de un tique sin NIF del cliente (VERIFACTU-F14). Inventario y Clientes no reaccionan: no vuelve stock y el historial del cliente conserva el importe. Servicios no anula el bono que se vendió en esa venta (se anula en Bonos vendidos, SERVICES-F14, SERVICES-F17); la sesión de una línea pagada con bono vuelve por el hueco de esta ventana (SALES-F32, SERVICES-F26).
Si falla: el botón explica qué falta antes de devolver («<medio>: <importe> es más que los <importe> que quedan por devolver.», «<medio>: elige por dónde vuelve este dinero.», «Una devolución necesita un motivo.»). Si el hub no contesta, comprueba solo si se grabó y repetir no duplica («No hemos podido confirmar si la devolución se registró…»). Si no queda dinero: «No queda dinero por devolver en esta venta.». Con la caja cerrada y el bloqueo de Caja armado, «No se ha podido registrar la devolución.» (SALES-F08). Si la venta todavía no tiene factura (cobro en reintentos o en «Eventos caídos»), la devolución se registra pero Facturación no rectifica nada ni lo reintenta: cuando la factura nace después, queda sin rectificar y hay que rectificarla a mano (INVOICE-F06, INVOICE-F08).
Implicados: CASH_REGISTER-F15, CUSTOMERS-F22, INVENTORY-F24, INVOICE-F09, INVOICE-F10, SERVICES-F14, SERVICES-F17, SERVICES-F26, SERVICES-F30, REC_FISCAL-F11, REC_PELUQUERIA-F14, REC_RESTAURANTE-F15
QA: R-11, B-08, L-03, L-06, qa-hub-restaurant §7.13

### SALES-F32 Devolver la sesión de un bono
Estado: parcial — la sesión solo vuelve junto con una devolución de dinero: en un tique pagado entero con bono (0,00 €), «Devolver» dice «No queda nada por devolver en esta venta.» y no enseña el hueco de Servicios, y el servidor rechaza además una devolución sin dinero, así que la sesión solo se repone en Servicios, **Bonos vendidos → Ajustar → Añadir sesiones**, y solo un responsable (SERVICES-F18); en un tique con bono y dinero la sesión sola no se puede devolver mientras quede dinero (hay que devolver algo de dinero a la vez, sales#512) y, devuelto todo el dinero, la venta pasa a Devuelta y «Devolver» queda desactivado; anular la venta tampoco la devuelve
Vertical: peluqueria
Actor: responsable
Pantalla: Devolver
Pasos:
1. En la ventana **Devolver** de una venta con líneas pagadas por bono, aparece «Líneas pagadas de otra forma» con el hueco de Servicios en cada una.
2. Marca en el hueco si la sesión vuelve al bono. El aviso que dé Servicios sale junto al botón.
3. Al pulsar «Devolver <importe>» (con algún importe de dinero), la ventana espera a que Servicios devuelva la sesión. Si la venta se pagó entera con bono, la ventana no llega a enseñar el hueco: dice «No queda nada por devolver en esta venta.» (ver Estado). El botón «Devolver lo pagado de otra forma» solo sale al volver a abrir, en el mismo dispositivo, una devolución ya registrada cuya sesión no volvió.
Entra: las líneas de la venta que pagó un bono.
Sale: la sesión vuelve al bono, con el documento de devolución como referencia; la sesión en sí no mueve dinero, pero solo viaja con una devolución que sí lo devuelve.
Si falla: «El dinero ha vuelto, pero lo que se pagó de otra forma no se ha podido devolver. Revísalo desde su módulo.»; si la ventana se cerró antes, «La devolución está registrada, pero lo que se pagó de otra forma aún no se ha devuelto. Vuelve a abrir la devolución de esta venta en este dispositivo para devolverlo.»; pero si esa devolución ya devolvió todo el dinero, la venta está Devuelta y la ventana ya no se puede volver a abrir.
Implicados: SERVICES-F18, SERVICES-F26, REC_PELUQUERIA-F14
QA: B-08

### SALES-F33 Unir las ventas de dos fichas de cliente
Estado: hecho
Vertical: comun
Actor: sistema
Pantalla: ninguna
Pasos:
1. En Clientes, alguien une dos fichas de la misma persona.
2. Las ventas de la ficha absorbida pasan a la que queda, en cualquier estado.
Entra: la ficha absorbida y la que queda (avisa Clientes: customer.merged).
Sale: el vínculo de las ventas con la ficha; el nombre impreso, el número y los importes no cambian.
Si falla: no hay pantalla; repetirlo no cambia nada.
Implicados: CUSTOMERS-F13
QA: ninguno
