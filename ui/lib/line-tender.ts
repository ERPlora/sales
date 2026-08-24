// line-tender — hosting an EXTERNAL per-line tender in the checkout (sales#162 / ADR-0386).
//
// `sales` hosts the `sales.pos.tender` slot and nothing else: it never learns what a voucher is,
// never reads `services`, and a hub without that module gets a checkout that is byte-for-byte the
// one it had. What lives here is the arithmetic the HOST owes: which lines may be offered to such
// a tender, and what is still charged in money once one of them said «this line is already paid».
//
// 🔴 ONE HOLD SPENDS ONE SESSION. The provider enforces one redemption per `(checkout_ref,
// line_ref)` with a unique index, and its hold command takes no quantity. So a line of «Corte × 3»
// covered by a single redemption would hand out three haircuts for one session. Such a line is
// still LISTED — the screen owes the cashier the reason — but it is not coverable.

import type { CartLine } from './pos-cart';

/** A stable per-line reference, or '' when the line is not backed by an order row yet. */
export function lineRef(l: CartLine): string {
  return l.line_id ?? '';
}

/**
 * The lines an external per-line tender may be offered on.
 *
 * A SERVICE line worth money and backed by an order row. A product is not a candidate — the slot
 * contract hands the filler a `service-id`, which only a service line has. A comp is not either:
 * an invitation costs nothing, so there is nothing left to cover.
 */
export function tenderableLines(lines: readonly CartLine[]): CartLine[] {
  return lines.filter(
    (l) => !!l.is_service && !!l.line_id && !l.is_gift && Math.round(l.price * l.qty) > 0,
  );
}

/** Whether that line can actually be covered, or is only listed to explain why it cannot. */
export function coverableLine(l: CartLine): boolean {
  return l.qty === 1;
}

/** What is still charged in money: everything an external tender did not take over. */
export function uncoveredLines(
  lines: readonly CartLine[],
  covered: ReadonlySet<string>,
): CartLine[] {
  if (!covered.size) return [...lines];
  return lines.filter((l) => !l.line_id || !covered.has(l.line_id));
}
