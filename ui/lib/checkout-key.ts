// sales#20 — el lado cliente del contrato de idempotencia y de los errores de dominio.
//
// El servidor no cierra una venta sin clave de idempotencia y, ante la misma clave dos veces,
// registra UNA sola venta. Para que eso le sirva a un cajero, la clave tiene que durar lo que dura
// el INTENTO DE COBRO, no lo que dura la petición: una clave por pantalla de cobro, reutilizada tal
// cual en cada reintento tras un timeout o un fallo, y descartada solo cuando la venta ya consta.

/** Alfabeto y longitud que acepta `schemas/complete_sale.json` (`^[A-Za-z0-9_.:-]{8,128}$`). */
const KEY_PREFIX = 'sale';

/**
 * Genera la clave de un intento de cobro.
 *
 * Usa `crypto.randomUUID` cuando está (todo navegador moderno en contexto seguro) y cae a
 * `getRandomValues` — y en último extremo a `Math.random`— para los webviews antiguos de alguna
 * tablet de mostrador: quedarse sin clave significaría no poder cobrar, y eso no es una opción.
 */
export function newIdempotencyKey(source: Crypto | undefined = globalThis.crypto): string {
  const uuid = source?.randomUUID?.();
  if (uuid) return `${KEY_PREFIX}-${uuid}`;
  const bytes = new Uint8Array(16);
  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  // El contador desempata dos llamadas dentro del mismo milisegundo en el camino degradado.
  seq = (seq + 1) % 1_000_000;
  return `${KEY_PREFIX}-${Date.now().toString(36)}-${seq.toString(36)}-${hex}`;
}
let seq = 0;

/**
 * Códigos de dominio que `sales.complete_sale` puede devolver → clave del catálogo i18n.
 *
 * La UI se orienta por el CÓDIGO, nunca por la frase: la frase del servidor está en inglés (idioma
 * fuente) y lleva detalle interno, y el día que el runtime traiga el canal de errores de dominio
 * traducibles (ADR-0205) el código será exactamente el mismo.
 */
const MESSAGES: Record<string, string> = {
  'sales.empty_sale': 'ui.errorEmptySale',
  'sales.payment_method_required': 'ui.errorPaymentMethod',
  'sales.payment_method_not_available': 'ui.errorPaymentMethod',
  'sales.discounts_not_allowed': 'ui.errorDiscountsOff',
  'sales.discount_out_of_range': 'ui.errorDiscountRange',
  'sales.tax_rate_out_of_range': 'ui.errorDiscountRange',
  'sales.customer_required': 'ui.errorCustomerRequired',
  'sales.amount_negative': 'ui.errorAmountNegative',
  'sales.insufficient_tendered': 'ui.errorInsufficientTendered',
  // sales#21 — no tax rule / no tax catalogue: the sale is refused, never priced by the browser.
  'sales.no_tax_rule': 'ui.errorNoTaxRule',
  'sales.tax_catalog_unavailable': 'ui.errorTaxCatalogUnavailable',
  'sales.idempotency_key_required': 'ui.errorCharge',
};

/** Traduce el mensaje de error de un cobro rechazado a una clave del catálogo del módulo. */
export function checkoutErrorKey(message: string): string {
  for (const [code, key] of Object.entries(MESSAGES)) {
    // El runtime puede envolver el error del handler («command `x` failed: …»), así que se busca
    // el código dentro del mensaje en vez de exigir que lo encabece.
    if (message.includes(code)) return key;
  }
  return 'ui.errorCharge';
}
