// refund-allocation — devolver una venta cobrada con VARIOS medios (sales#160 / ADR-0386 dec. 3).
//
// La aritmética de la pantalla de devolución, fuera del Web Component para poder probarla sin DOM:
// qué propone el reparto por defecto, por qué no se puede confirmar todavía, y qué viaja al
// servidor. El servidor vuelve a decidirlo TODO (`sales.refund`): esto no es la autoridad, es lo
// que hace que el operador vea el problema mientras teclea y no después de pulsar.
//
// Es el fallo más repetido del mercado, y de las tres formas de fallar hay una lección en cada una:
//
//   1. SHOPIFY POS prorratea entre los medios y lo tiene HARDCODED — «there's no setting or
//      permission to change it». Por eso aquí el prorrateo es la PROPUESTA por defecto y cada pata
//      se edita: la propuesta acierta el 90 % de las veces y el 10 % restante no puede ser una
//      jaula.
//   2. SQUARE obliga al tender original «even if the gift card does not exist or has been reused»
//      (reportado en 2018, sin solución en 2021). De ahí que `refundable` y `remaining` sean cosas
//      DISTINTAS: `refundable = 0` significa «no por su propia puerta», nunca «este dinero no
//      sale». La pata entra igual en el reparto y lo que se pide es un DESTINO.
//   3. ODOO, al devolver por otro método, deja el método al debe y al haber del mismo asiento. Por
//      eso el destino viaja aparte del origen (`to_payment_method_id`) en vez de reescribir la
//      pata: el origen manda sobre el tope, el destino sobre la caja, y ninguno finge ser el otro.

/** Una pata del cobro con su tope y su elegibilidad, tal como la devuelve `sales.refund_options`. */
export interface RefundLeg {
  payment_id: string;
  sort_order: number;
  payment_method_id: string | null;
  payment_method_name: string;
  payment_method_type: string;
  /** Lo que esta pata cobró, en céntimos. */
  charged: number;
  /** Lo que ya se le devolvió, en céntimos. */
  refunded: number;
  /** El TOPE: cuánto dinero puede salir todavía de esta pata. */
  remaining: number;
  /** 1 cuando puede volver por su PROPIO método. No es lo mismo que `remaining > 0`. */
  refundable: number;
  /** '' · 'already_refunded' · 'method_unavailable' — motivo de que no sea elegible. */
  reason: string;
}

/** Lo que el operador lleva tecleado: por pata, cuántos céntimos y (si lo cambió) a dónde. */
export type RefundDraft = Record<string, { amount: number; to?: string }>;

/** Una pata del payload de `sales.refund`. */
export interface RefundAllocationPayload {
  payment_id: string;
  amount: number;
  to_payment_method_id?: string;
}

/** Por qué no se puede confirmar todavía, o `undefined` cuando sí se puede. */
export type RefundBlock =
  | { reason: 'nothing' }
  | { reason: 'over-cap'; leg: RefundLeg; amount: number; remaining: number }
  | { reason: 'needs-destination'; leg: RefundLeg; why: string };

const cents = (n: unknown): number => Math.max(0, Math.round(Number(n) || 0));

/** El dinero que todavía puede salir de esta venta: la suma de los topes, no de lo cobrado. */
export function refundableTotal(legs: readonly RefundLeg[]): number {
  return legs.reduce((sum, l) => sum + cents(l.remaining), 0);
}

/** Lo que el operador lleva repartido, en céntimos. */
export function draftTotal(draft: RefundDraft): number {
  return Object.values(draft).reduce((sum, e) => sum + cents(e?.amount), 0);
}

/**
 * LA PROPUESTA: `amount` céntimos repartidos a prorrata del tope de cada pata.
 *
 * Reparto por RESTO MAYOR, igual que el `allocate_amount` del handler: cada pata se lleva la parte
 * entera y los céntimos sobrantes van a las de mayor resto. Redondear cada pata por su cuenta
 * perdería o inventaría céntimos, y un reparto que no suma exacto lo rechaza el servidor
 * (`sales.refund_exceeds_tender` o un descuadre) justo cuando el cliente está delante.
 *
 * Entran TODAS las patas con tope, elegibles o no — ver la lección 2 de arriba. La agotada no,
 * porque su tope es cero y proponerle nada sería proponer un rechazo.
 */
