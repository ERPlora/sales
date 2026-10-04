// sales#491 — on the full invoice, «quantity × unit price» has to read as the amount of the line.
//
// Since sales#485 an invoice line's amount is its BASE (`net_amount`: without tax, after every
// discount). The unit price next to it was still the sale's `unit_price` as charged — the price
// WITH the VAT inside when the business sells tax-included (a bar, a hair salon): «2 × 6,00 €»
// next to 8,26 €. A full invoice carries the unit price WITHOUT tax (RD 1619/2012 art. 6.1.f).
//
// The sale row does not freeze whether its prices carried the tax, so the net unit price is taken
// from what it DOES freeze: the line's base. It is the base per unit before the line's own
// discount (`discount_percent`, painted beside it, so it must not be applied twice) and after the
// ticket's prorated discount, which the invoice already explains in its note («…already applied to
// the amounts above», sales#486). Rounded to the scale of the document.
//
// The 80 mm ticket keeps its convention (price with tax, amount with tax): untouched here.
import { describe, expect, it } from 'vitest';
import { saleToInvoice, saleToReceipt, type SaleLineRow, type SaleRow } from './document-mappers.js';
import { invoiceToPrintableHtml } from './invoice-html.js';

const line = (over: Partial<SaleLineRow>): SaleLineRow => ({
  id: 'l-1', product_name: 'Menú del día', quantity: 2_000_000, unit_price: 600, tax_rate: 21,
  net_amount: 826, tax_amount: 174, line_total: 1000, ...over,
});

const sale = (over: Partial<SaleRow> = {}): SaleRow => ({
  id: 's-1', sale_number: 'T-491', subtotal: 826, tax_amount: 174, total: 1000, discount_amount: 200,
  tax_breakdown: JSON.stringify({ '21.00': { base: 826, tax: 174, kind: 'tax' } }),
  payment_method_name: 'Efectivo', created_at: '2026-10-04T10:00:00Z', ...over,
});

/** What a reader computes from the line: quantity × unit price, less the line's own discount. */
const readAmount = (l: { qty: number; unit_price: number; discount_percent?: number }) =>
  l.qty * l.unit_price * (1 - (l.discount_percent ?? 0) / 100);

describe('sales#491 — the full invoice prints the unit price WITHOUT tax', () => {
  it('VAT included + 2,00 € ticket discount: «2 × 4,13 €» next to 8,26 €, not «2 × 6,00 €»', () => {
    const inv = saleToInvoice(sale(), [line({})]);
    expect(inv.lines[0]).toMatchObject({ qty: 2, unit_price: 413, total: 826 });
  });

  it('VAT included, no discount: 2 × 6,00 € with 21 % inside → «2 × 4,96 €» next to 9,92 €', () => {
    const inv = saleToInvoice(
      sale({ subtotal: 992, tax_amount: 208, total: 1200, discount_amount: 0 }),
      [line({ net_amount: 992, tax_amount: 208, line_total: 1200 })],
    );
    expect(inv.lines[0]).toMatchObject({ unit_price: 496, total: 992 });
  });

  it('net prices, no discount: the unit price is already net and stays «2 × 5,00 €»', () => {
    const inv = saleToInvoice(
      sale({ subtotal: 1000, tax_amount: 210, total: 1210, discount_amount: 0 }),
      [line({ unit_price: 500, net_amount: 1000, tax_amount: 210, line_total: 1210 })],
    );
    expect(inv.lines[0]).toMatchObject({ unit_price: 500, total: 1000 });
  });

  it('a line discount stays beside the price and is not applied twice: «2 × 4,96 € · −10 %» → 8,93 €', () => {
    // 2 × 6,00 € −10 % = 10,80 € charged, base 10,80 / 1,21 = 8,93 €.
    const inv = saleToInvoice(
      sale({ subtotal: 893, tax_amount: 187, total: 1080, discount_amount: 0 }),
      [line({ discount_percent: 10, net_amount: 893, tax_amount: 187, line_total: 1080 })],
    );
    expect(inv.lines[0]).toMatchObject({ unit_price: 496, discount_percent: 10, total: 893 });
  });

  it('by weight: 0,350 kg at 12,00 €/kg with VAT inside → the net price per kg, 9,91 €', () => {
    const inv = saleToInvoice(
      sale({ subtotal: 347, tax_amount: 73, total: 420, discount_amount: 0 }),
      [line({ quantity: 350_000, unit_price: 1200, net_amount: 347, tax_amount: 73, line_total: 420 })],
    );
    expect(inv.lines[0]).toMatchObject({ qty: 0.35, unit_price: 991, total: 347 });
  });

  it('a comped line (base 0) reads «2 × 0,00 €», not its price with tax next to 0,00 €', () => {
    const inv = saleToInvoice(
      sale({ subtotal: 0, tax_amount: 0, total: 0, discount_amount: 0 }),
      [line({ is_gift: 1, net_amount: 0, tax_amount: 0, line_total: 0 })],
    );
    expect(inv.lines[0]).toMatchObject({ unit_price: 0, total: 0 });
  });

  it('a line given away with a 100 % discount reads «1 × 0,00 € · −100 %», never a price with tax nor NaN', () => {
    const inv = saleToInvoice(
      sale({ subtotal: 0, tax_amount: 0, total: 0, discount_amount: 0 }),
      [line({ quantity: 1_000_000, discount_percent: 100, net_amount: 0, tax_amount: 0, line_total: 0 })],
    );
    expect(inv.lines[0]).toMatchObject({ unit_price: 0, discount_percent: 100, total: 0 });
  });

  it('on every line, quantity × unit price (less its discount) is the amount within half a cent per unit', () => {
    const lines = [
      line({ id: 'a' }),
      line({ id: 'b', quantity: 3_000_000, unit_price: 250, tax_rate: 10, net_amount: 682, tax_amount: 68, line_total: 750 }),
      line({ id: 'c', quantity: 1_000_000, unit_price: 1999, discount_percent: 15, net_amount: 1404, tax_amount: 295, line_total: 1699 }),
      line({ id: 'd', quantity: 350_000, unit_price: 1200, net_amount: 347, tax_amount: 73, line_total: 420 }),
    ];
    const inv = saleToInvoice(sale(), lines);
    // Rounded half-up to the cent, never truncated: 14,04 € / 0,85 = 16,5176 € → 16,52 €.
    expect(inv.lines.map((l) => l.unit_price)).toEqual([413, 227, 1652, 991]);
    for (const l of inv.lines) {
      expect(Math.abs(readAmount(l) - l.total), `${l.description}: ${l.qty} × ${l.unit_price}`).toBeLessThanOrEqual(l.qty * 0.5 + 0.5);
      expect(l.unit_price % 1, 'the unit price is in minor units of the document').toBe(0);
    }
  });

  it('the printed A4 shows the net unit price in its price column', () => {
    const html = invoiceToPrintableHtml(saleToInvoice(sale(), [line({})]));
    const row = html.match(/<tr>\s*<td>Menú del día<\/td>[\s\S]*?<\/tr>/)?.[0] ?? '';
    const cells = [...row.matchAll(/<td class="a">([^<]*)<\/td>/g)].map((m) => m[1].replace(/\D/g, ''));
    expect(cells).toContain('413');
    expect(cells).not.toContain('600');
  });

  it('the 80 mm ticket keeps the price WITH tax (its convention, untouched)', () => {
    const r = saleToReceipt(sale(), [line({})]);
    expect(r.lines[0]).toMatchObject({ unit_price: 600, total: 1000 });
  });
});
