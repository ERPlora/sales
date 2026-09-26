// sales#71 — manual discounts at the till, per LINE and per TICKET, in percent.
//
// Market (9 refs in the issue: Square, Toast, Lightspeed, Odoo, Business Central, Shopify,
// WooCommerce POS, Clover, Zettle): every one offers both levels; the backend of this module
// already accepted `items[].discount` and `discount_percent` (0–100) and prorated the ticket
// discount over the lines before extracting the VAT — what was missing was a single button.
// Percent only for now (Odoo's model): the server owns the money and the amount form needs its
// own allocation on the server first.
//
// The client total is a PREVIEW; the server is the authority (ADR-0085). Still, the preview must
// round exactly like the server so «Cobrar 9,50 €» is the same figure the ticket prints: one
// HALF_UP per line over price × qty × (1 − line%) × (1 − ticket%).
import { describe, expect, it } from 'vitest';
import { lineAmount, cartTotal, addOrderLine, updateOrderLineDiscount, loadOrderLines, openOrderWithLines } from './pos-cart';
import type { CartLine, ErploraClientLike } from './pos-cart';
import { splitTotal } from './split-selection';
import { makeErploraDouble } from '../test/erplora-double';

const line = (over: Partial<CartLine> = {}): CartLine => ({ id: 'p1', name: 'Café', price: 180, qty: 1, ...over });

describe('lineAmount / cartTotal — the preview rounds like the server', () => {
  it('a 10 % line discount on 1,80 € × 1 is 1,62 €', () => {
    expect(lineAmount(line({ discount: 10 }))).toBe(162);
  });
  it('a gifted line is 0 whatever its discount', () => {
    expect(lineAmount(line({ discount: 10, is_gift: true }))).toBe(0);
  });
  it('the ticket discount composes with the line discount, one rounding per line', () => {
    // 1,80 × 0,90 × 0,95 = 1,539 → 1,54 (HALF_UP), not 1,62 × 0,95 = 1,539 rounded twice
    expect(lineAmount(line({ discount: 10 }), 5)).toBe(154);
    expect(cartTotal([line({ discount: 10 }), line({ id: 'p2', price: 250, qty: 2 })], 5)).toBe(154 + 475);
  });
  it('splitTotal honours the discounts too — the CTA charges what the server will charge', () => {
    const cart = [line({ discount: 50, line_id: 'l1' }), line({ id: 'p2', price: 250, line_id: 'l2' })];
    expect(splitTotal(cart, new Set(), 0)).toBe(90 + 250);
    expect(splitTotal(cart, new Set(['l1']), 10)).toBe(81);
  });
});

/** The shared double handed over as the client argument (sales#234). It records every command
 *  itself, so `calls` IS its list — and a read this file never declared fails the test instead of
 *  answering an empty page. */
function orderClient(orderLines: Record<string, unknown>[] = []) {
  const double = makeErploraDouble({
    queries: { 'sales.order.lines': orderLines },
    command: () => ({ ok: true, new_ids: ['x'] }),
  });
  return { client: double.sdk as unknown as ErploraClientLike, calls: double.commands };
}

describe('the line discount is persisted with the order line and comes back on resume', () => {
  it('travels in sales.order.open and sales.order.add_line, with the discounted line_total', async () => {
    const { client, calls } = orderClient();
    await openOrderWithLines(client, [line({ discount: 10 })]);
    expect((calls[0].payload.items as Record<string, unknown>[])[0]).toMatchObject({ discount: 10 });
    await addOrderLine(client, 'ord-1', line({ discount: 10 }));
    expect(calls[1].payload).toMatchObject({ discount_percent: 10, line_total: 162 });
  });
  // sales#385: the line discount has its own two doors (capped / manager) and the SERVER prices the
  // line from its row, so neither `update_line` nor a browser-computed `line_total` is involved.
  it('updateOrderLineDiscount writes the percent through the line discount doors', async () => {
    const { client, calls } = orderClient();
    await updateOrderLineDiscount(client, 'ord-1', line({ line_id: 'l1', qty: 2 }), 25, false);
    expect(calls[0].name).toBe('sales.order.set_line_discount');
    expect(calls[0].payload).toEqual({ order_id: 'ord-1', line_id: 'l1', discount_percent: 25 });
    await updateOrderLineDiscount(client, 'ord-1', line({ line_id: 'l1', qty: 2 }), 90, true);
    expect(calls[1].name).toBe('sales.order.set_line_discount_over_limit');
  });
  it('loadOrderLines restores it (0 → undefined: no badge on an undiscounted line)', async () => {
    const { client } = orderClient([
      { id: 'l1', product_id: 'p1', product_name: 'Café', quantity: 1_000_000, unit_price: 180, discount_percent: 10 },
      { id: 'l2', product_id: 'p2', product_name: 'Agua', quantity: 1_000_000, unit_price: 100, discount_percent: 0 },
    ]);
    const lines = await loadOrderLines(client, 'ord-1');
    expect(lines[0].discount).toBe(10);
    expect(lines[1].discount).toBeUndefined();
  });
});
