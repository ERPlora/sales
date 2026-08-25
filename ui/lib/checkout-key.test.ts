// sales#20 — the client side of the idempotency contract.
//
// The server refuses to close a sale without an idempotency key and, given the same key twice,
// records ONE sale. For that to help a cashier, the key has to live as long as the CHECKOUT
// ATTEMPT, not as long as the request: one key per "charge" screen, reused verbatim on every
// retry after a timeout or a failure, thrown away only once the sale is recorded.
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };
import { checkoutErrorKey, errorCode, newIdempotencyKey } from './checkout-key.js';

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
  // sales#185 — the contract is the CODE, not the sentence.
  //
  // Up to 2.16.11 this took the MESSAGE and looked the code up inside it with `includes`. That
  // worked while the message carried the code, and that "while" is over: the runtime stopped
  // sending its internal sentence and the SDK replaced the platform codes with business prose
  // (ADR-0400). A substring mapping does not fail when that happens: it stops matching IN SILENCE
  // and everybody drops to the generic "could not charge". Hence the bare codes below — that is
  // what `ErploraError.code` carries, what the runtime's envelope serialises, and the only thing
  // that does not change when the sentence does. Same debt hub#1070 is retiring from the hub.
  it('translates a domain rejection into a catalog key the cashier understands', () => {
    expect(checkoutErrorKey('sales.empty_sale')).toBe('ui.errorEmptySale');
    expect(checkoutErrorKey('sales.payment_method_not_available')).toBe('ui.errorPaymentMethod');
    expect(checkoutErrorKey('sales.payment_method_required')).toBe('ui.errorPaymentMethod');
    expect(checkoutErrorKey('sales.discounts_not_allowed')).toBe('ui.errorDiscountsOff');
    expect(checkoutErrorKey('sales.discount_out_of_range')).toBe('ui.errorDiscountRange');
    expect(checkoutErrorKey('sales.customer_required')).toBe('ui.errorCustomerRequired');
  });

  it('sales#24 — a cash amount below the total tells the cashier how much is missing, not «error»', () => {
    expect(checkoutErrorKey('sales.insufficient_tendered')).toBe('ui.errorInsufficientTendered');
    // sales#159 — a split whose legs do not add up is refused; the cashier gets words, not a code.
    expect(checkoutErrorKey('sales.payments_do_not_match_total')).toBe('ui.errorPaymentsMismatch');
  });

  it('sales#21 — a missing VAT rule or catalogue is explained, not shown as a generic charge error', () => {
    expect(checkoutErrorKey('sales.no_tax_rule')).toBe('ui.errorNoTaxRule');
    expect(checkoutErrorKey('sales.tax_catalog_unavailable')).toBe('ui.errorTaxCatalogUnavailable');
  });

  it('sales#152 — every way a combo can be refused sends the cashier somewhere DIFFERENT', () => {
    // Nine codes, nine screens to fix it on. Collapsing them into one «could not charge» is what
    // turns a two-second fix («the menu was withdrawn») into a call to the manager.
    const cases: Array<[string, string]> = [
      ['sales.combo_catalog_unavailable', 'ui.errorComboCatalogUnavailable'],
      ['sales.combo_not_available', 'ui.errorComboNotAvailable'],
      ['sales.combo_not_on_sale', 'ui.errorComboNotOnSale'],
      ['sales.combo_option_not_available', 'ui.errorComboOptionNotAvailable'],
      ['sales.combo_group_unresolved', 'ui.errorComboGroupUnresolved'],
      ['sales.combo_group_over_max', 'ui.errorComboGroupOverMax'],
      ['sales.combo_option_repeated', 'ui.errorComboOptionRepeated'],
      ['sales.combo_component_price_unknown', 'ui.errorComboComponentPriceUnknown'],
      ['sales.combo_tax_category_missing', 'ui.errorComboTaxCategoryMissing'],
      ['sales.too_many_lines', 'ui.errorTooManyLines'],
    ];
    for (const [code, key] of cases) expect(checkoutErrorKey(code)).toBe(key);
    // And every key it points at really exists in BOTH catalogues (ADR-0055/0199: en + its es).
    const keys = new Set(cases.map(([, key]) => key.replace('ui.', '')));
    for (const catalogue of [en, es]) {
      for (const key of keys) expect(catalogue.ui[key], `${key}`).toBeTruthy();
    }
  });

  it('sales#185 — a PLATFORM refusal is business words too, not a runtime sentence', () => {
    // hub#1074/ADR-0400: `complete_sale` declares `taxes.rules.list` as a `required` read, so a hub
    // whose tax app was force-uninstalled (hub#1101) or deactivated by the cascade (ADR-0128) has
    // the runtime refuse the sale. The cashier is told an app is missing and that NOTHING was
    // charged — never "required read `taxes.rules.list` is unavailable ... (hub#701)".
    expect(checkoutErrorKey('module_not_installed')).toBe('ui.errorMissingApp');
    expect(checkoutErrorKey('module_inactive')).toBe('ui.errorMissingApp');
    expect(checkoutErrorKey('read_unavailable')).toBe('ui.errorTaxCatalogUnavailable');
    for (const catalogue of [en, es]) {
      expect(catalogue.ui.errorMissingApp).toBeTruthy();
    }
  });

  it('is EXACT: a code is not a prefix, a suffix or a substring of another', () => {
    // The old substring match is exactly what this rules out. A sentence is not a code, and a
    // wrapped code ("command `x` failed: sales.empty_sale") is a sentence.
    expect(checkoutErrorKey('command `sales.complete_sale` failed: sales.empty_sale: no lines'))
      .toBe('ui.errorCharge');
    expect(checkoutErrorKey('sales.empty_sale: the sale has no lines')).toBe('ui.errorCharge');
  });

  it('falls back to the generic charge error for anything it does not know', () => {
    expect(checkoutErrorKey('connection refused')).toBe('ui.errorCharge');
    expect(checkoutErrorKey('')).toBe('ui.errorCharge');
  });
});

describe('errorCode', () => {
  // The screen must never dig a code out of a message. `errorCode` is the one door: the FIELD the
  // envelope carries, or nothing at all.
  it('reads the `code` field the SDK puts on a runtime error', () => {
    expect(errorCode(Object.assign(new Error('anything'), { code: 'sales.empty_sale' })))
      .toBe('sales.empty_sale');
  });

  it('is empty for anything that did not come from the hub', () => {
    // A browser TypeError, a library throw, a rejected string: none of them carry a contract.
    expect(errorCode(new Error('sales.empty_sale: no lines'))).toBe('');
    expect(errorCode('sales.empty_sale')).toBe('');
    expect(errorCode(undefined)).toBe('');
    expect(errorCode(null)).toBe('');
    // A non-string `code` is not a code either — no accidental `String(42)`.
    expect(errorCode(Object.assign(new Error('x'), { code: 42 }))).toBe('');
  });
});
