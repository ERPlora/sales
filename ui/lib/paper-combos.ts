// The MENU / PACK **as the customer reads it** (sales#154 / ADR-0381).
//
// ## Why it lives apart
//
// Same reason as `paper-modifiers.ts`: the menu comes out through four doors — the ticket on screen
// (`<ok-receipt>`), the HTML the browser prints (`receipt-html.ts`), the ESC/POS document of the
// thermal printer (`print-document.ts`) and the bill's `jobId` fingerprint — and the four have to say
// THE SAME thing. If each composed its own text they would drift, and the customer would read on the
// paper something other than what the waiter saw on screen.
//
// ## What the paper shows, and why (10 references + 3 forum threads, table in the issue/PR)
//
// - **One header line with the closed price.** There is NO parent row with money in the sale
//   (ADR-0381: that is Odoo's documented failure — the combo at 0 € in the daily report, odoo#187509).
//   The header is painted from the snapshot every sibling row froze, and its amount is the SUM of the
//   siblings. LS Central prints «deal item lines … under the Deal line»; WooCommerce groups «under a
//   parent line item named after the product bundle»; Lightspeed K-Series lists the items under the
//   combo; Maitre'D hangs each component «under the main combo item».
// - **Components indented underneath, WITHOUT an amount.** A component at 0,00 reads as a gift; a
//   prorated share reads as a price the customer never agreed to — and that is literally the Odoo
//   forum thread («the total price of the combo, not the sum of the child products») and the Square
//   complaint («the receipt shows the cost breakdown rather than a single combo price»). They bought
//   a menu at 13,50: that is the number on the paper.
// - **The only money on a component is its supplement** («Solomillo (+3,00)»): Maitre'D prints the
//   substitution «as a modifier with a price under the main combo item». It is the one number that
//   explains why the menu is 16,50 and not 13,50.
// - **The kitchen rule (ADR-0394) applies HALF.** Hierarchy by indentation, yes — same as the chit.
//   But the chit de-emphasises the header (the components are the work); on the customer's ticket
//   the header IS the item and carries the money the customer reconciles against the TOTAL, so it is
//   a normal line, and the components are the ones that step back (no amount, smaller). Opposite
//   emphasis, same indentation, for the same reason: emphasis goes to what the reader acts on.
// - **Fiscally nothing moves.** A `goods` pack split across two rates is still N rows and the tax
//   footer keeps both bases (ADR-0381 rule 2). The presentation groups; it never rewrites the
//   breakdown.

/** A component **as the customer reads it** — the minimum the paper needs, not the catalogue row. */
export interface PrintedComboComponent {
  /** Catalogue identity: only printed when the name could not be resolved. */
  option_id?: string;
  /** What the customer reads. */
  name?: string;
  /** Cents this choice adds to the closed price (may be negative). Printed, because it is the one
   *  amount the customer needs to reconcile the menu's price. Absent or 0 = nothing to show. */
  price_delta?: number;
}

/** The menu as the paper needs it: its commercial name and the chosen components, in order. */
export interface PrintedCombo {
  name: string;
  components: PrintedComboComponent[];
}

/** Same separator as the supplements sub-line: in 32 thermal columns a comma reads as a decimal. */
const SEP = ' · ';

/** Cents → «+3,00» / «-0,50»: the supplement beside the component name. No currency: the column
 *  already says which one, and the thermal renderer prints the string verbatim. */
function deltaLabel(cents: number): string {
  const sign = cents < 0 ? '-' : '+';
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`;
}

/** What is read for ONE component: the commercial name (falling back to the id — an ugly line beats
 *  an invisible component) plus its supplement when it has one. */
export function componentLabel(c: PrintedComboComponent): string {
  const name = (c.name || '').trim() || (c.option_id || '').trim();
  const delta = Number(c.price_delta);
  return Number.isFinite(delta) && delta !== 0 ? `${name} (${deltaLabel(delta)})` : name;
}

/** The components in ONE sub-line, in the order they were chosen. `undefined` when there is nothing
 *  to say, so a line that is not a menu never grows a field and the paper of always stays
 *  byte-identical. The ESC/POS renderer prints one indented `notes` sub-line per item — this is it. */
export function comboNote(combo: PrintedCombo | undefined): string | undefined {
  const parts = (combo?.components ?? []).map(componentLabel).filter(Boolean);
  return parts.length ? parts.join(SEP) : undefined;
}

/** The menu's identity for the bill fingerprint (`prebillJobId`): swapping a component must produce
 *  a NEW job, or the corrected bill is swallowed by the queue's dedup and no paper comes out. Empty
 *  for a line that is not a menu, so an unchanged bill keeps its key. */
export function comboIdentity(combo: PrintedCombo | undefined): string {
  if (!combo) return '';
  const parts = combo.components.map((c) => `${c.option_id || c.name || ''}:${c.price_delta ?? 0}`);
  return `{${combo.name}|${parts.join('|')}}`;
}

/** `sales_sale_item.combo` (the snapshot `expand_combo` froze on every sibling) → what the paper
 *  prints. DEFENSIVE, one direction only: a row written before the column existed (`'{}'`), or a
 *  JSON cut short, loses the menu header — never the ticket. Same criterion as
 *  `parseModifierSnapshot`. */
export function parseComboSnapshot(raw: unknown): PrintedCombo | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const v = parsed as Record<string, unknown>;
  const name = v.name == null ? '' : String(v.name).trim();
  if (!name) return undefined;
  const rawComponents = Array.isArray(v.components) ? v.components : [];
  const components = rawComponents
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c): PrintedComboComponent => {
      const option_id = c.option_id == null ? undefined : String(c.option_id);
      const cname = c.name == null || String(c.name) === '' ? undefined : String(c.name);
      const delta = Number(c.price_delta);
      return {
        ...(option_id ? { option_id } : {}),
        ...(cname ? { name: cname } : {}),
        ...(Number.isFinite(delta) ? { price_delta: delta } : {}),
      };
    })
    .filter((c) => c.name || c.option_id);
  return { name, components };
}

/** A row that MAY belong to a menu: the two columns `queries/lines.sql` returns for it. */
export interface ComboGroupable {
  combo_group_ref?: string | null;
  combo?: string;
}

/** One paper line's worth of rows: the row that leads it, every sibling (itself included, in row
 *  order), and the menu they belong to — `undefined` for a plain line. */
export interface ComboGroup<T> {
  head: T;
  siblings: T[];
  combo?: PrintedCombo;
}

/** Sibling rows → ONE group per menu, at the position of the FIRST sibling.
 *
 * Grouping is by `combo_group_ref`, NOT by adjacency: splitting, transferring and reopening a check
 * can reorder rows, and a menu whose siblings drifted apart must still print as one menu. Two
 * different menus on the same ticket have two refs and stay two groups. A row without a ref — every
 * row written before ADR-0381, and every line that is not a menu — is a group of one with no
 * `combo`, so the ticket of always comes out exactly as it did. */
export function groupComboLines<T extends ComboGroupable>(lines: T[]): ComboGroup<T>[] {
  const out: ComboGroup<T>[] = [];
  const byRef = new Map<string, ComboGroup<T>>();
  for (const line of lines) {
    const ref = line.combo_group_ref ? String(line.combo_group_ref) : '';
    if (!ref) {
      out.push({ head: line, siblings: [line] });
      continue;
    }
    const existing = byRef.get(ref);
    if (existing) {
      existing.siblings.push(line);
      continue;
    }
    const group: ComboGroup<T> = { head: line, siblings: [line], combo: parseComboSnapshot(line.combo) };
    byRef.set(ref, group);
    out.push(group);
  }
  return out;
}
