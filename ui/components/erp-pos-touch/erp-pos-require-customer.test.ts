// sales#222 — WHEN the till asks for the customer, with `require_customer` on.
//
// The rule already lived on the server since sales#203: `sales.complete_sale` reads
// `sales.settings.get` through its declared `reads` (system permissions, ADR-0069 rule 2) and
// refuses with `sales.customer_required`. And since sales#203 the SCREEN receives the same row
// through `sales.pos_settings.get`. What nobody did was USE it: the cashier built the whole
// ticket, opened the charge, typed the amount, picked a payment method, confirmed — and only THEN
// found out. Customer waiting, checkout to redo.
//
// Market shape (8 refs + forums, table in the PR): the charge step is where it is asked, and it is
// asked by BLOCKING that step, never by a modal when the till opens.
//   - Odoo `pos_required_customer`: "Customer Required in Order" raises a warning when the user
//     clicks the PAYMENT button.
//   - Shopify POS required checkout information: "Staff can add items to the cart without the
//     required information, but they're prompted to provide missing information before completing
//     the checkout."
//   - Toast service prompts: they pop up during the ordering or payment process, and "until that
//     requirement is met, the server will not be able to progress".
//
// 🔴 The block is `aria-disabled`, NEVER the native `disabled` — on Ionic that is
// `pointer-events: none`, so on a counter tablet the tap dies with the reason stranded in a
// `title` no finger ever produces (sales#58, sales#185). The tap must ARRIVE and ANSWER.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

/** The customer picker the `customers` module hangs on `sales.pos.assign`. It records the hook the
 *  till fires at it: `sales` never reaches into it, it only asks. */
class FakeCustomerPicker extends HTMLElement {
  asked = 0;
  connectedCallback() {
    this.addEventListener('erp:customer-required', () => { this.asked += 1; });
  }
}
if (!customElements.get('fake-customer-picker')) {
  customElements.define('fake-customer-picker', FakeCustomerPicker);
}

