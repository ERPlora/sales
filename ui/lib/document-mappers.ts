// Pure mappers: sale (`sales.get`) + lines (`sales.lines`) + settings (`sales.settings.get`)
// → OutfitKit document contract (`ReceiptData` / `InvoiceData`). No side effects, testable.
//
// Business identity does NOT live in the sales module: the runtime resolves the issuer from
// `hub_settings.business_legal_name`/`business_tax_id` (single source, ADR-0061) onto the invoice
// row, and `invoice.by_source` hands it back here as `FiscalData.issuer_name`/`issuer_nif` (#32).
// `receipt_header` stays as the merchant's deliberate ticket branding (first line = name, rest =
// address); the VeriFactu QR comes from `verifactu.records.by_invoice` (ADR-0140/0184).

import { fromMicro } from './quantity';
import { unitTag } from './price-label';
import { payMethodDisplayName } from './pay-icons.js';
import type {
  ReceiptData,
  ReceiptLine,
  InvoiceData,
  InvoiceLine,
  OkReceiptLabels,
  OkInvoiceLabels,
} from '@erplora/outfitkit';

/** Dinero: la venta guarda CÉNTIMOS (INTEGER, ADR-0007/0123); el documento pinta euros. */
function toEuros(cents: number | undefined): number {
  return Number(cents ?? 0) / 100;
}

/** Fecha legible según locale («16/07/2026, 19:00»). ISO no parseable → se devuelve tal cual;
 *  vacía → undefined. Nunca "Invalid Date" en un tiquet. */
export function formatDateTime(iso: string | undefined, locale = 'es'): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

type Translate = (key: string) => string;

/** sales#108 — the sale stores the CANONICAL method name (the seed is English by contract,
 *  ADR-0055, and the handler persists the catalogue row's `name`, not the label the till showed).
 *  It is data, not a label: the paper translates it at render time. Without `t` (legacy callers)
 *  the raw name goes through. */
function payLabel(name: string | undefined, t?: Translate): string | undefined {
  if (!name) return undefined;
  return t ? payMethodDisplayName({ id: '', name }, t) : name;
}

/** Labels del tiquet (`<ok-receipt .labels>`) desde el catálogo del módulo (ADR-0055). */
export function receiptLabels(t: Translate): OkReceiptLabels {
  return {
    empty: t('ui.docEmpty'),
    phone: t('ui.docPhone'),
    receipt: t('ui.docReceipt'),
    servedBy: t('ui.docServedBy'),
    customer: t('ui.docCustomer'),
    item: t('ui.docItem'),
    amount: t('ui.docAmount'),
    noLines: t('ui.docNoLines'),
    subtotal: t('ui.docSubtotal'),
    total: t('ui.docTotal'),
    change: t('ui.docChange'),
  };
}

/** Labels de la factura (`<ok-invoice .labels>`) desde el catálogo del módulo (ADR-0055). */
export function invoiceLabels(t: Translate): OkInvoiceLabels {
  return {
    empty: t('ui.docEmptyInvoice'),
    invoice: t('ui.docInvoice'),
    number: t('ui.docNumber'),
    date: t('ui.docDate'),
    dueDate: t('ui.docDueDate'),
    billTo: t('ui.docBillTo'),
    description: t('ui.docDescription'),
    qty: t('ui.docQty'),
    price: t('ui.docPrice'),
    discount: t('ui.docDiscount'),
    tax: t('ui.docTax'),
    amount: t('ui.docAmount'),
    noLines: t('ui.docNoLines'),
    taxBase: t('ui.docTaxBase'),
    discountTotal: t('ui.docDiscountTotal'),
    total: t('ui.docTotal'),
    paymentMethod: t('ui.docPaymentMethod'),
  };
}

/** Fila de `sales.get`. */
export interface SaleRow {
  id: string;
  sale_number: string;
  status?: string;
  subtotal?: number;
  tax_amount?: number;
  tax_breakdown?: string; // JSON {"21.00": {"base": x, "tax": y}}
  discount_amount?: number;
  discount_percent?: number;
  total?: number;
  payment_method_name?: string;
  amount_tendered?: number;
  change_due?: number;
  customer_name?: string;
  notes?: string;
  channel?: string;
  created_at?: string;
  document_type?: string; // 'ticket' | 'invoice' (se añade en Fase 3)
}

