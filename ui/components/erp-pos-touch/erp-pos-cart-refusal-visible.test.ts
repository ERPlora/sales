// sales#438 — a refusal from inside the CART is told inside the cart.
//
// On a phone (and on anything up to 820 px, or a phone on its side) the cart is a drawer that
// covers the product grid. Everything the cashier does in there — naming the check, a line note, a
// line or ticket discount, moving a line to another professional, splitting the check from the
// table's button — writes the one notice of the till, `this.error`, and until now that notice was
// painted only on the page (`.catalog > .err`), BEHIND the drawer. Measured on hub:stable at 390 px
// in ios mode: the refusal of all five was on the page and the drawer was on top of it. The cashier
// saw nothing happen.
//
// And two actions did not even get that far: the gift toggle and the quantity stepper change the
// line on screen FIRST and wrote the row behind it with nothing catching the refusal — the line
// stayed «on the house» or at 2 on screen while the order kept it at full price or at 1, and the
// only trace was an unhandled rejection in the console.
//
// The rule is the one sales#185 wrote for the pay sheet, one step further: the notice of the tap
// that just happened lives in ONE place at a time, the surface in front of the cashier. Paying →
// the pay sheet. The cart drawer open → the cart's footer, above its buttons, which never scrolls
// away. Neither → the page. Closing the drawer hands the notice back to the page: moved, not lost.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-te', name: 'Té', sku: 'TE', price: 120, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];
const USERS = [{ id: 'u-ana', name: 'Ana', role: 'employee', is_active: true }];

/** The typed error the SDK really throws: a `code` FIELD plus a sentence. */
class FakeErploraError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}

/** Commands the hub refuses right now, by name. */
let refused = new Set<string>();
let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];
/** Another open check waiting in the list, until somebody really deletes it. */
let openOrders: Record<string, unknown>[] = [];

function installSdk() {
  refused = new Set();
  commands = [];
  orderLines = [];
  openOrders = [{ id: 'ord-9', status: 'open', label: 'Mesa 9', provisional_total: 300, created_at: '2026-09-28T08:00:00Z' }];
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    users: USERS,
    orderLines: () => orderLines,
    orders: () => openOrders,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (refused.has(name)) throw new FakeErploraError('sales.refused_here', `REFUSED ${name}`);
      if (name === 'sales.order.open') {
        orderLines = [{
          id: 'line-1', product_id: 'p-cafe', product_name: 'Café', quantity: 1_000_000,
          unit_price: 150, line_total: 150, tax_category_key: 'product.generic',
        }];
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      if (name === 'sales.order.add_line') return { ok: true, new_ids: ['line-2'] };
      if (name === 'sales.order.void') openOrders = openOrders.filter((o) => o.id !== payload.order_id);
      return { ok: true, new_ids: ['sale-1'] };
    },
  });
}

interface Line { id: string; line_id?: string; qty: number; is_gift?: boolean; note?: string; discount?: number }
interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: Line[];
  error: string;
  cartOpen: boolean;
  parkedOpen: boolean;
  paying: boolean;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
  applyLineNote(note: string): Promise<void>;
  openDiscount(target: 'line' | 'ticket', lineId?: string): void;
  applyDiscount(pct: number): Promise<void>;
  saveOrderLabel(value: string): Promise<void>;
  moveLineStaff(lineId: string, staffId?: string): Promise<void>;
  toggleGift(line: Line): Promise<void>;
  retrieve(c: { id: string; label?: string }): Promise<void>;
  parked: { id: string }[];
  setQtyAbs(line: Line, v: number): Promise<void>;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function settle(el: Pos): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const cartNotice = (el: Pos) => $(el, '[data-testid="pos-cart-error"]');
const pageNotice = (el: Pos) => $(el, '.catalog > .err');
const listNotice = (el: Pos) => $(el, '[data-testid="pos-parked-error"]');

/** A check with one saved line, and the cart drawer open — the phone at the counter. */
async function openCartWithLine(): Promise<Pos> {
  const el = await mount();
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await settle(el);
  $(el, '[data-testid="pos-cart-fab"]')!.click();
  await settle(el);
  expect(el.cart[0]?.line_id, 'the line is backed by a real order row').toBe('line-1');
  expect(el.cartOpen, 'the drawer is open').toBe(true);
  return el;
}

