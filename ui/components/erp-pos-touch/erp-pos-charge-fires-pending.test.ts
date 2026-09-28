// sales#439 — charging a check with an UNSENT kitchen order sends it to the kitchen first.
//
// Before: `confirm()` went straight to `sales.complete_sale`. The kitchen ticket is only ever born
// from `sales.order.fire` (kitchen listens to `order.fired`; `order.completed` only takes rounds
// off the line), so a line still «Pending» was sold and never cooked — the customer paid for a
// dish nobody was told to make, and nothing on the screen said so.
//
// Market shape (Odoo POS restaurant, Square for Restaurants, Toast, Lightspeed Restaurant,
// Loyverse, TouchBistro, Revo XEF, SumUp POS): paying sends what is still unsent. The sheet says
// it BEFORE the tap, and a fire that fails stops the charge — once the check is closed there is no
// order left to fire it from, so charging anyway would lose the order for good.
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-1', name: 'Café', sku: 'CAF', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-2', name: 'Tostada', sku: 'TOS', price: 250, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  paying: boolean;
  busy: boolean;
  error: string;
}

/** The order rows as `sales.order.lines` answers them: each line knows whether it was fired. */
let lines: Record<string, unknown>[] = [];
let commands: { name: string; payload: Record<string, unknown> }[] = [];
/** What `sales.order.fire` does in this hub: resolve (and mark the lines), or reject with a code. */
let fireAnswer: () => Promise<unknown>;

