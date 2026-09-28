// sales#443 — the controls of a line change THAT line, even when the same product is on the check twice.
//
// The same product on two lines is ordinary: Ana's haircut and Marta's (sales#273), a burger and
// another one «no onion» (pm#93), one of them on the house. Every line control has to say WHICH
// ROW it is. The note, the line discount and the professional already did (`line_id`); the
// quantity stepper and the gift button said which PRODUCT — `l.id` is the `product_id` — so the
// component looked it up with `cart.find(l => l.id === id)` and always landed on the FIRST line of
// that product. The cashier raised Marta's quantity and Ana's went up; comped the second burger and
// the first one was comped. The total still added up, the wrong row was charged, comped, or went to
// the other professional's close.
//
// These tests tap the SECOND row through the screen, the way the cashier does.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-corte', name: 'Corte', sku: 'COR', price: 1500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];
const USERS = [
  { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true },
  { id: 'u-marta', name: 'Marta', role: 'employee', is_active: true },
];

/** Commands the hub refuses right now, by name. */
let refused = new Set<string>();
let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];

function installSdk() {
  refused = new Set();
  commands = [];
  orderLines = [];
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    users: USERS,
    orderLines: () => orderLines,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (refused.has(name)) throw new Error(`REFUSED ${name}`);
      if (name === 'sales.order.open') {
        orderLines = [{
          id: 'line-1', product_id: 'p-corte', product_name: 'Corte', quantity: 1_000_000,
          unit_price: 1500, line_total: 1500, tax_category_key: 'product.generic',
        }];
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: ['x'] };
    },
  });
}

interface Line {
  id: string; line_id?: string; qty: number; is_gift?: boolean; gift_reason?: string; staff_id?: string;
  combo_id?: string; combo_choices?: { option_id: string; product_name: string; category_id: string | null }[];
}
interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: Line[];
  error: string;
  addComboLine(combo: { combo_id: string; name: string; tax_category_key: string },
    choices: { option_id: string; product_name: string; category_id: string | null }[], previewCents: number): Promise<void>;
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

/** A check with the same service twice: Ana's cut (line-1, qty 1) and Marta's (line-2, qty 2). */
async function twoCutsOnOneCheck(): Promise<Pos> {
  const el = await mount();
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await settle(el);
  expect(el.cart.map((l) => l.line_id), 'the first cut is a saved row').toEqual(['line-1']);
  el.cart = [
    { ...el.cart[0], staff_id: 'u-ana' },
    { ...el.cart[0], line_id: 'line-2', qty: 2, staff_id: 'u-marta' },
  ];
  await settle(el);
  commands = [];
  return el;
}

