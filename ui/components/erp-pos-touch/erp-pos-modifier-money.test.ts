// sales#208 — «+ queso 3,00 €» has to be VISIBLE in the money, not only in the name.
//
// The till painted the line at the product's BASE price and left the delta to the server: a burger
// with cheese read 9,00 € in the cart, 9,00 € on the bill taken to the table — and the drawer took
// 12,00 €. sales#209 made the CHARGE authoritative (`sales.checkout.preview`), so the button and
// the mixed payment already say 12,00 €; what still lied is every figure the screen composes line
// by line, and the `line_total` it writes on the order row (which is what
// `order_recompute_total.sql` adds up into the open check's `provisional_total`).
//
// The money is never invented here: at the picker it is the delta the OPTION was showing, and on a
// resumed check the one the SERVER froze on the row (sales#200). And it stays display money — the
// payloads keep travelling with `option_id` alone (sales#68).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BURGER = { id: 'p-burger', name: 'Hamburguesa', price: 900, tax_category_key: 'product.generic' };

/** `modifiers.for_target`, flattened: one free choice and one that costs 3,00 €. */
const GROUPS = [
  { group_id: 'g-point', group_name: 'Punto', min_choices: 0, max_choices: 1, group_sort_order: 10,
    option_id: 'o-rare', option_name: 'Poco hecho', price_delta: 0, option_sort_order: 10 },
  { group_id: 'g-extras', group_name: 'Extras', min_choices: 0, max_choices: 0, group_sort_order: 20,
    option_id: 'o-cheese', option_name: 'Extra de queso', price_delta: 300, option_sort_order: 10 },
];

let commands: { name: string; params: Record<string, unknown> }[] = [];

beforeAll(async () => { await import('./erp-pos-touch'); }, 60_000);

beforeEach(() => {
  document.body.innerHTML = '';
  commands = [];
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => (name === 'inventory.products.for_sale' ? [BURGER] : []),
    queryOptional: async (name: string) => (name === 'modifiers.for_target' ? GROUPS : undefined),
    queryAllOptional: async () => undefined,
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { new_ids: [`row-${commands.length}`] };
    },
    currency: 'EUR',
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2)} €`,
    formatAmount: (u: number) => `${(u || 0).toFixed(2)} €`,
    t: (_c: unknown, k: string) => k,
    loadSlot: async () => [],
    notify: () => {},
  };
});

interface Pos extends HTMLElement {
  cart: { price: number; qty: number; modifiers?: { option_id: string; price_delta?: number }[] }[];
  updateComplete: Promise<unknown>;
  modifierPicks: string[];
  add(p: unknown): Promise<void>;
  confirmModifiers(): Promise<void>;
}

/** Adds the burger through the picker, with «extra de queso» ticked. */
async function burgerWithCheese(): Promise<Pos> {
  const el = document.createElement('erp-pos-touch') as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.add(BURGER);
  await el.updateComplete;
  el.modifierPicks = ['o-cheese'];
  await el.confirmModifiers();
  await el.updateComplete;
  return el;
}

describe('the cart line is worth what the customer will pay', () => {
  it('paints 12,00 € for a 9,00 € burger with «+ queso 3,00 €»', async () => {
    const el = await burgerWithCheese();
    const amounts = [...el.shadowRoot!.querySelectorAll('.lineend .lt')].map((n) => n.textContent?.trim());
    expect(amounts, 'the line, not only the ticket, adds the supplement').toEqual(['12.00 €']);
  });

  it('the line keeps the delta the PICKER was showing', async () => {
    const el = await burgerWithCheese();
    expect(el.cart[0].modifiers).toEqual([{ option_id: 'o-cheese', price_delta: 300 }]);
    expect(el.cart[0].price, 'the base price is untouched: it is what travels to the server').toBe(900);
  });

  it('but the PAYLOAD still travels with the id alone: a delta from the browser buys nothing', async () => {
    await burgerWithCheese();
    const open = commands.find((c) => c.name === 'sales.order.open');
    expect(open, 'the check is opened with its first line').toBeTruthy();
    const items = open!.params.items as Record<string, unknown>[];
    expect(items[0].modifiers).toEqual([{ option_id: 'o-cheese' }]);
    expect(items[0].price, 'the BASE price is what is proposed; the server prices the supplement').toBe(900);
  });
});

describe('the BILL taken to the table says the same', () => {
  it('the line of the bill is 12,00 €, like the ticket the drawer will print', async () => {
    const el = await burgerWithCheese();
    const pos = el as unknown as Record<string, unknown>;
    pos.prebillOpen = true;
    await el.updateComplete;
    const doc = el.shadowRoot!.querySelector('#prebill-doc') as HTMLElement & {
      receipt?: { lines?: { total?: number }[]; total?: number };
    };
    expect(doc, 'the bill is rendered').toBeTruthy();
    expect(doc.receipt?.lines?.[0].total, 'cents (ADR-0007)').toBe(1200);
    expect(doc.receipt?.total, 'and the total is the sum of what the lines say').toBe(1200);
  });
});
