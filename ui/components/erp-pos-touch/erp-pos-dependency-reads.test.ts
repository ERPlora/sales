// sales#25 — a HARD dependency that fails must be VISIBLE; only its legitimate absence degrades.
//
// The five reads the till makes against `inventory` and `taxes` all ended in `.catch(() => [])`.
// That line answers two different facts with the same empty catalogue:
//
//   · the app is not in this hub (a forced uninstall, hub#1101; the ADR-0128 cascade) — legitimate,
//     the till sells services and free-price lines and says nothing;
//   · the app IS here and its query broke — an incident, and today it opens the shift with an empty
//     grid, no warning, and a cashier who cannot tell it from "somebody deleted the catalogue".
//
// The runtime already distinguishes them (hub#1074, ADR-0400). This file pins that the SCREEN does
// too. Assertions are on FORM — the i18n key and the app it names — never on prose.
import { beforeEach, describe, expect, it } from 'vitest';

const PRODUCTS = [{ id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];

/** A rejection the way the SDK surfaces a runtime refusal: an Error carrying the stable code. */
function runtimeError(code?: string): Error {
  const e = new Error(code ?? 'boom');
  return code ? Object.assign(e, { code }) : e;
}

/** App NAMES are answered like the real catalogue does, because the component falls back to the
 *  raw id when a key has no translation: echoing them would hide whether the notice goes through
 *  i18n at all. Everything else echoes its key, so the assertions pin form, not prose. */
const APP_NAMES: Record<string, string> = { 'ui.appInventory': 'Inventory', 'ui.appTaxes': 'Taxes' };

function renderKey(key: string, params?: Record<string, unknown>): string {
  if (APP_NAMES[key]) return APP_NAMES[key];
  if (!params || !Object.keys(params).length) return key;
  return `${key}(${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')})`;
}

interface SdkOptions {
  /** Query name → the code it rejects with (`undefined` = reject with no code at all). */
  failing?: Record<string, string | undefined>;
}

function installSdk(opts: SdkOptions = {}) {
  const failing = opts.failing ?? {};
  const answer = (name: string): unknown => {
    if (name === 'inventory.products.list') return PRODUCTS;
    if (name === 'taxes.rules.list') return RULES;
    if (name === 'taxes.categories.list') return TAX_CATS;
    return [];
  };
  const serve = async (name: string): Promise<unknown> => {
    if (name in failing) throw runtimeError(failing[name]);
    return answer(name);
  };
  (globalThis as Record<string, unknown>).erplora = {
    query: serve,
    queryAll: serve,
    queryOptional: async () => undefined,
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string, params?: Record<string, unknown>) => renderKey(key, params),
    loadSlot: async () => [],
    notify: () => {},
    hasPermission: () => true,
  };
}

interface MountedPos {
  shadowRoot: ShadowRoot;
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

const noticeText = (el: MountedPos) =>
  [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="dependency-read-failed"]')]
    .map((n) => n.textContent ?? '')
    .join(' | ');

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState({}, '', '/m/sales/pos');
});

describe('a hard dependency that BREAKS is said out loud', () => {
  it('names the app when its catalogue read fails with no code', async () => {
    installSdk({ failing: { 'inventory.products.list': undefined } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Inventory)');
  });

  it('a refusal that is NOT absence (permission, broken handler) is an incident too', async () => {
    installSdk({ failing: { 'inventory.products.list': 'permission_denied' } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Inventory)');
  });

  it('the tax departments read counts as well, and names `taxes`', async () => {
    installSdk({ failing: { 'taxes.categories.list': 'db_error' } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Taxes)');
  });

  it('says each app ONCE even when several of its reads break', async () => {
    installSdk({
      failing: {
        'inventory.products.list': undefined,
        'inventory.categories.list': undefined,
        'inventory.units.list': undefined,
      },
    });
    const el = await mount();
    const notices = el.shadowRoot.querySelectorAll('[data-testid="dependency-read-failed"]');
    expect(notices.length, 'three warnings for one broken app is noise, not information').toBe(1);
  });

  it('falls back to the raw id when the app has no translated name', async () => {
    // Saying `inventory` is ugly; inventing a name would not be true. Same rule as the
    // missing-app notice.
    installSdk({ failing: { 'inventory.products.list': undefined } });
    (globalThis as Record<string, unknown>).erplora = {
      ...((globalThis as Record<string, unknown>).erplora as Record<string, unknown>),
      t: (_c: unknown, key: string, params?: Record<string, unknown>) =>
        (!params || !Object.keys(params).length
          ? key
          : `${key}(${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')})`),
    };
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=inventory)');
  });

  it('the notice is an ALERT: it is not ambient information, the catalogue is incomplete', async () => {
    installSdk({ failing: { 'inventory.products.list': undefined } });
    const el = await mount();
    const notice = el.shadowRoot.querySelector('[data-testid="dependency-read-failed"]');
    expect(notice?.getAttribute('role')).toBe('alert');
  });
});

describe('a hard dependency that is simply NOT THERE degrades in silence', () => {
  it('an uninstalled `inventory` leaves no alarm behind', async () => {
    installSdk({
      failing: {
        'inventory.products.list': 'module_not_installed',
        'inventory.categories.list': 'module_not_installed',
        'inventory.product_categories': 'module_not_installed',
        'inventory.units.list': 'module_not_installed',
      },
    });
    const el = await mount();
    expect(noticeText(el), 'absence is a legitimate state, not an incident').toBe('');
  });

  it('a module switched off by the ADR-0128 cascade is absence too', async () => {
    installSdk({ failing: { 'inventory.products.list': 'module_inactive' } });
    const el = await mount();
    expect(noticeText(el)).toBe('');
  });

  it('nothing is painted when every read answers', async () => {
    installSdk();
    const el = await mount();
    expect(noticeText(el), 'a warning with nothing to warn about is trained away').toBe('');
  });
});
