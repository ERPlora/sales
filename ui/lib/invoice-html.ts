// invoice-html — the A4 invoice as PLAIN, self-contained HTML, the paper a browser prints (sales#306).
//
// The sibling of `receipt-html.ts`, for the other document the viewer paints. A business that
// issues full invoices saw `<ok-invoice>` on screen and its Print button built the paper from the
// ticket: no customer tax id and no breakdown per VAT rate, the two things that make a full invoice
// (F1) one. This builds the paper from the same `saleToInvoice` data the screen paints, on an A4
// sheet. No web component inside: the print iframe runs no scripts and a shadow root would not
// print — the same reason `receipt-html.ts` exists.

import type { InvoiceData, OkInvoiceLabels } from '@erplora/outfitkit';
import { documentLocale, formatMinor, formatPercent } from '@erplora/outfitkit/ok-money';
import { qrSvgMarkup } from '@erplora/outfitkit/ok-qr';

/** Side of the fiscal QR on the sheet, in CSS px: 132 px = 35 mm, the middle of the 30-40 mm the
 *  AEAT QR spec asks for — the same size as on the ticket. */
const FISCAL_QR_PX = 132;

/** What the invoice paper needs: the screen's data (`saleToInvoice`) plus the paper-only bits. */
export interface PrintableInvoice extends InvoiceData {
  /** sales#339 — «QR tributario:», right above the fiscal QR. */
  qr_heading?: string;
  /** sales#327 — «VERI*FACTU», right under the fiscal QR. */
  qr_legend?: string;
  /** hub#1931 — set on a REPRINT: only one original of an invoice may exist (RD 1619/2012 art. 14). */
  duplicate_label?: string;
  /** Words of the paper, translated by the caller from the module catalog (`invoiceLabels`). */
  labels?: Partial<OkInvoiceLabels>;
}

/** Escapes for HTML: the data is typed by users (a product called `<script>` does not run). */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Money in MINOR UNITS (ADR-0400), painted with the document's language — the screen's text. */
function money(v: unknown, currency: string, decimals: number): string {
  return formatMinor(v, { decimals, locale: documentLocale(), currency });
}

/** A rate or a percentage as the document's language writes it: «21 %», «10,5 %» in es, «21%» in
 *  en — the same helper as the tax summary rows (sales#477), so the sheet writes a rate one way. */
function percent(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return formatPercent(v, documentLocale());
}

/** A quantity, never rounded to an integer: «1,5». */
function quantity(v: number): string {
  return new Intl.NumberFormat(documentLocale(), { maximumFractionDigits: 3 }).format(v);
}

/** One party (issuer / customer): name, address and tax id, each on its own line when present. */
function party(p: { name?: string; address?: string; tax_id?: string } | undefined): string {
  if (!p) return '';
  return [p.name, p.address, p.tax_id]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v, i) => `<div${i === 0 ? ' class="party-name"' : ''}>${esc(v)}</div>`)
    .join('');
}

/**
 * Whole HTML document of the invoice, ready to print in an isolated iframe on an A4 sheet.
 */
