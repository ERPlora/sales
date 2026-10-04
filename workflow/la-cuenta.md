# WORKFLOW — Ventas / TPV · Montar la cuenta

Prefijo: SALES

## Flujos

### SALES-F09 Vender a precio libre por departamento
Estado: parcial — el permiso de precio libre solo lo exige la puerta que usa la pantalla: una línea sin artículo de catálogo (o marcada como servicio) entra con el importe que se mande al añadir una línea, al abrir la cuenta o al cobrar directamente, con el permiso de empleado o de cajero (asistente o API)
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Toca la baldosa «Precio libre», al final de la rejilla.
2. Marca el importe en el teclado y elige el departamento en «Departamento (IVA)»; cada botón enseña su tipo de IVA.
3. Pulsa «Añadir <importe>»: entra una línea con el nombre del departamento y ese importe. Nunca se suma a otra línea.
4. Un servicio sin precio cerrado («desde», por horas o variable) abre esta misma hoja con su nombre y su precio como sugerencia; su IVA viene elegido solo si hay un departamento con esa categoría (si no, hay que elegirlo). La línea entra como precio libre, no como el servicio.
Entra: los departamentos del negocio (SALES-F35) o, si no hay, las categorías de IVA activas de Impuestos.
Sale: una línea sin artículo de catálogo, con su importe y su categoría de IVA, que se cobra como cualquier otra.
Si falla: «Añadir» no se puede pulsar sin importe y departamento; sin departamentos ni categorías, «Sin departamentos configurados.». Desde esta hoja, un empleado o cajero sin el permiso de precio libre recibe la petición de PIN del responsable; por otras puertas no (ver Estado).
Implicados: TAXES-F01
Pendiente de enlazar: services — un servicio de precio abierto pide su importe al venderse
QA: qa-hub-restaurant §7.10

### SALES-F10 Vender por peso, con o sin báscula
Estado: parcial — con báscula no funciona: el TPV está preparado para recibir el peso, pero ni la aplicación instalada ni el hub tienen lector de báscula, así que nada se lo manda
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Toca un artículo cuya unidad es de masa (kg, g): entra como línea con su unidad.
2. Escribe la cantidad en el selector de la línea (p. ej. 0,532).
3. El importe se recalcula y la línea muestra la unidad («0,532 kg»).
4. Con báscula (no disponible hoy): el peso, al estabilizarse, pasaría a la última línea por peso que no se haya enviado a cocina.
Entra: la unidad y su escalón, de Inventario.
Sale: la línea con su cantidad y su unidad congeladas.
Si falla: una cantidad que no encaja con el escalón del artículo se rechaza con «La cantidad no encaja con el escalón del producto» y la línea queda como estaba. El aviso de báscula en otra unidad («La báscula pesa en g y esta línea va en kg») existe pero hoy no puede salir.
Implicados: pendiente
Pendiente de enlazar: inventory — unidades de medida y su escalón
Pendiente de enlazar: hub — leer la báscula en la aplicación instalada y mandar el peso al TPV (no existe)
QA: qa-hub-restaurant §7.07

### SALES-F11 Elegir los suplementos de un artículo
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Toca un artículo que tiene grupos de suplementos: se abre una hoja con su nombre.
2. En cada grupo se lee la regla («Elige 1», «Hasta 3», «Opcional»); toca las opciones, cada una con su precio extra.
3. Pulsa «Añadir»: la línea entra con sus suplementos y su precio ya sumado. Si falta algo obligatorio, el botón dice «Elige una opción para continuar».
Entra: los grupos y opciones de Suplementos.
Sale: la línea con los suplementos elegidos y su precio congelado al pedir; un suplemento con otro tipo de IVA sale al cobrar como línea propia.
Si falla: sin la app Suplementos el artículo entra directo. «Uno de los suplementos de la línea ya no está en el catálogo. Vuelve a elegirlo.» si desaparece antes de cobrar.
Implicados: pendiente
Pendiente de enlazar: modifiers — grupos de suplementos por artículo y su precio
QA: R-04, qa-hub-restaurant §7.07

