// sales#25 — the product catalogue is an OPTIONAL capability, and the till says so when it is not
// there.
//
// `inventory` used to be a HARD dependency: installing `sales` dragged the whole stock app in
// (ADR-0060) and the ADR-0128 cascade tied them together, so a salon that only sells haircuts got a
// stock module it never asked for. It is now read through the optional door (ADR-0127) and its
// absence is a legitimate state — services plus free price (ADR-0085) — said OUT LOUD in the grid
// instead of shown as an empty screen.
//
// Three facts have to stay tellable apart, and this file pins all three:
//
//   · ABSENT — `queryAllOptional` answers `undefined`. Degraded mode: no product grid, the REASON
//     written where the products would be, and the till still charges.
//   · BROKEN — the app IS in this hub and its read failed. An incident, alerted (sales#25's first
//     half, `erp-pos-dependency-reads.test.ts`).
//   · TOO OLD — the app is here and answers the grid, but NOT `inventory.products.for_sale`, the
//     query the checkout prices against (born in inventory 1.2.20). That was hub#960: a till that
//     looks perfectly healthy and refuses every catalogue line at payment time. The hard
//     dependency used to buy that guarantee at install time with `min_version`; without it the
//     till PREFLIGHTS the query itself, which also catches a broken or permission-denied catalogue
//     the version floor never could.
//
// Assertions are on FORM — the i18n key, the testid, which query was asked — never on prose.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const PRODUCTS = [{ id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' }];
const FOR_SALE = [{ id: 'p-1', price: 150, cost: 0, tax_category_key: 'product.generic', track_stock: 1 }];
const SERVICES = [{ id: 's-1', name: 'Corte', price: 1500, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];

const APP_NAMES: Record<string, string> = { 'ui.appInventory': 'Inventory', 'ui.appTaxes': 'Taxes' };

function renderKey(key: string, params?: Record<string, unknown>): string {
  if (APP_NAMES[key]) return APP_NAMES[key];
  if (!params || !Object.keys(params).length) return key;
  return `${key}(${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')})`;
}

interface SdkOptions {
  /** Modules present in this hub. Anything else answers `undefined` through the optional door. */
  installed?: string[];
  /** Query name → the code it rejects with (`undefined` = reject with no code at all). */
  failing?: Record<string, string | undefined>;
  /** Row answered by `sales.pos_settings.get`; `null` = no row saved yet (defaults apply). */
  posSettings?: Record<string, unknown> | null;
}

/** Every app whose presence this file plays with. */
const APPS = ['inventory', 'taxes', 'services', 'modifiers', 'combos', 'appointments'];

let pos: ReturnType<typeof installPosDouble>;
/** Every query name the till asked for, in order. */
const asked = (): string[] => pos.reads.map((r) => r.name);

function installSdk(opts: SdkOptions = {}) {
  const installed = new Set(opts.installed ?? ['inventory', 'taxes', 'services']);
  pos = installPosDouble({
    products: PRODUCTS,
    forSale: FOR_SALE,
    services: SERVICES,
    rules: RULES,
    taxCategories: TAX_CATS,
    settings: opts.posSettings === undefined ? {} : opts.posSettings,
    absentModules: APPS.filter((app) => !installed.has(app)),
    failing: opts.failing,
    t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => renderKey(key, params),
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

const text = (el: MountedPos, testid: string) =>
  [...el.shadowRoot.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]
    .map((n) => n.textContent ?? '')
    .join(' | ')
    .trim();

beforeEach(() => {
  document.body.innerHTML = '';
  pos?.reads.splice(0);
  history.replaceState({}, '', '/m/sales/pos');
});

describe('the catalogue is asked for through the OPTIONAL door (sales#25)', () => {
  it('a hub without inventory gets no rejection in the face and the till still mounts', async () => {
    installSdk({ installed: ['taxes'] });
    const el = await mount();
    expect(el.products, 'no catalogue and no services: the grid is empty, the till is not').toEqual([]);
    expect(el.shadowRoot.querySelector('p.err'), 'an absent optional app is not a load failure').toBeNull();
  });

  it('free price stays reachable with no catalogue at all — it is what sales+taxes sells', async () => {
    installSdk({ installed: ['taxes'] });
    const el = await mount();
    expect(el.shadowRoot.querySelector('.tile.open-price'), 'ADR-0085 is the degraded mode, so it cannot depend on the catalogue').toBeTruthy();
  });
});

describe('an ABSENT catalogue is written down, not shown as an empty screen', () => {
  it('the grid says WHY it has no products, naming the app', async () => {
    installSdk({ installed: ['taxes'] });
    const el = await mount();
    expect(text(el, 'pos-catalog-app-absent')).toContain('ui.catalogAppAbsent(app=Inventory)');
  });

  it('it is a STATUS, not an alert: nothing broke, this hub simply has no catalogue app', async () => {
    installSdk({ installed: ['taxes'] });
    const el = await mount();
    expect(el.shadowRoot.querySelector('[data-testid="pos-catalog-app-absent"]')?.getAttribute('role')).toBe('status');
  });

  it('no incident is raised: absence is legitimate and an alarm nobody can act on is trained away', async () => {
    installSdk({ installed: ['taxes'] });
    const el = await mount();
    expect(text(el, 'pos-dependency-read-failed')).toBe('');
  });

  it('with services installed the grid is NOT empty, so the degraded notice stays out of the way', async () => {
    installSdk({ installed: ['taxes', 'services'] });
    const el = await mount();
    expect(el.products.map((p) => p.id)).toEqual(['s-1']);
    expect(text(el, 'pos-catalog-app-absent'), 'a salon selling haircuts is not degraded, it is just a salon').toBe('');
  });

  it('with the catalogue installed and simply empty the message is the generic one', async () => {
    // `inventory` IS in this hub and simply has nothing in it: `[]`, never `undefined`.
    installSdk({ installed: ['inventory', 'taxes'] });
    pos.setQuery('inventory.products.list', []);
    pos.setQuery('inventory.products.for_sale', []);
    const el = await mount();
    expect(text(el, 'pos-catalog-app-absent'), 'installed and empty is a different fact from not installed').toBe('');
  });
});

describe('sales#111 / hub#960 — the till preflights the query the CHECKOUT prices against', () => {
  it('an inventory too old to answer inventory.products.for_sale is an INCIDENT, not a healthy till', async () => {
    // Before sales#25 this was bought at install time with `depends_on: {min_version: "1.2.20"}`.
    // Without the hard dependency there is no floor to validate, so the till asks the question
    // itself — and gets an answer the floor never gave it: a catalogue that is present, recent and
    // BROKEN also lands here.
    installSdk({ failing: { 'inventory.products.for_sale': 'query_not_found' } });
    const el = await mount();
    expect(text(el, 'pos-dependency-read-failed')).toContain('ui.appCatalogUnavailable(app=Inventory)');
  });

  it('the preflight actually runs when the product grid is on', async () => {
    installSdk();
    await mount();
    expect(asked()).toContain('inventory.products.for_sale');
  });

  it('it is NOT paid when the shop turned the product grid off: there is no catalogue line to price', async () => {
    installSdk({ posSettings: { sync_products: 0 } });
    await mount();
    expect(asked(), 'reading a catalogue nobody can tap is work the till pays for').not.toContain('inventory.products.for_sale');
  });

  it('an absent inventory does not raise it as an incident: the preflight follows the same classification', async () => {
    installSdk({ installed: ['taxes'] });
    const el = await mount();
    expect(text(el, 'pos-dependency-read-failed')).toBe('');
  });
});
