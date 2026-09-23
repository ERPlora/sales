// sales#283 — the «Print receipt» switch of the charge sheet decides whether THIS sale's receipt
// is printed.
//
// Before: the switch wrote `printOnCharge`, the button passed it to `confirm(_print)` and
// `confirm` threw it away. Whoever switched it off still got paper; whoever switched it on in a
// shop with auto-print off still got none. The shell prints on `sale.completed`, so the choice
// has to travel with the sale (`print_receipt`) for the shell to obey it.
//
// Market shape (Square, Toast): the shop's setting is the switch's DEFAULT, and what the cashier
// leaves on the sheet is what applies to that sale — in both directions.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';

const PRODUCTS = [
  { id: 'p-1', name: 'Corte', sku: 'CUT', price: 1190, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** `printing` absent (undefined) or present with its auto-print flag (0/1). */
function install(autoPrint: number | undefined) {
  const double = installPosDouble({
    settings: null,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    ...(autoPrint === undefined ? {} : { printingSettings: [{ auto_print_on_sale: autoPrint, open_drawer_on_sale: 0 }] }),
    command: async () => ({ ok: true, rows: [{ id: 'sale-1' }] }),
  });
  commands = double.commands;
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
}

type Toggle = HTMLElement & { checked?: boolean };
const toggle = (el: Pos) => el.shadowRoot.querySelector<Toggle>('[data-testid="pos-print-on-charge"]');
const sales = () => commands.filter((c) => c.name === 'sales.complete_sale');

async function atCharge(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  await openCharge(el);
  return el;
}

/** One line in the cart and the charge sheet open. */
async function openCharge(el: Pos) {
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
}

async function flip(el: Pos, checked: boolean) {
  const t = toggle(el);
  expect(t, 'the switch is on the sheet').toBeTruthy();
  t!.checked = checked;
  t!.dispatchEvent(new CustomEvent('ionChange', { detail: { checked } }));
  await el.updateComplete;
}

/** Charges through the button the cashier taps, not through a method call. */
async function charge(el: Pos) {
  await tenderExactCash(el);
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-pay-confirm"]')!.click();
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

beforeAll(async () => { await import('./erp-pos-touch'); }, 30_000);
beforeEach(() => { commands = []; });

describe('the switch starts from the shop setting', () => {
  it('auto-print ON: the switch opens ON and the sale asks for its receipt', async () => {
    install(1);
    const el = await atCharge();
    expect(toggle(el)?.checked).toBe(true);
    await charge(el);
    expect(sales()).toHaveLength(1);
    expect(sales()[0].payload.print_receipt).toBe(true);
  });

  it('auto-print OFF: the switch opens OFF and the sale asks for no receipt', async () => {
    install(0);
    const el = await atCharge();
    expect(toggle(el)?.checked).toBe(false);
    await charge(el);
    expect(sales()[0].payload.print_receipt).toBe(false);
  });
});

describe('what the cashier leaves on the sheet is what applies to this sale', () => {
  it('switched OFF with auto-print ON: no receipt', async () => {
    install(1);
    const el = await atCharge();
    await flip(el, false);
    await charge(el);
    expect(sales()[0].payload.print_receipt).toBe(false);
  });

  it('switched ON with auto-print OFF: the receipt is printed', async () => {
    install(0);
    const el = await atCharge();
    await flip(el, true);
    await charge(el);
    expect(sales()[0].payload.print_receipt).toBe(true);
  });

  it('the choice is for ONE sale: the next charge starts from the setting again', async () => {
    install(1);
    const el = await atCharge();
    await flip(el, false);
    await charge(el);
    await openCharge(el);
    expect(toggle(el)?.checked).toBe(true);
    await charge(el);
    expect(sales().map((s) => s.payload.print_receipt)).toEqual([false, true]);
  });
});

describe('without the printing app there is no setting to start from', () => {
  it('an untouched switch sends no choice, so the shell keeps deciding as it always did', async () => {
    install(undefined);
    const el = await atCharge();
    await charge(el);
    expect(sales()).toHaveLength(1);
    expect('print_receipt' in sales()[0].payload).toBe(false);
  });

  it('a switch the cashier DID touch is still sent', async () => {
    install(undefined);
    const el = await atCharge();
    await flip(el, false);
    await charge(el);
    expect(sales()[0].payload.print_receipt).toBe(false);
  });
});

describe('the contract closes it', () => {
  it('`print_receipt` is DECLARED in complete_sale.json, or the runtime would refuse the sale', async () => {
    const schema = (await import('../../../schemas/complete_sale.json')).default as {
      additionalProperties?: boolean;
      properties: Record<string, { type?: string }>;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.print_receipt?.type).toBe('boolean');
  });
});
