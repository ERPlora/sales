// sales#441 — a refused Delete / Park / Leave-at-the-table does not pretend to have happened.
//
// Changing check with one half-done in front asks «park it or delete it?» (or leaves it at its
// table, when it has one). The three doors wrote the order with a `.catch(() => undefined)`: when
// the hub said no, the till cleared the screen anyway and said nothing. The «deleted» check was
// still open in the hub and came back in the list later; a refused park name left it parked with
// no name, and nobody knew.
//
// The rule is sales#438's (deleting from the list): when the hub refuses, the check stays on
// screen as it was, the switch does not happen, and the cashier is told why on the surface in
// front of them. Every POS does the same (Square, Toast, Lightspeed, Odoo, Shopify, Loyverse): an
// action the server refused did not happen, and the ticket stays where it was.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

/** The typed error the SDK really throws: a `code` FIELD plus a sentence. */
class FakeErploraError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}

/** Commands the hub refuses right now, by name, with the code it answers. */
let refused = new Map<string, string>();
let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];
let openOrders: Record<string, unknown>[] = [];
/** What the hub stored as the label of each order. */
let labels: Record<string, string> = {};
/** When set, set_label waits for it: the hub is slow to answer. */
let slowLabel: Promise<void> | undefined;

function installSdk() {
  refused = new Map();
  commands = [];
  orderLines = [];
  labels = {};
  slowLabel = undefined;
  openOrders = [{ id: 'ord-9', status: 'open', label: 'Mesa 9', provisional_total: 300, created_at: '2026-09-28T08:00:00Z' }];
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    orderLines: () => orderLines,
    orders: () => openOrders,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.set_label' && slowLabel) await slowLabel;
      const code = refused.get(name);
      if (code) throw new FakeErploraError(code, `REFUSED ${name}`);
      if (name === 'sales.order.open') {
        orderLines = [{
          id: 'line-1', product_id: 'p-cafe', product_name: 'Café', quantity: 1_000_000,
          unit_price: 150, line_total: 150, tax_category_key: 'product.generic',
        }];
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      if (name === 'sales.order.set_label') labels[String(payload.order_id)] = String(payload.label);
      if (name === 'sales.order.void') openOrders = openOrders.filter((o) => o.id !== payload.order_id);
      return { ok: true, new_ids: [] };
    },
  });
}