beforeEach(() => { localStorage.clear(); installSdk(); });

/** Every action of the cart that writes the order row: [what, the command it sends, the tap]. */
const CART_ACTIONS: [string, string, (el: Pos) => Promise<void>][] = [
  ['naming the check', 'sales.order.set_label', (el) => el.saveOrderLabel('Terraza')],
  ['a line note', 'sales.order.update_line', async (el) => {
    el.shadowRoot.querySelector<HTMLElement>(`[data-testid="pos-line-${el.cart[0].line_id}-note"]`)!.click();
    await el.updateComplete;
    await el.applyLineNote('sin azúcar');
  }],
  ['a line discount', 'sales.order.set_line_discount', async (el) => {
    el.openDiscount('line', el.cart[0].line_id);
    await el.applyDiscount(10);
  }],
  ['a ticket discount', 'sales.order.set_discount', async (el) => {
    el.openDiscount('ticket');
    await el.applyDiscount(10);
  }],
  ['moving a line to another professional', 'sales.order.set_line_staff', (el) => el.moveLineStaff(el.cart[0].line_id!, 'u-ana')],
];

describe('1 · with the cart drawer open, a refused cart action is told IN the cart', () => {
  const cases = CART_ACTIONS;

  for (const [what, command, act] of cases) {
    it(`${what}: the refusal is in the cart's footer and NOT on the page behind the drawer`, async () => {
      const el = await openCartWithLine();
      refused.add(command);
      await act(el);
      await settle(el);

      expect(commands.some((c) => c.name === command), `${command} was really sent`).toBe(true);
      expect(el.error, 'the till has something to say').not.toBe('');
      expect(cartNotice(el)?.textContent?.trim(), 'the cart says it, where the cashier is looking').toBe(el.error);
      expect(pageNotice(el), 'the page copy sits behind the drawer: it must not be the only one, nor a second one').toBeNull();
    });
  }

  it('the notice sits in the cart FOOTER, above the Charge button, so no scroll is needed to read it', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.set_label');
    await el.saveOrderLabel('Terraza');
    await settle(el);

    const notice = cartNotice(el)!;
    expect(notice.closest('.cart-foot'), 'inside the fixed footer, not in the scrolling lines').not.toBeNull();
    const charge = $(el, '.cart-foot [data-testid="pos-charge"]')!;
    expect(notice.compareDocumentPosition(charge) & Node.DOCUMENT_POSITION_FOLLOWING, 'before the buttons it refers to')
      .toBeTruthy();
    expect(notice.getAttribute('role'), 'announced when it appears').toBe('alert');
    // Its own margin: a bare <p> in the footer brings the browser's 1em above and below.
    expect(getComputedStyle(notice).marginTop).toBe('0px');
    // A phone on its side lays the foot out as ONE flex row: the notice takes a row of its own
    // instead of squeezing the total and the buttons.
    expect(getComputedStyle(notice).flexBasis).toBe('100%');
  });

  it('the notice of a refused split (the table button in the cart) is told in the cart too', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.split');
    el.dispatchEvent(new CustomEvent('erp:order-split', { detail: { from_order_id: 'ord-1', label: 'Juan' }, bubbles: true, composed: true }));
    await settle(el);

    expect(commands.some((c) => c.name === 'sales.order.split'), 'the split was really asked for').toBe(true);
    expect(cartNotice(el)?.textContent?.trim()).toBe('ui.splitFailed');
    expect(pageNotice(el)).toBeNull();
  });
});

