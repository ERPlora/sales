// sales#89 — a service line must survive the round trip through the order.
//
// A salon sells services, not stock. `complete_sale` already knows how to charge one: a line
// flagged `is_service` skips the inventory catalogue check and the stock decrement, and the flag
// travels in `sale.completed` so `inventory` can skip it too (its handler drops a line when
// `is_service || product_id IS NULL`).
//
// But the cart is not held in memory: ADR-0141 materialises every line as a real `sales_order_item`
// row the moment it is added, and rebuilds the cart from that table when the check is resumed. So
// the flag only reaches the sale if the ORDER carries it. If `add_line` drops it, a service charged
// from a resumed check is recorded as a plain product — and the day a service line also carries a
// `product_id`, that same drop would send `inventory` hunting for stock of a haircut.
//
// This is the seam these tests hold: what goes into the order line comes back out of it.
import { describe, it, expect } from 'vitest';
import { addOrderLine, loadOrderLines, type CartLine, type ErploraClientLike } from './pos-cart';
import { makeErploraDouble } from '../test/erplora-double';

/** The shared double as the client argument (sales#234): it records the commands, and serves
 *  `sales.order.lines` from `stored`. */
function client(stored: Record<string, unknown>[] = []) {
  const double = makeErploraDouble({
    queries: { 'sales.order.lines': stored },
    command: () => ({ rows: [{ id: 'line-1' }] }),
  });
  return { client: double.sdk as unknown as ErploraClientLike, calls: double.commands };
}

const serviceLine = (over: Partial<CartLine> = {}): CartLine => ({
  id: '', name: 'Balayage', price: 6500, qty: 1, is_service: true,
  tax_category_key: 'service.generic', ...over,
});

describe('a service line persisted into the order', () => {
  it('sends is_service to the order line, so the row remembers what it is', async () => {
    const { client: c, calls } = client();
    await addOrderLine(c, 'order-1', serviceLine());
    const add = calls.find((x) => x.name === 'sales.order.add_line');
    expect(add?.payload?.is_service).toBe(true);
  });

  it('sends is_service false for a plain product, never undefined', async () => {
    const { client: c, calls } = client();
    await addOrderLine(c, 'order-1', { id: 'p-cafe', name: 'Café', price: 150, qty: 1 });
    const add = calls.find((x) => x.name === 'sales.order.add_line');
    expect(add?.payload?.is_service).toBe(false);
  });
});

describe('a service line rebuilt from the order', () => {
  it('comes back flagged, so a RESUMED check still charges it as a service', async () => {
    const { client: c } = client([
      { id: 'l-1', product_id: null, product_name: 'Balayage', unit_price: 6500,
        quantity: 1_000_000, is_service: 1, tax_category_key: 'service.generic' },
    ]);
    const [line] = await loadOrderLines(c, 'order-1');
    expect(line.is_service).toBe(true);
    // The rest of the line must survive untouched: the flag is additive, not a rewrite.
    expect(line).toMatchObject({ name: 'Balayage', price: 6500, qty: 1,
      tax_category_key: 'service.generic' });
  });

  it('leaves a product line unflagged rather than guessing', async () => {
    const { client: c } = client([
      { id: 'l-2', product_id: 'p-cafe', product_name: 'Café', unit_price: 150,
        quantity: 1_000_000, is_service: 0 },
    ]);
    const [line] = await loadOrderLines(c, 'order-1');
    expect(line.is_service).toBeFalsy();
  });

  // An order written before this change has no column value to read. It must not come back as a
  // service — that would make `inventory` skip stock for products it has always decremented.
  it('treats a legacy row with no is_service as a product', async () => {
    const { client: c } = client([
      { id: 'l-3', product_id: 'p-cafe', product_name: 'Café', unit_price: 150, quantity: 1_000_000 },
    ]);
    const [line] = await loadOrderLines(c, 'order-1');
    expect(line.is_service).toBeFalsy();
  });
});
