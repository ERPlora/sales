// sales#379 — what the cashier TYPES on the till follows the scale of the hub currency.
//
// The three keypads of the till (cash tendered, fixed-amount ticket discount, open price) take the
// amount in the major unit and the sale contract is the MINOR unit (ADR-0007/0123). The conversion
// used the SDK's `eurosToCents`/`centsToEuros`, which pin TWO decimals: in a hub in yen, 1000 ¥
// handed over travelled as 100000 (a change 99 000 ¥ too big), and in dinars 1.234 KD as 123 fils.
// The scale is the hub's (`erplora.currencyDecimals`, read through `hubDecimals()`), the same one
// the refund field, the menu supplement and the documents already use.
import { afterEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  // 1500 minor units: 1500 ¥ in a hub in yen, 1.500 KD in dinars, 15,00 € in euros.
  { id: 'p-menu', name: 'Menú', sku: 'MEN', price: 1500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-10', tax_category_key: 'product.generic', rate_pct: 10, parent_id: null, is_active: 1 }];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk(currencyDecimals: number, hub: { currency?: string; locale?: string } = {}) {
  commands = [];
  const orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    ...hub,
    extra: { currencyDecimals },
    settings: () => ({ allow_discounts: 1 }),
    paymentMethods: METHODS,
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        const it = (payload.items as Record<string, unknown>[])[0];
        orderLines.push({ id: 'line-1', product_id: it.product_id, product_name: it.product_name, quantity: it.quantity, unit_price: it.price, line_total: it.price });
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: ['ord-1', 'line-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(): Promise<void>;
  openDiscount(target: 'line' | 'ticket', lineId?: string): void;
  applyDiscountAmount(cents: number): Promise<void>;
  editTender(id: string): void;
  ticketDiscountAmount: number;
  tenders: { id: string; method: string; amount: number; tendered: number }[];
  tendered: string;
  discountInput: string;
  discountMode: 'percent' | 'amount';
  openAmount: string;
  readonly tenderedNum: number;
  readonly discountInputCents: number;
  readonly openAmountCents: number;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (globalThis as { erplora?: unknown }).erplora;
});

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function addMenu(el: Pos) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')].find((t) => t.querySelector('.n')?.textContent?.trim() === 'Menú')!;
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

/** Presses the keys of a keypad by its test id prefix (`pos-keypad`, `pos-discount-key`, …). */
async function press(el: Pos, prefix: string, keys: string) {
  for (const k of keys) {
    const id = k === '.' ? 'dot' : k;
    const btn = el.shadowRoot.querySelector<HTMLElement>(`[data-testid="${prefix}-${id}"]`);
    expect(btn, `${prefix}-${id} is painted`).toBeTruthy();
    btn!.click();
    await el.updateComplete;
  }
}

async function payCashTyping(el: Pos, keys: string) {
  el.openPay();
  await el.updateComplete;
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-pay-method-pm-cash"]')!.click();
  await el.updateComplete;
  await press(el, 'pos-keypad', keys);
}

function sale(): Record<string, unknown> {
  const c = commands.find((x) => x.name === 'sales.complete_sale');
  expect(c, 'the till completed the sale').toBeTruthy();
  return c!.payload;
}

describe('cash tendered follows the hub currency scale (sales#379)', () => {
  it('in yen (0 decimals) «2000» handed over is 2000, not 200000', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    await payCashTyping(el, '2000');
    expect(el.tenderedNum).toBe(2000);
    await el.confirm();
    expect(sale().amount_tendered).toBe(2000);
  });

  it('in dinars (3 decimals) «2.345» handed over is 2345 fils, not 235', async () => {
    installSdk(3);
    const el = await mount();
    await addMenu(el);
    await payCashTyping(el, '2.345');
    await el.confirm();
    expect(sale().amount_tendered).toBe(2345);
  });

  it('in euros (2 decimals) «20» is still 2000 cents', async () => {
    installSdk(2);
    const el = await mount();
    await addMenu(el);
    await payCashTyping(el, '20');
    await el.confirm();
    expect(sale().amount_tendered).toBe(2000);
  });

  it('editing a split leg brings its amount back in the hub scale (1000 ¥ stays 1000 ¥)', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    el.openPay();
    await el.updateComplete;
    el.tenders = [{ id: 't-1', method: 'pm-cash', amount: 1000, tendered: 1000 }];
    el.editTender('t-1');
    await el.updateComplete;
    expect(el.tendered).toBe('1000');
    expect(el.tenderedNum).toBe(1000);
  });

  it('editing a leg in dinars keeps the three decimals (1.250 KD)', async () => {
    installSdk(3);
    const el = await mount();
    await addMenu(el);
    el.openPay();
    await el.updateComplete;
    el.tenders = [{ id: 't-1', method: 'pm-cash', amount: 1250, tendered: 1250 }];
    el.editTender('t-1');
    expect(el.tendered).toBe('1.250');
    expect(el.tenderedNum).toBe(1250);
  });
});

