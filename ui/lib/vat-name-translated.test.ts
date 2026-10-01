// @vitest-environment happy-dom
// sales#483 — with the hub in English, every paper Ventas prints called the general tax «IVA» in
// its summary («IVA 21%») while the rest of the sheet was English («Tax base», «Surcharge 5.2%»,
// «TOTAL»). The surcharge was already a catalog word; the general tax was a constant.
//
// The name is now a catalog word too (`ui.taxVat`: en «VAT», es «IVA»), on every paper that writes
// the summary: the A4 invoice, the ticket (screen and thermal), the full invoice on the thermal
// printer and the bill before charging. A name the owner set on the rule still wins verbatim.
//
// The thermal printer writes its OWN words (the tax row of a simplified ticket, «TOTAL», «Change»…)
// in the language the document carries (`locale`, read by the hub's renderer — hub#1159/#1803).
// Ventas sent no `locale`, so an English hub got them in Spanish: «IVA» under an English ticket.
//
// The catalogs are the REAL ones: a stub would prove the code asks for a key, not that the key
// says «VAT» to an English customer.
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import { saleToInvoice, saleToReceipt, orderToPrebill, type SaleRow, type SaleLineRow } from './document-mappers.js';
import { prebillToPrintDocument, saleToInvoicePrintDocument, saleToPrintDocument } from './print-document.js';

const NBSP = ' ';
const CATALOGS = { en, es } as const;
type Lang = keyof typeof CATALOGS;

/** `erplora().t` over the module's real catalog: the key itself when it is missing, like the SDK. */
function translator(lang: Lang) {
  return (key: string): string => {
    const word = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], CATALOGS[lang]);
    return typeof word === 'string' ? word : key;
  };
}

/** VAT 21 % plus the 5,2 % equivalence surcharge, marked as sales#54 stores it. */
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

const BILL_LINES = [{ name: 'Menú', price: 1100, qty: 1, tax_rate: 10 }];

describe('the catalog names the general tax in both languages (sales#483)', () => {
  it('en says «VAT», es says «IVA»', () => {
    expect(translator('en')('ui.taxVat')).toBe('VAT');
    expect(translator('es')('ui.taxVat')).toBe('IVA');
  });
});

describe('the tax summary names the general tax in the paper language (sales#483)', () => {
  it('en: the A4 invoice reads «VAT 21%» beside «Surcharge 5.2%»', () => {
    const doc = saleToInvoice(SALE, LINES, {}, {}, 'en', undefined, translator('en'));
    expect(doc.taxes!.map((x) => x.label)).toEqual(['VAT 21%', 'Surcharge 5.2%']);
  });

  it('es: the A4 invoice still reads «IVA 21 %» beside «RE 5,2 %»', () => {
    const doc = saleToInvoice(SALE, LINES, {}, {}, 'es', undefined, translator('es'));
    expect(doc.taxes!.map((x) => x.label)).toEqual([`IVA 21${NBSP}%`, `RE 5,2${NBSP}%`]);
  });

  it('en: the ticket (screen and thermal) reads «VAT 21%»', () => {
    const r = saleToReceipt(SALE, LINES, {}, {}, 'en', undefined, translator('en'));
    expect(r.taxes!.map((x) => x.label)).toEqual(['VAT 21%', 'Surcharge 5.2%']);
  });

  it('es: the ticket still reads «IVA 21 %»', () => {
    const r = saleToReceipt(SALE, LINES, {}, {}, 'es', undefined, translator('es'));
    expect(r.taxes!.map((x) => x.label)).toEqual([`IVA 21${NBSP}%`, `RE 5,2${NBSP}%`]);
  });

  it('en: the full invoice sent to the thermal printer names each breakdown row «VAT»', () => {
    const doc = saleToInvoicePrintDocument(SALE, LINES, {}, {}, 'en', undefined, translator('en'));
    expect(doc.tax_breakdown!.map((x) => x.label)).toEqual(['VAT 21%', 'Surcharge 5.2%']);
  });

  it('a name the owner set on the rule keeps its words in either language', () => {
    const custom = SALE.tax_breakdown!.replace('"label":"vat"', '"label":"IGIC"');
    const r = saleToReceipt({ ...SALE, tax_breakdown: custom }, LINES, {}, {}, 'en', undefined, translator('en'));
    expect(r.taxes!.map((x) => x.label)).toEqual(['IGIC 21%', 'Surcharge 5.2%']);
  });
});

describe('the bill before charging names the general tax in the paper language (sales#483)', () => {
  it('en: «VAT 10%» on screen and as the thermal tax label', () => {
    const opts = { locale: 'en', t: translator('en') };
    expect(orderToPrebill(BILL_LINES, {}, opts).taxes).toEqual([{ label: 'VAT 10%', base: 1000, amount: 100 }]);
    expect(prebillToPrintDocument(BILL_LINES, {}, opts).tax_label).toBe('VAT 10%');
  });

  it('es: «IVA 10 %» on screen and as the thermal tax label', () => {
    const opts = { locale: 'es', t: translator('es') };
    expect(orderToPrebill(BILL_LINES, {}, opts).taxes).toEqual([{ label: `IVA 10${NBSP}%`, base: 1000, amount: 100 }]);
    expect(prebillToPrintDocument(BILL_LINES, {}, opts).tax_label).toBe(`IVA 10${NBSP}%`);
  });
});

describe('the thermal paper tells the printer its language (sales#483)', () => {
  it('the ticket carries the hub language, so the printer names the tax «VAT» in English', () => {
    expect(saleToPrintDocument(SALE, LINES, {}, {}, 'en', undefined, translator('en')).locale).toBe('en');
    expect(saleToPrintDocument(SALE, LINES, {}, {}, 'es', undefined, translator('es')).locale).toBe('es');
  });

  it('the full invoice carries it too', () => {
    expect(saleToInvoicePrintDocument(SALE, LINES, {}, {}, 'en', undefined, translator('en')).locale).toBe('en');
  });

  it('the bill carries it too', () => {
    expect(prebillToPrintDocument(BILL_LINES, {}, { locale: 'en', t: translator('en') }).locale).toBe('en');
    expect(prebillToPrintDocument(BILL_LINES, {}, { locale: 'es', t: translator('es') }).locale).toBe('es');
  });
});
