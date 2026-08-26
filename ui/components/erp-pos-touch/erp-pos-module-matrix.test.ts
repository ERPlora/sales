// sales#25 — THE MODULE MATRIX, at the screen.
//
// Dropping `inventory` from `depends_on` turns "which apps are installed" into a real space of
// hubs, not a single one. The acceptance criterion of the issue is that space walked end to end:
// every combination has to leave a till that a business can work a shift on, and the ONLY thing
// that may stop it charging is a missing `taxes` — the one dependency that stays hard, because
// `sales.complete_sale` declares `taxes.rules.list` as a `required` read and no sale can close
// without a fiscal rule.
//
// The money door has its own half of this matrix in the Rust handler
// (`handler/src/lib.rs`, `mod optional_catalogue_matrix`): what is charged, and what is refused,
// for the same combinations. This file is the other half: what the person at the counter SEES.
//
// Absence is modelled the way the runtime models it — the optional door answers `undefined`, the
// required one rejects with `module_not_installed` (hub#1074, ADR-0400) — so a combination cannot
// come back green because the double was kinder than the hub.
import { beforeEach, describe, expect, it } from 'vitest';

const PRODUCTS = [{ id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' }];
const FOR_SALE = [{ id: 'p-1', price: 150, cost: 0, tax_category_key: 'product.generic', track_stock: 1 }];
const SERVICES = [{ id: 's-1', name: 'Corte', price: 1500, pricing_type: 'fixed', status: 'active', tax_category_key: 'service.generic' }];
const SERVICE_CATS = [{ id: 'sc-1', name: 'Cabello' }];
const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];

function runtimeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** Every query name the till asked for, in order — the till's real contract surface. */
let asked: string[] = [];

/** A hub with exactly these apps installed. `sales` and the core (`hub.`) are always there. */
function installHub(...apps: string[]) {
  const installed = new Set(apps);
  const answer = (name: string): unknown => {
    switch (name) {
      case 'inventory.products.list': return PRODUCTS;
      case 'inventory.products.for_sale': return FOR_SALE;
      case 'services.services.list': return SERVICES;
      case 'services.categories.list': return SERVICE_CATS;
      case 'taxes.rules.list': return RULES;
      case 'taxes.categories.list': return TAX_CATS;
      default: return [];
    }
  };
  const serve = async (name: string): Promise<unknown> => {
    asked.push(name);
    const owner = name.split('.')[0];
    if (owner !== 'sales' && owner !== 'hub' && !installed.has(owner)) throw runtimeError('module_not_installed');
    return answer(name);
  };
  const serveOptional = async (name: string): Promise<unknown> => {
    try {
      return await serve(name);
    } catch (e) {
      if ((e as { code?: string }).code === 'module_not_installed') return undefined;
      throw e;
    }
  };
  (globalThis as Record<string, unknown>).erplora = {
    query: serve,
    queryAll: serve,
    queryOptional: serveOptional,
    queryAllOptional: serveOptional,
    command: async () => ({ ok: true, new_ids: ['ord-1', 'line-1'] }),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string, params?: Record<string, unknown>) =>
      (!params || !Object.keys(params).length
        ? key
        : `${key}(${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')})`),
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

const has = (el: MountedPos, sel: string) => !!el.shadowRoot.querySelector(sel);
/** The till's OWN verdict on whether it can take money today (the sales#185 preflight). */
const canCharge = (el: MountedPos) => !has(el, '.missing-app-notice');
const ids = (el: MountedPos) => el.products.map((p) => p.id);

beforeEach(() => {
  document.body.innerHTML = '';
  asked = [];
  history.replaceState({}, '', '/m/sales/pos');
});

describe('sales + taxes only — the smallest hub that can charge', () => {
  it('sells by FREE PRICE and says why there is no grid, instead of showing a blank screen', async () => {
    installHub('taxes');
    const el = await mount();
    expect(ids(el), 'nothing to paint: no catalogue app and no services app').toEqual([]);
    expect(has(el, '.tile.open-price'), 'ADR-0085 is the whole offer here').toBe(true);
    expect(el.shadowRoot.querySelector('[data-testid="catalog-app-absent"]')?.textContent ?? '')
      .toContain('ui.catalogAppAbsent');
    expect(canCharge(el), 'taxes is here, so money can be taken').toBe(true);
  });

  it('raises no incident: an app that was never installed did not break', async () => {
    installHub('taxes');
    const el = await mount();
    expect(has(el, '[data-testid="dependency-read-failed"]')).toBe(false);
  });
});

describe('+ inventory — the products grid, priced by whoever owns the catalogue', () => {
  it('paints the products and drops the degraded notice', async () => {
    installHub('taxes', 'inventory');
    const el = await mount();
    expect(ids(el)).toEqual(['p-1']);
    expect(has(el, '[data-testid="catalog-app-absent"]')).toBe(false);
    expect(canCharge(el)).toBe(true);
  });

  it('the stock rule is NOT reimplemented here: the till only reads the sale catalogue', async () => {
    // inventory#48 put `track_stock` per article, and enforcing it is `inventory`'s job through
    // `decrease_on_sale`. What `sales` does is emit the snapshot; asking for a stock query here
    // would be a second authority over the same fact.
    installHub('taxes', 'inventory');
    await mount();
    expect([...new Set(asked.filter((q) => q.startsWith('inventory.')))].sort()).toEqual([
      'inventory.categories.list',
      'inventory.product_categories',
      'inventory.products.for_sale',
      'inventory.products.list',
      'inventory.units.list',
    ]);
  });
});

describe('+ services — the salon, with no stock app anywhere', () => {
  it('paints the services in the same grid and charges through the same fiscal door', async () => {
    installHub('taxes', 'services');
    const el = await mount();
    expect(ids(el)).toEqual(['s-1']);
    expect(canCharge(el)).toBe(true);
    expect(has(el, '[data-testid="catalog-app-absent"]'), 'a salon with its services is not degraded').toBe(false);
  });

  it('products and services share ONE grid when both apps are there, products first', async () => {
    installHub('taxes', 'inventory', 'services');
    const el = await mount();
    expect(ids(el)).toEqual(['p-1', 's-1']);
  });
});

describe('+ customers — the fiscal identity rides a slot, never a hard read', () => {
  it('the till asks customers for NOTHING: the context arrives through the POS slot (ADR-0132)', async () => {
    installHub('taxes', 'inventory', 'customers');
    await mount();
    expect(asked.filter((q) => q.startsWith('customers.')),
      'a read here would be a dependency the salon never asked for').toEqual([]);
  });

  it('and a hub WITHOUT customers is the same till: nothing degrades, nothing warns', async () => {
    installHub('taxes', 'inventory');
    const el = await mount();
    expect(ids(el)).toEqual(['p-1']);
    expect(has(el, '[data-testid="dependency-read-failed"]')).toBe(false);
    expect(canCharge(el)).toBe(true);
  });
});

describe('+ pricing — absent means the BASE price, and there is no silent path to degrade down', () => {
  it('the till consults `pricing` for nothing at all, installed or not (pricing#9)', async () => {
    // `pricing` is a complete engine with no consumer: no module references `pricing.*`. That is
    // the state pricing#9 documents, and it is what makes "absent = base price" true by
    // construction — the price of trust comes from the catalogue (`inventory_product.price` /
    // `services_service.price`) and the server re-prices every line against it (sales#68).
    //
    // The day tariffs enter the roadmap, pricing#9 requires the resolution to be
    // server-authoritative and a BROKEN contract to block or ask for an authorised override,
    // never to fall back to the browser's price in silence. This assertion is the guard that the
    // silent path is not opened by accident before that contract exists.
    installHub('taxes', 'inventory', 'pricing');
    const el = await mount();
    expect(asked.filter((q) => q.startsWith('pricing.'))).toEqual([]);
    expect(ids(el)).toEqual(['p-1']);
    expect(canCharge(el)).toBe(true);
  });
});

describe('taxes is the ONE absence that stops the till, and it says so before anyone types', () => {
  it('with no tax app the till refuses to promise a charge it cannot close', async () => {
    installHub('inventory');
    const el = await mount();
    expect(canCharge(el), 'sales.complete_sale declares taxes.rules.list required (sales#21)').toBe(false);
  });

  it('every other combination leaves a till that can charge', async () => {
    for (const combo of [['taxes'], ['taxes', 'inventory'], ['taxes', 'services'],
                         ['taxes', 'customers'], ['taxes', 'pricing'],
                         ['taxes', 'inventory', 'services', 'customers', 'pricing']]) {
      document.body.innerHTML = '';
      asked = [];
      installHub(...combo);
      const el = await mount();
      expect(canCharge(el), `[${combo.join(' + ')}] must be able to take money`).toBe(true);
      expect(has(el, '.tile.open-price'), `[${combo.join(' + ')}] keeps the free-price door`).toBe(true);
    }
  });
});
