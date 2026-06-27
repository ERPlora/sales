// Mappers puros: venta (`sales.get`) + líneas (`sales.lines`) + ajustes (`sales.settings.get`)
// → contrato de documento de OutfitKit (`ReceiptData` / `InvoiceData`). Sin efectos, testeable.
//
// La cabecera de negocio (nombre/NIF/dirección estructurados) y el QR de VeriFactu NO viven en
// el módulo sales; de momento usamos `receipt_header`/`receipt_footer` de los ajustes y dejamos
// NIF/dirección/QR vacíos (se rellenan cuando se cablee el perfil del negocio + verifactu).

import type { ReceiptData, InvoiceData, InvoiceLine } from '@erplora/outfitkit';

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
        base: Number(v?.base ?? 0),
        amount: Number(v?.tax ?? 0),
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
): ReceiptData {
  const header = (settings.receipt_header || '').trim();
  return {
    business: { name: header.split('\n')[0] || 'Mi negocio', address: header.split('\n').slice(1).join(' ') || undefined, tax_id: fiscal.issuer_nif || undefined },
    number: fiscal.number || sale.sale_number,
    datetime: sale.created_at,
    customer: fiscal.customer_name || sale.customer_name || undefined,
    lines: lines.map((l) => ({
      name: lineLabel(l),
      qty: Number(l.quantity),
      unit_price: Number(l.unit_price),
      total: Number(l.line_total),
    })),
    subtotal: sale.subtotal != null ? Number(sale.subtotal) : undefined,
    taxes: parseTaxes(sale.tax_breakdown).map((t) => ({ label: t.label, base: t.base, amount: t.amount })),
    total: Number(sale.total ?? 0),
    payment: sale.payment_method_name
      ? { method: sale.payment_method_name, paid: sale.amount_tendered != null ? Number(sale.amount_tendered) : undefined, change: sale.change_due != null ? Number(sale.change_due) : undefined }
      : undefined,
    currency: settings.currency || '€',
    footer: settings.receipt_footer || undefined,
    qr: fiscal.qr || undefined,
    qr_note: fiscal.qr_note || undefined,
  };
}

/** Venta → factura A4 (`<ok-invoice>`). */
export function saleToInvoice(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
): InvoiceData {
  const header = (settings.receipt_header || '').trim();
  const invLines: InvoiceLine[] = lines.map((l) => ({
    description: lineLabel(l),
    qty: Number(l.quantity),
    unit_price: Number(l.unit_price),
    discount_percent: l.discount_percent ? Number(l.discount_percent) : undefined,
    tax_rate: l.tax_rate != null ? Number(l.tax_rate) : undefined,
    total: Number(l.line_total),
  }));
  const taxes = parseTaxes(sale.tax_breakdown);
  return {
    issuer: { name: header.split('\n')[0] || 'Mi negocio', address: header.split('\n').slice(1).join(' ') || undefined, tax_id: fiscal.issuer_nif || undefined },
    customer: { name: fiscal.customer_name || sale.customer_name || 'Cliente', tax_id: fiscal.customer_tax_id || undefined },
    number: fiscal.number || sale.sale_number,
    issue_date: sale.created_at || '',
    lines: invLines,
    subtotal: Number(sale.subtotal ?? 0),
    discount_total: sale.discount_amount ? Number(sale.discount_amount) : undefined,
    taxes: taxes.map((t) => ({ label: t.label, rate: t.rate, base: t.base, amount: t.amount })),
    tax_total: Number(sale.tax_amount ?? 0),
    total: Number(sale.total ?? 0),
    currency: settings.currency || '€',
    payment_method: sale.payment_method_name || undefined,
    footer: settings.receipt_footer || undefined,
    qr: fiscal.qr || undefined,
    qr_note: fiscal.qr_note || undefined,
  };
}