export function proportionalSplit(amount: number, legs: readonly RefundLeg[]): Record<string, number> {
  const split: Record<string, number> = {};
  for (const l of legs) split[l.payment_id] = 0;

  const weights = legs.map((l) => cents(l.remaining));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const magnitude = Math.min(cents(amount), totalWeight);
  if (magnitude <= 0 || totalWeight <= 0) return split;

  const remainders: Array<{ rest: number; index: number }> = [];
  let assigned = 0;
  legs.forEach((l, i) => {
    const numerator = magnitude * weights[i];
    const part = Math.floor(numerator / totalWeight);
    split[l.payment_id] = part;
    assigned += part;
    remainders.push({ rest: numerator % totalWeight, index: i });
  });

  // Resto mayor primero; a igualdad, la pata anterior (orden estable del tique), como el handler.
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index);
  let left = magnitude - assigned;
  for (const { index } of remainders) {
    if (left <= 0) break;
    split[legs[index].payment_id] += 1;
    left -= 1;
  }
  return split;
}

/**
 * POR QUÉ no se puede confirmar, en el orden en que le importa al operador.
 *
 * El tope va ANTES que el destino a propósito: si la pata está pasada de tope, elegir un destino no
 * arregla nada y pedirlo primero manda al operador a resolver el problema equivocado.
 */
export function refundBlock(draft: RefundDraft, legs: readonly RefundLeg[]): RefundBlock | undefined {
  const known = legs.reduce((sum, l) => sum + cents(draft[l.payment_id]?.amount), 0);
  if (known <= 0) return { reason: 'nothing' };

  const ordered = [...legs].sort((a, b) => a.sort_order - b.sort_order);
  for (const leg of ordered) {
    const amount = cents(draft[leg.payment_id]?.amount);
    if (amount > cents(leg.remaining)) {
      return { reason: 'over-cap', leg, amount, remaining: cents(leg.remaining) };
    }
  }
  for (const leg of ordered) {
    const entry = draft[leg.payment_id];
    const amount = cents(entry?.amount);
    // Una pata a cero no se explica: el reparto por defecto puede dejarla ahí y avisar sería ruido.
    if (amount > 0 && Number(leg.refundable) !== 1 && !entry?.to) {
      return { reason: 'needs-destination', leg, why: leg.reason };
    }
  }
  return undefined;
}

/**
 * Lo que viaja a `sales.refund`, en el orden del tique. Las patas a cero se caen: el servidor las
 * rechazaría (`sales.refund_amount_invalid`) y mandarlas solo serviría para que el operador viera
 * un error sobre algo que no tecleó.
 */
export function buildAllocations(draft: RefundDraft, legs: readonly RefundLeg[]): RefundAllocationPayload[] {
  return [...legs]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((leg) => {
      const entry = draft[leg.payment_id];
      const amount = cents(entry?.amount);
      if (amount <= 0) return [];
      // El destino solo viaja cuando de verdad CAMBIA algo: mandarlo igual al método de la propia
      // pata haría que el servidor lo resolviera por el catálogo en vez de por la pata, que es más
      // camino para el mismo sitio.
      const changed = entry?.to && entry.to !== leg.payment_method_id;
      return [{ payment_id: leg.payment_id, amount, ...(changed ? { to_payment_method_id: entry.to } : {}) }];
    });
}

/** Motivo del servidor → clave i18n. La UI se orienta por el CÓDIGO, nunca por la frase. */
const REASON_KEYS: Record<string, string> = {
  already_refunded: 'ui.refundReasonAlreadyRefunded',
  method_unavailable: 'ui.refundReasonMethodUnavailable',
};

/**
 * Un motivo que este build no conoce —un módulo más nuevo estrenando el suyo— cae a un texto
 * genérico y NO a vacío: una pata bloqueada sin explicación es peor que una explicación imprecisa.
 */
export function reasonKey(reason: string): string {
  return REASON_KEYS[reason] ?? 'ui.refundReasonNotEligible';
}

