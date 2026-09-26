// sales#386 — the manager's PIN given when the discount went ON the check is the approval the
// charge needs too.
//
// Since sales#284 a discount over the cap is authorised when it is applied to the open check
// (`sales.order.set_discount_over_limit`). But the till still judged Charge on its own, so the
// same discount routed the checkout through `sales.complete_sale_over_limit` and the manager was
// asked for the PIN a SECOND time — and if they had left, the table could not be charged. The
// check now carries the approval (`discount_approved_by`, written by the manager's door only), the
// server honours it at the usual checkout, and the till charges through the usual door as long as
// the ticket discount is not above what was approved.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import { makeErploraDouble } from '../../test/erplora-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-tarta', name: 'Tarta', price: 500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orders: Record<string, unknown>[] = [];

function installSdk(cap: number) {
  commands = [];
  orders = [];
  let lineSeq = 0;
  const orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: () => ({ allow_discounts: 1, max_discount_percent: cap }),
    orders: () => orders,
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
      return { rows: [{ id: 'sale-1' }] };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openDiscount(target: 'line' | 'ticket', lineId?: string): void;
  applyDiscount(pct: number): Promise<void>;
  applyDiscountAmount(cents: number): Promise<void>;
  openPay(): void;
  confirm(): Promise<void>;
  retrieve(c: { id: string }): Promise<void>;
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

/** Which checkout was actually called. Naming BOTH doors keeps a test from passing because the
 *  till simply charged twice or through neither. */
function checkoutCalls(): string[] {
  return commands.filter((c) => c.name === 'sales.complete_sale' || c.name === 'sales.complete_sale_over_limit').map((c) => c.name);
}

describe('with the cap at 10 %, a discount the manager approved on the check', () => {
  beforeEach(() => installSdk(10));

  it('is charged through the usual door: one PIN, not two', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(90);
    expect(commands.map((c) => c.name)).toContain('sales.order.set_discount_over_limit');
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
    expect(commands.find((c) => c.name === 'sales.complete_sale')!.payload).toMatchObject({ order_id: 'ord-1', discount_percent: 90 });
  });

  it('an approved fixed amount is charged through the usual door too', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscountAmount(100);
    expect(commands.map((c) => c.name)).toContain('sales.order.set_discount_over_limit');
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });

  it('a line discount nobody approved still goes to the manager at Charge', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(90);
    el.openDiscount('line', 'line-1');
    await el.applyDiscount(90);
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale_over_limit']);
  });

  it('comes back with the check: a retrieved check the manager approved is charged without a PIN', async () => {
    orders = [{ id: 'ord-9', status: 'open', provisional_total: 180, created_at: '2026-09-26T10:00:00Z', discount_percent: 90, discount_amount: 0, discount_approved_by: 'u-manager' }];
    const el = await mount();
    await el.retrieve({ id: 'ord-9', ...{ total: 180, created_at: '2026-09-26T10:00:00Z', discount: 90, discountApproved: true } });
    await el.updateComplete;
    await addTile(el, 'Café');
    commands = [];
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });

  it('a retrieved check with the same discount but NO approval still asks for the manager', async () => {
    orders = [{ id: 'ord-9', status: 'open', provisional_total: 180, created_at: '2026-09-26T10:00:00Z', discount_percent: 90, discount_amount: 0, discount_approved_by: null }];
    const el = await mount();
    await el.retrieve({ id: 'ord-9', ...{ total: 180, created_at: '2026-09-26T10:00:00Z', discount: 90 } });
    await el.updateComplete;
    await addTile(el, 'Café');
    commands = [];
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale_over_limit']);
  });
});

describe('the open-check list carries the approval (sales#386)', () => {
  it('maps discount_approved_by to a flag the till keeps with the check', async () => {
    const { listOpenChecks } = await import('../../lib/pos-cart');
    const client = makeErploraDouble({ queries: { 'sales.orders.list': [
      { id: 'a', status: 'open', created_at: '2', discount_percent: 90, discount_approved_by: 'u-manager' },
      { id: 'b', status: 'open', created_at: '1', discount_percent: 90, discount_approved_by: null },
    ] } }).sdk;
    const checks = await listOpenChecks(client as never);
    expect(checks.find((c) => c.id === 'a')?.discountApproved).toBe(true);
    expect(checks.find((c) => c.id === 'b')?.discountApproved).toBeFalsy();
  });
});
