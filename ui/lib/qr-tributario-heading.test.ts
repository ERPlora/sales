// @vitest-environment happy-dom
// sales#339 — «QR tributario:» above the fiscal QR, on the screen ticket, the A4 invoice and the
// thermal paper.
//
// The AEAT's QR specification (v0.5.0 §3, published under Orden HAC/1177/2024 art. 21.1) wants the
// fiscal QR «always preceded» by the text «QR tributario:», above it. It is a fixed legal text,
// like «VERI*FACTU»: the same in every language, so it is not a catalog key (the SaaS invoice PDF
// prints it literally too, saas#2184). It is its own key, `qr_heading`, and travels only with the
// QR. Painting it above the QR and placing the QR at the top is the renderers' job
// (`<ok-receipt>`/`<ok-invoice>` in outfitkit, `escpos::render_receipt` in the hub).
import { describe, expect, it } from 'vitest';
import { QR_TRIBUTARIO_HEADING, saleToInvoice, saleToReceipt, type FiscalData, type SaleLineRow, type SaleRow } from './document-mappers.js';
import { saleToPrintDocument } from './print-document.js';

const SALE: SaleRow = { id: 's-1', sale_number: 'T-1', subtotal: 1074, tax_amount: 126, total: 1200 };
const LINES: SaleLineRow[] = [{ id: 'l-1', product_name: 'Corte', quantity: 1_000_000, unit_price: 1200, line_total: 1200 }];
const QR = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T-1&fecha=23-09-2026&importe=12.00';
const WITH_QR: FiscalData = { qr: QR, qr_note: 'CSV: A-7F3K9QX2M1', number: 'T-2026-000001' };

describe('sales#339 — «QR tributario:» above the fiscal QR', () => {
  it('is the literal text of the AEAT specification, the same in every language', () => {
    expect(QR_TRIBUTARIO_HEADING).toBe('QR tributario:');
    for (const lang of ['es', 'en', 'ca', 'fr']) {
      expect(saleToReceipt(SALE, LINES, {}, WITH_QR, lang, 'Mi negocio').qr_heading).toBe('QR tributario:');
    }
  });

  it('screen ticket: the heading travels with the QR', () => {
    const r = saleToReceipt(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    expect(r.qr).toBe(QR);
    expect(r.qr_heading).toBe('QR tributario:');
  });

  it('A4 invoice: the same heading over the same QR', () => {
    const inv = saleToInvoice(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    expect(inv.qr).toBe(QR);
    expect(inv.qr_heading).toBe('QR tributario:');
  });

  it('thermal paper: the renderer gets `qr_heading` next to `qr_data`', () => {
    const doc = saleToPrintDocument(SALE, LINES, {}, WITH_QR, 'es', 'Mi negocio');
    expect(doc.qr_data).toBe(QR);
    expect(doc.qr_heading).toBe('QR tributario:');
  });

  it('without a fiscal QR there is no heading anywhere (a bill, a sale with no record yet)', () => {
    expect(saleToReceipt(SALE, LINES, {}, {}, 'es', 'Mi negocio').qr_heading).toBeUndefined();
    expect(saleToInvoice(SALE, LINES, {}, {}, 'es', 'Mi negocio').qr_heading).toBeUndefined();
    expect(saleToPrintDocument(SALE, LINES, {}, {}, 'es', 'Mi negocio').qr_heading).toBeUndefined();
  });
});
