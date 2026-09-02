// line-tender — which cart lines an EXTERNAL per-line tender may be offered on, and what is left
// to charge in money once it covered them (sales#162 / ADR-0386).
//
// `sales` hosts a slot; it never learns what a voucher is. What it does know is arithmetic: a line
// that somebody else already paid must not be charged again, and the rest of the ticket has to be
// charged exactly as before.
//
// 🔴 THE QUANTITY RULE IS NOT COSMETIC. A redemption covers ONE line and spends ONE session
// (`services` enforces one redemption per `(checkout_ref, line_ref)` in a unique index). A line of
// «Corte × 3» covered by a single hold would hand out three haircuts for one session — the mother,
// the daughter and the neighbour on one visit. So a line of more than one is never offered to the
// slot; what the screen offers instead is to SPLIT it (ADR-0422), because the unit a session buys
// is the line.
import { describe, expect, it } from 'vitest';
import type { CartLine } from './pos-cart';
import {
  tenderableLines, uncoveredLines, coverableLine, splitCount, linePart, MAX_LINE_SPLIT,
} from './line-tender';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: 's-corte', name: 'Corte', price: 1800, qty: 1, line_id: 'line-1', is_service: true, ...over,
});

describe('tenderableLines', () => {
  it('offers the slot on a service line backed by an order row', () => {
    const l = line();
    expect(tenderableLines([l])).toEqual([l]);
  });

  it('leaves out a plain product: the slot contract is per SERVICE line', () => {
    expect(tenderableLines([line({ id: 'p-champu', is_service: undefined })])).toEqual([]);
  });

  it('leaves out a line with no `line_id`: there is no stable line ref to hold against', () => {
    expect(tenderableLines([line({ line_id: undefined })])).toEqual([]);
  });

  it('leaves out a comp: an invitation costs nothing, so there is nothing to cover', () => {
    expect(tenderableLines([line({ is_gift: true })])).toEqual([]);
  });

  it('leaves out a line worth nothing', () => {
    expect(tenderableLines([line({ price: 0 })])).toEqual([]);
  });

  it('KEEPS a line of more than one, because the screen has to offer to split it', () => {
    const l = line({ qty: 3 });
    expect(tenderableLines([l])).toEqual([l]);
    expect(coverableLine(l), 'one hold spends one session: three haircuts would be a giveaway').toBe(false);
    expect(coverableLine(line())).toBe(true);
  });
});

// ── ADR-0422 · the unit a session buys is the LINE, so the line is what gets split ────────────
//
// Market, 12 verified references: nowhere does a quantity > 1 of a service exist as a redeemable
// unit. Phorest adds the service again, Boulevard is one voucher per service, Zanda links one
// session to one invoice item. Where a quantity field does exist (Zenoti, Simple Salon) it is
// manual and explicit. So «Corte × 2» becomes two lines of one and each gets its own slot.
describe('splitCount (ADR-0422)', () => {
  it('turns a line of two into two lines of one', () => {
    expect(splitCount(line({ qty: 2 }))).toBe(2);
    expect(splitCount(line({ qty: 3 }))).toBe(3);
  });

  it('has nothing to split on a line of one — that line is already coverable', () => {
    expect(splitCount(line())).toBe(0);
    expect(coverableLine(line())).toBe(true);
  });

  it('cannot split a fraction: half a haircut is not a line of one', () => {
    expect(splitCount(line({ qty: 0.5 }))).toBe(0);
    expect(splitCount(line({ qty: 2.5 }))).toBe(0);
  });

  it('cannot split a line already fired to production: the SQL will not touch it', () => {
    // `order_update_line.sql` carries `fired_at IS NULL`, so the source row would keep its
    // quantity while the clones went in — the check would grow by N units of money nobody added.
    expect(splitCount(line({ qty: 2, fired_at: '2026-09-02T10:00:00Z' }))).toBe(0);
  });

  it('stops at the cap: the host mints a finite batch of ids per command', () => {
    expect(splitCount(line({ qty: MAX_LINE_SPLIT }))).toBe(MAX_LINE_SPLIT);
    expect(splitCount(line({ qty: MAX_LINE_SPLIT + 1 }))).toBe(0);
  });

  it('leaves a comp alone: an invitation costs nothing, so no session covers it', () => {
    expect(splitCount(line({ qty: 2, is_gift: true }))).toBe(0);
  });
});

// The Shopify lesson (community.shopify.dev): splitting the cart line is the right behaviour, and
// it reads as a bug when nothing marks it. «Corte de señora 1/2» is what tells the cashier that the
// two rows are the two haircuts she rang up, not a double charge.
describe('linePart — the split is LABELLED', () => {
  const first = line({ line_id: 'line-1' });
  const second = line({ line_id: 'line-2' });
  const champu = line({ id: 'p-champu', name: 'Champú', price: 900, line_id: 'line-3' });

  it('numbers the siblings a split produced', () => {
    const lines = [first, second, champu];
    expect(linePart(lines, first)).toEqual({ part: 1, of: 2 });
    expect(linePart(lines, second)).toEqual({ part: 2, of: 2 });
  });

  it('says nothing about a line that has no twin', () => {
    expect(linePart([first, champu], first)).toBeUndefined();
    expect(linePart([first, second, champu], champu)).toBeUndefined();
  });

  it('does not pair up the same service at two different prices', () => {
    const discounted = line({ line_id: 'line-2', price: 900 });
    expect(linePart([first, discounted], first)).toBeUndefined();
  });

  it('says nothing about a line that is not in the list', () => {
    expect(linePart([champu], first)).toBeUndefined();
  });
});

describe('uncoveredLines', () => {
  const corte = line();
  const champu = line({ id: 'p-champu', name: 'Champú', price: 900, line_id: 'line-2', is_service: undefined });

  it('drops the lines an external tender already covered', () => {
    expect(uncoveredLines([corte, champu], new Set(['line-1']))).toEqual([champu]);
  });

  it('changes nothing when nothing is covered', () => {
    expect(uncoveredLines([corte, champu], new Set())).toEqual([corte, champu]);
  });

  it('a covered id that is no longer in the cart cannot subtract anything', () => {
    expect(uncoveredLines([champu], new Set(['line-1']))).toEqual([champu]);
  });
});
