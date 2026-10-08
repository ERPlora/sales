# WORKFLOW — Ventas / TPV

Prefijo: SALES
Alcance MVP: nucleo

> Contrato de comportamiento del módulo (pm#620, pm#621). Se lee antes de tocar el código y se
> actualiza en la misma PR que cambie un comportamiento. El detalle técnico vive en
> `architecture/modules/sales.md`; aquí se escribe lo que ve y hace la persona.

## Para qué sirve y para quién

Ventas / TPV es la caja registradora del negocio: se monta la cuenta tocando artículos, se cobra en
efectivo, con tarjeta o repartido, y queda una venta que ya no se puede cambiar, con su número del
día, su IVA y su tique o su factura. Sirve a los dos negocios: en el restaurante, la cuenta vive en
su mesa, se manda a cocina por rondas, se imprime la cuenta para la mesa y se divide o se junta; en
la peluquería, se cobra la cita desde la agenda, cada servicio lleva a su profesional y una sesión de
bono puede pagar una línea. Lo usan el **empleado** (camarero, recepcionista; con el rol «Cajero»
además cobra), el **responsable** (cobra, anula, devuelve, autoriza descuentos y precio libre con su
PIN, ve las cifras) y el **administrador** (todo, y es el único que guarda los ajustes desde la pestaña; el responsable puede
hacerlo por el asistente). Las mesas,
la cocina, los clientes, la caja, la factura y el envío a la AEAT son de otros módulos que reaccionan
a lo que pasa aquí.

## Referencia adoptada

Contrastada en `.claude/agents/qa-hub-restaurant.md` §2 (10/08/2026) y en `docs/` del módulo; se
adopta esto, no más:

- [Square — dividir por artículo y varios medios](https://squareup.com/help/gb/en/article/8421-new-order-and-pay-capabilities-with-square-for-restaurants)
  y [Lightspeed — dividir una cuenta](https://resto-support.lightspeedhq.com/hc/en-us/articles/226405708-Splitting-a-bill):
  cobrar por artículos, repartir el pago entre medios. No se adopta el reparto por asiento
  (decisión de 2026-08-26, sin comensal por línea).
- [Toast — anulaciones](https://doc.toasttab.com/doc/platformguide/adminVoidingOrders.html) y
  [Toast — devoluciones frente a anulaciones](https://doc.toasttab.com/doc/platformguide/adminRefundsAndVoids.html):
  anular con motivo y permiso antes de que se mueva el dinero; después, devolver, sin mezclar los dos caminos.
- [Toast — flujo de cocina](https://doc.toasttab.com/doc/platformguide/platformKDSWorkflowUsingCourses.html):
  la comanda nace al enviar, no al cobrar. Se adoptan rondas, no cursos con retención (kitchen#71, fuera del MVP).
- [Square — suplementos](https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers):
  grupos con mínimo y máximo y precio por opción.
- Lightspeed Restaurant (K-Series): notas rápidas preconfiguradas que se aplican de un toque (`docs/screens.md`).
- Fresha / Vagaro: cada servicio del tique lleva al profesional que lo hizo; la cita se cobra sin volver a teclearla.
- [AEAT — facturas simplificadas](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2025/capitulo-10-obligac-formales-suj-registro/obligaciones-materia-facturacion/facturas-simplificadas.html)
  y [VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html):
  tique hasta el límite, factura completa con nombre, NIF y domicilio por encima o a petición, copia marcada como duplicado.
  Ley 7/2012 art. 7: nada en efectivo desde 1.000 € en un negocio de España.

## Antes de empezar

- **Impuestos** se instala con Ventas y no se puede quitar: sin sus reglas de IVA no se cierra
  ninguna venta. **Inventario** es opcional: sin él el TPV vende servicios y a precio libre, y lo dice
  en la rejilla.
- De fábrica hay dos medios de pago: Efectivo y Tarjeta. Bizum, transferencia u otro se añaden con
  el asistente diciendo su tipo; sin tipo nacen como efectivo (SALES-F37).
- Venta por peso: hoy solo tecleando la cantidad; no hay lector de báscula (SALES-F10).
- Los artículos tienen que tener categoría de IVA con tipo; si no, salen marcados «Falta el IVA» y no se venden.
- Si se factura de verdad con VeriFactu, la vía hasta la AEAT tiene que estar lista o el TPV no cobra (SALES-F07).
- Antes de abrir al público, abre la caja en **Caja**. El TPV solo lo exige si el administrador ha guardado los ajustes de Caja con «Activar caja» (entonces sale «Abrir sesión de caja» en lugar del TPV); sin ellos se cobra sin caja y Caja no apunta nada (SALES-F08, CASH_REGISTER-F04).

Configuración inicial, paso a paso:

1. **Ajustes** del módulo: medios permitidos, descuentos y descuento máximo, cliente obligatorio,
   documento por defecto, cabecera y pie del tique (SALES-F34).
2. **Departamentos**, si se cobra a precio libre (frutería, varios) (SALES-F35).
3. **Notas rápidas**, si la cocina recibe instrucciones repetidas (SALES-F36).
4. Haz una venta de prueba con cada medio y comprueba el tique, el QR y la caja (SALES-F01, SALES-F02, SALES-F29).

El día completo de cada negocio, de punta a punta, está en los recorridos `REC_RESTAURANTE` y
`REC_PELUQUERIA` (oleada 2), y el camino fiscal, del cobro a la AEAT, en `REC_FISCAL`
(`architecture/workflows/cadena-fiscal.md`).

## Pantallas

### Vender
Menú **Ventas / TPV → Vender**; se abre a pantalla completa (el menú ⋮ de la tira de categorías
tiene «Pantalla completa» / «Salir de pantalla completa»). Dos zonas. **Catálogo**: tira de
categorías con su número de artículos («Todos» primero), lupa que abre el buscador («Buscar
producto…», por nombre o SKU), y la rejilla: menús primero (con «Menú»), artículos y servicios con
foto o iniciales, unidad y precio, y al final la baldosa «Precio libre». **Cuenta** (en el móvil, un
cajón que abre el botón flotante con el total): arriba, pausa («Aparcar esta cuenta»; con mesa, deja
la cuenta en la mesa), los botones de mesa y de cliente que ponen Mesas y Clientes, «Cuentas abiertas» con su
número, y «Cerrar» en el móvil; el título editable («Cuenta nueva») y los chips de mesa, cliente,
«Atiende …» y «Falta el cliente»; con Cocina, las pestañas «Cuenta» y «Comanda actual». Cada línea:
nombre, precio por unidad, marca de descuento o «Invitación», nota y profesional debajo; botones de
descuento, nota, invitación y selector de cantidad (una línea enviada a cocina solo enseña su
cantidad, «Comanda N» y el botón ⊗ «Anular este artículo»). Pie: fila «Descuento del ticket» si lo hay, «Total», botón de descuento,
impresora («Imprimir cuenta») y «Cobrar · <importe>». Hojas que se abren encima: precio libre,
suplementos, menú, nota, descuento, «Anular «<artículo>»» (motivo de un toque o escrito),
«Aparcar cuenta», «Quién atiende esta cuenta», «Tienes una cuenta
a medias». Vacía: «Toca un producto para añadirlo.» y, sin artículos, «Sin productos.» (o el motivo:
Inventario no instalado, servicios ocultos por el ajuste). Avisos arriba de la rejilla: app que
falta o no responde, sin envío a Hacienda, certificado que caduca, artículos sin IVA («N artículos no
se pueden vender…» con «Revisar el catálogo», solo a quien puede arreglarlo). Error de carga: «Error
cargando el POS».

### Cobro
Hoja que abre «Cobrar». Arriba, el importe grande (el que calcula el servidor), «Cobrando N líneas
de <total>» si hay líneas marcadas y «Restante» al repartir. A un lado: resumen plegable en el móvil
(«Tique»/«Factura», cliente, «Bono aplicado»/«Sin bono»), los datos del cliente cuando hacen falta,
«Líneas pagadas de otra forma» con el hueco de Servicios, y «Tique» / «Factura». Al otro: «Cobros
tomados», los medios de pago (efectivo no disponible desde 1.000 €, con su motivo), «Entregado»,
«Cambio» y el teclado en efectivo, o «Importe exacto» y «Cobra <importe> en el datáfono y confirma.»
con otro medio; «Repartir el cobro», «Añadir este cobro» e «Imprimir tiquet». Pie: el motivo si no se
puede cobrar, el aviso de lo que se enviará a cocina, y «Cobrar <importe>» («Cobrando…» mientras va).

### Cuentas abiertas
Desplegable del icono de tique de la cuenta. «Aparcar esta cuenta» (o «Dejar en la mesa» si la
cuenta tiene mesa) con su explicación, «Cuentas abiertas» y «Toca una cuenta para retomarla.», y una fila por cuenta abierta
del negocio (título o importe, hora e importe) con su papelera. Vacía: «No hay cuentas abiertas».
Un fallo se pinta encima de las filas.

### Cuenta (precuenta)
Ventana «Cuenta» que abre la impresora del pie: el papel que se lleva a la mesa, con el aviso «Cuenta
— no es una factura. El tiquet fiscal se entrega al cobrar.», y los botones de imprimir y cerrar.

### Ventas
Menú **Ventas / TPV → Ventas**. Título «Ventas», periodo («Hoy», «7 días», «30 días», «Todo»), seis
cifras («Tickets», «Ingresos», «Ticket medio», «IVA», «Descuentos», «Anuladas») y la tabla (Fecha,
Número, Cliente, Pago, Estado, Total) con buscador «Buscar número o cliente…», filtros, vista tabla o
tarjetas, 50 por página. Por fila: «Documento», «Reimprimir» y, según permiso, «Anular» y «Devolver».
Vacía: «Aún no hay ventas.»; cargando: «Cargando…»; error: el aviso con reintento.

### Documento de venta
Ventana del tique o la factura de una venta: el papel tal como se imprime (líneas, IVA, total, forma
de pago, cambio, QR fiscal y «Pide tu factura»), la ✕ y la impresora. Mientras llega el número
fiscal: «Emitiendo el tique…» o «Emitiendo la factura…»; error: «Error cargando el documento».

### Devolver
Ventana «Devolver la venta <número>» desde **Ventas**: explicación, una tarjeta por forma de pago
(«Cobrado», «Ya devuelto», «Devolvible», «Importe a devolver» y, si hace falta, «Devolver por»),
«Devolver todo», «Motivo», «Se devuelve», las líneas pagadas por bono con su hueco, encima del botón
el hueco `sales.reversal.notice` (lo que la devolución entera deshace en otros módulos: el aviso del
bono vendido en la venta, SERVICES-F14) y «Devolver <importe>». Cargando: «Cargando lo que se puede
devolver…»; nada que devolver: «No queda nada por devolver en esta venta.».

### Anular venta
Ventana «Anular la venta <número>» desde **Ventas** (antes un aviso emergente): la explicación, el
«Motivo (obligatorio)», el hueco `sales.reversal.notice` encima del botón (lo que la anulación deshace
en otros módulos: el aviso del bono vendido en la venta, SERVICES-F27) y «Anular» / «Cancelar».
Sin motivo, el aviso sale en la ventana; mientras anula, «Anular» queda desactivado; un rechazo se
lee dentro de la ventana, que sigue abierta. Sin nadie que rellene el hueco, no ocupa sitio.

### Notas rápidas
Menú **Ventas / TPV → Notas rápidas** (solo con permiso de ajustes). Explicación, tabla (Nota,
Posición) con buscador, **+** para añadir y, por fila, «Editar» y «Eliminar». Vacía: «Todavía no hay
notas rápidas…»; cargando: «Cargando notas rápidas…».

### Departamentos
Menú **Ventas / TPV → Departamentos** (solo con permiso de ajustes). Explicación, tabla (Nombre, IVA
que cobra, Posición), **+** y, por fila, «Editar» y «Eliminar». Vacía: «Todavía no hay
departamentos…»; cargando: «Cargando departamentos…».

### Ajustes
Pestaña «Ajustes» que añade el hub (cabecera «TPV»): un interruptor o campo por ajuste (SALES-F34) y
«Guardar». Cargando: «Cargando ajustes…»; error: «No se pudieron cargar los ajustes.».

## Flujos

El detalle de cada flujo (pasos, datos, fallos, implicados y QA) vive en `workflow/`, con la misma
gramática y el mismo prefijo. Huecos (`parcial`, `no hecho`): el porqué está en la línea `Estado:`.

| ID | Flujo | Vertical | Estado | Fichero |
|---|---|---|---|---|
| SALES-F01 | Vender y cobrar en efectivo | comun | hecho | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F02 | Cobrar con tarjeta u otro medio sin cambio | comun | hecho | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F03 | Repartir el cobro entre varios medios de pago | comun | parcial | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F04 | Elegir tique o factura y los datos del cliente | comun | parcial | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F05 | Cobrar cuando el negocio exige cliente | comun | hecho | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F06 | Recuperar un cobro que se quedó sin respuesta | comun | hecho | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F07 | El TPV avisa de que hoy no puede cobrar | comun | hecho | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F08 | Cobrar sin la caja abierta | comun | parcial | [workflow/vender-y-cobrar.md](workflow/vender-y-cobrar.md) |
| SALES-F09 | Vender a precio libre por departamento | comun | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F10 | Vender por peso, con o sin báscula | comun | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F11 | Elegir los suplementos de un artículo | comun | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F12 | Componer un menú | restaurante | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F13 | Poner una nota en una línea | comun | hecho | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F14 | Aplicar un descuento a una línea o a la cuenta | comun | hecho | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F15 | Invitar una línea | comun | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F16 | Atribuir la cuenta o una línea a quien atiende | comun | hecho | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F17 | Aparcar una cuenta y recuperarla | comun | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F18 | Eliminar una cuenta abierta | comun | parcial | [workflow/la-cuenta.md](workflow/la-cuenta.md) |
| SALES-F19 | Abrir la cuenta de una mesa y dejarla en la mesa | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F20 | Enviar la comanda a cocina | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F21 | Imprimir la cuenta para la mesa (precuenta) | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F22 | Cobrar solo una parte de la cuenta | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F23 | Dividir la cuenta de una mesa | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F24 | Juntar las cuentas de dos mesas | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F25 | Pasar la cuenta a otra mesa | restaurante | parcial | [workflow/sala-y-cocina.md](workflow/sala-y-cocina.md) |
| SALES-F26 | Cobrar una cita desde la agenda | peluqueria | parcial | [workflow/peluqueria.md](workflow/peluqueria.md) |
| SALES-F27 | Pagar una línea con un bono | peluqueria | parcial | [workflow/peluqueria.md](workflow/peluqueria.md) |
| SALES-F28 | Consultar el historial y las cifras de ventas | comun | parcial | [workflow/historial-y-correcciones.md](workflow/historial-y-correcciones.md) |
| SALES-F29 | Ver y reimprimir el documento de una venta | comun | hecho | [workflow/historial-y-correcciones.md](workflow/historial-y-correcciones.md) |
| SALES-F30 | Anular una venta cobrada | comun | parcial | [workflow/historial-y-correcciones.md](workflow/historial-y-correcciones.md) |
| SALES-F31 | Devolver una venta (toda, una parte o por otro medio) | comun | parcial | [workflow/historial-y-correcciones.md](workflow/historial-y-correcciones.md) |
| SALES-F32 | Devolver la sesión de un bono | peluqueria | parcial | [workflow/historial-y-correcciones.md](workflow/historial-y-correcciones.md) |
| SALES-F33 | Unir las ventas de dos fichas de cliente | comun | hecho | [workflow/historial-y-correcciones.md](workflow/historial-y-correcciones.md) |
| SALES-F34 | Ajustar el TPV | comun | parcial | [workflow/configuracion.md](workflow/configuracion.md) |
| SALES-F35 | Dar de alta y ordenar los departamentos del precio libre | comun | hecho | [workflow/configuracion.md](workflow/configuracion.md) |
| SALES-F36 | Preparar las notas rápidas | comun | hecho | [workflow/configuracion.md](workflow/configuracion.md) |
| SALES-F37 | Añadir un medio de pago (Bizum, transferencia…) | comun | parcial | [workflow/configuracion.md](workflow/configuracion.md) |

## Qué comparten los verticales

Tocar una pieza de esta tabla afecta al restaurante **y** a la peluquería: hay que revisar todos los
flujos de su fila en la misma entrega.

| Pieza compartida | Flujos que la usan |
|---|---|
| La puerta del cobro (una sola orden de cobro y su gemela «por encima del límite»): mismo precio del servidor, mismo IVA, mismos rechazos, mismo aviso de venta cobrada que escuchan Caja, Inventario, Clientes, Facturación, Mesas y Servicios | F01–F06, F22, F26, F27 |
| La cuenta abierta (pedido) y sus líneas: el precio se congela al añadir la línea; aparcar, recuperar, mesa y cita son la misma cuenta | F09–F19, F22–F27 |
| La hoja **Cobro**: medios, teclado, tique o factura, datos del cliente, bono por línea | F01–F05, F22, F26, F27 |
| La marca de líneas: sirve para cobrar una parte y para dividir la cuenta | F22, F23 |
| El chip «Atiende» y el sello de la línea: camarero en el restaurante, profesional en la peluquería | F16, F19, F20, F26 |
| El hueco «asignar» de la cabecera: mesa (Mesas) y cliente (Clientes) en el mismo sitio | F05, F17, F19, F23, F24, F25 |
| La ventana **Devolver**: dinero por forma de pago y sesión de bono en la misma confirmación | F31, F32 |
| La anulación de una venta: un solo aviso, y quién reacciona decide el efecto en cada negocio (Mesas solo deja de contar el cobro: la cuenta y la mesa siguen como estaban; Servicios devuelve la sesión de bono y anula el bono intacto que se vendió en esa venta; Citas no desmarca la cita) | F22, F26, F27, F30 |
| El aviso de cuenta cerrada al cobrar la cuenta entera: Mesas libera la mesa y Cocina cierra sus rondas (cancela las pendientes) | F01, F20, F22 |
| Las marcas de invitación y de «pagada por bono» de cada línea: el servidor las toma del cobro tal cual | F15, F27 |
| Los ajustes del TPV: los mismos interruptores para los dos negocios (no hay ajuste por vertical) | F34 y todos los de cobro |

## Cobertura contra la referencia

| Elemento de la referencia | Estado | Flujo |
|---|---|---|
| Venta rápida desde catálogo, búsqueda, cantidad | hecho | F01 |
| Efectivo con cambio; entregado obligatorio | hecho | F01 |
| Tarjeta u otro medio por importe exacto | hecho (sin integración con datáfono) | F02 |
| Pago mixto que cuadra al céntimo | hecho | F03 |
| Efectivo prohibido desde 1.000 € (también en un mixto) | parcial: se salta repartiendo la cuenta en varios cobros (sales#502); sin tope de 10.000 € para no residentes (sales#501) | F03 |
| Tique o factura completa | hecho | F04 |
| Sin tique por encima del límite de la simplificada | parcial: solo en pantalla; por asistente o API se graba, Facturación lo emite y VeriFactu lo sella y lo rechaza antes de enviarlo | F04 |
| Cliente extranjero (país y tipo de documento) | hecho | F04 |
| Cliente obligatorio pedido al cobrar | hecho | F05 |
| Doble toque o reintento: una sola venta | hecho | F06 |
| No cobrar sin vía hasta la AEAT | hecho | F07 |
| Cobrar solo con caja abierta | parcial: lo impone Caja (CASH_REGISTER-F04) solo tras guardar sus ajustes; el rechazo fuera de la pantalla de apertura no menciona la caja | F08 |
| Precio libre por departamento con su IVA | hecho | F09 |
| Precio libre solo con permiso o PIN del responsable | parcial: solo por la pantalla; por otras puertas entra con permiso de empleado | F09 |
| Precio de un servicio decidido por el catálogo | parcial: la pantalla toma el de Servicios (o el pactado en la cita), pero el servidor cobra el que se le manda | F09, F26 |
| Venta por peso tecleando la cantidad | hecho | F10 |
| Venta por peso con báscula | no hecho: nada lee la báscula ni manda el peso | F10 |
| Suplementos con mínimo y máximo | parcial: solo la hoja del TPV los hace cumplir (MODIFIERS-F06) | F11 |
| Menú con elecciones y reparto de IVA | hecho | F12 |
| Cada plato del menú a su estación de cocina | hecho (con Cocina); un menú sin nada elegido sale como una línea y uno a medias no avisa de lo que falta (sales#535, KITCHEN-F06, COMBOS-F11) | F12, F20 |
| Nota de línea y notas rápidas | hecho | F13, F36 |
| Descuento de línea, de cuenta, en % o importe, con PIN por encima del tope | hecho | F14 |
| Invitación con motivo, permiso y auditoría | parcial: sin motivo ni permiso propio, y el servidor acepta la marca que venga | F15 |
| Camarero o profesional por cuenta y por línea, transferible | hecho | F16 |
| Aparcar y recuperar con título | hecho | F17 |
| Anular una cuenta abierta con motivo y permiso | parcial: permiso sí, motivo no | F18 |
| Cuenta por mesa, dejarla en la mesa | parcial: con una cuenta de barra delante, tocar una mesa con pedido la deja libre (TABLES-F11) | F19 |
| Enviar a cocina por rondas, sin duplicar | hecho (con Cocina) | F20 |
| Cobrar sin cancelar lo que se está cocinando («pide y paga») | no hecho: al cobrar la cuenta entera Cocina cancela las rondas pendientes (leído en el código, sin ejecutar) | F20 |
| Anular una línea ya enviada con aviso a cocina | parcial: el TPV la anula con motivo y PIN del responsable y la quita de la cuenta, y Ventas avisa (`sales.order.line_voided`) y Cocina tacha el plato con su motivo (KITCHEN-F29); el vale en papel de un solo plato aún no sale (hub#2640) | F20 |
| Precuenta no fiscal | parcial: sin aviso si el papel no sale | F21 |
| Cobrar por artículos | hecho | F22 |
| Dividir a partes iguales o por fracción de una línea | no hecho | F22, F23 |
| Dividir moviendo líneas; deshacer el split | parcial: mover sí, deshacer no | F23 |
| Juntar mesas sin perder ni duplicar líneas | parcial: las líneas sí; un fallo no se ve y las rondas de la cuenta absorbida no se cierran | F24 |
| Transferir mesa | parcial: desde una mesa dividida se pasa una de sus dos cuentas sin elegir cuál (TABLES-F15) | F25 |
| Cobrar la cita sin volver a teclear | hecho (el IVA del servicio lo pone Servicios aunque el TPV no lo haya cargado) | F26 |
| Bono que paga una línea de servicio | hecho (con Servicios); el servidor no comprueba que el bono exista (sales#539) | F27 |
| Propina | fuera del MVP (pm#100) | — |
| Historial con cifras del día | parcial: las devoluciones parciales no restan | F28 |
| Informe por profesional / por camarero | parcial: solo por el asistente o la API | F28 |
| Reimpresión marcada como duplicado | hecho | F29 |
| Anular antes de que se mueva el dinero, con motivo | hecho | F30 |
| Anular deja registro de anulación fiscal | no hecho: la factura simplificada (o la completa que la sustituyó) y su registro siguen vivos (INVOICE-F07, REC_FISCAL-F13) | F30 |
| Anular revierte todo lo que la venta movió | parcial: caja, stock, cliente, mesa y bono sí; la cita no; la mesa se libera aunque la cuenta siga abierta | F30 |
| Devolución total o parcial por el medio original o por otro | hecho | F31 |
| Devolución que ajusta la caja y el historial del cliente | parcial: caja solo con caja abierta; el cliente no se ajusta | F31 |
| Devolución por artículos con vuelta de stock | no hecho | F31 |
| Devolución → rectificativa | hecho (en Facturación, INVOICE-F09 e INVOICE-F10; VeriFactu la registra, VERIFACTU-F14); parcial si la venta aún no tenía factura | F31 |
| Devolver la sesión del bono | parcial (sales#512; imposible tras devolver todo el dinero) | F32 |
| Reabrir una cuenta cobrada | no hecho, a propósito: se devuelve o se anula | — |
| Abrir el cajón al cobrar | hecho fuera de este módulo: el hub lo abre en el dispositivo que cobró si Impresión lo tiene activado, con cualquier forma de pago (PRINTING-F13) | F01, F02 |
| Abrir el cajón «sin venta» | fuera de este módulo (Caja / Impresión) | — |
| Dar de alta, editar y desactivar medios de pago en pantalla | parcial: alta solo por el asistente (sin tipo nace como efectivo); editar, desactivar y borrar no existen | F37 |
| Ajustes del TPV | parcial: en la pestaña solo guarda el administrador; el responsable solo por el asistente | F34 |

## Datos: de quién es cada dato

- **Propios**: las cuentas abiertas (pedidos) y sus líneas; las ventas, sus líneas, sus pagos y su
  contador diario; las devoluciones y sus pagos; los medios de pago; los ajustes del TPV (uno por
  hub); los departamentos y las notas rápidas. Otros módulos los leen solo por consultas públicas:
  Facturación lee la venta al facturarla; las pantallas de Caja e Inventario la leen solo para
  poner el número de venta a sus movimientos; Impresión lee los ajustes del TPV y el nombre del
  negocio. Caja, Inventario, Clientes, Mesas, Servicios, Cocina y Citas reaccionan a los avisos, no
  consultan.
- **Leídos de otros, por consulta**: artículos, categorías y unidades (Inventario); categorías y
  reglas de IVA (Impuestos); servicios (Servicios); suplementos (Suplementos); menús (Combos); la cita
  (Citas); el equipo (Personal) y las personas del hub; la factura (Facturación) y el registro fiscal
  (VeriFactu); el ajuste de impresión automática (Impresión); límites y estado fiscal del hub. El
  precio de una línea se congela al añadirla a la cuenta; el IVA se resuelve al cobrar y la línea de
  venta guarda categoría, tipo, país, región y regla. La calificación (exenta, no sujeta…) y la
  familia del impuesto no se guardan: Facturación las resuelve al emitir con las reglas de ese día, y
  si el tipo cambió entre el cobro y la emisión la factura se rechaza (TAXES-F07, INVOICE-F06).
- **Mesa y cliente no viven aquí**: Mesas guarda qué cuenta tiene cada mesa y Clientes qué cuenta
  tiene cada cliente. Ventas guarda en la venta el nombre del cliente y su ficha como referencia;
  el NIF, la dirección y el país solo viajan en el aviso de venta cobrada.
- **Datos personales** (inventario RGPD, recorrido sobre las 40 migraciones):
  - venta: ficha de cliente enlazada y nombre del cliente; notas libres de la venta (las que mande
    quien cobra por el asistente o la API; la pantalla no las pide); quién cobró, quién atendió
    (persona o profesional), quién anuló, el motivo de la anulación (también copiado en las notas) y
    la cita de origen;
  - cobro: referencia libre de cada forma de pago (puede llevar un código de tarjeta o el concepto y
    el nombre de quien transfiere);
  - línea de venta y de cuenta: nota libre (puede llevar alergias: dato de salud), motivo de
    invitación y profesional de la línea; en la de cuenta, el motivo de anular una línea ya enviada
    y quién la autorizó;
  - cuenta abierta: título libre (suele llevar el nombre del cliente, «Ana — terraza»), notas, cita
    de origen, quién autorizó un descuento (en la cuenta y en la línea);
  - devolución: motivo y nota libres; quién la hizo;
  - en todas las tablas: quién creó y cambió cada fila;
  - tablas retiradas en la migración 013 (carrito y tiques aparcados antiguos) ya no existen;
  - copias fuera de Ventas: el aviso de venta cobrada lleva ficha, nombre, NIF, dirección, país y tipo
    de documento del cliente, quién atendió (el de la venta; el de cada línea no viaja) y la
    referencia de cada pago; el de venta nacida de una cita, la cita, quién atendió y el total; el de
    anulación, quién anuló y el motivo; el de devolución, quién devolvió y el motivo; el envío a
    cocina, el nombre de la mesa, las notas de línea y el camarero; el de línea anulada, el motivo.
  - No hay borrado RGPD propio: las ventas son registros fiscales que se conservan; ver Dudas.

## Reglas que no se rompen

Solo las que hace cumplir el servidor, por cualquier puerta (pantalla, asistente, API). Lo que solo
impide la pantalla está como hueco en su flujo.

- **Aislamiento**: toda lectura y escritura va con el hub; una venta, cuenta o medio de pago de otro
  hub no casa.
- **La venta no se edita**: una vez cobrada solo se anula o se devuelve; el número (`AAAAMMDD-NNNN`,
  día del negocio) lo da un contador atómico y nunca se reescribe.
- **El precio de un artículo de Inventario lo decide el servidor**: sale del catálogo o, en una
  cuenta abierta, de la fila congelada al pedir; un artículo que no está en el catálogo se rechaza.
  El IVA de una línea con categoría lo resuelve Impuestos con el país del negocio, y una categoría sin
  regla se rechaza. El nombre y el tipo del medio de pago salen del catálogo del hub. Céntimos
  enteros. (El precio de un servicio o de una línea libre y las marcas de invitación y de «pagada
  por bono» son los que se mandan: F09, F15, F26, F27.)
- **El IVA de un servicio lo decide Servicios**: una línea que nombra un servicio toma su categoría
  fiscal del catálogo de Servicios (también de un servicio archivado), por encima de la que mande el
  cobro o la que quedó congelada en la cuenta; en una cuenta abierta, qué servicio es (y si la línea
  es un servicio) lo dice la fila de la cuenta, no el cobro; un servicio que no existe, sin categoría
  o sin el catálogo de Servicios se rechaza. Un bono se vende como línea de servicio con el id del
  bono y conserva el IVA que manda el cobro. Una línea que no nombra artículo, servicio ni
  departamento tiene que traer su tipo de IVA o se rechaza: ninguna sale al 0 % porque nadie la
  clasificó.
- **Los pagos suman el total al céntimo**; el cambio sale del efectivo; un efectivo corto se rechaza.
- **Nada en efectivo desde 1.000 € en un negocio de España** dentro de la misma venta, aunque lo
  autorice un responsable (repartiendo la cuenta en varios cobros se salta: F03).
- **Factura completa solo con nombre, NIF y domicilio.**
- **Un intento de cobro, una venta**; una clave de devolución, una devolución.
- **Anular exige motivo y solo vale para una venta completada, sin devoluciones y no cobrada como
  factura completa**; **devolver exige motivo** y ninguna forma de pago devuelve más de lo que cobró
  menos lo ya devuelto. Anular y devolver a la vez la misma venta: gana una y la otra se rechaza.
- **Cliente obligatorio, descuentos permitidos y descuento máximo** los comprueba el servidor al
  cobrar y al aplicar el descuento.
- **Una línea enviada a cocina no se cambia ni se quita: se anula**, con motivo y permiso de
  responsable, y solo si la cuenta está abierta y la línea sin cobrar (`sales.order_line_not_voidable`);
  pedir que se quite la rechaza (`sales.order_line_not_removable`). Cobrar la cuenta y anular o
  quitar una de sus líneas a la vez: gana uno y el otro se rechaza; una línea anulada o quitada nunca
  entra en la venta (`sales.order_changed`). Cambiar la cantidad, la invitación o el descuento de una línea,
  añadir una, partirla, poner o quitar el descuento de la cuenta, dividirla o juntarla también
  esperan al cobro de esa cuenta: lo que llega tarde se rechaza (`sales.order_changed`), y el cobro
  no cobra nada si lo que cobra ya no coincide con la cuenta (otra cantidad, otra invitación, otro
  descuento de línea o de tique o, al cerrarla, una línea sin cobrar que no estaba en el cobro).
  Partir una línea tampoco parte nada si, mientras esperaba, otro dispositivo le cambió la
  cantidad, la invitación o el descuento (`sales.order_changed`): no se pierde ni se inventa
  ninguna unidad. Dividir y juntar mueven líneas enteras y lo ya cobrado no viaja.
- **Permisos** (si el permiso es de responsable, el hub pide su PIN): montar la cuenta, enviar a
  cocina, dividir, juntar y descuento hasta el tope: empleado; cobrar: cajero y responsable;
  descuento por encima del tope, anular una cuenta abierta o una línea ya enviada, anular y devolver
  una venta, ver cifras,
  departamentos, notas rápidas y ajustes: responsable. El permiso de precio libre solo lo exige la
  puerta que usa la pantalla (F09).
- Sin vía hasta la AEAT en un negocio que factura de verdad no se cobra (lo decide el hub).

## Lo que NO hace, a propósito

- No guarda mesas ni clientes en la cuenta: son de Mesas y Clientes.
- No emite facturas ni habla con la AEAT: eso es de Facturación y VeriFactu.
- No mueve stock ni cuadra la caja: lo hacen Inventario y Caja al oír la venta.
- No imprime ni abre el cajón por sí mismo: el hub imprime el tique al oír la venta, según «Imprimir
  tiquet», y abre el cajón si Impresión lo tiene activado, con cualquier forma de pago (PRINTING-F07,
  PRINTING-F13).
- No habla con el datáfono: la tarjeta se cobra fuera y se confirma aquí.
- No tiene propinas (pm#100), ni comensal por línea, ni cursos con retención (kitchen#71).
- No reabre una venta cobrada ni cambia su tipo de documento.
- No reprecia una cuenta abierta: si el catálogo cambia, la cuenta conserva el precio con que se pidió.

## Dudas abiertas

Se resuelven con `market-decision`; no las decide el worker.

1. ¿El bloqueo de cobrar con la caja cerrada debe venir armado sin esperar a que se guarden los ajustes de Caja, y el rechazo debe decir que la caja está cerrada? Hoy, sin ajustes guardados se cobra y Caja no lo apunta (F08, CASH_REGISTER-F04).
2. Anular un tique: ¿debe anular su factura simplificada (o la completa que la sustituyó) y dejar
   registro de anulación en VeriFactu, o la anulación de un tique ya remitido tiene que ser una
   devolución con rectificativa? (F30, L-04)
3. Al anular una venta, ¿se desmarca la cita? (La sesión de bono ya vuelve y el bono intacto que
   se vendió en ella se anula: SERVICES-F27.) ¿Y la mesa de un cobro parcial debe seguir ocupada?
   (F30)
4. Cobrar la cuenta entera con rondas en cocina: ¿qué tiene que pasar con lo que aún se está
   cocinando? Hoy se cancela (F20).
5. ¿La invitación pide motivo y permiso propio (como Toast) o basta el de montar la cuenta? (F15)
6. ¿Eliminar una cuenta abierta pide motivo, y qué pasa con su mesa? (F18; sus rondas de cocina se cancelan desde kitchen#162, como en Toast)
7. ¿El responsable debe poder guardar los ajustes del TPV en la pestaña, como ya puede por el asistente? (F34)
8. Devolver por artículos (con vuelta de stock) frente a devolver dinero por forma de pago (F31).
9. ¿«Ingresos» resta las devoluciones parciales? (F28)
10. ¿Hace falta pantalla para el informe por profesional y para los medios de pago? (F28, F37)
11. El nombre del cliente en ventas cobradas: ¿qué se borra en una petición RGPD, si las ventas se
   conservan como registro fiscal?

## Fuentes contrastadas

Contra `origin/main` v2.16.154 (05/10/2026). Una línea por discrepancia; manda el código.

- **`docs/limits.md` y `hand-book/modulos/sales.md`**: «Inventario e Impuestos son obligatorios y no se pueden desinstalar»; solo Impuestos lo es, Inventario es opcional desde sales#25 (`module.json` `depends_on`).
- **`docs/screens.md`** («Search by sale number, payment method or customer name»): el buscador del historial busca por número y cliente; la forma de pago se filtra, no se busca (F28).
- **`docs/screens.md`** (sección del TPV): cita «Requires `sales.add_sale` … `sales.take_payment`», pero no dice que un empleado sin `take_payment` recibe la petición de PIN; tampoco que precio libre y eliminar cuenta piden PIN a empleado y cajero (F09, F18).
- **`docs/screens.md`** («Notas rápidas … plus a TPV settings tab»): la pestaña se llama «Ajustes» (la nombra el hub) y solo el administrador puede guardar (F34).
- **`docs/screens.md` y `docs/overview.md`**: «three tabs»/«four slots»; hay cuatro pestañas propias (Vender, Ventas, Notas rápidas, Departamentos) y seis huecos (cuatro en Vender, uno en Devolver y `sales.reversal.notice`, que montan Anular venta y Devolver).
- **`docs/overview.md`** (quién reacciona a la venta): nombra a Cocina y VeriFactu y omite a Mesas y Servicios; Cocina escucha el envío y el cierre de la cuenta, VeriFactu escucha a Facturación.
- **`docs/concepts.md`** («To correct a completed sale, void it … `sale.voided` is emitted so stock comes back»): cierto para stock y caja, pero la factura simplificada y su registro VeriFactu no se anulan (F30).
- **`architecture/modules/sales.md`** (tabla de permisos): no lista `take_payment`, `sell_open_price`, `discount.over_limit` ni `refund_sale`, y dice que el empleado «crea ventas»; sin `take_payment` no cobra.
- **`architecture/modules/sales.md`** (cruce con Mesas): dice que fusionar suma líneas idénticas con un ayudante de la pantalla; el código mueve las filas en el servidor (F24).
- **`architecture/modules/sales.md`** (servicios): «un servicio de precio abierto se pinta bloqueado»; hoy abre la hoja de precio libre con el precio como sugerencia (F09).
- **`architecture/modules/sales.md`** (diagrama de eventos): incluye `orders` (retirado) y a Cocina generando la comanda desde la venta cobrada.
- **`locales/es.json` `settings.fields.max_discount_percent.description`** («la venta guarda quién lo autorizó»): lo guarda la cuenta abierta (y su línea), no la venta.
- **`locales/es.json`** tiene claves de pantallas retiradas (pantalla de venta táctil/escritorio, caducidad de aparcados, «Sincronizar productos/servicios»); no se pintan en ninguna parte.
- **Ajustes, «Documento por defecto»**: las opciones salen en la pantalla española como «ticket» e «invoice» (no hay traducción de las opciones) (F34).
- **Invitación**: el motivo que se guarda es el texto fijo «Invitación» (`erp-pos-touch.ts`), y el tique y la cuenta impresa añaden otro texto fijo, «(Invitación)» / «(invitación)» (`ui/lib/document-mappers.ts`); ninguno pasa por `locales`, así que en un hub en inglés salen en español (F15).
- **QA R-09 y B-06** piden «imprimir + abrir cajón» al cobrar: lo hace el hub (no Ventas) al oír la venta, en el dispositivo que cobró, si Impresión lo tiene activado; el cajón se abre con cualquier medio, también tarjeta, y `qa-hub-restaurant` §7.10 pide que se abra solo con efectivo (F01, F02).
- **QA L-04 y `qa-hub-restaurant` §7.13**: esperan registro de anulación al anular; no existe (F30).
- **QA `qa-hub-restaurant` §7.10 y matriz §6**: invitación «con permiso, motivo y auditoría»; no pide ninguno de los dos (F15).
- **QA `qa-hub-restaurant` §7.13**: «anular línea después de enviar con aviso a cocina» y «anular pedido abierto con motivo»: la línea se anula con motivo desde sales#521 y cocina la tacha con su motivo (KITCHEN-F29; el vale en papel de un solo plato, hub#2640); la cuenta abierta se anula sin motivo (F18, F20).
- **QA `qa-hub-restaurant` §7.09**: dividir a partes iguales y por fracción, y deshacer el split; solo existe mover líneas enteras (F23).
- **`qa-hub-restaurant.md` §3** dice que ningún manifest usa roles que extienden otros; Ventas declara el rol «Cajero» (que cobra).
- **`hand-book/modulos/sales.md`**: «Los ajustes del TPV aparecen en la configuración de aplicaciones del Hub»; es la pestaña «Ajustes» del propio módulo.
- **`docs/screens.md` y `architecture/modules/sales.md`** (la báscula): dicen que con báscula el peso llega solo a la línea y que leerla es trabajo de la app instalada; ni la app instalada ni el hub tienen lector de báscula ni emiten el aviso de peso que el TPV escucha (F10).
- **`docs/concepts.md`** («if a line claims to come from the catalogue, the catalogue wins»; «One door stays open deliberately»): cierto, pero el permiso de precio libre solo protege una de las puertas por las que entra una línea libre o el precio de un servicio (F09).
- **`architecture/modules/sales.md`** (el techo de la simplificada, hub#297): lo hace cumplir solo la pantalla; el servidor de Ventas acepta un tique por encima del límite por asistente o API (F04).
- **`docs/screens.md`** («Charging a check with pending lines sends them first … as Odoo, Square and Toast do»): se envían, pero Cocina las cancela en cuanto el cobro cierra la cuenta (leído en el código de `kitchen`, sin ejecutar) (F20).
- **`docs/concepts.md`** («`sale.voided` is emitted so stock comes back and the till is corrected») y **QA §9 de `qa-hub.md`** («anular revierte»): caja, stock, cliente, mesa y la sesión de bono sí; la cita, la factura y VeriFactu no; y la mesa se libera aunque la cuenta siga abierta tras un cobro parcial (F30).
- **`ai.description` de `sales.void`** («A sale that carries a full invoice cannot be voided»): solo si se cobró como factura; un tique canjeado después por factura completa sí se anula (F30).
- **`docs/screens.md`** (devolver la sesión del bono incluso cuando el dinero ya volvió entero desde otro dispositivo): con dinero en el tique, al devolverse todo la venta pasa a Devuelta y la ventana ya no se abre (F32).
- **`ai.description` de `sales.create_payment_method`**: no dice que el tipo, si falta, es efectivo (F37).
- **QA L-01** espera que por encima del límite se exija factura completa: la pantalla lo hace, pero por asistente o API se graba un tique por encima del límite (F04).
- **QA `qa-hub-restaurant` §7.08 y §7.13** esperan que cocina reciba los cambios y anulaciones: eliminar una cuenta o juntarla deja sus rondas en la pantalla de Cocina, y cobrarla cancela las que se están haciendo (F18, F20, F24).
- **Oleada 2 (Mesas, Cocina, Inventario, Modificadores y Combos, 05/10/2026)**: SALES-F11 y SALES-F12 decían `hecho`; el servidor no comprueba mínimo ni máximo de un grupo de modificadores (`handler/src/lib.rs`, `catalog_modifier` solo mira que la opción exista; sí los de un menú) y `kitchen_items_from_lines` no manda los platos de un menú a Cocina: pasan a `parcial`. SALES-F19 y SALES-F25 decían `hecho`; con la cuenta de barra delante o con la mesa dividida, Mesas deja libre una mesa con su pedido abierto (`erp-tables-pos-zones.ts`, `_session_transfer_free.sql` sin la comprobación de otra cuenta abierta): pasan a `parcial`. SALES-F01 y SALES-F15 decían que Inventario descuenta el stock: con «Permitir vender sin stock» apagado, lo vendido por encima del saldo no baja (`stock_decrease.sql`).
- **Oleada 2 (Servicios, 05/10/2026)**, leído en el código de `sales` y `services`, sin ejecutar: la línea cubierta por un bono solo vive en la memoria de la pantalla (`erp-pos-touch.ts`, `covered`); tras recargar o volver a una cuenta aparcada, el hueco de Servicios recupera la sesión retenida y la pinta gastada sin avisar al TPV, que cobra la línea a su precio y además Servicios gasta la sesión al cobrar (SALES-F17, SALES-F27). Servicios da por gastadas las sesiones por cuenta (`checkout_ref` = la cuenta), no por línea: cobrar una parte, o la original tras dividirla, gasta las de líneas no cobradas, y dividir o juntar cuentas no le avisa (SALES-F22, SALES-F23, SALES-F24). Vender un bono por la API solo funciona con la línea marcada como servicio (SALES-F01). SALES-F17, F22, F23, F24 y F27 añaden estos huecos a su `Estado:`; ninguno cambia de nivel.
- **sales#520 (07/10/2026)**, comprobado contra el kernel real (`services/tests/sale_void.hub.test.py`, sección 4) y en el banco con el hub real: la línea «Oleada 2 (Servicios)» de arriba queda como historia en lo del bono. Al retomar una cuenta aparcada (o recargar y volver a asignar la clienta) el hueco de Servicios recupera la sesión y avisa al TPV, que vuelve a dar la línea por cubierta; y `sale.completed` nombra la fila de la cuenta de cada línea (`order_item_id`), así que Servicios gasta por línea: la sesión de una línea cobrada con dinero vuelve al bono y las de líneas que no entran en un cobro parcial siguen retenidas (F17, F22, F27). Dividir y juntar siguen sin avisar a Servicios (sales#540, F23, F24).
- **sales#522 (06/10/2026)**, comprobado contra el kernel real (`tests/combo_fire.hub.test.py`): el envío a cocina ya manda los platos elegidos de cada menú (`kitchen_items_from_lines` → `combo_components`) y los suplementos con el nombre que la cuenta congeló al pedirlos; la línea «Oleada 2» de arriba que decía lo contrario queda como historia (F12, F20).
- **sales#521 (07/10/2026)**, comprobado contra el kernel real (`tests/void.hub.test.py`, sección 5): una línea enviada ya no «se quita contestando bien»: `sales.order.remove_line` la rechaza y `sales.order.void_line` la anula con motivo y permiso de responsable, recalcula el total y avisa con `sales.order.line_voided`. Cocina no lo escucha todavía (kitchen#161), y eliminar o juntar una cuenta sigue sin avisarle (kitchen#162) (F18, F20, F24).
- **kitchen#162 (07/10/2026)**: eliminar una cuenta ya llega a Cocina (escucha `sales.order.voided` y cancela las rondas en marcha de la cuenta anulada) y juntar dos cuentas avisa con `sales.order.merged` (`from_order_id`, `to_order_id`), con el que Cocina pasa las rondas de la absorbida a la que queda; la parte de «eliminar una cuenta o juntarla deja sus rondas en la pantalla de Cocina» de la línea de QA §7.08/§7.13 queda como historia (F18, F24).