describe('2 · the notice follows the surface: never lost, never twice', () => {
  it('closing the drawer hands the notice back to the page', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.set_label');
    await el.saveOrderLabel('Terraza');
    await settle(el);

    $(el, '[data-testid="pos-cart-close"]')!.click();
    await settle(el);

    expect(cartNotice(el), 'the closed drawer does not keep it').toBeNull();
    expect(pageNotice(el)?.textContent?.trim(), 'with no drawer on top, the page is the surface').toBe(el.error);
  });

  it('a refusal while the drawer is CLOSED stays on the page (a wide screen: the cart is a column)', async () => {
    const el = await mount();
    $(el, 'ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);
    refused.add('sales.order.set_label');
    await el.saveOrderLabel('Terraza');
    await settle(el);

    expect(el.cartOpen).toBe(false);
    expect(pageNotice(el)?.textContent?.trim()).toBe(el.error);
    expect(cartNotice(el), 'no second copy').toBeNull();
  });

  it('while paying the pay sheet keeps it alone (sales#185), even with the drawer left open', async () => {
    const el = await openCartWithLine();
    el.openPay();
    await settle(el);
    el.cartOpen = true;
    refused.add('sales.complete_sale');
    await tenderExactCash(el);
    await el.confirm();
    await settle(el);

    expect($(el, '.sheet .pay-err')?.textContent, 'the pay sheet says it').toContain('ui.errorCharge');
    expect(cartNotice(el), 'not again in the drawer under the sheet').toBeNull();
    expect(pageNotice(el), 'not again on the page').toBeNull();
  });

  it('while paying the pay sheet keeps it alone even with the list of checks left open', async () => {
    const el = await openCartWithLine();
    $(el, '[data-testid="pos-parked-toggle"]')!.click();
    await settle(el);
    el.openPay();
    await settle(el);
    el.parkedOpen = true;
    refused.add('sales.complete_sale');
    await tenderExactCash(el);
    await el.confirm();
    await settle(el);

    expect($(el, '.sheet .pay-err')?.textContent, 'the pay sheet says it').toContain('ui.errorCharge');
    expect(listNotice(el), 'not again in the list under the sheet').toBeNull();
  });

  const retried: [string, string, (el: Pos) => Promise<void>][] = [
    ...CART_ACTIONS,
    ['the quantity', 'sales.order.update_line', (el) => el.setQtyAbs(el.cart[0], 2)],
  ];
  for (const [what, command, act] of retried) {
    it(`${what}: retrying and getting through clears the old notice`, async () => {
      const el = await openCartWithLine();
      refused.add(command);
      await act(el);
      await settle(el);
      expect(cartNotice(el), 'refused first').not.toBeNull();

      refused.clear();
      await act(el);
      await settle(el);

      expect(el.error, 'it went through now: «could not be saved» would be a lie').toBe('');
      expect(cartNotice(el)).toBeNull();
    });
  }
});

describe('2b · the notice belongs to the check it was said on', () => {
  it('picking up another open check does not carry the old check\'s refusal onto it', async () => {
    const el = await mount();
    // An empty till whose last tap was refused: whatever it said was about THAT check.
    el.error = 'REFUSED sales.order.set_label';
    el.cartOpen = true;
    await el.retrieve({ id: 'ord-2', label: 'Mesa 2' });
    await settle(el);

    expect(el.error, 'the check now on screen has nothing refused').toBe('');
    expect(cartNotice(el)).toBeNull();
  });
});

