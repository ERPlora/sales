// Los suplementos, **en la forma en que se leen** (pm#93 / ADR-0376; sales#148).
//
// ## Por qué vive aparte
//
// El mismo suplemento sale por cuatro puertas —la pantalla del tique (`<ok-receipt>`), el HTML que
// imprime el navegador (`receipt-html.ts`), el documento ESC/POS del térmico (`print-document.ts`)
// y la huella del `jobId`— y las cuatro tienen que decir LO MISMO. Si cada una compusiera su texto,
// acabarían discrepando y el cliente vería en pantalla algo distinto de lo que lleva en la mano.
// Es el mismo motivo por el que `print-document.ts` compone a través de `document-mappers.ts` en
// vez de duplicar «qué hay en esta cuenta».
//
// ## El importe NO se imprime, y es una decisión, no un olvido
//
// El delta del suplemento YA está dentro del `unit_price` de la línea: lo suma el servidor al
// cobrar (`authoritative_modifiers`, handler/src/lib.rs), y por eso el `line_total` de la derecha
// ya lo incluye. Un segundo número en esa columna no sumaría con los demás, y esa columna es
// justamente la que el cliente cuadra contra el TOTAL.
//
// El mercado respalda las dos mitades de eso (10 referencias, tabla en sales#148):
//   - Toast documenta este modelo tal cual: «omit the prices of modifiers — the modifier prices are
//     included in the price of the main item».
//   - Shopify POS lo implementa: «modifier prices are included in the line item's total price, not
//     displayed separately».
//   - La petición abierta más votada de Clover (19 votos, Under Review) es pedir exactamente esto:
//     «BURGER $10.49 / Extra Patty» en vez de «BURGER $8.99 / Extra Patty $1.50».
//   - Y el contraejemplo enseña el riesgo: Odoo sí pinta importe por sub-línea y arrastra el bug
//     abierto #187509 (16/17/18) — el reparto padre/hijo se descuadra y cambia el total a cobrar.
//
// Enseñar el importe del suplemento por separado exige que el suplemento SEA su propia línea. Eso
// es otro trabajo con su propia issue (sales#147, la línea hija del suplemento con tipo fiscal
// propio), no un formato distinto de esta.

/** Un suplemento **tal como lo lee quien paga**.
 *
 * Deliberadamente NO es la fila del catálogo ni la elección del carrito: es lo mínimo que el papel
 * necesita. El `option_id` viaja para dar IDENTIDAD (huella del `jobId`), nunca para imprimirse
 * cuando hay nombre. */
export interface PrintedModifier {
  /** Id del catálogo. Identidad, no texto: solo se imprime cuando NO se pudo resolver el nombre. */
  option_id?: string;
  /** Lo que lee el cliente. Vacío = el catálogo no estaba y solo queda el id. */
  name?: string;
  /** Céntimos que suma este suplemento. Ausente o 0 = elección gratuita («sin cebolla»).
   *  No se imprime (ver cabecera): entra en la IDENTIDAD, porque el mismo suplemento a otro precio
   *  es otra cuenta y su papel tiene que poder distinguirse del anterior. */
  price_delta?: number;
}

/** Separador entre suplementos de una misma línea. El mismo « · » que ya separa número y fecha en
 *  la cabecera del papel: en 32 columnas de térmico, una coma se confunde con la decimal. */
const SEP = ' · ';

/** Lo que se lee de un suplemento: el nombre comercial.
 *
 * NO el `kitchen_name` — ese existe justamente porque lo que se grita en el pase («SIN CEB.») no es
 * lo que el cliente debe leer. Sin nombre resoluble cae al `option_id`: una línea fea es preferible
 * a un cobro invisible, que es el fallo que esto arregla. Mismo criterio que la comanda de cocina
 * (`name_modifiers_for_kitchen`), que también manda el id antes que callarse. */
export function modifierLabel(m: PrintedModifier): string {
  return (m.name || '').trim() || (m.option_id || '').trim();
}

/** Los suplementos de una línea, en UNA sub-línea, en el ORDEN en que se eligieron.
 *
 * `undefined` —y no una cadena vacía— cuando no hay nada que decir: el papel solo pinta los campos
 * presentes, así que una línea sin suplementos sale byte a byte como salía antes de esta issue.
 *
 * Se encadenan en una sola línea a propósito: el renderizador ESC/POS del térmico imprime **una**
 * nota indentada por artículo (`  > {notes}`), así que varias líneas perderían el sangrado a partir
 * de la segunda. El papel HTML sí las pinta una debajo de otra, desde la misma lista. */
export function modifierNote(mods: PrintedModifier[] | undefined): string | undefined {
  const parts = (mods ?? []).map(modifierLabel).filter(Boolean);
  return parts.length ? parts.join(SEP) : undefined;
}

/** La huella de identidad de un suplemento: el id si lo hay (estable aunque renombren la opción),
 *  el nombre si no, y siempre con su importe.
 *
 * Es lo que mete los suplementos en el `jobId` de la cuenta previa. Sin esto «+ queso» y «sin
 * cebolla» hashean igual, la cola de impresión reconoce el mismo `job_id` (`ON CONFLICT DO
 * NOTHING`) y la cuenta corregida NO SALE — sin error y sin aviso. */
export function modifierIdentity(m: PrintedModifier): string {
  return `${m.option_id || m.name || ''}:${m.price_delta ?? 0}`;
}
