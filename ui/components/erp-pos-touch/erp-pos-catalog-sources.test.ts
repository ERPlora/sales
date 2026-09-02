// sales#25 — `sync_products` and `sync_services` decide WHICH provider feeds the till's grid.
//
// Both settings had been saved since they were created without a single reader: the form promised
// "show products / show services in the POS" and the till loaded both regardless. A switch that
// does nothing is worse than no switch, because the business believes it asked for something.
//
// Two things this file pins beyond "the flag is read":
//
//  1. The flags are read through `sales.pos_settings.get`, NOT `sales.settings.get`. That one
//     requires `sales.manage_settings`, which a CASHIER does not have (`role_permissions` in
//     `module.json`), so reading the policy through it would give a till that behaves one way for
//     the manager and another for the person actually standing at it. Same reason `sales.business.get`
//     exists apart (sales#180).
//  2. Absence of the row means the DEFAULTS, and the default for services is ON. Services have
//     always shown whenever `services` was installed; landing this switch with the old `false`
//     default would empty the grid of every salon on the next module update.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const PRODUCTS = [{ id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' }];
const SERVICES = [{ id: 's-1', name: 'Corte', price: 1500, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

interface SdkOptions {
  /** Row answered by `sales.pos_settings.get`; `null` = no row saved yet. */
  posSettings?: Record<string, unknown> | null;
  /** `sales.settings.get` rejects the way the runtime refuses a cashier. */
  settingsDenied?: boolean;
}

let pos: ReturnType<typeof installPosDouble>;
/** Every query name the till asked for, in order. */
const asked = (): string[] => pos.reads.map((r) => r.name);

function installSdk(opts: SdkOptions = {}) {
  pos = installPosDouble({
    settings: opts.posSettings === undefined ? {} : opts.posSettings,
    products: PRODUCTS,
    rules: RULES,
    services: SERVICES,
    // `sales.settings.get` is the ADMIN door: the runtime refuses a cashier who lacks
    // `sales.manage_settings`, and the till must still honour its policy (sales#203).
    ...(opts.settingsDenied ? { failing: { 'sales.settings.get': 'permission_denied' } } : {}),
  });
}

interface MountedPos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  products: { id: string }[];
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

const ids = (el: MountedPos) => el.products.map((p) => p.id);

beforeEach(() => {
  document.body.innerHTML = '';
  pos?.reads.splice(0);
  history.replaceState({}, '', '/m/sales/pos');
});

describe('sync_products decides whether the product catalogue feeds the grid', () => {
  it('OFF: the products are not even read, let alone shown', async () => {
    installSdk({ posSettings: { sync_products: 0, sync_services: 1 } });
    const el = await mount();
    expect(asked(), 'reading a catalogue nobody will see is work the till pays for').not.toContain('inventory.products.list');
    expect(ids(el)).toEqual(['s-1']);
  });

  it('ON: the products are read and shown', async () => {
    installSdk({ posSettings: { sync_products: 1, sync_services: 0 } });
    const el = await mount();
    expect(asked()).toContain('inventory.products.list');
    expect(ids(el)).toEqual(['p-1']);
  });

  it('with no settings row saved the default is ON, exactly as before the switch existed', async () => {
    installSdk({ posSettings: null });
    const el = await mount();
    expect(ids(el)).toContain('p-1');
  });

  it('OFF also spares the product categories: they have nothing left to group', async () => {
    installSdk({ posSettings: { sync_products: 0 } });
    await mount();
    expect(asked()).not.toContain('inventory.categories.list');
    expect(asked()).not.toContain('inventory.product_categories');
  });
});

describe('sync_services decides whether the service catalogue feeds the grid', () => {
  it('OFF: the services are not read', async () => {
    installSdk({ posSettings: { sync_products: 1, sync_services: 0 } });
    const el = await mount();
    expect(asked()).not.toContain('services.services.list');
    expect(ids(el)).toEqual(['p-1']);
  });

  it('ON: the services are read and land behind the products', async () => {
    installSdk({ posSettings: { sync_products: 1, sync_services: 1 } });
    const el = await mount();
    expect(ids(el)).toEqual(['p-1', 's-1']);
  });

  it('with no settings row saved the default is ON: a salon does not lose its catalogue', async () => {
    installSdk({ posSettings: null });
    const el = await mount();
    expect(ids(el)).toContain('s-1');
  });
});

describe('the policy is read through a door the CASHIER can open', () => {
  it('honours the flags even when sales.settings.get refuses for lack of manage_settings', async () => {
    installSdk({ settingsDenied: true, posSettings: { sync_products: 1, sync_services: 0 } });
    const el = await mount();
    expect(asked()).toContain('sales.pos_settings.get');
    expect(asked(), 'the till must not be blind to its own policy').not.toContain('services.services.list');
    expect(ids(el)).toEqual(['p-1']);
  });

  it('a policy read that FAILS falls back to the defaults: the till never opens empty', async () => {
    installSdk();
    pos = installPosDouble({
      products: PRODUCTS,
      rules: RULES,
      services: SERVICES,
      failing: { 'sales.pos_settings.get': 'boom' },
    });
    const el = await mount();
    expect(ids(el)).toEqual(['p-1', 's-1']);
  });
});

// sales#248 — TAPPING A CATEGORY IS A LOCAL OPERATION. It must never go to the server.
//
// `inventory.products.list` concedes a `category_id` filter since inventory#71, and the proposal
// was that the grid ask for one category at a time instead of grouping the catalogue it already
// holds. It was investigated as a market question (CLAUDE.md: business doubts are decided by the
// market, 8+ references and forums) and the answer was unanimous against:
//
//   · 10 of 10 references filter in the client over a catalogue cached on the device — Odoo POS,
//     Shopify POS, Lightspeed, Toast, Square, Clover, Loyverse, WooCommerce (WCPOS), Dynamics 365
//     Commerce, TouchBistro. Not one issues a request per category.
//   · The only published threshold in the sector is Odoo's `limited_product_count`, and it is
//     20.000 articles — 71× the ~280 of a typical hub. Above it, what Odoo moves to the server is
//     the SEARCH BOX, never the category tab.
//   · Every one of them sells offline operation as a feature, and a grid that round-trips per tap
//     cannot have it: on a bad connection each tap is a visible stall.
//
// And the code says the same thing on its own: the whole catalogue is what feeds the Spotlight
// search over name and SKU, `blockedCount` (the aggregate notice of sales#149, deliberately over
// the WHOLE catalogue and not over the open tab), the per-category counts painted on every tab,
// and `primaryCategory()` — the category each cart line carries to the KDS. Filtering server-side
// per category would either break those four or keep the full load anyway, in which case the round
// trip is pure added latency.
//
// So this is the guard for the decision, not a description of it: a category tap makes NO read.
describe('tapping a category is local: the grid never round-trips (sales#248)', () => {
  const CATEGORIES = [
    { id: 'c-drinks', name: 'Bebidas' },
    { id: 'c-food', name: 'Comida' },
  ];
  const CATALOGUE = [
    { id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' },
    { id: 'p-2', name: 'Tostada', price: 220, is_active: 1, tax_category_key: 'product.generic' },
  ];
  const LINKS = [
    { product_id: 'p-1', category_id: 'c-drinks' },
    { product_id: 'p-2', category_id: 'c-food' },
  ];

  async function mountWithCategories(): Promise<MountedPos> {
    pos = installPosDouble({
      settings: { sync_products: 1, sync_services: 0 },
      products: CATALOGUE,
      categories: CATEGORIES,
      productCategories: LINKS,
      rules: RULES,
    });
    return mount();
  }

  /** The cashier's own door: the category segment of the grid header. */
  function tapCategory(el: MountedPos, id: string): void {
    const segment = el.shadowRoot.querySelector('ion-segment.category-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: id } }));
  }

  it('makes no read at all when a category is chosen', async () => {
    const el = await mountWithCategories();
    expect(pos.reads.length, 'control: the recorder saw the reads of the load').toBeGreaterThan(0);
    pos.reads.splice(0);

    tapCategory(el, 'c-drinks');
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    expect(
      pos.reads.map((r) => r.name),
      'a till that asks the server on every category tap stalls on a bad connection and stops working without one',
    ).toEqual([]);

    // And the recorder is STILL live after the tap — an empty list has to mean "nothing was read",
    // never "nothing is being recorded any more".
    await (pos.sdk as { query(name: string): Promise<unknown> }).query('inventory.products.list');
    expect(pos.reads.map((r) => r.name)).toEqual(['inventory.products.list']);
  });

  it('and narrows the grid to that category from the catalogue it already holds', async () => {
    const el = await mountWithCategories();

    tapCategory(el, 'c-food');
    await el.updateComplete;

    // The catalogue tiles: not the menu tiles, not the free-price one the grid always carries.
    const tiles = [...el.shadowRoot.querySelectorAll('ion-card.tile:not(.combo):not(.open-price)')];
    expect(tiles.length, 'the grid still narrows — locally').toBe(1);
    expect(tiles[0].textContent).toContain('Tostada');
  });

  it('keeps the WHOLE catalogue loaded, which is what the search and the aggregate notice read', async () => {
    const el = await mountWithCategories();

    tapCategory(el, 'c-drinks');
    await el.updateComplete;

    expect(
      el.products.map((p) => p.id),
      'narrowing the grid must not narrow the catalogue: Spotlight and blockedCount read all of it',
    ).toEqual(['p-1', 'p-2']);
  });
});
