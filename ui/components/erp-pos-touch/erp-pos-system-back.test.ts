// hub#1906 — Android's Back button with the payment sheet open threw the cashier out of the till.
//
// The sheets of this screen (pay, discount, note, open price, modifiers, combos, park, transfer,
// dirty cart, the cart drawer…) are the module's own elements inside its shadow DOM, which the shell
// cannot see nor close. So the shell asks: on every system Back it dispatches a CANCELABLE
// `erplora:back` on `window` (hub `apps/web/src/router/back-closes-overlay.ts`). The till answers
// by closing its TOPMOST layer and calling `preventDefault()` — "I closed something, keep the
// screen". With nothing open it stays silent and Back leaves the screen as before.
//
// The contract pinned here:
//   1. the pay sheet closes on Back and the screen is kept (the QA's case);
//   2. one layer per press, the topmost first (a dialog over the pay sheet goes before the sheet);
//   3. the dirty-cart question that offers no Cancel HOLDS the Back: it stays open, screen kept;
//      when it does offer Cancel, Back is that Cancel;
//   4. nothing open → the event is left alone;
//   5. an unmounted till does not answer.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [{ id: 'p-cafe', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

const SHELL_BACK_EVENT = 'erplora:back';

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  paying: boolean;
  parkPromptOpen: boolean;
  cartOpen: boolean;
  dirtyOpen: boolean;
  resolveDirtyCart(allowCancel: boolean): Promise<'park' | 'discard' | 'cancel'>;
}

async function settle(el: Pos) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** A coffee in the check and the pay sheet open — the QA's exact screen. */
async function openPaySheet(el: Pos): Promise<void> {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((c) => c.querySelector('.n')?.textContent?.trim() === 'Café');
  if (!tile) throw new Error('no Café tile');
  tile.click();
  await el.queue(async () => undefined);
  await settle(el);
  el.openPay();
  await settle(el);
  expect(el.shadowRoot.querySelector('[data-testid="pos-pay-scrim"]'), 'control: the pay sheet IS open').not.toBeNull();
}

/** What the shell does on a system Back: returns whether the till claimed it. */
async function systemBack(el: Pos): Promise<boolean> {
  const ev = new CustomEvent(SHELL_BACK_EVENT, { cancelable: true });
  window.dispatchEvent(ev);
  await settle(el);
  return ev.defaultPrevented;
}

beforeEach(() => {
  installPosDouble({ paymentMethods: METHODS, products: PRODUCTS, rules: RULES } as never);
});

describe('hub#1906 — the till answers the system Back', () => {
  it('closes the pay sheet and keeps the screen', async () => {
    const el = await mount();
    await openPaySheet(el);

    expect(await systemBack(el)).toBe(true);
    expect(el.paying).toBe(false);
    expect(el.shadowRoot.querySelector('[data-testid="pos-pay-scrim"]')).toBeNull();
  });

  it('closes one layer per press, the topmost first', async () => {
    const el = await mount();
    await openPaySheet(el);
    el.parkPromptOpen = true;
    await settle(el);

    expect(await systemBack(el)).toBe(true);
    expect(el.parkPromptOpen).toBe(false);
    expect(el.paying, 'the sheet below is still there').toBe(true);

    expect(await systemBack(el)).toBe(true);
    expect(el.paying).toBe(false);

    expect(await systemBack(el), 'nothing left open: Back is the shell’s again').toBe(false);
  });

  it('closes the cart drawer', async () => {
    const el = await mount();
    el.cartOpen = true;
    await settle(el);

    expect(await systemBack(el)).toBe(true);
    expect(el.cartOpen).toBe(false);
  });

  it('the dirty-cart question WITHOUT a Cancel holds the Back: it stays open and so does the screen', async () => {
    const el = await mount();
    void el.resolveDirtyCart(false);
    await settle(el);

    expect(await systemBack(el)).toBe(true);
    expect(el.dirtyOpen).toBe(true);
  });

  it('the dirty-cart question WITH a Cancel takes Back as that Cancel', async () => {
    const el = await mount();
    const answer = el.resolveDirtyCart(true);
    await settle(el);

    expect(await systemBack(el)).toBe(true);
    expect(el.dirtyOpen).toBe(false);
    await expect(answer).resolves.toBe('cancel');
  });

  it('with nothing open it leaves the Back alone', async () => {
    const el = await mount();

    expect(await systemBack(el)).toBe(false);
  });

  it('an unmounted till does not answer', async () => {
    const el = await mount();
    await openPaySheet(el);
    el.remove();

    const ev = new CustomEvent(SHELL_BACK_EVENT, { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('hub#1906 — every layer of the till closes on Back', () => {
  // Each layer by the state that opens it, and the value its own ✕ / Cancel leaves behind.
  const LAYERS: { name: string; key: string; open: unknown; closed: unknown }[] = [
    { name: 'the bill preview', key: 'prebillOpen', open: true, closed: false },
    { name: 'the sale document', key: 'docSaleId', open: 'sale-1', closed: undefined },
    { name: 'the transfer dialog', key: 'staffPickerOpen', open: true, closed: false },
    { name: 'the park dialog', key: 'parkPromptOpen', open: true, closed: false },
    { name: 'the discount sheet', key: 'discountSheet', open: { target: 'ticket' }, closed: undefined },
    { name: 'the line-note sheet', key: 'noteSheet', open: { lineId: 'line-1', text: '' }, closed: undefined },
    { name: 'the combo sheet', key: 'comboSheet', open: { combo: { id: 'cb-1', name: 'Menú', slots: [] } }, closed: undefined },
    { name: 'the modifier sheet', key: 'modifierSheet', open: { product: PRODUCTS[0], groups: [] }, closed: undefined },
    { name: 'the open-price sheet', key: 'openPriceOpen', open: true, closed: false },
    { name: 'the parked list', key: 'parkedOpen', open: true, closed: false },
    { name: 'the more menu', key: 'moreOpen', open: true, closed: false },
    { name: 'the product search', key: 'searchOpen', open: true, closed: false },
  ];

  for (const layer of LAYERS) {
    it(`closes ${layer.name}`, async () => {
      const el = await mount();
      (el as unknown as Record<string, unknown>)[layer.key] = layer.open;

      const ev = new CustomEvent(SHELL_BACK_EVENT, { cancelable: true });
      window.dispatchEvent(ev);

      expect(ev.defaultPrevented).toBe(true);
      expect((el as unknown as Record<string, unknown>)[layer.key]).toEqual(layer.closed);
      await settle(el);
    });
  }
});
