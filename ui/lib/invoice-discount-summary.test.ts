// @vitest-environment happy-dom
// sales#486 — the full invoice's summary has to add up from top to bottom.
//
// The ticket-wide discount is ALREADY prorated into the lines by the handler (sales#33): the sale's
// `subtotal` is the tax base AFTER the discount, and `discount_amount` is informative — measured on
// the base with net prices and on what the customer pays with the VAT inside (sales#295). The
// invoice used to hand it to `<ok-invoice>` as `discount_total`, which paints it as «−2,00 €»
// right under the «Base imponible»: «8,26 − 2,00 + 1,74» reads 8,00 € next to a 10,00 € total.
//
// Now the summary column only carries what adds up (tax base + taxes = total) and the discount
// travels as an informative note under it, in the currency of the document — on the screen
// (`<ok-invoice>`) and on the A4 paper (`invoiceToPrintableHtml`) alike.
import { describe, expect, it } from 'vitest';
import '@erplora/outfitkit/ok-invoice';
import { documentLocale, formatMinor } from '@erplora/outfitkit/ok-money';
import { invoiceLabels, saleToInvoice, type SaleLineRow, type SaleRow } from './document-mappers.js';
import { invoiceToPrintableHtml } from './invoice-html.js';
import en from '../../locales/en.json';
import es from '../../locales/es.json';

type Catalog = { ui: Record<string, string> };
const translator = (cat: Catalog) => (key: string) => cat.ui[key.replace(/^ui\./, '')] ?? key;
const tEn = translator(en as Catalog);
const tEs = translator(es as Catalog);

// Tax included: 2 × 6,00 € (VAT inside) = 12,00 €, 2,00 € off the ticket → 10,00 € charged, of
// which 8,26 € is the declared base and 1,74 € the VAT. `discount_amount` is the 2,00 € asked for.
const INCL_LINES: SaleLineRow[] = [{
  id: 'l-1', product_name: 'Café', quantity: 2_000_000, unit_price: 600, tax_rate: 21,
  net_amount: 826, tax_amount: 174, line_total: 1000,
}];
const INCL_SALE: SaleRow = {
  id: 's-1', sale_number: 'T-486', subtotal: 826, tax_amount: 174, total: 1000, discount_amount: 200,
  tax_breakdown: JSON.stringify({ '21.00': { base: 826, tax: 174, kind: 'tax' } }),
  payment_method_name: 'Efectivo', created_at: '2026-10-01T10:00:00Z',
};

// Net prices: 2 × 5,00 € = 10,00 € of base, 2,00 € off it → base 8,00 €, VAT 1,68 €, total 9,68 €.
const EXCL_LINES: SaleLineRow[] = [{
  id: 'l-1', product_name: 'Café', quantity: 2_000_000, unit_price: 500, tax_rate: 21,
  net_amount: 800, tax_amount: 168, line_total: 968,
}];
const EXCL_SALE: SaleRow = {
  ...INCL_SALE, subtotal: 800, tax_amount: 168, total: 968, discount_amount: 200,
  tax_breakdown: JSON.stringify({ '21.00': { base: 800, tax: 168, kind: 'tax' } }),
};

const money = (cents: number) => formatMinor(cents, { decimals: 2, locale: documentLocale(), currency: '€' });

/** The amounts of the rows `<ok-invoice>` paints in its summary, in order, signed. */
async function summaryOf(inv: ReturnType<typeof saleToInvoice>): Promise<{ text: string; rows: string[] }> {
  const el = document.createElement('ok-invoice') as HTMLElement & { invoice: unknown; updateComplete: Promise<unknown> };
  el.invoice = inv;
  document.body.appendChild(el);
  await el.updateComplete;
  const rows = [...el.shadowRoot!.querySelectorAll('.summary tr')].map((tr) => tr.textContent!.replace(/\s+/g, ' ').trim());
  const text = el.shadowRoot!.textContent!.replace(/\s+/g, ' ');
  el.remove();
  return { text, rows };
}

