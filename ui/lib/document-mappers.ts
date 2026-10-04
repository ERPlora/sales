// Pure mappers: sale (`sales.get`) + lines (`sales.lines`) + settings (`sales.pos_settings.get`)
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
// sales#148 — los suplementos del papel viven en UN sitio (`paper-modifiers.ts`) para que la
// pantalla, el HTML, el térmico y la huella del jobId no puedan discrepar. Se re-exporta el tipo
// porque quien consume estos mappers ya importa de aquí.
import { modifierLabel, modifierNote, type PrintedModifier } from './paper-modifiers.js';
// sales#154 — the menu on the paper lives in ONE place too (`paper-combos.ts`), for the same reason.
import { comboNote, componentLabel, groupComboLines, type PrintedCombo } from './paper-combos.js';
import { hubDecimals } from './hub-currency.js';
import { documentLocale, formatMinor, formatPercent } from '@erplora/outfitkit/ok-money';
// sales#180 — the bill's PROVISIONAL tax breakdown comes through the same door as the cart's tax
// preview, not through a second arithmetic that would end up disagreeing with it.
import { previewTaxBreakdown, type TaxBreakdownEntry } from './pos-tax.js';

export { modifierIdentity, modifierLabel, modifierNote, type PrintedModifier } from './paper-modifiers.js';
export { comboIdentity, comboNote, componentLabel, parseComboSnapshot, type PrintedCombo, type PrintedComboComponent } from './paper-combos.js';
import type {
  ReceiptData,
  ReceiptLine,
  InvoiceData,
  InvoiceLine,
  OkReceiptLabels,
  OkInvoiceLabels,
} from '@erplora/outfitkit';

/** Money: the sale stores MINOR UNITS (INTEGER, ADR-0007/0123) and so does the document.
 *  `<ok-receipt>`/`<ok-invoice>` (outfitkit ≥ 0.1.48, ADR-0400) take integers plus `decimals` and
 *  paint a float as «—» — so nothing is divided here any more (sales#188). The only conversion
 *  left is the thermal renderer's, by name, in `print-document.ts`. `Number()` only normalises a
 *  string column; it never rounds — a float reaching here is an upstream bug the screen exposes. */
function minor(cents: number | string | undefined): number {
  return Number(cents ?? 0);
}