/** Fila de `sales.lines`. */
export interface SaleLineRow {
  product_name: string;
  product_sku?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_rate?: number;
  net_amount?: number;
  tax_amount?: number;
  line_total: number;
  is_gift?: number;
  gift_reason?: string;
  /** ── Contexto de unidades CONGELADO en la línea (ADR-0147 §2.4; sales#28): la fila ya lo
   *  devuelve y el PAPEL lo pinta — la cantidad con su unidad y el precio con la suya. Sin
   *  unidad (línea antigua o `ud`) no hay nada que etiquetar. */
  unit_code?: string;
  unit_name?: string;
  pricing_unit_code?: string;
  pricing_unit_name?: string;
  /** pm#93 — snapshot JSON de los suplementos que congeló el servidor al COBRAR
   *  (`authoritative_modifiers`, en el orden de elección). Llega como TEXT porque eso es la
   *  columna; el papel lo desempaqueta con `parseModifierSnapshot`. */
  modifiers?: string;
}

/** El snapshot `sales_sale_item.modifiers` → lo que el papel imprime (sales#148).
 *
 * DEFENSIVO a propósito, y en una sola dirección: una fila escrita antes de que nadie llenara la
 * columna, o un JSON a medias, **no puede tumbar un tique**. Se pierde el suplemento de esa línea,
 * nunca el documento — mismo criterio que `parseModifiers` en el carrito.
 *
 * Se queda con el nombre COMERCIAL, no con el de cocina: `kitchen_name` existe justamente porque
 * lo que se grita en el pase («SIN CEB.») no es lo que el cliente debe leer en su tique. Y si no
 * hay nombre resoluble sobrevive el `option_id`: una línea fea es preferible a un cobro invisible,
 * que es el fallo que esta issue arregla. */
export function parseModifierSnapshot(raw: unknown): PrintedModifier[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const out = parsed
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m): PrintedModifier => {
      const option_id = m.option_id == null ? undefined : String(m.option_id);
      const name = m.name == null || String(m.name) === '' ? undefined : String(m.name);
      const delta = Number(m.price_delta);
      return {
        ...(option_id ? { option_id } : {}),
        ...(name ? { name } : {}),
        ...(Number.isFinite(delta) ? { price_delta: delta } : {}),
      };
    })
    // Ni nombre ni id no es un suplemento: es ruido, y un renglón en blanco en el tique.
    .filter((m) => m.name || m.option_id);
  return out.length ? out : undefined;
}

/** Etiqueta de línea para el documento: añade "(Invitación)" a una línea regalo (comp). */
function lineLabel(l: SaleLineRow): string {
  return Number(l.is_gift) ? `${l.product_name} (Invitación)` : l.product_name;
}

/** Subconjunto de `sales.settings.get` que afecta al documento. */
export interface SaleSettings {
  receipt_header?: string;
  receipt_footer?: string;
  receipt_footer_image?: string;
  /** QR promocional del tiquet (reseñas Google, redes…): URL + leyenda configurables. */
  receipt_marketing_url?: string;
  receipt_marketing_text?: string;
  default_document_format?: string; // 'ticket' | 'invoice'
  currency?: string;
}

/** Datos fiscales (VeriFactu) del documento: QR de validación AEAT, número oficial y partes.
 *  Los resuelve el componente vía `invoice.by_source` + `verifactu.records.by_invoice`. Todo
 *  opcional: si no hay registro fiscal (p.ej. venta sin factura aún), el documento se pinta igual
 *  pero sin QR. */
export interface FiscalData {
  qr?: string;          // qr_url of the VeriFactu record (AEAT validation URL)
  qr_note?: string;     // caption under the QR (e.g. AEAT CSV or "Validate at the AEAT")
  number?: string;      // official fiscal number (may differ from sale_number)
  issuer_nif?: string;
  /** Issuer legal name, snapshotted on the invoice from `hub_settings.business_legal_name`
   *  (single source ADR-0061) — the business profile the ticket header must honor (#32). */
  issuer_name?: string;
  customer_name?: string;
  customer_tax_id?: string;
  /** sales#103 (hub#963 / ADR-0363) — autoservicio «pide tu factura»: el localizador acuñado en
   *  el mostrador contra `POST /api/hub/public-claims`. Solo sobre F2: una F1 nació completa y
   *  una F3 ya ES el canje. Ausente (sin módulo invoice, sin permiso, fallo) → el papel sale como
   *  siempre: sin claim y sin segundo QR. */
  claim_locator?: string;
  /** URL ABSOLUTA del segundo QR (`https://<origen del hub>/p/<locator>`). Separada a propósito
   *  del `qr` fiscal: aquel apunta a la AEAT y NO vale como localizador (numserie correlativo y
   *  público) — son DOS códigos con destinos distintos. */
  claim_qr?: string;
}

