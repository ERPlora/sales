// The contract of the paper — the shape the thermal printer actually reads (sales#78 / sales#79).
//
// There are two documents with the same content and different shapes, and mixing them up is the
// whole bug this file pins down:
//
//   - `ReceiptData` (document-mappers.ts) — what `<ok-receipt>` paints on SCREEN and in the HTML
//     fallback: `business.name`, `lines[]`, money already formatted for a human.
//   - `PrintDocument` (this file) — what `escpos::render_document` reads: `business_name`,
//     `items[{name, quantity, total}]`, plain euros. It reads BY KEY, so a document in the other
//     shape does not error: it renders every default and prints «ERPlora», no lines, TOTAL 0.00.
//
// A blank ticket that looks printed is worse than one that never prints, so the shape is pinned
// here, key by key, against the renderer's field names.
import { describe, expect, it } from 'vitest';
import { orderToPrebill } from './document-mappers.js';
import { prebillToPrintDocument, saleToPrintDocument, prebillJobId } from './print-document.js';

const SETTINGS = { receipt_header: 'Bar Manolo\nCalle Mayor 3, Madrid', receipt_footer: 'Gracias' };

/** Two coffees and a beer, in cents, as the cart holds them. */
const CART = [
  { name: 'Café solo', price: 120, qty: 2 },
  { name: 'Caña', price: 250, qty: 1 },
];

describe('prebillToPrintDocument — the bill taken to the table', () => {
  it('uses the field names the ESC/POS renderer reads, not the ones the screen reads', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, { tableLabel: 'Mesa 4' });

    // What the renderer looks up (crates/peripherals/src/escpos.rs, render_prebill).
    expect(doc.business_name, 'first line of receipt_header').toBe('Bar Manolo');
    expect(doc.business_address, 'the rest of receipt_header').toBe('Calle Mayor 3, Madrid');
    expect(doc.customer_name, 'the table goes where the renderer prints «Mesa/Cliente»').toBe('Mesa 4');
    expect(Array.isArray(doc.items), '`items`, not `lines`').toBe(true);

    // And NOT the screen's shape: these keys would make the renderer print all its defaults.
    expect((doc as Record<string, unknown>).lines, 'no `lines`').toBeUndefined();
    expect((doc as Record<string, unknown>).business, 'no nested `business`').toBeUndefined();
  });

  it('money travels in euros as numbers: the renderer formats `{total:.2}` itself', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, {});

    expect(doc.items[0], 'the line, in euros').toMatchObject({ name: 'Café solo', quantity: 2, total: 2.4 });
    expect(doc.total, '2×1,20 + 2,50').toBe(4.9);
    expect(typeof doc.total, 'a number — a string would render as 0.00').toBe('number');
  });

  it('a comped line is named as such and adds nothing to the bill', () => {
    const doc = prebillToPrintDocument([...CART, { name: 'Chupito', price: 200, qty: 1, is_gift: true }], SETTINGS, {});

    expect(doc.items[2].name, 'the customer must read why it is free').toContain('invitación');
    expect(doc.items[2].total, 'a comp is charged at zero').toBe(0);
    expect(doc.total, 'and does not move the total').toBe(4.9);
  });

  it('carries the «this is not an invoice» notice and NO fiscal marks (ADR-0141)', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, { notice: 'Cuenta — no es una factura.' });

    expect(doc.notice, 'the notice is printed, not implied').toBe('Cuenta — no es una factura.');
    // The fiscal number is consumed when CHARGING. A bill that carries one looks like an invoice
    // and is not one, which is a legal problem rather than a cosmetic one.
    expect(doc.receipt_id, 'no series number').toBeUndefined();
    expect(doc.payment_method, 'nothing has been paid yet').toBeUndefined();
    expect((doc as Record<string, unknown>).qr, 'no VeriFactu QR').toBeUndefined();
  });

  it('says on paper exactly what the modal showed on screen', () => {
    // The waiter reads the screen and the customer reads the paper. If these two mappers ever
    // disagree on a name, a quantity or a total, one of the two people is being lied to.
    const screen = orderToPrebill(CART, SETTINGS, { tableLabel: 'Mesa 4' });
    const paper = prebillToPrintDocument(CART, SETTINGS, { tableLabel: 'Mesa 4' });

    expect(paper.items.map((i) => i.name)).toEqual(screen.lines.map((l) => l.name));
    expect(paper.items.map((i) => i.quantity)).toEqual(screen.lines.map((l) => l.qty));
    expect(paper.items.map((i) => i.total)).toEqual(screen.lines.map((l) => l.total));
    expect(paper.total).toBe(screen.total);
  });

  it('falls back to a business name instead of printing a nameless bill', () => {
    const doc = prebillToPrintDocument(CART, {}, { fallbackName: 'Mi negocio' });
    expect(doc.business_name).toBe('Mi negocio');
  });
});

