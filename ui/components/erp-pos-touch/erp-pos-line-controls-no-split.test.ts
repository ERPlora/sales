// sales#449 — a line's own buttons do what they say, and nothing else: they never mark the line
// for splitting the payment.
//
// Tapping a line of the check marks it for «each pays their own» (ADR-0146): «Charge» then bills
// ONLY the marked lines and leaves the rest of the order open. The comp, note and discount buttons
// and the quantity stepper live INSIDE that line, and their tap bubbled up to it: raising a coffee
// by one quietly marked it, «Charge» said «Charging 1 line…» and billed one coffee, and the table
// was left with the rest pending. A second tap (+ and then comp) unmarked it, so it looked random.
// Square, Toast and Lightspeed all do the same thing here: a control inside the line does its own
// job; selecting the line is tapping the line. The professional button already did (sales#277).
//
// These tests tap each control of a two-line check through the screen, then press «Charge».
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-coffee', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-toast', name: 'Tostada', sku: 'TOS', price: 250, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-10', tax_category_key: 'product.generic', rate_pct: 10, parent_id: null, is_active: 1 }];
// Card only: it charges the exact amount, so «Charge» needs nothing typed before confirming.
const METHODS = [{ id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 10 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];

function installSdk() {
  commands = [];
  orderLines = [];
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    orderLines: () => orderLines,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        orderLines = [{
          id: 'line-1', product_id: 'p-coffee', product_name: 'Café', quantity: 1_000_000,
          unit_price: 150, line_total: 150, tax_category_key: 'product.generic',
        }];
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: ['x'] };
    },
  });
}

interface Line { id: string; line_id?: string; name: string; price: number; qty: number; staff_id?: string }
interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  confirm(print?: boolean): Promise<void>;
  cart: Line[];
  error: string;
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
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

/** A table with a coffee (line-1) and a toast (line-2, served by Ana), both saved rows of the
 *  open order. */
