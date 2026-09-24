// sales#273 — in a salon the ticket has TWO professionals, so the line is what carries one.
//
// Ana cuts, Marta colours, the client pays once. Until now the till only had a chip per TICKET
// (sales#179): whoever was on it took the whole sale, and the cash-up by professional could not be
// made to add up. Migration 034 gave the sale line its own `staff_id`; this file holds the half
// that decides whether anything ever reaches it — what the SCREEN puts on the wire.
//
// 🔴 The gesture is deliberately NOT a second picker per line. Square, Fresha, Vagaro, Booksy and
// Zenoti all do the same thing: the line is SEALED with whoever is on the chip the moment it is
// added, and a two-professional ticket is rung by moving the chip between taps. Adding a picker to
// every row would be one more control on the busiest screen of the product for a case the market
// already solves with the control that is there.
//
// Which is why the merge is load-bearing here. `addNow` folds a repeated tap into the line that is
// already in the cart; if it does not look at the professional, Ana's cut and Marta's cut become
// one line of quantity 2 attributed to Ana — the exact bug being removed, now written by the fix.
import { beforeEach, describe, expect, it } from 'vitest';
import schema from '../../../schemas/complete_sale.json';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const HUB_USERS = [
  { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true },
  { id: 'u-marta', name: 'Marta', role: 'employee', is_active: true },
];