describe('2c · deleting an open check from the list of checks', () => {
  /** The list of open checks, and the two taps that delete one (arm, then confirm). */
  async function deleteFromList(el: Pos, id: string): Promise<void> {
    $(el, '[data-testid="pos-parked-toggle"]')!.click();
    await settle(el);
    $(el, `[data-testid="pos-parked-${id}-delete"]`)!.click();
    await settle(el);
    $(el, `[data-testid="pos-parked-${id}-delete"]`)!.click();
    await settle(el);
  }

  // The list of checks is a dropdown over the cart with its own backdrop: on hub:stable at 390 and
  // 820 px the backdrop covered the cart's footer, so the notice is told IN the list while it is open.
  it('a refused delete is told IN the list, at its top, and the check is still in it', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.void');
    await deleteFromList(el, 'ord-9');

    expect(commands.some((c) => c.name === 'sales.order.void'), 'the delete was really asked for').toBe(true);
    expect(el.parked.map((c) => c.id), 'the hub kept it: the list says so').toContain('ord-9');
    const notice = listNotice(el);
    expect(notice?.textContent?.trim(), 'two taps and nothing would happen: say why').toBe('ui.deleteCheckFailed');
    expect(notice!.closest('.pdrop'), 'inside the list, above its backdrop').not.toBeNull();
    const firstRow = $(el, '.pdrop .pitem')!;
    expect(notice!.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING, 'above the rows: no scroll to find it')
      .toBeTruthy();
    expect(notice!.getAttribute('role')).toBe('alert');
    expect(getComputedStyle(notice!).marginTop, 'its own margin, not the browser 1em of a bare <p>').toBe('0px');
    // The list scrolls (a busy bar has dozens of open checks, and a phone on its side leaves it
    // ~100 px): deleting a row further down scrolled the top of the list — and the notice — out of
    // sight on hub:stable at 844x390. It stays pinned to the top of the list, on the list's colour.
    expect(getComputedStyle(notice!).position, 'pinned while the rows scroll under it').toBe('sticky');
    expect(getComputedStyle(notice!).top).toBe('0px');
    expect(getComputedStyle(notice!).backgroundColor, 'opaque: the rows do not show through it').not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))?$/);
    expect(cartNotice(el), 'not a second copy under the backdrop').toBeNull();
    expect(pageNotice(el), 'nor on the page').toBeNull();
  });

  it('on a wide screen (the cart is a column, no drawer) the list keeps it alone too', async () => {
    const el = await mount();
    $(el, 'ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await settle(el);
    expect(el.cartOpen).toBe(false);
    refused.add('sales.order.void');
    await deleteFromList(el, 'ord-9');

    expect(listNotice(el)?.textContent?.trim()).toBe('ui.deleteCheckFailed');
    expect(pageNotice(el), 'one place at a time: not again on the page').toBeNull();
  });

  it('closing the drawer closes its list too, and the notice goes back to the page', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.void');
    await deleteFromList(el, 'ord-9');

    $(el, '[data-testid="pos-cart-close"]')!.click();
    await settle(el);

    expect(listNotice(el), 'no list left open inside a closed drawer').toBeNull();
    expect(pageNotice(el)?.textContent?.trim()).toBe('ui.deleteCheckFailed');
  });

  it('a tap on the drawer backdrop closes its list too', async () => {
    const el = await openCartWithLine();
    $(el, '[data-testid="pos-parked-toggle"]')!.click();
    await settle(el);
    $(el, '[data-testid="pos-cart-backdrop"]')!.click();
    await settle(el);

    expect($(el, '.pdrop'), 'the list does not wait, hidden, for the drawer to open again').toBeNull();
  });

  it('a delete that goes through clears a previous refusal', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.void');
    await deleteFromList(el, 'ord-9');
    refused.clear();
    $(el, '[data-testid="pos-parked-ord-9-delete"]')!.click();
    await settle(el);
    $(el, '[data-testid="pos-parked-ord-9-delete"]')!.click();
    await settle(el);

    expect(el.parked.map((c) => c.id)).not.toContain('ord-9');
    expect(el.error).toBe('');
  });
});

