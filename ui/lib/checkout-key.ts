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
 * Codes a refused `sales.complete_sale` can answer → key of the module's i18n catalogue.
 *
 * The UI orients itself by the CODE — the envelope's `code` field — and **never** by the sentence.
 * This is the same debt hub#1070 is retiring from the hub: while this matched substrings of the
 * message, the day that sentence got translated (or the SDK replaced it, which is exactly what
 * ADR-0400 just did to the platform codes) the mapping stopped matching **in silence** and the
 * cashier fell back to the generic "could not charge" with nothing to give it away. A code is
 * never translated.
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
  // sales#498 — cash over the legal limit (Ley 7/2012 art. 7). The till blocks it before the tap
  // from the preview's `cash_limit`; this is the net for a hub that does not publish it yet.
  'sales.cash_limit_exceeded': 'ui.errorCashLimit',
  // sales#21 — no tax rule / no tax catalogue: the sale is refused, never priced by the browser.
  'sales.no_tax_rule': 'ui.errorNoTaxRule',
  'sales.tax_catalog_unavailable': 'ui.errorTaxCatalogUnavailable',
  // sales#519 — the VAT of a service comes from the services catalogue and a line nobody
  // classified is refused instead of going out at 0 %. Each one is fixed somewhere different.
  'sales.service_catalog_unavailable': 'ui.errorServiceCatalogUnavailable',
  'sales.service_not_available': 'ui.errorServiceNotAvailable',
  'sales.service_tax_category_missing': 'ui.errorServiceTaxCategoryMissing',
  'sales.tax_category_missing': 'ui.errorTaxCategoryMissing',
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
  // sales#545 — the check changed while it was being charged (a line voided, removed or charged
  // on another device, or the check closed), or the screen charged a line that is no longer on
  // it. Nothing was charged: the till reads the check again and says so.
  'sales.order_changed': 'ui.errorOrderChanged',
  'sales.order_line_not_available': 'ui.errorOrderChanged',
  // sales#147 (the amendment to ADR-0376) — a supplement that taxes differently now gets a LINE OF
  // ITS OWN, so it is charged instead of refused. What is still refused is a supplement that bills
  // apart and is worth NOTHING: a 0 € — or negative — row at another rate is a rebate wearing a tax
  // category, and it would declare a base the customer never bought. Its own message and not
  // `ui.errorCharge` on purpose: it is fixed on the option in the Modifiers catalogue, in ten
  // seconds, and only if the screen says which one.
  'sales.modifier_child_price_invalid': 'ui.errorModifierChildPrice',
  // sales#201 (ADR-0147 §2.2) — an invalid quantity. The quantity pad already refuses off-grid
  // amounts before charging, so the handler is the last net; when it fires, the cashier gets the
  // SAME sentence the pad gives instead of a bare «could not charge».
  'sales.quantity_off_grid': 'ui.qtyOffGrid',
  'sales.quantity_not_positive': 'ui.errorQuantityNotPositive',
  // sales#185 (hub#1074, ADR-0400) — PLATFORM codes, not domain ones. `complete_sale` declares
  // `taxes.rules.list` as a read with `required: true`, so a hub missing the tax app (force
  // uninstalled, hub#1101, or deactivated by the ADR-0128 cascade) has the sale refused by the
  // runtime itself. The cashier has no business reading "module `taxes` is not installed": what
  // they need to know is that an app is missing and that NOTHING was charged.
  module_not_installed: 'ui.errorMissingApp',
  module_inactive: 'ui.errorMissingApp',
  // hub#701: the required read exists but did not resolve. The only `required` read of
  // `complete_sale` is the tax catalogue, so this is exactly what sales#21 already says.
  read_unavailable: 'ui.errorTaxCatalogUnavailable',
  // hub#1935 — the hub files with the tax authority for real and has no way to get this ticket
  // there, so the dispatcher refused the sale before writing anything. Same sentences as the notice
  // the till shows at mount (`lib/fiscal-road.ts`).
  'fiscal.no_representation_grant': 'ui.fiscalRoadNoGrant',
  'fiscal.gateway_not_enrolled': 'ui.fiscalRoadNoConnection',
  'fiscal.own_certificate_expired': 'ui.fiscalRoadOwnCertificateExpired',
};

/**
 * Translates the **code** of a refused checkout into a key of the module's catalogue.
 *
 * It takes the envelope's `code` (`ErploraError.code`), not the message: the code is the published
 * contract of the runtime and of the handlers, and it is the only thing that does not change when
 * the sentence does. An error with no code (a browser failure, a library `throw`) falls back to
 * the generic one.
 */
export function checkoutErrorKey(code: string): string {
  return MESSAGES[code] ?? 'ui.errorCharge';
}

/** The `code` of a runtime error, or `''` when what arrived carries none (it is not the hub's). */
/** Codes that mean «the screen is not the check any more»: the cart is read again (sales#545). */
export function isCheckChanged(code: string): boolean {
  return MESSAGES[code] === 'ui.errorOrderChanged';
}

export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : '';
}