### SALES-F12 Componer un menú
Estado: hecho
Vertical: restaurante
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En «Todos», los menús salen primero con la etiqueta «Menú». Toca uno.
2. En la hoja, cada grupo (primero, segundo…) dice cuántas elecciones lleva; toca los platos. En un grupo de una sola elección, tocar otro plato cambia la elección.
3. Pulsa «Añadir · <total>»; mientras falte algo, el botón dice qué («Elige 1 en Segundo»).
Entra: los menús de Combos con sus grupos y platos.
Sale: una línea de menú con lo elegido en su orden; al cobrar se reparte en tantas líneas como tipos de IVA tenga.
Si falla: si el catálogo de menús no carga, «No se han podido cargar los menús, así que no se ofrece ninguno. Revisa el módulo Combos e inténtalo de nuevo». Al cobrar, un menú retirado o mal configurado se rechaza con su frase (p. ej. «Ese menú no tiene categoría fiscal, así que no se puede cobrar. Configúrala en Combos.»).
Implicados: pendiente
Pendiente de enlazar: combos — menús, grupos, platos y precio cerrado
QA: qa-hub-restaurant §7.07

### SALES-F13 Poner una nota en una línea
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la línea, toca el botón «Nota».
2. Toca las notas rápidas que salen arriba (se suman separadas por coma; tocarlas otra vez las quita) o escribe en el cuadro (hasta 255 caracteres).
3. Pulsa «Guardar»: la nota sale debajo de la línea. «Quitar», o dejar el cuadro vacío, la borra.
Entra: las notas rápidas del negocio (SALES-F36).
Sale: la nota en la línea; viaja a la comanda de cocina, a la cuenta impresa y queda congelada en la venta.
Si falla: si las notas rápidas no cargan, «No se han podido cargar las notas rápidas: escribe la nota a mano.». Si no se guarda, la línea vuelve a la nota anterior con «No se ha podido guardar ese cambio de la línea. La línea vuelve a estar como estaba.». Una línea ya enviada a cocina no tiene botón de nota.
Implicados: pendiente
Pendiente de enlazar: kitchen — la nota sale en la comanda
QA: R-04, qa-hub-restaurant §7.07

### SALES-F14 Aplicar un descuento a una línea o a la cuenta
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. Para una línea, toca su etiqueta de precio («Descuento en la línea»); para toda la cuenta, el botón de etiqueta del pie («Descuento del ticket»).
2. Marca el porcentaje; en la cuenta puedes cambiar a importe fijo con el botón de la moneda.
3. Pulsa «Aplicar −N %» (o «Aplicar −<importe>»). «Quitar» lo borra. La línea enseña «−N %» y el pie la fila «Descuento del ticket».
4. Si el descuento pasa del máximo que el negocio deja dar sin autorización, el hub pide el PIN de un responsable antes de aplicarlo; la cuenta guarda quién lo autorizó y no lo vuelve a pedir al cobrar.
Entra: «Permitir descuentos» y el descuento máximo de los ajustes.
Sale: el descuento en la cuenta o en la línea; al cobrar se reparte entre las líneas, la base y el IVA declarados ya lo llevan descontado, y la venta guarda el importe descontado.
Si falla: con «Permitir descuentos» apagado no hay botones y el servidor rechaza «Este negocio no permite descuentos.». Por encima del máximo sin PIN: «Ese descuento supera lo que este negocio permite sin que lo autorice el encargado.» y la cuenta sigue como estaba. Un importe mayor que la cuenta no se puede aplicar.
Implicados: ninguno
QA: R-11, B-05, qa-hub-restaurant §7.10

### SALES-F15 Invitar una línea
Estado: parcial — no pide motivo (guarda siempre «Invitación») ni permiso propio: cualquiera que monte la cuenta puede invitar; y al cobrar el servidor da por invitada la línea que el cobro diga, sin mirar la cuenta, así que por el asistente o la API se cobra una línea a 0 sin rastro de quién lo decidió
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la línea, toca el regalo («Invitar / quitar invitación»).
2. La línea queda a 0 con la marca «Invitación»; tocarlo otra vez la vuelve a cobrar.
Entra: nada de otros componentes.
Sale: la línea invitada: no suma dinero ni IVA, pero descuenta stock; la venta guarda el coste de lo invitado para el arqueo.
Si falla: «No se ha podido guardar ese cambio de la línea. La línea vuelve a estar como estaba.». Una línea ya enviada a cocina no se puede invitar.
Implicados: CASH_REGISTER-F13
Pendiente de enlazar: inventory — lo invitado descuenta stock
QA: R-11, qa-hub-restaurant §7.10 (discrepa)

