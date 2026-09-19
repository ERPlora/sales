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
};

/** What the till knows about the road: the blocking code (`''` = none) and where it is fixed. */
export interface FiscalRoad {
  blocked: string;
  fixRoute: string;
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
  return { blocked: text(row?.filing_blocked), fixRoute: text(row?.filing_fix_route) };
}
