// refund-lines — which lines of a sale go back with a refund (services#158).
//
// A ticket with a haircut and a voucher; the customer returns only the voucher. The money split
// above (`refund-allocation`) says how much goes back to each tender; this says WHICH lines go
// with it, so `sale.refunded.lines` names them and the module that sold one reacts to that line
// (Services voids the voucher sold on it). As in Square, Shopify or Lightspeed: the operator marks
// the items, and the amount proposal follows the marked items.
//
// sales#571: a line with several units no longer goes back whole. What is picked is a map
// line → units (fixed point 10^6, ADR-0147, like the line's own `quantity`), capped at what earlier
// refunds left of it, and its price is prorated without drift: the units already returned and the
// ones going back now are both rounded from the line's TOTAL, so the refunds of a line add up to it.

/** The shape of a `sales.lines` row this needs. The query returns many more columns. */
export interface ReturnLine {
  id: string;
  product_id?: string;
  product_name?: string;
  /** What the line cost, tax included, in minor units. */
  line_total?: number | string;
  /** Migration 025: another tender paid it. SQLite answers 0/1, Postgres may answer a boolean. */
  is_covered?: number | boolean | null;
  /** sales#147: the line this one hangs from (a supplement with its own tax). */
  parent_line_ref?: string | null;
  /** sales#571: how much was sold, fixed point 10^6 (1 unit = 1000000). Missing = one unit. */
  quantity?: number | string;
}

/** One unit in the fixed point of `quantity` (ADR-0147). */
export const UNIT = 1_000_000;

/** A `sales.refund_lines` row: one line (or some of its units) an earlier refund took back. */
export interface ReturnedRow {
  sale_item_id?: string;
  quantity?: number | string;
}

/** line id → units (10^6). What earlier refunds took back, or what the operator picks now. */
export type LineUnits = ReadonlyMap<string, number>;

function cents(v: unknown): number {
  return Math.max(0, Math.round(Number(v ?? 0)) || 0);
}

function lineQuantity(l: ReturnLine): number {
  return l.quantity === undefined || l.quantity === null ? UNIT : cents(l.quantity);
}

function isCovered(l: ReturnLine): boolean {
  return l.is_covered === true || Number(l.is_covered ?? 0) > 0;
}

/**
 * The lines the operator can mark: paid in money and not hanging from another line. A covered
 * line goes back through its own tender's hole (`sales.refund.tender`), and a supplement goes
 * with the line it belongs to.
 */
export function returnableLines(lines: readonly ReturnLine[]): ReturnLine[] {
  return lines.filter((l) => !!l.id && !isCovered(l) && !l.parent_line_ref);
}

/**
 * The units each line already gave back, added up over every earlier refund. A row without
 * `quantity` comes from a hub before sales#571, when a returned line always went back whole.
 */
export function returnedUnits(rows: readonly ReturnedRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.sale_item_id ?? '');
    if (!id) continue;
    const q = r.quantity === undefined || r.quantity === null ? Number.POSITIVE_INFINITY : cents(r.quantity);
    out.set(id, (out.get(id) ?? 0) + q);
  }
  return out;
}

/** What is still left of the line to give back, in units (10^6). */
export function unitsLeft(l: ReturnLine, returned: LineUnits): number {
  return Math.max(0, lineQuantity(l) - (returned.get(l.id) ?? 0));
}

/** The whole units left of the line (what the operator can step through); 0 for a weighed rest. */
export function wholeUnitsLeft(l: ReturnLine, returned: LineUnits): number {
  const left = unitsLeft(l, returned);
  return left % UNIT === 0 ? left / UNIT : 0;
}

/** The part of `total` that `q` units cost after `prev` already went back, rounded without drift. */
function share(total: number, qty: number, prev: number, q: number): number {
  if (qty <= 0) return q > 0 ? total : 0;
  const upTo = (n: number): number => Math.round((total * Math.min(n, qty)) / qty);
  return upTo(prev + q) - upTo(prev);
}

/**
 * What `sales.refund` receives: each marked line with the units picked (never more than what is
 * left), followed by the supplements under it in the same proportion of their own quantity.
 */
export function pickedLines(
  lines: readonly ReturnLine[], picked: LineUnits, returned: LineUnits,
): Array<{ line_id: string; quantity: number }> {
  const out: Array<{ line_id: string; quantity: number }> = [];
  for (const l of returnableLines(lines)) {
    const q = Math.min(cents(picked.get(l.id)), unitsLeft(l, returned));
    if (q <= 0) continue;
    out.push({ line_id: l.id, quantity: q });
    const qty = lineQuantity(l);
    const prev = returned.get(l.id) ?? 0;
    for (const child of lines) {
      if (!child.id || child.parent_line_ref !== l.id) continue;
      const units = Math.min(share(lineQuantity(child), qty, prev, q), unitsLeft(child, returned));
      if (units > 0) out.push({ line_id: child.id, quantity: units });
    }
  }
  return out;
}

/** What the picked units cost, supplements included: the amount the refund proposes. */
export function pickedAmount(lines: readonly ReturnLine[], picked: LineUnits, returned: LineUnits): number {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return pickedLines(lines, picked, returned).reduce((sum, p) => {
    const l = byId.get(p.line_id);
    if (!l) return sum;
    return sum + share(cents(l.line_total), lineQuantity(l), returned.get(l.id) ?? 0, p.quantity);
  }, 0);
}
