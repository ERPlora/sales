// refund-lines — which lines of a sale go back with a refund (services#158).
//
// A ticket with a haircut and a voucher; the customer returns only the voucher. The money split
// above (`refund-allocation`) says how much goes back to each tender; this says WHICH lines go
// with it, so `sale.refunded.lines` names them and the module that sold one reacts to that line
// (Services voids the voucher sold on it). As in Square, Shopify or Lightspeed: the operator marks
// the items, and the amount proposal follows the marked items.

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

/** The ids `sales.refund` receives: each marked line, followed by the supplements under it. */
export function pickedLineIds(lines: readonly ReturnLine[], picked: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const l of returnableLines(lines)) {
    if (!picked.has(l.id)) continue;
    out.push(l.id);
    for (const child of lines) if (child.id && child.parent_line_ref === l.id) out.push(child.id);
  }
  return out;
}

/** What the marked lines cost, supplements included: the amount the refund proposes. */
export function pickedAmount(lines: readonly ReturnLine[], picked: ReadonlySet<string>): number {
  const ids = new Set(pickedLineIds(lines, picked));
  return lines.reduce((sum, l) => (ids.has(l.id) ? sum + Math.max(0, Math.round(Number(l.line_total ?? 0)) || 0) : sum), 0);
}