/** sales#103 — la leyenda del segundo QR. Cadena visible → catálogo `en` Y `es` (ADR-0055/0199);
 *  este inglés canónico es solo el respaldo de las llamadas sin traductor (tests, integraciones). */
const CLAIM_NOTE_FALLBACK = 'Get your invoice';

/**
 * sales#103 — el bloque «pide tu factura» del papel, en las claves que el renderer ESC/POS lee
 * (`claim_qr_data` / `claim_note` / `claim_locator`, ADR-0363).
 *
 * Única fuente de los tres campos para TODOS los papeles (ESC/POS e HTML): si cada uno los
 * compusiera por su cuenta, acabarían discrepando y un tique llevaría un localizador que su
 * reimpresión no reconoce. **Sin locator acuñado el bloque es VACÍO de verdad** — ni claves
 * `undefined` — porque el renderer imprime solo los campos presentes: un hub que no adopta la
 * puerta imprime exactamente lo de antes.
 */
export function claimPrintFields(
  fiscal: FiscalData,
  t?: Translate,
): { claim_qr_data?: string; claim_note?: string; claim_locator?: string } {
  if (!fiscal.claim_locator) return {};
  return {
    claim_qr_data: fiscal.claim_qr || undefined,
    claim_note: t ? t('ui.claimNote') : CLAIM_NOTE_FALLBACK,
    claim_locator: fiscal.claim_locator,
  };
}

/** Canonical English fallback for the business name (ADR-0055): the UI passes the translated
 *  default (`ui.docDefaultBusiness`); bare mapper calls (tests, integrations) get this one. */
const DEFAULT_BUSINESS_NAME = 'My business';

/** `receipt_header` contract: first line = display name, remaining lines = address. */
function splitHeader(raw: string | undefined): { name?: string; address?: string } {
  const header = (raw || '').trim();
  return {
    name: header.split('\n')[0] || undefined,
    address: header.split('\n').slice(1).join(' ') || undefined,
  };
}

interface TaxLine {
  label: string;
  rate?: number;
  base: number;
  amount: number;
}

/** Desglose de impuestos a partir del JSON `tax_breakdown` ({"21.00": {base, tax}}). */
/** Raw `tax_type` words the rule may carry as `label`: they are keys, not something to print. */
const RAW_TAX_TYPES = new Set(['vat', 'surcharge', 'sales_tax', 'withholding', 'excise', 'import_duty']);

/** sales#54 — the label of one breakdown entry. `kind` marks the equivalence surcharge (`surcharge`)
 *  so the paper stops calling it «IVA 5%»; a `label` set by the owner on the rule (`component_label`)
 *  wins verbatim; a raw `tax_type` word is not printable. Entries older than the marker → IVA. */
function taxLabel(rate: string, v: { kind?: string; label?: string } | undefined, t?: Translate): string {
  const r = Number(rate);
  const custom = v?.label && !RAW_TAX_TYPES.has(v.label) ? v.label : undefined;
  const name = custom ?? (v?.kind === 'surcharge' ? (t ? t('ui.taxSurcharge') : 'RE') : 'IVA');
  // 21 → «21%», 5.2 → «5.2%», 10.00 → «10%»: the exact rate, without trailing zeros.
  const pct = Number.isFinite(r) ? String(Number(r.toFixed(2))) : rate;
  return `${name} ${pct}%`;
}

