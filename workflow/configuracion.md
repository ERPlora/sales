# WORKFLOW — Ventas / TPV · Configuración del TPV

Prefijo: SALES

## Flujos

### SALES-F34 Ajustar el TPV
Estado: parcial — un responsable tiene el permiso pero la pestaña solo deja guardar al administrador; «Permitir efectivo/tarjeta/transferencia» y «Permitir tiques aparcados» solo los aplica la pantalla (el servidor no los comprueba y aparcar sigue disponible desde Cuentas abiertas); «Documento por defecto» enseña «ticket» e «invoice» en inglés
Vertical: comun
Actor: administrador
Pantalla: Ajustes
Pasos:
1. En **Ventas / TPV**, abre la pestaña **Ajustes** (la añade el hub); arriba se lee «TPV».
2. Cambia lo que necesites: «Permitir efectivo», «Permitir tarjeta», «Permitir transferencia», «Mostrar productos en el TPV», «Mostrar servicios en el TPV», «Exigir cliente en cada venta», «Permitir descuentos», «Descuento máximo que puede aplicar solo quien cobra, por descuento (%)», «Permitir tiques aparcados», «Precios con IVA incluido por defecto», «Emitir factura si el cliente tiene NIF», «Documento por defecto», «Cabecera del recibo», «Pie del recibo», «Imagen de pie (URL/base64)», «URL del QR promocional» y «Texto del QR promocional».
3. Pulsa **Guardar**: sale «Ajustes guardados.».
4. Vuelve a **Vender**: el TPV lee los ajustes al abrirse, también para el cajero y el empleado. Si no puede leerlos, avisa con «El TPV no ha podido leer sus propios ajustes, así que muestra los valores por defecto. Vuelve a cargar para reintentarlo.».
Entra: nada de otros componentes.
Sale: la fila de ajustes del negocio (una por hub). La leen el TPV, la hoja de cobro, la cuenta impresa y el documento de venta; el servidor aplica al cobrar «Exigir cliente», «Permitir descuentos», el descuento máximo y los precios con IVA incluido.
Si falla: sin ser administrador los campos salen de solo lectura con «Solo un administrador puede cambiar estos ajustes.». Un fallo al guardar dice «No se pudieron guardar los ajustes.». Si se apagan a la vez efectivo y tarjeta y no hay otro medio, el TPV vuelve a ofrecer todos los medios activos.
Implicados: pendiente
Pendiente de enlazar: hub — la pestaña Ajustes que el shell genera desde el bloque de ajustes del módulo
Pendiente de enlazar: printing — la cabecera y el pie del tique que el negocio escribió en Impresión y que se copian aquí
QA: ninguno

### SALES-F35 Dar de alta y ordenar los departamentos del precio libre
Estado: hecho
Vertical: comun
Actor: responsable
Pantalla: Departamentos
Pasos:
1. Abre **Ventas / TPV → Departamentos**.
2. Pulsa **+**, escribe el Nombre («p. ej. Frutas y verduras»), elige «IVA que cobra» y la Posición.
3. Pulsa «Añadir». Para cambiarlo, toca la fila (o «Editar»), corrige y pulsa «Guardar»; para quitarlo, «Eliminar» y confirma.
4. En **Vender**, el botón «Precio libre» ofrece estos departamentos en ese orden, con su IVA al lado. Con la lista vacía ofrece las categorías de IVA tal cual.
Entra: las categorías de IVA de Impuestos.
Sale: el departamento (nombre, categoría de IVA, posición). Lo ya vendido conserva el nombre y el IVA con que se cobró.
Si falla: sin categorías de IVA, «No hay categorías de IVA que elegir. Configura antes tus tipos de IVA, en Impuestos.» y no deja añadir. Si no se pueden leer, «No se han podido leer las categorías de IVA.» con «Reintentar». Un departamento que otro ya borró: «Ese departamento ya no está en este negocio. Recarga la lista y vuelve a intentarlo.».
Implicados: pendiente
Pendiente de enlazar: taxes — la lista de categorías de IVA activas con su tipo
QA: ninguno

### SALES-F36 Preparar las notas rápidas
Estado: hecho
Vertical: comun
Actor: responsable
Pantalla: Notas rápidas
Pasos:
1. Abre **Ventas / TPV → Notas rápidas**.
2. Pulsa **+**, escribe la Nota (hasta 80 caracteres, p. ej. «sin sal») y la Posición.
3. Pulsa «Añadir». Para cambiarla, toca la fila o «Editar»; para quitarla, «Eliminar» y confirma.
4. En **Vender**, la hoja de la nota de una línea pinta estas notas como botones, en ese orden (SALES-F13).
Entra: nada de otros componentes.
Sale: la nota rápida. Borrarla deja de ofrecerla; las notas ya escritas en cuentas y ventas conservan su texto.
Si falla: «No se ha podido guardar la nota rápida.» o «No se ha podido eliminar la nota rápida.»; una nota que ya no existe: «Esa nota rápida ya no está en este negocio. Recarga la lista y vuelve a intentarlo.».
Implicados: ninguno
QA: ninguno

### SALES-F37 Añadir un medio de pago (Bizum, transferencia…)
Estado: parcial — no hay pantalla: solo se crea con el asistente o por la API, y no se puede editar, desactivar ni borrar un medio desde ninguna pantalla
Vertical: comun
Actor: responsable, asistente
Pantalla: asistente
Pasos:
1. Pide al asistente que añada el medio («añade Bizum como forma de pago»).
2. El medio aparece en la hoja de cobro con su icono y su nombre la próxima vez que se abre **Vender**.
Entra: nombre y tipo del medio.
Sale: el medio de pago, activo. De fábrica el negocio tiene solo Efectivo y Tarjeta; «Permitir transferencia» no ofrece nada mientras no exista un medio de tipo transferencia.
Si falla: lo que conteste el asistente (sin confirmar).
Implicados: ninguno
QA: ninguno
