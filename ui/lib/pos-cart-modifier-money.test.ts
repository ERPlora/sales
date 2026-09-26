// sales#208 — the CART LINE is worth its supplements, and so is the open check's provisional total.
//
// The half sales#209 left out. That one made the CHARGE authoritative: «Cobrar», the mixed payment
// and the bill's total now come from `sales.checkout.preview`, so the drawer and the button agree.
// What still lied is everything the screen composes LINE BY LINE, and the row it writes:
//
//   * the amount painted beside a line (`lineAmount`) was the BASE price — a burger with «+ cheese
//     3,00 €» read 9,00 € while the total under it read 12,00 €;
//   * the `line_total` the till writes on the order row carried the same base, and
//     `order_recompute_total.sql` sums exactly those, so the list of OPEN CHECKS showed less than
//     the table was going to pay.
//
// Where the money comes from is the whole point, and it is NEVER the browser's arithmetic over a
// catalogue it read at some point:
//
//   * on a fresh pick, the delta the picker was showing (`modifiers.for_target`);
//   * on a RESUMED check, the delta the SERVER froze on the row when the waiter ordered
//     (sales#200), so the screen shows the price that will actually be charged even if the menu
//     moved since.
//
// And it stays DISPLAY money: the payloads still travel with `option_id` alone (sales#68), so a
// tampered `price_delta` buys nothing — the amount the customer is charged is still resolved by
// the server against the catalogue, or against the frozen row.
import { describe, it, expect } from 'vitest';
import {
  addOrderLine, lineAmount, cartTotal, loadOrderLines, mergeCartLines, updateOrderLineQty,
  type CartLine, type ErploraClientLike,
} from './pos-cart';
import { makeErploraDouble } from '../test/erplora-double';

const CHEESE = { option_id: 'o-cheese', price_delta: 300 };

const burger = (over: Partial<CartLine> = {}): CartLine => ({
  id: 'p-burger', name: 'Hamburguesa', price: 900, qty: 1, ...over,
});

/** The shared double as the client argument (sales#234): it records the commands itself, so `calls`
 *  IS its list. */
function recordingClient(orderRows: Record<string, unknown>[] = []) {
  const double = makeErploraDouble({
    queries: { 'sales.order.lines': orderRows },
    command: () => ({ new_ids: ['line-1'] }),
  });
  return { client: double.sdk as unknown as ErploraClientLike, calls: double.commands };
}

describe('the amount PAINTED beside a line carries its supplements', () => {
  it('a 9,00 € burger with «+ cheese 3,00 €» is worth 12,00 €', () => {
    expect(lineAmount(burger({ modifiers: [CHEESE] }))).toBe(1200);
  });

  it('the delta is PER UNIT: two burgers with cheese are 24,00 €', () => {
    expect(lineAmount(burger({ qty: 2, modifiers: [CHEESE] }))).toBe(2400);
  });

  it('every supplement of the line counts, in one single rounding with the discounts', () => {
    const line = burger({ modifiers: [CHEESE, { option_id: 'o-bacon', price_delta: 150 }], discount: 10 });
    // (900 + 300 + 150) × 0,9 = 1215
    expect(lineAmount(line)).toBe(1215);
    // and the ticket discount goes on top of that, still a single HALF_UP: 1350 × 0,9 × 0,9 = 1093,5 → 1094
    expect(lineAmount(line, 10)).toBe(1094);
  });

  it('a GIFT line is still worth nothing, supplement or not', () => {
    expect(lineAmount(burger({ is_gift: true, modifiers: [CHEESE] }))).toBe(0);
  });

  it('a supplement with no delta (an old row, «no onion») changes nothing', () => {
    expect(lineAmount(burger({ modifiers: [{ option_id: 'o-no-onion' }] }))).toBe(900);
    expect(cartTotal([burger(), burger({ modifiers: [CHEESE] })])).toBe(900 + 1200);
  });
});