function parseTaxes(tax_breakdown?: string, t?: Translate): TaxLine[] {
  if (!tax_breakdown) return [];
  let obj: Record<string, { base?: number; tax?: number; kind?: string; label?: string }>;
  try {
    obj = JSON.parse(tax_breakdown);
  } catch {
    return [];
  }
  return Object.entries(obj)
    .map(([rate, v]) => {
      const r = Number(rate);
      return {
        label: taxLabel(rate, v, t),
        rate: Number.isFinite(r) ? r : undefined,
        base: toEuros(v?.base),
        amount: toEuros(v?.tax),
      };
    })
    .filter((t) => t.amount || t.base);
}

/** Decide el formato del documento: el de la venta (Fase 3) o el de los ajustes, def. 'ticket'. */
export function resolveFormat(sale: SaleRow, settings: SaleSettings): 'ticket' | 'invoice' {
  const v = sale.document_type || settings.default_document_format || 'ticket';
  return v === 'invoice' ? 'invoice' : 'ticket';
}

/** Línea de `ReceiptData` con la unidad congelada que el PAPEL pinta (sales#28). `<ok-receipt>`
 *  (outfitkit) no conoce unidades: estos campos extra viajan con el objeto — la pantalla los
 *  ignora, `receiptToPrintableHtml` y el documento ESC/POS los componen en la línea impresa. */
export interface PaperReceiptLine extends ReceiptLine {
  /** pm#93 / sales#148 — los suplementos de la línea, EN EL ORDEN en que se eligieron. `ReceiptLine`
   *  (outfitkit) no los conoce: viajan como campo extra y los leen los papeles. */
  modifiers?: PrintedModifier[];
  unit_code?: string;
  unit_name?: string;
  /** Unidad en la que está expresado el `unit_price` (KPEIN): «12,00 € / kg». */
  pricing_unit_code?: string;
}

/** `ReceiptData` con líneas que llevan su unidad — lo que devuelven los mappers de tiquet. */
export type PaperReceiptData = ReceiptData & { lines: PaperReceiptLine[] };

/** El contexto de unidades de la línea, en la forma del papel: sin unidad → sin campos (una
 *  línea antigua no fabrica unidades que nadie congeló). */
function paperUnit(l: { unit_code?: string; unit_name?: string; pricing_unit_code?: string }): Partial<PaperReceiptLine> {
  if (!l.unit_code) return {};
  return {
    unit_code: l.unit_code,
    ...(l.unit_name ? { unit_name: l.unit_name } : {}),
    ...(l.pricing_unit_code ? { pricing_unit_code: l.pricing_unit_code } : {}),
  };
}

/** Los suplementos en la forma del papel: sin ninguno, SIN campo — una línea que nunca tuvo
 *  suplementos no fabrica una lista vacía, y el tique de siempre sale byte a byte igual. */
function paperModifiers(mods: PrintedModifier[] | undefined): Partial<PaperReceiptLine> {
  return mods?.length ? { modifiers: mods } : {};
}

/** Sale → 80mm thermal ticket (`<ok-receipt>`). Header: explicit `receipt_header` wins
 *  (deliberate branding); empty → the fiscal issuer name (business profile, #32); last resort
 *  → the translated default passed by the UI. */
export function saleToReceipt(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
  locale = 'es',
  fallbackName = DEFAULT_BUSINESS_NAME,
  t?: Translate,
): PaperReceiptData {
  const header = splitHeader(settings.receipt_header);
  return {
    business: { name: header.name || fiscal.issuer_name || fallbackName, address: header.address, tax_id: fiscal.issuer_nif || undefined },
    number: fiscal.number || sale.sale_number,
    datetime: formatDateTime(sale.created_at, locale),
    customer: fiscal.customer_name || sale.customer_name || undefined,
    lines: lines.map((l): PaperReceiptLine => ({
      name: lineLabel(l),
      qty: fromMicro(Number(l.quantity)), // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
      unit_price: toEuros(l.unit_price),
      total: toEuros(l.line_total),
      ...paperModifiers(parseModifierSnapshot(l.modifiers)), // sales#148: lo que se cobró, impreso
      ...paperUnit(l), // sales#28: la unidad congelada, para el papel
    })),
    subtotal: sale.subtotal != null ? toEuros(sale.subtotal) : undefined,
    taxes: parseTaxes(sale.tax_breakdown, t).map((x) => ({ label: x.label, base: x.base, amount: x.amount })),
    total: toEuros(sale.total),
    payment: sale.payment_method_name
      ? { method: payLabel(sale.payment_method_name, t)!, paid: sale.amount_tendered != null ? toEuros(sale.amount_tendered) : undefined, change: sale.change_due != null ? toEuros(sale.change_due) : undefined }
      : undefined,
    currency: settings.currency || '€',
    footer: settings.receipt_footer || undefined,
    qr: fiscal.qr || undefined,
    qr_note: fiscal.qr_note || undefined,
    // QR promocional (solo tiquet; la factura A4 es formal). Sin URL no hay rastro.
    promo_qr: settings.receipt_marketing_url || undefined,
    promo_note: settings.receipt_marketing_url ? (settings.receipt_marketing_text || undefined) : undefined,
  };
}

