# WORKFLOW — Ventas / TPV · Cobrar en la peluquería

Prefijo: SALES

## Flujos

### SALES-F26 Cobrar una cita desde la agenda
Estado: parcial — anular después la venta deja la cita marcada como cobrada y su «Cobrar» en gris (SALES-F30)
Vertical: peluqueria
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la Agenda de Citas, pulsa **Cobrar** en la cita: se abre **Vender**.
2. La cuenta ya trae el servicio de la cita con el precio pactado, la clienta y la profesional en el chip «Atiende …». Pulsar «Cobrar» dos veces sobre la misma cita no pone el servicio dos veces.
3. Añade productos, descuentos o lo que haga falta y cobra como en SALES-F01. Si se aparca y se recupera, la cuenta sigue atada a la cita.
4. Al cobrar, la agenda deja el **Cobrar** de esa cita en gris.
Entra: la cita (servicio, precio, clienta, profesional) que lee de Citas; el IVA del servicio, que el servidor saca del catálogo de Servicios al cobrar (también si el TPV no lo había cargado, p. ej. con «Mostrar servicios en el TPV» apagado, y también si el servicio está archivado); el precio es el pactado en la cita.
Sale: la cuenta enlazada a la cita y, al cobrar, la venta con la cita y la profesional (avisa: sale.completed y sales.sale.created_from_appointment); Citas anota que la cita se cobró. La cita no cambia de estado.
Si falla: «No se pudo enlazar la cita con esta cuenta. Cóbrala sin salir de esta pantalla o la agenda podría seguir enseñándola como pendiente.». Sin la app Citas, o si la cita no se encuentra, el TPV se abre vacío y sin aviso. El cobro se rechaza, sin cobrar nada, si el servicio ya no existe en Servicios («Un servicio del tique ya no está en el catálogo. Quita la línea y vuelve a añadir el servicio»), si no tiene categoría fiscal («Un servicio del tique no tiene categoría fiscal, así que no se ha cobrado nada. Configúrala en el servicio, en Servicios») o si no se pueden leer los servicios («No se han podido cargar los servicios, así que no se ha cobrado nada. Comprueba que la app Servicios está instalada y vuelve a intentarlo»).
Implicados: APPOINTMENTS-F17, SERVICES-F09, REC_FISCAL-F02, REC_PELUQUERIA-F09, REC_WA_CITA-F10
QA: B-05, B-06, BD-09

### SALES-F27 Pagar una línea con un bono
Estado: parcial — el servidor da por pagada con bono la línea que el cobro diga, sin preguntar a Servicios: por el asistente o la API una línea se cobra a 0 sin bono detrás; y pedir (por el asistente o la API) que se quite una línea ya enviada a cocina no la quita, pero avisa igual y Servicios suelta la sesión que la cubría; GRAVE (leído en el código, sin ejecutar): tras recargar la pantalla o volver a una cuenta aparcada, el hueco del bono pinta la sesión como gastada sin avisar al TPV, que vuelve a cobrar la línea a su precio, y al cobrar Servicios gasta además la sesión: la clienta paga dos veces (SERVICES-F22); y las sesiones se gastan por cuenta, no por línea: cobrar solo una parte de la cuenta, o la original tras dividirla, gasta también las sesiones de líneas que no se cobran, y al juntar cuentas la de la absorbida no se gasta (SERVICES-F24)
Vertical: peluqueria
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. Con Servicios instalado y la clienta asignada, abre el cobro: aparece «Líneas pagadas de otra forma» con cada línea de servicio y, en su hueco, lo que ofrece Servicios (qué bono, cuántas sesiones quedan).
2. Si la línea es de más de una unidad («Corte × 2»), pulsa «Separar en N líneas»: un bono cubre una línea entera de una unidad. Una línea que no se puede separar dice «Esta línea no se puede separar, así que ningún bono puede cubrirla.».
3. Acepta el bono en el hueco: la línea deja de cobrarse, el importe del botón baja y el resumen dice «Bono aplicado». Lo que no cubre el bono se cobra con su medio.
4. Cobra: la línea sale en el tique a 0,00 € con «Ya pagado».
5. Si se recarga la pantalla o se vuelve a una cuenta aparcada, el hueco enseña la sesión gastada con «Deshacer», pero el TPV ya no da la línea por cubierta y la cobra a su precio: hasta que se arregle, pulsa «Deshacer» y otra vez «Gastar una sesión» antes de cobrar (leído en el código, sin ejecutar).
Entra: los bonos de la clienta y sus sesiones, de Servicios.
Sale: la venta con la línea marcada como pagada por otro medio (avisa: sale.completed); Servicios da por gastadas todas las sesiones retenidas en esa cuenta, entren o no sus líneas en este cobro (SERVICES-F24). Si después se anula la venta, la sesión no vuelve al bono (SALES-F30). Quitar la línea o eliminar la cuenta lo anuncia (avisa: sales.order.line_removed o sales.order.voided) y Servicios suelta la sesión retenida.
Si falla: «No se ha podido separar la línea. La cuenta no ha cambiado.». Sin Servicios, sin clienta o sin cuenta abierta, no aparece la sección.
Implicados: SERVICES-F13, SERVICES-F15, SERVICES-F22, SERVICES-F23, SERVICES-F24, REC_PELUQUERIA-F10
QA: B-08
