// Mappers puros: venta (`sales.get`) + líneas (`sales.lines`) + ajustes (`sales.settings.get`)
// → contrato de documento de OutfitKit (`ReceiptData` / `InvoiceData`). Sin efectos, testeable.
//
// La cabecera de negocio (nombre/NIF/dirección estructurados) y el QR de VeriFactu NO viven en
// el módulo sales; de momento usamos `receipt_header`/`receipt_footer` de los ajustes y dejamos
// NIF/dirección/QR vacíos (se rellenan cuando se cablee el perfil del negocio + verifactu).

import { fromMicro } from './quantity';
import type {
  ReceiptData,
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
function formatDateTime(iso: string | undefined, locale = 'es'): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

type Translate = (key: string) => string;

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
  qr?: string;          // qr_url del registro VeriFactu (URL de validación en la AEAT)
  qr_note?: string;     // leyenda bajo el QR (p.ej. CSV de la AEAT o "Validar en la AEAT")
  number?: string;      // número fiscal oficial (puede diferir del sale_number)
  issuer_nif?: string;
  customer_name?: string;
  customer_tax_id?: string;
}

interface TaxLine {
  label: string;
  rate?: number;
  base: number;
  amount: number;
}

/** Desglose de impuestos a partir del JSON `tax_breakdown` ({"21.00": {base, tax}}). */
function parseTaxes(tax_breakdown?: string): TaxLine[] {
  if (!tax_breakdown) return [];
  let obj: Record<string, { base?: number; tax?: number }>;
  try {
    obj = JSON.parse(tax_breakdown);
  } catch {
    return [];
  }
  return Object.entries(obj)
    .map(([rate, v]) => {
      const r = Number(rate);
      return {
        label: `IVA ${Number.isFinite(r) ? r.toFixed(0) : rate}%`,
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

/** Venta → tiquet térmico 80mm (`<ok-receipt>`). */
export function saleToReceipt(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
  locale = 'es',
): ReceiptData {
  const header = (settings.receipt_header || '').trim();
  return {
    business: { name: header.split('\n')[0] || 'Mi negocio', address: header.split('\n').slice(1).join(' ') || undefined, tax_id: fiscal.issuer_nif || undefined },
    number: fiscal.number || sale.sale_number,
    datetime: formatDateTime(sale.created_at, locale),
    customer: fiscal.customer_name || sale.customer_name || undefined,
    lines: lines.map((l) => ({
      name: lineLabel(l),
      qty: fromMicro(Number(l.quantity)), // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
      unit_price: toEuros(l.unit_price),
      total: toEuros(l.line_total),
    })),
    subtotal: sale.subtotal != null ? toEuros(sale.subtotal) : undefined,
    taxes: parseTaxes(sale.tax_breakdown).map((t) => ({ label: t.label, base: t.base, amount: t.amount })),
    total: toEuros(sale.total),
    payment: sale.payment_method_name
      ? { method: sale.payment_method_name, paid: sale.amount_tendered != null ? toEuros(sale.amount_tendered) : undefined, change: sale.change_due != null ? toEuros(sale.change_due) : undefined }
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

/** Venta → factura A4 (`<ok-invoice>`). */
export function saleToInvoice(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
  locale = 'es',
): InvoiceData {
  const header = (settings.receipt_header || '').trim();
  const invLines: InvoiceLine[] = lines.map((l) => ({
    description: lineLabel(l),
    qty: fromMicro(Number(l.quantity)), // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
    unit_price: toEuros(l.unit_price),
    discount_percent: l.discount_percent ? Number(l.discount_percent) : undefined,
    tax_rate: l.tax_rate != null ? Number(l.tax_rate) : undefined,
    total: toEuros(l.line_total),
  }));
  const taxes = parseTaxes(sale.tax_breakdown);
  return {
    issuer: { name: header.split('\n')[0] || 'Mi negocio', address: header.split('\n').slice(1).join(' ') || undefined, tax_id: fiscal.issuer_nif || undefined },
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
    payment_method: sale.payment_method_name || undefined,
    footer: settings.receipt_footer || undefined,
    qr: fiscal.qr || undefined,
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
  opts: { tableLabel?: string; datetime?: string; locale?: string; notice?: string } = {},
): ReceiptData {
  const header = (settings.receipt_header || '').trim();
  const cents = (l: PrebillLine) => (l.is_gift ? 0 : Math.round(l.price * l.qty));
  const total = lines.reduce((s, l) => s + cents(l), 0);
  return {
    business: {
      name: header.split('\n')[0] || 'Mi negocio',
      address: header.split('\n').slice(1).join(' ') || undefined,
    },
    // number/qr/payment AUSENTES a propósito: esto no es una factura (ver doc de la función).
    datetime: formatDateTime(opts.datetime ?? new Date().toISOString(), opts.locale ?? 'es'),
    customer: opts.tableLabel || undefined,
    lines: lines.map((l) => ({
      name: l.is_gift ? `${l.name} (invitación)` : l.name,
      qty: l.qty,
      unit_price: toEuros(l.price),
      total: toEuros(cents(l)),
    })),
    total: toEuros(total),
    taxes: [],
    currency: settings.currency || '€',
    // Inglés canónico (ADR-0055): la UI pasa el texto ya traducido en `opts.notice`; esto es solo
    // el respaldo para llamadas sin i18n (tests, integraciones).
    footer: opts.notice ?? 'Bill — this is not an invoice. The fiscal receipt is issued on payment.',
  };
}