describe('sales#486 — the full invoice summary adds up from top to bottom', () => {
  for (const [mode, sale, lines] of [['VAT included', INCL_SALE, INCL_LINES], ['net prices', EXCL_SALE, EXCL_LINES]] as const) {
    it(`${mode}: the summary carries no discount row subtracted under the tax base`, () => {
      const inv = saleToInvoice(sale, [...lines], {}, {}, 'es', 'Mi negocio', tEs);
      expect(inv.discount_total, 'the discount is already inside the base: it is not a row of the sum').toBeUndefined();
      expect(inv.subtotal + inv.tax_total).toBe(inv.total);
    });

    it(`${mode}: the discount is still on the invoice, as an informative note with its amount`, () => {
      const inv = saleToInvoice(sale, [...lines], {}, {}, 'es', 'Mi negocio', tEs);
      expect(inv.notes).toBe(tEs('ui.docDiscountApplied').replace('{amount}', money(200)));
    });

    it(`${mode}: on screen, no summary row is negative and the note names the discount`, async () => {
      const { rows, text } = await summaryOf(saleToInvoice(sale, [...lines], {}, {}, 'es', 'Mi negocio', tEs));
      expect(rows.filter((r) => r.includes('−')), 'no «−discount» row inside the sum').toEqual([]);
      expect(rows).toHaveLength(3); // base · VAT 21 % · TOTAL
      expect(text).toContain(tEs('ui.docDiscountApplied').replace('{amount}', money(200)));
    });

    it(`${mode}: the A4 paper has no discount row in its summary and prints the note`, () => {
      // The paper as the viewer builds it (`printableHtml`): the screen's data + the catalog's words.
      const html = invoiceToPrintableHtml({ ...saleToInvoice(sale, [...lines], {}, {}, 'es', 'Mi negocio', tEs), labels: invoiceLabels(tEs) });
      const start = html.indexOf('<div class="summary">');
      const summary = html.slice(start, html.indexOf('</table></div>', start));
      expect(summary).not.toContain(tEs('ui.docDiscountTotal'));
      expect(summary, 'the 2,00 € is not an amount of the sum').not.toContain(money(200));
      expect(html).toContain(tEs('ui.docDiscountApplied').replace('{amount}', money(200)));
    });
  }

  it('a sale without a ticket discount carries no note', () => {
    const inv = saleToInvoice({ ...INCL_SALE, discount_amount: 0 }, INCL_LINES, {}, {}, 'es', 'Mi negocio', tEs);
    expect(inv.notes).toBeUndefined();
    expect(inv.discount_total).toBeUndefined();
  });

  it('the note is in the hub language: English source and its Spanish translation', () => {
    expect(en.ui.docDiscountApplied).toContain('{amount}');
    expect(es.ui.docDiscountApplied).toContain('{amount}');
    expect(es.ui.docDiscountApplied).not.toBe(en.ui.docDiscountApplied);
    const inv = saleToInvoice(INCL_SALE, INCL_LINES, {}, {}, 'en', 'My business', tEn);
    expect(inv.notes).toBe(en.ui.docDiscountApplied.replace('{amount}', money(200)));
  });

  it('the note uses the currency and scale of the document (KWD, 3 decimals)', () => {
    const g = globalThis as { erplora?: unknown };
    const before = g.erplora;
    g.erplora = { currencyDecimals: 3 }; // what the shell injects for a KWD hub (ADR-0123 §7)
    try {
      const inv = saleToInvoice({ ...INCL_SALE, discount_amount: 1500 }, INCL_LINES, { currency: 'KWD' }, {}, 'es', 'Mi negocio', tEs);
      expect(inv.decimals).toBe(3);
      expect(inv.notes).toContain(formatMinor(1500, { decimals: 3, locale: documentLocale(), currency: 'KWD' }));
    } finally {
      g.erplora = before;
    }
  });
});
