// refund-tender — which SALE lines the refund screen offers to an external tender, and how each
// one is told apart from its twin (sales#166 / ADR-0386).
//
// The mirror of `line-tender` on the other side of the counter. There, the till asks "does the
// voucher pay this line?"; here, the refund screen asks "does this line's session go back?". And
// the reason `sales` cannot answer either question itself is the same one: `is_covered` is OPAQUE
// by design (migration 025) — it says another tender already paid the line, never WHICH.
//
// 🔴 THE ORDINAL IS NOT DECORATION. A mother and her daughter get the same haircut on one ticket:
// two covered lines, same service, two redemptions. The filler can only look its sessions up by
// (sale, service) — a settled redemption keeps the ORDER line id in `line_ref`, and a sale item
// has no column pointing back at it — so without an ordinal both holes would claim the same
// session and the second one would find nothing to give back.
import { describe, expect, it } from 'vitest';
import { coveredLines, serviceOrdinals, type SaleLine } from './refund-tender';

const line = (over: Partial<SaleLine> = {}): SaleLine => ({
  id: 'item-1', product_id: 's-corte', product_name: 'Corte', is_covered: 1, ...over,
});

describe('coveredLines', () => {
  it('offers the slot on a line another tender already paid', () => {
    const l = line();
    expect(coveredLines([l])).toEqual([l]);
  });

  it('leaves out a line that was paid in money: there is no session behind it', () => {
    expect(coveredLines([line({ is_covered: 0 })])).toEqual([]);
  });

  it('accepts the flag as a boolean too: SQLite answers 1 and Postgres can answer true', () => {
    expect(coveredLines([line({ is_covered: true })])).toHaveLength(1);
    expect(coveredLines([line({ is_covered: false })])).toHaveLength(0);
  });

  it('leaves out a covered line with no `product_id`: the filler is handed a service id', () => {
    expect(coveredLines([line({ product_id: '' })])).toEqual([]);
  });

  it('keeps the order it was read in: the ordinal below is built on it', () => {
    const a = line({ id: 'item-1' });
    const b = line({ id: 'item-2' });
    expect(coveredLines([a, line({ id: 'item-x', is_covered: 0 }), b]).map((l) => l.id))
      .toEqual(['item-1', 'item-2']);
  });
});

describe('serviceOrdinals', () => {
  it('numbers the twins of the SAME service from zero, in read order', () => {
    const ord = serviceOrdinals([line({ id: 'item-1' }), line({ id: 'item-2' })]);
    expect(ord.get('item-1')).toBe(0);
    expect(ord.get('item-2')).toBe(1);
  });

  it('counts each service on its own, so a single line of a service is always 0', () => {
    const ord = serviceOrdinals([
      line({ id: 'item-1', product_id: 's-corte' }),
      line({ id: 'item-2', product_id: 's-color' }),
      line({ id: 'item-3', product_id: 's-corte' }),
    ]);
    expect([ord.get('item-1'), ord.get('item-2'), ord.get('item-3')]).toEqual([0, 0, 1]);
  });

  it('a line nobody asked about has no ordinal at all', () => {
    expect(serviceOrdinals([line()]).get('item-9')).toBeUndefined();
  });
});
