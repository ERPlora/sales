// sales#485 — the full invoice prints, on each line, the line's BASE (quantity × price − discount,
// without tax), and the lines add up to the «Base imponible» printed under them. It used to print
// `line_total` (base + tax): «1 × 2.500,00 €» next to «3.155,00 €», and lines that did not add up
// to the base of the same document. `<ok-invoice>`'s `InvoiceLine.total` is «net after discount,
// without tax»; the 80 mm ticket keeps the price with tax, which is the convention there.
//
// The rows below are what the handler persists for ONE tax-included sale across three tax
// profiles — 21 %, 10 % and 21 % + 5,2 % of equivalence surcharge — with amounts chosen so that
// per-line rounding and the declared close diverge (handler test
// `tax_included_line_bases_add_up_to_the_declared_base_of_each_rate`). The base of each line is
// the one the handler split from the declared base; the UI does not recompute anything.
import { describe, expect, it } from 'vitest';
import { saleToInvoice, saleToReceipt, type SaleLineRow, type SaleRow } from './document-mappers.js';
import { invoiceToPrintableHtml } from './invoice-html.js';

const row = (product_name: string, tax_rate: number, net_amount: number, tax_amount: number, line_total: number): SaleLineRow => ({
  product_name, quantity: 1_000_000, unit_price: line_total, tax_rate, net_amount, tax_amount, line_total,
});

const LINES: SaleLineRow[] = [
  row('Agua A', 21, 83, 17, 100),
  row('Agua B', 21, 83, 17, 100),
  row('Agua C', 21, 82, 18, 100),
  row('Tapa A', 10, 96, 9, 105),
  row('Tapa B', 10, 95, 10, 105),
  row('Chicle A', 26.2, 40, 10, 50),
  row('Chicle B', 26.2, 118, 32, 150),
];

const SALE: SaleRow = {
  id: 's1', sale_number: 'T-485', subtotal: 597, tax_amount: 113, total: 710,
  tax_breakdown: JSON.stringify({
    '21.00': { base: 406, tax: 86, kind: 'tax' },
    '10.00': { base: 191, tax: 19, kind: 'tax' },
    '5.20': { base: 158, tax: 8, kind: 'surcharge' },
  }),
  payment_method_name: 'Efectivo', amount_tendered: 710, change_due: 0,
  created_at: '2026-10-01T10:00:00Z',
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('full invoice: each line prints its base and the lines add up to the tax base (sales#485)', () => {
  it('the amount of every line is its net_amount, not line_total', () => {
    const inv = saleToInvoice(SALE, LINES);
    expect(inv.lines.map((l) => l.total)).toEqual([83, 83, 82, 96, 95, 40, 118]);
  });

  it('the lines add up to the «Base imponible», and base + taxes = total', () => {
    const inv = saleToInvoice(SALE, LINES);
    expect(sum(inv.lines.map((l) => l.total))).toBe(inv.subtotal);
    expect(inv.subtotal).toBe(597);
    expect(inv.subtotal + inv.tax_total).toBe(inv.total);
    expect(sum(inv.taxes.map((t) => t.amount))).toBe(inv.tax_total);
  });

  it('a single 2.500,00 € line at 21 % + 5,2 % prints 2.500,00 €, not the 3.155,00 € it charges', () => {
    const line = { ...row('Aceite de oliva 5 l', 26.2, 250_000, 65_500, 315_500), unit_price: 250_000 };
    const sale: SaleRow = {
      ...SALE, subtotal: 250_000, tax_amount: 65_500, total: 315_500,
      tax_breakdown: JSON.stringify({ '21.00': { base: 250_000, tax: 52_500 }, '5.20': { base: 250_000, tax: 13_000, kind: 'surcharge' } }),
    };
    const inv = saleToInvoice(sale, [line]);
    expect(inv.lines[0]).toMatchObject({ unit_price: 250_000, total: 250_000 });
    expect(inv.subtotal).toBe(250_000);
  });

  it('the printed A4 invoice (same data) prints the base too', () => {
    const html = invoiceToPrintableHtml(saleToInvoice(SALE, LINES));
    const amounts = [...html.matchAll(/<td class="a">([^<]*)<\/td>\s*<\/tr>/g)].map((m) => m[1]).slice(0, LINES.length);
    // Digits only: the separators follow the document locale, the amounts are what is pinned.
    expect(amounts.map((a) => a.replace(/\D/g, ''))).toEqual(['083', '083', '082', '096', '095', '040', '118']);
  });

  it('the 80 mm ticket keeps the price WITH tax on each line (its convention, untouched)', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.lines.map((l) => l.total)).toEqual([100, 100, 100, 105, 105, 50, 150]);
  });
});
