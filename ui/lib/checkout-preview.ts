// checkout-preview — the till asks the SERVER what the ticket adds up to (sales#164 / sales#172).
//
// Until this existed, the screen answered that question with its OWN arithmetic (`cartTotal`) and
// the server refused legs of a mixed payment that did not add up TO THE CENT
// (`sales.payments_do_not_match_total`). Two ways it diverged, both real:
//
//   * ROUNDING — a prorated fixed discount (ADR-0210), a quantity by weight (ADR-0147) or a goods
//     combo split across rates (art. 79.Dos LIVA) round on the SERVER, a cent away from here.
//   * THE WHOLE VAT — with `default_tax_included = 0` the screen's total is the taxable BASE and
//     the server charges base + quota. «Cobrar 100,00 €» charged 121,00 €.
//
// The fix is emphatically NOT a second implementation of the fiscal arithmetic in the browser:
// that is the very bug the "adds up to the cent" check exists to catch. It is one read-only door,
// `sales.checkout.preview`, onto the SAME valuation the checkout charges with.
//
// 🔴 And the items it sends are built HERE, by the same function the charge uses: a preview that
// valued a slightly different ticket would be worse than no preview at all.
import { toMicro } from './quantity.js';
import { unitContextPayload, type CartLine, type ErploraClientLike } from './pos-cart.js';

/** One line of the answer: what the sale WOULD write for it. Every amount in cents (ADR-0007). */
export interface CheckoutPreviewLine {
  product_id: string | null;
  product_name: string;
  /** Fiscal category the SERVER resolved for this line (ADR-0085). */
  tax_category_key: string;
  /** Combined rate (%) the server resolved — root plus components. */
  tax_rate: number;
  /** Fixed point, scale 10⁶ (ADR-0147). */
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_amount: number;
  line_total: number;
  /** What siblings of one set menu share (ADR-0381). `null` = a plain line. */
  combo_group_ref: string | null;
  is_gift: boolean;
  covered: boolean;
}

/** The authoritative valuation of a ticket. Cents everywhere. */
export interface CheckoutPreview {
  total: number;
  subtotal: number;
  tax_total: number;
  discount_amount: number;
  gift_total: number;
  /** The base the HUB decided, not the one the browser hinted. */
  tax_included: boolean;
  lines: CheckoutPreviewLine[];
  /** By rate key: `{ "21.00": { base, tax, kind, label? } }`. */
  tax_breakdown: Record<string, { base: number; tax: number; kind?: string; label?: string }>;
  /** sales#498 — the legal cash limit the charge enforces, in cents. `null`/absent = none known:
   *  the hub's country sets none, or the hub predates the field (the server still refuses). */
  cash_limit?: number | null;
}

/** What the preview (and the charge) needs to know about the ticket on screen. */
export interface CheckoutShape {
  /** The lines being charged — INCLUDING the ones an external tender covered (they travel at 0). */
  lines: readonly CartLine[];
  /** Ticket discount, %. */
  ticketDiscount: number;
  /** Ticket discount, fixed amount in cents. */
  ticketDiscountAmount: number;
  /** Ids of the lines an external tender already paid (sales#162). */
  covered: ReadonlySet<string>;
  /** The hub's fiscal base, as the till knows it. The server reads its own setting anyway. */
  taxIncluded: boolean;
  /** `true` when only SOME lines of an open check are being charged (ADR-0146). */
  partial?: boolean;
}

/** Resolves the product's primary category, for kitchen routing. Opaque to `sales`. */
export type PrimaryCategory = (productId: string) => string | undefined;

/**
 * The `items[]` of a checkout — THE one builder, shared by the preview and the charge.
 *
 * Everything that decides money is a REFERENCE, never a figure of ours: the modifier travels as
 * `option_id` (a `price_delta` from the browser would be a discount the customer gives themselves),
 * the set menu as `combo_id` + the chosen `option_id`s, and an open check's line as its
 * `order_item_id` so the server honours the price the row froze (sales#175).
 */
