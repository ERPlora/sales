// sales#159 / ADR-0386 — paying ONE sale with several ways of paying, without leaving the till.
//
// The half of the screen the child table (sales#158, 2.16.1) was waiting for. What it has to do:
//
//   1. Add legs until the total is covered, with the REMAINING always on screen and updating.
//   2. Every leg's amount editable, and the change taken ONLY from the cash leg (with no cash leg
//      the exact amount is charged — overpaying by card does not exist).
//   3. Confirm blocked until the remaining is zero, with the reason WRITTEN, never a `disabled`
//      that swallows the tap (the sales#58 precedent: on Ionic `disabled` is `pointer-events:none`,
//      so on a POS touchscreen nothing happens and the reason survives only in `title`, which needs
//      a hover that a tablet never produces).
//
// THE MARKET FAILURE THIS IS MEASURED AGAINST is Shopify's: with 3+ tenders the flow jams —
// «I could not exit the screen other than to mark the order as part paid» — because every leg has
// to be typed by hand, which is unusable at a rush hour. So THREE ways of paying is an acceptance
// criterion here, not an extra, and the last leg has to be a single tap.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
// ⚠️ Every product carries its `tax_category_key`: without it the tile is BLOCKED (sales#74/#58)
// and the grid is dead by data, which looks exactly like "the POS does not respond".
const PRODUCTS = [
  { id: 'p-menu', name: 'Menú', sku: 'MEN', price: 12100, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-10', tax_category_key: 'product.generic', rate_pct: 10, parent_id: null, is_active: 1 }];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
  { id: 'pm-bizum', name: 'Bizum', type: 'mobile', requires_change: 0, sort_order: 30 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
/** Toasts the component asked the shell for, in order. */
let notices: { type: string; message: string }[] = [];
/** Set to a domain code to make the next `sales.complete_sale` fail with it. */
let refuseWith = '';

function installSdk() {
  commands = [];
  notices = [];
  refuseWith = '';
  const orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    paymentMethods: METHODS,
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    notify: (n: { type: string; message: string }) => { notices.push(n); },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      // sales#185 — the refusal travels TYPED (`code`), the way `ErploraError` delivers it: the
      // screen branches on the code and never on the sentence, so the double has to carry it.
      if (name === 'sales.complete_sale' && refuseWith) {
        throw Object.assign(new Error(`command failed: ${refuseWith}: nope`), { code: refuseWith });
      }
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
  confirm(print?: boolean): Promise<void>;
  addTender(): void;
  removeTender(id: string): void;
  editTender(id: string): void;
  tenders: { id: string; amount: number; tendered: number }[];
  error: string;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

/** A 121,00 € bill with the pay sheet open — the very sale ADR-0386 uses as its example. */
async function withPaySheet(): Promise<Pos> {
  const el = await mount();
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  return el;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const $$ = (el: Pos, sel: string) => [...el.shadowRoot.querySelectorAll<HTMLElement>(sel)];
const charge = (el: Pos) => $(el, '.sheet-foot ion-button.charge')!;
const remaining = (el: Pos) => $(el, '.sheet .pay-remaining .v')?.textContent?.trim();

async function pickMethod(el: Pos, name: string) {
  $$(el, '.sheet button.pm-btn').find((b) => b.textContent?.trim() === name)!.click();
  await el.updateComplete;
}

/** Types EUROS on the pad, digit by digit, exactly as a thumb would. */
async function typeAmount(el: Pos, euros: string) {
  for (const k of euros) (el as unknown as { tap(k: string): void }).tap(k);
  await el.updateComplete;
}

/** Enters split mode, which is what puts the pad, the remaining and the leg list on screen. */
async function startSplit(el: Pos) {
  $(el, '.sheet .pay-split-btn')!.click();
  await el.updateComplete;
}

/** Takes one leg: pick the method, type EUROS (blank = whatever is left), press Add. */
async function addLeg(el: Pos, method: string, euros = '') {
  if (!$(el, '.sheet .pay-add')) await startSplit(el);
  await pickMethod(el, method);
  if (euros) await typeAmount(el, euros);
  $(el, '.sheet .pay-add')!.click();
  await el.updateComplete;
}

beforeEach(installSdk);

describe('adding legs until the total is covered', () => {
  it('the remaining is on screen and drops with every leg, landing on zero', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    expect(remaining(el), '121,00 − 50,00').toBe('71.00 €');
    await addLeg(el, 'Efectivo');
    expect(remaining(el), 'the blank leg covers what was left').toBe('0.00 €');
    // El color contesta antes que el texto: cubierto deja de pedir algo.
    expect($(el, '.sheet .pay-remaining')?.hasAttribute('data-covered')).toBe(true);
  });

  it('charges the sale as payments[], in the order the legs were taken', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    await addLeg(el, 'Efectivo', '90'); // 90,00 handed over for the 71,00 left → 19,00 change
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect(sale.payload.payments).toEqual([
      { payment_method_id: 'pm-card', amount: 5000 },
      { payment_method_id: 'pm-cash', amount: 7100, amount_tendered: 9000 },
    ]);
  });

  // 🔴 THE ACCEPTANCE CRITERION: three ways of paying, and the last one a SINGLE tap.
  it('THREE legs go through, and the last one needs nothing typed', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    expect(remaining(el)).toBe('71.00 €');
    await addLeg(el, 'Bizum', '30');
    expect(remaining(el)).toBe('41.00 €');
    await addLeg(el, 'Efectivo'); // nothing typed: it covers the rest
    expect(remaining(el), 'the last leg closes it with one tap').toBe('0.00 €');
    expect($$(el, '.sheet .tender-row')).toHaveLength(3);

    expect(charge(el).getAttribute('aria-disabled'), 'covered → the charge is open').not.toBe('true');
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect(sale.payload.payments).toEqual([
      { payment_method_id: 'pm-card', amount: 5000 },
      { payment_method_id: 'pm-bizum', amount: 3000 },
      { payment_method_id: 'pm-cash', amount: 4100 },
    ]);
  });
});

describe('the change comes out of the CASH leg (ADR-0386 decision 2)', () => {
  it('cash handed over above what is left is change; the card leg is charged exactly', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    await addLeg(el, 'Efectivo', '90');
    expect($(el, '.sheet .big-change .v')?.textContent?.trim(), '90,00 − 71,00').toBe('19.00 €');
  });

  it('with no cash leg there is no change: a card leg is capped at what is left', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    await addLeg(el, 'Bizum', '999'); // typing more than what is owed must not overpay
    expect(remaining(el)).toBe('0.00 €');
    expect($(el, '.sheet .big-change'), 'no cash leg, no change').toBeFalsy();
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect(sale.payload.payments).toEqual([
      { payment_method_id: 'pm-card', amount: 5000 },
      { payment_method_id: 'pm-bizum', amount: 7100 },
    ]);
  });
});

