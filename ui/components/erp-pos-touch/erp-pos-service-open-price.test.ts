// services#12 — a service whose price is not final must still be chargeable.
//
// sales#89 left `from` / `hourly` / `variable` painted as NOT sellable: charging «desde 65 €» as if
// it were the price is a silent business error, and the till had no way to ask. Now it has one
// (sales#63), so the block becomes a prompt.
//
// What the market actually does, which is far less than services#12 proposes:
//
//   * Square — an item is EITHER a set price OR variable; a variable one «will just ask the cashier
//     how much». A «from X» floor does not exist: it is an open feature request.
//   * Vagaro — the price of a service is changed AT CHECKOUT, gated by the permission.
//   * Odoo — zero/undecided prices go to a QUOTATION flow, which is a sales-order thing, not a till.
//
// So: two states, not five. Non-final price → ask at the till, with the listed amount as the
// starting suggestion and the service's own tax category preselected. `free` charges 0 and needs no
// prompt. No quote engine, no min/max plumbing — nobody in the market ships that for a salon till.
//
// The amount still travels through the gated command (sales#63): the cashier typing a figure that
// no catalogue contradicts is exactly what needs the manager's PIN.
import { beforeEach, describe, expect, it } from 'vitest';

const RULES = [{ id: 'r-21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'service.generic', name: 'Servicios', is_active: 1 }];

const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    tax_category_key: 'service.generic', status: 'active' },
  { id: 's-balayage', name: 'Balayage', price: 6500, pricing_type: 'from',
    tax_category_key: 'service.generic', status: 'active' },
  { id: 's-color', name: 'Color a medida', price: 0, pricing_type: 'variable',
    tax_category_key: 'service.generic', status: 'active' },
  { id: 's-retoque', name: 'Retoque de cortesía', price: 0, pricing_type: 'free',
    tax_category_key: 'service.generic', status: 'active' },
];

let commands: { name: string; params: Record<string, unknown> }[] = [];

function installSdk() {
  commands = [];
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => {
      if (name === 'taxes.rules.list') return RULES;
      if (name === 'taxes.categories.list') return TAX_CATS;
      return [];
    },
    queryOptional: async (name: string) => (name === 'services.services.list' ? SERVICES : undefined),
    // sales#186 — the catalogue comes in whole through `queryAllOptional`.
    queryAllOptional: async (name: string) => (name === 'services.services.list' ? SERVICES : undefined),
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: `row-${commands.length}` }] };
    },
    currency: 'EUR',
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2)} €`,
    formatAmount: (u: number) => `${(u || 0).toFixed(2)} €`,
    t: (_c: unknown, k: string) => k,
    loadSlot: async () => [],
    notify: () => {},
  };
}

interface Pos {
  shadowRoot: ShadowRoot;
  cart: { name: string; price: number; is_service?: boolean }[];
  updateComplete: Promise<unknown>;
  openPriceOpen: boolean;
  openAmount: string;
  readonly openAmountCents: number;
  openDept: string;
  addOpenPrice(): Promise<void>;
}

async function mount(): Promise<Pos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as Pos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as Pos).updateComplete;
  return el as unknown as Pos;
}

function tile(el: Pos, name: string): HTMLElement {
  const found = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!found) throw new Error(`no tile for "${name}"`);
  return found;
}

async function tap(el: Pos, name: string) {
  tile(el, name).click();
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

beforeEach(() => { document.body.innerHTML = ''; installSdk(); });

describe('a service whose price is not final asks, it no longer blocks (services#12)', () => {
  it('is tappable — the block is gone', async () => {
    const el = await mount();
    expect(tile(el, 'Balayage').hasAttribute('disabled')).toBe(false);
  });

  it('opens the amount prompt instead of adding a line straight away', async () => {
    const el = await mount();
    await tap(el, 'Balayage');

    expect(el.openPriceOpen, 'the sheet must be up').toBe(true);
    expect(el.cart, 'nothing is charged until the cashier types the figure').toHaveLength(0);
  });

  // The contract is the AMOUNT, not how it is spelled: the field is money formatted by the SDK
  // (`centsToEuros`), the same as everywhere else in the till.
  it('suggests the listed amount: «from 65 €» is a starting point, not a blank slate', async () => {
    const el = await mount();
    await tap(el, 'Balayage');
    expect(el.openAmountCents).toBe(6500);
  });

  it('preselects the service own tax category, so the VAT is not left hanging', async () => {
    const el = await mount();
    await tap(el, 'Balayage');
    expect(el.openDept).toBe('service.generic');
  });

  it('charges what the cashier confirms, through the GATED command (sales#63)', async () => {
    const el = await mount();
    await tap(el, 'Balayage');
    el.openAmount = '80';
    await el.addOpenPrice();
    await el.updateComplete;

    const gated = commands.filter((c) => c.name === 'sales.order.add_open_line');
    expect(gated).toHaveLength(1);
    expect(gated[0].params).toMatchObject({ unit_price: 8000, tax_category_key: 'service.generic' });
    expect(commands.filter((c) => c.name === 'sales.order.add_line')).toHaveLength(0);
  });

  it('a variable service with no listed price opens the prompt empty', async () => {
    const el = await mount();
    await tap(el, 'Color a medida');
    expect(el.openPriceOpen).toBe(true);
    expect(el.openAmount).toBe('');
  });
});

describe('the two price types that ARE final keep going straight to the cart', () => {
  it('a fixed service is charged at its price, with no prompt', async () => {
    const el = await mount();
    await tap(el, 'Corte de señora');

    expect(el.openPriceOpen).toBe(false);
    expect(el.cart).toHaveLength(1);
    expect(el.cart[0]).toMatchObject({ name: 'Corte de señora', price: 1800, is_service: true });
  });

  // «Free» is a decided price, not an undecided one: a courtesy touch-up is charged at zero and
  // asking the cashier «how much?» would be asking a question that has an answer.
  it('a free service is charged at zero, with no prompt', async () => {
    const el = await mount();
    await tap(el, 'Retoque de cortesía');

    expect(el.openPriceOpen).toBe(false);
    expect(el.cart).toHaveLength(1);
    expect(el.cart[0]).toMatchObject({ name: 'Retoque de cortesía', price: 0 });
  });
});
