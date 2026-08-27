// sales#74 — the grid must not let a cashier add what the sale cannot charge.
//
// The handler is the last net and it holds: the price and the tax category of a catalogue line come
// from `inventory.products.for_sale`, and a category that resolves no rule rejects the whole sale
// with `sales.no_tax_rule` (sales#67/#68). But that verdict lands at CHECKOUT — customer waiting,
// cashier stuck, cart to rebuild. The grid knows enough to say it earlier.
//
// A product is sellable iff it carries a `tax_category_key` AND that category resolves a rule in
// the hub's tax catalogue. What is not sellable is painted BLOCKED (never hidden: a hidden product
// is a problem the business never learns about) with its reason reachable as TEXT.
//
// sales#58 — the contract of this file changed, and the old one is why the grid looked broken.
// It used to require the native `disabled` attribute on the tile. On Ionic that is not "a greyed
// out card": it renders `<button disabled>` and applies `pointer-events: none`, so on a POS
// TOUCHSCREEN the tap reaches nothing, no handler runs, nothing is logged — and the only two
// carriers of the reason left were `title` (needs a hover that never happens on a tablet) and
// `aria-label` (needs a screen reader). A whole catalogue with the VAT unset therefore renders as
// a grid where every tile is silently dead: reproduced with a real mouse click in `erplora dev`,
// and reported four times from QA hubs as "the tile does not respond, no toast, no error, no log".
//
// The market does not ship a mute dead tile: Square and Toast paint the state ON the tile ("Sold
// Out", greyed and struck through) and Shopify POS / Dynamics 365 Commerce answer the tap with the
// reason instead of swallowing it. Accessibility guidance says the same — NN/g on disabled buttons,
// and MDN on `aria-disabled`, which marks the state without removing the element from the pointer
// and focus paths. So: `aria-disabled`, a visible badge, and a tap that ANSWERS.
//
// The one thing this must not do is confuse "this product has no tax category" with "I know nothing
// about taxes": if the whole catalogue fails to arrive that is a different incident, already covered
// by the handler, and the grid stays open.
import { beforeEach, describe, expect, it } from 'vitest';

const commands: string[] = [];
/** Toasts the component asked the shell for, in order. */
const notices: { type: string; message: string }[] = [];