interface Line { id: string; line_id?: string; qty: number }
interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: Line[];
  error: string;
  cartOpen: boolean;
  orderId?: string;
  orderLabel: string;
  tableId?: string;
  tableLabel: string;
  dirtyOpen: boolean;
  parkPromptOpen: boolean;
  parkName: string;
  retrieve(c: { id: string; label?: string }): Promise<void>;
  requestPark(): Promise<void>;
  assignFillers: Array<{ component: string; el: HTMLElement }>;
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
/** The one notice on screen, wherever the till put it (cart footer, list, or page). */
const shownNotice = (el: Pos) =>
  [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-cart-error"], [data-testid="pos-parked-error"], .catalog > .err')]
    .map((n) => n.textContent?.trim());

/** Events a table filler receives from the till. */
let fillerEvents: string[] = [];

/** A bar check (no table) with one saved line, the cart drawer open, and a table filler listening. */
async function barCheck(): Promise<Pos> {
  const el = await mount();
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await settle(el);
  $(el, '[data-testid="pos-cart-fab"]')!.click();
  await settle(el);
  expect(el.orderId, 'the check is a real order').toBe('ord-1');
  fillerEvents = [];
  const filler = document.createElement('div');
  for (const ev of ['erp:order-detached', 'erp:order-parked', 'erp:order-context-reset']) {
    filler.addEventListener(ev, () => fillerEvents.push(ev));
  }
  el.assignFillers.push({ component: 'erp-fake-mesa', el: filler });
  return el;
}

/** Same, but the check lives at a table. */
async function tableCheck(): Promise<Pos> {
  const el = await barCheck();
  el.tableId = 'm4';
  el.tableLabel = 'Mesa 4';
  el.orderLabel = 'Mesa 4';
  await el.updateComplete;
  return el;
}

/** Waits for the «park or delete?» dialog and answers it. */
async function answer(el: Pos, choice: 'discard' | 'park'): Promise<void> {
  await settle(el);
  expect(el.dirtyOpen, 'the till asks what to do with the check in front').toBe(true);
  $(el, `[data-testid="pos-dirty-${choice}"]`)!.click();
  await settle(el);
}

/** The check in front is exactly as it was: same order, same line, still remembered. */
function stillOnScreen(el: Pos): void {
  expect(el.orderId, 'the switch did not happen: the same check is in front').toBe('ord-1');
  expect(el.cart.map((l) => l.line_id), 'with its line').toEqual(['line-1']);
  expect(localStorage.getItem('erplora.pos.currentCheck'), 'and this terminal still remembers it')
    .toBe('ord-1');
}

beforeEach(() => { localStorage.clear(); installSdk(); });

describe('1 · picking another check from the list with a bar check in front', () => {
  it('Delete refused: the check stays on screen, the other one is not opened, and the till says why', async () => {
    const el = await barCheck();
    refused.set('sales.order.void', 'sales.refused_here');
    const done = el.retrieve({ id: 'ord-9', label: 'Mesa 9' });
    await answer(el, 'discard');
    await done;
    await settle(el);

    expect(commands.some((c) => c.name === 'sales.order.void'), 'the delete was really asked for').toBe(true);
    stillOnScreen(el);
    expect(el.error).toBe('ui.discardCheckFailed');
    expect(shownNotice(el), 'told once, where the cashier is looking').toEqual(['ui.discardCheckFailed']);
    expect(fillerEvents, 'the fillers were not told the check went away').toEqual([]);
  });

  const declared = [
    (enLocale as { errors: Record<string, string> }).errors['sales.already_voided'],
    (esLocale as { errors: Record<string, string> }).errors['sales.already_voided'],
  ];
  for (const [what, command, start] of [
    ['Delete', 'sales.order.void', async (el: Pos) => { const d = el.retrieve({ id: 'ord-9' }); await answer(el, 'discard'); await d; }],
    ['Park', 'sales.order.set_label', async (el: Pos) => { const d = el.retrieve({ id: 'ord-9' }); await answer(el, 'park'); await d; }],
    ['Leave at the table', 'sales.order.set_label', async (el: Pos) => {
      el.tableId = 'm4'; el.tableLabel = 'Mesa 4';
      await el.retrieve({ id: 'ord-9' });
    }],
  ] as const) {
    it(`${what} refused with a DECLARED code: the till says the hub's reason, not a generic line`, async () => {
      const el = await barCheck();
      refused.set(command, 'sales.already_voided');
      await start(el);
      await settle(el);

      expect(declared, 'the catalogue sentence for that code').toContain(el.error);
      stillOnScreen(el);
    });
  }

  it('Park refused: the check stays on screen (not parked without its name), and the till says why', async () => {
    const el = await barCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    const done = el.retrieve({ id: 'ord-9' });
    await answer(el, 'park');
    await done;
    await settle(el);

    stillOnScreen(el);
    expect(el.error).toBe('ui.parkCheckFailed');
    expect(shownNotice(el)).toEqual(['ui.parkCheckFailed']);
    expect(fillerEvents, 'nothing was parked, so nobody lets go of anything').toEqual([]);
  });

  it('retrying and getting through switches as usual and leaves no notice behind', async () => {
    const el = await barCheck();
    refused.set('sales.order.void', 'sales.refused_here');
    let done = el.retrieve({ id: 'ord-9' });
    await answer(el, 'discard');
    await done;
    refused.clear();
    done = el.retrieve({ id: 'ord-9' });
    await answer(el, 'discard');
    await done;
    await settle(el);

    expect(el.orderId, 'now the other check is in front').toBe('ord-9');
    expect(el.error).toBe('');
  });
});

describe('2 · a check that lives at a table is left there — unless the hub refuses', () => {
  it('picking another check: Leave-at-the-table refused keeps the check (and its table) on screen', async () => {
    const el = await tableCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await el.retrieve({ id: 'ord-9' });
    await settle(el);

    stillOnScreen(el);
    expect(el.tableId, 'still at its table').toBe('m4');
    expect(el.error).toBe('ui.leaveOnTableFailed');
    expect(shownNotice(el)).toEqual(['ui.leaveOnTableFailed']);
    expect(fillerEvents, 'the table keeps its selection: nothing was detached').toEqual([]);
  });

  it('the Park button at a table: refused keeps the check on screen and says why', async () => {
    const el = await tableCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await el.requestPark();
    await settle(el);

    stillOnScreen(el);
    expect(el.tableId).toBe('m4');
    expect(el.error).toBe('ui.leaveOnTableFailed');
    expect(fillerEvents).toEqual([]);
  });

  it('the Park button at a table: retrying and getting through clears the old notice', async () => {
    const el = await tableCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await el.requestPark();
    refused.clear();
    await el.requestPark();
    await settle(el);

    expect(el.orderId).toBeUndefined();
    expect(el.error, 'it went through: «could not be left» would be a lie').toBe('');
  });

  it('the Park button at a table: when it goes through, the screen is let go as before', async () => {
    const el = await tableCheck();
    await el.requestPark();
    await settle(el);

    expect(labels['ord-1']).toBe('Mesa 4');
    expect(el.orderId).toBeUndefined();
    expect(fillerEvents).toEqual(['erp:order-detached']);
    expect(el.error).toBe('');
  });
});

describe('3 · the park prompt (a bar check, a name typed by the cashier)', () => {
  async function typeAndConfirm(el: Pos, name: string): Promise<void> {
    await el.requestPark();
    await settle(el);
    expect(el.parkPromptOpen).toBe(true);
    const input = $(el, '[data-testid="pos-park-name"]') as HTMLInputElement;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    $(el, '[data-testid="pos-park-confirm"]')!.click();
    await settle(el);
  }

  it('a refused name keeps the prompt OPEN with what was typed, and says why inside it', async () => {
    const el = await barCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await typeAndConfirm(el, 'Ana — terraza');

    expect(el.parkPromptOpen, 'the prompt is where the cashier is: it does not vanish').toBe(true);
    expect(($(el, '[data-testid="pos-park-name"]') as HTMLInputElement).value, 'nothing typed is lost').toBe('Ana — terraza');
    const notice = $(el, '[data-testid="pos-park-error"]');
    expect(notice?.textContent?.trim(), 'the reason, inside the prompt').toBe('ui.parkCheckFailed');
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.closest('dialog.park-dialog'), 'inside the dialog (top layer), not behind it').not.toBeNull();
    expect(shownNotice(el), 'one place at a time: not again in the cart or on the page behind the prompt').toEqual([]);
    stillOnScreen(el);
    expect(fillerEvents, 'not parked').toEqual([]);
  });

  it('a second tap while the name is being written does not park twice', async () => {
    const el = await barCheck();
    let release!: () => void;
    slowLabel = new Promise((r) => { release = r; });
    await el.requestPark();
    await settle(el);
    $(el, '[data-testid="pos-park-confirm"]')!.click();
    await settle(el);
    expect($(el, '[data-testid="pos-park-confirm"]')!.hasAttribute('disabled'), 'the button says it is busy').toBe(true);
    $(el, '[data-testid="pos-park-confirm"]')!.click();
    $(el, '[data-testid="pos-park-name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    release();
    await settle(el);

    expect(commands.filter((c) => c.name === 'sales.order.set_label'), 'one name written, one park').toHaveLength(1);
    expect(el.parkPromptOpen).toBe(false);
  });

  it('confirming with Enter behaves the same', async () => {
    const el = await barCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await el.requestPark();
    await settle(el);
    $(el, '[data-testid="pos-park-name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(el);

    expect(el.parkPromptOpen).toBe(true);
    expect($(el, '[data-testid="pos-park-error"]')?.textContent?.trim()).toBe('ui.parkCheckFailed');
    stillOnScreen(el);
  });

  it('retrying and getting through parks it with the typed name and closes the prompt', async () => {
    const el = await barCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await typeAndConfirm(el, 'Ana — terraza');
    refused.clear();
    $(el, '[data-testid="pos-park-confirm"]')!.click();
    await settle(el);

    expect(labels['ord-1'], 'parked WITH the name').toBe('Ana — terraza');
    expect(el.parkPromptOpen).toBe(false);
    expect(el.orderId, 'let go of the screen').toBeUndefined();
    expect(el.error).toBe('');
    expect($(el, '[data-testid="pos-park-error"]')).toBeNull();
  });

  it('opening the prompt again does not carry an old refusal into it', async () => {
    const el = await barCheck();
    refused.set('sales.order.set_label', 'sales.refused_here');
    await typeAndConfirm(el, 'Ana');
    $(el, '[data-testid="pos-park-cancel"]')!.click();
    await settle(el);
    expect(shownNotice(el), 'cancelled: the notice goes back to the surface in front, not lost').toEqual(['ui.parkCheckFailed']);
    await el.requestPark();
    await settle(el);

    expect($(el, '[data-testid="pos-park-error"]'), 'a fresh prompt has nothing refused yet').toBeNull();
  });
});

describe('4 · touching a table with a bar check in front (the table picker already moved)', () => {
  const tapTable = async (el: Pos, detail: Record<string, unknown>) => {
    el.dispatchEvent(new CustomEvent('erp:order-context', { detail, bubbles: true, composed: true }));
  };

  for (const choice of ['discard', 'park'] as const) {
    it(`${choice} refused: the bar check stays, the table's check is not opened, and the picker lets go of that table`, async () => {
      const el = await barCheck();
      refused.set(choice === 'discard' ? 'sales.order.void' : 'sales.order.set_label', 'sales.refused_here');
      await tapTable(el, { table_id: 'm9', label: 'Mesa 9', order_id: 'ord-9' });
      await answer(el, choice);
      await settle(el);

      stillOnScreen(el);
      expect(el.tableId, 'the bar check did not move to the table').toBeUndefined();
      expect(el.error).toBe(choice === 'discard' ? 'ui.discardCheckFailed' : 'ui.parkCheckFailed');
      expect(shownNotice(el)).toEqual([el.error]);
      // The picker selected Mesa 9 before asking us: without this it would stay highlighted with
      // the bar check on screen, and the next action would go to the wrong check.
      expect(fillerEvents, 'the picker drops its selection, without touching the table').toEqual(['erp:order-detached']);
    });
  }

  it('removing the table (none selected) with a bar check: a refused delete keeps the check', async () => {
    const el = await barCheck();
    refused.set('sales.order.void', 'sales.refused_here');
    await tapTable(el, { table_id: null });
    await answer(el, 'discard');
    await settle(el);

    stillOnScreen(el);
    expect(el.error).toBe('ui.discardCheckFailed');
  });

  it('touching the table again and getting through clears the old notice', async () => {
    const el = await barCheck();
    refused.set('sales.order.void', 'sales.refused_here');
    await tapTable(el, { table_id: 'm9', label: 'Mesa 9', order_id: 'ord-9' });
    await answer(el, 'discard');
    refused.clear();
    await tapTable(el, { table_id: 'm9', label: 'Mesa 9', order_id: 'ord-9' });
    await answer(el, 'discard');
    await settle(el);

    expect(el.orderId).toBe('ord-9');
    expect(el.error, 'the delete went through: the old refusal is gone').toBe('');
  });

  it('when it goes through, the table\'s check opens as before', async () => {
    const el = await barCheck();
    await tapTable(el, { table_id: 'm9', label: 'Mesa 9', order_id: 'ord-9' });
    await answer(el, 'discard');
    await settle(el);

    expect(el.orderId).toBe('ord-9');
    expect(el.tableId).toBe('m9');
    expect(el.error).toBe('');
  });
});

describe('5 · the words', () => {
  const en = (enLocale as { ui: Record<string, string> }).ui;
  const es = (esLocale as { ui: Record<string, string> }).ui;

  for (const key of ['discardCheckFailed', 'parkCheckFailed', 'leaveOnTableFailed']) {
    it(`${key} exists in en and es, and says the check is STILL on screen`, () => {
      expect(en[key], 'en').toBeTruthy();
      expect(es[key], 'es').toBeTruthy();
      expect(es[key], 'es is a translation, not a copy').not.toBe(en[key]);
      expect(en[key], 'en: nothing happened, the check is still here').toMatch(/still/i);
      expect(es[key], 'es: nothing happened, the check is still here').toMatch(/sigue/i);
    });
  }

  it('each one names what was refused', () => {
    expect(en.discardCheckFailed).toMatch(/delete/i);
    expect(es.discardCheckFailed).toMatch(/eliminar/i);
    expect(en.parkCheckFailed).toMatch(/park/i);
    expect(es.parkCheckFailed).toMatch(/aparcar/i);
    expect(en.leaveOnTableFailed).toMatch(/table/i);
    expect(es.leaveOnTableFailed).toMatch(/mesa/i);
  });
});