/** Sale → A4 invoice (`<ok-invoice>`). Formal fiscal document: the issuer is the legal name
 *  snapshotted on the invoice (#32); `receipt_header` only fills the gaps (name fallback +
 *  address, the invoice row carries no issuer address). */
export function saleToInvoice(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
  locale = 'es',
  fallbackName = DEFAULT_BUSINESS_NAME,
  t?: Translate,
): InvoiceData {
  const header = splitHeader(settings.receipt_header);
  const invLines: InvoiceLine[] = lines.map((l) => ({
    // sales#28: `InvoiceLine` (outfitkit) no tiene campo de unidad, y la factura A4 debe decir
    // igualmente en qué va la línea — el hueco honesto es la descripción, como «Vino (botella)»:
    // «Tomate rosa (kg)». Sin unidad o con la suelta, la descripción queda como estaba.
    description: unitTag(l.unit_code) ? `${lineLabel(l)} (${unitTag(l.unit_code)})` : lineLabel(l),
    qty: fromMicro(Number(l.quantity)), // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
    unit_price: toEuros(l.unit_price),
    discount_percent: l.discount_percent ? Number(l.discount_percent) : undefined,
    tax_rate: l.tax_rate != null ? Number(l.tax_rate) : undefined,
    total: toEuros(l.line_total),
  }));
  const taxes = parseTaxes(sale.tax_breakdown, t);
  return {
    issuer: { name: fiscal.issuer_name || header.name || fallbackName, address: header.address, tax_id: fiscal.issuer_nif || undefined },
    customer: { name: fiscal.customer_name || sale.customer_name || 'Cliente', tax_id: fiscal.customer_tax_id || undefined },
    number: fiscal.number || sale.sale_number,
    issue_date: formatDateTime(sale.created_at, locale) || '',
    lines: invLines,
    subtotal: toEuros(sale.subtotal),
    discount_total: sale.discount_amount ? toEuros(sale.discount_amount) : undefined,
    taxes: taxes.map((t) => ({ label: t.label, rate: t.rate, base: t.base, amount: t.amount })),
    tax_total: toEuros(sale.tax_amount),
    total: toEuros(sale.total),
    currency: settings.currency || '€',
    payment_method: payLabel(sale.payment_method_name, t),
    footer: settings.receipt_footer || undefined,
    qr: fiscal.qr || undefined,
    qr_note: fiscal.qr_note || undefined,
  };
}

// ── Cuenta previa (pre-bill) — ADR-0141 ──────────────────────────────────────────────────────

/** Un suplemento **tal como lo lee quien paga** (pm#93 / ADR-0376; sales#148).
 *
 * Deliberadamente NO es la fila del catálogo ni la elección del carrito: es lo mínimo que el papel
 * necesita — cómo se llama y cuánto suma. El `option_id` viaja solo para dar IDENTIDAD (huella del
 * `jobId`, orden de elección), nunca para imprimirse cuando hay nombre.
 *
 * El nombre lo pone SIEMPRE el catálogo, nunca el navegador: en el tique sale del snapshot que
 * congeló el servidor al cobrar (`sales_sale_item.modifiers`), y en la cuenta previa de la lectura
 * viva de `modifiers.options.all`. El importe del suplemento YA está dentro del `unit_price` de la
 * línea (lo suma `authoritative_modifiers` al cobrar), así que aquí es **desglose, no dinero que
 * volver a sumar**: imprimirlo y volver a acumularlo cobraría el queso dos veces. */
