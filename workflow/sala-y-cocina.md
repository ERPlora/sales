# WORKFLOW — Ventas / TPV · Sala y cocina

Prefijo: SALES

Estos flujos solo existen con **Mesas** y/o **Cocina** instalados: sus botones entran en el TPV por
los huecos que Ventas les deja (asignar, acciones de la comanda, información de la comanda). Ventas
pone las cuentas, las líneas y los importes; la mesa es de Mesas y la comanda en pantalla es de Cocina.

## Flujos

### SALES-F19 Abrir la cuenta de una mesa y dejarla en la mesa
Estado: parcial — en una mesa con dos cuentas (dividida), tocarla abre una sin elegir
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la cabecera de la cuenta, toca el botón de mesa (lo pone Mesas) y elige la mesa.
2. Si la mesa ya tenía cuenta, sus líneas aparecen en pantalla; si no, la cuenta empieza vacía con el nombre de la mesa como título y el chip de la mesa.
3. Añade lo que pidan. El primer artículo crea la cuenta y Mesas la enlaza a la mesa.
4. Para soltarla sin cobrar, pulsa el botón de pausa, que con mesa es «Dejar en la mesa»: sale «La cuenta se queda en <mesa>» y la pantalla queda libre. Se retoma tocando la mesa o desde **Cuentas abiertas**.
5. Si al tocar otra mesa hay delante una cuenta de barra (sin mesa), pregunta «Tienes una cuenta a medias» sin «Cancelar»: «Aparcarla y abrir» o «Eliminarla y abrir». Lo que se aparca o se elimina es la cuenta de barra; la mesa tocada sigue Ocupada con su cuenta (TABLES-F11). Una cuenta que ya tenía mesa se queda en su mesa.
Entra: la mesa elegida y su cuenta, de Mesas.
Sale: la cuenta abierta con el título de la mesa; Mesas guarda qué cuenta tiene cada mesa (avisa: sales.order.opened al crearla, que hoy no escucha nadie).
Si falla: «No se ha podido dejar la cuenta en su mesa. Sigue en pantalla.»; con líneas sin enviar a cocina no se cambia de mesa ni de cuenta («Productos sin enviar»).
Implicados: TABLES-F10, TABLES-F11, TABLES-F12, TABLES-F21, REC_RESTAURANTE-F05, REC_RESTAURANTE-F08
QA: R-03, R-06, qa-hub-restaurant §7.06

