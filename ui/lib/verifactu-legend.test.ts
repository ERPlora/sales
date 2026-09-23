// @vitest-environment happy-dom
// sales#327 — the legal legend «VERI*FACTU» beside the fiscal QR, on every document of the hub.
//
// RD 1619/2012 art. 6.5.b (7.5 for simplified invoices, which a ticket is) requires it on every
// invoice issued by a system that remits ALL its records to the AEAT, and ERPlora always does:
// there is no NO-VERI*FACTU mode (Ioan, 19/09) — a record that cannot go out now leaves later as a
// late remission. So the legend goes with the fiscal QR, always, and it is the same in every
// language: nothing to translate. It is its own key (`qr_legend`), never folded into `qr_note`,
// which is a small caption and changes when the AEAT answers with a CSV.
//
// Four surfaces, one source: the screen ticket (`<ok-receipt>`), the screen/A4 invoice
// (`<ok-invoice>`), the browser paper (`receiptToPrintableHtml`) and the thermal paper
// (`saleToPrintDocument` → `escpos::render_receipt`).
import { describe, expect, it } from 'vitest';
import { saleToInvoice, saleToReceipt, VERIFACTU_LEGEND, type FiscalData, type SaleLineRow, type SaleRow } from './document-mappers.js';
import { saleToPrintDocument } from './print-document.js';
import { receiptToPrintableHtml } from './receipt-html.js';

document.documentElement.lang = 'es';

const SALE: SaleRow = { id: 's-1', sale_number: 'T-1', subtotal: 1074, tax_amount: 126, total: 1200 };
const LINES: SaleLineRow[] = [{ id: 'l-1', product_name: 'Corte', quantity: 1_000_000, unit_price: 1200, line_total: 1200 }];
const QR = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T-1&fecha=23-09-2026&importe=12.00';

const WITH_QR: FiscalData = { qr: QR, qr_note: 'CSV: A-7F3K9QX2M1', number: 'T-2026-000001' };

describe('sales#327 — «VERI*FACTU» beside the fiscal QR', () => {
  it('is the short form the law admits, identical in every language', () => {
    expect(VERIFACTU_LEGEND).toBe('VERI*FACTU');
  });

  it('screen ticket: the legend travels with the QR, the CSV note stays as it was', () => {
    const r = saleToReceipt(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    expect(r.qr).toBe(QR);
    expect(r.qr_legend).toBe('VERI*FACTU');
    expect(r.qr_note, 'the note keeps the CSV: the legend is added, not substituted').toBe('CSV: A-7F3K9QX2M1');
  });

  it('screen ticket: the legend does not depend on the note (before the CSV arrives, and after)', () => {
    const noNote = saleToReceipt(SALE, LINES, {}, { qr: QR }, 'es', 'Mi negocio');
    expect(noNote.qr_legend).toBe('VERI*FACTU');
  });

  it('A4 invoice: same legend beside the same QR', () => {
    const inv = saleToInvoice(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    expect(inv.qr_legend).toBe('VERI*FACTU');
    expect(inv.qr_note).toBe('CSV: A-7F3K9QX2M1');
  });

  it('thermal paper: the renderer gets `qr_legend` next to `qr_data`', () => {
    const doc = saleToPrintDocument(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    expect(doc.qr_data).toBe(QR);
    expect(doc.qr_legend).toBe('VERI*FACTU');
  });

  it('browser paper: the legend is printed, in addition to the note', () => {
    const r = saleToReceipt(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    const html = receiptToPrintableHtml(r);
    expect(html).toContain('VERI*FACTU');
    expect(html).toContain('CSV: A-7F3K9QX2M1');
    // Before the note, right where the QR block is on the thermal paper.
    expect(html.indexOf('VERI*FACTU')).toBeLessThan(html.indexOf('CSV: A-7F3K9QX2M1'));
  });

  it('without a fiscal QR there is no legend anywhere (a bill, a sale with no record yet)', () => {
    expect(saleToReceipt(SALE, LINES, {}, {}, 'es', 'Mi negocio').qr_legend).toBeUndefined();
    expect(saleToInvoice(SALE, LINES, {}, {}, 'es', 'Mi negocio').qr_legend).toBeUndefined();
    expect(saleToPrintDocument(SALE, LINES, {}, {}, 'es', 'Mi negocio').qr_legend).toBeUndefined();
    const html = receiptToPrintableHtml(saleToReceipt(SALE, LINES, {}, {}, 'es', 'Mi negocio'));
    expect(html).not.toContain('VERI*FACTU');
  });
});
