/**
 * The counter half of the simplified-invoice ceiling (hub#297).
 *
 * # What is being blocked, and what is NOT
 *
 * **The DOCUMENT TYPE, never the sale.** The market decision behind hub#297 (12 product
 * references + the fiscalised analogues of IT/HU/PT/PL + TicketBAI; the full sweep of Spanish POS
 * ended 5 blocking – 1 warning – 3 silent, and *nobody* chose a dismissible warning) is that above
 * the ceiling the till stops saying "you cannot charge" and starts saying "this cannot go out as a
 * ticket". The customer still pays; what changes is the paper.
 *
 * The reason a dismissible warning loses is timing: by the moment an operator would dismiss it the
 * number is spent, the record is chained and the receipt is printed — and the recovery is a
 * back-office job a cashier cannot do. Worse, for THIS case the recovery does not exist at all: a
 * rejected F2 cannot be turned into a complete invoice by *subsanación*, because a subsanación may
 * not change the `TipoFactura`. Above the ceiling there is no ticket to fix afterwards, so the only
 * place to act is before the number is assigned.
 *
 * # The core answers, the till decides
 *
 * The ceiling arrives as **data** from the core's `hub.fiscal.limits`, which reads it off the row
 * of the regime the hub files under. This module never hardcodes 3.000: a country with no row has
 * no ceiling, and `maxCents === null` is how that arrives here.
 *
 * That direction is the whole modularity argument. Had the core vetoed `sale.completed` on fiscal
 * grounds instead, `sales` would have gained a dependency on `verifactu` its manifest does not
 * declare, and the core would be overruling a business module. The wire is still protected
 * independently by §15.8 in the hub's validator — two layers, and neither can mask the other.
 *
 * # Deliberately NOT here
 *
 * **Splitting the sale to duck under the ceiling.** Two consecutive sales of 1.800 € to the same
 * table sum to 3.600 € and nothing here notices. That is a real anti-requirement (OCA admits the
 * same gap in writing) and it needs a per-customer time window plus a product decision about what
 * to do when it fires; it is not a line in this file.
 */

/** How the sale is being closed. Travels atomically with it (ADR-0140). */
export type DocFormat = 'ticket' | 'invoice';

/** The recipient snapshot the POS carries (ADR-0132), as far as this rule cares. */
export interface Recipient {
  customerName: string;
  customerTaxId: string;
  customerAddress: string;
}

/** Everything the decision needs, and nothing else — so it can be tested without a DOM. */
export interface SimplifiedLimitState extends Recipient {
  /** What is actually being charged now: the split selection, or the whole bill (ADR-0146). */
  payableCents: number;
  /** The ceiling from `hub.fiscal.limits`, in cents. `null` = this country caps nothing. */
  maxCents: number | null;
  documentFormat: DocFormat;
}

/**
 * Is this amount at or above the ceiling?
 *
 * **`>=`, one cent stricter than §15.8** ("no superior a 3.000,00"), on purpose. What the till adds
 * up is the grand total; what the AEAT adds up is Σ(BaseImponible + CuotaRepercutida) line by line,
 * and the two can differ by a cent through rounding. Landing exactly on the boundary would bet the
 * validity of the invoice on which side that cent falls.
 *
 * And the ceiling is the ceiling: the +10,00 € the AEAT admits on top of it is its own rounding
 * slack, not the merchant's margin. No product on the market implements that tolerance, and
 * spending it would build the shop on ten euros the agency is keeping for its decimals.
 */
export function isOverSimplifiedLimit(payableCents: number, maxCents: number | null): boolean {
  if (maxCents === null || maxCents <= 0) return false;
  return payableCents >= maxCents;
}

/**
 * Is there enough of a recipient to emit a complete invoice?
 *
 * Three fields, and each one is load-bearing:
 *
 * - **`customerTaxId`** — the one that makes it an invoice at all. There is no such thing as an F2
 *   with a NIF (Validaciones §13: with `F2` the `Destinatarios` group *must not* be filled in), so
 *   the conversion is mechanically F2 → F1, and F1 has no ceiling.
 * - **`customerAddress`** — art. 7.2.a. It is also exactly what the *simplificada cualificada*
 *   route (`FacturaSimplificadaArt7273`) asks for, the cheap path this design leaves open.
 * - **`customerName`** — `NombreRazon`. Without it the F1 is rejected, so accepting the capture
 *   without a name would only move the rejection one step further down, which is the very outcome
 *   this whole feature exists to prevent.
 */
export function recipientIsComplete(recipient: Recipient): boolean {
  return (
    recipient.customerName.trim() !== '' &&
    recipient.customerTaxId.trim() !== '' &&
    recipient.customerAddress.trim() !== ''
  );
}

/**
 * May this sale NOT be closed as it stands?
 *
 * Two rules, and the second one does not depend on the amount:
 *
 * 1. **Above the ceiling** a ticket is not an option — the only acceptable outcome is a real F1,
 *    and `resolve_invoice_type` in the hub only ever **downgrades**: a sale marked `ticket` is an F2
 *    no matter how complete the customer's file is.
 * 2. **An invoice needs a recipient, at any amount** (sales#317). An `invoice` with no NIF is
 *    downgraded straight back to F2 by that same function, with the chain number already spent —
 *    while the screen hands over a «FACTURA» made out to nobody. Paper and tax record disagree.
 *    Holded, Odoo POS and Square ES all ask for the customer as soon as an invoice is requested.
 *
 * So: an `invoice` is blocked until the recipient is complete, and a `ticket` only above the
 * ceiling. Either half alone looks like it should work and does not, which is why both are tested.
 */
export function ticketIsBlocked(state: SimplifiedLimitState): boolean {
  if (state.documentFormat === 'invoice') return !recipientIsComplete(state);
  return isOverSimplifiedLimit(state.payableCents, state.maxCents);
}
