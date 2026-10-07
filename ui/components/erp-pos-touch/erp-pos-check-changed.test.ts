// sales#545 — the check changed WHILE it was being charged.
//
// The server now queues the checkout on the check and re-checks every line it charges: if another
// device voided, removed or charged a line (or closed the check) in the meantime, nothing is
// charged and the refusal comes back as `sales.order_changed`. A stale screen that charges a line
// already gone is refused as `sales.order_line_not_available`.
//
// For the cashier both mean the same thing: what is on the screen is not the check any more. So
// the pay sheet says so in its own sentence (not the generic «could not charge») and the cart is
// read again from the check, so that the next tap on «Charge» charges what is really left.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-steak', name: 'Entrecot', sku: 'ENT', price: 1800, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-water', name: 'Agua', sku: 'AGU', price: 200, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

class FakeErploraError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}

/** The rows of the check as the SERVER has them. */
let orderLines: Record<string, unknown>[] = [];
/** Code the next checkout is refused with; '' = it is charged. */
let refuseWith = '';
let charges = 0;
/** What `sales.checkout.preview` does: 'server' values the server's rows; 'hang' never answers. */
let preview: 'server' | 'hang' = 'server';

const row = (id: string, p: (typeof PRODUCTS)[number]) => ({
  id, product_id: p.id, product_name: p.name, quantity: 1_000_000,
  unit_price: p.price, line_total: p.price, tax_category_key: 'product.generic',
});

function installSdk() {
  orderLines = [];
  refuseWith = '';
  charges = 0;
  preview = 'server';
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    orderLines: () => orderLines.map((l) => ({ ...l })),
    command: async (name: string) => {
      if (name === 'sales.checkout.preview') {
        if (preview === 'hang') return new Promise(() => undefined);
        const total = orderLines.reduce((sum, l) => sum + Number(l.line_total), 0);
        return { ok: true, operations: 0, result: { total, subtotal: total, tax_total: 0, discount_amount: 0, gift_total: 0, tax_included: true, lines: [], tax_breakdown: {} } };
      }
      if (name === 'sales.order.open') {
        orderLines = [row('line-steak', PRODUCTS[0])];
        return { ok: true, new_ids: ['ord-1', 'line-steak'] };
      }
      if (name === 'sales.order.add_line') {
        orderLines = [...orderLines, row('line-water', PRODUCTS[1])];
        return { ok: true, new_ids: ['line-water'] };
      }
      if (name === 'sales.complete_sale') {
        charges += 1;
        if (refuseWith) {
          // Meanwhile, at the bar, the manager voided the steak: the server no longer has it.
          orderLines = orderLines.filter((l) => l.id !== 'line-steak');
          throw new FakeErploraError(refuseWith, 'the operation could not be completed');
        }
      }
      return { ok: true, new_ids: ['x'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: { line_id?: string }[];
  paying: boolean;
  payable: number;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

async function settle(el: Pos): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

/** The issue's check: steak and water, both saved on the open check, the pay sheet open.
 *  `mark` = the lines tapped for a partial charge before opening the sheet. */
async function steakAndWaterAtThePaySheet(mark: string[] = []): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await settle(el);
  const tiles = el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile');
  tiles[0].click();
  await el.queue(async () => undefined);
  await settle(el);
  tiles[1].click();
  await el.queue(async () => undefined);
  await settle(el);
  expect(el.cart.map((l) => l.line_id), 'both lines are rows of the check').toEqual(['line-steak', 'line-water']);
  for (const id of mark) {
    el.shadowRoot.querySelector<HTMLElement>(`[data-testid="pos-line-${id}"]`)!.click();
    await settle(el);
  }
  el.openPay();
  await settle(el);
  await tenderExactCash(el);
  return el;
}

const payErr = (el: Pos) => el.shadowRoot.querySelector('.sheet .pay-err')?.textContent ?? '';

beforeEach(() => { localStorage.clear(); installSdk(); });

describe('sales#545 · the check changed while it was being charged', () => {
  for (const code of ['sales.order_changed', 'sales.order_line_not_available']) {
    it(`${code}: the sheet says the check changed and the cart is read again from it`, async () => {
      const el = await steakAndWaterAtThePaySheet();
      refuseWith = code;

      await el.confirm();
      await settle(el);

      expect(payErr(el)).toContain('ui.errorOrderChanged');
      expect(payErr(el), 'the raw sentence never reaches the cashier').not.toContain('could not be completed');
      expect(el.paying, 'the sheet stays open: nothing was charged').toBe(true);
      expect(el.cart.map((l) => l.line_id), 'the voided steak left the screen too').toEqual(['line-water']);
    });
  }

  it('the retry charges what is really left', async () => {
    const el = await steakAndWaterAtThePaySheet();
    refuseWith = 'sales.order_changed';
    await el.confirm();
    await settle(el);

    refuseWith = '';
    await tenderExactCash(el);
    await el.confirm();
    await settle(el);

    expect(charges).toBe(2);
    expect(payErr(el)).toBe('');
  });

  it('a line marked for a partial charge that left the check is not «being charged» any more', async () => {
    const el = await steakAndWaterAtThePaySheet(['line-steak']);
    expect(el.shadowRoot.querySelector('.pay-sheet .pay-split'), 'the steak alone is being charged').toBeTruthy();
    refuseWith = 'sales.order_changed';
    await el.confirm();
    await settle(el);

    expect(el.shadowRoot.querySelector('.pay-sheet .pay-split'), 'no «Paying N lines» with a line that is gone').toBeNull();
    expect(el.payable).toBe(200);
  });

  it('the amount on the sheet is never the old total while the check is valued again', async () => {
    const el = await steakAndWaterAtThePaySheet();
    expect(el.payable, 'the server valued steak + water').toBe(2000);
    refuseWith = 'sales.order_changed';
    preview = 'hang';
    await el.confirm();
    await settle(el);

    // The new valuation has not answered: the sheet falls back to its own arithmetic of what is
    // left (the water), never to the 20,00 the steak was part of.
    expect(el.payable).toBe(200);
  });

  it('any other refusal keeps the cart as it is (nothing to read again)', async () => {
    const el = await steakAndWaterAtThePaySheet();
    refuseWith = 'sales.payments_do_not_match_total';
    await el.confirm();
    await settle(el);

    expect(el.cart.map((l) => l.line_id)).toEqual(['line-steak', 'line-water']);
  });

  it('its sentence exists in en AND in es', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui.errorOrderChanged;
    const es = (esLocale as { ui: Record<string, string> }).ui.errorOrderChanged;
    expect(en).toBeTruthy();
    expect(es).toBeTruthy();
    expect(es).not.toBe(en);
  });
});
