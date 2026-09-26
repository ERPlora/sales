// discount-cap — which door the till charges through when the discount is bigger than the one
// whoever is charging may give alone (sales#269).
//
// A cashier could take 100 % off any ticket and charge it: no cap, nobody to ask, and nothing on
// the sale saying who allowed it. The only lever the owner had was `allow_discounts`, an on/off
// switch for everybody at once — either all discount freely or none discounts at all. What the
// trade does instead (Toast, Square, Lightspeed) is a threshold: up to X % whoever charges, above
// it the manager approves.
//
// 🔴 The RULE is the SERVER's, and it is enforced in the handler over its own `reads`. What lives
// here is the ROUTING: the same arithmetic, so the screen sends the charge through the door it is
// going to be let through. The two commands are the same checkout — `sales.complete_sale` applies
// the cap, `sales.complete_sale_over_limit` does not, and it carries the `sales.discount.over_limit`
// permission that only a `manager` holds. A cashier calling it is refused as `requires_elevation`,
// and the SHELL (hub#363) paints the PIN dialog on top: the module paints nothing.
//
// Routing on the screen instead of letting the server refuse is not politeness, it is the whole
// point: the cashier learns the manager is needed while the customer is still deciding, not after
// pressing Charge with the card already in the reader.

import type { PosSettings } from './pos-settings.js';

/** The usual checkout. Applies the business cap; anything above it is refused. */
export const CHECKOUT_COMMAND = 'sales.complete_sale';

/** The manager's door: the same checkout with the cap lifted. Getting through it already required
 *  `sales.discount.over_limit` — held, or lent for one call through the PIN. */
export const CHECKOUT_OVER_LIMIT_COMMAND = 'sales.complete_sale_over_limit';

/** No cap: the day-one behaviour, and what absence means on purpose. A hub updating from a version
 *  with no column must not start asking for PINs underneath the shop. */
export const NO_DISCOUNT_CAP = 100;

/** The discounts a ticket is carrying when Charge is pressed, in the shapes the till already has
 *  them: the ticket's own percentage and fixed amount (sales#113), the gross they apply over, and
 *  every line's percentage. */
export interface TicketDiscounts {
  /** Ticket-wide discount, as a percentage. */
  ticketPercent: number;
  /** Ticket-wide discount as a fixed amount, in cents (sales#113). */
  ticketAmountCents: number;
  /** What the ticket is worth before the ticket-wide discount, in cents — the basis the fixed
   *  amount is judged as a share of. */
  grossCents: number;
  /** Each line's own discount, as a percentage. Capping only the ticket would leave «90 % on every
   *  line» one tap away, so they are judged with the same number. */
  linePercents: number[];
}

/** The cap this shop configured, as the till should read it: a percentage between 0 and 100, with
 *  absence — no row, a row older than the column, a value the column cannot hold — meaning NO cap.
 *  A stored value out of range is clamped rather than trusted: the settings screen is not the only
 *  way a row gets written. Mirrors `discount_cap` in `handler/src/lib.rs`. */
export function discountCap(settings?: PosSettings | Record<string, unknown> | null): number {
  const raw = (settings as Record<string, unknown> | null | undefined)?.['max_discount_percent'];
  if (raw === undefined || raw === null) return NO_DISCOUNT_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n)) return NO_DISCOUNT_CAP;
  return Math.min(NO_DISCOUNT_CAP, Math.max(0, n));
}

/** The most a fixed amount may take off this gross under the cap, in cents.
 *
 *  🔴 Basis points and a floor, because that is exactly what the server does (`value_checkout`
 *  phase 2). Rounding the other way here would route a ticket through the usual door that the
 *  handler then refuses — the cashier would see a rejection instead of the PIN dialog. */
function allowedAmountCents(cap: number, grossCents: number): number {
  return Math.floor((grossCents * Math.round(cap * 100)) / 10_000);
}

/** Does this ticket need somebody with `sales.discount.over_limit` to sign it off?
 *
 *  All three levers are judged against the same cap: the ticket percentage, each line's, and the
 *  fixed amount as the share of the gross it really is. */
export function needsManagerApproval(cap: number, discounts: TicketDiscounts): boolean {
  if (cap >= NO_DISCOUNT_CAP) return false;
  if (discounts.ticketPercent > cap) return true;
  if (discounts.linePercents.some((percent) => percent > cap)) return true;
  return discounts.ticketAmountCents > 0
    && discounts.ticketAmountCents > allowedAmountCents(cap, discounts.grossCents);
}

/** The ticket discount a manager already approved on the open check (sales#386): the check stores
 *  it with `discount_approved_by`, and the till carries it forward so Charge does not ask for the
 *  PIN a second time for the same discount. */
export interface ApprovedTicketDiscount {
  /** The ticket percentage the manager signed off, as it stood when they approved it. */
  percent: number;
  /** The ticket fixed amount, in cents, the manager signed off. */
  amountCents: number;
}

/** The command the till charges with: the manager's door when the discount is over the cap, the
 *  usual one otherwise.
 *
 *  sales#386 — `approved` is the ticket discount a manager already signed off on the open check.
 *  When what is on the ticket now is still within it, the ticket levers are already covered and
 *  judged as zero; the line discounts are not — nobody approved those — so they are still judged
 *  as they came in. Mirrors `ticket_discount_approved_on_check` in `handler/src/lib.rs`, which is
 *  the authority: the server honours the approval it stored, never the payload, and this is only
 *  the routing that keeps the screen from asking for a PIN the server would not have asked for. */
export function checkoutCommand(
  cap: number,
  discounts: TicketDiscounts,
  approved?: ApprovedTicketDiscount | null,
): string {
  const ticketCovered = !!approved
    && discounts.ticketPercent <= approved.percent
    && discounts.ticketAmountCents <= approved.amountCents;
  const judged = ticketCovered ? { ...discounts, ticketPercent: 0, ticketAmountCents: 0 } : discounts;
  return needsManagerApproval(cap, judged) ? CHECKOUT_OVER_LIMIT_COMMAND : CHECKOUT_COMMAND;
}
