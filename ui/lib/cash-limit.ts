// sales#498 — the till's reflection of the legal cash limit (Ley 7/2012 art. 7 in Spain).
//
// The SERVER is the authority: `complete_sale` refuses `sales.cash_limit_exceeded`. The figure is
// not written here either: it is the `cash_limit` that `sales.checkout.preview` answers with, the
// same function that charges. This file only decides, from that figure, whether the charge on
// screen would carry cash over it, so the cashier is told before the tap.

interface MethodLike { type?: string | null }

const isCash = (method: MethodLike | undefined): boolean =>
  (method?.type ?? '').trim().toLowerCase() === 'cash';

/** Is cash out of the question for a sale of `payable` cents? The law says «1.000 € or more»,
 *  so the limit itself is already forbidden. `null`/`undefined` = no limit known: never blocks. */
export function cashOverLimit(limit: number | null | undefined, payable: number): boolean {
  return typeof limit === 'number' && payable >= limit;
}

/** Would THIS charge carry cash over the limit? A mixed payment counts its cash legs against the
 *  WHOLE sale; while splitting, the method selected for the next leg is not a leg yet. */
export function cashBlocksCharge(state: {
  limit: number | null | undefined;
  payable: number;
  method: MethodLike | undefined;
  tenders: readonly { method: MethodLike }[];
  splitting: boolean;
}): boolean {
  if (!cashOverLimit(state.limit, state.payable)) return false;
  if (state.tenders.some((leg) => isCash(leg.method))) return true;
  return !state.splitting && !state.tenders.length && isCash(state.method);
}

/** Is this method the cash one that the limit makes unavailable? */
export function cashMethodUnavailable(limit: number | null | undefined, payable: number, method: MethodLike): boolean {
  return isCash(method) && cashOverLimit(limit, payable);
}
