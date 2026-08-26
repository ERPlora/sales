// sales#156 — the LINE NOTE, end to end in the browser.
//
// The KDS has painted `kitchen_order_item.notes` since day one and there was nowhere to fill it
// from: the cart line had no field and no screen asked for one. These tests pin the three hops the
// browser owns — the note travels in the payloads of the two doors that materialise a line, it
// comes BACK when the check is resumed, and two lines that differ only by their note are two
// lines, not one with quantity two.

import { describe, expect, it, vi } from 'vitest';
import {
  addOrderLine,
  loadOrderLines,
  mergeCartLines,
  openOrderWithLines,
  updateOrderLineNote,
  type CartLine,
  type ErploraClientLike,
} from './pos-cart';
import { buildFirePayload, kitchenNote } from './fire-order';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: 'p1', name: 'Burger', price: 900, qty: 1, ...over,
});

/** A client that records what was sent and answers the ids the runtime would coin. */
function spyClient(rows: Record<string, unknown>[] = []) {
  const commands: { name: string; payload: Record<string, unknown> }[] = [];
  const client = {
    query: vi.fn(async () => rows),
    queryOptional: vi.fn(async () => undefined),
    queryAll: vi.fn(async () => []),
    queryAllOptional: vi.fn(async () => undefined),
    command: vi.fn(async (name: string, payload: Record<string, unknown> = {}) => {
      commands.push({ name, payload });
      return { new_ids: ['id-1'] };
    }),
    currency: 'EUR',
    formatMoney: (c: number) => String(c),
    formatAmount: (u: number) => String(u),
  } as unknown as ErploraClientLike;
  return { client, commands };
}

describe('the note travels to the server with its line', () => {
  it('opening the check sends the note of every line', async () => {
    // The FIRST line of every check comes through this door. Until pm#93 it was the one that
    // dropped the supplements, and the note would have gone the same way.
    const { client, commands } = spyClient();
    await openOrderWithLines(client, [line({ note: 'medium rare' })]);
    expect(commands[0].name).toBe('sales.order.open');
    expect((commands[0].payload.items as Record<string, unknown>[])[0].notes).toBe('medium rare');
  });

  it('and a line without a note sends the empty string, not undefined', async () => {
    // The column is NOT NULL DEFAULT '': sending `undefined` would make the payload shape depend
    // on whether the waiter typed anything, and every consumer would need a guard for it.
    const { client, commands } = spyClient();
    await openOrderWithLines(client, [line()]);
    expect((commands[0].payload.items as Record<string, unknown>[])[0].notes).toBe('');
  });

  it('adding a line to an open check sends it the same way', async () => {
    const { client, commands } = spyClient();
    await addOrderLine(client, 'ord-1', line({ note: 'no onion' }));
    expect(commands[0].name).toBe('sales.order.add_line');
    expect(commands[0].payload.notes).toBe('no onion');
  });

  it('changing the note writes ONLY the note, with the quantity the line already had', async () => {
    // It goes through the same `update_line` the stepper uses, so the quantity has to travel with
    // it or the row would be rewritten to a quantity nobody asked for.
    const { client, commands } = spyClient();
    await updateOrderLineNote(client, 'ord-1', line({ line_id: 'l-1', qty: 2 }), 'well done');
    expect(commands[0].name).toBe('sales.order.update_line');
    expect(commands[0].payload).toMatchObject({
      order_id: 'ord-1', line_id: 'l-1', quantity: 2_000_000, notes: 'well done',
    });
  });

  it('without a `line_id` no write is invented', async () => {
    // A line that is not backed by a row yet cannot be addressed. Writing anyway would hit
    // whatever row the server guessed — or none, silently.
    const { client, commands } = spyClient();
    await updateOrderLineNote(client, 'ord-1', line(), 'well done');
    expect(commands).toHaveLength(0);
  });
});

describe('the note comes back when the check is RESUMED', () => {
  it('the order row gives its note back', async () => {
    const { client } = spyClient([
      { id: 'l-1', product_id: 'p1', product_name: 'Steak', unit_price: 2500,
        quantity: 1_000_000, notes: 'medium rare' },
    ]);
    const [l] = await loadOrderLines(client, 'ord-1');
    expect(l.note).toBe('medium rare');
  });

  it('a row older than the column comes back WITHOUT a note, not with an empty one', async () => {
    // `undefined` and not '' on purpose: the line then looks exactly like every line of every
    // check that was already open, and nothing paints an empty sub-line under it.
    const { client } = spyClient([
      { id: 'l-1', product_id: 'p1', product_name: 'Coffee', unit_price: 150, quantity: 1_000_000 },
    ]);
    const [l] = await loadOrderLines(client, 'ord-1');
    expect(l.note).toBeUndefined();
  });
});

describe('two lines that differ only by their note are TWO lines', () => {
  it('they do not merge', () => {
    // Same reason the supplements entered the identity in pm#93: merging them would send
    // «2 x Burger» to the kitchen with one of them wrong, and no way of telling which.
    const out = mergeCartLines(
      [line({ note: 'medium rare' })],
      [line({ note: 'well done' })],
    );
    expect(out).toHaveLength(2);
  });

  it('and two with the SAME note do', () => {
    const out = mergeCartLines([line({ note: 'medium rare' })], [line({ note: 'medium rare' })]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(2);
  });

  it('a line with no note and one with an empty string are the same line', () => {
    // Otherwise the till would split a line in two over a field the waiter never touched.
    const out = mergeCartLines([line()], [line({ note: '' })]);
    expect(out).toHaveLength(1);
  });
});

describe('kitchenNote — what the pass reads on ONE sub-line', () => {
  it('the note on its own', () => {
    expect(kitchenNote('medium rare', false, '')).toBe('medium rare');
  });

  it('the comp reason on its own, as before this issue', () => {
    expect(kitchenNote('', true, 'On the house')).toBe('On the house');
  });

  it('and both together when there are both', () => {
    // `kitchen::modifiers_for_display` prints ONE indented sub-line per item, so a second field
    // would be dropped in silence. They are joined with the same « · » the paper already uses.
    expect(kitchenNote('medium rare', true, 'On the house')).toBe('medium rare · On the house');
  });

  it('the reason does NOT travel when the line is not comped', () => {
    expect(kitchenNote('medium rare', false, 'On the house')).toBe('medium rare');
  });

  it('nothing to say is an empty string', () => {
    expect(kitchenNote('  ', false, '')).toBe('');
  });
});

describe('buildFirePayload sends the note to the kitchen', () => {
  it('the line note travels in the compat payload', () => {
    // The server builds the ticket from the READ (kitchen#54), so this payload is the compat path
    // for a runtime that cannot pre-load it. It has to say the same thing, or the same check would
    // print differently depending on which way it was fired.
    const p = buildFirePayload('ord-1', 'Table 4', [line({ note: 'medium rare' })]);
    expect(p?.items[0].notes).toBe('medium rare');
  });

  it('and it shares its sub-line with the comp reason', () => {
    const p = buildFirePayload('ord-1', 'Table 4', [
      line({ note: 'medium rare', is_gift: true, gift_reason: 'On the house' }),
    ]);
    expect(p?.items[0].notes).toBe('medium rare · On the house');
  });
});
