// pos-tax — the POS has to tell THREE tax states apart, not two.
//
// `buildCategoryRatesMap` collapses "the taxes module answered nothing" and "this category has no
// rule" into the very same empty map. The handler already refuses to make that mistake: it rejects
// a catalogue line whose category resolves no rule (`sales.no_tax_rule`, sales#67) but ONLY when
// the rule catalogue actually arrived (`!rules.is_empty()`) — a `taxes` outage must not turn into a
// POS that cannot charge anything.
//
// The grid needs the same three-way answer to disable what cannot be charged without going dark
// when `taxes` is down, so the catalogue carries its own `available` flag and the verdict about one
// product is a pure function of it.
import { describe, expect, it } from 'vitest';
import { loadTaxCatalog, productSellability } from './pos-tax';
import type { ErploraClientLike } from './pos-cart';
import { makeErploraDouble } from '../test/erplora-double';

/** The shared double, handed over as the client argument (sales#234). The only read that matters
 *  here is `taxes.rules.list`; anything else this function starts asking for is a red test and not
 *  an empty answer, which is the whole point of the helper. */
function client(rules: unknown[]): ErploraClientLike {
  return makeErploraDouble({ queries: { 'taxes.rules.list': rules } }).sdk as unknown as ErploraClientLike;
}

/** The `taxes` app is there but its contract is broken — a rejection, never an empty catalogue. */
function brokenClient(): ErploraClientLike {
  return makeErploraDouble({ broken: ['taxes.rules.list'] }).sdk as unknown as ErploraClientLike;
}

const ES_RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-0', tax_category_key: 'product.exempt', rate_pct: 0, parent_id: null, is_active: 1 },
];

describe('loadTaxCatalog — the rates map plus whether the catalogue actually arrived', () => {
  it('taxes answers: the catalogue is available and the rates are mapped by category', async () => {
    const catalog = await loadTaxCatalog(client(ES_RULES));

    expect(catalog.available, 'taxes answered with rules → the catalogue is trustworthy').toBe(true);
    expect(catalog.rates.get('product.generic')).toBe(21);
  });

  it('taxes rejects: the catalogue is NOT available (we know nothing, we judge nothing)', async () => {
    const catalog = await loadTaxCatalog(brokenClient());

    expect(catalog.available, 'an outage must never read as "no rule exists"').toBe(false);
    expect(catalog.rates.size).toBe(0);
  });

  it('taxes answers with zero rules: same as an outage — nothing to judge with', async () => {
    // Mirrors the handler guard `!rules.is_empty()`: with an empty catalogue nothing gets rejected.
    const catalog = await loadTaxCatalog(client([]));

    expect(catalog.available).toBe(false);
  });
});

describe('productSellability — a product can be charged only if its VAT resolves', () => {
  const available = { rates: new Map([['product.generic', 21], ['product.exempt', 0]]), available: true };
  const unavailable = { rates: new Map<string, number>(), available: false };

  it('category resolves a rule → sellable', () => {
    expect(productSellability(available, 'product.generic')).toBe('sellable');
  });

  it('a 0 % category is sellable: exempt is a configured rate, not a missing one', () => {
    expect(productSellability(available, 'product.exempt')).toBe('sellable');
  });

  it('no tax category at all → not sellable, and that is knowable without the catalogue', () => {
    expect(productSellability(available, '')).toBe('no_tax_category');
    expect(productSellability(available, undefined)).toBe('no_tax_category');
    expect(productSellability(unavailable, undefined)).toBe('no_tax_category');
  });

  it('the catalogue is there and the category resolves nothing → not sellable', () => {
    // This is exactly what the handler rejects at checkout with `sales.no_tax_rule`.
    expect(productSellability(available, 'restaurant.food')).toBe('no_tax_rule');
  });

  it('the catalogue never arrived → unknown, NOT broken (the handler net covers that incident)', () => {
    expect(productSellability(unavailable, 'product.generic')).toBe('unknown');
    expect(productSellability(unavailable, 'restaurant.food')).toBe('unknown');
  });
});