### SALES-F16 Atribuir la cuenta o una línea a quien atiende
Estado: hecho
Vertical: comun
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la cabecera de la cuenta, el chip «Atiende yo» dice a quién se atribuye. Tócalo.
2. En «Quién atiende esta cuenta», elige a la persona (primero el equipo de Personal, luego quien entra en la app) o «Yo (quien tenga la sesión)».
3. Las líneas que se añadan a partir de ahí quedan selladas con esa persona. Para corregir una línea ya puesta, toca el nombre que sale debajo de ella («De quién es esta línea») y elige otra persona o «El profesional de la cuenta».
4. Al cobrar, el chip vuelve a «yo».
Entra: las personas del hub y el equipo de Personal.
Sale: la venta y cada línea atribuidas a esa persona (para el cierre por profesional y la comisión); la comanda de cocina lleva su usuario.
Si falla: «No se ha podido cargar el equipo. La venta se sigue atribuyendo a quien tenga la sesión.»; «No se ha podido mover la línea a otro profesional. Se queda con el que tenía.». Una línea enviada a cocina no se reasigna.
Implicados: pendiente
Pendiente de enlazar: staff — el equipo que se ofrece y la comisión por profesional
QA: B-04, B-07, R-10

### SALES-F17 Aparcar una cuenta y recuperarla
Estado: parcial — «Permitir tiques aparcados» apagado solo quita el botón de la cabecera: desde «Cuentas abiertas» se sigue aparcando
Vertical: comun
Actor: empleado, responsable
Pantalla: Cuentas abiertas
Pasos:
1. Con una cuenta a medias y sin mesa, pulsa el botón de pausa («Aparcar esta cuenta») o, en **Cuentas abiertas**, «Aparcar esta cuenta».
2. En «Aparcar cuenta» el título viene con la hora; cámbialo si quieres («p. ej. Ana — terraza») y confirma: sale «Aparcada como «…»» y la pantalla queda vacía.
3. Para retomarla, abre **Cuentas abiertas** (icono de tique con el número de cuentas) y toca su fila.
4. Si delante hay otra cuenta sin mesa, pregunta «Tienes una cuenta a medias»: «Aparcarla y abrir», «Eliminarla y abrir» o «Cancelar». Si tiene mesa, se queda en su mesa (SALES-F19).
5. Al recargar la pantalla, cada dispositivo vuelve a la cuenta que tenía abierta.
Entra: nada de otros componentes.
Sale: la cuenta sigue abierta con su título; aparcar nunca la anula. Con un cliente asignado, Clientes mantiene el vínculo.
Si falla: si el hub rechaza el título, el diálogo sigue abierto con el motivo y «No se ha podido aparcar la cuenta. Sigue en pantalla.». Con líneas sin enviar a cocina no se cambia de cuenta: «Hay productos en la comanda actual sin enviar (N). Envíalos o elimínalos antes de cambiar de cuenta.».
Implicados: pendiente
Pendiente de enlazar: tables — soltar la mesa al aparcar una cuenta que la tenía
QA: qa-hub-restaurant §7.06

### SALES-F18 Eliminar una cuenta abierta
Estado: parcial — no pide motivo; las rondas ya enviadas a cocina siguen en la pantalla de Cocina y Mesas no recibe ningún aviso del servidor; anular una cuenta que ya no está abierta contesta bien y avisa igual
Vertical: comun
Actor: responsable, empleado
Pantalla: Cuentas abiertas
Pasos:
1. En **Cuentas abiertas**, toca la papelera de la cuenta: cambia a «Toca otra vez para eliminar — anula la cuenta». Si no se toca en 3 segundos, se desarma.
2. Toca otra vez: la cuenta desaparece de la lista. También se elimina con «Eliminarla y abrir» al cambiar de cuenta.
3. A un empleado o cajero el hub le pide el PIN de un responsable (anular es permiso de responsable).
Entra: la cuenta elegida.
Sale: la cuenta queda anulada, no borrada, sin motivo (avisa: sales.order.voided); Servicios suelta los bonos que tuviera retenidos. Cocina no escucha ese aviso: lo ya enviado sigue en su pantalla. Mesas tampoco lo escucha: por el servidor la mesa no se suelta (lo que haga su control en pantalla, sin confirmar).
Si falla: «No se ha podido eliminar esa cuenta abierta. Sigue en la lista.» o «No se ha podido eliminar la cuenta. Sigue abierta, en pantalla.». Una cuenta ya cobrada o anulada desde otro dispositivo no cambia, pero la orden contesta bien y el aviso sale igual.
Implicados: pendiente
Pendiente de enlazar: services — soltar las sesiones de bono retenidas en esa cuenta
Pendiente de enlazar: tables — Mesas no se entera por el servidor de que la cuenta de una mesa se eliminó
Pendiente de enlazar: kitchen — las rondas enviadas de una cuenta eliminada siguen en la pantalla de Cocina
QA: qa-hub-restaurant §7.13 (discrepa)
