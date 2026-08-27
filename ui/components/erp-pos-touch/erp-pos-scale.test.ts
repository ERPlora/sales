// sales#28 — the POS end of the OPTIONAL scale contract.
//
// `ui/lib/scale-entry.test.ts` pins the contract itself (and carries the market table). This file
// pins the only thing that matters on the screen: a weight that arrives is a quantity like any
// other — it walks through `setQtyAbs`, so `toMicro` and `onGrid` judge it exactly as they judge a
// typed one — and a hub with nobody dispatching the event is the POS of today.
import { beforeEach, describe, expect, it } from 'vitest';

import { SCALE_WEIGHT_EVENT, type ScaleReading } from '../../lib/scale-entry.js';

const PRODUCTS = [
  // Priced per kg, sold in steps of 1 g (`increment_value` in µ).
  { id: 'p-tomato', name: 'Tomato', price: 1200, is_active: 1, tax_category_key: 'product.generic',
    unit_code: 'kg', price_quantity_value: 1_000_000, pricing_unit_code: 'kg' },
  { id: 'p-coffee', name: 'Coffee', price: 180, is_active: 1, tax_category_key: 'product.generic' },
];
const UNITS = [
  { id: 'u-kg', code: 'kg', name: 'Kilogram', category: 'mass', factor_num: 1, factor_den: 1, increment_value: 1000 },
  { id: 'u-g', code: 'g', name: 'Gram', category: 'mass', factor_num: 1, factor_den: 1000, increment_value: 1000 },
  { id: 'u-ud', code: 'ud', name: 'Unit', category: 'count', factor_num: 1, factor_den: 1, increment_value: 1_000_000 },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk() {
  commands = [];
  const orderLines: Record<string, unknown>[] = [];
  let nextLine = 1;
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'sales.settings.get') return [{ allow_discounts: 1 }];
      if (name === 'sales.order.lines') return orderLines;
      return [];
    },
    queryAll: async (name: string) => (
      name === 'inventory.products.list' ? PRODUCTS
        : name === 'inventory.units.list' ? UNITS
          : name === 'taxes.rules.list' ? RULES
            : []
    ),
    queryOptional: async () => undefined,
    // sales#25 — `inventory` is an OPTIONAL capability now: the till reads its catalogue through
    // this door, and for an app that IS in this hub it answers like the required one.
    queryAllOptional: async (name: string) => (
      name === 'inventory.products.list' ? PRODUCTS
        : name === 'inventory.units.list' ? UNITS
          : undefined
    ),

    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        for (const it of payload.items as Record<string, unknown>[]) {
          // The runtime persists the FROZEN unit context of the line (ADR-0147 §2.4) and gives it
          // back on `sales.order.lines`; the fake echoes it, or a reopened check would lose its
          // unit and the scale would have nothing to land on.
          orderLines.push({ id: `line-${nextLine++}`, product_id: it.product_id, product_name: it.product_name,
                            quantity: it.quantity, unit_price: it.price, line_total: it.price,
                            unit_code: it.unit_code, unit_name: it.unit_name,
                            factor_num: it.factor_num, factor_den: it.factor_den,
                            increment_value: it.increment_value,
                            price_quantity_value: it.price_quantity_value,
                            pricing_unit_code: it.pricing_unit_code });
        }
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: [`line-${nextLine++}`] };
    },
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} EUR`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} EUR`,
    t: (_c: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => {},
    hasPermission: () => true,
  };
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: { id: string; qty: number; line_id?: string; unit_code?: string }[];
  error: string;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el as unknown as Node);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function tap(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === name)!;
  tile.click();
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

/** What the installed app does when the platter settles. */
async function weigh(el: Pos, reading: Partial<ScaleReading>) {
  window.dispatchEvent(new CustomEvent(SCALE_WEIGHT_EVENT, {
    detail: { unit_code: 'kg', stable: true, ...reading },
  }));
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

const lineOf = (el: Pos, id: string) => el.cart.find((l) => l.id === id);

beforeEach(installSdk);

describe('POS · a weight that arrives from a scale', () => {
  it('becomes the quantity of the line priced by weight, and is persisted like a typed one', async () => {
    const el = await mount();
    await tap(el, 'Tomato');
    expect(lineOf(el, 'p-tomato')?.qty).toBe(1);

    await weigh(el, { value: 0.532 });

    expect(lineOf(el, 'p-tomato')?.qty).toBe(0.532);
    const written = commands.filter((c) => c.name === 'sales.order.update_line').at(-1);
    expect(written?.payload.quantity).toBe(532000); // fixed point 10⁶ — same wire as the stepper
    expect(el.error).toBe('');
  });

  it('is refused when it does not fit the article step, exactly like a typed quantity', async () => {
    const el = await mount();
    await tap(el, 'Tomato');

    await weigh(el, { value: 0.5325 }); // 532500 µ — not a multiple of the 1000 µ (1 g) step

    expect(lineOf(el, 'p-tomato')?.qty).toBe(1); // the check is NOT altered
    expect(el.error).toContain('ui.qtyOffGrid');
  });

  it('is ignored when the check has no line priced by weight — a unit line is never weighed', async () => {
    const el = await mount();
    await tap(el, 'Coffee');

    await weigh(el, { value: 0.5 });

    expect(lineOf(el, 'p-coffee')?.qty).toBe(1);
    expect(el.error).toBe(''); // silence: the scale is always talking, this is not an incident
  });

  it('is ignored on an empty check', async () => {
    const el = await mount();
    await weigh(el, { value: 0.5 });
    expect(el.cart).toHaveLength(0);
    expect(commands.filter((c) => c.name === 'sales.order.open')).toHaveLength(0);
  });

  it('is ignored while the platter has not settled', async () => {
    const el = await mount();
    await tap(el, 'Tomato');

    await weigh(el, { value: 0.532, stable: false });

    expect(lineOf(el, 'p-tomato')?.qty).toBe(1);
  });

  it('SAYS SO when the scale weighs in a unit this line is not priced in — it never converts', async () => {
    const el = await mount();
    await tap(el, 'Tomato');

    await weigh(el, { value: 532, unit_code: 'g' });

    expect(lineOf(el, 'p-tomato')?.qty).toBe(1);
    expect(el.error).toContain('ui.scaleUnitMismatch');
  });

  it('ignores a detail that is not a weight — the event is a public door', async () => {
    const el = await mount();
    await tap(el, 'Tomato');

    window.dispatchEvent(new CustomEvent(SCALE_WEIGHT_EVENT, { detail: { value: 'lots', unit_code: 'kg', stable: true } }));
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(lineOf(el, 'p-tomato')?.qty).toBe(1);
    expect(el.error).toBe('');
  });
});

describe('POS · a hub with NO scale', () => {
  it('is the POS of today: nobody dispatches, nothing changes', async () => {
    const el = await mount();
    await tap(el, 'Tomato');
    await tap(el, 'Coffee');
    const before = JSON.stringify(el.cart);
    const writes = commands.length;

    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(JSON.stringify(el.cart)).toBe(before);
    expect(commands).toHaveLength(writes);
    expect(el.error).toBe('');
  });

  it('stops listening once the till leaves the screen — no weight lands on a dead cart', async () => {
    const el = await mount();
    await tap(el, 'Tomato');
    (el as unknown as HTMLElement).remove();

    await weigh(el, { value: 0.532 });

    expect(lineOf(el, 'p-tomato')?.qty).toBe(1);
  });
});
