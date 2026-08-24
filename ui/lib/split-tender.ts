// split-tender — one sale, N ways of paying (sales#159 / ADR-0386).
//
// The arithmetic of the mixed-payment screen, kept out of the Web Component so it can be proved
// without a DOM: how much is still owed, what a new leg covers, where the change comes from, and
// the `payments[]` the till hands to `sales.complete_sale`.
//
// Three rules come straight from the ADR and none of them is negotiable here:
//
//   1. THE LEGS ADD UP TO THE TOTAL, TO THE CENT. The server refuses a mismatch
//      (`sales.payments_do_not_match_total`) instead of absorbing it, because a sale whose legs do
//      not add up is a drawer that ends the day with a number nobody can explain.
//   2. THE CHANGE COMES OUT OF THE CASH LEG and is never prorated. Odoo prorates it (PR#194284)
//      and its receipt and its database end up disagreeing. With no cash leg there is no change:
//      overpaying by card does not exist, the exact amount is charged.
//   3. A LEG WITH NOTHING TYPED COVERS THE WHOLE REMAINING. This is the one that keeps three ways
//      of paying usable at a rush hour: Shopify makes every leg be typed by hand and the flow jams
//      («I could not exit the screen other than to mark the order as part paid»).
import { needsTendered, type PayMethodLike } from './pay-icons.js';

/** One leg of the payment, as the screen holds it before the sale is closed. */
export interface Tender {
  /** Local id, only so the list can be keyed, edited and removed. Never travels. */
  id: string;
  method: PayMethodLike;
  /** What this leg covers of the total, in cents. */
  amount: number;
  /** What was physically handed over, in cents. Only a CASH leg may exceed its `amount`. */
  tendered: number;
}

/** One leg as `schemas/complete_sale.json` wants it. `amount_tendered` only when it adds something. */
export interface PaymentLegPayload {
  payment_method_id: string | null;
  amount: number;
  amount_tendered?: number;
}

/** What the legs cover between them, in cents. */
export function tendersTotal(tenders: readonly Tender[]): number {
  return tenders.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
}

/** What is still owed, in cents. Never negative: `planTender` caps every leg at the remaining. */
export function remainingCents(payable: number, tenders: readonly Tender[]): number {
  return Math.max(0, Math.round(payable) - tendersTotal(tenders));
}

/**
 * The change, in cents: the excess handed over in CASH. Never prorated across the other legs, and
 * zero when no leg is cash — see rule 2 above.
 */
export function changeDue(tenders: readonly Tender[]): number {
  return tenders.reduce(
    (sum, t) => sum + (needsTendered(t.method) ? Math.max(0, t.tendered - t.amount) : 0),
    0,
  );
}

/**
 * What a NEW leg would cover, given the method, what the cashier typed (cents; 0 = nothing typed)
 * and what is still owed.
 *
 * - Nothing typed → the leg covers the whole remaining. One tap closes the sale.
 * - Typed below the remaining → the leg covers exactly that and the rest stays owed.
 * - Typed above the remaining, CASH → the leg covers the remaining and the excess is change.
 * - Typed above the remaining, anything else → capped at the remaining, no change.
 *
 * `undefined` when there is nothing to add (nothing owed, or no method chosen): the caller must not
 * push an empty leg, and the server would refuse it anyway (`sales.amount_negative`).
 */
export function planTender(
  method: PayMethodLike | undefined,
  typedCents: number,
  remaining: number,
): { amount: number; tendered: number } | undefined {
  if (!method || remaining <= 0) return undefined;
  const typed = Math.max(0, Math.round(typedCents) || 0);
  const amount = typed > 0 ? Math.min(typed, remaining) : remaining;
  const tendered = needsTendered(method) && typed > amount ? typed : amount;
  return { amount, tendered };
}

/** The legs as the command takes them, IN ORDER. Legs covering nothing are dropped, not sent. */
export function buildPaymentsPayload(tenders: readonly Tender[]): PaymentLegPayload[] {
  return tenders
    .filter((t) => t.amount > 0)
    .map((t) => ({
      payment_method_id: t.method?.id ?? null,
      amount: t.amount,
      // Absent means «the exact amount» to the server, so it is only worth sending when the cashier
      // was handed more than the leg covers — which is the change.
      ...(t.tendered > t.amount ? { amount_tendered: t.tendered } : {}),
    }));
}

/**
 * WHY the charge cannot go through yet, or `undefined` when it can.
 *
 * With no legs at all this is the single-tender flow and nothing is blocked — the screen only
 * enters split mode once the cashier adds the first leg.
 */
export function chargeBlock(
  payable: number,
  tenders: readonly Tender[],
): { reason: 'remaining'; remaining: number } | undefined {
  if (!tenders.length) return undefined;
  const remaining = remainingCents(payable, tenders);
  return remaining > 0 ? { reason: 'remaining', remaining } : undefined;
}
