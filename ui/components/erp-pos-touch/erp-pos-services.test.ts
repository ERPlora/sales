// sales#89 — a salon must be able to charge a walk-in.
//
// In a hair salon the SERVICE is the sale and the shampoo is the extra, but the till only ever
// asked `inventory` what it could sell. Forty services with their price sat in the Services app
// with no way to turn any of them into a sale: someone walks in asking for a haircut and there is
// no screen that can charge them.
//
// So the grid also asks `services`. Three things must hold, and they pull against each other:
//
//  1. A restaurant must not be forced to install `services`. The read is OPTIONAL (ADR-0127): no
//     `depends_on`, and a hub without the module sees a till that works exactly as before.
//  2. A service is charged through the SAME door as a product — same sellability gate (sales#74),
//     same cart, same checkout — so it cannot drift from the fiscal path.
//  3. A service whose price is not final (`from`, `hourly`, `variable`) must NOT be charged at its
//     listed price. The till has no open-price flow yet, so it says so on the tile instead of
//     quietly charging the wrong amount.
import { beforeEach, describe, expect, it } from 'vitest';

const PRODUCTS = [
  { id: 'p-champu', name: 'Champú', price: 900, is_active: 1, tax_category_key: 'product.generic' },
];

/** `services.services.list` rows, shaped as that query really projects them. */
const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    duration_minutes: 45, category_id: 'sc-pelo', tax_category_key: 'service.generic',
    status: 'active' },
  { id: 's-balayage', name: 'Balayage', price: 6500, pricing_type: 'from',
    duration_minutes: 150, category_id: 'sc-pelo', tax_category_key: 'service.generic',
    status: 'active' },
  { id: 's-sincat', name: 'Ritual sin IVA', price: 3000, pricing_type: 'fixed',
    duration_minutes: 30, category_id: 'sc-pelo', status: 'unconfigured' },
];

const SERVICE_CATS = [{ id: 'sc-pelo', name: 'Cabello' }];

const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

let commands: { name: string; params?: Record<string, unknown> }[] = [];

/** `servicesInstalled: false` reproduces a hub that never installed the module. */
function installSdk(servicesInstalled: boolean) {
  commands = [];
  const missing = () => { throw new Error('module_not_installed'); };
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => {
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'taxes.rules.list') return RULES;
      if (name === 'services.services.list') return servicesInstalled ? SERVICES : missing();
      if (name === 'services.categories.list') return servicesInstalled ? SERVICE_CATS : missing();
      return [];
    },
    queryOptional: async (name: string) => {
      if (name === 'services.services.list') return servicesInstalled ? SERVICES : undefined;
      if (name === 'services.categories.list') return servicesInstalled ? SERVICE_CATS : undefined;
      return undefined;
    },
    command: async (name: string, params?: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: 'line-1' }] };
    },
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
  cart: { id: string; name: string; price: number; is_service?: boolean;
    tax_category_key?: string }[];
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

function tileOf(el: MountedPos, name: string): HTMLElement {
  const tiles = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')];
  const tile = tiles.find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  return tile;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the till offers services alongside products (sales#89)', () => {
  beforeEach(() => installSdk(true));

  it('paints a fixed-price service in the grid, so a walk-in can be charged', async () => {
    const el = await mount();
    expect(() => tileOf(el, 'Corte de señora')).not.toThrow();
  });

  it('still paints the retail products: services are added, nothing is displaced', async () => {
    const el = await mount();
    expect(() => tileOf(el, 'Champú')).not.toThrow();
  });

  it('adds the service to the cart flagged, carrying its own tax category', async () => {
    const el = await mount();
    tileOf(el, 'Corte de señora').click();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.cart).toHaveLength(1);
    expect(el.cart[0]).toMatchObject({
      name: 'Corte de señora', price: 1800, is_service: true,
      tax_category_key: 'service.generic',
    });
  });

  it('offers the service categories as tabs, so 40 services are not one flat wall', async () => {
    const el = await mount();
    const labels = [...el.shadowRoot.querySelectorAll('.cc-n')].map((n) => n.textContent?.trim());
    expect(labels).toContain('Cabello');
  });
});

describe('a service the till cannot charge correctly is blocked, not mispriced', () => {
  beforeEach(() => installSdk(true));

  it('a service with no tax category is disabled and says why', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Ritual sin IVA');

    expect(tile.hasAttribute('disabled'), 'it must not be tappable').toBe(true);
    expect(tile.getAttribute('title')).toBe('ui.notSellableNoTaxCategory');
  });

  // "From 65 €" is a starting price, not the price. Charging it as if it were final is a silent
  // business error; the till has no open-price flow yet, so it refuses out loud.
  it('a service whose price is not final is disabled with its own reason', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Balayage');

    expect(tile.hasAttribute('disabled')).toBe(true);
    expect(tile.getAttribute('title')).toBe('ui.notSellableOpenPrice');
  });
});

describe('a hub without the services module', () => {
  beforeEach(() => installSdk(false));

  it('still opens the till and sells its products — the read is optional (ADR-0127)', async () => {
    const el = await mount();
    expect(() => tileOf(el, 'Champú')).not.toThrow();
    expect(el.shadowRoot.querySelectorAll('ion-card.tile')).toHaveLength(1);
  });
});
