// sales#179 — the till says WHO IS SERVING, and lets the cashier change it.
//
// The default is a SERVER decision: `complete_sale` attributes the sale to the user with a session
// when the payload names nobody, so the till does not have to know who is logged in (nothing in the
// module SDK tells it). What the till owns is the other half of what Toast, Square for Restaurants
// and Lightspeed all do: the server is pinned to the check from the moment it opens, and it can be
// TRANSFERRED — the waiter who takes the table is not always the one at the terminal.
//
// Two things are load-bearing here:
//
//  * The person list comes from `hub.users.list`, the CORE namespace (ADR-0192). Personnel is core,
//    not the `staff` module: depending on `staff` would make a hard dependency out of a till that
//    has to work in a hub with no staff module at all. Its team joins the list only as an OPTIONAL
//    read (ADR-0127) — sales#318, in `erp-pos-staff-team.test.ts`.
//  * Choosing nobody sends `staff_id: null` — on purpose. The till must not guess the session user
//    and send an id it invented; the server resolves it, and it is the only one that can.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const HUB_USERS = [
  { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true },
  { id: 'u-luis', name: 'Luis', role: 'manager', is_active: true },
  { id: 'u-gone', name: 'Marta', role: 'employee', is_active: false },
];

const APPOINTMENT = {
  id: 'ap-1', customer_id: 'c-ana', customer_name: 'Ana Ruiz',
  staff_id: 'st-lucia', staff_name: 'Lucía',
  service_id: 's-corte', service_name: 'Corte de señora', service_price: 1800,
};

const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];

const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

let commands: { name: string; params?: Record<string, unknown> }[] = [];
let pos: ReturnType<typeof installPosDouble>;
/** Every query name the till asked for, in order. */
const queried = (): string[] => pos.reads.map((r) => r.name);

function installSdk(opts: { users?: unknown[]; usersFail?: boolean } = {}) {
  commands = [];
  pos = installPosDouble({
    users: opts.users ?? HUB_USERS,
    ...(opts.usersFail ? { failing: { 'hub.users.list': 'permission_denied' } } : {}),
    // When the order opens, the till RE-READS its lines from the server (the row is the authority),
    // so without this the ticket would come out empty and nothing would be fired.
    orderLines: [{ id: 'line-1', product_id: 'p-x', product_name: 'Croquetas', unit_price: 900, quantity: 1_000_000 }],
    byIdempotencyKey: [{ id: 'sale-1' }],
    rules: RULES,
    services: SERVICES,
    serviceCategories: [],
    appointment: [APPOINTMENT],
    command: async (name: string, params?: Record<string, unknown>) => {
      commands.push({ name, params });
      // The order id comes back in `new_ids` (the host is the only authority on ids), not `rows`.
      if (name === 'sales.order.open') return { new_ids: ['ord-1'] };
      if (name === 'sales.order.add_line') return { new_ids: ['line-1'] };
      return { rows: [{ id: 'line-1' }] };
    },
    // The real `t` INTERPOLATES its params; so does the stub, because what is asserted here is the
    // NAME read on the chip, not the key.
    t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  });
}

interface MountedPos {
  shadowRoot: ShadowRoot;
  cart: { id: string; name: string; price: number; qty?: number; is_service?: boolean }[];
  updateComplete: Promise<unknown>;
  confirm(print?: boolean): Promise<void>;
}

async function mount(search = ''): Promise<MountedPos> {
  window.history.replaceState({}, '', `/m/sales/pos${search}`);
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as MountedPos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as MountedPos).updateComplete;
  return el as unknown as MountedPos;
}

async function settle(el: MountedPos): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

function chip(el: MountedPos): HTMLElement | null {
  return el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-staff-chip"]');
}

