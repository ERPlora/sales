// sales#489 — the foot of the thermal roll has to add up, like the invoice since sales#486.
//
// The ticket discount is ALREADY prorated into the lines and the base by the handler (sales#33):
// the sale's `subtotal` is the tax base AFTER the discount and each line's `line_total` what the
// customer pays for it. The paper used to also send `discount`, which the renderer
// (`escpos::render_receipt`, hub) prints as «Descuento −2,00» under the subtotal and the tax:
// «8,26 + 1,74 − 2,00» next to a 10,00 total. Now the summary rows the renderer adds up are only
// subtotal + tax = total, and the discount travels as the same informative note the invoice
// carries (`ui.docDiscountApplied`), at the foot, above the business's own footer.
import { describe, expect, it } from 'vitest';
import { saleToInvoicePrintDocument, saleToPrintDocument, type PrintDocument } from './print-document.js';
import type { SaleLineRow, SaleRow } from './document-mappers.js';
import { documentLocale, formatMinor } from '@erplora/outfitkit/ok-money';
import es from '../../locales/es.json';

const tEs = (key: string) => (es as { ui: Record<string, string> }).ui[key.replace(/^ui\./, '')] ?? key;

// VAT included: 2 × 6,00 € = 12,00 €, 2,00 € off → 10,00 € charged (base 8,26 € + VAT 1,74 €).
const INCL_LINES: SaleLineRow[] = [{
  id: 'l-1', product_name: 'Café', quantity: 2_000_000, unit_price: 600, tax_rate: 21,
  net_amount: 826, tax_amount: 174, line_total: 1000,
}];
const INCL_SALE: SaleRow = {
  id: 's-1', sale_number: 'T-489', subtotal: 826, tax_amount: 174, total: 1000, discount_amount: 200,
  tax_breakdown: JSON.stringify({ '21.00': { base: 826, tax: 174, kind: 'tax' } }),
  payment_method_name: 'Efectivo', amount_tendered: 1000, change_due: 0, created_at: '2026-10-04T10:00:00Z',
};
// Net prices: 2 × 5,00 € = 10,00 € of base, 2,00 € off → base 8,00 € + VAT 1,68 € = 9,68 €.
const EXCL_LINES: SaleLineRow[] = [{ ...INCL_LINES[0], unit_price: 500, net_amount: 800, tax_amount: 168, line_total: 968 }];
const EXCL_SALE: SaleRow = {
  ...INCL_SALE, subtotal: 800, tax_amount: 168, total: 968, amount_tendered: 968,
  tax_breakdown: JSON.stringify({ '21.00': { base: 800, tax: 168, kind: 'tax' } }),
};

const FISCAL = { customer_tax_id: 'B12345678', number: 'F2026-0001' };
const SETTINGS = { receipt_footer: 'Gracias por su visita' };
const NOTE = tEs('ui.docDiscountApplied')
  .replace('{amount}', formatMinor(200, { decimals: 2, locale: documentLocale(), currency: '€' }));

/** The summary column `render_receipt` prints, signed, in the order it prints it. */
const summaryRows = (d: PrintDocument) => [d.subtotal, d.tax_amount, d.discount ? -d.discount : undefined]
  .filter((x): x is number => typeof x === 'number');
const cents = (x: number) => Math.round(x * 100);

const papers = (sale: SaleRow, lines: SaleLineRow[]) => [
  ['simplified ticket', saleToPrintDocument(sale, lines, SETTINGS, {}, 'es', 'Mi negocio', tEs)],
  ['full invoice on the roll', saleToInvoicePrintDocument(sale, lines, SETTINGS, FISCAL, 'es', 'Mi negocio', tEs)],
] as const;

describe('sales#489 — the thermal paper summary adds up from top to bottom', () => {
  for (const [mode, sale, lines] of [['VAT included', INCL_SALE, INCL_LINES], ['net prices', EXCL_SALE, EXCL_LINES]] as const) {
    for (const [kind, doc] of papers(sale, lines)) {
      it(`${mode}, ${kind}: no discount row subtracted under a subtotal that already carries it`, () => {
        expect(doc.discount, 'the discount is already inside the subtotal').toBeUndefined();
        expect(cents(summaryRows(doc).reduce((a, b) => a + b, 0))).toBe(cents(doc.total));
      });

      it(`${mode}, ${kind}: the lines add up to the total too`, () => {
        expect(cents(doc.items.reduce((s, i) => s + Number(i.total), 0))).toBe(cents(doc.total));
      });

      it(`${mode}, ${kind}: the discount is still on the paper, as the invoice's informative note`, () => {
        expect(doc.receipt_footer).toBe(`${NOTE}\n${SETTINGS.receipt_footer}`);
      });
    }
  }

  it('a sale without a discount keeps its footer byte for byte, with no note', () => {
    const sale = { ...INCL_SALE, discount_amount: 0 };
    expect(saleToPrintDocument(sale, INCL_LINES, SETTINGS, {}, 'es', 'Mi negocio', tEs).receipt_footer).toBe(SETTINGS.receipt_footer);
    expect(saleToPrintDocument(sale, INCL_LINES, {}, {}, 'es', 'Mi negocio', tEs).receipt_footer).toBeUndefined();
  });

  it('with a discount and no business footer, the footer is just the note', () => {
    expect(saleToPrintDocument(INCL_SALE, INCL_LINES, {}, {}, 'es', 'Mi negocio', tEs).receipt_footer).toBe(NOTE);
  });
});
