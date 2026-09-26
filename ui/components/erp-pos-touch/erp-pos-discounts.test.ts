// sales#71 — the discount buttons the till never had.
//
// The backend accepted `items[].discount` and `discount_percent` (0–100), prorated the ticket
// discount before the VAT, guarded `allow_discounts` server-side and the receipt already painted
// a stored discount — and `grep -ci discount` over the POS was 0. Market (9 refs in the issue):
// every POS offers a manual discount per LINE and per TICKET; the gate is a permission/setting,
// never free-for-all. Here the gate is `allow_discounts` (Ajustes TPV), enforced by the server.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-tarta', name: 'Tarta', price: 500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk(allowDiscounts: 0 | 1) {
  commands = [];
  let lineSeq = 0;
  // The order lines the "server" holds: the first line is materialized by sales.order.open and read
  // back (that is how the till learns its line_id, ADR-0141).
  const orderLines: Record<string, unknown>[] = [];
  // sales#203 — the policy comes through the COUNTER read. Stubbing `sales.settings.get` here used
  // to make this file green over a screen that, for a real cashier, showed the discount button
  // anyway: that query needs `sales.manage_settings`.
  installPosDouble({
    settings: () => ({ allow_discounts: allowDiscounts }),
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
  cart: { id: string; line_id?: string; discount?: number }[];
  queue<T>(t: () => Promise<T>): Promise<T>;
  openDiscount(target: 'line' | 'ticket', lineId?: string): void;
  applyDiscount(pct: number): Promise<void>;
  applyDiscountAmount(cents: number): Promise<void>;
  ticketDiscount: number;
  ticketDiscountAmount: number;
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

describe('with discounts allowed', () => {
  beforeEach(() => installSdk(1));

  it('every editable line offers a discount button, and the footer offers the ticket discount', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    expect(el.shadowRoot.querySelector('.line-discount'), 'line % button').toBeTruthy();
    expect(el.shadowRoot.querySelector('.ticket-discount'), 'ticket discount action').toBeTruthy();
  });

  it('a 10 % line discount is persisted on the order line, painted, and charged as items[].discount', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', el.cart[0].line_id);
    await el.applyDiscount(10);
    await el.updateComplete;
    expect(el.cart[0].discount).toBe(10);
    // sales#385: through the line discount door, priced by the server from the row.
    const upd = commands.find((c) => c.name === 'sales.order.set_line_discount');
    expect(upd?.payload).toMatchObject({ line_id: el.cart[0].line_id, discount_percent: 10 });
    expect(el.shadowRoot.querySelector('.line-discount-badge')?.textContent).toContain('10');
    // The footer total is the discounted one: 1,62 €.
    expect(el.shadowRoot.querySelector('.cart-foot .total b')?.textContent).toContain('1.62');

    el.openPay();
    await el.updateComplete;
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect((sale.payload.items as Record<string, unknown>[])[0]).toMatchObject({ discount: 10 });
  });

  it('a 5 % ticket discount is persisted on the order, shown in the totals and charged as discount_percent', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await addTile(el, 'Tarta');
    el.openDiscount('ticket');
    await el.applyDiscount(5);
    await el.updateComplete;
    expect(el.ticketDiscount).toBe(5);
    expect(commands.find((c) => c.name === 'sales.order.set_discount')?.payload).toMatchObject({ order_id: 'ord-1', discount_percent: 5 });
    // 1,80 × 0,95 = 1,71 · 5,00 × 0,95 = 4,75 → 6,46
    expect(el.shadowRoot.querySelector('.cart-foot .total b')?.textContent).toContain('6.46');
    expect(el.shadowRoot.querySelector('.ticket-discount-row')?.textContent).toContain('5');

    el.openPay();
    await el.updateComplete;
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect(sale.payload.discount_percent).toBe(5);
  });

  // sales#113 — «5 € menos» / «te lo dejo en 20 €»: importe FIJO al ticket. El servidor lo reparte
  // por resto mayor (ADR-0210); aquí solo se recoge, se persiste en la cuenta y se resta del preview.
  it('a fixed amount off the ticket is persisted, previewed and charged as discount_amount (cents)', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await addTile(el, 'Tarta');
    el.openDiscount('ticket');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.discount-mode'), 'the sheet offers % and €').toBeTruthy();
    await el.applyDiscountAmount(100);
    await el.updateComplete;
    expect(el.ticketDiscountAmount).toBe(100);
    expect(commands.find((c) => c.name === 'sales.order.set_discount')?.payload).toMatchObject({ order_id: 'ord-1', discount_amount: 100 });
    // 1,80 + 5,00 − 1,00 = 5,80
    expect(el.shadowRoot.querySelector('.cart-foot .total b')?.textContent).toContain('5.80');
    expect(el.shadowRoot.querySelector('.ticket-discount-row')?.textContent).toContain('1.00');

    el.openPay();
    await el.updateComplete;
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect(sale.payload.discount_amount).toBe(100);
  });

  it('applying 0 removes the discount', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(5);
    el.openDiscount('ticket');
    await el.applyDiscount(0);
    await el.updateComplete;
    expect(el.ticketDiscount).toBe(0);
    expect(el.shadowRoot.querySelector('.ticket-discount-row')).toBeNull();
  });
});

describe('with discounts switched off in the till settings', () => {
  beforeEach(() => installSdk(0));

  it('offers no discount control at all — the server would refuse anyway (sales.discounts_not_allowed)', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    expect(el.shadowRoot.querySelector('.line-discount')).toBeNull();
    expect(el.shadowRoot.querySelector('.ticket-discount')).toBeNull();
  });
});