function install(opts: { kitchen: boolean }) {
  lines = [];
  fireAnswer = async () => {
    for (const l of lines) if (!l.fired_at) { l.fired_at = '2026-09-28T10:00:00Z'; l.round_no = 1; }
    return { ok: true };
  };
  const double = installPosDouble({
    // The words the cashier READS (es), with their params: a key alone cannot show the count.
    t: (_c: Record<string, unknown>, k: string, params?: Record<string, unknown>) => {
      const raw = (es as { ui: Record<string, string> }).ui[k.replace(/^ui\./, '')] ?? k;
      return Object.entries(params ?? {}).reduce((acc, [pk, pv]) => acc.split(`{${pk}}`).join(String(pv)), raw);
    },
    settings: null,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    orderLines: () => lines.map((l) => ({ ...l })),
    loadSlot: (slot: string) => (opts.kitchen && slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire-439' }] : []),
    command: async (name: string, payload?: Record<string, unknown>) => {
      if (name === 'sales.order.open') {
        const first = (payload?.lines as Record<string, unknown>[] | undefined)?.[0];
        lines.push({ id: 'l1', product_id: first?.product_id ?? 'p-1', product_name: 'Café', unit_price: 180, quantity: 1_000_000, tax_category_key: 'product.generic', fired_at: null, round_no: 0 });
        return { ok: true, new_ids: ['o1', 'l1'] };
      }
      if (name === 'sales.order.add_line') {
        const id = `l${lines.length + 1}`;
        lines.push({ id, product_id: payload?.product_id ?? 'p-2', product_name: 'Tostada', unit_price: 250, quantity: 1_000_000, tax_category_key: 'product.generic', fired_at: null, round_no: 0 });
        return { ok: true, new_ids: [id] };
      }
      if (name === 'sales.order.fire') return fireAnswer();
      return { ok: true, rows: [{ id: 'sale-1' }] };
    },
  });
  commands = double.commands;
}

const names = () => commands.map((c) => c.name);
const notice = (el: Pos) => el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-pay-kitchen-pending"]');

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function add(el: Pos, name: string) {
  [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')].find((t) => t.textContent?.includes(name))!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

async function openCharge(el: Pos) {
  el.openPay();
  await el.updateComplete;
}

/** Charges through the button the cashier taps, and lets every await in flight settle. */
async function charge(el: Pos) {
  await tenderExactCash(el);
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-pay-confirm"]')!.click();
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

beforeEach(() => { commands = []; });

describe('charging with an unsent kitchen order (sales#439)', () => {
  it('fires the pending lines to the kitchen BEFORE the sale is closed', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    await openCharge(el);
    await charge(el);

    const fire = names().indexOf('sales.order.fire');
    const sale = names().indexOf('sales.complete_sale');
    expect(fire, 'the unsent order goes to the kitchen').toBeGreaterThan(-1);
    expect(sale, 'and the sale is still charged').toBeGreaterThan(-1);
    expect(fire, 'first the kitchen, then the check is closed').toBeLessThan(sale);
    const payload = commands[fire].payload;
    expect(payload.order_id).toBe('o1');
    expect((payload.items as { order_item_id: string }[]).map((l) => l.order_item_id)).toEqual(['l1']);
  });

  it('the sheet says it before the tap: one item', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    await openCharge(el);

    expect(notice(el), 'the charge sheet tells the cashier the order goes to the kitchen').toBeTruthy();
    expect(notice(el)!.textContent!.trim()).toBe('El producto pendiente de la comanda se enviará a cocina al cobrar.');
  });

  it('the sheet says it before the tap: several items, with the count', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    await add(el, 'Tostada');
    await openCharge(el);

    expect(notice(el)!.textContent!.trim()).toBe('Los 2 productos pendientes de la comanda se enviarán a cocina al cobrar.');
  });

  it('the words: «se enviará a cocina al cobrar», in es and en, singular and plural', () => {
    expect(es.ui.chargeFiresPendingOne).toBe('El producto pendiente de la comanda se enviará a cocina al cobrar.');
    expect(es.ui.chargeFiresPending).toBe('Los {count} productos pendientes de la comanda se enviarán a cocina al cobrar.');
    expect(en.ui.chargeFiresPendingOne).toBe('The pending item of the current order goes to the kitchen when you charge.');
    expect(en.ui.chargeFiresPending).toBe('The {count} pending items of the current order go to the kitchen when you charge.');
    expect(es.ui.chargeFireFailed).toBe('No se ha podido enviar la comanda a cocina, así que no se ha cobrado. Vuelve a intentarlo.');
    expect(en.ui.chargeFireFailed).toBe("Couldn't send the order to the kitchen, so nothing was charged. Try again.");
  });

  it('a fire that fails stops the charge and says why, in the sheet', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    await openCharge(el);
    fireAnswer = async () => {
      const e = new Error('the kitchen queue is unreachable') as Error & { code: string };
      e.code = 'sales.order_id_required';
      throw e;
    };
    await charge(el);

    expect(names(), 'no sale while the kitchen did not get the order').not.toContain('sales.complete_sale');
    expect(el.paying, 'the sheet stays open to try again').toBe(true);
    expect(el.busy, 'and the button is alive again').toBe(false);
    const why = 'No se ha podido enviar la comanda a cocina, así que no se ha cobrado. Vuelve a intentarlo.';
    expect(el.error).toBe(why);
    expect(el.shadowRoot.querySelector('.sheet-foot .pay-err')?.textContent?.trim()).toBe(why);
  });

  it('«nothing to fire» (another till already sent it) is not a failure: the charge goes on', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    await openCharge(el);
    fireAnswer = async () => {
      for (const l of lines) l.fired_at = '2026-09-28T10:00:00Z';
      const e = new Error('already fired') as Error & { code: string };
      e.code = 'sales.nothing_to_fire';
      throw e;
    };
    await charge(el);

    expect(names()).toContain('sales.complete_sale');
    expect(el.error).toBe('');
  });

  it('a fire already in flight (the kitchen button, a moment before) is joined, never doubled', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const base = fireAnswer;
    fireAnswer = async () => { await held; return base(); };
    el.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    await openCharge(el);
    const done = charge(el);
    await new Promise((r) => setTimeout(r, 0));
    expect(names(), 'the check is not closed while its order is still on its way').not.toContain('sales.complete_sale');
    release();
    await done;
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));

    expect(names().filter((n) => n === 'sales.order.fire'), 'one fire, not two').toHaveLength(1);
    expect(names()).toContain('sales.complete_sale');
  });

  it('a round added AFTER an earlier fire is fired again at Charge (the earlier fire is over)', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    el.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    await add(el, 'Tostada');
    commands.length = 0;
    await openCharge(el);
    await charge(el);

    const fire = commands.find((c) => c.name === 'sales.order.fire');
    expect(fire, 'the dessert round reaches the kitchen too').toBeTruthy();
    expect((fire!.payload.items as { order_item_id: string }[]).map((i) => i.order_item_id)).toEqual(['l2']);
    expect(names().indexOf('sales.order.fire')).toBeLessThan(names().indexOf('sales.complete_sale'));
  });

  it('the kitchen button on an EMPTY check opens no order and fires nothing', async () => {
    install({ kitchen: true });
    const el = await mount();
    el.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));

    expect(names()).not.toContain('sales.order.open');
    expect(names()).not.toContain('sales.order.fire');
  });

  it('with nothing pending there is no fire and no notice', async () => {
    install({ kitchen: true });
    const el = await mount();
    await add(el, 'Café');
    // Sent from the kitchen button first, the usual way.
    el.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    commands.length = 0;
    await openCharge(el);

    expect(notice(el)).toBeNull();
    await charge(el);
    expect(names()).not.toContain('sales.order.fire');
    expect(names()).toContain('sales.complete_sale');
  });

  it('without Kitchen (a salon, a shop) nothing is fired and nothing is said', async () => {
    install({ kitchen: false });
    const el = await mount();
    await add(el, 'Café');
    await openCharge(el);

    expect(notice(el)).toBeNull();
    await charge(el);
    expect(names()).not.toContain('sales.order.fire');
    expect(names()).toContain('sales.complete_sale');
  });
});
