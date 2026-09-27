// sales#412 — on a phone the till shows the running TOTAL without opening the cart.
//
// Below 820px the cart is a drawer and the only thing on screen was the round cart button with a
// counter («2»). With a customer asking «how much is it?», the cashier had to open the drawer to
// read the total and close it again to keep adding. Square, Toast and Shopify POS carry the amount
// on the cart button / bar itself; so does this till now: the button stretches into a pill with the
// same total the cart's «Total» row shows.
//
// happy-dom resolves the cascade of the shadow root (getComputedStyle), so the visual promise —
// the pill grows to fit the amount, the amount stays on one line and is not hidden — is pinned on
// the computed style, not on the stylesheet text.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

function moduleRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('module.json not found walking up from the test');
    dir = up;
  }
  return dir;
}

const PRODUCTS = [
  { id: 'p-1', name: 'Corte', sku: 'CUT', price: 1190, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-2', name: 'Tinte', sku: 'DYE', price: 1800, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  ticketDiscount: number;
}

const fab = (el: Pos) => el.shadowRoot.querySelector<HTMLButtonElement>('[data-testid="pos-cart-fab"]')!;
const fabTotal = (el: Pos) => el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-cart-fab-total"]');
/** The «Total» row of the cart itself: the number the FAB has to repeat. */
const cartTotal = (el: Pos) => el.shadowRoot.querySelector<HTMLElement>('.cart .total b')!.textContent!.trim();

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function tapTile(el: Pos, index = 0) {
  el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')[index]!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

beforeEach(() => {
  installPosDouble({
    settings: null,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    command: async (name: string) => (name === 'sales.order.open'
      ? { ok: true, new_ids: ['ord-1', 'line-1'] }
      : { ok: true, new_ids: ['line-2'], rows: [] }),
  });
});

describe('the cart button carries the running total on a phone (sales#412)', () => {
  it('an empty cart has no amount: the round button stays as it was', async () => {
    const el = await mount();
    expect(fabTotal(el), 'nothing to add up yet').toBeNull();
    expect(fab(el).hasAttribute('data-has-items'), 'round, not a pill').toBe(false);
  });

  it('with items, the button shows the SAME total as the cart, and follows every tap', async () => {
    const el = await mount();
    await tapTile(el);
    const afterOne = fabTotal(el)?.textContent?.trim();
    expect(afterOne, 'the amount is on the button').toBeTruthy();
    expect(afterOne, 'and it is the cart total, not a figure of its own').toBe(cartTotal(el));

    await tapTile(el, 1);
    const afterTwo = fabTotal(el)!.textContent!.trim();
    expect(afterTwo, 'a second item moves it').not.toBe(afterOne);
    expect(afterTwo).toBe(cartTotal(el));
  });

  it('a ticket discount is in it too: the button never promises more than the cart asks', async () => {
    const el = await mount();
    await tapTile(el);
    const before = fabTotal(el)!.textContent!.trim();
    el.ticketDiscount = 10;
    await el.updateComplete;
    expect(fabTotal(el)!.textContent!.trim(), 'the discounted total').toBe(cartTotal(el));
    expect(fabTotal(el)!.textContent!.trim()).not.toBe(before);
  });

  it('an amount discount on the ticket is in it too (sales#113), not only the percentage one', async () => {
    const el = await mount() as Pos & { ticketDiscountAmount: number };
    await tapTile(el);
    const before = fabTotal(el)!.textContent!.trim();
    el.ticketDiscountAmount = 500;
    await el.updateComplete;
    expect(fabTotal(el)!.textContent!.trim(), 'the total minus the fixed discount').toBe(cartTotal(el));
    expect(fabTotal(el)!.textContent!.trim()).not.toBe(before);
  });

  it('the screen reader hears the total too, not just the count', async () => {
    // A t() that shows the params it was given, so the label can be read with its values.
    installPosDouble({
      settings: null,
      products: PRODUCTS,
      rules: RULES,
      paymentMethods: METHODS,
      t: (_catalog, key, params) => (params
        ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('|')}`
        : key),
      command: async () => ({ ok: true, new_ids: ['ord-1', 'line-1'] }),
    });
    const el = await mount();
    await tapTile(el);
    const label = fab(el).getAttribute('aria-label')!;
    // One item takes the singular key (sales#417: «1 artículos» was this very label).
    expect(label.split('|')[0], 'one item: the singular key, with the amount').toBe('ui.openCartWithItemsOne');
    expect(label, 'the amount the cart asks for').toContain(`total=${cartTotal(el)}`);
    await tapTile(el, 1);
    const two = fab(el).getAttribute('aria-label')!;
    expect(two.split('|')[0], 'two items: the published plural key').toBe('ui.openCartWithItems');
    expect(two).toContain('count=2');
    expect(two, 'the amount the cart asks for').toContain(`total=${cartTotal(el)}`);
  });

  it('the label carries {total} in both languages: a key without it would drop the amount silently', () => {
    for (const lang of ['en', 'es']) {
      const catalog = JSON.parse(readFileSync(join(moduleRoot(), 'locales', `${lang}.json`), 'utf8'));
      const text: string = catalog.ui.openCartWithItems;
      expect(text, `${lang}: the count`).toContain('{count}');
      expect(text, `${lang}: the total`).toContain('{total}');
      expect(catalog.ui.openCartWithItemsOne, `${lang}: the total of the singular (sales#417)`).toContain('{total}');
    }
  });

  it('with items the button becomes a pill that fits the amount on one line, and the amount is visible', async () => {
    const el = await mount();
    await tapTile(el);
    const button = getComputedStyle(fab(el));
    expect(fab(el).hasAttribute('data-has-items')).toBe(true);
    expect(button.width, 'a fixed 3.6rem circle cuts «29,90 €»: the pill grows with its content').toBe('auto');
    // happy-dom resolves the var() to its fallback: the pill radius of the chips of the till.
    expect(button.borderRadius, 'pill-shaped, like the rest of the chips of the till').toBe('999px');
    expect(parseFloat(button.paddingLeft), 'the amount does not touch the edge of the pill').toBeGreaterThan(0);
    expect(parseFloat(button.gap), 'the cart icon and the amount do not touch').toBeGreaterThan(0);

    const amount = getComputedStyle(fabTotal(el)!);
    expect(amount.display, 'the amount is painted').not.toBe('none');
    expect(amount.whiteSpace, '«29,90 €» never breaks between the figure and the €').toBe('nowrap');
    // Read at arm's length: the amount is bold and its digits keep their width, so the pill does not
    // wobble on every tap. (Its 1rem size is not checked here: happy-dom already reports 16px for a
    // button's text, so only a real browser tells it apart from the 13.33px of a bare button.)
    expect(amount.fontWeight, 'bold').toBe('800');
    expect(amount.fontVariantNumeric, 'fixed-width digits').toBe('tabular-nums');
  });
});
