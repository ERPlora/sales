// @vitest-environment happy-dom

// sales#188 / sales#183 — the DOCUMENT travels in MINOR UNITS (integers) and says its scale.
//
// `<ok-receipt>` / `<ok-invoice>` (outfitkit ≥ 0.1.48, ADR-0400) take money as integers in minor
// units plus `decimals`, and paint a float as «—». Until now the mappers divided at their door
// (`toEuros`) — a sixth layer holding money as floats against ADR-0123 — so with the new contract
// the bill on screen lost every amount (the two reds of `erp-pos-prebill-screen`). Now the row's
// cents go through untouched; the ONLY conversion left is the one the thermal renderer still needs
// (it formats `{:.2}` over euros, hub#1159), and it happens in `print-document.ts`, by name.
//
// Same door, sales#183: the menu's components and the line's supplements reach the screen as label
// LISTS (`components`, `modifiers`), one indented sub-line each; the objects the papers read move to
// `printed_modifiers`, because the same object feeds the screen and the two papers.
import { beforeEach, describe, expect, it } from 'vitest';
import { orderToPrebill, saleToInvoice, saleToReceipt, type PrebillLine, type SaleLineRow, type SaleRow } from './document-mappers';
import { prebillToPrintDocument, saleToPrintDocument } from './print-document';
import { receiptToPrintableHtml } from './receipt-html';

const SALE: SaleRow = {
  id: 's1', sale_number: 'T-1', subtotal: 327, tax_amount: 33,
  tax_breakdown: '{"10.00": {"base": 327, "tax": 33}}', total: 360,
  payment_method_name: 'Efectivo', amount_tendered: 500, change_due: 140,
  created_at: '2026-08-25T19:00:00Z',
};
const LINES: SaleLineRow[] = [{ product_name: 'Cafe solo', quantity: 2_000_000, unit_price: 180, line_total: 360 }];

const MENU: PrebillLine[] = [{
  id: 'm1', name: 'Menú del día', price: 1650, qty: 1,
  combo: { name: 'Menú del día', components: [{ name: 'Gazpacho' }, { name: 'Solomillo', price_delta: 300 }] },
  modifiers: [{ name: 'Al punto' }],
}];

beforeEach(() => {
  delete (globalThis as { erplora?: unknown }).erplora;
  document.documentElement.lang = 'es';
});

describe('the document carries integers in minor units and its scale (sales#188)', () => {
  it('saleToReceipt: the row cents go through untouched, plus decimals', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.decimals, 'the scale travels with the document').toBe(2);
    expect(r.lines[0]).toMatchObject({ unit_price: 180, total: 360 });
    expect(r.subtotal).toBe(327);
    expect(r.taxes?.[0]).toMatchObject({ base: 327, amount: 33 });
    expect(r.total).toBe(360);
    expect(r.payment).toMatchObject({ paid: 500, change: 140 });
    expect(Number.isInteger(r.lines[0].total) && Number.isInteger(r.total), 'no float anywhere').toBe(true);
  });

  it('saleToInvoice: same contract', () => {
    const inv = saleToInvoice({ ...SALE, discount_amount: 50 }, LINES);
    expect(inv.decimals).toBe(2);
    expect(inv.lines[0]).toMatchObject({ unit_price: 180, total: 360 });
    expect(inv).toMatchObject({ subtotal: 327, discount_total: 50, tax_total: 33, total: 360 });
    expect(inv.taxes[0]).toMatchObject({ base: 327, amount: 33 });
  });

  it('orderToPrebill: the bill sums cents and says its scale', () => {
    const doc = orderToPrebill([{ id: 'p1', name: 'Cerveza', price: 250, qty: 2 }, { id: 'p2', name: 'Tapa', price: 350, qty: 1 }], {});
    expect(doc.decimals).toBe(2);
    expect(doc.total).toBe(850);
    expect(doc.lines[0]).toMatchObject({ unit_price: 250, total: 500 });
  });

  it('the scale is the hub currency\'s, read from the SDK when it is there (JPY: 0)', () => {
    (globalThis as { erplora?: unknown }).erplora = { currencyDecimals: 0 };
    expect(saleToReceipt(SALE, LINES).decimals).toBe(0);
    expect(orderToPrebill([{ id: 'p1', name: 'Ramen', price: 1999, qty: 1 }], {}).decimals).toBe(0);
  });
});

describe('the menu on screen: label lists, objects for the papers (sales#183)', () => {
  it('orderToPrebill hands <ok-receipt> the components and supplements as composed labels', () => {
    const line = orderToPrebill(MENU, {}).lines[0];
    expect(line.components).toEqual(['Gazpacho', 'Solomillo (+3,00)']);
    expect(line.modifiers, 'labels, not objects: ok-receipt ignores objects').toEqual(['Al punto']);
    expect(line.printed_modifiers, 'the papers keep the objects under their own key').toEqual([{ name: 'Al punto' }]);
    expect(line.note, 'the thermal renderer still reads the one-line note').toBe('Gazpacho · Solomillo (+3,00) · Al punto');
  });

  it('a plain line grows no lists (byte-identical paper)', () => {
    const line = orderToPrebill([{ id: 'p1', name: 'Cerveza', price: 250, qty: 1 }], {}).lines[0];
    expect(line).not.toHaveProperty('components');
    expect(line).not.toHaveProperty('modifiers');
    expect(line).not.toHaveProperty('printed_modifiers');
    expect(line).not.toHaveProperty('note');
  });
});

describe('the HTML paper formats from cents with the document language', () => {
  it('es: «2 × 1,80 €», «3,60 €», tax and change; no float ever touched', () => {
    const html = receiptToPrintableHtml(saleToReceipt(SALE, LINES));
    expect(html).toContain('2 × 1,80 €');
    expect(html).toContain('3,60 €');
    expect(html).toContain('0,33 €');
    expect(html).toContain('1,40 €');
    expect(html).not.toContain('360 €');
  });

  it('en: point decimal', () => {
    document.documentElement.lang = 'en';
    expect(receiptToPrintableHtml(saleToReceipt(SALE, LINES))).toContain('3.60 €');
  });

  it('the supplements still print one sub-line each, from the objects', () => {
    const html = receiptToPrintableHtml(orderToPrebill(MENU, {}));
    expect(html).toContain('<div class="comp">Gazpacho</div>');
    expect(html).toContain('<div class="mod">Al punto</div>');
    expect(html).toContain('16,50 €');
  });
});

describe('the thermal printer keeps getting euros: the ONE conversion left, by name', () => {
  it('saleToPrintDocument divides by the document scale', () => {
    const doc = saleToPrintDocument(SALE, LINES);
    expect(doc.items[0].total).toBe(3.6);
    expect(doc).toMatchObject({ subtotal: 3.27, tax_amount: 0.33, total: 3.6, paid: 5, change: 1.4 });
  });

  it('prebillToPrintDocument too', () => {
    const doc = prebillToPrintDocument([{ id: 'p1', name: 'Cerveza', price: 250, qty: 2 }], {});
    expect(doc.items[0].total).toBe(5);
    expect(doc.total).toBe(5);
  });

  it('a 0-decimal currency is not divided', () => {
    (globalThis as { erplora?: unknown }).erplora = { currencyDecimals: 0 };
    const doc = prebillToPrintDocument([{ id: 'p1', name: 'Ramen', price: 1999, qty: 1 }], {});
    expect(doc.total).toBe(1999);
  });
});