export interface PrintedModifier {
  /** Id del catálogo. Identidad, no texto: solo se imprime cuando NO se pudo resolver el nombre. */
  option_id?: string;
  /** Lo que lee el cliente. Vacío = el catálogo no estaba y solo queda el id. */
  name?: string;
  /** Céntimos que suma este suplemento. Ausente o 0 = elección gratuita («sin cebolla»). */
  price_delta?: number;
}

/** La huella de identidad de un suplemento: el id si lo hay (estable aunque renombren la opción),
 *  el nombre si no. Con su importe, porque un mismo suplemento a otro precio es otra cuenta. */
export function modifierIdentity(m: PrintedModifier): string {
  return `${m.option_id || m.name || ''}:${m.price_delta ?? 0}`;
}

/** Línea de la comanda en curso (forma mínima de `CartLine`, sin acoplar los módulos). */
export interface PrebillLine {
  name: string;
  price: number; // céntimos
  qty: number;
  is_gift?: boolean;
  /** pm#93 — los suplementos elegidos, **en el orden en que se eligieron** (sales#148). Ese orden
   *  es contenido, no presentación: el cliente los lee como los pidió, y dos líneas con las mismas
   *  opciones en distinto orden no son la misma cuenta. */
  modifiers?: PrintedModifier[];
  /** Unidad congelada de la línea (ADR-0147 §2.4; sales#28): la cuenta que se lleva a la mesa
   *  pinta la cantidad con su unidad, como el tiquet. */
  unit_code?: string;
  unit_name?: string;
}

/**
 * Comanda ABIERTA → **cuenta** para llevar a la mesa antes de cobrar.
 *
 * **No es un documento fiscal** y por eso se construye aparte de `saleToReceipt`:
 * - **sin número de serie fiscal** (la numeración se consume al COBRAR, no antes),
 * - **sin QR VeriFactu** (no hay registro de facturación todavía),
 * - **sin datos de pago** (aún no se ha cobrado),
 * - con un **aviso impreso** de que no es una factura.
 *
 * Emitir un papel que parezca factura sin serlo es un problema legal, no estético: la factura
 * (simplificada o completa) nace en `complete_sale` y la sella el módulo fiscal (ADR-0140).
 */
export function orderToPrebill(
  lines: PrebillLine[],
  settings: SaleSettings = {},
  opts: { tableLabel?: string; datetime?: string; locale?: string; title?: string; notice?: string; fallbackName?: string } = {},
): PaperReceiptData {
  const header = splitHeader(settings.receipt_header);
  const cents = (l: PrebillLine) => (l.is_gift ? 0 : Math.round(l.price * l.qty));
  const total = lines.reduce((s, l) => s + cents(l), 0);
  return {
    // Same job as the hardcoded «CUENTA» of the ESC/POS renderer: the first line tells this paper
    // from a fiscal ticket at a glance. The UI passes the translation; the fallback is canonical
    // English (ADR-0055).
    title: opts.title ?? 'Bill',
    business: {
      name: header.name || opts.fallbackName || DEFAULT_BUSINESS_NAME,
      address: header.address,
    },
    // number/qr/payment AUSENTES a propósito: esto no es una factura (ver doc de la función).
    datetime: formatDateTime(opts.datetime ?? new Date().toISOString(), opts.locale ?? 'es'),
    customer: opts.tableLabel || undefined,
    lines: lines.map((l): PaperReceiptLine => ({
      name: l.is_gift ? `${l.name} (invitación)` : l.name,
      qty: l.qty,
      unit_price: toEuros(l.price),
      total: toEuros(cents(l)),
      // sales#148: ya resueltos contra el catálogo VIVO por quien pide la cuenta (la fila del
      // pedido guarda solo los `option_id`; el nombre y el importe no son del navegador).
      ...paperModifiers(l.modifiers),
      ...paperUnit(l), // sales#28: la unidad congelada, para el papel
    })),
    total: toEuros(total),
    taxes: [],
    currency: settings.currency || '€',
    // Inglés canónico (ADR-0055): la UI pasa el texto ya traducido en `opts.notice`; esto es solo
    // el respaldo para llamadas sin i18n (tests, integraciones).
    footer: opts.notice ?? 'Bill — this is not an invoice. The fiscal receipt is issued on payment.',
  };
}