function options(el: MountedPos): HTMLElement[] {
  return [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-staff-option"]')];
}

// The till module pulls in lit + OutfitKit: importing it the first time costs seconds and, if that
// falls INSIDE the first test, what you see is a timeout that has nothing to do with what is being
// asserted. It is paid here, outside the tests' clock.
beforeAll(async () => { await import('./erp-pos-touch'); }, 60_000);

beforeEach(() => { document.body.innerHTML = ''; installSdk(); });

describe('who is serving this check', () => {
  it('shows the chip on every check, so the attribution is never invisible', async () => {
    const el = await mount();
    expect(chip(el)).not.toBeNull();
    expect(chip(el)?.textContent).toContain('ui.servedBy');
  });

  it('asks nobody until the chip is tapped: the till does not query the staff on boot', async () => {
    const el = await mount();
    expect(queried()).not.toContain('hub.users.list');
    chip(el)?.click();
    await settle(el);
    expect(queried()).toContain('hub.users.list');
  });

  it('lists the hub users who can still serve, and leaves the deactivated out', async () => {
    const el = await mount();
    chip(el)?.click();
    await settle(el);
    const names = options(el).map((o) => o.textContent?.trim());
    expect(names).toContain('Ana');
    expect(names).toContain('Luis');
    expect(names).not.toContain('Marta');
  });

  it('sends staff_id NULL while nobody is chosen — the SERVER attributes it, not the browser', async () => {
    const el = await mount();
    el.cart = [{ id: 'p-x', name: 'Champú', price: 900 }] as MountedPos['cart'];
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.params?.staff_id).toBeNull();
  });

  it('transfers the check: the chosen person is who the sale is attributed to', async () => {
    const el = await mount();
    chip(el)?.click();
    await settle(el);
    options(el).find((o) => o.textContent?.trim() === 'Luis')?.click();
    await settle(el);

    expect(chip(el)?.textContent).toContain('Luis');
    el.cart = [{ id: 'p-x', name: 'Champú', price: 900 }] as MountedPos['cart'];
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.params?.staff_id).toBe('u-luis');
  });

  it('hands the check back: choosing "me" returns to the server default', async () => {
    const el = await mount();
    chip(el)?.click();
    await settle(el);
    options(el).find((o) => o.textContent?.trim() === 'Luis')?.click();
    await settle(el);

    chip(el)?.click();
    await settle(el);
    el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-staff-option-me"]')?.click();
    await settle(el);

    el.cart = [{ id: 'p-x', name: 'Champú', price: 900 }] as MountedPos['cart'];
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.params?.staff_id).toBeNull();
  });

  it('names the booked professional when the till was opened from an appointment', async () => {
    const el = await mount('?appointment_id=ap-1');
    expect(chip(el)?.textContent).toContain('Lucía');
  });

  it('says so instead of showing an empty sheet when the hub lists nobody', async () => {
    installSdk({ users: [] });
    const el = await mount();
    chip(el)?.click();
    await settle(el);
    expect(el.shadowRoot.querySelector('[data-testid="pos-staff-empty"]')).not.toBeNull();
  });

  it('says so instead of failing silently when the list cannot be read', async () => {
    installSdk({ usersFail: true });
    const el = await mount();
    chip(el)?.click();
    await settle(el);
    expect(el.shadowRoot.querySelector('[data-testid="pos-staff-error"]')).not.toBeNull();
  });
});

describe('the kitchen ticket', () => {
  it('carries the waiter of the check, so the pass knows who to call', async () => {
    const el = await mount();
    chip(el)?.click();
    await settle(el);
    options(el).find((o) => o.textContent?.trim() === 'Luis')?.click();
    await settle(el);

    el.cart = [{ id: 'p-x', name: 'Croquetas', price: 900, qty: 1 }] as MountedPos['cart'];
    el.shadowRoot.dispatchEvent(new CustomEvent('erp:order-fire', { bubbles: true, composed: true }));
    for (let i = 0; i < 6; i += 1) await settle(el);

    const fired = commands.find((c) => c.name === 'sales.order.fire');
    expect(fired?.params?.waiter_id).toBe('u-luis');
  });
});