### SALES-F20 Enviar la comanda a cocina
Estado: parcial — GRAVE (leído en el código, sin ejecutar): al cobrar la cuenta entera, Cocina cancela todas sus rondas pendientes o en preparación, incluida la que el TPV acaba de enviar al cobrar, así que en «pide y paga» (barra, mostrador) la comida no llega a hacerse; una línea ya enviada se anula desde el TPV con motivo y PIN del responsable y Cocina tacha el plato con su motivo (KITCHEN-F29) y la impresora de cocina saca su vale (HUB_SHELL-F78)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Con Cocina instalada, la cuenta tiene dos pestañas: «Cuenta» y «Comanda actual» (con el número de artículos por enviar).
2. En «Comanda actual» salen solo las líneas pendientes y el botón de envío de Cocina («Enviar comanda», con su opción de urgente).
3. Púlsalo: sale «Enviado a cocina». Las líneas pasan a «Comanda N», quedan bloqueadas (ni cantidad, ni nota, ni descuento, ni invitación) y la cuenta se parte en «Pendiente de enviar» y «Enviado», donde Cocina pone su chip con el estado de cada comanda.
4. Cada envío es una ronda nueva con solo lo que faltaba; un doble toque no envía dos veces.
5. Al cobrar una cuenta con líneas pendientes, la hoja avisa «Los N productos pendientes de la comanda se enviarán a cocina al cobrar.» y se envían antes de cerrar la venta.
6. Pero al cobrar la cuenta entera, Cocina retira del KDS todas sus rondas: las que estaban listas pasan a servidas y las pendientes o en preparación (incluida la que se acaba de enviar al cobrar) pasan a canceladas. Cobrar antes de servir deja la comida sin hacer. Un cobro parcial (SALES-F22) no las toca.
7. El orden entre los dos avisos no está garantizado: lo normal es que Cocina reciba antes la ronda y después el cierre, que la cancela (su papel sale igual, porque se imprime al nacer); si la entrega de la ronda se retrasa (reintento, o dos instancias del hub durante una actualización), el cierre no encuentra nada y la ronda se queda viva para siempre en la pantalla de cocina (KITCHEN-F27, kitchen#145, leído en el código, sin ejecutar).
8. Para quitar un plato ya enviado (se pidió por error, la mesa cambia de idea, se agotó), pulsa ⊗ «Anular este artículo» en su línea: se abre «Anular «<artículo>»» con «Ya se envió a cocina. Sale de la cuenta y se guarda el motivo. Tiene que autorizarlo un responsable.», los motivos de un toque («Error al pedir», «El cliente lo cambia», «Agotado», «Pedido dos veces») y «O escribe el motivo…». «Anular artículo» no se puede pulsar sin motivo; sin permiso de responsable, el hub pide su PIN. La línea sale de la cuenta, el total baja y la línea guarda el motivo, quién lo autorizó y cuándo. Una línea aún sin enviar no lleva este botón: se quita como siempre. En la pantalla de cocina y en la hoja «Comandas de la cuenta» el plato sale tachado con «Anulado» y el motivo, y la ronda sigue con lo que queda (KITCHEN-F29); en papel, la impresora que sacó la comanda saca el vale «PLATO ANULADO · Mesa 4» con ese plato en negativo (HUB_SHELL-F78).
9. Un menú viaja con los platos que eligió la mesa: Cocina pone cada plato en la estación de su artículo (o de su categoría), agrupados bajo el nombre de cocina del menú, con la nota del menú en cada uno y el precio cerrado contado una vez (SALES-F12, KITCHEN-F06, COMBOS-F11). Un suplemento puesto en la línea del menú (solo por el asistente o la API: la hoja del TPV no lo ofrece) sale en cada plato. Un plato que viene de Servicios no va a cocina; un menú todavía sin nada elegido sale como una sola línea con su nombre, y uno a medias manda solo lo elegido (sales#535).
Entra: las líneas pendientes de la cuenta, su mesa (como texto que pone Mesas), quién atiende y la prioridad que marque Cocina.
Sale: las líneas marcadas con su ronda y la hora de envío (avisa: order.fired, con las líneas, la nota, los suplementos con el nombre con que se pidieron, los platos elegidos de cada menú y el camarero); Cocina crea la comanda en su pantalla, pendiente. Al cobrar la cuenta entera (avisa: order.completed, que sale después del envío) Cocina cierra sus rondas: listas a servidas, pendientes y en preparación a canceladas. Al anular una línea enviada: la línea fuera de la cuenta con su motivo, quién lo autorizó y cuándo, y el total recalculado (avisa: sales.order.line_removed y sales.order.line_voided, con la cuenta, la línea y el motivo; Cocina tacha el plato, KITCHEN-F29).
Si falla: «No se pudo enviar a cocina» y las líneas siguen pendientes. Al cobrar, si el envío falla no se cobra: «No se ha podido enviar la comanda a cocina, así que no se ha cobrado. Vuelve a intentarlo.». Que Cocina cancele las rondas al cobrar no se avisa en el TPV. Pedir que se quite una línea ya enviada, ya cobrada o que ya no está en una cuenta abierta (por el asistente o la API) se rechaza con «Esa línea ya no se puede quitar: ya se envió a cocina (anúlala con un motivo), ya está cobrada o ya no está en una cuenta abierta.» y no avisa a nadie. Anular o quitar una línea mientras otro dispositivo cobra la cuenta: gana el primero; si gana el cobro, la línea ya está cobrada y la anulación o el quitar se rechazan; si gana la anulación, el cobro no cobra nada y lo dice (SALES-F01, sales#545). Anular una línea sin enviar, ya cobrada, ya anulada, de una cuenta cerrada o sin motivo se rechaza con «Esa línea no se puede anular…» y la línea sigue en la cuenta; si el hub la rechaza (o no se da el PIN), el TPV dice el motivo del rechazo, o «No se ha podido anular el artículo. Sigue en la cuenta.» si no lo hay.
Implicados: COMBOS-F11, KITCHEN-F04, KITCHEN-F05, KITCHEN-F06, KITCHEN-F18, KITCHEN-F19, KITCHEN-F27, KITCHEN-F29, MODIFIERS-F08, TABLES-F10, REC_RESTAURANTE-F07, REC_RESTAURANTE-F08, REC_RESTAURANTE-F14, REC_RESTAURANTE-F17
QA: R-04, R-05, R-06, BD-08, qa-hub-restaurant §7.08, qa-hub-restaurant §7.13 (discrepa)

### SALES-F21 Imprimir la cuenta para la mesa (precuenta)
Estado: parcial — si la cuenta queda en la cola sin ninguna impresora dada de alta, o la impresora de red está apagada o sin papel, el TPV no avisa: da por buena la cuenta encolada (PRINTING-F09, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Cuenta (precuenta)
Pasos:
1. Con la cuenta en pantalla, pulsa la impresora del pie («Imprimir cuenta»).
2. Se abre «Cuenta» con las líneas, suplementos, menús, notas, descuentos, el desglose de IVA, el total y la mesa, y el aviso «Cuenta — no es una factura. El tiquet fiscal se entrega al cobrar.».
3. Pulsa la impresora de arriba: sale por la impresora de tiques. Reimprimir después de otra ronda saca la cuenta actualizada.
Entra: la cuenta abierta; el total que calcula el servidor (si hay líneas marcadas o un bono, el de la pantalla).
Sale: un papel sin número fiscal ni QR; no consume numeración ni crea venta.
Si falla: «No se pudo imprimir la cuenta» (con el motivo si lo hay) solo cuando falla el envío; si queda en la cola del hub sin impresora conectada, o la impresora de red no la saca, no se avisa (PRINTING-F09).
Implicados: PRINTING-F09, REC_RESTAURANTE-F09
QA: R-08, qa-hub-restaurant §7.10

### SALES-F22 Cobrar solo una parte de la cuenta
Estado: parcial — solo por líneas enteras: no se cobra una parte de una línea, a partes iguales ni por importe; el descuento de importe fijo de la cuenta no se aplica en un cobro parcial
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Con dos o más líneas, toca las líneas que paga esta persona (la línea, no sus botones): se marcan con un círculo.
2. Pulsa «Cobrar»: la hoja dice «Cobrando N líneas de <total>» y cobra solo esas.
3. Tras cobrar, la cuenta sigue abierta con lo que falta; lo cobrado ya no vuelve a salir.
Entra: las líneas marcadas.
Sale: una venta con esas líneas (avisa: sale.completed); las líneas quedan atadas a su venta y la cuenta sigue abierta (no se avisa de cuenta cerrada, así que la mesa no se libera ni Cocina cierra sus rondas). Si después se anula una de esas ventas, la cuenta sigue abierta y la mesa Ocupada (SALES-F30, TABLES-F19), pero lo que se cobró en ella no vuelve a lo pendiente (sales#551).
Si falla: los mismos rechazos que un cobro normal, también el de la cuenta que cambió mientras se cobraba: si otro dispositivo anula, quita o cobra una de las líneas marcadas, o le cambia la cantidad o la invitación, no se cobra nada, la cuenta se vuelve a leer y la marca de la línea que se fue desaparece (SALES-F01, sales#545, sales#546); con una sola línea no hay nada que marcar.
Implicados: KITCHEN-F27, SERVICES-F24, TABLES-F18, REC_PELUQUERIA-F10, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09

### SALES-F23 Dividir la cuenta de una mesa
Estado: parcial — solo moviendo líneas enteras: ni partes iguales ni fracción de una línea, y no se deshace un split; en cocina, cobrar la original cierra sus rondas aunque parte de sus platos pasaran a la nueva (KITCHEN-F27); Servicios no se entera de la división: la sesión de bono retenida para una línea que pasa a la cuenta nueva se queda en la original (cobrarla ya no la gasta) y el hueco de la nueva ofrece gastar otra; la retenida vuelve sola al bono al cabo de un día (sales#540, SERVICES-F22, SERVICES-F24, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Marca en la cuenta las líneas que se van a la cuenta nueva (como en SALES-F22).
2. En el control de mesa (de Mesas), pulsa «Dividir cuenta»: abre una segunda cuenta en la mesa.
3. Las líneas marcadas pasan a la cuenta nueva con su importe, su IVA y su ronda de cocina; la pantalla se queda en la cuenta nueva para cobrarla. Sin nada marcado, la cuenta nueva nace vacía.
4. Cobrar entera la cuenta nueva cierra solo su cuenta de mesa: la mesa sigue Ocupada con la original, y cualquier otra mesa sigue como estaba (TABLES-F17).
Entra: la segunda cuenta de la mesa que abre Mesas.
Sale: dos cuentas abiertas que suman lo mismo que la original al céntimo; Mesas enlaza la nueva a su segunda cuenta.
Si falla: «No se pudo dividir la cuenta» y las líneas no se mueven; también si otro dispositivo está cobrando esa cuenta: la división espera a que termine y, si la cobró, se rechaza (`sales.order_changed`) y no se mueve nada (sales#546). Si el fallo fue de Ventas, Mesas ya abrió la segunda cuenta y la mesa se queda con una cuenta vacía de más.
Implicados: KITCHEN-F27, SERVICES-F22, SERVICES-F24, TABLES-F17, REC_PELUQUERIA-F10, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09 (discrepa)

### SALES-F24 Juntar las cuentas de dos mesas
Estado: parcial — si la unión de cuentas falla no se ve nada (las mesas quedan fusionadas en Mesas y las cuentas siguen separadas); si la mesa de origen estaba dividida, se junta una de sus dos cuentas sin elegir (la mesa sigue Ocupada con la otra, TABLES-F16); la sesión de bono retenida en la cuenta absorbida no se gasta al cobrar la que queda: vuelve sola al bono al cabo de un día y el hueco de la que queda ofrece gastar otra (sales#540, SERVICES-F22, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En el control de mesa (de Mesas), pulsa «Fusionar» y elige la otra mesa.
2. Si las dos tenían cuenta, las líneas sin cobrar de una pasan a la otra y la vacía queda anulada; si solo una tenía, esa pasa a ser la de la mesa que queda.
3. La pantalla sigue a la mesa que queda, con todas las líneas.
Entra: las dos mesas y sus cuentas, de Mesas.
Sale: una sola cuenta; las líneas se mueven sin volver a crearlas, así que lo ya enviado a cocina no se envía otra vez. Repetirlo no cambia nada. La cuenta absorbida se anula y Ventas avisa de la unión (sales.order.merged, con la cuenta absorbida y la que queda): Cocina pasa las rondas enviadas desde la absorbida a la que queda, numeradas detrás de las suyas, y se cierran al cobrarla (KITCHEN-F28). Un aviso repetido no mueve nada.
Si falla: la persona no ve ningún aviso: Mesas ya fusionó las mesas, pero las dos cuentas siguen separadas en Ventas. Pasa también si otro dispositivo estaba cobrando una de las dos cuentas: la unión espera a que termine y, si una de las dos se cobró entera, se rechaza (`sales.order_changed`) sin mover nada; tras un cobro parcial, solo viaja lo que quedó sin cobrar (sales#546).
Implicados: KITCHEN-F28, SERVICES-F22, TABLES-F16, REC_PELUQUERIA-F10, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09

### SALES-F25 Pasar la cuenta a otra mesa
Estado: parcial — si la mesa de origen estaba dividida (dos cuentas), se pasa una de ellas sin elegir cuál (la mesa de origen sigue Ocupada con la otra, TABLES-F15)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En el control de mesa (de Mesas), pulsa «Transferir» y elige una mesa libre.
2. La cuenta es la misma: la pantalla cambia el chip y, si el título era el de la mesa, el título.
Entra: la mesa de destino, de Mesas.
Sale: nada en Ventas (la cuenta no cambia); Mesas libera la de origen si no le queda otra cuenta.
Si falla: lo dice Mesas.
Implicados: TABLES-F15, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09
