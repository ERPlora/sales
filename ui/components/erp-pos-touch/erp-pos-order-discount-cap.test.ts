// sales#284 — the discount on an OPEN check is authorised when it is APPLIED, not at Charge.
//
// Before, the till wrote any ticket discount straight onto the order through `sales.order.set_discount`
// and painted the reduced total at once: a waiter put 90 % on a table, the customer saw the new
// total, and only at Charge did the manager's PIN come up (sales#269) — too late, the price had
// already been said out loud. Now the till routes the APPLY through the same two doors as the
// checkout: under the shop's cap, `sales.order.set_discount`; above it,
// `sales.order.set_discount_over_limit`, whose permission only a manager holds (the shell paints
// the PIN on top, hub#363). And the screen keeps the previous discount until the server says yes.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-tarta', name: 'Tarta', price: 500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
/** The manager's door answers like a cashier who cancelled the PIN dialog. */
let managerDeclines = false;

function installSdk(cap: number) {
  commands = [];
  managerDeclines = false;
  let lineSeq = 0;
  const orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: () => ({ allow_discounts: 1, max_discount_percent: cap }),
    orderLines: () => orderLines,
    products: PRODUCTS,
    rules: RULES,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        const it = (payload.items as Record<string, unknown>[])[0];
        orderLines.push({ id: 'line-1', product_id: it.product_id, product_name: it.product_name, quantity: it.quantity, unit_price: it.price, line_total: it.price });
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      if (name === 'sales.order.add_line') return { ok: true, new_ids: [`line-${++lineSeq + 1}`] };
      if (name === 'sales.order.set_discount_over_limit' && managerDeclines) {
        throw Object.assign(new Error('requires_elevation'), { code: 'requires_elevation' });
      }
      return { ok: true };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: { id: string; line_id?: string; discount?: number }[];
  queue<T>(t: () => Promise<T>): Promise<T>;
  openDiscount(target: 'line' | 'ticket', lineId?: string): void;
  applyDiscount(pct: number): Promise<void>;
  applyDiscountAmount(cents: number): Promise<void>;
  ticketDiscount: number;
  ticketDiscountAmount: number;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el as unknown as Node);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function addTile(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')].find((t) => t.querySelector('.n')?.textContent?.trim() === name)!;
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

const footTotal = (el: Pos) => el.shadowRoot.querySelector('.cart-foot .total b')?.textContent ?? '';

describe('ticket discount on an open check, with the cap at 10 %', () => {
  beforeEach(() => installSdk(10));

  it('within the cap goes through the usual door', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(10);
    expect(commands.map((c) => c.name)).toContain('sales.order.set_discount');
    expect(commands.map((c) => c.name)).not.toContain('sales.order.set_discount_over_limit');
    expect(el.ticketDiscount).toBe(10);
  });

  it('above the cap asks for the manager, and once authorised the check shows it', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(90);
    await el.updateComplete;
    const sent = commands.find((c) => c.name === 'sales.order.set_discount_over_limit');
    expect(sent?.payload).toMatchObject({ order_id: 'ord-1', discount_percent: 90 });
    expect(commands.map((c) => c.name)).not.toContain('sales.order.set_discount');
    expect(el.ticketDiscount).toBe(90);
    // 1,80 × 0,10 = 0,18
    expect(footTotal(el)).toContain('0.18');
  });

  it('above the cap and NOT authorised: the check keeps its old total', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(5);
    managerDeclines = true;
    el.openDiscount('ticket');
    await el.applyDiscount(90);
    await el.updateComplete;
    expect(el.ticketDiscount).toBe(5);
    // 1,80 × 0,95 = 1,71 — never the 0,18 of the refused 90 %
    expect(footTotal(el)).toContain('1.71');
  });

  it('a fixed amount above the cap asks for the manager, and a refusal leaves no amount', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await addTile(el, 'Tarta');
    // 6,80 € with the cap at 10 %: 0,68 € is the cashier's, 1,00 € is not.
    el.openDiscount('ticket');
    await el.applyDiscountAmount(68);
    expect(commands.filter((c) => c.name === 'sales.order.set_discount').at(-1)?.payload).toMatchObject({ discount_amount: 68 });
    managerDeclines = true;
    el.openDiscount('ticket');
    await el.applyDiscountAmount(100);
    await el.updateComplete;
    expect(commands.find((c) => c.name === 'sales.order.set_discount_over_limit')?.payload).toMatchObject({ order_id: 'ord-1', discount_amount: 100 });
    expect(el.ticketDiscountAmount).toBe(68);
    // 6,80 − 0,68 = 6,12
    expect(footTotal(el)).toContain('6.12');
  });

  it('a fixed amount is judged after the ticket percent, like the checkout', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await addTile(el, 'Tarta');
    // 6,80 € with 10 % already off leaves 6,12 €: the cashier's share is 0,61 €, not 0,68 €.
    el.openDiscount('ticket');
    await el.applyDiscount(10);
    el.openDiscount('ticket');
    await el.applyDiscountAmount(68);
    expect(commands.find((c) => c.name === 'sales.order.set_discount_over_limit')?.payload)
      .toMatchObject({ order_id: 'ord-1', discount_percent: 10, discount_amount: 68 });
    el.openDiscount('ticket');
    await el.applyDiscountAmount(61);
    expect(commands.filter((c) => c.name === 'sales.order.set_discount').at(-1)?.payload)
      .toMatchObject({ discount_percent: 10, discount_amount: 61 });
  });
});

describe('a shop with no cap', () => {
  beforeEach(() => installSdk(100));

  it('applies any ticket discount through the usual door, as before', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(100);
    expect(commands.map((c) => c.name)).toContain('sales.order.set_discount');
    expect(commands.map((c) => c.name)).not.toContain('sales.order.set_discount_over_limit');
  });
});
