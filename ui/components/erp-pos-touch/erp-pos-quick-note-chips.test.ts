// sales#206 — the QUICK-NOTE chips on top of the line-note sheet (#210 shipped the sheet itself).
//
// The market, in one line: Lightspeed Restaurant (K-Series) is the only one of the eight that
// ships this as a feature — notes created in the Back Office, applied with one tap on the POS,
// printed on the docket and shown on the KDS. Toast, Square, Clover, Revel, Simphony and SumUp
// give free text only (Square's own answer in its community forum to "how do I add predefined
// notes" is: use modifiers), Odoo needs its configuration/app, and Shopify POS needs an app
// (*BL POS Quick Product Notes*, five templates) — which is what tells you the demand is real
// where the product does not bring it. So we copy Lightspeed and nobody else.
//
// The rules the chips obey here:
//   · NO notes configured → NOTHING is painted. The sheet stays exactly the one #210 shipped, so
//     a business that never configures anything pays no price for the feature existing.
//   · A tap ADDS the text to what is already in the box, joined by «, ». It never replaces: the
//     kitchen prints ONE note per line, so "medium rare" + "no salt" have to survive together.
//   · A second tap on the same chip TAKES IT OUT (Lightspeed's notes are selected/deselected).
//   · The keyboard keeps working, before and after any chip.
//   · Loading and failure are VISIBLE inside the sheet, and neither blocks writing by hand.
import { beforeEach, describe, expect, it } from 'vitest';

