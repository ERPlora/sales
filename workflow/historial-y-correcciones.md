# WORKFLOW — Ventas / TPV · Historial, anulaciones y devoluciones

Prefijo: SALES

## Flujos

### SALES-F28 Consultar el historial y las cifras de ventas
Estado: parcial — «Ingresos» no resta las devoluciones parciales y una venta devuelta entera desaparece de las cifras; el desglose por profesional solo existe por el asistente o la API
Vertical: comun
Actor: empleado, responsable
Pantalla: Ventas
Pasos:
1. Abre **Ventas / TPV → Ventas**. Arriba, el periodo («Hoy» por defecto, «7 días», «30 días», «Todo»), contado en el día del negocio.
2. Las cifras del periodo: «Tickets», «Ingresos», «Ticket medio», «IVA», «Descuentos» y «Anuladas».
3. La tabla: Fecha, Número, Cliente, Pago, Estado (Completada, Anulada, Devuelta; con «Por devolver <importe>» si se devolvió una parte) y Total. Busca con «Buscar número o cliente…», filtra por columna (el pago y el estado, con su nombre en español) u ordena.
4. Toca una fila para ver su documento (SALES-F29). La tabla se recarga sola cuando se cobra una venta.
5. En el panel de inicio, quien ve informes tiene los paneles «Ventas hoy», «Tickets hoy», «Ventas últimos 7 días» y «Actividad reciente».
Entra: nada de otros componentes.
Sale: nada.
Si falla: «Error cargando métricas» (las cifras salen como «—»); si no cargan las formas de pago, el filtro de pago desaparece con «No se han podido cargar las formas de pago, así que el filtro por pago no está disponible…». Vacía: «Aún no hay ventas.». Las cifras y los paneles necesitan permiso de informes: un empleado ve la tabla y las cifras sin datos, con el aviso de error (texto exacto sin confirmar).
Implicados: pendiente
Pendiente de enlazar: staff — el cierre por profesional cruza las ventas por profesional con la comisión
QA: R-10, B-07

### SALES-F29 Ver y reimprimir el documento de una venta
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Documento de venta
Pasos:
1. En **Ventas**, toca la fila o la acción «Documento»; también se abre solo tras cobrar.
2. Se ve el tique (o la factura A4) con sus líneas, IVA, total, forma de pago y, si hay VeriFactu, el QR con «Escanea para comprobar este tique en la AEAT» (o su CSV cuando la AEAT contesta). Un tique simplificado lleva además el QR «Pide tu factura».
3. Pulsa la impresora del pie para imprimirlo. Para una copia sin abrirlo, usa «Reimprimir» en la fila: sale con «DUPLICADO».
Entra: la factura de Facturación y el registro de VeriFactu de esa venta.
Sale: el papel; reimprimir no crea venta ni documento fiscal.
Si falla: «Cargando documento…» y «Error cargando el documento». Sin impresora: «El tique está en espera: aún no hay ninguna impresora dada de alta. Da una de alta y saldrá solo.»; si falla: «No se pudo imprimir». Una factura sin NIF del cliente avisa «Esta factura no tiene el NIF del cliente: la impresora de tiques no puede sacarla como factura completa.».
Implicados: pendiente
Pendiente de enlazar: invoice — número fiscal de la venta y la factura completa a petición («Pide tu factura»)
Pendiente de enlazar: verifactu — QR y CSV del registro de la venta
Pendiente de enlazar: printing — imprimir el tique o la factura y marcar las copias
QA: R-11, L-02, L-04, L-05

