// sales#159 / ADR-0386 — the arithmetic of paying ONE sale with N ways of paying.
//
// It lives in lib, without DOM, because it is the part that must never be wrong: the remaining, the
// amount each leg covers, the change (which comes out of the CASH leg and is never prorated) and
// the payload the till hands to `sales.complete_sale`.
//
// The market failure being avoided is Shopify's: with 3+ tenders the flow jams because every leg
// has to be typed by hand («I could not exit the screen other than to mark the order as part
// paid»). Here a leg with nothing typed covers the WHOLE remaining, so the last one is a single
// tap — which is what makes three ways of paying survive a rush hour.
import { describe, expect, it } from 'vitest';
import {
  buildPaymentsPayload,
  changeDue,
  chargeBlock,
  planTender,
  remainingCents,
  tendersTotal,
  type Tender,
} from './split-tender.js';

const CASH = { id: 'pm-cash', name: 'Cash', type: 'cash', requires_change: 1 };
const CARD = { id: 'pm-card', name: 'Card', type: 'card', requires_change: 0 };
const BIZUM = { id: 'pm-bizum', name: 'Bizum', type: 'mobile', requires_change: 0 };

const leg = (method: typeof CASH, amount: number, tendered = amount): Tender =>
  ({ id: `t-${method.id}-${amount}`, method, amount, tendered });

describe('remaining', () => {
  it('with no legs, the whole payable is still owed', () => {
    expect(remainingCents(12100, [])).toBe(12100);
    expect(tendersTotal([])).toBe(0);
  });

  it('drops leg by leg and lands exactly on zero', () => {
    const card = leg(CARD, 5000);
    expect(remainingCents(12100, [card])).toBe(7100);
    expect(remainingCents(12100, [card, leg(CASH, 7100, 9000)])).toBe(0);
  });

  it('never goes negative: a leg cannot cover more than what is owed', () => {
    // `planTender` caps every leg at the remaining, so this is belt AND braces.
    expect(remainingCents(1000, [leg(CARD, 1000), leg(CARD, 1000)])).toBe(0);
  });
});

describe('planTender — what a new leg covers', () => {
  it('nothing typed covers the WHOLE remaining (the one-tap last leg)', () => {
    expect(planTender(CARD, 0, 7100)).toEqual({ amount: 7100, tendered: 7100 });
    expect(planTender(CASH, 0, 7100)).toEqual({ amount: 7100, tendered: 7100 });
  });

  it('a partial amount typed covers only that, and the rest stays owed', () => {
    expect(planTender(CARD, 5000, 12100)).toEqual({ amount: 5000, tendered: 5000 });
  });

  it('CASH over the remaining pays the remaining and the excess is CHANGE', () => {
    expect(planTender(CASH, 9000, 7100)).toEqual({ amount: 7100, tendered: 9000 });
  });

  it('a NON-cash leg is capped at the remaining: overpaying by card does not exist', () => {
    expect(planTender(CARD, 9000, 7100)).toEqual({ amount: 7100, tendered: 7100 });
    expect(planTender(BIZUM, 9000, 7100)).toEqual({ amount: 7100, tendered: 7100 });
  });

  it('nothing left to cover means there is no leg to add', () => {
    expect(planTender(CASH, 500, 0)).toBeUndefined();
    expect(planTender(CASH, 500, -100)).toBeUndefined();
  });

  it('without a method there is no leg: the server would refuse it anyway', () => {
    expect(planTender(undefined, 0, 7100)).toBeUndefined();
  });
});

describe('change — it comes out of the CASH leg, never prorated (ADR-0386 decision 2)', () => {
  it('is the excess handed over in cash', () => {
    expect(changeDue([leg(CARD, 5000), leg(CASH, 7100, 9000)])).toBe(1900);
  });

  it('is zero when there is no cash leg, however the legs are shaped', () => {
    expect(changeDue([leg(CARD, 5000), leg(BIZUM, 7100)])).toBe(0);
  });

  it('is zero when the cash leg was handed the exact amount', () => {
    expect(changeDue([leg(CASH, 7100)])).toBe(0);
  });
});

describe('the payload handed to sales.complete_sale', () => {
  it('is one leg per tender, IN ORDER, in cents', () => {
    expect(buildPaymentsPayload([leg(CARD, 5000), leg(CASH, 7100, 9000)])).toEqual([
      { payment_method_id: 'pm-card', amount: 5000 },
      { payment_method_id: 'pm-cash', amount: 7100, amount_tendered: 9000 },
    ]);
  });

  it('omits amount_tendered when it equals the amount (the server defaults to exact)', () => {
    expect(buildPaymentsPayload([leg(CASH, 7100)])).toEqual([
      { payment_method_id: 'pm-cash', amount: 7100 },
    ]);
  });

  it('drops legs that cover nothing: a zero leg is a row that means nothing', () => {
    expect(buildPaymentsPayload([leg(CARD, 0), leg(CASH, 7100)])).toEqual([
      { payment_method_id: 'pm-cash', amount: 7100 },
    ]);
  });
});

describe('chargeBlock — WHY the charge cannot go through yet', () => {
  it('names the amount still owed, so the reason is a number and not «you cannot»', () => {
    expect(chargeBlock(12100, [leg(CARD, 5000)])).toEqual({ reason: 'remaining', remaining: 7100 });
  });

  it('clears the moment the legs cover the total to the cent', () => {
    expect(chargeBlock(12100, [leg(CARD, 5000), leg(CASH, 7100, 9000)])).toBeUndefined();
  });

  it('does not block a sale that has no legs at all: that is the single-tender flow', () => {
    expect(chargeBlock(12100, [])).toBeUndefined();
  });
});
