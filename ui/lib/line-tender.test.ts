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
// the daughter and the neighbour on one visit. So a line of more than one is not offered, and the
// screen says why instead of silently skipping it.
import { describe, expect, it } from 'vitest';
import type { CartLine } from './pos-cart';
import { tenderableLines, uncoveredLines, coverableLine } from './line-tender';

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

  it('KEEPS a line of more than one, because the screen has to say why it cannot be redeemed', () => {
    const l = line({ qty: 3 });
    expect(tenderableLines([l])).toEqual([l]);
    expect(coverableLine(l), 'one hold spends one session: three haircuts would be a giveaway').toBe(false);
    expect(coverableLine(line())).toBe(true);
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
