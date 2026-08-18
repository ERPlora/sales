// sales#20 — the client side of the idempotency contract.
//
// The server refuses to close a sale without an idempotency key and, given the same key twice,
// records ONE sale. For that to help a cashier, the key has to live as long as the CHECKOUT
// ATTEMPT, not as long as the request: one key per "charge" screen, reused verbatim on every
// retry after a timeout or a failure, thrown away only once the sale is recorded.
import { describe, expect, it } from 'vitest';
import { checkoutErrorKey, newIdempotencyKey } from './checkout-key.js';

describe('newIdempotencyKey', () => {
  it('matches the pattern the payload schema accepts', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  });

  it('never repeats — two checkouts are two sales', () => {
    const keys = new Set(Array.from({ length: 500 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(500);
  });

  it('works without crypto.randomUUID (older webviews on the shop tablet)', () => {
    const key = newIdempotencyKey({ randomUUID: undefined } as unknown as Crypto);
    expect(key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  });
});

describe('checkoutErrorKey', () => {
  it('translates a domain rejection into a catalog key the cashier understands', () => {
    expect(checkoutErrorKey('sales.empty_sale: the sale has no lines')).toBe('ui.errorEmptySale');
    expect(checkoutErrorKey('sales.payment_method_not_available: pm-ghost')).toBe(
      'ui.errorPaymentMethod',
    );
    expect(checkoutErrorKey('sales.payment_method_required')).toBe('ui.errorPaymentMethod');
    expect(checkoutErrorKey('sales.discounts_not_allowed')).toBe('ui.errorDiscountsOff');
    expect(checkoutErrorKey('sales.discount_out_of_range: 120')).toBe('ui.errorDiscountRange');
    expect(checkoutErrorKey('sales.customer_required')).toBe('ui.errorCustomerRequired');
  });

  it('sales#24 — a cash amount below the total tells the cashier how much is missing, not «error»', () => {
    expect(checkoutErrorKey('sales.insufficient_tendered: amount_tendered 100 is below the total 500'))
      .toBe('ui.errorInsufficientTendered');
  });

  it('finds the code even when the runtime wraps the message', () => {
    expect(
      checkoutErrorKey('command `sales.complete_sale` failed: sales.empty_sale: no lines'),
    ).toBe('ui.errorEmptySale');
  });

  it('falls back to the generic charge error for anything it does not know', () => {
    expect(checkoutErrorKey('connection refused')).toBe('ui.errorCharge');
    expect(checkoutErrorKey('')).toBe('ui.errorCharge');
  });
});
