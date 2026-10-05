# WORKFLOW — Ventas / TPV · Vender y cobrar

Prefijo: SALES

## Flujos

### SALES-F01 Vender y cobrar en efectivo
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En **Vender**, elige una categoría en la tira de arriba («Todos» enseña todo) o pulsa la lupa y busca por nombre o SKU.
2. Toca el artículo: entra como línea de la cuenta. Tocarlo otra vez (mismos suplementos, mismo profesional) sube la cantidad; el selector de la línea la sube o la baja, y a 0 la línea se quita.
3. Pulsa «Cobrar · <total>» al pie de la cuenta (en el móvil, abre antes el carrito con el botón flotante, que enseña el total).
4. En la hoja **Cobro**, con efectivo elegido, marca en el teclado el importe entregado; el cambio sale debajo en grande.
5. Deja o quita «Imprimir tiquet» (arranca como lo diga Impresión) y pulsa «Cobrar <total>».
6. La hoja se cierra, la cuenta queda vacía y se abre el **Documento de venta** con el tique («Emitiendo el tique…» mientras llega el número fiscal).
Entra: los artículos y precios de Inventario y Servicios; los tipos de IVA de Impuestos; los ajustes del TPV.
Sale: la venta cobrada e inmutable, con número `AAAAMMDD-NNNN` del día del negocio, sus líneas, su pago y su desglose de IVA (avisa: sale.completed). Si venía de una cuenta, la cuenta se cierra (avisa: order.completed). Caja apunta el cobro en la caja abierta, Inventario descuenta stock (con «Permitir vender sin stock» apagado, el de fábrica, un artículo vendido por encima de su saldo no baja nada y no deja rastro: INVENTORY-F21), Clientes suma la compra, Facturación emite la factura simplificada (y de ahí VeriFactu), Mesas apunta lo cobrado, cierra la sesión y libera la mesa (además, el TPV pide a Mesas cerrar la cuenta de mesa que tenía delante: tras dividir puede ser otra, y esa mesa se libera con su cuenta abierta, TABLES-F17, TABLES-F18), y Servicios da por gastadas las sesiones de bono retenidas en toda la cuenta, no solo las de las líneas cobradas (SERVICES-F24), y, si la venta tiene clienta, convierte en bono vendido cada línea que es un bono de su catálogo (SERVICES-F14). El TPV no ofrece bonos: venderlos solo se puede por el asistente o la API con la línea marcada como servicio; sin esa marca Ventas busca el artículo en su propio catálogo y rechaza la venta entera. Cocina retira del KDS todas las rondas de la cuenta: las listas pasan a servidas y las pendientes o en preparación, a canceladas, también la que el TPV acaba de enviar al cobrar (SALES-F20, KITCHEN-F27). El hub, en el dispositivo que cobró, imprime el tique según «Imprimir tiquet» y abre el cajón si Impresión lo tiene activado, con cualquier forma de pago (PRINTING-F07, PRINTING-F13). Cada línea de la venta guarda la categoría, el tipo, el país, la región y la regla de Impuestos con que se cobró; la calificación (exenta, no sujeta…) y la familia del impuesto no: las vuelve a resolver Facturación al emitir, con las reglas vigentes ese día (TAXES-F07).
Si falla: sin importe entregado el botón no cobra y se lee «Marca en el teclado el importe entregado»; corto, «Lo entregado no cubre el total». Un artículo sin IVA configurado sale con la marca «Falta el IVA» y al tocarlo dice «No se puede vender: sin categoría fiscal. Falta configurar el IVA.» (o «…su categoría fiscal no tiene tipo…»). Un rechazo al cobrar se pinta en la hoja con su frase (p. ej. «Un producto del tique ya no está en el catálogo. Quita la línea y vuelve a añadirla.») y la cuenta sigue intacta. Un empleado sin permiso de cobro recibe la petición de PIN de un responsable. Con la caja cerrada y el bloqueo de Caja armado, el cobro se rechaza (SALES-F08). Si Facturación no puede emitir el tique, la venta queda cobrada igual: el hub reintenta su factura y, si sigue fallando, la deja en «Eventos caídos» (INVOICE-F06); mientras tanto el documento sale sin número de factura ni QR. Si la impresora de red del dispositivo está apagada o sin papel, el tique se pierde sin ningún aviso (PRINTING-F07): se reimprime desde **Ventas** (SALES-F29).
Implicados: CASH_REGISTER-F11, CASH_REGISTER-F13, CUSTOMERS-F20, FLOWS-F04, INVENTORY-F01, INVENTORY-F02, INVENTORY-F03, INVENTORY-F04, INVENTORY-F05, INVENTORY-F06, INVENTORY-F07, INVENTORY-F08, INVENTORY-F19, INVENTORY-F20, INVENTORY-F21, INVENTORY-F27, INVOICE-F01, INVOICE-F06, KITCHEN-F27, PRINTING-F06, PRINTING-F07, PRINTING-F13, SERVICES-F04, SERVICES-F05, SERVICES-F07, SERVICES-F08, SERVICES-F09, SERVICES-F14, SERVICES-F24, TABLES-F18, TAXES-F04, TAXES-F06, TAXES-F07, TAXES-F08, TAXES-F11, TAXES-F18, TAXES-F19, REC_FISCAL-F02, REC_FISCAL-F07, REC_PELUQUERIA-F09, REC_PELUQUERIA-F13, REC_RESTAURANTE-F11, REC_RESTAURANTE-F17
Pendiente de enlazar: hub — el shell imprime el tique y abre el cajón al oír la venta, solo en el dispositivo que cobró
QA: R-09, B-06, BD-09, L-01, L-08, qa-hub-restaurant §7.10