describe('every leg is editable and removable', () => {
  it('removing a leg gives its amount back to the remaining', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    await addLeg(el, 'Bizum', '30');
    $$(el, '.sheet .tender-remove')[0].click();
    await el.updateComplete;
    expect($$(el, '.sheet .tender-row')).toHaveLength(1);
    expect(remaining(el), '121,00 − 30,00 (the card leg is gone)').toBe('91.00 €');
  });

  it('tapping a leg brings its amount back to the pad, so it can be retyped', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    expect(remaining(el)).toBe('71.00 €');
    $(el, '.sheet .tender-edit')!.click();
    await el.updateComplete;
    expect($$(el, '.sheet .tender-row'), 'the leg is back in the pad, not in the list').toHaveLength(0);
    expect(remaining(el), 'and the whole bill is owed again').toBe('121.00 €');
    // Retyped at 60,00 and put back.
    await typeAmount(el, '60');
    $(el, '.sheet .pay-add')!.click();
    await el.updateComplete;
    expect(remaining(el)).toBe('61.00 €');
  });
});

describe('the charge is blocked while something is owed — and it SAYS SO', () => {
  it('is aria-disabled, NEVER natively disabled: on a touchscreen the tap must arrive', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    // `disabled` on an Ionic button is `pointer-events:none`: it eats the tap and leaves the reason
    // in `title`, which on a POS tablet nobody can reach. That is the sales#58 bug, and it does not
    // get to come back through the most important button on the screen.
    expect(charge(el).hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
    expect(charge(el).getAttribute('aria-disabled')).toBe('true');
  });

  it('writes WHY on the screen, not only inside the button', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    const reason = $(el, '.sheet .pay-block-reason');
    expect(reason?.textContent, 'the reason is text on the screen').toContain('ui.tenderRemainingBlock');
    expect(charge(el).textContent, 'and the button says what is missing, not a dead «Charge»')
      .toContain('ui.tenderRemainingShort');
  });

  it('the tap ANSWERS instead of dying, and no sale is sent', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    charge(el).click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(commands.some((c) => c.name === 'sales.complete_sale'), 'nothing is charged half-paid').toBe(false);
    // The reason is already painted; what the finger is owed is an ACKNOWLEDGEMENT, so the shell
    // toast goes on top of it — the same split sales#58 settled for the blocked tile.
    expect(notices.map((n) => n.message), 'the tap is answered out loud')
      .toContain('ui.tenderRemainingBlock');
    expect($(el, '.sheet .pay-block-reason')?.textContent, 'and the written reason stays put')
      .toContain('ui.tenderRemainingBlock');
  });

  it('clears the moment the legs cover the total', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    await addLeg(el, 'Efectivo');
    expect(charge(el).getAttribute('aria-disabled')).not.toBe('true');
    expect($(el, '.sheet .pay-block-reason')).toBeFalsy();
  });
});

