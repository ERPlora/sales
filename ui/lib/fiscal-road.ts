// hub#1935 — can this business get its tickets to the tax authority at all?
//
// The hub answers it: the CORE query `hub.fiscal.transmission` carries `filing_blocked` (the stable
// code of what is missing, `''` when nothing is) and `filing_fix_route` (where the owner fixes it,
// taken from the fiscal provider's own setup route). Its dispatcher refuses the sale with the SAME
// code, so this screen never re-derives the rule and never names the fiscal module.

/** The causes the hub publishes today → key of this module's catalogue. */
const CAUSES: Record<string, string> = {
  'fiscal.no_representation_grant': 'ui.fiscalRoadNoGrant',
  'fiscal.gateway_not_enrolled': 'ui.fiscalRoadNoConnection',
  // hub#1940 — the business files with its own certificate and it expired: the AEAT refuses it.
  'fiscal.own_certificate_expired': 'ui.fiscalRoadOwnCertificateExpired',
};

/** How many days ahead the till starts warning that the own certificate runs out (hub#1940). */
export const CERTIFICATE_WARNING_DAYS = 30;
const DAY_MS = 86_400_000;

/** What the till knows about the road: the blocking code (`''` = none), where it is fixed, and
 *  when the own certificate that signs expires (`''` when none signs — ERPlora's road). */
export interface FiscalRoad {
  blocked: string;
  fixRoute: string;
  expiresAt: string;
}

/** The sentence for a blocking code. A cause this version does not know still blocks, generically. */
export function fiscalRoadKey(code: string): string {
  return CAUSES[code] ?? 'ui.fiscalRoadBlocked';
}

/** Is this refusal of `sales.complete_sale` the hub saying there is no road? */
export function isFiscalRoadRefusal(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CAUSES, code);
}

/** Reads the core's answer. Anything unreadable is «no block»: a till does not stop selling
 *  because a read failed — the dispatcher is still the authority and refuses on its own. */
export function readFiscalRoad(answer: unknown): FiscalRoad {
  const row = Array.isArray(answer) ? (answer[0] as Record<string, unknown> | undefined) : undefined;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    blocked: text(row?.filing_blocked),
    fixRoute: text(row?.filing_fix_route),
    expiresAt: text(row?.own_certificate_expires_at),
  };
}

/** hub#1940 — whole days left before the own certificate expires, when that is within
 *  [`CERTIFICATE_WARNING_DAYS`]; `0` when less than a day is left. `null` when there is nothing to warn about:
 *  no date, an unreadable one, already expired, or a road already blocked (the block speaks). */
export function certificateExpiryDays(road: FiscalRoad, now: Date = new Date()): number | null {
  if (road.blocked || !road.expiresAt) return null;
  const expires = Date.parse(road.expiresAt);
  if (Number.isNaN(expires)) return null;
  const left = expires - now.getTime();
  if (left < 0) return null;
  return left <= CERTIFICATE_WARNING_DAYS * DAY_MS ? Math.floor(left / DAY_MS) : null;
}