export function checkoutItems(
  lines: readonly CartLine[],
  opts: { covered: ReadonlySet<string>; primaryCategory?: PrimaryCategory },
): Record<string, unknown>[] {
  return lines.map((l) => ({
    product_id: l.id,
    product_name: l.name,
    product_sku: l.sku || '',
    price: l.price,
    quantity: toMicro(l.qty),
    tax_category_key: l.tax_category_key ?? null,
    // sales#519 — every till line takes its `tax_rate` from its category (`resolveLineTax`), so
    // without a category that rate is the preview's fallback 0, not a rate anybody declared. It is
    // left out, and the server refuses the line (`sales.tax_category_missing`) instead of taking
    // the 0 as declared and charging the line at 0 % VAT.
    ...(l.tax_category_key ? { tax_rate: l.tax_rate ?? 0 } : {}),
    category_id: l.category_id ?? opts.primaryCategory?.(l.id) ?? null,
    is_gift: l.is_gift ?? false,
    gift_reason: l.gift_reason ?? '',
    cost: l.cost ?? 0,
    discount: l.discount ?? 0,
    ...(l.is_service ? { is_service: true } : {}),
    // sales#273 — WHO did this line. Only when there is one: nobody chosen is not "nobody served
    // it", it is the SERVER attributing the sale to the session user, and `sales.by_staff` falling
    // back to the ticket's professional for a line with no id of its own.
    ...(l.staff_id ? { staff_id: l.staff_id } : {}),
    ...(l.modifiers?.length ? { modifiers: l.modifiers.map((m) => ({ option_id: m.option_id })) } : {}),
    ...(l.combo_id
      ? {
          combo_id: l.combo_id,
          combo_choices: (l.combo_choices ?? []).map((c) => ({
            option_id: c.option_id,
            product_name: c.product_name ?? '',
            category_id: c.category_id ?? null,
          })),
        }
      : {}),
    ...(l.line_id && opts.covered.has(l.line_id) ? { covered: true } : {}),
    ...(l.line_id ? { order_item_id: l.line_id } : {}),
    ...unitContextPayload(l),
  }));
}

/** The payload of `sales.checkout.preview` for a ticket. Exported for the charge to mirror it. */
export function checkoutPreviewPayload(
  shape: CheckoutShape,
  primaryCategory?: PrimaryCategory,
  orderId?: string,
): Record<string, unknown> {
  return {
    items: checkoutItems(shape.lines, { covered: shape.covered, primaryCategory }),
    discount_percent: shape.ticketDiscount,
    // sales#113: with a PARTIAL charge the fixed amount is not sent — it applies when the whole
    // check is closed, exactly as `sales.complete_sale` receives it.
    ...(shape.ticketDiscountAmount > 0 && !shape.partial
      ? { discount_amount: shape.ticketDiscountAmount }
      : {}),
    tax_included: shape.taxIncluded,
    ...(orderId ? { order_id: orderId } : {}),
  };
}

/**
 * Asks the hub what this ticket is worth. `undefined` = there is no authoritative answer right now
 * (nothing to value, an older hub without the command, the network down) and the caller must fall
 * back to its own preview — NEVER to a zero, which would look like a free ticket.
 */
export async function fetchCheckoutPreview(
  client: Pick<ErploraClientLike, 'command'>,
  shape: CheckoutShape,
  opts: { primaryCategory?: PrimaryCategory; orderId?: string } = {},
): Promise<CheckoutPreview | undefined> {
  if (!shape.lines.length) return undefined;
  const res = await client.command<{ result?: CheckoutPreview } | undefined>(
    'sales.checkout.preview',
    checkoutPreviewPayload(shape, opts.primaryCategory, opts.orderId),
  );
  const result = res?.result;
  // The handler answers through its own channel (hub#70). A response without it is a hub that does
  // not have this command yet: absent, not zero.
  return result && typeof result.total === 'number' ? result : undefined;
}

/**
 * A stable fingerprint of everything that MOVES the total. The screen refetches when it changes and
 * only then: a preview is a round trip that reads the whole sale catalogue, so refetching on every
 * repaint would put the checkout behind the network.
 *
 * It deliberately ignores what cannot move money (a line's display name, its icon): a signature
 * that changes for those would refetch for nothing, and one that missed a real change would leave a
 * stale total on the charge button — which is the defect this whole file is about.
 */
export function previewSignature(shape: CheckoutShape): string {
  const lines = shape.lines.map((l) => [
    l.line_id ?? l.id,
    l.id,
    l.price,
    l.qty,
    l.discount ?? 0,
    l.tax_category_key ?? '',
    l.is_gift ? 1 : 0,
    l.is_service ? 1 : 0,
    (l.modifiers ?? []).map((m) => m.option_id).join('+'),
    l.combo_id ?? '',
    (l.combo_choices ?? []).map((c) => c.option_id).join('+'),
  ]);
  return JSON.stringify([
    lines,
    shape.ticketDiscount,
    shape.ticketDiscountAmount,
    shape.taxIncluded,
    shape.partial ?? false,
    [...shape.covered].sort(),
  ]);
}
