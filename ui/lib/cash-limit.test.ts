// sales#498 — the till REFLECTS the legal cash limit the server enforces (`sales.cash_limit_exceeded`).
//
// The figure is never written here: it arrives as `cash_limit` in the answer of
// `sales.checkout.preview`, the same function that charges. `null`/absent = the hub's country sets
// no limit (or the hub predates the field), and then the till blocks nothing: the server stays the
// last word either way.
import { describe, expect, it } from 'vitest';
import { cashBlocksCharge, cashOverLimit } from './cash-limit';

const CASH = { type: 'cash' };
const CARD = { type: 'card' };

describe('cashOverLimit — is cash out of the question for this amount?', () => {
  it('is false just below the limit and true AT the limit (the law says «1.000 € or more»)', () => {
    expect(cashOverLimit(100_000, 99_999)).toBe(false);
    expect(cashOverLimit(100_000, 100_000)).toBe(true);
    expect(cashOverLimit(100_000, 250_000)).toBe(true);
  });

  it('a hub with no limit (or a preview without the field) never blocks cash', () => {
    expect(cashOverLimit(null, 10_000_000)).toBe(false);
    expect(cashOverLimit(undefined, 10_000_000)).toBe(false);
  });
});

describe('cashBlocksCharge — would THIS charge carry cash over the limit?', () => {
  it('a single cash tender over the limit blocks; the same amount by card does not', () => {
    expect(cashBlocksCharge({ limit: 100_000, payable: 100_000, method: CASH, tenders: [], splitting: false })).toBe(true);
    expect(cashBlocksCharge({ limit: 100_000, payable: 100_000, method: CARD, tenders: [], splitting: false })).toBe(false);
  });

  it('a mixed payment with ANY cash leg blocks: the cash part counts against the whole operation', () => {
    expect(cashBlocksCharge({
      limit: 100_000, payable: 100_000, method: CARD, splitting: true,
      tenders: [{ method: CARD }, { method: CASH }],
    })).toBe(true);
  });

  it('while splitting, the method still selected for the NEXT leg is not a leg yet', () => {
    expect(cashBlocksCharge({
      limit: 100_000, payable: 100_000, method: CASH, splitting: true, tenders: [{ method: CARD }],
    })).toBe(false);
  });

  it('a method type is matched case-insensitively, the way the server canonicalises it', () => {
    expect(cashBlocksCharge({ limit: 100_000, payable: 100_000, method: { type: ' Cash ' }, tenders: [], splitting: false })).toBe(true);
  });

  it('under the limit, cash is fine', () => {
    expect(cashBlocksCharge({
      limit: 100_000, payable: 99_999, method: CASH, splitting: true, tenders: [{ method: CASH }],
    })).toBe(false);
  });
});
