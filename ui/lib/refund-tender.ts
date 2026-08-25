// refund-tender — hosting an EXTERNAL per-line tender in the REFUND screen (sales#166 / ADR-0386).
//
// The mirror of `line-tender`. The till hosts `sales.pos.tender` to ask «does another tender pay
// this line?»; the refund screen hosts `sales.refund.tender` to ask «does what paid it get it
// back?». `sales` never learns what a voucher is on either side: it paints the line, cedes the
// hole, and does arithmetic on money it can see.
//
// 🔴 IT CANNOT ANSWER THIS ALONE, AND THAT IS THE POINT. `sales_sale_item.is_covered` (migration
// 025) is opaque BY DESIGN: it says another tender already paid this line, never which one. Only
// the module that owns the tender can say whether what it took can go back, so what lives here is
// exactly the part that belongs to the host — which lines to offer, and how to tell twins apart.

/** The shape of a `sales.lines` row this screen needs. The query returns many more columns. */
export interface SaleLine {
  /** `sales_sale_item.id` — the stable per-line reference handed to the filler. */
  id: string;
  /** The catalogue id of what was sold. For a service line, the service the filler is asked about. */
  product_id?: string;
  product_name?: string;
  /** Migration 025. SQLite answers 0/1; a Postgres boolean column would answer true/false. */
  is_covered?: number | boolean | null;
}

/**
 * The lines the refund slot is offered on: the ones an external tender paid for.
 *
 * A line paid in money is not one of them — its refund is the split above, in euros. A covered
 * line with no `product_id` is not either: the slot contract hands the filler a service id, and a
 * hole that cannot say what it is about is a hole nobody can fill.
 *
 * Read order is preserved because `serviceOrdinals` is built on it.
 */
export function coveredLines(lines: readonly SaleLine[]): SaleLine[] {
  return lines.filter((l) => !!l.id && !!l.product_id && isCovered(l));
}

function isCovered(l: SaleLine): boolean {
  return l.is_covered === true || Number(l.is_covered ?? 0) > 0;
}

/**
 * For each covered line, its 0-based position among the covered lines of the SAME service.
 *
 * A mother and her daughter get the same haircut on one ticket: two covered lines, same service,
 * two sessions. The filler can only find its sessions by (sale, service) — a settled redemption
 * keeps the ORDER line id in `line_ref` and a sale item has no column pointing back at it — so
 * without an ordinal both holes would claim the first session and the second would find nothing
 * to give back. With it, the pairing is deterministic on both sides: nth line ↔ nth session.
 */
export function serviceOrdinals(covered: readonly SaleLine[]): Map<string, number> {
  const seen = new Map<string, number>();
  const out = new Map<string, number>();
  for (const l of covered) {
    const service = l.product_id ?? '';
    const n = seen.get(service) ?? 0;
    out.set(l.id, n);
    seen.set(service, n + 1);
  }
  return out;
}
