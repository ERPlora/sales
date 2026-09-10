// sales#277 — the cart has to SAY whose line each one is.
//
// sales#273 gave the line its own `staff_id` and made the per-professional close add up. It left
// the screen exactly as it was: Ana cuts, Marta colours, and the cart paints two rows reading
// «Corte · 18,00 €» that are indistinguishable. The receptionist cannot check she moved the chip
// right, and the commission of the day rides on that check being possible.
//
// So this file holds the OTHER half of sales#273: not what travels on the wire — that one is
// `erp-pos-line-staff.test.ts` — but what the person at the till can READ, and what she can fix
// when she reads it and it is wrong.
//
// 🔴 The name is NOT sealed on the browser's line, and that is why the resume case below is not
// decoration. ADR-0141 rebuilds the cart from `sales_order_item` rows, which carry an opaque
// `staff_id` and no name: a label that only worked because this session happened to pick the
// person from the chip would go blank on the very reload the salon does every morning.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const HUB_USERS = [
  { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true },
  { id: 'u-marta', name: 'Marta', role: 'employee', is_active: true },
];

const SERVICES = [
  { id: 's-corte', name: 'Corte', price: 1800, pricing_type: 'fixed', duration_minutes: 30,
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
  // A SECOND service, and not decoration: `addNow` folds a repeated tap into the line already in
  // the cart when the product AND the professional match (sales#273). Ringing «Corte» again to
  // prove where the chip points would merge instead of adding, and the assertion below would be
  // reading the previous line's payload — green with the chip moved under it.
  { id: 's-color', name: 'Color', price: 4500, pricing_type: 'fixed', duration_minutes: 90,
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];
const SERVICE_CATS = [{ id: 'sc-pelo', name: 'Cabello' }];
const TAX_CATS = [{ key: 'service.generic', name: 'Servicios', is_active: 1 }];
const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];

/** Installs the double. `resuming` seeds the rows of a check that was ALREADY open — the salon
 *  reopening this morning what it left last night, with nobody having touched the chip yet. */
function installSdk(resuming: Record<string, unknown>[] = []): void {
  commands = [];
  orderLines = [...resuming];
  const persist = (item: Record<string, unknown>, id: string) => {
    orderLines.push({
      id, product_id: item.product_id, product_name: item.product_name,
      quantity: item.quantity, unit_price: item.price ?? item.unit_price,
      line_total: item.price ?? item.unit_price,
      tax_category_key: item.tax_category_key, is_service: item.is_service ? 1 : 0,
      staff_id: item.staff_id ?? null,
    });
  };
  installPosDouble({
    paymentMethods: METHODS,
    orders: resuming.length ? [{ id: 'ord-1', status: 'open', label: 'Salón' }] : [],
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: [],
    rules: RULES,
    services: SERVICES,
    serviceCategories: SERVICE_CATS,
    taxCategories: TAX_CATS,
    users: HUB_USERS,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        (payload.items as Record<string, unknown>[]).forEach((i, n) => persist(i, `line-${n + 1}`));
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      if (name === 'sales.order.add_line') {
        const id = `line-${orderLines.length + 1}`;
        persist(payload, id);
        return { ok: true, new_ids: [id] };
      }
      if (name === 'sales.order.set_line_staff') {
        const row = orderLines.find((l) => l.id === payload.line_id);
        if (row) row.staff_id = payload.staff_id ?? null;
        return { ok: true, new_ids: [] };
      }
      return { ok: true, new_ids: ['sale-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: { id: string; line_id?: string; staff_id?: string }[];
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function settle(el: Pos): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

async function tap(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

/** Moves the TICKET chip, which is what seals the next line (sales#273). */
async function serve(el: Pos, name: string) {
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="staff-chip"]')?.click();
  await settle(el);
  const opt = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="staff-option"]')]
    .find((o) => o.textContent?.trim() === name);
  if (!opt) throw new Error(`no staff option for "${name}"`);
  opt.click();
  await settle(el);
}

/** What each cart row says about its professional, top to bottom. */
const painted = (el: Pos) => [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="line-staff"]')]
  .map((n) => n.textContent?.trim() ?? '');

beforeAll(async () => { await import('./erp-pos-touch'); }, 60_000);

beforeEach(() => { localStorage.clear(); installSdk(); });

describe('every cart line says whose it is (sales#277)', () => {
  it('tells two identical services apart by the professional printed on each', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await serve(el, 'Marta');
    await tap(el, 'Corte');
    await settle(el);

    expect(el.cart, 'one row per professional (sales#273)').toHaveLength(2);
    expect(painted(el), 'the two «Corte» are no longer identical').toEqual(['Ana', 'Marta']);
  });

  it('paints NOTHING on a line nobody was named on — same rule as the note', async () => {
    const el = await mount();
    await tap(el, 'Corte');
    await settle(el);

    expect(el.cart[0].staff_id ?? null, 'the chip was left on «me»').toBeNull();
    expect(painted(el), 'no sub-line under a line the header attributes').toEqual([]);
  });

  // Somebody who left the salon is not an option to serve today — the picker filters them out
  // (sales#179) — but the lines they rang are still on yesterday's check and in the close.
  it('names a professional who is no longer offered, instead of leaving the row opaque', async () => {
    HUB_USERS.push({ id: 'u-lucia', name: 'Lucía', role: 'employee', is_active: false });
    installSdk([{
      id: 'line-9', product_id: 's-corte', product_name: 'Corte', quantity: 1_000_000,
      unit_price: 1800, line_total: 1800, tax_category_key: 'service.generic',
      is_service: 1, staff_id: 'u-lucia',
    }]);
    localStorage.setItem('erplora.pos.currentCheck', 'ord-1');
    try {
      const el = await mount();
      await settle(el);
      expect(painted(el)).toEqual(['Lucía']);

      el.shadowRoot.querySelector<HTMLElement>('[data-testid="staff-chip"]')?.click();
      await settle(el);
      const offered = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="staff-option"]')]
        .map((o) => o.textContent?.trim());
      expect(offered, 'and she is still not offered to serve today').toEqual(['Ana', 'Marta']);
    } finally {
      HUB_USERS.pop();
    }
  });

  // The morning after: the rows come back from the server with an opaque id and no name, and
  // nobody has touched the chip in this session.
  it('names the professional of a RESUMED check, where the row carries only an id', async () => {
    installSdk([{
      id: 'line-9', product_id: 's-corte', product_name: 'Corte', quantity: 1_000_000,
      unit_price: 1800, line_total: 1800, tax_category_key: 'service.generic',
      is_service: 1, staff_id: 'u-marta',
    }]);
    localStorage.setItem('erplora.pos.currentCheck', 'ord-1');
    const el = await mount();
    await settle(el);

    expect(el.cart.map((l) => l.staff_id), 'the check came back').toEqual(['u-marta']);
    expect(painted(el)).toEqual(['Marta']);
  });
});

describe('and it can be corrected without rebuilding the line (sales#277)', () => {
  /** Taps the professional printed on row `n` and picks somebody else. */
  async function reassign(el: Pos, n: number, to: string) {
    const rows = el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="line-staff"]');
    if (!rows[n]) throw new Error(`row ${n} paints no professional`);
    rows[n].click();
    await settle(el);
    const opt = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="staff-option"]')]
      .find((o) => o.textContent?.trim() === to);
    if (!opt) throw new Error(`no staff option for "${to}"`);
    opt.click();
    await settle(el);
  }

  it('moves the line to the other professional and PERSISTS it on the order row', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await settle(el);

    await reassign(el, 0, 'Marta');

    const moved = commands.find((c) => c.name === 'sales.order.set_line_staff');
    expect(moved, 'the correction reaches the ORDER row, not just the browser').toBeDefined();
    expect(moved!.payload.line_id).toBe('line-1');
    expect(moved!.payload.staff_id).toBe('u-marta');
    expect(el.cart[0].staff_id).toBe('u-marta');
    expect(painted(el)).toEqual(['Marta']);
  });

  it('does NOT remove and re-add the line: no row is deleted and none is born', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    const before = commands.filter((c) => c.name === 'sales.order.add_line').length;
    await settle(el);

    await reassign(el, 0, 'Marta');

    expect(commands.some((c) => c.name === 'sales.order.remove_line'), 'nothing is deleted').toBe(false);
    expect(commands.filter((c) => c.name === 'sales.order.add_line').length, 'nothing is re-added')
      .toBe(before);
    expect(el.cart, 'still one line').toHaveLength(1);
  });

  // Correcting the row the receptionist is looking at must not silently re-aim the NEXT tap:
  // the chip is what seals new lines (sales#273) and it belongs to the check, not to this row.
  it('leaves the TICKET chip and the other line where they were', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await serve(el, 'Marta');
    await tap(el, 'Corte');
    await settle(el);

    await reassign(el, 1, 'Ana');

    expect(el.cart.map((l) => l.staff_id), 'only the row that was tapped moved')
      .toEqual(['u-ana', 'u-ana']);

    await tap(el, 'Color');
    await settle(el);
    const added = commands.filter((c) => c.name === 'sales.order.add_line');
    expect(added.at(-1)!.payload.product_id, 'a line of its own, not a merge').toBe('s-color');
    expect(added.at(-1)!.payload.staff_id, 'the chip still seals the next line for Marta')
      .toBe('u-marta');
  });
});
