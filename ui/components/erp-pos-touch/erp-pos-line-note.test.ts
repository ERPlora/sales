// sales#156 — the line's «Note» button and its text sheet.
//
// The SHAPE is decided by the MARKET, not by us (8 references + forums, table in the PR):
//   · Toast — select the item and «Special Request» appears among its modifier groups, free
//     keyboard, and it prints on the kitchen ticket.
//   · Square — tap the line in the tape and the item detail carries its «Notes» field.
//   · Lightspeed (K) — a note per line/course, free text or from a list the business configures,
//     shown on the KDS and on the docket.
//   · Odoo 17 POS — select the product and «Customer Note» on the ticket pad.
//   · Clover — `lineItem.note`, editable before and after payment.
//   · Revel — «special requests» per item, printed on the kitchen receipt (in red, if configured).
//   · Simphony — the condiment/note hangs off the selected menu item.
//   · Shopify POS — native at ORDER level only; per line it needs an app.
// The first seven win: A BUTTON ON THE SELECTED LINE, next to the supplements and the comp, and a
// sheet with a free keyboard. Shopify loses: a note on the order does not say which plate it is
// about, which is the one thing the kitchen needs to know.
//
// Deliberately out of scope: notes PRECONFIGURED by the business (Lightspeed's model) need their
// own CRUD in settings and go in their own issue. What ships here — free text — is what the other
// seven do, and it stands on its own.

import { beforeEach, describe, expect, it } from 'vitest';

const PRODUCTS = [
  { id: 'p-coffee', name: 'Coffee', price: 180, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk() {
  commands = [];
  const orderLines: Record<string, unknown>[] = [];
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'sales.settings.get') return [{ allow_discounts: 1 }];
      if (name === 'sales.order.lines') return orderLines;
      return [];
    },
    queryAll: async (name: string) =>
      (name === 'inventory.products.list' ? PRODUCTS : name === 'taxes.rules.list' ? RULES : []),
    queryOptional: async () => undefined,
    queryAllOptional: async () => undefined,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        const it = (payload.items as Record<string, unknown>[])[0];
        orderLines.push({ id: 'line-1', product_id: it.product_id, product_name: it.product_name,
                          quantity: it.quantity, unit_price: it.price, line_total: it.price,
                          notes: it.notes });
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: ['line-2'] };
    },
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} EUR`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} EUR`,
    t: (_c: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => {},
    hasPermission: () => true,
  };
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: { id: string; line_id?: string; note?: string }[];
  queue<T>(t: () => Promise<T>): Promise<T>;
  openLineNote(lineId?: string): void;
  applyLineNote(note: string): Promise<void>;
  noteSheet?: { lineId?: string };
  noteInput: string;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el as unknown as Node);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function addCoffee(el: Pos) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === 'Coffee')!;
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

describe('the line note button', () => {
  beforeEach(() => installSdk());

  it('is on every editable line, next to the discount and the comp', async () => {
    const el = await mount();
    await addCoffee(el);
    expect(el.shadowRoot.querySelector('.line-note'), 'line note button').toBeTruthy();
  });

  it('opens the sheet with the note the line already has', async () => {
    // Reopening to CORRECT is half the use: a blank sheet would force the waiter to retype the
    // whole allergy just to add a word to it.
    const el = await mount();
    await addCoffee(el);
    el.cart[0].note = 'no sugar';
    el.openLineNote(el.cart[0].line_id);
    await el.updateComplete;
    expect(el.noteInput).toBe('no sugar');
    expect(el.shadowRoot.querySelector('.note-sheet'), 'the sheet is open').toBeTruthy();
  });

  it('saving writes it on the line and on the order row', async () => {
    const el = await mount();
    await addCoffee(el);
    el.openLineNote(el.cart[0].line_id);
    await el.applyLineNote('no sugar');
    await el.updateComplete;
    expect(el.cart[0].note).toBe('no sugar');
    expect(commands.find((c) => c.name === 'sales.order.update_line')?.payload)
      .toMatchObject({ line_id: 'line-1', notes: 'no sugar' });
  });

  it('and paints it under the item name', async () => {
    // If it is not visible the waiter does not know whether it was typed — so it gets typed twice,
    // or taken for granted.
    const el = await mount();
    await addCoffee(el);
    el.openLineNote(el.cart[0].line_id);
    await el.applyLineNote('no sugar');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.line-note-text')?.textContent).toContain('no sugar');
  });

  it('emptying it removes it from the line and sends the empty string', async () => {
    // A note that cannot be removed is worse than no note: the kitchen keeps cooking to a request
    // that was cancelled.
    const el = await mount();
    await addCoffee(el);
    el.openLineNote(el.cart[0].line_id);
    await el.applyLineNote('no sugar');
    el.openLineNote(el.cart[0].line_id);
    await el.applyLineNote('   ');
    await el.updateComplete;
    expect(el.cart[0].note).toBeUndefined();
    const ups = commands.filter((c) => c.name === 'sales.order.update_line');
    expect(ups[ups.length - 1].payload.notes).toBe('');
    expect(el.shadowRoot.querySelector('.line-note-text')).toBeNull();
  });

  it('closing the sheet without saving touches nothing', async () => {
    const el = await mount();
    await addCoffee(el);
    el.openLineNote(el.cart[0].line_id);
    await el.updateComplete;
    el.noteSheet = undefined;
    await el.updateComplete;
    expect(el.cart[0].note).toBeUndefined();
    expect(commands.some((c) => c.name === 'sales.order.update_line')).toBe(false);
  });
});
