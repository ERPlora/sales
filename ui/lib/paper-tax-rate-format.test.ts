// @vitest-environment happy-dom
// sales#477 — the tax summary of every paper Ventas prints writes its rate the way the paper's
// language writes a percentage, with the same OutfitKit helper as the rate of each line.
//
// A hub in Spanish printed the A4 invoice with «IVA 21%» and «RE 5.2%» in the tax summary — a dot
// and no space before «%» — while the amounts beside them read «2.500,00 €» and the lines of that
// same sheet read «21 %». Spanish writes «21 %», «5,2 %» (RAE; the invoice module does the same
// since invoice#141); English writes «21%», «5.2%».
//
// Only the words change: the amounts, the stored breakdown and what reaches the AEAT do not.
import { afterEach, describe, expect, it } from 'vitest';
import { saleToInvoice, saleToReceipt, orderToPrebill, type SaleRow, type SaleLineRow } from './document-mappers.js';
import { invoiceToPrintableHtml } from './invoice-html.js';

const NBSP = ' ';

/** Catalog stubs for the two words the label translates (sales#483 named the general tax too). */
const tEs = (k: string) => ({ 'ui.taxSurcharge': 'RE', 'ui.taxVat': 'IVA' })[k] ?? k;
const tEn = (k: string) => ({ 'ui.taxSurcharge': 'Surcharge', 'ui.taxVat': 'VAT' })[k] ?? k;

/** A sale with VAT 21 % plus the 5,2 % equivalence surcharge, marked as sales#54 stores it. */
const SALE: SaleRow = {
  id: 's1',
  sale_number: 'F2026-000012',
  subtotal: 250000,
  tax_amount: 65500,
  tax_breakdown:
    '{"21.00":{"base":250000,"tax":52500,"kind":"tax","label":"vat"},"5.20":{"base":250000,"tax":13000,"kind":"surcharge","label":"surcharge"}}',
  total: 315500,
  created_at: '2026-09-24T10:15:00Z',
} as SaleRow;

const LINES: SaleLineRow[] = [
  { product_name: 'Aceite', quantity: 1, unit_price: 250000, line_total: 250000, tax_rate: 21 } as SaleLineRow,
];

afterEach(() => {
  document.documentElement.lang = '';
});

describe('the tax rows of the paper write the rate in the paper language (sales#477)', () => {
  it('es: the A4 invoice summary reads «IVA 21 %» and «RE 5,2 %»', () => {
    const doc = saleToInvoice(SALE, LINES, {}, {}, 'es', undefined, tEs);
    expect(doc.taxes!.map((x) => x.label)).toEqual([`IVA 21${NBSP}%`, `RE 5,2${NBSP}%`]);
  });

  it('en: the A4 invoice summary reads «21%» and «5.2%»', () => {
    const doc = saleToInvoice(SALE, LINES, {}, {}, 'en', undefined, tEn);
    expect(doc.taxes!.map((x) => x.label)).toEqual(['VAT 21%', 'Surcharge 5.2%']);
  });

  it('es: the ticket (screen and thermal) carries the same label', () => {
    const r = saleToReceipt(SALE, LINES, {}, {}, 'es', undefined, tEs);
    expect(r.taxes!.map((x) => x.label)).toEqual([`IVA 21${NBSP}%`, `RE 5,2${NBSP}%`]);
  });

  it('en: the ticket reads «21%» and «5.2%»', () => {
    const r = saleToReceipt(SALE, LINES, {}, {}, 'en', undefined, tEn);
    expect(r.taxes!.map((x) => x.label)).toEqual(['VAT 21%', 'Surcharge 5.2%']);
  });

  it('a label the owner set on the rule keeps its words and gets the rate in the language', () => {
    const custom = SALE.tax_breakdown!.replace('"label":"surcharge"', '"label":"Rec. equiv."');
    const r = saleToReceipt({ ...SALE, tax_breakdown: custom }, LINES, {}, {}, 'es', undefined, tEs);
    expect(r.taxes!.map((x) => x.label)).toContain(`Rec. equiv. 5,2${NBSP}%`);
  });

  it('the bill before charging follows the locale it is given', () => {
    const lines = [{ name: 'Menú', price: 1100, qty: 1, tax_rate: 10 }];
    expect(orderToPrebill(lines, {}, { locale: 'es' }).taxes).toEqual([
      { label: `IVA 10${NBSP}%`, base: 1000, amount: 100 },
    ]);
    expect(orderToPrebill(lines, {}, { locale: 'en', t: tEn }).taxes).toEqual([
      { label: 'VAT 10%', base: 1000, amount: 100 },
    ]);
  });
});

describe('the printed A4 writes every rate on the sheet one way (sales#477)', () => {
  /** The printed paper, composed as `erp-sales-document.printableHtml()` does — without its
   *  `<style>`, whose `width: 100%` is CSS, not a rate anybody reads. */
  function paper(lang: 'es' | 'en'): string {
    document.documentElement.lang = lang;
    const html = invoiceToPrintableHtml(saleToInvoice(SALE, LINES, {}, {}, lang, undefined, lang === 'es' ? tEs : tEn));
    return html.replace(/<style>[\s\S]*?<\/style>/, '');
  }

  it('es: lines and summary both read «21 %» / «5,2 %», never «21%» or «5.2%»', () => {
    const html = paper('es');
    expect(html).toContain(`<td class="a">21${NBSP}%</td>`);
    expect(html).toContain(`IVA 21${NBSP}%`);
    expect(html).toContain(`RE 5,2${NBSP}%`);
    expect(html, 'no rate glued to «%»').not.toMatch(/\d%/);
    expect(html, 'no rate with a dot as decimal separator').not.toMatch(/\d\.\d\s?%/);
  });

  it('en: lines and summary both read «21%» / «5.2%», with no space before «%»', () => {
    const html = paper('en');
    expect(html).toContain('<td class="a">21%</td>');
    expect(html).toContain('VAT 21%');
    expect(html).toContain('Surcharge 5.2%');
    expect(html, 'no space between a rate and «%»').not.toMatch(/\d[\s ]%/);
  });
});
