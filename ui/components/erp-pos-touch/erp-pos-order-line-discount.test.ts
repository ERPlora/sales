// sales#385 — a LINE discount on an open check is authorised when it is APPLIED, not at Charge.
//
// sales#284 did it for the ticket discount; the line one still went through
// `sales.order.update_line`, a bare UPDATE with no cap: the waiter took 50 % off a line, the
// screen showed the reduced price to the customer, and only at Charge did the manager's PIN come
// up. Now the till routes the line discount through its own two doors — under the cap
// `sales.order.set_line_discount`, above it `sales.order.set_line_discount_over_limit` (the shell
// paints the PIN on top, hub#363) — keeps the old price until the server says yes, and carries the
// approval with the line so Charge does not ask for the PIN again (the sales#386 rule, per line).
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-tarta', name: 'Tarta', price: 500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];
/** The manager's door answers like a cashier who cancelled the PIN dialog. */
let managerDeclines = false;

function installSdk(cap: number) {
  commands = [];
  managerDeclines = false;
  orderLines = [];
  let lineSeq = 0;
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
      if (name === 'sales.order.set_line_discount_over_limit' && managerDeclines) {
        throw Object.assign(new Error('requires_elevation'), { code: 'requires_elevation' });
      }
      return { ok: true, rows: [{ id: 'sale-1' }] };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: { id: string; line_id?: string; discount?: number; discountApproved?: boolean }[];
  queue<T>(t: () => Promise<T>): Promise<T>;
  openDiscount(target: 'line' | 'ticket', lineId?: string): void;
  applyDiscount(pct: number): Promise<void>;
  openPay(): void;
  confirm(): Promise<void>;
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

async function charge(el: Pos) {
  el.openPay();
  await el.updateComplete;
  await el.confirm();
}

const names = () => commands.map((c) => c.name);
const footTotal = (el: Pos) => el.shadowRoot.querySelector('.cart-foot .total b')?.textContent ?? '';
function checkoutCalls(): string[] {
  return names().filter((n) => n === 'sales.complete_sale' || n === 'sales.complete_sale_over_limit');
}

describe('line discount on an open check, with the cap at 10 %', () => {
  beforeEach(() => installSdk(10));

  it('within the cap goes through the usual line door, never through update_line', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(10);
    const sent = commands.find((c) => c.name === 'sales.order.set_line_discount');
    expect(sent?.payload).toMatchObject({ order_id: 'ord-1', line_id: 'line-1', discount_percent: 10 });
    expect(names()).not.toContain('sales.order.set_line_discount_over_limit');
    expect(commands.filter((c) => c.name === 'sales.order.update_line').map((c) => c.payload)).not.toContainEqual(
      expect.objectContaining({ discount_percent: expect.anything() }),
    );
    expect(el.cart[0].discount).toBe(10);
  });

  it('above the cap asks for the manager, and once authorised the line shows it', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(50);
    await el.updateComplete;
    const sent = commands.find((c) => c.name === 'sales.order.set_line_discount_over_limit');
    expect(sent?.payload).toMatchObject({ order_id: 'ord-1', line_id: 'line-1', discount_percent: 50 });
    expect(names()).not.toContain('sales.order.set_line_discount');
    expect(el.cart[0].discount).toBe(50);
    // 1,80 × 0,50 = 0,90
    expect(footTotal(el)).toContain('0.90');
  });

  it('above the cap and NOT authorised: the line keeps its old price', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(5);
    managerDeclines = true;
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(50);
    await el.updateComplete;
    expect(el.cart[0].discount).toBe(5);
    // 1,80 × 0,95 = 1,71 — never the 0,90 of the refused 50 %
    expect(footTotal(el)).toContain('1.71');
  });

  it('the line the manager approved is charged through the usual door: one PIN, not two', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(50);
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });

  it('a line re-discounted through the usual door loses its approval', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(50);
    expect(el.cart[0].discountApproved).toBe(true);
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(5);
    expect(el.cart[0].discountApproved).toBeFalsy();
  });

  it('another line over the cap that nobody approved still goes to the manager at Charge', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(50);
    await addTile(el, 'Tarta');
    // The Tarta line is discounted locally (the double hands out no persisted row for it to be
    // routed through): nobody approved it, so the charge still needs the manager.
    el.cart = el.cart.map((l) => (l.line_id === 'line-1' ? l : { ...l, discount: 50, discountApproved: undefined }));
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale_over_limit']);
  });
});

describe('the approval comes back with the check (sales#385)', () => {
  it('maps discount_approved_by on a line to a flag the cart keeps', async () => {
    const { loadOrderLines } = await import('../../lib/pos-cart');
    const { makeErploraDouble } = await import('../../test/erplora-double');
    const client = makeErploraDouble({ queries: { 'sales.order.lines': [
      { id: 'a', product_id: 'p', product_name: 'A', quantity: 1_000_000, unit_price: 100, line_total: 50, discount_percent: 50, discount_approved_by: 'u-manager' },
      { id: 'b', product_id: 'p', product_name: 'B', quantity: 1_000_000, unit_price: 100, line_total: 50, discount_percent: 50, discount_approved_by: null },
    ] } }).sdk;
    const lines = await loadOrderLines(client as never, 'ord-1');
    expect(lines.find((l) => l.id === 'a' || l.line_id === 'a')?.discountApproved).toBe(true);
    expect(lines.find((l) => l.id === 'b' || l.line_id === 'b')?.discountApproved).toBeFalsy();
  });
});