### SALES-F02 Cobrar con tarjeta u otro medio sin cambio
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. Con la cuenta lista, pulsa «Cobrar · <total>».
2. En la hoja **Cobro**, toca **Tarjeta** (o el medio que sea; solo salen los medios activos que permiten los ajustes, y solo si hay más de uno).
3. Se lee «Importe exacto» y «Cobra <importe> en el datáfono y confirma.»: cobra en el datáfono aparte.
4. Pulsa «Cobrar <importe> con tarjeta». El resultado es el de SALES-F01.
Entra: los medios de pago del negocio.
Sale: la venta con un pago por el importe exacto y sin cambio (avisa: sale.completed, con el tipo de medio para que Caja no lo sume al efectivo). Si Impresión tiene activado abrir el cajón al vender, el cajón se abre también con tarjeta.
Si falla: el TPV no habla con el datáfono: si la tarjeta se rechaza, cierra la hoja sin confirmar. «Cobrar … con tarjeta» es el rótulo de cualquier medio sin cambio, también de Bizum o transferencia. Un medio creado sin decir su tipo cuenta como efectivo (SALES-F37).
Implicados: CASH_REGISTER-F13, PRINTING-F13, REC_FISCAL-F02, REC_PELUQUERIA-F09, REC_RESTAURANTE-F11, REC_RESTAURANTE-F17
QA: R-09, B-06, BD-11

