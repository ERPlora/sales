// @vitest-environment happy-dom
// sales#306 — the A4 invoice as PLAIN, self-contained HTML, the paper a browser (or the PDF) prints.
//
// A business that issues full invoices saw the A4 on screen (<ok-invoice>) and its Print button
// built the paper from the TICKET: no customer tax id, no breakdown per VAT rate — the two things
// that make a full invoice (F1) one. This is the invoice's own paper: the same data the screen
// paints (`saleToInvoice`), laid out on an A4 sheet, with no web component inside (the print
// iframe runs no scripts and a shadow root would not print).
import { describe, it, expect } from 'vitest';
import { invoiceToPrintableHtml } from './invoice-html';

// The paper formats money with the document language (ADR-0400); these fixtures assert Spanish.
document.documentElement.lang = 'es';

const QR = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=F2026-000012&fecha=24-09-2026&importe=36.30';

const invoice = {
  issuer: { name: 'Peluquería Elena SL', address: 'C/ Mayor 1, Madrid', tax_id: 'B12345678' },
  customer: { name: 'Talleres Gómez SA', tax_id: 'A87654321' },
  number: 'F2026-000012',
  issue_date: '24/09/2026, 10:15',
  lines: [
    { description: 'Corte', qty: 1, unit_price: 2000, tax_rate: 21, total: 2000 },
    { description: 'Champú <sólido>', qty: 2, unit_price: 500, discount_percent: 10, tax_rate: 10, total: 900 },
  ],
  subtotal: 2900,
  discount_total: 100,
  taxes: [
    { label: 'IVA 21%', rate: 21, base: 2000, amount: 420 },
    { label: 'IVA 10%', rate: 10, base: 900, amount: 90 },
  ],
  tax_total: 510,
  total: 3410,
  currency: '€',
  decimals: 2,
  payment_method: 'Tarjeta',
  footer: 'Inscrita en el Registro Mercantil de Madrid',
  qr: QR,
  qr_heading: 'QR tributario:',
  qr_legend: 'VERI*FACTU',
  qr_note: 'Verifique en la AEAT',
};

const labels = {
  invoice: 'Factura', number: 'Nº', date: 'Fecha', billTo: 'Cliente', description: 'Descripción',
  qty: 'Cant.', price: 'Precio', discount: 'Dto.', tax: 'IVA', amount: 'Importe',
  taxBase: 'Base imponible', discountTotal: 'Descuento', total: 'TOTAL', paymentMethod: 'Forma de pago',
};

describe('the A4 invoice as printable HTML (sales#306)', () => {
  const html = invoiceToPrintableHtml({ ...invoice, labels });

  it('is a whole, self-contained document on an A4 sheet — not the 80 mm ticket', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('size: A4');
    expect(html).not.toContain('80mm');
    expect(html).not.toContain('ok-invoice');
    expect(html).not.toContain('ion-');
  });

  it('carries the issuer AND the customer with their tax ids — what makes it a full invoice', () => {
    expect(html).toContain('Peluquería Elena SL');
    expect(html).toContain('C/ Mayor 1, Madrid');
    expect(html).toContain('B12345678');
    expect(html).toContain('Talleres Gómez SA');
    expect(html).toContain('A87654321');
  });

  it('carries its title, number and date', () => {
    expect(html).toContain('Factura');
    expect(html).toContain('F2026-000012');
    expect(html).toContain('24/09/2026, 10:15');
  });

  it('carries every line with quantity, unit price, discount, VAT rate and amount', () => {
    expect(html).toContain('Corte');
    expect(html).toContain('20,00 €');
    expect(html).toContain('5,00 €');
    expect(html).toContain('9,00 €');
    expect(html).toMatch(/10\s?%/);
    expect(html).toMatch(/21\s?%/);
  });

  it('breaks the VAT down per rate: base and amount of each one', () => {
    expect(html).toMatch(/IVA 21%[\s\S]*20,00 €[\s\S]*4,20 €/);
    expect(html).toMatch(/IVA 10%[\s\S]*9,00 €[\s\S]*0,90 €/);
    expect(html).toContain('Base imponible');
  });

  it('carries the discount, the total and the payment method', () => {
    expect(html).toContain('Descuento');
    expect(html).toContain('1,00 €');
    expect(html).toMatch(/TOTAL[\s\S]*34,10 €/);
    expect(html).toContain('Forma de pago');
    expect(html).toContain('Tarjeta');
    expect(html).toContain('Inscrita en el Registro Mercantil de Madrid');
  });

  it('opens with the fiscal QR, «QR tributario:» above and «VERI*FACTU» under it (sales#339/#327)', () => {
    expect(html).toContain('<svg');
    const heading = html.indexOf('QR tributario:');
    const qr = html.indexOf('<svg');
    const legend = html.indexOf('VERI*FACTU');
    const issuer = html.indexOf('Peluquería Elena SL', html.indexOf('<body'));
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(qr);
    expect(qr).toBeLessThan(legend);
    expect(legend, 'the QR opens the invoice, before the content (AEAT QR spec §3)').toBeLessThan(issuer);
  });

  it('with no fiscal QR there is no QR block: a legend with nothing to scan claims a check', () => {
    const bare = invoiceToPrintableHtml({ ...invoice, qr: undefined, labels });
    expect(bare).not.toContain('<svg');
    expect(bare).not.toContain('QR tributario:');
    expect(bare).not.toContain('VERI*FACTU');
  });

  it('a reprint says «duplicado» (hub#1931); the original does not', () => {
    expect(html).not.toContain('DUPLICADO');
    expect(invoiceToPrintableHtml({ ...invoice, labels, duplicate_label: 'DUPLICADO' })).toContain('DUPLICADO');
  });

  it('escapes what the user typed: a product called <sólido> is text, not markup', () => {
    expect(html).toContain('Champú &lt;sólido&gt;');
    expect(html).not.toContain('<sólido>');
  });
});