/** Product rows served as `inventory.products.list`. */
const PRODUCTS = [
  { id: 'p-ok', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-nocat', name: 'Croissant', price: 120, is_active: 1 },
  { id: 'p-norule', name: 'Vino', price: 900, is_active: 1, tax_category_key: 'restaurant.drink' },
];

const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

/** Installs the SDK double. `rules` empty = the tax catalogue never arrived.
 *  `withNotify:false` = a shell that offers no toast channel, to prove the notice is our own. */
function installSdk(rules: unknown[], opts: { withNotify?: boolean } = {}) {
  commands.length = 0;
  notices.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    // sales#25 — the till reads `inventory` through the OPTIONAL door (ADR-0127). For an app that
    // IS in this hub the optional door answers exactly like the required one, which is what this
    // delegation models; absence and failure are still whatever `queryAll` does with them.
    queryAllOptional: async (name: string, params?: Record<string, unknown>) =>
      ((globalThis as Record<string, unknown>).erplora as { queryAll(n: string, p?: Record<string, unknown>): Promise<unknown> }).queryAll(name, params),
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
    ...(opts.withNotify === false
      ? {}
      : { notify: (n: { type: string; message: string }) => { notices.push(n); } }),
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

describe('the grid blocks what cannot be charged (sales#74) without going mute (sales#58)', () => {
  it('a blocked tile is aria-disabled, NEVER natively disabled: the tap has to arrive', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Croissant');

    // `disabled` on an ion-card is `pointer-events: none`: it would eat the tap and with it the
    // only chance to say why on a touchscreen. The state is announced, the element stays live.
    expect(tile.hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    // The reason still travels by text for the mouse and for assistive tech.
    expect(tile.getAttribute('title')).toBe('ui.notSellableNoTaxCategory');
    expect(tile.getAttribute('aria-label')).toContain('ui.notSellableNoTaxCategory');
    expect(tile.getAttribute('aria-label')).toContain('Croissant');
  });

  it('a product whose tax category resolves no rule is blocked with its own reason', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Vino');

    expect(tile.hasAttribute('disabled')).toBe(false);
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(tile.getAttribute('title')).toBe('ui.notSellableNoTaxRule');
  });

  it('the blocked tile says it ON the tile: a badge with words, not a faded colour', async () => {
    const el = await mount();

    const badge = tileOf(el, 'Croissant').querySelector('.blocked-badge');
    expect(badge, 'colour and an icon alone are not a message').toBeTruthy();
    expect(badge?.textContent?.trim(), 'the badge is localized, never hardcoded').toBe('ui.notSellableBadge');
    expect(tileOf(el, 'Croissant').querySelector('.warn'), 'the mark stays too').toBeTruthy();
    expect(tileOf(el, 'Café').querySelector('.blocked-badge')).toBeNull();
    expect(tileOf(el, 'Café').querySelector('.warn')).toBeNull();
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

  it('tapping a blocked tile ANSWERS: the reason is painted where the cashier is looking', async () => {
    const el = await mount();

    tileOf(el, 'Croissant').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    const notice = el.shadowRoot.querySelector('.blocked-notice');
    expect(notice, 'a tap that changes nothing on screen is indistinguishable from a broken POS').toBeTruthy();
    expect(notice?.textContent).toContain('ui.notSellableNoTaxCategory');

    // The shell's toast is best-effort on top of the in-component notice, never instead of it.
    expect(notices.map((n) => n.message)).toContain('ui.notSellableNoTaxCategory');
  });

  it('the notice names the reason of the LAST tile tapped, not the first', async () => {
    const el = await mount();

    tileOf(el, 'Croissant').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    tileOf(el, 'Vino').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.blocked-notice')?.textContent).toContain('ui.notSellableNoTaxRule');
  });

  it('the notice clears as soon as a sellable product goes in: it is not a permanent banner', async () => {
    const el = await mount();

    tileOf(el, 'Croissant').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.blocked-notice')).toBeTruthy();

    tileOf(el, 'Café').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.cart.length).toBe(1);
    expect(el.shadowRoot.querySelector('.blocked-notice'), 'the incident is over').toBeNull();
  });

  it('a shell with no notifier still shows the reason: the notice does not depend on the toast', async () => {
    installSdk(RULES, { withNotify: false });
    const el = await mount();

    tileOf(el, 'Croissant').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.blocked-notice')?.textContent).toContain('ui.notSellableNoTaxCategory');
  });

  it('a sellable product stays live and still adds to the cart', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Café');

    expect(tile.hasAttribute('disabled')).toBe(false);
    expect(tile.hasAttribute('aria-disabled')).toBe(false);
    expect(tile.getAttribute('title'), 'nothing to warn about').toBeNull();

    tile.click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.cart.length).toBe(1);
  });
});

describe('a taxes outage is a different incident: the grid stays open', () => {
  beforeEach(() => { installSdk([]); });

  it('with no tax catalogue at all, a categorised product is NOT marked broken', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Café');

    expect(tile.hasAttribute('aria-disabled'), 'the handler net covers an outage; charging comes first').toBe(false);
    expect(tileOf(el, 'Vino').hasAttribute('aria-disabled'), 'we cannot know its rule is missing').toBe(false);
  });

  it('but a product with no tax category of its own is still blocked', async () => {
    const el = await mount();

    expect(tileOf(el, 'Croissant').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the search results follow the same rule as the grid', () => {
  it('a blocked product is disabled in the spotlight list too', async () => {
    const el = await mount();
    el.q = 'Croi';
    await el.updateComplete;

    const item = el.shadowRoot.querySelector<HTMLElement>('.sp-list ion-item');
    expect(item, 'the product still shows up in the search').toBeTruthy();
    // Same reason as the tile: an `ion-item disabled` is pointer-events:none and the tap dies.
    expect(item?.hasAttribute('disabled'), 'the tap has to arrive here too').toBe(false);
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    expect(item?.getAttribute('title')).toBe('ui.notSellableNoTaxCategory');
  });
});