### SALES-F03 Repartir el cobro entre varios medios de pago
Estado: parcial — repartir una cuenta en varios cobros permite pagar en efectivo una cuenta de 1.000 € o más (sales#502)
Vertical: comun
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. En la hoja **Cobro**, pulsa «Repartir el cobro». Arriba aparece «Restante».
2. Elige un medio, marca el «Importe de este cobro» (en efectivo, lo entregado) y pulsa «Añadir este cobro». Sin importe marcado, el cobro cubre todo lo que falta.
3. Los cobros tomados salen en «Cobros tomados»: tocar uno lo devuelve al teclado para corregirlo; la ✕ lo quita.
4. Cuando el restante llega a 0, pulsa «Cobrar <total>».
Entra: los medios de pago y lo que entrega el cliente.
Sale: una venta con una fila por medio; el cambio sale siempre del efectivo y nunca se reparte (avisa: sale.completed con la lista de pagos).
Si falla: mientras falte dinero, el botón dice «Faltan <importe>» y debajo «Faltan <importe> por cubrir para poder cobrar la venta.». Si el total cambió mientras se repartía: «El total ha cambiado mientras se repartía el cobro. Revisa los importes y vuelve a cobrar.».
Implicados: CASH_REGISTER-F13, REC_FISCAL-F02, REC_PELUQUERIA-F09, REC_RESTAURANTE-F11
QA: L-07, qa-hub-restaurant §7.10

### SALES-F04 Elegir tique o factura y los datos del cliente
Estado: parcial — el límite de la factura simplificada solo lo aplica la pantalla: por el asistente o la API se graba un tique por encima del límite, Facturación lo emite sin mirarlo (INVOICE-F01) y VeriFactu lo sella, con su número de la cadena gastado, y lo rechaza al validarlo antes de enviarlo: queda «Rechazado» sin salir del hub (REC_FISCAL-F03)
Vertical: comun
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. En la hoja **Cobro**, toca «Tique» o «Factura». Arranca en «Documento por defecto», o en «Factura» si «Emitir factura si el cliente tiene NIF» está encendido y el cliente asignado tiene NIF.
2. Con «Factura», debajo se piden «Nombre o razón social», «País», «NIF» y «Domicilio», ya rellenos si hay cliente asignado. Fuera de España se pide además el «Tipo de documento» (NIF-IVA de la UE, Identificación fiscal de su país, Pasaporte, Otro documento).
3. Si el importe pasa del límite de la factura simplificada del país del negocio, no hay botón «Tique»: sale «Esta venta no puede ser un tique» y los mismos datos.
4. Con los tres datos puestos se lee «Esta venta sale como factura completa» y se cobra como siempre.
Entra: el cliente asignado (Clientes) y el límite de la simplificada que da el hub.
Sale: la venta con su tipo de documento fijado al cobrar, que no se puede cambiar después; el nombre, NIF, dirección, país y tipo de documento del cliente viajan con el aviso de venta cobrada para la factura.
Si falla: sin los tres datos el botón dice «Faltan los datos del cliente» y no cobra; una factura sin esos datos la rechaza también el servidor por cualquier vía: «Una factura necesita el nombre, el NIF y la dirección del cliente. Rellénalos o cóbrala como tique.». El tique por encima del límite, en cambio, solo lo impide la pantalla.
Implicados: CUSTOMERS-F17, INVOICE-F01, INVOICE-F02, REC_FISCAL-F03, REC_PELUQUERIA-F11, REC_RESTAURANTE-F12
QA: L-01 (discrepa), L-02, R-09, B-06

### SALES-F05 Cobrar cuando el negocio exige cliente
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Con «Exigir cliente en cada venta» encendido y sin cliente, la cuenta enseña el chip «Falta el cliente» y «Cobrar» se ve bloqueado.
2. Al tocar «Cobrar» o el chip, sale «Este negocio exige un cliente en cada venta. Elige uno para seguir con el cobro.» y se abre el buscador de Clientes.
3. Elige o da de alta el cliente; el chip pasa a su nombre y «Cobrar» abre la hoja.
Entra: el cliente que elige el buscador de Clientes.
Sale: nada propio hasta cobrar; la venta lleva el cliente.
Si falla: sin la app Clientes, «Este negocio exige un cliente en cada venta y la aplicación Clientes no está instalada: esta venta no se puede cerrar desde aquí.». El servidor rechaza cualquier cobro sin cliente: «Este negocio exige un cliente en cada venta.».
Implicados: CUSTOMERS-F17, CUSTOMERS-F18
QA: ninguno

### SALES-F06 Recuperar un cobro que se quedó sin respuesta
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. Pulsa «Cobrar…» y el hub no contesta (se reinicia, se cae la red).
2. El TPV pregunta él solo (hasta dos veces) si ese intento de cobro llegó a grabarse.
3. Si se grabó, se cierra como un cobro normal. Si no, sale «El servidor no responde (puede estar reiniciándose). Inténtalo de nuevo en unos segundos y, si persiste, avisa al encargado.» y volver a pulsar no duplica la venta.
4. Si no se pudo saber, sale «No hemos podido confirmar si el cobro se completó. Compruébalo en Ventas antes de volver a cobrar.» con el botón «Comprobar en Ventas».
Entra: nada de otros componentes.
Sale: como mucho una venta por intento de cobro (la clave del intento se reutiliza en cada reintento).
Si falla: ver los pasos 3 y 4; nunca dice «no se ha cobrado» sin saberlo.
Implicados: ninguno
QA: qa-hub-restaurant §7.10

### SALES-F07 El TPV avisa de que hoy no puede cobrar
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Al abrir **Vender**, si falta algo sin lo que no se puede cobrar, sale un aviso arriba de la rejilla: la app Impuestos no está («Impuestos no está instalada, así que no se puede cobrar. Instálala desde el marketplace.»), o el negocio ya factura de verdad y sus tiques no llegarían a Hacienda («Este negocio ya factura de verdad y ERPlora todavía no puede enviar sus tiques a Hacienda…», o el de la conexión segura, o el del certificado propio caducado) con «Ir a la configuración fiscal».
2. «Cobrar» se ve bloqueado; al tocarlo repite el motivo y no abre la hoja.
3. Si el certificado propio caduca pronto, el aviso es informativo («El certificado propio del negocio caduca en N días…») con «Renovar certificado» y se sigue cobrando.
4. Si una app del catálogo está instalada pero no responde: «<App> no ha respondido, así que su catálogo puede estar incompleto…»; si Inventario no está instalado, la rejilla lo explica y se venden servicios y precio libre.
Entra: el estado fiscal y los límites del hub; el estado de Impuestos, Inventario y Servicios.
Sale: nada.
Si falla: si el hub no contesta a esa consulta, el TPV vende como siempre y el rechazo, si lo hay, llega al cobrar con la misma frase.
Implicados: TAXES-F19, REC_FISCAL-F01
QA: L-04

### SALES-F08 Cobrar sin la caja abierta
Estado: parcial — el bloqueo es de Caja (CASH_REGISTER-F04) y solo existe después de que el administrador guarde los ajustes de Caja con «Activar caja»: hasta entonces el TPV cobra sin caja abierta, la venta se graba y Caja no la apunta, sin decir nada; con el bloqueo armado, una orden rechazada fuera de la pantalla de apertura (cobrar con el TPV ya abierto cuando otro cierra la caja, anular o devolver desde **Ventas**) solo da el aviso genérico de Venta, sin mencionar la caja; y sin bloqueo, anular o devolver en efectivo sin caja abierta graba la venta anulada o devuelta, pero Caja rechaza el apunte y, tras los reintentos, queda en la cola de avisos fallidos sin que nadie en pantalla se entere
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Con los ajustes de Caja guardados y «Activar caja» encendido, sin ninguna sesión abierta, al entrar en **Vender** aparece en su lugar la tarjeta «Abrir sesión de caja» de Caja; al abrirla, el TPV aparece solo (CASH_REGISTER-F04).
2. Si la caja se cierra con el TPV ya abierto, «Cobrar» falla con «Error al cobrar»; anular sale con «No se ha podido anular la venta» y devolver con «No se ha podido registrar la devolución.». Lo rechaza el hub para cualquier orden de Venta, venga de la pantalla, del asistente o de la API.
3. Si los ajustes de Caja nunca se guardaron (o «Activar caja» está apagado), se vende y se cobra exactamente igual que en SALES-F01: la venta aparece en **Ventas** y en Caja no hay ningún movimiento suyo.
Entra: nada de Caja: el TPV no la lee; el bloqueo lo aplica el hub con los ajustes y la sesión abierta de Caja.
Sale: con el bloqueo armado, nada (la orden no entra). Sin él, la venta y el aviso de venta cobrada; Caja contesta bien y no escribe ningún apunte (CASH_REGISTER-F13).
Si falla: con el bloqueo armado, el rechazo no dice que la caja está cerrada. Sin él, nada en pantalla avisa y el descuadre aparece al cerrar la caja; y anular o devolver en efectivo graba la venta anulada o devuelta mientras Caja rechaza el apunte (CASH_REGISTER-F14, CASH_REGISTER-F15).
Implicados: CASH_REGISTER-F04, CASH_REGISTER-F13, REC_PELUQUERIA-F01, REC_RESTAURANTE-F01
QA: R-01, B-01, BD-04, BD-11
