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
Si falla: «No se pudo enlazar la cita con esta cuenta. Cóbrala sin salir de esta pantalla o la agenda podría seguir enseñándola como pendiente.». Sin la app Citas, o si la cita no se encuentra, el TPV se abre vacío y sin aviso. El cobro se rechaza, sin cobrar nada, si el servicio ya no existe en Servicios («Un servicio del tique ya no está en el catálogo. Quita la línea y vuelve a añadir el servicio»), si no tiene categoría fiscal («Un servicio del tique no tiene categoría fiscal, así que no se ha cobrado nada. Configúrala en el servicio, en Servicios») o si no se pueden leer los servicios («No se han podido cargar los servicios, así que no se ha cobrado nada. Comprueba que la app Servicios está instalada y vuelve a intentarlo»). Una cita que ya no nombra ningún servicio (solo su nombre) siembra una línea sin categoría fiscal, y el cobro se rechaza igual, sin cobrar nada: «Una línea no tiene categoría fiscal, así que no se ha cobrado nada. Quítala y vuelve a añadirla desde el catálogo o con un departamento».
Implicados: APPOINTMENTS-F17, SERVICES-F09, REC_FISCAL-F02, REC_PELUQUERIA-F09, REC_WA_CITA-F10
QA: B-05, B-06, BD-09

### SALES-F27 Pagar una línea con un bono
Estado: parcial — el servidor da por pagada con bono la línea que el cobro diga, sin preguntar a Servicios: por el asistente o la API una línea se cobra a 0 sin bono detrás (sales#539); pedir (por el asistente o la API) que se quite una línea ya enviada a cocina no la quita, pero avisa igual y Servicios suelta la sesión que la cubría; y tras dividir o juntar la cuenta, la sesión retenida se queda un día en la cuenta de origen (sales#540, leído en el código, sin ejecutar)
Vertical: peluqueria
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. Con Servicios instalado y la clienta asignada, abre el cobro: aparece «Líneas pagadas de otra forma» con cada línea de servicio y, en su hueco, lo que ofrece Servicios (qué bono, cuántas sesiones quedan).
2. Si la línea es de más de una unidad («Corte × 2»), pulsa «Separar en N líneas»: un bono cubre una línea entera de una unidad. Una línea que no se puede separar dice «Esta línea no se puede separar, así que ningún bono puede cubrirla.».
3. Acepta el bono en el hueco: la línea deja de cobrarse, el importe del botón baja y el resumen dice «Bono aplicado». Lo que no cubre el bono se cobra con su medio.
4. Cobra: la línea sale en el tique a 0,00 € con «Ya pagado».
5. Si se vuelve a una cuenta aparcada, el hueco enseña la sesión gastada con «Deshacer» y la línea sigue cubierta: no se cobra. Si se recarga la pantalla, la clienta vuelve sola (CUSTOMERS-F17) y pasa lo mismo; si se cobra sin clienta (no se pudo leer o se quitó), la línea se cobra a su precio y la sesión vuelve al bono, nunca las dos cosas.
Entra: los bonos de la clienta y sus sesiones, de Servicios.
Sale: la venta con la línea marcada como pagada por otro medio y, en cada línea, la fila de la cuenta de la que sale (avisa: sale.completed); Servicios da por gastada la sesión de cada línea pagada con bono, devuelve al bono la de una línea cobrada con dinero y deja retenidas las de las líneas que no entran en este cobro (SERVICES-F24). Si después se anula la venta, la sesión no vuelve al bono (SALES-F30). Quitar la línea o eliminar la cuenta lo anuncia (avisa: sales.order.line_removed o sales.order.voided) y Servicios suelta la sesión retenida.
Si falla: «No se ha podido separar la línea. La cuenta no ha cambiado.». Si mientras se separaba otro dispositivo le cambió la cantidad, la invitación o el descuento a esa línea, no se separa nada y la cuenta se vuelve a cargar: «Esa línea ha cambiado en otro dispositivo mientras se separaba. No se ha separado nada; la cuenta se ha vuelto a cargar: revísala y vuelve a separar la línea.»; nunca sale una unidad de más ni de menos, y al volver a separarla el aviso desaparece. Sin Servicios, sin clienta o sin cuenta abierta, no aparece la sección.
Implicados: SERVICES-F13, SERVICES-F15, SERVICES-F22, SERVICES-F23, SERVICES-F24, REC_PELUQUERIA-F10
QA: B-08