// The hub currency's scale (ADR-0123 §7), read at mapping time. Lives in `hub-currency.ts` so the
// paper composers can read it too; re-exported here for the callers that already import it.
export { hubDecimals };

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
export function receiptLabels(t: Translate, doc?: { customer_is_table?: boolean }): OkReceiptLabels {
  return {
    empty: t('ui.docEmpty'),
    phone: t('ui.docPhone'),
    receipt: t('ui.docReceipt'),
    servedBy: t('ui.docServedBy'),
    customer: doc?.customer_is_table ? t('ui.docTable') : t('ui.docCustomer'),
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
  /** `sales_sale_item.id`. Es lo que apunta el `parent_line_ref` de una hija (sales#147). */
  id?: string;
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
  /** sales#162 / ADR-0386 — la línea la pagó un TENDER EXTERNO por línea (un bono cubre líneas
   *  enteras, no importes). Vale 0 en el documento y el papel lo dice: un «0,00» a secas se lee
   *  como un error de precio, o como que el negocio regaló el servicio, y no es ni una cosa ni la
   *  otra — el dinero entró al VENDER el bono. La marca es OPACA: `sales` no nombra la familia. */
  is_covered?: number;
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
  /** sales#156 — the free-text NOTE the checkout froze on the line ("medium rare", "no ice"). The
   *  column has been there since the 001 and nobody ever wrote it, so a REPRINT could not say what
   *  the kitchen had been told. */
  notes?: string;
  /** sales#154 / ADR-0381 — what makes this row a SIBLING of a menu (`NULL` on every row that is
   *  not one). The rows of one menu share the ref; the paper groups them into one header line. */
  combo_group_ref?: string | null;
  /** The menu snapshot the server froze on EVERY sibling at checkout (`expand_combo`): name,
   *  closed price, and the chosen components in order. TEXT, because that is the column; the
   *  paper unpacks it with `parseComboSnapshot`. `'{}'` on a row that is not a menu. */
  combo?: string;
  /** sales#147 / la enmienda de ADR-0376 — el `id` de la fila de la que ESTA cuelga: la línea hija
   *  de un suplemento que tributa a un IVA distinto del de su línea, y que por eso NO se pliega en
   *  su precio. `null` en toda fila que no cuelgue de ninguna, que es la verdad de todas las ventas
   *  escritas hasta esta issue. Es OTRA relación que `combo_group_ref` (que hermana filas SIN
   *  padre) y COMPONEN: una hermana de menú puede traer su propia hija. */
  parent_line_ref?: string | null;
}

/** Las líneas con cada HIJA justo detrás de SU padre (sales#147).
 *
 * El papel no puede ordenar por `created_at`: todas las líneas de una venta comparten el mismo
 * instante, así que ordenar por él es un empate y Postgres devuelve el orden que quiera. La
 * jerarquía la dice la fila (`parent_line_ref`), y aquí se convierte en la única cosa que el papel
 * entiende: la posición.
 *
 * Una hija HUÉRFANA —su padre no está en esta lista, que es lo que ve media cuenta ya dividida— se
 * queda donde estaba en vez de desaparecer: perder una línea de un documento fiscal es peor que
 * pintarla suelta. Y una venta sin ninguna hija devuelve la MISMA lista, así que el tique de
 * siempre sale byte a byte igual. */
export function orderChildLines<T extends { id?: string; parent_line_ref?: string | null }>(
  lines: T[],
): T[] {
  const ref = (l: T) => (l.parent_line_ref || '').trim();
  const byParent = new Map<string, T[]>();
  for (const l of lines) {
    const r = ref(l);
    if (!r) continue;
    byParent.set(r, [...(byParent.get(r) ?? []), l]);
  }
  if (!byParent.size) return lines;
  const present = new Set(lines.map((l) => l.id).filter(Boolean) as string[]);
  const out: T[] = [];
  for (const l of lines) {
    // Una hija cuyo padre SÍ está aquí se emite detrás de él, no en su sitio original.
    if (ref(l) && present.has(ref(l))) continue;
    out.push(l);
    for (const child of byParent.get(l.id ?? '') ?? []) out.push(child);
  }
  return out;
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

/** Etiqueta de línea para el documento: marca la invitación (comp) y la línea que pagó un tender
 *  externo (sales#162). Sin `t` —llamadas legadas— se imprime la fuente canónica en inglés
 *  (ADR-0055), nunca la clave: el papel sale de la impresora igual y tiene que ser legible. */
function lineLabel(l: SaleLineRow, t?: Translate): string {
  // sales#147 — una hija se lee como lo que es: el suplemento de la línea de encima. El «+» es el
  // vocabulario que el papel YA usa para un suplemento («+ queso», y el `+3,00` de un componente de
  // menú), es ASCII —así imprime en cualquier página de códigos del térmico, que es donde una
  // flecha o una sangría se pierden— y en 32 columnas cuesta dos caracteres. La sangría por
  // espacios no vale: el HTML los colapsa y `<ok-receipt>` pinta el nombre tal cual.
  if (ref(l)) return `+ ${lineName(l, t)}`;
  return lineName(l, t);
}

/** El nombre de la línea sin la marca de jerarquía: la invitación (comp) y la línea que pagó un
 *  tender externo (sales#162). */
function lineName(l: SaleLineRow, t?: Translate): string {
  if (Number(l.is_gift)) return `${l.product_name} (Invitación)`;
  if (Number(l.is_covered)) {
    const label = t?.('ui.linePaidElsewhere');
    return `${l.product_name} (${label && label !== 'ui.linePaidElsewhere' ? label : 'Prepaid'})`;
  }
  return l.product_name;
}

/** `true` cuando la fila cuelga de otra (sales#147). */
function ref(l: SaleLineRow): boolean {
  return !!(l.parent_line_ref || '').trim();
}

/** Subconjunto de `sales.pos_settings.get` que afecta al documento (sales#203: la lectura del
 *  mostrador, no la del admin — quien imprime el tique es el cajero). */
export interface SaleSettings {
  receipt_header?: string;
  receipt_footer?: string;
  receipt_footer_image?: string;
  /** QR promocional del tiquet (reseñas Google, redes…): URL + leyenda configurables. */
  receipt_marketing_url?: string;
  receipt_marketing_text?: string;
  default_document_format?: string; // 'ticket' | 'invoice'
  currency?: string;
  /** sales#180 — the business's LEGAL name (`hub_settings.business_legal_name`, single source
   *  ADR-0061), read live through `sales.business.get`. It is the same datum the ticket gets
   *  already frozen on its invoice (`FiscalData.issuer_name`); a bill has no invoice yet. */
  issuer_name?: string;
  /** sales#274 — the business's TAX ID (`hub_settings.business_tax_id`, same single source
   *  ADR-0061, same live read `sales.business.get`). The ticket gets it frozen on its invoice as
   *  `FiscalData.issuer_nif`; until that invoice exists there is no other place to read it from,
   *  and a ticket headed by a shop with no NIF is a ticket headed by nobody. */
  issuer_tax_id?: string;
  /** Do catalogue prices carry VAT inside? (`sales_settings.default_tax_included`, 1 by default.)
   *  It decides how the bill's PROVISIONAL breakdown is worked out. */
  default_tax_included?: number;
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
  /** sales#350 — the customer's address as the invoice row stores it: the A4 and the thermal full
   *  invoice identify the customer with it. Absent (no address, no invoice app) → not printed. */
  customer_address?: string;
  /** sales#103 (hub#963 / ADR-0363) — autoservicio «pide tu factura»: el localizador acuñado en
   *  el mostrador contra `POST /api/hub/public-claims`. Solo sobre F2: una F1 nació completa y
   *  una F3 ya ES el canje. Ausente (sin módulo invoice, sin permiso, fallo) → el papel sale como
   *  siempre: sin claim y sin segundo QR. */
  claim_locator?: string;
  /** URL ABSOLUTA del segundo QR (`https://<origen del hub>/p/<locator>`). Separada a propósito
   *  del `qr` fiscal: aquel apunta a la AEAT y NO vale como localizador (numserie correlativo y
   *  público) — son DOS códigos con destinos distintos. */
  claim_qr?: string;
  /** sales#274 — the fiscal chain is still resolving: the app that numbers this sale IS installed
   *  and its invoice has not been written yet (the Outbox runs a few ms behind the charge). It is
   *  NOT the same as "there is no invoicing app" (ADR-0127), and the difference is what the
   *  customer reads: with an invoice coming, the sale's own internal number is not this document's
   *  number and must not be shown as if it were. Only the SCREEN honours it — see `saleToReceipt`. */
  pending?: boolean;
}

/** sales#327 — the legal legend beside the fiscal QR (RD 1619/2012 art. 6.5.b; 7.5 for the
 *  simplified invoice a ticket is). ERPlora remits every record to the AEAT — there is no
 *  NO-VERI*FACTU mode, a record that cannot leave now leaves later — so it goes with EVERY fiscal
 *  QR. It is the short form the law admits and is the same in every language: not a catalog key. */
export const VERIFACTU_LEGEND = 'VERI*FACTU';

/** sales#339 — the text that must precede the fiscal QR, above it (AEAT «Detalle de las
 *  especificaciones técnicas del código QR de la factura» v0.5.0 §3, under Orden HAC/1177/2024
 *  art. 21.1). A fixed legal text like the legend: the same in every language, not a catalog key
 *  (the SaaS invoice PDF prints it literally too, saas#2184). The renderers paint it above the QR
 *  and put the QR at the top of the document. */
export const QR_TRIBUTARIO_HEADING = 'QR tributario:';

/** Heading and legend travel with the fiscal QR and only with it: no QR (a bill, a sale whose
 *  record is not written yet) → neither. Never folded into `qr_note`, which changes when the CSV
 *  lands. */
function qrLegalTexts(fiscal: FiscalData): { qr_heading?: string; qr_legend?: string } {
  return fiscal.qr ? { qr_heading: QR_TRIBUTARIO_HEADING, qr_legend: VERIFACTU_LEGEND } : {};
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
 *  wins verbatim; a raw `tax_type` word is not printable. Entries older than the marker → VAT.
 *  sales#483 — both names are catalog words in the paper's language (`ui.taxVat`: «VAT» / «IVA»). */
function taxLabel(
  rate: string,
  v: { kind?: string; label?: string } | undefined,
  locale: string,
  t?: Translate,
): string {
  const r = Number(rate);
  const custom = v?.label && !RAW_TAX_TYPES.has(v.label) ? v.label : undefined;
  const name = custom ?? (v?.kind === 'surcharge' ? (t ? t('ui.taxSurcharge') : 'RE') : t ? t('ui.taxVat') : 'IVA');
  // sales#477 — the exact rate as the paper's language writes a percentage, with the helper that
  // writes the rate of each line: «21 %», «5,2 %» in es; «21%», «5.2%» in en. A key that is not a
  // number is printed as it came.
  return `${name} ${Number.isFinite(r) ? formatPercent(r, locale) : `${rate}%`}`;
}

function parseTaxes(tax_breakdown: string | undefined, locale: string, t?: Translate): TaxLine[] {
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
        label: taxLabel(rate, v, locale, t),
        rate: Number.isFinite(r) ? r : undefined,
        base: minor(v?.base),
        amount: minor(v?.tax),
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
  /** pm#93 / sales#148 — the line's supplements as OBJECTS, in the order they were chosen, for the
   *  two papers (HTML, ESC/POS). Under its own key since sales#183: `modifiers` is now the LABEL list
   *  `<ok-receipt>` paints (ADR-0396), and the same object feeds the screen and the papers. */
  printed_modifiers?: PrintedModifier[];
  /** sales#154 / ADR-0381 — this line IS a menu: its components print indented under it, without
   *  an amount (only their supplement). `<ok-receipt>` does not know menus: it reads the same text
   *  through `note`; the two papers read the list. Absent on a plain line. */
  combo?: PrintedCombo;
  unit_code?: string;
  unit_name?: string;
  /** Unidad en la que está expresado el `unit_price` (KPEIN): «12,00 € / kg». */
  pricing_unit_code?: string;
  /** sales#156 — the line's free-text note, RAW. `note` (above) is the already-composed text the
   *  screen paints; this is the loose piece, so the HTML paper can paint it on a sub-line of its
   *  own and the thermal one recomposes it through the same door (`paperNote`). Absent with no
   *  note. */
  line_note?: string;
}

/** `ReceiptData` con líneas que llevan su unidad — lo que devuelven los mappers de tiquet. */
export type PaperReceiptData = ReceiptData & {
  lines: PaperReceiptLine[];
  /** sales#180 — what sits in the `customer` slot is the TABLE. `<ok-receipt>` labels that slot
   *  with `labels.customer`, so whoever paints it has to ask for the right label
   *  (`receiptLabels(t, doc)`); the HTML paper does the same through `customer_label`. */
  customer_is_table?: boolean;
  /** sales#327 — «VERI*FACTU» under the fiscal QR (`<ok-receipt>` `qr_legend`, outfitkit ≥ the
   *  release that adds it; an older one simply does not paint it). */
  qr_legend?: string;
  /** sales#339 — «QR tributario:» above the fiscal QR (`<ok-receipt>` `qr_heading`; an outfitkit
   *  without it simply does not paint it). */
  qr_heading?: string;
};

/** `InvoiceData` plus the legal texts of its QR (sales#327, sales#339), same contract as the
 *  ticket. */
export type PaperInvoiceData = InvoiceData & { qr_legend?: string; qr_heading?: string };

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
function paperModifiers(
  mods: PrintedModifier[] | undefined,
  combo?: PrintedCombo,
  lineNote?: string,
): Partial<PaperReceiptLine> {
  const note_raw = (lineNote ?? '').trim();
  if (!mods?.length && !combo && !note_raw) return {};
  // `note` es la puerta que `<ok-receipt>` YA pinta bajo la línea: por ahí los ve la PANTALLA, con
  // el mismo texto que los dos papeles. Sin esto el camarero leería en pantalla algo distinto de lo
  // que el cliente lleva en la mano — y una de las dos personas estaría siendo engañada.
  // sales#154: the menu's components go FIRST (they are the line), the supplements after.
  const note = paperNote(combo, mods, note_raw);
  // sales#183 / ADR-0396: the SCREEN gets the same texts as LISTS — one indented sub-line per
  // component and per supplement, painted by `<ok-receipt>` — while the papers keep the objects.
  const components = (combo?.components ?? []).map(componentLabel).filter(Boolean);
  const modifiers = (mods ?? []).map(modifierLabel).filter(Boolean);
  return {
    ...(mods?.length ? { printed_modifiers: mods } : {}),
    ...(combo ? { combo } : {}),
    ...(note ? { note } : {}),
    // sales#156: and the RAW note, for the HTML paper — which paints it on a sub-line of its own
    // rather than chained — and for the bill's `jobId` fingerprint.
    ...(note_raw ? { line_note: note_raw } : {}),
    ...(components.length ? { components } : {}),
    ...(modifiers.length ? { modifiers } : {}),
  };
}

/** The ONE sub-line text every surface that prints a single sub-line uses (`<ok-receipt>`'s `note`,
 *  the ESC/POS `notes`): the menu's components, then the line's supplements. `undefined` when there
 *  is nothing to say — a plain line never grows the field. */
export function paperNote(
  combo: PrintedCombo | undefined,
  mods: PrintedModifier[] | undefined,
  lineNote?: string,
): string | undefined {
  // sales#156: the waiter's free note goes LAST. The menu's components and the supplements
  // DESCRIBE the item — they are the line — while the note is an instruction about it, and that is
  // the order it is read in. Putting it last also leaves the paper of a line without a note byte
  // for byte as it was.
  const parts = [comboNote(combo), modifierNote(mods), (lineNote ?? '').trim() || undefined]
    .filter((s): s is string => !!s);
  return parts.length ? parts.join(' · ') : undefined;
}

/** The sibling rows of a menu → the ONE line the customer reads (sales#154 / ADR-0381).
 *
 * There is no parent row with money, by design: the header takes its name from the snapshot, its
 * quantity from the siblings (they inherit the same one), and its amount as the SUM of theirs — so
 * the paper says «Menú del día 13,50» while the sale keeps «8,10 at 10 % + 5,40 at 21 %» for the
 * tax footer and for VeriFactu. The supplements of every sibling hang under the menu line, in row
 * order, because the customer sees one line and that is where its changes belong. */
function menuLine(siblings: SaleLineRow[], combo: PrintedCombo, t?: Translate): PaperReceiptLine {
  const head = siblings[0];
  const sum = (pick: (l: SaleLineRow) => number | undefined) => siblings.reduce((s, l) => s + Number(pick(l) ?? 0), 0);
  const mods = siblings.flatMap((l) => parseModifierSnapshot(l.modifiers) ?? []);
  return {
    name: lineLabel({ ...head, product_name: combo.name }, t),
    qty: fromMicro(Number(head.quantity)),
    unit_price: minor(sum((l) => l.unit_price)),
    total: minor(sum((l) => l.line_total)),
    ...paperModifiers(mods.length ? mods : undefined, combo, head.notes),
    ...paperUnit(head),
  };
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
    // sales#180 — the same priority as the bill: deliberate branding, then the legal name (the one
    // frozen on the invoice, else the one the hub holds today), then the translated fallback.
    business: { name: header.name || fiscal.issuer_name || settings.issuer_name || fallbackName, address: header.address, tax_id: fiscal.issuer_nif || settings.issuer_tax_id || undefined },
    // sales#274 — the number, and ONLY the one this document really carries. While the invoice is
    // still being written (`pending`), the sale's internal number is not it: showing it painted a
    // number over the counter that the ticket replaced seconds later. Blank now, real in a moment.
    // The PAPER never gets `pending` (see `fiscalForPaper`): a printed copy is not going to update
    // itself, so it takes the best identifier it has.
    number: fiscal.number || (fiscal.pending ? undefined : sale.sale_number),
    datetime: formatDateTime(sale.created_at, locale),
    customer: fiscal.customer_name || sale.customer_name || undefined,
    // sales#154: the sibling rows of a menu collapse into ONE header line; a plain row is itself.
    // sales#147: cada hija va justo detrás de SU padre ANTES de agrupar los menús, para que el
    // orden del papel sea el de la jerarquía y no el que devuelva la base de datos.
    lines: groupComboLines(orderChildLines(lines)).map((g): PaperReceiptLine => g.combo ? menuLine(g.siblings, g.combo, t) : {
      name: lineLabel(g.head, t),
      qty: fromMicro(Number(g.head.quantity)), // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
      unit_price: minor(g.head.unit_price),
      total: minor(g.head.line_total),
      // sales#148: what was charged, printed. sales#156: and the note the kitchen was given.
      // sales#147: a CHILD paints no supplement sub-line — it IS the supplement, and its row keeps
      // the snapshot only to be self-describing; repeating it underneath would read
      // «+ Refresco / · Refresco».
      ...(ref(g.head) ? {} : paperModifiers(parseModifierSnapshot(g.head.modifiers), undefined, g.head.notes)),
      ...paperUnit(g.head), // sales#28: la unidad congelada, para el papel
    }),
    subtotal: sale.subtotal != null ? minor(sale.subtotal) : undefined,
    taxes: parseTaxes(sale.tax_breakdown, locale, t).map((x) => ({ label: x.label, base: x.base, amount: x.amount })),
    total: minor(sale.total),
    payment: sale.payment_method_name
      ? { method: payLabel(sale.payment_method_name, t)!, paid: sale.amount_tendered != null ? minor(sale.amount_tendered) : undefined, change: sale.change_due != null ? minor(sale.change_due) : undefined }
      : undefined,
    currency: settings.currency || '€',
    decimals: hubDecimals(),
    // sales#489 — the ticket discount is already inside the lines, the subtotal and the tax, so it
    // is not a row of the sum: the ticket says it as the invoice's note, above the business footer.
    // Screen, browser paper and the thermal roll (`saleToPrintDocument`) all read it from here.
    footer: [discountNote(sale.discount_amount, settings.currency || '€', t), settings.receipt_footer]
      .filter(Boolean).join('\n') || undefined,
    qr: fiscal.qr || undefined,
    ...qrLegalTexts(fiscal),
    qr_note: fiscal.qr_note || undefined,
    // QR promocional (solo tiquet; la factura A4 es formal). Sin URL no hay rastro.
    promo_qr: settings.receipt_marketing_url || undefined,
    promo_note: settings.receipt_marketing_url ? (settings.receipt_marketing_text || undefined) : undefined,
  };
}

/** sales#486 — «Ticket discount of 2,00 € already applied…»: the discount the cashier gave, as it
 *  was asked for (sales#295), outside the column that adds up. Nothing without a discount. */
function discountNote(amount: number | undefined, currency: string, t?: Translate): string | undefined {
  if (!amount) return undefined;
  const text = formatMinor(minor(amount), { decimals: hubDecimals(), locale: documentLocale(), currency });
  return (t ? t('ui.docDiscountApplied') : DISCOUNT_APPLIED_EN).replace('{amount}', text);
}

/** sales#491 — an invoice line's unit price WITHOUT tax (RD 1619/2012 art. 6.1.f), so that
 *  «quantity × price − its discount» reads as the line's amount, which is its base (sales#485).
 *  The row's `unit_price` is the price as charged — with the VAT inside when the business sells
 *  tax-included — and the sale does not freeze which it was, so the price comes from the base:
 *  per unit, before the line's own discount (printed beside it) and after the ticket's prorated
 *  one (which the invoice's note says is already applied, sales#486). */
function netUnitPrice(l: SaleLineRow): number {
  // A row without a base is a hand-built caller (the column is NOT NULL): its amount falls back to
  // `line_total` below, and its price stays the one it brought, so the pair keeps one convention.
  if (l.net_amount == null) return minor(l.unit_price);
  const units = fromMicro(Number(l.quantity)) * (1 - Number(l.discount_percent ?? 0) / 100);
  return units > 0 ? Math.round(minor(l.net_amount) / units) : 0;
}

/** English source of `ui.docDiscountApplied`, for the legacy callers that pass no translator. */
const DISCOUNT_APPLIED_EN = 'Ticket discount of {amount}, already applied to the amounts above.';

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
): PaperInvoiceData {
  const header = splitHeader(settings.receipt_header);
  const invLines: InvoiceLine[] = orderChildLines(lines).map((l) => ({
    // sales#28: `InvoiceLine` (outfitkit) no tiene campo de unidad, y la factura A4 debe decir
    // igualmente en qué va la línea — el hueco honesto es la descripción, como «Vino (botella)»:
    // «Tomate rosa (kg)». Sin unidad o con la suelta, la descripción queda como estaba.
    description: unitTag(l.unit_code) ? `${lineLabel(l, t)} (${unitTag(l.unit_code)})` : lineLabel(l, t),
    qty: fromMicro(Number(l.quantity)), // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
    unit_price: netUnitPrice(l),
    discount_percent: l.discount_percent ? Number(l.discount_percent) : undefined,
    tax_rate: l.tax_rate != null ? Number(l.tax_rate) : undefined,
    // sales#485 — an invoice line's amount is its BASE (net after discount, without tax): that is
    // `InvoiceLine.total` in `<ok-invoice>`, and the lines then add up to the «Base imponible»
    // under them. `net_amount` is the handler's share of the declared base, never recomputed here.
    // (A row without it can only be a hand-built caller: the column is NOT NULL.)
    total: minor(l.net_amount ?? l.line_total),
  }));
  const taxes = parseTaxes(sale.tax_breakdown, locale, t);
  return {
    issuer: { name: fiscal.issuer_name || header.name || settings.issuer_name || fallbackName, address: header.address, tax_id: fiscal.issuer_nif || settings.issuer_tax_id || undefined },
    customer: {
      name: fiscal.customer_name || sale.customer_name || 'Cliente',
      tax_id: fiscal.customer_tax_id || undefined,
      ...(fiscal.customer_address ? { address: fiscal.customer_address } : {}),
    },
    // sales#274 — igual que el tiquet, y aquí pesa más: en un documento titulado «Factura» el
    // número ES el documento, así que enseñar el interno de la venta mientras el de verdad se
    // escribe es peor que dejarlo en blanco un instante. `<ok-invoice>` exige la clave (a
    // diferencia de `<ok-receipt>`, que se la salta), de ahí la cadena vacía en vez de `undefined`.
    number: fiscal.number || (fiscal.pending ? '' : sale.sale_number),
    issue_date: formatDateTime(sale.created_at, locale) || '',
    lines: invLines,
    subtotal: minor(sale.subtotal),
    // sales#486 — the ticket discount is ALREADY prorated into the lines and the base (sales#33):
    // as `discount_total`, `<ok-invoice>` and the A4 paint it «−2,00 €» under a base that already
    // lacks it, and the summary stops adding up. It travels as an informative note instead.
    notes: discountNote(sale.discount_amount, settings.currency || '€', t),
    taxes: taxes.map((t) => ({ label: t.label, rate: t.rate, base: t.base, amount: t.amount })),
    tax_total: minor(sale.tax_amount),
    total: minor(sale.total),
    currency: settings.currency || '€',
    decimals: hubDecimals(),
    payment_method: payLabel(sale.payment_method_name, t),
    footer: settings.receipt_footer || undefined,
    qr: fiscal.qr || undefined,
    ...qrLegalTexts(fiscal),
    qr_note: fiscal.qr_note || undefined,
  };
}

// ── Cuenta previa (pre-bill) — ADR-0141 ──────────────────────────────────────────────────────

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
  /** sales#154 — this cart line is a MENU: its name is the menu's, its `price` the closed price
   *  (preview, the server decides at checkout), and here go the chosen components, resolved by
   *  whoever asks for the bill. The bill prints it as the ticket will. */
  combo?: PrintedCombo;
  /** Unidad congelada de la línea (ADR-0147 §2.4; sales#28): la cuenta que se lleva a la mesa
   *  pinta la cantidad con su unidad, como el tiquet. */
  unit_code?: string;
  unit_name?: string;
  /** sales#156 — the line's free note, straight off the cart line. The bill the waiter carries to
   *  the table has to say what the kitchen was told, or the customer reads one thing and the pass
   *  cooked another. */
  note?: string;
  /** sales#180 — the line's VAT rate, the same preview the cart line already carries
   *  (`resolveLineTax`). It only feeds the bill's PROVISIONAL breakdown: the real rate is resolved
   *  by the server on checkout (ADR-0085). Without it, the line stays out of the breakdown. */
  tax_rate?: number;
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
/** The slice of `sales.checkout.preview` a bill needs. Cents everywhere (ADR-0007). */
export interface PrebillValuation {
  total: number;
  subtotal: number;
  tax_included: boolean;
  /** By rate key, exactly as the sale persists it: `{ "21.00": { base, tax } }`. */
  tax_breakdown: Record<string, { base: number; tax: number }>;
}

/** The hub's breakdown, in the shape the paper reads it — ascending rate, the way anyone reads it. */
function valuationBreakdown(v: PrebillValuation): TaxBreakdownEntry[] {
  return Object.entries(v.tax_breakdown ?? {})
    .map(([key, entry]) => ({ rate: Number(key) || 0, base: entry.base, amount: entry.tax }))
    .sort((a, b) => a.rate - b.rate);
}

export function orderToPrebill(
  lines: PrebillLine[],
  settings: SaleSettings = {},
  opts: {
    tableLabel?: string;
    customerName?: string;
    datetime?: string;
    locale?: string;
    title?: string;
    notice?: string;
    fallbackName?: string;
    /** sales#483 — the module catalog, so the breakdown names the tax in the bill's language. */
    t?: Translate;
  } = {},
  /** sales#164 — the hub's AUTHORITATIVE valuation of this same ticket, when it has answered. */
  valuation?: PrebillValuation,
): PaperReceiptData {
  const header = splitHeader(settings.receipt_header);
  // sales#208 — what the line is worth PER UNIT: the price plus what its supplements add. The
  // amount is the one the receipt will print (the checkout puts the delta into the line's unit
  // price), which is why no amount is printed beside each supplement (sales#148) — and why the
  // bill used to read 9,00 € for a burger the drawer charged 12,00 € for. A set menu is NOT
  // touched here: its `price` is already the closed one, substitutions included.
  const unitPrice = (l: PrebillLine) =>
    l.price + (l.modifiers ?? []).reduce((s, m) => s + (Number(m.price_delta) || 0), 0);
  // Provisional amount of the line, in minor units. A comped line is not charged.
  const lineAmount = (l: PrebillLine) => (l.is_gift ? 0 : Math.round(unitPrice(l) * l.qty));
  const taxIncluded = valuation?.tax_included ?? settings.default_tax_included !== 0;
  // sales#180 — the breakdown the customer reviews before paying. With VAT-inclusive prices the
  // lines ALREADY are the gross, so the total does not move; with VAT-exclusive ones the line is
  // COMPOSED of base + quota and the total is that sum, which is what the server will charge
  // (`calc_line_components`).
  //
  // 🔴 sales#164 — and when the hub has VALUED the ticket, that valuation wins over this one. What
  // is composed here is a SECOND fiscal arithmetic in the browser: it drifts from the charge with a
  // prorated fixed discount (ADR-0210), a quantity by weight (ADR-0147) or a goods combo split
  // across rates (art. 79.Dos LIVA). The paper the customer checks has to say what the drawer will
  // take, to the cent. Without a valuation nothing changes: the bill comes out as it did.
  const taxes = valuation
    ? valuationBreakdown(valuation)
    : previewTaxBreakdown(lines.map((l) => ({ amount: lineAmount(l), tax_rate: l.tax_rate })), taxIncluded);
  const gross = lines.reduce((s, l) => s + lineAmount(l), 0);
  const taxTotal = taxes.reduce((s, x) => s + x.amount, 0);
  const total = valuation ? valuation.total : (taxIncluded ? gross : gross + taxTotal);
  const base = valuation ? valuation.subtotal : taxes.reduce((s, x) => s + x.base, 0);
  // The table wins over the customer in the ONLY labelled meta slot `<ok-receipt>` has: it is what
  // tells this bill from the other five the waiter is carrying. Showing both at once needs a slot
  // of its own in the element (ERPlora/outfitkit#87).
  const table = opts.tableLabel || undefined;
  const customer = table || opts.customerName || undefined;
  return {
    // Same job as the hardcoded «CUENTA» of the ESC/POS renderer: the first line tells this paper
    // from a fiscal ticket at a glance. The UI passes the translation; the fallback is canonical
    // English (ADR-0055).
    title: opts.title ?? 'Bill',
    business: {
      // sales#180 — the SAME priority as the ticket: the deliberate ticket branding
      // (`receipt_header`), and failing that the business's LEGAL name (ADR-0061, which the ticket
      // reads already frozen on its invoice). The generic default is the LAST resort, not the
      // first: it was what the customer read on their bill while the ticket for the same sale
      // came out right.
      name: header.name || settings.issuer_name || opts.fallbackName || DEFAULT_BUSINESS_NAME,
      address: header.address,
    },
    // number/qr/payment AUSENTES a propósito: esto no es una factura (ver doc de la función).
    datetime: formatDateTime(opts.datetime ?? new Date().toISOString(), opts.locale ?? 'es'),
    customer,
    ...(table ? { customer_is_table: true as const } : {}),
    lines: lines.map((l): PaperReceiptLine => ({
      name: l.is_gift ? `${l.name} (invitación)` : l.name,
      qty: l.qty,
      unit_price: minor(unitPrice(l)),
      total: minor(lineAmount(l)),
      // sales#148: ya resueltos contra el catálogo VIVO por quien pide la cuenta (la fila del
      // pedido guarda solo los `option_id`; el nombre y el importe no son del navegador).
      // sales#154: and the menu's components, same door. sales#156: and the line's own note.
      ...paperModifiers(l.modifiers, l.combo, l.note),
      ...paperUnit(l), // sales#28: la unidad congelada, para el papel
    })),
    // The subtotal only exists when there is something to break down: with no tax catalogue the
    // bill comes out as it did, with its total and nothing else.
    ...(taxes.length ? { subtotal: base } : {}),
    taxes: taxes.map((x) => ({ label: taxLabel(String(x.rate), undefined, opts.locale ?? 'es', opts.t), base: x.base, amount: x.amount })),
    total: minor(total),
    currency: settings.currency || '€',
    decimals: hubDecimals(),
    // Inglés canónico (ADR-0055): la UI pasa el texto ya traducido en `opts.notice`; esto es solo
    // el respaldo para llamadas sin i18n (tests, integraciones).
    footer: opts.notice ?? 'Bill — this is not an invoice. The fiscal receipt is issued on payment.',
  };
}