describe('3 · a refused gift, quantity or note puts the line BACK and says so', () => {
  it('gift: the line is not left «on the house» on screen when the order kept it at full price', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.update_line');
    await el.toggleGift(el.cart[0]);
    await settle(el);

    expect(el.cart[0].is_gift ?? false, 'the screen agrees with the order again').toBe(false);
    expect(cartNotice(el)?.textContent?.trim(), 'and the cashier is told why').toBe('ui.lineChangeFailed');
  });

  it('quantity: the line goes back to the quantity the order has', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.update_line');
    await el.setQtyAbs(el.cart[0], 2);
    await settle(el);

    expect(el.cart[0].qty, 'the order still has one').toBe(1);
    expect(cartNotice(el)?.textContent?.trim()).toBe('ui.lineChangeFailed');
  });

  it('quantity to zero: a refused removal leaves the line on the check, in its place', async () => {
    const el = await openCartWithLine();
    $(el, '[data-testid="pos-cart-close"]')!.click();
    await settle(el);
    el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')[1]!.click();
    await el.queue(async () => undefined);
    await settle(el);
    expect(el.cart.map((l) => l.line_id), 'two saved lines').toEqual(['line-1', 'line-2']);
    el.cartOpen = true;
    refused.add('sales.order.remove_line');
    await el.setQtyAbs(el.cart[0], 0);
    await settle(el);

    expect(el.cart.map((l) => l.line_id), 'the line the order still has is still on screen, first').toEqual(['line-1', 'line-2']);
    expect(el.cart[0].qty).toBe(1);
    expect(cartNotice(el)?.textContent?.trim()).toBe('ui.lineChangeFailed');
  });

  it('note: a refused note is taken off the line, the order does not have it', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.update_line');
    el.shadowRoot.querySelector<HTMLElement>(`[data-testid="pos-line-${el.cart[0].line_id}-note"]`)!.click();
    await el.updateComplete;
    await el.applyLineNote('sin azúcar');
    await settle(el);

    expect(el.cart[0].note, 'the kitchen would never see it: the screen must not show it').toBeUndefined();
    expect(cartNotice(el)?.textContent?.trim(), 'told in words, not the raw server sentence').toBe('ui.lineChangeFailed');
  });

  // The same product can be on the check twice (two professionals, sales#273; other modifiers,
  // pm#93; one of them on the house): `id` is the PRODUCT, `line_id` is the row. Putting a
  // refused line back must touch that row only — never its sibling, which the order still has as
  // it is on screen.
  describe('putting a refused line back leaves the other line of the same product alone', () => {
    async function twoLinesOfOneProduct(): Promise<Pos> {
      const el = await openCartWithLine();
      el.cart = [...el.cart, { ...el.cart[0], line_id: 'line-2', qty: 3, is_gift: true, note: 'poco hecho' }];
      await el.updateComplete;
      return el;
    }
    const sibling = (el: Pos) => el.cart.find((l) => l.line_id === 'line-2');

    it('gift', async () => {
      const el = await twoLinesOfOneProduct();
      refused.add('sales.order.update_line');
      await el.toggleGift(el.cart[0]);
      await settle(el);

      expect(el.cart[0].is_gift ?? false, 'the refused line is back').toBe(false);
      expect(sibling(el)?.is_gift, 'the other one is still on the house').toBe(true);
    });

    it('quantity', async () => {
      const el = await twoLinesOfOneProduct();
      refused.add('sales.order.update_line');
      await el.setQtyAbs(el.cart[0], 2);
      await settle(el);

      expect(el.cart[0].qty, 'the refused line is back').toBe(1);
      expect(sibling(el)?.qty, 'the other one keeps its quantity').toBe(3);
    });

    it('quantity to zero', async () => {
      const el = await twoLinesOfOneProduct();
      refused.add('sales.order.remove_line');
      await el.setQtyAbs(el.cart[0], 0);
      await settle(el);

      expect(el.cart.map((l) => [l.line_id, l.qty]), 'the refused removal is put back, in its place').toEqual([['line-1', 1], ['line-2', 3]]);
    });

    it('note', async () => {
      const el = await twoLinesOfOneProduct();
      refused.add('sales.order.update_line');
      el.shadowRoot.querySelector<HTMLElement>(`[data-testid="pos-line-${el.cart[0].line_id}-note"]`)!.click();
      await el.updateComplete;
      await el.applyLineNote('sin azúcar');
      await settle(el);

      expect(el.cart[0].note, 'the refused note is taken off').toBeUndefined();
      expect(sibling(el)?.note, 'the other one keeps the note the kitchen has').toBe('poco hecho');
    });
  });

  it('a gift that goes through clears a previous refusal', async () => {
    const el = await openCartWithLine();
    refused.add('sales.order.update_line');
    await el.toggleGift(el.cart[0]);
    await settle(el);
    refused.clear();
    await el.toggleGift(el.cart[0]);
    await settle(el);

    expect(el.cart[0].is_gift).toBe(true);
    expect(el.error).toBe('');
  });

  it('the new sentence exists in en AND in es', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    expect(en.lineChangeFailed, 'en').toBeTruthy();
    expect(es.lineChangeFailed, 'es').toBeTruthy();
    expect(es.lineChangeFailed, 'es is a translation, not a copy').not.toBe(en.lineChangeFailed);
    expect(en.deleteCheckFailed, 'en').toBeTruthy();
    expect(es.deleteCheckFailed, 'es').toBeTruthy();
    expect(es.deleteCheckFailed, 'es is a translation, not a copy').not.toBe(en.deleteCheckFailed);
  });
});
