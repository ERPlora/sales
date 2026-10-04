# WORKFLOW — Ventas / TPV · Cobrar en la peluquería

Prefijo: SALES

## Flujos

### SALES-F26 Cobrar una cita desde la agenda
Estado: hecho
Vertical: peluqueria
Actor: empleado, responsable
Pantalla: Vender
Pasos:
1. En la Agenda de Citas, pulsa **Cobrar** en la cita: se abre **Vender**.
2. La cuenta ya trae el servicio de la cita con el precio pactado, la clienta y la profesional en el chip «Atiende …». Pulsar «Cobrar» dos veces sobre la misma cita no pone el servicio dos veces.
3. Añade productos, descuentos o lo que haga falta y cobra como en SALES-F01. Si se aparca y se recupera, la cuenta sigue atada a la cita.
4. Al cobrar, la agenda deja el **Cobrar** de esa cita en gris.
Entra: la cita (servicio, precio, clienta, profesional) que lee de Citas; el IVA del servicio, del catálogo de Servicios.
Sale: la cuenta enlazada a la cita y, al cobrar, la venta con la cita y la profesional (avisa: sale.completed y sales.sale.created_from_appointment); Citas anota que la cita se cobró. La cita no cambia de estado.
Si falla: «No se pudo enlazar la cita con esta cuenta. Cóbrala sin salir de esta pantalla o la agenda podría seguir enseñándola como pendiente.». Sin la app Citas, o si la cita no se encuentra, el TPV se abre vacío y sin aviso. Si el servicio de la cita no está en el catálogo cargado (p. ej. «Mostrar servicios en el TPV» apagado), la línea entra sin IVA (comportamiento al cobrar sin confirmar).
Implicados: pendiente
Pendiente de enlazar: appointments — APPOINTMENTS-F17: abrir el TPV con la cita y marcarla cobrada al cerrar la venta
Pendiente de enlazar: REC_WA_CITA — REC_WA_CITA-F10: el día de la cita, llegada, servicio y cobro
Pendiente de enlazar: REC_PELUQUERIA — el día completo del salón
QA: B-05, B-06, BD-09

### SALES-F27 Pagar una línea con un bono
Estado: hecho
Vertical: peluqueria
Actor: empleado, responsable
Pantalla: Cobro
Pasos:
1. Con Servicios instalado y la clienta asignada, abre el cobro: aparece «Líneas pagadas de otra forma» con cada línea de servicio y, en su hueco, lo que ofrece Servicios (qué bono, cuántas sesiones quedan).
2. Si la línea es de más de una unidad («Corte × 2»), pulsa «Separar en N líneas»: un bono cubre una línea entera de una unidad. Una línea que no se puede separar dice «Esta línea no se puede separar, así que ningún bono puede cubrirla.».
3. Acepta el bono en el hueco: la línea deja de cobrarse, el importe del botón baja y el resumen dice «Bono aplicado». Lo que no cubre el bono se cobra con su medio.
4. Cobra: la línea sale en el tique a 0,00 € con «Ya pagado».
Entra: los bonos de la clienta y sus sesiones, de Servicios.
Sale: la venta con la línea marcada como pagada por otro medio (avisa: sale.completed); Servicios gasta la sesión. Quitar la línea o eliminar la cuenta lo anuncia (avisa: sales.order.line_removed o sales.order.voided) y Servicios suelta la sesión retenida.
Si falla: «No se ha podido separar la línea. La cuenta no ha cambiado.». Sin Servicios, sin clienta o sin cuenta abierta, no aparece la sección.
Implicados: pendiente
Pendiente de enlazar: services — ofrecer el bono por línea, retener la sesión y gastarla al cobrar
QA: B-08