### SALES-F30 Anular una venta cobrada
Estado: parcial — anular un tique no toca su factura simplificada ni su registro de VeriFactu (Facturación no escucha la anulación: el tique sigue declarado y sin registro de anulación); sin caja abierta la venta queda anulada pero Caja rechaza el apunte de vuelta del efectivo
Vertical: comun
Actor: responsable
Pantalla: Ventas
Pasos:
1. En **Ventas**, en una venta Completada sin devoluciones, pulsa «Anular».
2. En «Anular la venta <número>» escribe el «Motivo (obligatorio)» y pulsa «Anular».
3. Sale «Venta anulada»; la fila pasa a Anulada y la cifra «Anuladas» sube.
Entra: la venta elegida.
Sale: la venta queda marcada como anulada con hora, quién y motivo; no se borra (avisa: sale.voided). Caja devuelve el efectivo, Inventario repone el stock, Clientes resta la compra y Mesas descuenta lo cobrado.
Si falla: sin motivo, «Hace falta un motivo para anular una venta»; con factura completa, «Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla»; con devoluciones, «Esta venta ya tiene devoluciones: devuelve el importe que queda en vez de anularla»; anulada desde otro dispositivo a la vez, «Esta venta ya está anulada». Sin permiso no aparece «Anular».
Implicados: pendiente
Pendiente de enlazar: cash_register — revertir el efectivo de la venta anulada
Pendiente de enlazar: inventory — reponer el stock de la venta anulada
Pendiente de enlazar: customers — quitar la compra anulada del historial del cliente
Pendiente de enlazar: invoice — anular la factura simplificada de un tique anulado (hoy no escucha la anulación)
Pendiente de enlazar: REC_FISCAL — el registro de anulación que debería llegar a la AEAT al anular un tique
QA: R-11, B-08, L-04 (discrepa), L-06, qa-hub-restaurant §7.13

### SALES-F31 Devolver una venta (toda, una parte o por otro medio)
Estado: parcial — se devuelve dinero, no artículos: no se eligen líneas ni cantidades y no vuelve stock; la ventana no se actualiza si otra tablet devuelve a la vez (sales#514)
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
Sale: el documento de devolución con una fila por forma de pago (avisa: sale.refunded); Caja apunta la salida por cada forma, Facturación emite la rectificativa (o anula la factura si es total).
Si falla: el botón explica qué falta antes de devolver («<medio>: <importe> es más que los <importe> que quedan por devolver.», «<medio>: elige por dónde vuelve este dinero.», «Una devolución necesita un motivo.»). Si el hub no contesta, comprueba solo si se grabó y repetir no duplica («No hemos podido confirmar si la devolución se registró…»). Si no queda dinero: «No queda dinero por devolver en esta venta.».
Implicados: pendiente
Pendiente de enlazar: cash_register — apuntar la salida de dinero de la devolución por forma de pago
Pendiente de enlazar: invoice — emitir la rectificativa o anular la factura de la venta devuelta
Pendiente de enlazar: REC_FISCAL — la rectificativa llega a la AEAT
QA: R-11, B-08, L-03, L-06, qa-hub-restaurant §7.13

### SALES-F32 Devolver la sesión de un bono
Estado: parcial — en un tique con bono y dinero no se puede devolver solo la sesión mientras quede dinero (sales#512)
Vertical: peluqueria
Actor: responsable
Pantalla: Devolver
Pasos:
1. En la ventana **Devolver** de una venta con líneas pagadas por bono, aparece «Líneas pagadas de otra forma» con el hueco de Servicios en cada una.
2. Marca en el hueco si la sesión vuelve al bono. El aviso que dé Servicios sale junto al botón.
3. Al pulsar «Devolver <importe>», la ventana espera a que Servicios devuelva la sesión. Si el dinero ya volvió entero, el botón es «Devolver lo pagado de otra forma».
Entra: las líneas de la venta que pagó un bono.
Sale: la sesión vuelve al bono, con el documento de devolución como referencia; no mueve dinero.
Si falla: «El dinero ha vuelto, pero lo que se pagó de otra forma no se ha podido devolver. Revísalo desde su módulo.»; si la ventana se cerró antes, «La devolución está registrada, pero lo que se pagó de otra forma aún no se ha devuelto. Vuelve a abrir la devolución de esta venta en este dispositivo para devolverlo.».
Implicados: pendiente
Pendiente de enlazar: services — devolver al bono la sesión de una línea devuelta
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
Implicados: pendiente
Pendiente de enlazar: customers — unir dos fichas de cliente
QA: ninguno
