# WORKFLOW — Ventas / TPV · Sala y cocina

Prefijo: SALES

Estos flujos solo existen con **Mesas** y/o **Cocina** instalados: sus botones entran en el TPV por
los huecos que Ventas les deja (asignar, acciones de la comanda, información de la comanda). Ventas
pone las cuentas, las líneas y los importes; la mesa es de Mesas y la comanda en pantalla es de Cocina.

## Flujos

### SALES-F19 Abrir la cuenta de una mesa y dejarla en la mesa
Estado: parcial — con una cuenta de barra delante, tocar una mesa ocupada que ya tiene pedido y elegir «Aparcarla y abrir» o «Eliminarla y abrir» deja esa mesa Disponible con su pedido abierto, porque Mesas ya había apuntado como cuenta de delante la de la mesa tocada (TABLES-F11, leído en el código, sin ejecutar); en una mesa con dos cuentas (dividida), tocarla abre una sin elegir
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la cabecera de la cuenta, toca el botón de mesa (lo pone Mesas) y elige la mesa.
2. Si la mesa ya tenía cuenta, sus líneas aparecen en pantalla; si no, la cuenta empieza vacía con el nombre de la mesa como título y el chip de la mesa.
3. Añade lo que pidan. El primer artículo crea la cuenta y Mesas la enlaza a la mesa.
4. Para soltarla sin cobrar, pulsa el botón de pausa, que con mesa es «Dejar en la mesa»: sale «La cuenta se queda en <mesa>» y la pantalla queda libre. Se retoma tocando la mesa o desde **Cuentas abiertas**.
5. Si al tocar otra mesa hay delante una cuenta de barra (sin mesa), pregunta «Tienes una cuenta a medias» sin «Cancelar»: «Aparcarla y abrir» o «Eliminarla y abrir». Una cuenta que ya tenía mesa se queda en su mesa.
Entra: la mesa elegida y su cuenta, de Mesas.
Sale: la cuenta abierta con el título de la mesa; Mesas guarda qué cuenta tiene cada mesa (avisa: sales.order.opened al crearla, que hoy no escucha nadie).
Si falla: «No se ha podido dejar la cuenta en su mesa. Sigue en pantalla.»; con líneas sin enviar a cocina no se cambia de mesa ni de cuenta («Productos sin enviar»).
Implicados: TABLES-F10, TABLES-F11, TABLES-F12, TABLES-F21, REC_RESTAURANTE-F05, REC_RESTAURANTE-F08
QA: R-03, R-06, qa-hub-restaurant §7.06

### SALES-F20 Enviar la comanda a cocina
Estado: parcial — GRAVE (leído en el código, sin ejecutar): al cobrar la cuenta entera, Cocina cancela todas sus rondas pendientes o en preparación, incluida la que el TPV acaba de enviar al cobrar, así que en «pide y paga» (barra, mostrador) la comida no llega a hacerse; además, una línea ya enviada no se puede anular ni cambiar desde el TPV, así que no hay anulación con aviso a cocina
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
8. Un menú viaja como una sola línea con su nombre, sin sus platos elegidos (SALES-F12): Cocina sabría repartirlos por estación si se los mandaran (KITCHEN-F06, COMBOS-F11).
Entra: las líneas pendientes de la cuenta, su mesa (como texto que pone Mesas), quién atiende y la prioridad que marque Cocina.
Sale: las líneas marcadas con su ronda y la hora de envío (avisa: order.fired, con las líneas, la nota, los suplementos y el camarero); Cocina crea la comanda en su pantalla, pendiente. Al cobrar la cuenta entera (avisa: order.completed, que sale después del envío) Cocina cierra sus rondas: listas a servidas, pendientes y en preparación a canceladas.
Si falla: «No se pudo enviar a cocina» y las líneas siguen pendientes. Al cobrar, si el envío falla no se cobra: «No se ha podido enviar la comanda a cocina, así que no se ha cobrado. Vuelve a intentarlo.». Que Cocina cancele las rondas al cobrar no se avisa en el TPV. Por el asistente o la API, pedir que se quite una línea ya enviada contesta bien sin quitar nada y avisa igual (sales.order.line_removed), y Cocina no escucha ese aviso (KITCHEN-F29).
Implicados: COMBOS-F11, KITCHEN-F04, KITCHEN-F05, KITCHEN-F06, KITCHEN-F18, KITCHEN-F19, KITCHEN-F27, KITCHEN-F29, MODIFIERS-F08, TABLES-F10, REC_RESTAURANTE-F07, REC_RESTAURANTE-F08, REC_RESTAURANTE-F17
QA: R-04, R-05, R-06, BD-08, qa-hub-restaurant §7.08, qa-hub-restaurant §7.13 (discrepa)

### SALES-F21 Imprimir la cuenta para la mesa (precuenta)
Estado: hecho
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Cuenta (precuenta)
Pasos:
1. Con la cuenta en pantalla, pulsa la impresora del pie («Imprimir cuenta»).
2. Se abre «Cuenta» con las líneas, suplementos, menús, notas, descuentos, el desglose de IVA, el total y la mesa, y el aviso «Cuenta — no es una factura. El tiquet fiscal se entrega al cobrar.».
3. Pulsa la impresora de arriba: sale por la impresora de tiques. Reimprimir después de otra ronda saca la cuenta actualizada.
Entra: la cuenta abierta; el total que calcula el servidor (si hay líneas marcadas o un bono, el de la pantalla).
Sale: un papel sin número fiscal ni QR; no consume numeración ni crea venta.
Si falla: «No se pudo imprimir la cuenta» (con el motivo si lo hay); queda en la cola del hub si no hay impresora conectada.
Implicados: PRINTING-F09, REC_RESTAURANTE-F09
QA: R-08, qa-hub-restaurant §7.10