describe('the fixed-amount ticket discount follows the hub currency scale (sales#379)', () => {
  it('in yen «500» off is 500 ¥, not 50000', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    el.openDiscount('ticket');
    el.discountMode = 'amount';
    await el.updateComplete;
    await press(el, 'pos-discount-key', '500');
    expect(el.discountInputCents).toBe(500);
    el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-discount-apply-amount"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(el.ticketDiscountAmount).toBe(500);
    const set = commands.find((c) => c.name === 'sales.order.set_discount');
    expect(set?.payload.discount_amount).toBe(500);
  });

  it('in dinars «0.250» off is 250 fils', async () => {
    installSdk(3);
    const el = await mount();
    await addMenu(el);
    el.openDiscount('ticket');
    el.discountMode = 'amount';
    await el.updateComplete;
    await press(el, 'pos-discount-key', '0.250');
    expect(el.discountInputCents).toBe(250);
  });

  it('reopening the sheet shows the saved amount in the hub scale (500 ¥, not 5)', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    el.ticketDiscountAmount = 500;
    el.openDiscount('ticket');
    expect(el.discountMode).toBe('amount');
    expect(el.discountInput).toBe('500');
    expect(el.discountInputCents).toBe(500);
  });
});

describe('the open price follows the hub currency scale (sales#379)', () => {
  it('in yen «1200» typed is a 1200 ¥ line', async () => {
    installSdk(0);
    const el = await mount();
    el.openAmount = '1200';
    expect(el.openAmountCents).toBe(1200);
  });

  it('in dinars «1.5» typed is 1500 fils', async () => {
    installSdk(3);
    const el = await mount();
    el.openAmount = '1.5';
    expect(el.openAmountCents).toBe(1500);
  });
});

describe('the keypads refuse what the hub currency cannot hold (sales#379)', () => {
  it('in yen the separator key does nothing: there is no fraction of a yen', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    await payCashTyping(el, '1.5');
    expect(el.tendered).toBe('15');
    expect(el.tenderedNum).toBe(15);
  });

  it('in euros a third decimal is not taken (12.345 would round behind the cashier’s back)', async () => {
    installSdk(2);
    const el = await mount();
    await addMenu(el);
    await payCashTyping(el, '12.345');
    expect(el.tendered).toBe('12.34');
    expect(el.tenderedNum).toBe(1234);
  });

  it('in yen the separator key is painted disabled on the three keypads; in euros it is live', async () => {
    for (const [d, disabled] of [[0, true], [2, false]] as const) {
      installSdk(d);
      const el = await mount();
      await addMenu(el);
      el.openPay();
      await el.updateComplete;
      const dot = (id: string) => el.shadowRoot.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
      expect(dot('pos-keypad-dot')!.disabled, `pay, ${d} decimals`).toBe(disabled);
      el.openDiscount('ticket');
      el.discountMode = 'amount';
      await el.updateComplete;
      expect(dot('pos-discount-key-dot')!.disabled, `discount, ${d} decimals`).toBe(disabled);
      (el as unknown as { openOpenPrice(): void }).openOpenPrice();
      await el.updateComplete;
      expect(dot('pos-open-price-key-dot')!.disabled, `open price, ${d} decimals`).toBe(disabled);
    }
  });
});

describe('a PERCENT discount is not money: the currency scale does not cap it (rv-sales-381)', () => {
  it('in yen «12.5 %» can still be typed and the separator key stays live in percent mode', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    el.openDiscount('ticket');
    await el.updateComplete;
    expect(el.discountMode).toBe('percent');
    const dot = el.shadowRoot.querySelector<HTMLButtonElement>('[data-testid="pos-discount-key-dot"]');
    expect(dot!.disabled, 'percent mode: the separator is live in a hub without decimals').toBe(false);
    await press(el, 'pos-discount-key', '12.5');
    expect(el.discountInput).toBe('12.5');
    expect((el as unknown as { discountInputPct: number }).discountInputPct).toBe(12.5);
  });

  it('switching to amount mode in yen disables the separator; back to percent re-enables it', async () => {
    installSdk(0);
    const el = await mount();
    await addMenu(el);
    el.openDiscount('ticket');
    el.discountMode = 'amount';
    await el.updateComplete;
    const dot = () => el.shadowRoot.querySelector<HTMLButtonElement>('[data-testid="pos-discount-key-dot"]')!;
    expect(dot().disabled).toBe(true);
    el.discountMode = 'percent';
    await el.updateComplete;
    expect(dot().disabled).toBe(false);
  });
});

describe('the amount-mode button of the discount sheet names the hub currency (sales#380)', () => {
  async function amountLabel(currency: string, locale: string): Promise<string> {
    installSdk(currency === 'JPY' ? 0 : 2, { currency, locale });
    const el = await mount();
    await addMenu(el);
    el.openDiscount('ticket');
    await el.updateComplete;
    const btn = el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-discount-mode-amount"]');
    expect(btn, 'the amount mode is offered').toBeTruthy();
    return btn!.textContent!.trim();
  }

  it('a hub in yen shows ¥, not €', async () => {
    expect(await amountLabel('JPY', 'en')).toBe('¥');
  });

  it('a hub in pounds shows £', async () => {
    expect(await amountLabel('GBP', 'en')).toBe('£');
  });

  it('a hub in euros still shows €', async () => {
    expect(await amountLabel('EUR', 'es')).toBe('€');
  });
});
