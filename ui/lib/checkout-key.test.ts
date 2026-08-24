// sales#20 — the client side of the idempotency contract.
//
// The server refuses to close a sale without an idempotency key and, given the same key twice,
// records ONE sale. For that to help a cashier, the key has to live as long as the CHECKOUT
// ATTEMPT, not as long as the request: one key per "charge" screen, reused verbatim on every
// retry after a timeout or a failure, thrown away only once the sale is recorded.
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };
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
    // sales#159 — a split whose legs do not add up is refused; the cashier gets words, not a code.
    expect(checkoutErrorKey('command failed: sales.payments_do_not_match_total: the payments add up to 12000 but the total is 12100'))
      .toBe('ui.errorPaymentsMismatch');
  });

  it('sales#21 — a missing VAT rule or catalogue is explained, not shown as a generic charge error', () => {
    expect(checkoutErrorKey('sales.no_tax_rule: no tax rule for category `x`')).toBe('ui.errorNoTaxRule');
    expect(checkoutErrorKey('sales.tax_catalog_unavailable: …')).toBe('ui.errorTaxCatalogUnavailable');
  });

  it('sales#152 — every way a combo can be refused sends the cashier somewhere DIFFERENT', () => {
    // Nine codes, nine screens to fix it on. Collapsing them into one «could not charge» is what
    // turns a two-second fix («the menu was withdrawn») into a call to the manager.
    const cases: Array<[string, string]> = [
      ['sales.combo_catalog_unavailable: no combo catalogue to price `c-1`', 'ui.errorComboCatalogUnavailable'],
      ['sales.combo_not_available: c-1', 'ui.errorComboNotAvailable'],
      ['sales.combo_not_on_sale: `c-1` was withdrawn from sale', 'ui.errorComboNotOnSale'],
      ['sales.combo_option_not_available: o-9', 'ui.errorComboOptionNotAvailable'],
      ['sales.combo_group_unresolved: `Postre` needs 1 choice(s), got 0', 'ui.errorComboGroupUnresolved'],
      ['sales.combo_group_over_max: `Postre` allows 1 choice(s), got 2', 'ui.errorComboGroupOverMax'],
      ['sales.combo_option_repeated: o-1', 'ui.errorComboOptionRepeated'],
      ['sales.combo_component_price_unknown: `p-9` is not on sale', 'ui.errorComboComponentPriceUnknown'],
      ['sales.combo_tax_category_missing: `c-1` has no tax category', 'ui.errorComboTaxCategoryMissing'],
      ['sales.too_many_lines: 300 lines need 301 ids, the batch has 256', 'ui.errorTooManyLines'],
    ];
    for (const [message, key] of cases) expect(checkoutErrorKey(message)).toBe(key);
    // And every key it points at really exists in BOTH catalogues (ADR-0055/0199: en + its es).
    const keys = new Set(cases.map(([, key]) => key.replace('ui.', '')));
    for (const catalogue of [en, es]) {
      for (const key of keys) expect(catalogue.ui[key], `${key}`).toBeTruthy();
    }
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