const row = (el: Pos, lineId: string) => el.cart.find((l) => l.line_id === lineId)!;
const writes = (name: string) => commands.filter((c) => c.name === name);
/** The n-th line of the cart on screen (0-based), the way the cashier sees it. */
const lineItems = (el: Pos) => [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-list.lines ion-item, .lines ion-item')]
  .filter((i) => i.querySelector('ok-qty-stepper'));

async function setQtyOnRow(el: Pos, index: number, value: number): Promise<void> {
  const stepper = lineItems(el)[index]!.querySelector('ok-qty-stepper')!;
  stepper.dispatchEvent(new CustomEvent('ok-change', { detail: { value } }));
  await settle(el);
}

async function giftRow(el: Pos, index: number): Promise<void> {
  // sales#448 — every row names its controls by its own row id, so the comp is `<row hook>-gift`.
  const item = lineItems(el)[index]!;
  item.querySelector<HTMLElement>(`[data-testid="${item.dataset.testid}-gift"]`)!.click();
  await settle(el);
}

beforeEach(() => { localStorage.clear(); installSdk(); });

describe('sales#443 · the quantity of the SECOND line of a product', () => {
  it('the screen paints both rows, each with its own stepper', async () => {
    const el = await twoCutsOnOneCheck();
    expect(lineItems(el)).toHaveLength(2);
  });

  it('raising it raises THAT line, and the first one is left as it was', async () => {
    const el = await twoCutsOnOneCheck();
    await setQtyOnRow(el, 1, 3);

    expect(row(el, 'line-2').qty, 'Marta\'s line is the one that went up').toBe(3);
    expect(row(el, 'line-1').qty, 'Ana\'s line is untouched').toBe(1);
    expect(writes('sales.order.update_line').map((c) => [c.payload.line_id, c.payload.quantity]),
      'the order row written is Marta\'s').toEqual([['line-2', 3_000_000]]);
  });

  it('taking it to zero removes THAT line, not the first one', async () => {
    const el = await twoCutsOnOneCheck();
    await setQtyOnRow(el, 1, 0);

    expect(el.cart.map((l) => l.line_id), 'Ana\'s line stays on the check').toEqual(['line-1']);
    expect(writes('sales.order.remove_line').map((c) => c.payload.line_id)).toEqual(['line-2']);
  });

  it('the stepper of the FIRST line still changes the first one', async () => {
    const el = await twoCutsOnOneCheck();
    await setQtyOnRow(el, 0, 4);

    expect(row(el, 'line-1').qty).toBe(4);
    expect(row(el, 'line-2').qty).toBe(2);
    expect(writes('sales.order.update_line').map((c) => c.payload.line_id)).toEqual(['line-1']);
  });

  it('a refused change puts back THAT line and leaves the other one alone', async () => {
    const el = await twoCutsOnOneCheck();
    refused.add('sales.order.update_line');
    await setQtyOnRow(el, 1, 5);

    expect(row(el, 'line-2').qty, 'back to what the order has').toBe(2);
    expect(row(el, 'line-1').qty).toBe(1);
    expect(el.error).toBe('ui.lineChangeFailed');
  });
});

describe('sales#443 · comping the SECOND line of a product', () => {
  it('comps THAT line, and the first one is still charged', async () => {
    const el = await twoCutsOnOneCheck();
    await giftRow(el, 1);

    expect(row(el, 'line-2').is_gift, 'Marta\'s line is on the house').toBe(true);
    expect(row(el, 'line-1').is_gift ?? false, 'Ana\'s line is still charged').toBe(false);
    expect(writes('sales.order.update_line').map((c) => [c.payload.line_id, c.payload.is_gift]),
      'the order row written is Marta\'s').toEqual([['line-2', 1]]);
  });

  it('un-comping the second line when only IT is comped', async () => {
    const el = await twoCutsOnOneCheck();
    el.cart = el.cart.map((l) => (l.line_id === 'line-2' ? { ...l, is_gift: true, gift_reason: 'Invitación' } : l));
    await settle(el);
    await giftRow(el, 1);

    expect(row(el, 'line-2').is_gift ?? false).toBe(false);
    expect(row(el, 'line-1').is_gift ?? false).toBe(false);
    expect(writes('sales.order.update_line').map((c) => [c.payload.line_id, c.payload.is_gift])).toEqual([['line-2', 0]]);
  });
});

describe('sales#443 · a line not yet saved (no row id) is still addressed by itself', () => {
  it('with no open order, the stepper of the second line changes the second line', async () => {
    const el = await mount();
    el.cart = [
      { id: 'p-corte', qty: 1, staff_id: 'u-ana', name: 'Corte', price: 1500 } as Line,
      { id: 'p-corte', qty: 2, staff_id: 'u-marta', name: 'Corte', price: 1500 } as Line,
    ];
    await settle(el);
    await setQtyOnRow(el, 1, 3);

    expect(el.cart.map((l) => [l.staff_id, l.qty])).toEqual([['u-ana', 1], ['u-marta', 3]]);
  });
});

// Tapping the product tile again adds one to the line it merges into (same professional, same
// supplements, not on the house). When that write does not land, the line is put back — THAT
// line: Marta's cut is another row of the same product and the order still has it as it is.
describe('sales#443 · a tile tap that is not saved puts back only the line it raised', () => {
  it('the row cannot be found: the other line of the product keeps its quantity', async () => {
    const el = await mount();
    el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);
    // The first line on screen has lost its row id and the order no longer answers with it.
    el.cart = [
      { ...el.cart[0], line_id: undefined },
      { ...el.cart[0], line_id: 'line-2', qty: 3, staff_id: 'u-marta' },
    ];
    orderLines = [];
    await settle(el);

    el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);

    expect(el.cart.map((l) => [l.staff_id, l.qty]), 'the raised line is back at 1, Marta\'s stays at 3')
      .toEqual([[undefined, 1], ['u-marta', 3]]);
    expect(el.error).toBe('ui.lineNotSaved');
  });

  it('a row id found again by re-reading the order stays on the line on screen, so the next change is saved', async () => {
    const el = await mount();
    el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);
    el.cart = [{ ...el.cart[0], line_id: undefined }];
    await settle(el);

    el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);
    expect(el.cart.map((l) => [l.line_id, l.qty]), 'raised and matched to its row').toEqual([['line-1', 2]]);

    commands = [];
    await setQtyOnRow(el, 0, 5);
    expect(writes('sales.order.update_line').map((c) => [c.payload.line_id, c.payload.quantity]),
      'the stepper writes that row, instead of changing only the screen').toEqual([['line-1', 5_000_000]]);
  });

  it('the hub refuses: the raised line goes back to what the order has, and the cashier is told', async () => {
    const el = await twoCutsOnOneCheck();
    el.cart = el.cart.map((l) => ({ ...l, staff_id: undefined, ...(l.line_id === 'line-2' ? { staff_id: 'u-marta' } : {}) }));
    await settle(el);
    refused.add('sales.order.update_line');

    el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);

    expect(writes('sales.order.update_line').map((c) => c.payload.line_id), 'it tried the line it merges into').toEqual(['line-1']);
    expect(el.cart.map((l) => [l.line_id, l.qty]), 'the screen agrees with the order again').toEqual([['line-1', 1], ['line-2', 2]]);
    expect(el.error, 'and says why').not.toBe('');
  });
});

// The set menu merges the same way (same menu, same courses, same professional), through its own
// door. A refused write put nothing back: the screen kept a menu the order does not have.
describe('sales#443 · the same menu tapped again, refused, puts back only the line it raised', () => {
  it('the raised menu goes back to what the order has; the other one is left alone', async () => {
    const el = await twoCutsOnOneCheck();
    const choices = [{ option_id: 'o-sopa', product_name: 'Sopa', category_id: null }];
    const menu = { id: 'c-menu', combo_id: 'c-menu', combo_choices: choices, name: 'Menú', price: 1200 };
    el.cart = [
      { ...el.cart[0], ...menu, staff_id: undefined },
      { ...el.cart[1], ...menu, staff_id: 'u-marta' },
    ];
    await settle(el);
    refused.add('sales.order.update_line');

    await el.queue(() => el.addComboLine({ combo_id: 'c-menu', name: 'Menú', tax_category_key: 'product.generic' }, choices, 1200));
    await settle(el);

    expect(writes('sales.order.update_line').map((c) => c.payload.line_id), 'it tried the line it merges into').toEqual(['line-1']);
    expect(el.cart.map((l) => [l.line_id, l.qty]), 'the screen agrees with the order again').toEqual([['line-1', 1], ['line-2', 2]]);
    expect(el.error, 'and says why').not.toBe('');
  });
});