### SALES-F22 Cobrar solo una parte de la cuenta
Estado: parcial — solo por líneas enteras: no se cobra una parte de una línea, a partes iguales ni por importe; el descuento de importe fijo de la cuenta no se aplica en un cobro parcial; con bonos, cobrar una parte da por gastadas también las sesiones retenidas en las líneas que se quedan sin cobrar, y esas líneas, al cobrarse después, ya no van cubiertas (SERVICES-F24, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Con dos o más líneas, toca las líneas que paga esta persona (la línea, no sus botones): se marcan con un círculo.
2. Pulsa «Cobrar»: la hoja dice «Cobrando N líneas de <total>» y cobra solo esas.
3. Tras cobrar, la cuenta sigue abierta con lo que falta; lo cobrado ya no vuelve a salir.
Entra: las líneas marcadas.
Sale: una venta con esas líneas (avisa: sale.completed); las líneas quedan atadas a su venta y la cuenta sigue abierta (no se avisa de cuenta cerrada, así que la mesa no se libera ni Cocina cierra sus rondas). Si después se anula una de esas ventas, Mesas cierra la sesión y libera la mesa aunque la cuenta siga abierta (SALES-F30).
Si falla: los mismos rechazos que un cobro normal; con una sola línea no hay nada que marcar.
Implicados: KITCHEN-F27, SERVICES-F24, TABLES-F18, REC_PELUQUERIA-F10, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09

### SALES-F23 Dividir la cuenta de una mesa
Estado: parcial — solo moviendo líneas enteras: ni partes iguales ni fracción de una línea, y no se deshace un split; al cobrar entera la cuenta nueva, el TPV pide a Mesas cerrar también la cuenta de mesa que tenía delante (la original, o la de otra mesa si había otra elegida) y esa mesa queda Disponible con su pedido todavía abierto (TABLES-F17, leído en el código, sin ejecutar); en cocina, cobrar la original cierra sus rondas aunque parte de sus platos pasaran a la nueva (KITCHEN-F27); Servicios no se entera de la división: la sesión de bono retenida para una línea que pasa a la cuenta nueva se queda en la original, y cobrar la original la gasta aunque la línea se cobre en la nueva (SERVICES-F22, SERVICES-F24, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Marca en la cuenta las líneas que se van a la cuenta nueva (como en SALES-F22).
2. En el control de mesa (de Mesas), pulsa «Dividir cuenta»: abre una segunda cuenta en la mesa.
3. Las líneas marcadas pasan a la cuenta nueva con su importe, su IVA y su ronda de cocina; la pantalla se queda en la cuenta nueva para cobrarla. Sin nada marcado, la cuenta nueva nace vacía.
Entra: la segunda cuenta de la mesa que abre Mesas.
Sale: dos cuentas abiertas que suman lo mismo que la original al céntimo; Mesas enlaza la nueva a su segunda cuenta.
Si falla: «No se pudo dividir la cuenta» y las líneas no se mueven; si el fallo fue de Ventas, Mesas ya abrió la segunda cuenta y la mesa se queda con una cuenta vacía de más.
Implicados: KITCHEN-F27, SERVICES-F22, SERVICES-F24, TABLES-F17, REC_PELUQUERIA-F10, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09 (discrepa)

### SALES-F24 Juntar las cuentas de dos mesas
Estado: parcial — si la unión de cuentas falla no se ve nada (las mesas quedan fusionadas en Mesas y las cuentas siguen separadas); las rondas enviadas desde la cuenta absorbida no se cierran al cobrar y se quedan en la pantalla de Cocina; si la mesa de origen estaba dividida, se junta una de sus dos cuentas sin elegir y la mesa queda Disponible con la otra sentada (TABLES-F16); la sesión de bono retenida en la cuenta absorbida no se gasta al cobrar la que queda: vuelve sola al bono al cabo de un día y el hueco de la que queda ofrece gastar otra (SERVICES-F22, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En el control de mesa (de Mesas), pulsa «Fusionar» y elige la otra mesa.
2. Si las dos tenían cuenta, las líneas sin cobrar de una pasan a la otra y la vacía queda anulada; si solo una tenía, esa pasa a ser la de la mesa que queda.
3. La pantalla sigue a la mesa que queda, con todas las líneas.
Entra: las dos mesas y sus cuentas, de Mesas.
Sale: una sola cuenta; las líneas se mueven sin volver a crearlas, así que lo ya enviado a cocina no se envía otra vez. Repetirlo no cambia nada. La cuenta absorbida se anula sin aviso a nadie: las rondas que se enviaron desde ella siguen colgadas de ella en Cocina y no se cierran al cobrar la que queda.
Si falla: la persona no ve ningún aviso: Mesas ya fusionó las mesas, pero las dos cuentas siguen separadas en Ventas.
Implicados: KITCHEN-F28, SERVICES-F22, TABLES-F16, REC_PELUQUERIA-F10, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09

### SALES-F25 Pasar la cuenta a otra mesa
Estado: parcial — si la mesa de origen estaba dividida (dos cuentas), se pasa una de ellas sin elegir cuál y la mesa de origen queda Disponible con la otra cuenta todavía sentada (TABLES-F15, leído en el código, sin ejecutar)
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En el control de mesa (de Mesas), pulsa «Transferir» y elige una mesa libre.
2. La cuenta es la misma: la pantalla cambia el chip y, si el título era el de la mesa, el título.
Entra: la mesa de destino, de Mesas.
Sale: nada en Ventas (la cuenta no cambia); Mesas libera la de origen.
Si falla: lo dice Mesas.
Implicados: TABLES-F15, REC_RESTAURANTE-F10
QA: R-07, qa-hub-restaurant §7.09
