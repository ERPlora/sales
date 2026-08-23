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

  // sales#99 — the tabs existed but every one of them said «0»: the adapter that turns a
  // `services.services.list` row into a grid item dropped `category_id`, so no service ever
  // entered the category map. The tab counter must equal the tiles the tab really shows, and
  // selecting the tab must show ONLY that category's services — no retail, no other category.
  it('a service category tab counts its services and, selected, shows only them (sales#99)', async () => {
    const el = await mount();
    const tab = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-segment-button.cat-segment-button')]
      .find((b) => b.querySelector('.cc-n')?.textContent?.trim() === 'Cabello');
    expect(tab, 'the Cabello tab is painted').toBeTruthy();
    // The three fixtures are all in `sc-pelo` (the unconfigured one is painted, blocked).
    expect(tab!.querySelector('.cc-c')?.textContent).toMatch(/^3 /);

    (el as unknown as { activeCat: string }).activeCat = 'sc-pelo';
    await el.updateComplete;
    const names = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile .n')]
      .map((n) => n.textContent?.trim());
    expect(names).toEqual(expect.arrayContaining(['Corte de señora', 'Balayage', 'Ritual sin IVA']));
    expect(names, 'retail does not leak into a service category').not.toContain('Champú');
    expect(new Set(names).size, 'no tile is painted twice').toBe(names.length);
  });

  it('the tab counter uses a neutral noun: a salon does not sell «products» (sales#99)', async () => {
    const el = await mount();
    const counter = el.shadowRoot.querySelector('.cc-c')?.textContent ?? '';
    expect(counter).toContain('ui.items');
    expect(counter).not.toContain('ui.products');
  });
});

describe('a service the till cannot charge correctly is blocked, not mispriced', () => {
  beforeEach(() => installSdk(true));

  it('a service with no tax category is blocked and says why', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Ritual sin IVA');

    // sales#58: blocked is `aria-disabled`, never the native `disabled` — that one is
    // `pointer-events:none` on Ionic, and it would eat the tap that has to raise the reason.
    expect(tile.hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(tile.getAttribute('title')).toBe('ui.notSellableNoTaxCategory');
  });

  // SUPERSEDED by services#12. This used to assert that «from 65 €» was painted DISABLED, because
  // the till had no way to ask for the real figure and charging the starting price as if it were
  // final is a silent business error. It has that way now (sales#63), so refusing would be worse
  // than asking: the salon still could not charge a balayage.
  //
  // The blocking rule that remains is the FISCAL one — no tax category, no sale (sales#74) — which
  // the case above still covers. What replaced this one lives in `erp-pos-service-open-price.test.ts`.
  it('a service whose price is not final is offered, and asks for the amount', async () => {
    const el = await mount();
    const tile = tileOf(el, 'Balayage');

    expect(tile.hasAttribute('aria-disabled'), 'it must be sellable now').toBe(false);
    expect(tile.getAttribute('title')).not.toBe('ui.notSellableOpenPrice');
  });
});

describe('a hub without the services module', () => {
  beforeEach(() => installSdk(false));

  it('still opens the till and sells its products — the read is optional (ADR-0127)', async () => {
    const el = await mount();
    expect(() => tileOf(el, 'Champú')).not.toThrow();
    // No SERVICE tile is painted. Counting every tile would be wrong: the grid also carries the
    // open-price action, which is not a catalogue item and has nothing to do with `services`.
    for (const name of ['Corte de señora', 'Balayage', 'Ritual sin IVA']) {
      expect(() => tileOf(el, name), `${name} must not be offered`).toThrow();
    }
  });
});