/** `services.services.list` rows, shaped as that query really projects them. */
const SERVICES = [
  { id: 's-corte', name: 'Corte', price: 1800, pricing_type: 'fixed', duration_minutes: 30,
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
  { id: 's-color', name: 'Color', price: 4500, pricing_type: 'fixed', duration_minutes: 90,
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];
const SERVICE_CATS = [{ id: 'sc-pelo', name: 'Cabello' }];

/** A salon charges plenty of work at a price it only knows once it is done (services#12): the
 *  cashier types the figure and the line goes through the GATED door (`add_open_line`, sales#63).
 *  It is still the professional's work, so it is still the professional's line. */
const OPEN_PRICED = { id: 's-mechas', name: 'Mechas', price: 0, pricing_type: 'variable',
  category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' };
const TAX_CATS = [{ key: 'service.generic', name: 'Servicios', is_active: 1 }];

/** The smallest `combos.options.all` there is: one pack, one group nobody has to choose from — a
 *  salon's «bono», rung by whoever is on the chip like everything else. */
const PACK = [{
  combo_id: 'c-bono', combo_name: 'Bono 5 cortes', combo_kitchen_name: '', combo_price: 8000,
  combo_tax_category_key: 'service.generic', supply_kind: 'service', combo_is_active: 1,
  group_id: 'g-libre', group_name: 'Incluye', min_choices: 1, max_choices: 1, allow_repeat: 0,
  group_sort_order: 0, option_id: 'o-corte', source: 'service', source_ref: 's-corte',
  price_delta: 0, option_sort_order: 0,
}];

const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
// Two of them on purpose: with a single method the till picks it by itself and never paints the
// tender buttons, so the driver below would be exercising a screen the salon does not see.
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk() {
  commands = [];
  // The order's rows, as the server would hold them: the till RE-READS them when the order opens,
  // so anything this fixture drops is dropped from the cart too — which is precisely the round
  // trip under test.
  const orderLines: Record<string, unknown>[] = [];
  const persist = (item: Record<string, unknown>, id: string) => {
    orderLines.push({
      id, product_id: item.product_id, product_name: item.product_name,
      product_sku: item.product_sku, quantity: item.quantity,
      unit_price: item.price ?? item.unit_price, line_total: item.price ?? item.unit_price,
      tax_category_key: item.tax_category_key, is_service: item.is_service ? 1 : 0,
      staff_id: item.staff_id ?? null,
    });
  };
  installPosDouble({
    paymentMethods: METHODS,
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: [],
    rules: RULES,
    services: [...SERVICES, OPEN_PRICED],
    serviceCategories: SERVICE_CATS,
    taxCategories: TAX_CATS,
    comboOptions: PACK,
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
      return { ok: true, new_ids: ['sale-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
  cart: { id: string; qty: number; staff_id?: string }[];
  error: string;
  openAmount: string;
  addOpenPrice(): Promise<void>;
  comboSheet?: unknown;
  confirmCombo(): Promise<void>;
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

/** Taps the tile whose name is painted on it — the salon's actual gesture. */
async function tap(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

/** Moves the chip to a professional by the name printed on the option. */
async function serve(el: Pos, name: string) {
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-staff-chip"]')?.click();
  await settle(el);
  const opt = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-staff-option"]')]
    .find((o) => o.textContent?.trim() === name);
  if (!opt) throw new Error(`no staff option for "${name}"`);
  opt.click();
  await settle(el);
}

async function pay(el: Pos, method: string) {
  el.openPay();
  await el.updateComplete;
  const btn = [...el.shadowRoot.querySelectorAll<HTMLElement>('.sheet button.pm-btn')]
    .find((b) => b.textContent?.trim() === method);
  if (!btn) throw new Error(`no payment button for "${method}"`);
  btn.click();
  await el.updateComplete;
}

const checkout = () => commands.find((c) => c.name === 'sales.complete_sale');
const itemsOf = (c: { payload: Record<string, unknown> }) =>
  c.payload.items as Record<string, unknown>[];

beforeEach(installSdk);

describe('each line is charged to the professional who did it (sales#273)', () => {
  it('seals the line with whoever is on the chip when it is added', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await pay(el, 'Tarjeta');
    await el.confirm();

    const [line] = itemsOf(checkout()!);
    expect(line.product_id).toBe('s-corte');
    expect(line.staff_id, 'the cut is Ana\'s').toBe('u-ana');
  });

  it('rings the same service for TWO professionals as two lines, not one of quantity 2', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await serve(el, 'Marta');
    await tap(el, 'Corte');
    await pay(el, 'Tarjeta');
    await el.confirm();

    const items = itemsOf(checkout()!);
    expect(items, 'one line per professional').toHaveLength(2);
    expect(items.map((i) => i.staff_id).sort()).toEqual(['u-ana', 'u-marta']);
    // Neither of them may have absorbed the other's quantity: that is the money moving from one
    // professional's cash-up to the other's, silently.
    expect(items.map((i) => i.quantity)).toEqual([1_000_000, 1_000_000]);
  });

  it('still folds a repeated tap by the SAME professional into one line', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await tap(el, 'Corte');
    await pay(el, 'Tarjeta');
    await el.confirm();

    const items = itemsOf(checkout()!);
    expect(items, 'two cuts by Ana are one line').toHaveLength(1);
    expect(items[0].quantity).toBe(2_000_000);
    expect(items[0].staff_id).toBe('u-ana');
  });

  it('mixes professionals and services in one ticket, each line to its own', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await serve(el, 'Marta');
    await tap(el, 'Color');
    await pay(el, 'Tarjeta');
    await el.confirm();

    const items = itemsOf(checkout()!);
    const by = Object.fromEntries(items.map((i) => [i.product_id, i.staff_id]));
    expect(by).toEqual({ 's-corte': 'u-ana', 's-color': 'u-marta' });
  });

  // The other two doors a line can be born through. Neither is `addNow`, and both were where
  // `is_service` (sales#89), the supplements (pm#93) and the set menu (sales#169) each had to be
  // fixed a second time — a field put on one door only is a field the other one drops.
  it('seals an OPEN-PRICE service too: the figure is typed, the professional is not', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Mechas');
    el.openAmount = '95';
    await el.addOpenPrice();
    await settle(el);

    const gated = commands.find((c) => c.name === 'sales.order.add_open_line');
    expect(gated, 'an open price goes through its own gated door (sales#63)').toBeDefined();
    expect(gated!.payload.staff_id).toBe('u-ana');
  });

  it('seals a PACK the same way', async () => {
    const el = await mount();
    await serve(el, 'Marta');
    await tap(el, 'Bono 5 cortes');
    el.shadowRoot.querySelector<HTMLElement>('[data-combo-sheet] [data-option-id]')?.click();
    await settle(el);
    await el.confirmCombo();
    await settle(el);

    expect(el.cart.map((l) => l.staff_id)).toEqual(['u-marta']);
  });

  // With nobody on the chip the SERVER attributes the sale to the session user. The browser must
  // not guess an id: it has none to guess with (nothing in the module SDK names the session user).
  it('sends no line attribution at all while nobody is chosen', async () => {
    const el = await mount();
    await tap(el, 'Corte');
    await pay(el, 'Tarjeta');
    await el.confirm();

    const [line] = itemsOf(checkout()!);
    expect(line.staff_id ?? null).toBeNull();
  });
});

// ADR-0141: the cart is not held in memory. Every tap writes its row and the cart is rebuilt from
// that table — on reload, on resuming a parked check, and after every fire to the kitchen. An
// attribution that only lives on the browser's line is gone by then, with nothing said.
describe('the ORDER behind the cart carries it, so a resumed check still attributes', () => {
  it('puts it on the line that OPENS the order', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');

    const open = commands.find((c) => c.name === 'sales.order.open');
    expect(open, 'the cart is backed by a real order (ADR-0141)').toBeDefined();
    expect(itemsOf(open!)[0].staff_id).toBe('u-ana');
  });

  it('puts it on every line added afterwards', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await serve(el, 'Marta');
    await tap(el, 'Color');

    const add = commands.find((c) => c.name === 'sales.order.add_line');
    expect(add, 'the second line goes through `add_line`').toBeDefined();
    expect(add!.payload.staff_id).toBe('u-marta');
  });

  // The screen re-reads the persisted rows the moment the order opens, and the row wins. If the
  // read drops the column, the very first line loses its professional before anyone can pay.
  it('survives the re-read the till does right after opening the order', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await settle(el);

    expect(el.cart.map((l) => l.staff_id)).toEqual(['u-ana']);
  });
});

// `complete_sale.json` closes the payload (`additionalProperties: false`), so a key the till
// invents is a refusal before the handler ever runs.
describe('what the till sends is declared by the schema', () => {
  type JsonSchema = { properties: Record<string, JsonSchema>; items?: JsonSchema };
  const itemSchema = (schema as unknown as JsonSchema).properties.items.items as JsonSchema;

  it('holds for a two-professional ticket', async () => {
    const el = await mount();
    await serve(el, 'Ana');
    await tap(el, 'Corte');
    await serve(el, 'Marta');
    await tap(el, 'Color');
    await pay(el, 'Tarjeta');
    await el.confirm();

    for (const line of itemsOf(checkout()!)) {
      for (const key of Object.keys(line)) {
        expect(itemSchema.properties[key], `line field \`${key}\` is not declared in complete_sale.json`).toBeDefined();
      }
    }
  });
});