describe('prebillJobId — idempotency that still allows a second round', () => {
  it('is stable for the same bill: pressing print twice is one job, not two tickets', () => {
    expect(prebillJobId('order-1', CART)).toBe(prebillJobId('order-1', CART));
  });

  it('CHANGES when the bill changes, or the queue would swallow the reprint as a duplicate', () => {
    const after = [...CART, { name: 'Postre', price: 450, qty: 1 }];
    expect(prebillJobId('order-1', after)).not.toBe(prebillJobId('order-1', CART));
  });

  it('changes when only the quantity changes — same lines, different bill', () => {
    const more = [{ ...CART[0], qty: 3 }, CART[1]];
    expect(prebillJobId('order-1', more)).not.toBe(prebillJobId('order-1', CART));
  });

  it('is scoped to the order: two tables printing the same items are two jobs', () => {
    expect(prebillJobId('order-1', CART)).not.toBe(prebillJobId('order-2', CART));
  });

  it('names itself so a queued job can be recognised', () => {
    expect(prebillJobId('order-1', CART)).toMatch(/^prebill-order-1-/);
  });
});

describe('saleToPrintDocument — the ticket, reprinted', () => {
  const SALE = {
    id: 'sale-1',
    sale_number: 'T-000123',
    subtotal: 405,
    tax_amount: 85,
    total: 490,
    payment_method_name: 'Efectivo',
    amount_tendered: 500,
    change_due: 10,
    customer_name: 'Ana',
  };
  const LINES = [
    { product_name: 'Café solo', quantity: 2, unit_price: 120, line_total: 240 },
    { product_name: 'Caña', quantity: 1, unit_price: 250, line_total: 250 },
  ];

  it('is not empty: the reprint used to send `{}` and the printer rendered every default', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS);

    expect(doc.business_name).toBe('Bar Manolo');
    expect(doc.receipt_id, 'the ticket number the customer holds').toBe('T-000123');
    expect(doc.items, 'the lines that were sold').toHaveLength(2);
    expect(doc.total, 'cents on the row, euros on the paper').toBe(4.9);
  });

  it('carries what a paid ticket carries: totals, tax, payment and change', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS);

    expect(doc.subtotal).toBe(4.05);
    expect(doc.tax_amount).toBe(0.85);
    expect(doc.payment_method).toBe('Efectivo');
    expect(doc.paid).toBe(5);
    expect(doc.change).toBe(0.1);
    expect(doc.receipt_footer).toBe('Gracias');
    expect(doc.customer_name).toBe('Ana');
  });

  it('carries the fiscal marks the screen carries: official number, NIF and the VeriFactu QR', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS, {
      number: 'F2026/0007',
      issuer_nif: 'B12345678',
      qr: 'https://prewww2.aeat.es/...',
    });

    expect(doc.receipt_id, 'the official number is the one the customer must be able to quote').toBe('F2026/0007');
    expect(doc.vat_number).toBe('B12345678');
    // `qr_data` is the field the renderer looks up. Reprinting a fiscal ticket without its QR
    // would hand the customer a paper that cannot be checked against the AEAT.
    expect(doc.qr_data).toBe('https://prewww2.aeat.es/...');
    // The name stays the merchant's ticket branding: `receipt_header` wins over the issuer of
    // record on a receipt (document-mappers, sales#32). Paper and screen must say the same thing.
    expect(doc.business_name).toBe('Bar Manolo');
  });

  it('a comped line is named and charged at zero here too', () => {
    const doc = saleToPrintDocument(SALE, [...LINES, { product_name: 'Chupito', quantity: 1, unit_price: 200, line_total: 0, is_gift: 1 }], SETTINGS);
    expect(doc.items[2].name).toContain('Invitación');
    expect(doc.items[2].total).toBe(0);
  });
  it('the payment method is translated on the paper too (sales#108)', () => {
    const t = (k: string) => (k === 'ui.cash' ? 'Efectivo' : k);
    const doc = saleToPrintDocument({ ...SALE, payment_method_name: 'Cash' }, LINES, SETTINGS, {}, 'es', undefined, t);
    expect(doc.payment_method).toBe('Efectivo');
  });
});
