// sales#273 — the professional who did the work must survive the round trip through the ORDER.
//
// In a salon Ana cuts and Marta colours, the client pays ONCE, and the cash-up has to say who
// earned what. Migration 034 gave `sales_sale_item` its own `staff_id` and `sales.by_staff` reads
// it, so the SALE can already tell the two apart. What decides whether it ever gets there is this
// seam: ADR-0141 does not keep the cart in memory — every tap writes a real `sales_order_item` row
// and the cart is REBUILT from that table (on reload, on resuming a parked check, and after every
// fire to the kitchen, which re-reads the lines to lock the fired round).
//
// So a `staff_id` that only lives on the browser's cart line is lost by the first reload, and the
// sale falls back to the ticket's single professional with nothing said. That is the same hole
// `is_service` had (sales#89) and it is held here for the same reason: what goes INTO the order
// line has to come back OUT of it.
import { describe, it, expect } from 'vitest';
import { addOrderLine, openOrderWithLines, loadOrderLines, type CartLine, type ErploraClientLike } from './pos-cart';
import { makeErploraDouble } from '../test/erplora-double';

/** The shared double as the client argument (sales#234): it records the commands, and serves
 *  `sales.order.lines` from `stored`. */
function client(stored: Record<string, unknown>[] = []) {
  const double = makeErploraDouble({
    queries: { 'sales.order.lines': stored },
    command: () => ({ rows: [{ id: 'line-1' }], new_ids: ['ord-1', 'line-1'] }),
  });
  return { client: double.sdk as unknown as ErploraClientLike, calls: double.commands };
}

const cut = (over: Partial<CartLine> = {}): CartLine => ({
  id: 's-corte', name: 'Corte', price: 1800, qty: 1, is_service: true,
  tax_category_key: 'service.generic', ...over,
});

describe('the line the till adds to an OPEN order', () => {
  it('carries the professional it was sealed with', async () => {
    const { client: c, calls } = client();
    await addOrderLine(c, 'order-1', cut({ staff_id: 'u-ana' }));
    const add = calls.find((x) => x.name === 'sales.order.add_line');
    expect(add?.payload?.staff_id).toBe('u-ana');
  });

  // Nobody chosen is NOT "nobody served it": the server attributes the sale to the session user,
  // and `by_staff` falls back to the ticket's professional for a line with no id of its own. The
  // browser must not invent one.
  it('sends null — never an id of its own invention — when no one was chosen', async () => {
    const { client: c, calls } = client();
    await addOrderLine(c, 'order-1', cut());
    const add = calls.find((x) => x.name === 'sales.order.add_line');
    expect(add?.payload?.staff_id).toBeNull();
  });
});

// The FIRST line of every check does not come through `add_line`: it opens the order. That is the
// door pm#93 and sales#169 both had to be fixed at separately, for exactly this reason.
describe('the FIRST line, the one that opens the order', () => {
  it('carries the professional too', async () => {
    const { client: c, calls } = client();
    await openOrderWithLines(c, [cut({ staff_id: 'u-ana' })]);
    const open = calls.find((x) => x.name === 'sales.order.open');
    const [item] = open?.payload?.items as Record<string, unknown>[];
    expect(item.staff_id).toBe('u-ana');
  });

  it('leaves it null when no one was chosen', async () => {
    const { client: c, calls } = client();
    await openOrderWithLines(c, [cut()]);
    const open = calls.find((x) => x.name === 'sales.order.open');
    const [item] = open?.payload?.items as Record<string, unknown>[];
    expect(item.staff_id).toBeNull();
  });
});

describe('the cart REBUILT from the order', () => {
  it('brings each line back with its own professional, so a resumed check still attributes it', async () => {
    const { client: c } = client([
      { id: 'l-1', product_id: 's-corte', product_name: 'Corte', unit_price: 1800,
        quantity: 1_000_000, is_service: 1, staff_id: 'u-ana' },
      { id: 'l-2', product_id: 's-color', product_name: 'Color', unit_price: 4500,
        quantity: 1_000_000, is_service: 1, staff_id: 'u-marta' },
    ]);
    const lines = await loadOrderLines(c, 'order-1');
    expect(lines.map((l) => l.staff_id)).toEqual(['u-ana', 'u-marta']);
    // Additive: the rest of the line is untouched.
    expect(lines[0]).toMatchObject({ name: 'Corte', price: 1800, qty: 1, is_service: true });
  });

  // A row written before migration 035 has no value to read. It must come back WITHOUT an id, not
  // with an empty string: `by_staff` distinguishes NULL (fall back to the ticket) from an id, and
  // '' would be a third thing that matches no professional at all.
  it('leaves a legacy row with no staff_id unattributed, rather than inventing one', async () => {
    const { client: c } = client([
      { id: 'l-3', product_id: 'p-cafe', product_name: 'Café', unit_price: 150, quantity: 1_000_000 },
    ]);
    const [line] = await loadOrderLines(c, 'order-1');
    expect(line.staff_id).toBeUndefined();
  });
});