describe('the row the till writes carries the same amount (the open check adds THOSE up)', () => {
  it('`add_line` sends a `line_total` with the supplement in it', async () => {
    const { client, calls } = recordingClient();
    await addOrderLine(client, 'ord-1', burger({ modifiers: [CHEESE] }));
    const params = calls.find((c) => c.name === 'sales.order.add_line')!.payload;
    expect(params.line_total, 'the provisional total of the row = 9,00 + 3,00').toBe(1200);
    expect(params.unit_price, 'the BASE price stays in its column: the checkout adds the delta on top').toBe(900);
  });

  it('and still sends ONLY the id: a `price_delta` from the browser is a discount it gives itself', async () => {
    const { client, calls } = recordingClient();
    await addOrderLine(client, 'ord-1', burger({ modifiers: [CHEESE] }));
    const params = calls.find((c) => c.name === 'sales.order.add_line')!.payload;
    expect(JSON.parse(String(params.modifiers))).toEqual([{ option_id: 'o-cheese' }]);
  });

  it('changing the QUANTITY sends the quantity only: the server prices base + supplement (sales#394)', async () => {
    // sales#208 made the stepper send a `line_total` with the supplement in it; since sales#394 the
    // server prices the line from the row it froze (handler `update_order_line`), so no amount
    // travels at all and the supplement cannot be lost on the way.
    const { client, calls } = recordingClient();
    await updateOrderLineQty(client, 'ord-1', 'line-1', 2, 900, false, '', 0, [CHEESE]);
    const params = calls.find((c) => c.name === 'sales.order.update_line')!.payload;
    expect(params.quantity).toBe(2_000_000);
    expect(params).not.toHaveProperty('line_total');
  });
});

describe('a RESUMED check shows the delta the SERVER froze, not today’s menu', () => {
  const frozenRow = {
    id: 'line-1', product_id: 'p-burger', product_name: 'Hamburguesa', unit_price: 900,
    quantity: 1_000_000, line_total: 1200, is_gift: 0,
    modifiers: JSON.stringify([
      { option_id: 'o-cheese', group_id: 'g-extras', name: 'Extra de queso',
        kitchen_name: '+QUESO', price_delta: 300, tax_category_key: null },
    ]),
    combo: '{}',
  };

  it('the frozen `price_delta` comes back on the cart line', async () => {
    const { client } = recordingClient([frozenRow]);
    const lines = await loadOrderLines(client, 'ord-1');
    expect(lines[0].modifiers).toEqual([{ option_id: 'o-cheese', price_delta: 300 }]);
    expect(lineAmount(lines[0]), 'the table pays what it ordered at').toBe(1200);
  });

  it('a row written BEFORE the delta was frozen comes back without it, and is priced as it was', async () => {
    const { client } = recordingClient([
      { ...frozenRow, line_total: 900, modifiers: JSON.stringify([{ option_id: 'o-cheese' }]) },
    ]);
    const lines = await loadOrderLines(client, 'ord-1');
    expect(lines[0].modifiers).toEqual([{ option_id: 'o-cheese' }]);
    expect(lineAmount(lines[0]), 'no invented delta: the server re-prices those against the catalogue').toBe(900);
  });
});

describe('the delta is part of the line’s IDENTITY, like the base price it rides on', () => {
  it('MERGING two tables keeps apart the same supplement frozen at two prices', () => {
    // The same rule `sameCartLine` already applies to `price` (sales#175): two units that cost
    // different money are two units of charge. Merged into one they would be charged at whichever
    // of the two deltas survived, and nothing would say which table lost.
    const merged = mergeCartLines(
      [burger({ modifiers: [{ option_id: 'o-cheese', price_delta: 300 }] })],
      [burger({ modifiers: [{ option_id: 'o-cheese', price_delta: 500 }] })],
    );
    expect(merged).toHaveLength(2);
  });

  it('but the same supplement at the same price still merges into one line', () => {
    const merged = mergeCartLines([burger({ modifiers: [CHEESE] })], [burger({ modifiers: [CHEESE] })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(2);
  });
});
