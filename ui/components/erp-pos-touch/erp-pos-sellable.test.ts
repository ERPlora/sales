// sales#74 — the grid must not let a cashier add what the sale cannot charge.
//
// The handler is the last net and it holds: the price and the tax category of a catalogue line come
// from `inventory.products.for_sale`, and a category that resolves no rule rejects the whole sale
// with `sales.no_tax_rule` (sales#67/#68). But that verdict lands at CHECKOUT — customer waiting,
// cashier stuck, cart to rebuild. The grid knows enough to say it earlier.
//
// A product is sellable iff it carries a `tax_category_key` AND that category resolves a rule in
// the hub's tax catalogue. What is not sellable is painted DISABLED (never hidden: a hidden product
// is a problem the business never learns about) with its reason reachable by title/aria-label, not
// by colour alone.
//
// The one thing this must not do is confuse "this product has no tax category" with "I know nothing
// about taxes": if the whole catalogue fails to arrive that is a different incident, already covered
// by the handler, and the grid stays open.
import { beforeEach, describe, expect, it } from 'vitest';

const commands: string[] = [];

/** Product rows served as `inventory.products.list`. */
const PRODUCTS = [
  { id: 'p-ok', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-nocat', name: 'Croissant', price: 120, is_active: 1 },
  { id: 'p-norule', name: 'Vino', price: 900, is_active: 1, tax_category_key: 'restaurant.drink' },
];

const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

/** Installs the SDK double. `rules` empty = the tax catalogue never arrived. */
function installSdk(rules: unknown[]) {
  commands.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => {
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'taxes.rules.list') return rules;
      return [];
    },
    command: async (name: string) => { commands.push(name); return {}; },
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => {},
  };
}

interface MountedPos {
  shadowRoot: ShadowRoot;
  cart: unknown[];
  q: string;
  updateComplete: Promise<unknown>;
}

async function mount(): Promise<MountedPos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as MountedPos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as MountedPos).updateComplete;
  return el as unknown as MountedPos;
}

/** The grid tile of a product, found by the name it paints. */
function tileOf(el: MountedPos, name: string): HTMLElement {
  const tiles = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')];
  const tile = tiles.find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  return tile;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installSdk(RULES);
});

describe('the grid disables what cannot be charged (sales#74)', () => {
  it('a product with NO tax category is painted, disabled, and says why', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Croissant');

    expect(tile.hasAttribute('disabled'), 'it must not be tappable').toBe(true);
    // The reason travels by text, not by colour: tooltip for the mouse, accessible name for AT.
    expect(tile.getAttribute('title')).toBe('ui.notSellableNoTaxCategory');
    expect(tile.getAttribute('aria-label')).toContain('ui.notSellableNoTaxCategory');
    expect(tile.getAttribute('aria-label')).toContain('Croissant');
  });

  it('a product whose tax category resolves no rule is disabled with its own reason', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Vino');

    expect(tile.hasAttribute('disabled')).toBe(true);
    expect(tile.getAttribute('title')).toBe('ui.notSellableNoTaxRule');
  });

  it('tapping a blocked tile adds no line and opens no order', async () => {
    const el = await mount();

    tileOf(el, 'Croissant').click();
    tileOf(el, 'Vino').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.cart.length, 'nothing unchargeable may reach the cart').toBe(0);
    expect(commands, 'not even the order gets opened').not.toContain('sales.order.open');
  });

  it('a sellable product stays enabled and still adds to the cart', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Café');

    expect(tile.hasAttribute('disabled')).toBe(false);
    expect(tile.getAttribute('title'), 'nothing to warn about').toBeNull();

    tile.click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.cart.length).toBe(1);
  });

  it('the blocked tile carries a visible mark, not only a faded colour', async () => {
    const el = await mount();

    expect(tileOf(el, 'Croissant').querySelector('.warn'), 'colour alone is not a message').toBeTruthy();
    expect(tileOf(el, 'Café').querySelector('.warn')).toBeNull();
  });
});

describe('a taxes outage is a different incident: the grid stays open', () => {
  beforeEach(() => { installSdk([]); });

  it('with no tax catalogue at all, a categorised product is NOT marked broken', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Café');

    expect(tile.hasAttribute('disabled'), 'the handler net covers an outage; charging comes first').toBe(false);
    expect(tileOf(el, 'Vino').hasAttribute('disabled'), 'we cannot know its rule is missing').toBe(false);
  });

  it('but a product with no tax category of its own is still blocked', async () => {
    const el = await mount();

    expect(tileOf(el, 'Croissant').hasAttribute('disabled')).toBe(true);
  });
});

describe('the search results follow the same rule as the grid', () => {
  it('a blocked product is disabled in the spotlight list too', async () => {
    const el = await mount();
    el.q = 'Croi';
    await el.updateComplete;

    const item = el.shadowRoot.querySelector<HTMLElement>('.sp-list ion-item');
    expect(item, 'the product still shows up in the search').toBeTruthy();
    expect(item?.hasAttribute('disabled')).toBe(true);
    expect(item?.getAttribute('title')).toBe('ui.notSellableNoTaxCategory');
  });
});