export function invoiceToPrintableHtml(doc: PrintableInvoice): string {
  const cur = doc.currency || '€';
  const dec = doc.decimals ?? 2;
  const lbl: OkInvoiceLabels = {
    empty: '', invoice: 'Invoice', number: 'No.', date: 'Date', dueDate: 'Due date', billTo: 'Bill to',
    description: 'Description', qty: 'Qty', price: 'Price', discount: 'Disc.', tax: 'Tax', amount: 'Amount',
    noLines: '—', taxBase: 'Tax base', discountTotal: 'Discount', total: 'TOTAL', paymentMethod: 'Payment method',
    ...doc.labels,
  };

  const lines = (doc.lines ?? []).map((l) => `
      <tr>
        <td>${esc(l.description)}</td>
        <td class="a">${esc(quantity(l.qty))}</td>
        <td class="a">${money(l.unit_price, cur, dec)}</td>
        <td class="a">${esc(percent(l.discount_percent || undefined))}</td>
        <td class="a">${esc(percent(l.tax_rate))}</td>
        <td class="a">${money(l.total, cur, dec)}</td>
      </tr>`).join('');

  const taxes = (doc.taxes ?? []).map((t) => `
      <tr><td>${esc(t.label)}</td><td class="a">${money(t.base, cur, dec)}</td><td class="a">${money(t.amount, cur, dec)}</td></tr>`).join('');

  // sales#339/#327 — the fiscal block opens the invoice (AEAT QR spec v0.5.0 §3): «QR tributario:»,
  // the QR, «VERI*FACTU» and the note. No QR → no block: a legend with nothing to scan would claim
  // a check the paper does not offer.
  const fiscalQr = qrSvgMarkup(doc.qr ?? '', { size: FISCAL_QR_PX });
  const fiscal = fiscalQr
    ? `<div class="fiscal-qr">` +
      (doc.qr_heading ? `<div class="qr-heading">${esc(doc.qr_heading)}</div>` : '') +
      fiscalQr +
      (doc.qr_legend ? `<div class="legend">${esc(doc.qr_legend)}</div>` : '') +
      (doc.qr_note ? `<div class="qr-note">${esc(doc.qr_note)}</div>` : '') +
      `</div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(doc.number || lbl.invoice)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #000; font: 11pt/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  .fiscal-qr { margin: 0 0 6mm; }
  .fiscal-qr svg { display: block; margin: 1mm 0; }
  .qr-heading, .legend { font-weight: 700; }
  .qr-note { font-size: 9pt; word-break: break-word; }
  .dup { font-size: 14pt; font-weight: 700; letter-spacing: .08em; margin: 0 0 3mm; }
  .head { display: flex; justify-content: space-between; gap: 10mm; margin-bottom: 8mm; }
  .party-name { font-weight: 700; }
  h1 { font-size: 20pt; margin: 0 0 2mm; text-align: right; }
  .doc-meta { text-align: right; }
  .bill-to { margin-bottom: 8mm; }
  .bill-to h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 1mm; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9pt; border-bottom: 1px solid #000; padding: 1.5mm 1mm; }
  td { vertical-align: top; padding: 1.5mm 1mm; border-bottom: 1px solid #ddd; }
  th.a, td.a { text-align: right; white-space: nowrap; }
  .summary { display: flex; justify-content: flex-end; margin-top: 6mm; }
  .summary table { width: auto; min-width: 90mm; }
  .tot td { font-size: 13pt; font-weight: 700; border-bottom: 0; }
  .pay { margin-top: 6mm; }
  .foot { margin-top: 10mm; font-size: 9pt; color: #333; }
</style></head>
<body>
  ${fiscal}
  ${doc.duplicate_label ? `<div class="dup">${esc(doc.duplicate_label)}</div>` : ''}
  <div class="head">
    <div class="issuer">${party(doc.issuer)}</div>
    <div>
      <h1>${esc(lbl.invoice)}</h1>
      <div class="doc-meta">${esc(lbl.number)} ${esc(doc.number)}</div>
      <div class="doc-meta">${esc(lbl.date)} ${esc(doc.issue_date)}</div>
    </div>
  </div>
  <div class="bill-to"><h2>${esc(lbl.billTo)}</h2>${party(doc.customer)}</div>
  <table>
    <thead><tr>
      <th>${esc(lbl.description)}</th><th class="a">${esc(lbl.qty)}</th><th class="a">${esc(lbl.price)}</th>
      <th class="a">${esc(lbl.discount)}</th><th class="a">${esc(lbl.tax)}</th><th class="a">${esc(lbl.amount)}</th>
    </tr></thead>
    <tbody>${lines || `<tr><td colspan="6">${esc(lbl.noLines)}</td></tr>`}</tbody>
  </table>
  <div class="summary"><table>
    ${doc.discount_total ? `<tr><td>${esc(lbl.discountTotal)}</td><td></td><td class="a">${money(doc.discount_total, cur, dec)}</td></tr>` : ''}
    ${taxes ? `<tr><th>${esc(lbl.tax)}</th><th class="a">${esc(lbl.taxBase)}</th><th class="a">${esc(lbl.amount)}</th></tr>${taxes}` : ''}
    <tr class="tot"><td>${esc(lbl.total)}</td><td></td><td class="a">${money(doc.total, cur, dec)}</td></tr>
  </table></div>
  ${doc.payment_method ? `<div class="pay">${esc(lbl.paymentMethod)}: ${esc(doc.payment_method)}</div>` : ''}
  ${doc.notes ? `<div class="foot">${esc(doc.notes)}</div>` : ''}
  ${doc.footer ? `<div class="foot">${esc(doc.footer)}</div>` : ''}
  ${!fiscal && doc.qr_note ? `<div class="foot">${esc(doc.qr_note)}</div>` : ''}
</body></html>`;
}
