# WORKFLOW — Ventas / TPV · Sala y cocina

Prefijo: SALES

Estos flujos solo existen con **Mesas** y/o **Cocina** instalados: sus botones entran en el TPV por
los huecos que Ventas les deja (asignar, acciones de la comanda, información de la comanda). Ventas
pone las cuentas, las líneas y los importes; la mesa es de Mesas y la comanda en pantalla es de Cocina.

## Flujos

### SALES-F19 Abrir la cuenta de una mesa y dejarla en la mesa
Estado: hecho
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
Implicados: pendiente
Pendiente de enlazar: tables — elegir mesa en el TPV, abrir su sesión y enlazarla con la cuenta
Pendiente de enlazar: REC_RESTAURANTE — sentar, pedir, servir y cobrar en el día del restaurante
QA: R-03, R-06, qa-hub-restaurant §7.06

### SALES-F20 Enviar la comanda a cocina
Estado: parcial — una línea ya enviada no se puede anular ni cambiar desde el TPV, así que no hay anulación con aviso a cocina
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Con Cocina instalada, la cuenta tiene dos pestañas: «Cuenta» y «Comanda actual» (con el número de artículos por enviar).
2. En «Comanda actual» salen solo las líneas pendientes y el botón de envío de Cocina («Enviar comanda», con su opción de urgente).
3. Púlsalo: sale «Enviado a cocina». Las líneas pasan a «Comanda N», quedan bloqueadas (ni cantidad, ni nota, ni descuento, ni invitación) y la cuenta se parte en «Pendiente de enviar» y «Enviado», donde Cocina pone su chip con el estado de cada comanda.
4. Cada envío es una ronda nueva con solo lo que faltaba; un doble toque no envía dos veces.
5. Al cobrar una cuenta con líneas pendientes, la hoja avisa «Los N productos pendientes de la comanda se enviarán a cocina al cobrar.» y se envían antes de cerrar la venta.
Entra: las líneas pendientes de la cuenta, su mesa (como texto), quién atiende y la prioridad que marque Cocina.
Sale: las líneas marcadas con su ronda y la hora de envío (avisa: order.fired, con las líneas, la nota, los suplementos y el camarero); Cocina crea la comanda en su pantalla.
Si falla: «No se pudo enviar a cocina» y las líneas siguen pendientes. Al cobrar, si el envío falla no se cobra: «No se ha podido enviar la comanda a cocina, así que no se ha cobrado. Vuelve a intentarlo.».
Implicados: pendiente
Pendiente de enlazar: kitchen — crear la comanda de cada ronda y enseñar su estado en el TPV
Pendiente de enlazar: tables — el aviso «Enviar comanda» del plano también envía la ronda
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
Implicados: pendiente
Pendiente de enlazar: printing — imprimir el documento «cuenta» por la impresora de tiques
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
Sale: una venta con esas líneas (avisa: sale.completed); las líneas quedan atadas a su venta y la cuenta sigue abierta (no se avisa de cuenta cerrada, así que la mesa no se libera).
Si falla: los mismos rechazos que un cobro normal; con una sola línea no hay nada que marcar.
Implicados: pendiente
Pendiente de enlazar: tables — la mesa sigue ocupada mientras queden líneas por cobrar
QA: R-07, qa-hub-restaurant §7.09

### SALES-F23 Dividir la cuenta de una mesa
Estado: parcial — solo moviendo líneas enteras: ni partes iguales ni fracción de una línea, y no se deshace un split
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Marca en la cuenta las líneas que se van a la cuenta nueva (como en SALES-F22).
2. En el control de mesa (de Mesas), pulsa «Dividir cuenta»: abre una segunda cuenta en la mesa.
3. Las líneas marcadas pasan a la cuenta nueva con su importe, su IVA y su ronda de cocina; la pantalla se queda en la cuenta nueva para cobrarla. Sin nada marcado, la cuenta nueva nace vacía.
Entra: la segunda cuenta de la mesa que abre Mesas.
Sale: dos cuentas abiertas que suman lo mismo que la original al céntimo; Mesas enlaza la nueva a su segunda cuenta.
Si falla: «No se pudo dividir la cuenta» y la cuenta queda como estaba.
Implicados: pendiente
Pendiente de enlazar: tables — abrir una segunda cuenta en la mesa
QA: R-07, qa-hub-restaurant §7.09 (discrepa)

### SALES-F24 Juntar las cuentas de dos mesas
Estado: hecho
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En el control de mesa (de Mesas), pulsa «Fusionar» y elige la otra mesa.
2. Si las dos tenían cuenta, las líneas sin cobrar de una pasan a la otra y la vacía queda anulada; si solo una tenía, esa pasa a ser la de la mesa que queda.
3. La pantalla sigue a la mesa que queda, con todas las líneas.
Entra: las dos mesas y sus cuentas, de Mesas.
Sale: una sola cuenta; las líneas se mueven sin volver a crearlas, así que lo ya enviado a cocina no se envía otra vez. Repetirlo no cambia nada.
Si falla: sin confirmar qué ve la persona si la unión de cuentas falla (no hay aviso propio).
Implicados: pendiente
Pendiente de enlazar: tables — juntar dos mesas ocupadas
QA: R-07, qa-hub-restaurant §7.09

### SALES-F25 Pasar la cuenta a otra mesa
Estado: hecho
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En el control de mesa (de Mesas), pulsa «Transferir» y elige una mesa libre.
2. La cuenta es la misma: la pantalla cambia el chip y, si el título era el de la mesa, el título.
Entra: la mesa de destino, de Mesas.
Sale: nada en Ventas (la cuenta no cambia); Mesas libera la de origen.
Si falla: lo dice Mesas.
Implicados: pendiente
Pendiente de enlazar: tables — transferir la sesión de una mesa a otra
QA: R-07, qa-hub-restaurant §7.09