/**
 * Lo que el operador teclea (en la moneda del hub, en su idioma) → unidades MENORES enteras, que
 * es la unidad del hub (ADR-0123). `decimals` es la escala de la moneda (ADR-0123 §7): 2 en EUR,
 * 0 en JPY, 3 en KWD. El nombre dice «Cents» por historia; lo que devuelve son unidades menores.
 *
 * 🔴 No es `Number(text) * 100`. En español un importe se escribe «25,00» y `Number('25,00')` es
 * `NaN`; un `NaN` que se cuela como importe de devolución es dinero que no sale, o que sale de
 * más, sin un solo mensaje de error. En esta misma cadena ya se coló una fixture con euros donde
 * el TPV lee céntimos.
 *
 * El separador DECIMAL es el ÚLTIMO `,` o `.` que aparezca; lo anterior es separador de miles y se
 * tira, junto con el símbolo de moneda y los espacios. Así «1.234,56 €» y «1,234.56» dan lo mismo
 * sin tener que saber el locale.
 *
 * sales#377: con escala 0 (yenes) no hay decimales que escribir, así que un separador seguido de
 * EXACTAMENTE tres cifras es de miles («1.500» o «1,500 ¥» son mil quinientos, nunca 1,5 → 2 ¥).
 * Cualquier otra fracción tecleada se redondea a la unidad.
 */
export function parseAmountToCents(text: string, decimals = 2): number {
  const scale = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
  const raw = String(text ?? '').replace(/[^\d.,-]/g, '');
  if (!raw || raw.startsWith('-')) return 0;
  const lastSep = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
  const digits = (part: string): string => part.replace(/[^\d]/g, '');
  const grouping = scale === 0 && lastSep >= 0 && /^\d{3}$/.test(raw.slice(lastSep + 1));
  const cut = grouping ? -1 : lastSep;
  const whole = digits(cut >= 0 ? raw.slice(0, cut) : raw);
  const frac = cut >= 0 ? digits(raw.slice(cut + 1)) : '';
  // Aritmética sobre los DÍGITOS, no sobre un float: `1.005 * 100` es `100.49999999999999` en
  // IEEE-754 y `Math.round` lo baja a 100. Una unidad perdida por redondeo binario es exactamente
  // lo que ADR-0123 prohíbe, y el modo del hub es HALF_UP (art. 11 de la Ley 46/1998 del euro).
  const padded = frac.padEnd(scale + 1, '0').slice(0, scale + 1);
  const units = Number(whole || '0');
  if (!Number.isFinite(units)) return 0;
  const minor = units * 10 ** scale + Number(padded.slice(0, scale) || '0');
  return Number(padded[scale]) >= 5 ? minor + 1 : minor;
}

/**
 * Unidades menores → lo que se ESCRIBE en el campo editable, con el separador decimal del idioma
 * activo y la escala de la moneda del hub (`decimals`: 2 en EUR, 0 en JPY, 3 en KWD — sales#377).
 *
 * 🔴 Sin esto el campo pintaba «50.00» justo encima de un «Cobrado: 50,00 €», y el operador tiene
 * que decidir sobre ese número si el punto es decimal o de miles. Es el campo con el que se decide
 * cuánto dinero sale de la caja.
 *
 * SIN separador de miles a propósito: lo que se pinta se tiene que poder reeditar a mano y volver
 * a leer igual (`parseAmountToCents(formatAmountInput(x, l, d), d) === x`). Agrupar en un campo
 * editable es la forma más rápida de que un importe cambie solo. Por CADENA, sin dividir: ninguna
 * unidad puede cambiar por redondeo binario.
 */
export function formatAmountInput(amount: number, locale: string, decimals = 2): string {
  const scale = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
  const padded = String(Math.max(0, Math.round(Number(amount) || 0))).padStart(scale + 1, '0');
  if (scale === 0) return padded;
  let decimal = '.';
  try {
    decimal = new Intl.NumberFormat(locale || undefined)
      .formatToParts(1.1)
      .find((p) => p.type === 'decimal')?.value ?? '.';
  } catch {
    // Un locale que Intl no reconoce no puede dejar el campo vacío: se cae al punto y sigue.
    decimal = '.';
  }
  return `${padded.slice(0, -scale)}${decimal}${padded.slice(-scale)}`;
}
