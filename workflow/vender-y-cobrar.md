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
Sale: la venta cobrada e inmutable, con número `AAAAMMDD-NNNN` del día del negocio, sus líneas, su pago y su desglose de IVA (avisa: sale.completed). Si venía de una cuenta, la cuenta se cierra (avisa: order.completed). Caja apunta el cobro, Inventario descuenta stock, Clientes suma la compra, Facturación emite la factura simplificada, Mesas apunta lo cobrado y libera la mesa, Cocina retira las rondas; el hub imprime el tique según el interruptor.
Si falla: sin importe entregado el botón no cobra y se lee «Marca en el teclado el importe entregado»; corto, «Lo entregado no cubre el total». Un artículo sin IVA configurado sale con la marca «Falta el IVA» y al tocarlo dice «No se puede vender: sin categoría fiscal. Falta configurar el IVA.» (o «…su categoría fiscal no tiene tipo…»). Un rechazo al cobrar se pinta en la hoja con su frase (p. ej. «Un producto del tique ya no está en el catálogo. Quita la línea y vuelve a añadirla.») y la cuenta sigue intacta. Un empleado sin permiso de cobro recibe la petición de PIN de un responsable.
Implicados: pendiente
Pendiente de enlazar: cash_register — apuntar el cobro en la sesión de caja abierta
Pendiente de enlazar: inventory — descontar stock de lo vendido
Pendiente de enlazar: invoice — emitir la factura simplificada o completa de la venta
Pendiente de enlazar: verifactu — registrar y remitir el tique a la AEAT y devolver el QR
Pendiente de enlazar: customers — sumar la compra al historial del cliente
Pendiente de enlazar: printing — imprimir el tique al cobrar según «Imprimir tiquet»
Pendiente de enlazar: REC_FISCAL — del cobro al registro remitido a la AEAT
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
Sale: la venta con un pago por el importe exacto y sin cambio (avisa: sale.completed, con el tipo de medio para que Caja no lo sume al efectivo).
Si falla: el TPV no habla con el datáfono: si la tarjeta se rechaza, cierra la hoja sin confirmar. «Cobrar … con tarjeta» es el rótulo de cualquier medio sin cambio, también de Bizum o transferencia.
Implicados: pendiente
Pendiente de enlazar: cash_register — un cobro con tarjeta no entra en el efectivo esperado
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
Implicados: pendiente
Pendiente de enlazar: cash_register — sumar solo los cobros en efectivo, netos de cambio, al arqueo
QA: L-07, qa-hub-restaurant §7.10

### SALES-F04 Elegir tique o factura y los datos del cliente
Estado: hecho
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
Si falla: sin los tres datos el botón dice «Faltan los datos del cliente» y no cobra; el servidor rechaza igual otra vía: «Una factura necesita el nombre, el NIF y la dirección del cliente. Rellénalos o cóbrala como tique.».
Implicados: pendiente
Pendiente de enlazar: invoice — factura completa (F1) o simplificada (F2) según el documento elegido
Pendiente de enlazar: customers — el cliente asignado trae su nombre, NIF, dirección y país
QA: L-01, L-02, R-09, B-06

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
Implicados: pendiente
Pendiente de enlazar: customers — buscar, elegir o dar de alta el cliente desde el TPV
QA: ninguno

### SALES-F06 Recuperar un cobro que se quedó sin respuesta
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. Pulsa «Cobrar…» y el hub no contesta (se reinicia, se cae la red).
2. El TPV pregunta él solo, dos veces, si ese intento de cobro llegó a grabarse.
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
Implicados: pendiente
Pendiente de enlazar: taxes — sin Impuestos no se cierra ninguna venta
Pendiente de enlazar: REC_FISCAL — un negocio en real sin vía hasta la AEAT no cobra
QA: L-04

### SALES-F08 Cobrar sin la caja abierta
Estado: parcial — el TPV no comprueba la caja ni avisa: la venta se graba y Caja no la apunta, sin decir nada; anular o devolver en efectivo sin caja abierta graba la venta anulada o devuelta pero Caja rechaza el apunte
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Sin ninguna sesión de caja abierta, se vende y se cobra exactamente igual que en SALES-F01.
2. La venta aparece en **Ventas**; en Caja no hay ningún movimiento suyo.
Entra: nada de Caja (el TPV no la lee).
Sale: la venta y el aviso de venta cobrada; el apunte de caja no se escribe.
Si falla: nada en pantalla avisa; el descuadre aparece al cerrar la caja.
Implicados: pendiente
Pendiente de enlazar: cash_register — apuntar (o no) el cobro cuando no hay sesión abierta
QA: R-01, B-01, BD-04, BD-11