async function twoLineCheck(): Promise<Pos> {
  const el = await mount();
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await settle(el);
  expect(el.cart.map((l) => l.line_id), 'the coffee is a saved row').toEqual(['line-1']);
  el.cart = [
    el.cart[0],
    { ...el.cart[0], id: 'p-toast', line_id: 'line-2', name: 'Tostada', price: 250, staff_id: 'u-ana' },
  ];
  await settle(el);
  commands = [];
  return el;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const lineItem = (el: Pos, lineId: string) => $(el, `ion-item[data-testid="pos-line-${lineId}"]`)!;
/** The split mark the cashier sees at the start of a line: a ticked circle when it is marked. */
const mark = (el: Pos, lineId: string) => lineItem(el, lineId).querySelector('ion-icon.selmark')?.getAttribute('name');

/** Each control inside a line, tapped the way the finger does: the click lands on the control and
 *  bubbles (composed, from inside the stepper's shadow root) through the line. */
const CONTROLS: Record<string, (el: Pos, lineId: string) => void> = {
  comp: (el, id) => $(el, `[data-testid="pos-line-${id}-gift"]`)!.click(),
  note: (el, id) => $(el, `[data-testid="pos-line-${id}-note"]`)!.click(),
  discount: (el, id) => $(el, `[data-testid="pos-line-${id}-discount"]`)!.click(),
  professional: (el, id) => lineItem(el, id).querySelector<HTMLElement>('[data-testid="pos-line-staff"]')!.click(),
  'quantity +': (el, id) => {
    const stepper = lineItem(el, id).querySelector<HTMLElement>('ok-qty-stepper')!;
    stepper.click();
    stepper.dispatchEvent(new CustomEvent('ok-change', { detail: { value: 2 } }));
  },
};

/** Presses «Charge» and confirms. Returns the sale sent to the hub and whether the sheet said it
 *  was charging only part of the check («Charging 1 line of …»). */
async function chargeWithCard(el: Pos): Promise<Record<string, unknown> & { partialNotice: boolean }> {
  $(el, '[data-testid="pos-charge"]')!.click();
  await settle(el);
  const partialNotice = !!$(el, '.pay-split');
  await el.confirm();
  await settle(el);
  const sale = commands.find((c) => c.name === 'sales.complete_sale');
  expect(sale, `the sale is charged (screen error: «${el.error}»)`).toBeTruthy();
  return { ...sale!.payload, partialNotice };
}

beforeEach(() => { localStorage.clear(); installSdk(); });

describe('sales#449 · the control positive: tapping the LINE marks it for splitting', () => {
  it('the line body toggles its split mark, and «Charge» then bills only that line', async () => {
    const el = await twoLineCheck();
    expect(mark(el, 'line-2'), 'unmarked to start with').toBe('ellipse-outline');
    lineItem(el, 'line-2').click();
    await settle(el);
    expect(mark(el, 'line-2')).toBe('checkmark-circle');

    const sale = await chargeWithCard(el);
    expect(sale.line_ids, 'a marked line is a partial charge').toEqual(['line-2']);
    expect(sale.keep_order_open).toBe(true);
    expect(sale.partialNotice, 'the sheet says it charges part of the check').toBe(true);
  });

  it('a tap through the line\'s OWN inner button (Ionic paints one in its shadow root) still marks it', async () => {
    // `<ion-item button>` renders a native <button> around a <slot> in its shadow root, and a
    // real tap on the line's text travels through it. That button is the line itself, not one of
    // its controls: only what sits in the line's light DOM may count as a control.
    const el = await twoLineCheck();
    const item = lineItem(el, 'line-2');
    const root = item.shadowRoot ?? item.attachShadow({ mode: 'open' });
    root.innerHTML = '<button class="item-native"><slot></slot></button>';
    root.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await settle(el);
    expect(mark(el, 'line-2')).toBe('checkmark-circle');
  });
});

describe('sales#449 · a control inside a line never marks it for splitting', () => {
  for (const [name, tap] of Object.entries(CONTROLS)) {
    it(`tapping the line's ${name} leaves both lines unmarked`, async () => {
      const el = await twoLineCheck();
      tap(el, 'line-2');
      await settle(el);
      expect(mark(el, 'line-2'), `the ${name} did not mark the line`).toBe('ellipse-outline');
      expect(mark(el, 'line-1')).toBe('ellipse-outline');
    });

    it(`tapping the ${name} on a line ALREADY marked keeps the mark (it does not toggle it off)`, async () => {
      const el = await twoLineCheck();
      lineItem(el, 'line-2').click();
      await settle(el);
      tap(el, 'line-2');
      await settle(el);
      expect(mark(el, 'line-2'), `the ${name} did not unmark the line`).toBe('checkmark-circle');
    });
  }
});

describe('sales#449 · after using a line control, «Charge» charges the WHOLE check', () => {
  for (const name of ['quantity +', 'note', 'comp'] as const) {
    it(`after the ${name}, the sale carries both lines and closes the order`, async () => {
      const el = await twoLineCheck();
      CONTROLS[name](el, 'line-2');
      await settle(el);
      const sale = await chargeWithCard(el);
      expect(sale.line_ids ?? null, 'not a partial charge: no line selection travels').toBeNull();
      expect(sale.keep_order_open, 'the table is settled, nothing left pending').toBe(false);
      expect((sale.items as { product_id: string }[]).map((i) => i.product_id)).toEqual(['p-coffee', 'p-toast']);
      expect(sale.partialNotice, 'no «Charging 1 line» on the sheet').toBe(false);
    });
  }
});

describe('sales#449 · a MARKED line taken off the check leaves no mark behind', () => {
  // With the stepper no longer toggling the mark, «−» down to 0 on a marked line removes the row
  // while its id stays selected. «Charge» then billed the lines of a selection that no longer
  // matched anything: `complete_sale` went out with NO items and closed the order, so the coffee
  // left on the check was never charged.
  const removeWithStepper = (el: Pos, lineId: string) => {
    const stepper = lineItem(el, lineId).querySelector<HTMLElement>('ok-qty-stepper')!;
    stepper.click();
    stepper.dispatchEvent(new CustomEvent('ok-change', { detail: { value: 0 } }));
  };

  it('marking the toast and stepping it down to 0 → «Charge» bills the coffee that is left, whole', async () => {
    const el = await twoLineCheck();
    lineItem(el, 'line-2').click();
    await settle(el);
    removeWithStepper(el, 'line-2');
    await el.queue(async () => undefined);
    await settle(el);
    expect(el.cart.map((l) => l.line_id), 'the toast is off the check').toEqual(['line-1']);

    const sale = await chargeWithCard(el);
    expect((sale.items as { product_id: string }[]).map((i) => i.product_id), 'the coffee is charged').toEqual(['p-coffee']);
    expect(sale.line_ids ?? null).toBeNull();
    expect(sale.keep_order_open, 'the table is settled').toBe(false);
    expect(sale.partialNotice, 'no «Charging 1 line» for a line that is gone').toBe(false);
  });

  it('marking the coffee and removing the toast → one line left, nothing to split: the whole check', async () => {
    const el = await twoLineCheck();
    lineItem(el, 'line-1').click();
    await settle(el);
    removeWithStepper(el, 'line-2');
    await el.queue(async () => undefined);
    await settle(el);
    expect(el.cart.map((l) => l.line_id)).toEqual(['line-1']);

    const sale = await chargeWithCard(el);
    expect((sale.items as { product_id: string }[]).map((i) => i.product_id)).toEqual(['p-coffee']);
    expect(sale.keep_order_open).toBe(false);
    expect(sale.partialNotice, 'a single line is the whole check, not «Charging 1 line»').toBe(false);
  });

  it('with three lines, removing one marked line keeps the OTHER mark and charges just that one', async () => {
    const el = await twoLineCheck();
    el.cart = [...el.cart, { ...el.cart[0], id: 'p-toast', line_id: 'line-3', name: 'Tostada', price: 250 }];
    await settle(el);
    lineItem(el, 'line-2').click();
    lineItem(el, 'line-3').click();
    await settle(el);
    removeWithStepper(el, 'line-3');
    await el.queue(async () => undefined);
    await settle(el);
    expect(el.cart.map((l) => l.line_id)).toEqual(['line-1', 'line-2']);
    expect(mark(el, 'line-2'), 'the toast the cashier marked is still marked').toBe('checkmark-circle');

    const sale = await chargeWithCard(el);
    expect(sale.line_ids).toEqual(['line-2']);
    expect(sale.keep_order_open, 'the coffee stays on the check').toBe(true);
  });
});
