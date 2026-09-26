// sales#414 — every field of the customer details asked at the till shows its BOX.
//
// Over the simplified-invoice ceiling (and when the cashier picks «Invoice») the till asks the
// customer's name, country, kind of document, tax ID and address. The Hub shell pins `mode: 'ios'`
// (ADR-0143), and there Ionic never paints a box on an ion-input/ion-select/ion-textarea with no
// `fill`: the five fields rendered as loose text, with a queue at the counter. The combination
// that paints on its own is `fill="outline" mode="md"` — the convention of the shell (hub#760), of
// the modules swept by ERPlora/pm#152 and the one the module-toolkit gate asks for (pm#479).
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-1', name: 'Corte', sku: 'CUT', price: 1190, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
}

type Field = HTMLElement & { value?: string };
const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<Field>(sel);

function install(maxCents: number) {
  installPosDouble({
    settings: null,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    fiscalLimits: [{ simplified_invoice_max_cents: maxCents }],
    command: async (name: string) => (name === 'sales.order.open'
      ? { ok: true, new_ids: ['ord-1', 'line-1'] }
      : { ok: true, rows: [{ id: 'sale-1' }] }),
  });
}

/** One line in the cart and the charge sheet open. */
async function atCheckout(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  return el;
}

/** A foreign country, so the kind of document is on screen too. */
async function pickForeignCountry(el: Pos, box: Element) {
  const country = box.querySelector<Field>('[data-testid="pos-limit-country"]')!;
  country.value = 'US';
  country.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'US' } }));
  await el.updateComplete;
}

const FIELDS = ['pos-limit-name', 'pos-limit-country', 'pos-limit-id-type', 'pos-limit-tax-id', 'pos-limit-address'];

function expectBox(f: Element): void {
  const id = f.getAttribute('data-testid') ?? f.tagName;
  expect(f.getAttribute('fill'), `${id}: no fill → no box in ios mode`).toBe('outline');
  expect(f.getAttribute('mode'), `${id}: fill without mode="md" never paints in ios mode`).toBe('md');
}

function expectAllBoxed(box: Element): void {
  const fields = [...box.querySelectorAll('ion-input, ion-select, ion-textarea')];
  expect(fields.map((f) => f.getAttribute('data-testid'))).toEqual(FIELDS);
  for (const f of fields) expectBox(f);
}

describe('customer details at the till: every field has its box in ios mode (sales#414)', () => {
  beforeEach(() => install(1_000));

  it('over the simplified ceiling, the five fields (foreign customer) are boxed', async () => {
    const el = await atCheckout();
    const box = $(el, '[data-testid="pos-simplified-limit-capture"]');
    expect(box, 'the ceiling capture is on screen').toBeTruthy();
    await pickForeignCountry(el, box!);
    expectAllBoxed(box!);
  });

  it('the same fields asked for an invoice under the ceiling are boxed', async () => {
    install(300_000);
    const el = await atCheckout();
    $(el, '[data-testid="pos-doc-format-invoice"]')!.click();
    await el.updateComplete;
    const box = $(el, '[data-testid="pos-invoice-recipient-capture"]');
    expect(box, 'the invoice capture is on screen').toBeTruthy();
    await pickForeignCountry(el, box!);
    expectAllBoxed(box!);
  });
});