let notices: { type: string; message: string }[] = [];
let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** @param policy the settings row `sales.pos_settings.get` hands back (null = no row saved).
 *  @param withPicker whether `customers` is installed and fills `sales.pos.assign`.
 *
 *  sales#233 — the double is `installPosDouble`, shared by every till suite, and NOT a copy of the
 *  SDK doors written here. It was such a copy that broke this file: it answered `[]` through the
 *  door sales#25 had just moved the catalogue onto, so the grid painted no products, the cart never
 *  filled, and the five cases below died there — green for a whole day while testing nothing
 *  (sales#231). Answers are keyed by query NAME now, so a read that changes door lands anyway. */
function installSdk(policy: Record<string, unknown> | null, withPicker = true) {
  const double = installPosDouble({
    settings: policy,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    command: async (name: string) => (name === 'sales.order.open'
      ? { ok: true, new_ids: ['ord-1', 'line-1'] }
      : { ok: true, rows: [{ id: 'sale-1' }] }),
    loadSlot: (slot: string) => (
      withPicker && slot === 'sales.pos.assign' ? [{ component: 'fake-customer-picker' }] : []
    ),
  });
  notices = double.notices;
  commands = double.commands;
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
/** The filler instance the shell mounted inside the till's `sales.pos.assign` host. */
const picker = (el: Pos) => el.shadowRoot.querySelector('fake-customer-picker') as FakeCustomerPicker | null;

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

/** A cart with one line: the state a cashier is in when the thumb reaches Charge. */
async function withLine(): Promise<Pos> {
  const el = await mount();
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  return el;
}

/** The customer arrives the only way it can: the filler emits its context (ADR-0043). */
async function chooseCustomer(el: Pos) {
  el.dispatchEvent(new CustomEvent('erp:customer-context', {
    detail: { customer_id: 'cus-1', customer_name: 'Ana', customer_tax_id: '', customer_address: '' },
    bubbles: false,
  }));
  await el.updateComplete;
}

const REQUIRED = { require_customer: 1 };

beforeAll(async () => { await import('./erp-pos-touch'); }, 30_000);

describe('1 · with `require_customer` on and no customer, Charge ASKS instead of charging', () => {
  beforeEach(() => { installSdk(REQUIRED); });

  it('the tap does NOT open the pay sheet', async () => {
    const el = await withLine();
    $(el, '.foot-actions ion-button.charge')!.click();
    await el.updateComplete;

    expect($(el, '.sheet'), 'the amount pad must not open on a sale that cannot be closed').toBeFalsy();
    expect(commands.some((c) => c.name === 'sales.complete_sale')).toBe(false);
  });

  it('it answers with the notice, in the shop language', async () => {
    const el = await withLine();
    $(el, '.foot-actions ion-button.charge')!.click();
    await el.updateComplete;

    expect(notices.map((n) => n.message), 'the tap is answered, never swallowed')
      .toContain('ui.customerRequiredCharge');
  });

  it('the button is aria-disabled and ALIVE — never natively disabled (sales#58)', async () => {
    const el = await withLine();
    const charge = $(el, '.foot-actions ion-button.charge')!;

    expect(charge.hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
    expect(charge.getAttribute('aria-disabled'), 'the block has to be READABLE').toBe('true');
    expect(charge.classList.contains('blocked')).toBe(true);
  });

  it('the block SURVIVES a repaint — Ionic steals whatever the template writes on the host', async () => {
    const el = await withLine();
    // Exactly what Stencil does on hydration: it takes the host's aria over. `updated()` has to
    // put it back, or the block vanishes from the DOM the first time anything re-renders.
    const charge = $(el, '.foot-actions ion-button.charge')!;
    charge.removeAttribute('aria-disabled');
    el.requestUpdate();
    await el.updateComplete;

    expect(charge.getAttribute('aria-disabled')).toBe('true');
  });

  it('fires the hook at the customer slot so the picker can open itself', async () => {
    const el = await withLine();
    expect(picker(el), 'the `sales.pos.assign` filler is mounted').toBeTruthy();

    $(el, '.foot-actions ion-button.charge')!.click();
    await el.updateComplete;

    expect(picker(el)!.asked, 'sales ASKS the slot; it never reaches inside it').toBe(1);
  });

  it('paints the pending customer where the customer belongs, and that chip asks too', async () => {
    const el = await withLine();
    const chip = $(el, '.order-context .needs-customer');
    expect(chip, 'a block whose only sign is a toast is a block nobody can act on').toBeTruthy();

    chip!.click();
    await el.updateComplete;
    expect(picker(el)!.asked).toBe(1);
  });

  it('with `customers` NOT installed it says so, naming the app (there is no fix on this screen)', async () => {
    installSdk(REQUIRED, false);
    const el = await withLine();
    $(el, '.foot-actions ion-button.charge')!.click();
    await el.updateComplete;

    expect(notices.map((n) => n.message)).toContain('ui.customerRequiredNoApp');
  });
});

describe('2 · with the customer chosen, the till charges exactly as before', () => {
  beforeEach(() => { installSdk(REQUIRED); });

  it('the sheet opens and the sale travels with the customer', async () => {
    const el = await withLine();
    await chooseCustomer(el);

    expect($(el, '.foot-actions ion-button.charge')!.getAttribute('aria-disabled'), 'unblocked')
      .toBeNull();

    el.openPay();
    await el.updateComplete;
    expect($(el, '.sheet'), 'the charge screen opens once the sale can be closed').toBeTruthy();

    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale, 'the sale is sent').toBeTruthy();
    expect(sale!.payload.customer_id).toBe('cus-1');
  });
});

describe('3 · the rule is the SERVER’s: without the setting nothing changes', () => {
  it('with no settings row saved the till charges with no customer, as today', async () => {
    installSdk(null);
    const el = await withLine();
    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.getAttribute('aria-disabled')).toBeNull();

    charge.click();
    await el.updateComplete;
    expect($(el, '.sheet'), 'a shop that did not ask for this must not notice it exists').toBeTruthy();
  });

  it('`require_customer = 0` is not a block either', async () => {
    installSdk({ require_customer: 0 });
    const el = await withLine();
    $(el, '.foot-actions ion-button.charge')!.click();
    await el.updateComplete;
    expect($(el, '.sheet')).toBeTruthy();
  });
});

describe('4 · second lock: `confirm()` reached without passing through Charge', () => {
  it('does not spend a number of the chain on a sale the server will refuse', async () => {
    installSdk(REQUIRED);
    const el = await withLine();
    // The sheet is opened by hand — the path a shortcut takes, which never crosses `openPay`.
    el.openPay();
    await el.updateComplete;

    await el.confirm();
    await el.updateComplete;

    expect(commands.some((c) => c.name === 'sales.complete_sale'), 'the guard cannot live in a button only')
      .toBe(false);
  });
});

describe('5 · the copy exists in BOTH languages', () => {
  it('en and es carry every key this block needs', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const key of ['customerRequiredCharge', 'customerRequiredShort', 'customerRequiredNoApp', 'appCustomers']) {
      expect(en[key], `en.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key} must be translated, not copied`).not.toBe(en[key]);
    }
    expect(en.customerRequiredNoApp).toContain('{app}');
    expect(es.customerRequiredNoApp).toContain('{app}');
  });
});