describe('what the single-tender flow keeps doing', () => {
  it('a sale with no legs added travels exactly as before: no payments[]', async () => {
    const el = await withPaySheet();
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    expect(sale.payload.payments, 'one way of paying is still the scalar path').toBeUndefined();
    expect(sale.payload.payment_method_id).toBe('pm-cash');
  });

  it('splitting is opt-in: until it is asked for, the screen is the one that was there', async () => {
    const el = await withPaySheet();
    expect($(el, '.sheet .pay-split-btn'), 'the way in to splitting is on the screen').toBeTruthy();
    expect($(el, '.sheet .pay-remaining'), 'the big total already IS the remaining').toBeFalsy();
    expect($(el, '.sheet .tender-list')).toBeFalsy();
    // Card keeps its own screen: exact amount, no pad (the 2026-07-19 tender redesign).
    await pickMethod(el, 'Tarjeta');
    expect($(el, '.sheet .numpad'), 'card charges the exact amount, nothing to type').toBeFalsy();
  });

  it('a card leg CAN be typed once splitting: the pad is what the amount is entered on', async () => {
    const el = await withPaySheet();
    await startSplit(el);
    await pickMethod(el, 'Tarjeta');
    expect($(el, '.sheet .numpad'), 'splitting needs an amount for every method').toBeTruthy();
    expect($(el, '.sheet .pay-amount-label')?.textContent, 'and it says it is THIS leg, not the change')
      .toContain('ui.legAmount');
  });
});

describe('the error paths are painted, never silent', () => {
  it('a total that moved under the split is refused and SAID, with the legs kept', async () => {
    const el = await withPaySheet();
    await addLeg(el, 'Tarjeta', '50');
    await addLeg(el, 'Efectivo');
    refuseWith = 'sales.payments_do_not_match_total';
    await el.confirm();
    await el.updateComplete;
    expect($(el, '.sheet .pay-err')?.textContent).toContain('ui.errorPaymentsMismatch');
    expect($$(el, '.sheet .tender-row'), 'the legs survive so they can be fixed').toHaveLength(2);
  });
});

describe('i18n (ADR-0055/0199)', () => {
  it('every string the screen adds exists in en AND in es', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const key of ['remaining', 'splitPayment', 'addTender', 'legAmount', 'paymentsTaken',
      'tenderRemainingBlock', 'tenderRemainingShort', 'editTender', 'removeTender',
      'errorPaymentsMismatch']) {
      expect(en[key], `en.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key} must be translated, not copied`).not.toBe(en[key]);
    }
  });
});
