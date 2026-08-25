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
 * Códigos que un `sales.complete_sale` rechazado puede devolver → clave del catálogo i18n.
 *
 * La UI se orienta por el CÓDIGO —el campo `code` del sobre—, **nunca** por la frase. Es la misma
 * deuda que hub#1070 está retirando del hub: mientras esto casaba subcadenas del mensaje, el día
 * que esa frase se tradujera (o que el SDK la sustituyera, que es justo lo que ADR-0400 acaba de
 * hacer con los códigos de plataforma) el mapeo dejaba de casar **en silencio** y el cajero volvía
 * al genérico «Error al cobrar» sin que nada lo delatara. El código no se traduce nunca.
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
  // sales#159 (ADR-0386) — the legs of a split payment did not add up to the total the SERVER
  // priced. The screen builds the split on its preview, and the preview can sit a cent away from
  // the server's total (VAT excluded, weighed quantities, prorated discounts all round on the
  // server). The sale is refused, never absorbed, so the cashier has to be told what happened and
  // that the legs are still on screen to be fixed — not shown a raw domain code.
  'sales.payments_do_not_match_total': 'ui.errorPaymentsMismatch',
  // sales#21 — no tax rule / no tax catalogue: the sale is refused, never priced by the browser.
  'sales.no_tax_rule': 'ui.errorNoTaxRule',
  'sales.tax_catalog_unavailable': 'ui.errorTaxCatalogUnavailable',
  'sales.idempotency_key_required': 'ui.errorCharge',
  // sales#152 (ADR-0381) — el servidor arma el combo contra `combos.options.all` y falla CERRADO.
  // Cada uno manda al cajero a un sitio distinto, y por eso no comparten mensaje: «el menú se
  // retiró» se arregla en Combos, «falta un plato» se arregla en el tique, y «no se pudo cargar el
  // catálogo» no es culpa de nadie que esté delante de la caja. Un único «no se ha podido cobrar»
  // los convertiría a los tres en el mismo callejón sin salida.
  'sales.combo_catalog_unavailable': 'ui.errorComboCatalogUnavailable',
  'sales.combo_not_available': 'ui.errorComboNotAvailable',
  'sales.combo_not_on_sale': 'ui.errorComboNotOnSale',
  'sales.combo_option_not_available': 'ui.errorComboOptionNotAvailable',
  'sales.combo_group_unresolved': 'ui.errorComboGroupUnresolved',
  'sales.combo_group_over_max': 'ui.errorComboGroupOverMax',
  'sales.combo_option_repeated': 'ui.errorComboOptionRepeated',
  'sales.combo_component_price_unknown': 'ui.errorComboComponentPriceUnknown',
  'sales.combo_tax_category_missing': 'ui.errorComboTaxCategoryMissing',
  'sales.too_many_lines': 'ui.errorTooManyLines',
  // sales#185 (hub#1074, ADR-0400) — códigos de PLATAFORMA, no de dominio. `complete_sale` declara
  // `taxes.rules.list` como `read` con `required: true`, así que un hub al que le falta la app de
  // impuestos (desinstalada a la fuerza, hub#1101, o desactivada por la cascada ADR-0128) rechaza
  // la venta desde el runtime. El cajero no tiene por qué leer «module `taxes` is not installed»:
  // lo que necesita saber es que falta una app y que NO se ha cobrado nada.
  module_not_installed: 'ui.errorMissingApp',
  module_inactive: 'ui.errorMissingApp',
  // hub#701: la read obligatoria existe pero no resolvió. Para `complete_sale` la única `required`
  // es el catálogo fiscal, así que es exactamente lo que ya se le dice al cajero desde sales#21.
  read_unavailable: 'ui.errorTaxCatalogUnavailable',
};

/**
 * Traduce el **código** de un cobro rechazado a una clave del catálogo del módulo.
 *
 * Recibe el `code` del sobre (`ErploraError.code`), no el mensaje: el código es el contrato
 * publicado del runtime y de los handlers, y es lo único que no cambia cuando la frase cambia.
 * Un error sin código (un fallo del navegador, un `throw` de una librería) cae al genérico.
 */
export function checkoutErrorKey(code: string): string {
  return MESSAGES[code] ?? 'ui.errorCharge';
}

/** El `code` de un error del runtime, o `''` si lo que llegó no lo lleva (no es del hub). */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : '';
}
