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

const PRODUCTS = [{ id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' }];
const SERVICES = [{ id: 's-1', name: 'Corte', price: 1500, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

interface SdkOptions {
  /** Row answered by `sales.pos_settings.get`; `null` = no row saved yet. */
  posSettings?: Record<string, unknown> | null;
  /** `sales.settings.get` rejects the way the runtime refuses a cashier. */
  settingsDenied?: boolean;
}

/** Every query name the till asked for, in order. */
let asked: string[] = [];

function installSdk(opts: SdkOptions = {}) {
  const posSettings = opts.posSettings === undefined ? {} : opts.posSettings;
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      asked.push(name);
      if (name === 'sales.settings.get') {
        if (opts.settingsDenied) throw Object.assign(new Error('nope'), { code: 'permission_denied' });
        return [];
      }
      if (name === 'sales.pos_settings.get') return posSettings ? [posSettings] : [];
      return [];
    },
    queryAll: async (name: string) => {
      asked.push(name);
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'taxes.rules.list') return RULES;
      return [];
    },
    queryAllOptional: async (name: string) => {
      asked.push(name);
      // sales#25 — `inventory` is an OPTIONAL capability now, so its catalogue comes in through
      // this door. For an app that IS in this hub it answers exactly like the required one.
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'services.services.list') return SERVICES;
      return [];
    },
    queryOptional: async (name: string) => {
      asked.push(name);
      return undefined;
    },
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => {},
    hasPermission: () => true,
  };
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
  asked = [];
  history.replaceState({}, '', '/m/sales/pos');
});

describe('sync_products decides whether the product catalogue feeds the grid', () => {
  it('OFF: the products are not even read, let alone shown', async () => {
    installSdk({ posSettings: { sync_products: 0, sync_services: 1 } });
    const el = await mount();
    expect(asked, 'reading a catalogue nobody will see is work the till pays for').not.toContain('inventory.products.list');
    expect(ids(el)).toEqual(['s-1']);
  });

  it('ON: the products are read and shown', async () => {
    installSdk({ posSettings: { sync_products: 1, sync_services: 0 } });
    const el = await mount();
    expect(asked).toContain('inventory.products.list');
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
    expect(asked).not.toContain('inventory.categories.list');
    expect(asked).not.toContain('inventory.product_categories');
  });
});

describe('sync_services decides whether the service catalogue feeds the grid', () => {
  it('OFF: the services are not read', async () => {
    installSdk({ posSettings: { sync_products: 1, sync_services: 0 } });
    const el = await mount();
    expect(asked).not.toContain('services.services.list');
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
    expect(asked).toContain('sales.pos_settings.get');
    expect(asked, 'the till must not be blind to its own policy').not.toContain('services.services.list');
    expect(ids(el)).toEqual(['p-1']);
  });

  it('a policy read that FAILS falls back to the defaults: the till never opens empty', async () => {
    installSdk();
    (globalThis as Record<string, unknown>).erplora = {
      ...((globalThis as Record<string, unknown>).erplora as Record<string, unknown>),
      query: async (name: string) => {
        asked.push(name);
        if (name === 'sales.pos_settings.get') throw new Error('boom');
        return [];
      },
    };
    const el = await mount();
    expect(ids(el)).toEqual(['p-1', 's-1']);
  });
});