const PRODUCTS = [
  { id: 'p-coffee', name: 'Coffee', price: 180, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

/** What the business configured, in the order it configured it. */
const QUICK_NOTES = [
  { id: 'qn-2', text: 'no salt', sort_order: 20 },
  { id: 'qn-1', text: 'medium rare', sort_order: 10 },
];

let quickNotes: Array<Record<string, unknown>> = [];
let quickNotesFails = false;
/** When set, the read waits on this before answering — that is the only way to SEE `loading`. */
let quickNotesPending: Promise<void> | null = null;
let quickNotesCalls: Array<{ name: string; params: unknown }> = [];

function installSdk() {
  quickNotes = QUICK_NOTES.map((n) => ({ ...n }));
  quickNotesFails = false;
  quickNotesPending = null;
  quickNotesCalls = [];
  const orderLines: Record<string, unknown>[] = [];
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'sales.settings.get') return [{ allow_discounts: 1 }];
      if (name === 'sales.order.lines') return orderLines;
      return [];
    },
    queryAll: async (name: string, params?: unknown) => {
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'taxes.rules.list') return RULES;
      if (name === 'sales.quick_notes.list') {
        quickNotesCalls.push({ name, params });
        if (quickNotesPending) await quickNotesPending;
        if (quickNotesFails) throw new Error('boom');
        return quickNotes;
      }
      return [];
    },
    queryOptional: async () => undefined,
    // sales#25 — `inventory` is an OPTIONAL capability now: the till reads its catalogue through
    // this door, and for an app that IS in this hub it answers like the required one.
    queryAllOptional: async (name: string) => (name === 'inventory.products.list' ? PRODUCTS : undefined),

    command: async (name: string, payload: Record<string, unknown>) => {
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
  quickNotes: Array<{ id: string; text: string }>;
  quickNotesState: 'idle' | 'loading' | 'ready' | 'error';
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

/** Opens the note sheet on the only line and waits for the lazy read to settle. */
async function openSheet(el: Pos): Promise<void> {
  el.openLineNote(el.cart[0].line_id);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

function chips(el: Pos): HTMLElement[] {
  return [...el.shadowRoot.querySelectorAll<HTMLElement>('.note-sheet .note-chip')];
}

function textarea(el: Pos): HTMLTextAreaElement {
  return el.shadowRoot.querySelector('.note-sheet .note-input') as HTMLTextAreaElement;
}

describe('the quick-note chips', () => {
  beforeEach(() => installSdk());

  it('paints one chip per configured note, in the order the business gave them', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    expect(chips(el).map((c) => c.textContent?.trim())).toEqual(['medium rare', 'no salt']);
  });

  it('reads them through the till’s door, never through `manage_settings` (sales#205)', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    expect(quickNotesCalls.length).toBeGreaterThan(0);
    expect(quickNotesCalls[0].name).toBe('sales.quick_notes.list');
    expect(quickNotesCalls[0].params).toMatchObject({ sort: 'sort_order', dir: 'asc' });
  });

  it('paints NOTHING when the business configured none — the sheet stays the one #210 shipped', async () => {
    quickNotes = [];
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    expect(el.shadowRoot.querySelector('.note-sheet .note-chips')).toBeNull();
    expect(textarea(el), 'the free keyboard is still there').toBeTruthy();
  });

  it('a tap writes the text into the box', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    chips(el)[0].click();
    await el.updateComplete;
    expect(el.noteInput).toBe('medium rare');
    expect(textarea(el).value).toBe('medium rare');
  });

  it('a second chip is ADDED, not swapped in: the kitchen prints both', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    chips(el)[0].click();
    await el.updateComplete;
    chips(el)[1].click();
    await el.updateComplete;
    expect(el.noteInput).toBe('medium rare, no salt');
  });

  it('tapping the same chip again takes it out, so nothing is printed twice', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    chips(el)[0].click();
    await el.updateComplete;
    chips(el)[0].click();
    await el.updateComplete;
    expect(el.noteInput).toBe('');
  });

  it('lights the chip that is in the note, so the waiter sees what is applied', async () => {
    const el = await mount();
    await addCoffee(el);
    el.cart[0].note = 'no salt';
    await openSheet(el);
    expect(chips(el)[0].getAttribute('aria-pressed')).toBe('false');
    expect(chips(el)[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('adds onto text typed by hand — the keyboard never stops working', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    const box = textarea(el);
    box.value = 'shellfish allergy';
    box.dispatchEvent(new Event('input'));
    await el.updateComplete;
    chips(el)[1].click();
    await el.updateComplete;
    expect(el.noteInput).toBe('shellfish allergy, no salt');
  });

  it('saving what the chips built writes the ONE note the line carries', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    chips(el)[0].click();
    chips(el)[1].click();
    await el.updateComplete;
    await el.applyLineNote(el.noteInput);
    await el.updateComplete;
    expect(el.cart[0].note).toBe('medium rare, no salt');
  });

  it('says it is loading, and never blocks the keyboard while it does', async () => {
    // The read is held open on purpose: resolved in a microtask the state would be `ready` before
    // anything could be looked at, and the test would pass without ever seeing the loading path.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => { release = r; });
    quickNotesPending = held;
    const el = await mount();
    await addCoffee(el);
    el.openLineNote(el.cart[0].line_id);
    await el.updateComplete;
    expect(el.quickNotesState).toBe('loading');
    expect(el.shadowRoot.querySelector('.note-sheet .note-chips-state')?.textContent)
      .toContain('lineNoteQuickLoading');
    expect(textarea(el), 'the keyboard is usable while the chips are on their way').toBeTruthy();
    release();
    await held;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(el.quickNotesState).toBe('ready');
  });

  it('says so when the read FAILS, and the sheet keeps working by hand', async () => {
    quickNotesFails = true;
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    expect(el.quickNotesState).toBe('error');
    expect(el.shadowRoot.querySelector('.note-sheet .note-chips-state')?.textContent)
      .toContain('lineNoteQuickError');
    expect(textarea(el), 'the free keyboard survives the failure').toBeTruthy();
  });

  it('reads the catalogue ONCE, not on every line the waiter annotates', async () => {
    const el = await mount();
    await addCoffee(el);
    await openSheet(el);
    el.noteSheet = undefined;
    await el.updateComplete;
    await openSheet(el);
    expect(quickNotesCalls.length).toBe(1);
  });
});
