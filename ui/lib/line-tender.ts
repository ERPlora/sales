// line-tender — hosting an EXTERNAL per-line tender in the checkout (sales#162 / ADR-0386).
//
// `sales` hosts the `sales.pos.tender` slot and nothing else: it never learns what a voucher is,
// never reads `services`, and a hub without that module gets a checkout that is byte-for-byte the
// one it had. What lives here is the arithmetic the HOST owes: which lines may be offered to such
// a tender, and what is still charged in money once one of them said «this line is already paid».
//
// 🔴 ONE HOLD SPENDS ONE SESSION. The provider enforces one redemption per `(checkout_ref,
// line_ref)` with a unique index, and its hold command takes no quantity. So a line of «Corte × 3»
// covered by a single redemption would hand out three haircuts for one session.
//
// ADR-0422 — WHAT THE SCREEN DOES ABOUT IT. The unit a session buys is the LINE, so the line is
// what gets split: «Corte × 2» becomes two lines of one, each with its own slot, and the voucher
// covers the ones it reaches while the rest is charged in money (partial coverage, no blocking
// dialog). That is the market's answer with 12 verified references — nowhere is a quantity > 1 of a
// service a redeemable unit — and it is the only shape that expresses the real case: one session
// for the mother, full price for the daughter. What used to be here instead was a dead end: the
// line was listed with the reason written on it and the cashier had to split it by hand, except the
// till had no «split».

import type { CartLine } from './pos-cart';

/**
 * How many lines of quantity one a single split may create.
 *
 * The host mints a finite batch of ids per command (`NEW_IDS_BATCH`, ARQUITECTURA.md §5.3), so an
 * unbounded split would run out of them and write a check missing rows. Fifty units of ONE service
 * on one counter check is not a redemption case either — it is a typo on the quantity — and burying
 * the ticket under fifty rows to find out is worse than refusing.
 */
export const MAX_LINE_SPLIT = 50;

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

/** Whether that line can actually host a redemption: one line of one, one session (ADR-0422). */
export function coverableLine(l: CartLine): boolean {
  return l.qty === 1;
}

/**
 * How many lines of quantity one this line would become if the cashier split it to redeem — `0`
 * when there is nothing to split or the split cannot be done (ADR-0422).
 *
 * It is `0` and not a refusal on purpose: this is what the screen asks before offering the action,
 * so «cannot be split» has to be a plain answer it can render, not an exception.
 *
 * - a line of one is already coverable, so it has nothing to split;
 * - a fraction (0,5 kg of a service priced by weight) has no «lines of one» to become;
 * - a line already FIRED to production is locked by `order_update_line.sql` (`fired_at IS NULL`):
 *   the source row would keep its quantity while the clones went in, and the check would grow by
 *   the whole line in money nobody added;
 * - a comp costs nothing, so no session is going to cover it (`tenderableLines` drops it anyway;
 *   this is the second door, and the arithmetic must not depend on the order of the two).
 */
export function splitCount(l: CartLine): number {
  if (l.is_gift || l.fired_at) return 0;
  if (!Number.isInteger(l.qty)) return 0;
  if (l.qty < 2 || l.qty > MAX_LINE_SPLIT) return 0;
  return l.qty;
}

/**
 * Where a line sits among the identical rows of the same check — `{ part: 1, of: 2 }` — or
 * `undefined` when it has no twin.
 *
 * This is the LABEL of the split, and it is not decoration. Shopify splits the cart line for its
 * own «buy X get Y» and does not mark it; its own developer forum answers the resulting bug reports
 * with «this is a known behavior… it can definitely be confusing». Two identical rows where the
 * cashier rang the service up twice read as a double charge until something numbers them.
 *
 * Derived, not stored: two rows of the same service at the same price ARE the two units of that
 * service on this check, whether they got there by splitting, by merging two tables or by hand. The
 * number says something true in all three cases, so there is nothing to persist and nothing to keep
 * in step when a line is removed.
 */
export function linePart(
  lines: readonly CartLine[], l: CartLine,
): { part: number; of: number } | undefined {
  const twins = lines.filter((o) => o.id === l.id && o.price === l.price && !o.is_gift === !l.is_gift);
  if (twins.length < 2) return undefined;
  const part = twins.findIndex((o) => o.line_id === l.line_id && o === l);
  if (part < 0) return undefined;
  return { part: part + 1, of: twins.length };
}

/** What is still charged in money: everything an external tender did not take over. */
export function uncoveredLines(
  lines: readonly CartLine[],
  covered: ReadonlySet<string>,
): CartLine[] {
  if (!covered.size) return [...lines];
  return lines.filter((l) => !l.line_id || !covered.has(l.line_id));
}
