// sales#156 — the line note ON PAPER (screen, HTML and thermal).
//
// The note reaches the kitchen through the row. What it must not do is stop there: the bill the
// waiter carries to the table and the ticket the customer keeps are built from the same lines, and
// a paper that says less than the kitchen ticket did is exactly the failure sales#148 fixed for
// the supplements — written, charged and unreadable.
//
// All four surfaces compose the sub-line through ONE function (`paperNote`), so these tests pin
// the composer and then each door that consumes it.

import { describe, expect, it } from 'vitest';
import { orderToPrebill, paperNote, saleToReceipt, type SaleLineRow } from './document-mappers';
import { prebillJobId, prebillToPrintDocument, saleToPrintDocument } from './print-document';
import { receiptToPrintableHtml } from './receipt-html';

const saleRow = { id: 's-1', sale_number: '20260826-0001', total: 900 };

const saleLine = (over: Partial<SaleLineRow> = {}): SaleLineRow => ({
  product_name: 'Steak', quantity: 1_000_000, unit_price: 900, line_total: 900, ...over,
});

describe('paperNote — one composer for the four doors', () => {
  it('the note on its own', () => {
    expect(paperNote(undefined, undefined, 'medium rare')).toBe('medium rare');
  });

  it('after the supplements, which ARE the line', () => {
    // A menu's components and the supplements DESCRIBE the item; the note is an instruction about
    // it. That is the order it is read in, and the order that leaves the paper of a line without a
    // note byte for byte as it was.
    const mods = [{ option_id: 'o-1', name: 'no onion' }];
    expect(paperNote(undefined, mods, 'medium rare')).toBe('no onion · medium rare');
  });

  it('with nothing to say there is no sub-line', () => {
    expect(paperNote(undefined, undefined, '')).toBeUndefined();
    expect(paperNote(undefined, undefined, '   ')).toBeUndefined();
  });

  it('and a line without a note still composes what it always did', () => {
    expect(paperNote(undefined, [{ option_id: 'o-1', name: 'no onion' }])).toBe('no onion');
  });
});

describe('the charged TICKET and its reprint', () => {
  it('paint the note under its line', () => {
    const doc = saleToReceipt(saleRow, [saleLine({ notes: 'medium rare' })]);
    expect(doc.lines[0].note).toBe('medium rare');
  });

  it('the thermal one sends it under the `notes` key, the one the renderer ALREADY reads', () => {
    // `render_receipt` prints `  > {notes}` indented under its item. A new key would not fail: it
    // would print NOTHING, in silence, which is the failure of sales#78.
    const doc = saleToPrintDocument(saleRow, [saleLine({ notes: 'medium rare' })]);
    expect(doc.items[0].notes).toBe('medium rare');
  });

  it('and the HTML paper paints it as a sub-line of the product', () => {
    const html = receiptToPrintableHtml(saleToReceipt(saleRow, [saleLine({ notes: 'medium rare' })]));
    expect(html).toContain('medium rare');
  });

  it('a line WITHOUT a note gains no field at all', () => {
    // The control: 100 % of the tickets that carry no note come out exactly as they came out.
    const doc = saleToReceipt(saleRow, [saleLine()]);
    expect(doc.lines[0].note).toBeUndefined();
    expect(saleToPrintDocument(saleRow, [saleLine()]).items[0].notes).toBeUndefined();
  });
});

describe('the BILL taken to the table', () => {
  it('carries the note of every line', () => {
    const lines = [{ name: 'Steak', price: 900, qty: 1, note: 'medium rare' }];
    expect(orderToPrebill(lines).lines[0].note).toBe('medium rare');
    expect(prebillToPrintDocument(lines).items[0].notes).toBe('medium rare');
  });

  it('and changing the note is a CORRECTED bill, with a job of its own', () => {
    // The print queue dedupes by `(hub_id, job_id)` with `ON CONFLICT DO NOTHING`: if the
    // fingerprint does not change, the waiter corrects the note, prints again and NO PAPER COMES
    // OUT — no error, no warning, with the customer waiting. Same silent failure sales#148 closed
    // for the supplements, through the other door.
    const before = prebillJobId('ord-1', [{ name: 'Steak', price: 900, qty: 1, note: 'medium rare' }]);
    const after = prebillJobId('ord-1', [{ name: 'Steak', price: 900, qty: 1, note: 'well done' }]);
    expect(before).not.toBe(after);
  });

  it('but a bill that did NOT change keeps its fingerprint', () => {
    // Or every retry would print a second copy.
    const l = [{ name: 'Steak', price: 900, qty: 1, note: 'medium rare' }];
    expect(prebillJobId('ord-1', l)).toBe(prebillJobId('ord-1', [{ ...l[0] }]));
  });

  it('and a line without a note hashes as it did before this issue', () => {
    expect(prebillJobId('ord-1', [{ name: 'Steak', price: 900, qty: 1 }]))
      .toBe(prebillJobId('ord-1', [{ name: 'Steak', price: 900, qty: 1, note: '' }]));
  });
});
