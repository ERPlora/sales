// sales#498 — a sale of 1.000 € or more cannot be paid in cash in Spain (Ley 7/2012 art. 7).
//
// The SERVER refuses it (`sales.cash_limit_exceeded`, in `complete_sale`); this file is the contract
// that the till REFLECTS it before the tap instead of letting the cashier find out from a refusal:
//
//   * the limit is read from `sales.checkout.preview` (`cash_limit`), never written in the screen;
//   * with cash selected over the limit the charge is blocked, WITH the reason written, and no sale
//     is sent — the same aria-disabled pattern as every other block (sales#58/#159);
//   * the cash button is shown unavailable, so the cashier goes straight to card or Bizum;
//   * a mixed payment with a cash leg is blocked too: the cash part counts against the whole sale;
//   * a hub whose country sets no limit (`cash_limit: null`) charges cash exactly as before.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';

const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];
const PRODUCTS = [{ id: 'p-1', name: 'Reloj', price: 121_000, is_active: 1, tax_category_key: 'product.generic' }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let notices: { type: string; message: string }[] = [];
/** What `sales.checkout.preview` answers. */
let previewAnswer: Record<string, unknown> | null = null;
/** Set to a domain code to make the next `sales.complete_sale` fail with it. */
let refuseWith = '';

function preview(total: number, cashLimit: number | null) {
  return {
    total, subtotal: total, tax_total: 0, discount_amount: 0, gift_total: 0, tax_included: true,
    lines: [{
      product_id: 'p-1', product_name: 'Reloj', tax_category_key: 'product.generic', tax_rate: 21,
      quantity: 1_000_000, unit_price: total, net_amount: total, tax_amount: 0, line_total: total,
      combo_group_ref: null, is_gift: false, covered: false,
    }],
    tax_breakdown: {},
    cash_limit: cashLimit,
  };
}

function installSdk() {
  commands = [];
  notices = [];
  refuseWith = '';
  installPosDouble({
    paymentMethods: METHODS,
    products: PRODUCTS,
    rules: RULES,
    byIdempotencyKey: [{ id: 'sale-1' }],
    notify: (n: { type: string; message: string }) => { notices.push(n); },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.checkout.preview') {
        return previewAnswer ? { ok: true, operations: 0, result: previewAnswer } : { ok: true, operations: 0 };
      }
      if (name === 'sales.complete_sale' && refuseWith) {
        throw Object.assign(new Error(`command failed: ${refuseWith}: nope`), { code: refuseWith });
      }
      return { ok: true, new_ids: ['x-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: unknown[];
  tenders: unknown[];
  error: string;
  openPay(): void;
  startSplit(): void;
  addTender(): void;
  confirm(print?: boolean): Promise<void>;
}

async function settle(el: Pos) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

/** The till with one line in the cart and the charge sheet open; the preview decides the total. */
async function tillCharging(price = 121_000): Promise<Pos> {
  const el = document.createElement('erp-pos-touch') as Pos;
  document.body.appendChild(el);
  await settle(el);
  el.cart = [{ id: 'p-1', name: 'Reloj', price, qty: 1, line_id: 'l-1', tax_category_key: 'product.generic', tax_rate: 21 }];
  await el.updateComplete;
  el.openPay();
  await settle(el);
  return el;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const charge = (el: Pos) => $(el, '.sheet-foot ion-button.charge')!;
const cashBtn = (el: Pos) => $(el, '[data-testid="pos-pay-method-pm-cash"]')!;
const cardBtn = (el: Pos) => $(el, '[data-testid="pos-pay-method-pm-card"]')!;
const sent = () => commands.filter((c) => c.name === 'sales.complete_sale');

beforeEach(() => {
  previewAnswer = null;
  installSdk();
  document.body.innerHTML = '';
});

describe('sales#498 — cash over the legal limit is blocked before the tap', () => {
  it('with cash selected on a 1.210 € sale the charge is blocked and SAYS WHY', async () => {
    previewAnswer = preview(121_000, 100_000);
    const el = await tillCharging();
    expect(charge(el).hasAttribute('disabled'), 'never a native disabled (sales#58)').toBe(false);
    expect(charge(el).getAttribute('aria-disabled')).toBe('true');
    expect($(el, '.sheet .pay-block-reason')?.textContent).toContain('ui.cashLimitReason');
    expect(charge(el).textContent).toContain('ui.cashLimitShort');
  });

  it('the tap answers and NO sale is sent', async () => {
    previewAnswer = preview(121_000, 100_000);
    const el = await tillCharging();
    await tenderExactCash(el);
    await el.confirm();
    await settle(el);
    expect(sent(), 'nothing reaches the server in cash').toHaveLength(0);
    expect(notices.map((n) => n.message)).toContain('ui.cashLimitReason');
  });

  it('the cash button is shown unavailable and tapping it does not select it', async () => {
    previewAnswer = preview(121_000, 100_000);
    const el = await tillCharging();
    cardBtn(el).click();
    await settle(el);
    expect(cashBtn(el).getAttribute('aria-disabled')).toBe('true');
    expect(cashBtn(el).hasAttribute('disabled'), 'the tap must arrive (sales#58)').toBe(false);
    cashBtn(el).click();
    await settle(el);
    expect(cardBtn(el).getAttribute('aria-pressed'), 'card stays selected').toBe('true');
    expect(cashBtn(el).getAttribute('aria-pressed')).toBe('false');
  });

  it('by card the same sale charges normally', async () => {
    previewAnswer = preview(121_000, 100_000);
    const el = await tillCharging();
    cardBtn(el).click();
    await settle(el);
    expect(charge(el).getAttribute('aria-disabled')).not.toBe('true');
    expect($(el, '.sheet .pay-block-reason')).toBeFalsy();
    await el.confirm();
    await settle(el);
    expect(sent()).toHaveLength(1);
    expect(sent()[0].payload.payment_method_id).toBe('pm-card');
  });

  it('a mixed payment with a cash leg is blocked: the cash part counts against the whole sale', async () => {
    previewAnswer = preview(121_000, 100_000);
    const el = await tillCharging();
    // The cash leg is taken BEFORE the total was known to be over the limit, e.g. typed fast.
    el.startSplit();
    await settle(el);
    (el as unknown as { payMethod: unknown }).payMethod = METHODS[0];
    for (const k of '500') (el as unknown as { tap(k: string): void }).tap(k);
    el.addTender();
    await settle(el);
    cardBtn(el).click();
    await settle(el);
    el.addTender();
    await settle(el);
    expect((el.tenders as unknown[]).length).toBe(2);
    expect(charge(el).getAttribute('aria-disabled')).toBe('true');
    expect($(el, '.sheet .pay-block-reason')?.textContent).toContain('ui.cashLimitReason');
    await el.confirm();
    await settle(el);
    expect(sent(), 'a split does not dodge the law').toHaveLength(0);
  });

  it('just below the limit cash charges as always', async () => {
    previewAnswer = preview(99_999, 100_000);
    const el = await tillCharging(99_999);
    expect(cashBtn(el).getAttribute('aria-disabled')).not.toBe('true');
    await tenderExactCash(el);
    expect($(el, '.sheet .pay-block-reason')).toBeFalsy();
    await el.confirm();
    await settle(el);
    expect(sent()).toHaveLength(1);
  });

  it('a hub whose country sets no limit (cash_limit null) charges cash as before', async () => {
    previewAnswer = preview(121_000, null);
    const el = await tillCharging();
    expect(cashBtn(el).getAttribute('aria-disabled')).not.toBe('true');
    await tenderExactCash(el);
    await el.confirm();
    await settle(el);
    expect(sent()).toHaveLength(1);
  });

  it('if the server refuses anyway, the cashier reads the translated reason, not a raw code', async () => {
    previewAnswer = null; // an older hub: no preview, the server is the only net
    const el = await tillCharging();
    refuseWith = 'sales.cash_limit_exceeded';
    await tenderExactCash(el);
    await el.confirm();
    await settle(el);
    expect(el.error).toBe('ui.errorCashLimit');
  });
});

describe('sales#498 — the copy exists in both languages', () => {
  it('every key the block uses is translated in en and es', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const key of ['cashLimitReason', 'cashLimitShort', 'errorCashLimit', 'cashLimitUnavailable']) {
      expect(en[key], `en ui.${key}`).toBeTruthy();
      expect(es[key], `es ui.${key}`).toBeTruthy();
      expect(es[key], `es ui.${key} is a translation, not a copy`).not.toBe(en[key]);
    }
    expect(en.cashLimitReason).toContain('{amount}');
    expect(es.cashLimitReason).toContain('{amount}');
  });
});
