// sales#269 — the discount whoever is charging may give ALONE.
//
// Anyone who could charge could take 100 % off a ticket and cash it: no cap, nobody to ask, and
// nothing on the sale saying who allowed it. The only lever the owner had was `allow_discounts`,
// an on/off switch for the whole shop.
//
// The shop now sets a cap (`max_discount_percent`, 100 = no cap, which is what a hub updating from
// a version without the column keeps). Over the cap, the till charges through
// `sales.complete_sale_over_limit` — the same checkout behind `sales.discount.over_limit`, a
// permission only a `manager` holds. A cashier hitting it is refused as `requires_elevation` and
// the SHELL paints the PIN dialog (hub#363); this module paints nothing.
//
// What is pinned here is the ROUTING: which door the till knocks on. The rule itself is the
// server's (`enforce_discount_cap`), and it is tested in `handler/src/lib.rs` — a payload that
// never went through this screen arrives there all the same.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-tarta', name: 'Tarta', price: 500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** @param cap what the shop saved, or `undefined` for a hub that never saw the column. */
function installSdk(cap?: number) {
  commands = [];
  let lineSeq = 0;
  const orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: () => ({ allow_discounts: 1, ...(cap === undefined ? {} : { max_discount_percent: cap }) }),
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
  openPay(): void;
  confirm(): Promise<void>;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
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

describe('with a 10 % cap on what a cashier may discount alone (sales#269)', () => {
  beforeEach(() => installSdk(10));

  it('charges a ticket discount over the cap through the MANAGER door', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(90);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale_over_limit']);
    // The payload is the same checkout: the door changes, not what is being charged.
    expect(commands.find((c) => c.name === 'sales.complete_sale_over_limit')!.payload.discount_percent).toBe(90);
  });

  it('charges a discount UP TO the cap through the usual door, with nobody to ask', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(10);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });

  it('counts a LINE discount too — capping only the ticket would be one tap away from nothing', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('line', el.cart[0].line_id);
    await el.applyDiscount(90);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale_over_limit']);
  });

  it('counts a FIXED amount as the share of the ticket it really is (sales#113)', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await addTile(el, 'Tarta');
    // 6,80 € of gross: the cap buys 68 cents, and «te lo dejo en 1 € menos» is past it.
    el.openDiscount('ticket');
    await el.applyDiscountAmount(100);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale_over_limit']);
  });

  it('lets a fixed amount that fits inside the cap through the usual door', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await addTile(el, 'Tarta');
    el.openDiscount('ticket');
    await el.applyDiscountAmount(68);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });

  it('charges a ticket with NO discount through the usual door', async () => {
    const el = await mount();
    await addTile(el, 'Café');
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });
});

describe('with no cap configured — the day one till', () => {
  it('asks nobody for anything, even at 100 % off, when the shop never set a cap', async () => {
    installSdk(undefined);
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(100);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls(), 'a hub updating from a version without the column must not start asking for PINs').toEqual(['sales.complete_sale']);
  });

  it('an explicit 100 is the same as no cap', async () => {
    installSdk(100);
    const el = await mount();
    await addTile(el, 'Café');
    el.openDiscount('ticket');
    await el.applyDiscount(50);
    await el.updateComplete;
    await charge(el);
    expect(checkoutCalls()).toEqual(['sales.complete_sale']);
  });
});
