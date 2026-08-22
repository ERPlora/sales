// **The paper**, in the shape the thermal printer reads (sales#78 / sales#79).
//
// ## Why this file exists next to `document-mappers.ts`
//
// The same sale has two documents: the one the screen paints (`ReceiptData` → `<ok-receipt>`) and
// the one the printer renders (`escpos::render_document`, `crates/peripherals`). They carry the
// same content under **different key names** — `business.name` vs `business_name`, `lines[]` vs
// `items[]` — and the renderer reads BY KEY, so handing it the screen's shape does not fail: it
// finds nothing, renders every default and prints «ERPlora», no lines, TOTAL 0.00. That is how the
// bill and the reprint were failing (sales#78/#79) — a blank ticket that looked printed.
//
// So the translation gets a name and a test instead of being done inline at each call site.
//
// ## Composed, not duplicated
//
// Every mapper here goes THROUGH `document-mappers.ts` and only renames keys. That is deliberate:
// the waiter reads the screen and the customer reads the paper, so a second implementation of
// «what is on this bill» would eventually disagree with the first and one of the two people would
// be lied to. `print-document.test.ts` pins that parity line by line.
//
// The field names are the wire contract of `escpos::render_receipt` / `render_prebill`. Changing
// one here without changing it there prints a document with a missing field, silently.
import { orderToPrebill, saleToReceipt } from './document-mappers.js';
import type { PrebillLine, SaleRow, SaleLineRow, SaleSettings, FiscalData } from './document-mappers.js';

/** Cents (the row) → euros (the paper). The renderer formats with `{:.2}` and expects a number. */
function euros(cents: number | undefined): number | undefined {
  return cents == null ? undefined : Number(cents) / 100;
}

/** A line as `escpos` reads it. */
export interface PrintDocumentItem {
  name: string;
  quantity: number;
  total: number;
  notes?: string;
}

/**
 * The document `escpos::render_document` reads. Keys are its lookups, verbatim.
 *
 * Everything is optional except what a document cannot be without, because the renderer prints
 * only the fields that are there — a bill has no `payment_method`, a comped ticket has no `change`.
 */
export interface PrintDocument extends Record<string, unknown> {
  business_name: string;
  business_address?: string;
  vat_number?: string;
  /** Ticket number. **Never** set on a bill: the fiscal series is consumed when charging. */
  receipt_id?: string;
  customer_name?: string;
  items: PrintDocumentItem[];
  subtotal?: number;
  tax_amount?: number;
  discount?: number;
  total: number;
  payment_method?: string;
  paid?: number;
  change?: number;
  /** VeriFactu (or any) QR, as the renderer names it. */
  qr_data?: string;
  receipt_footer?: string;
  /** Printed at the foot of a bill: «this is not an invoice» (ADR-0141). */
  notice?: string;
}

/**
 * Open order → **the bill taken to the table**, for the printer.
 *
 * Not a fiscal document (ADR-0141): no series number, no payment, no VeriFactu QR — and it says so
 * on the paper, because handing a customer something that looks like an invoice and is not one is a
 * legal problem, not a cosmetic one.
 */
export function prebillToPrintDocument(
  lines: PrebillLine[],
  settings: SaleSettings = {},
  opts: { tableLabel?: string; datetime?: string; locale?: string; notice?: string; fallbackName?: string } = {},
): PrintDocument {
  const screen = orderToPrebill(lines, settings, opts);
  return {
    business_name: screen.business.name,
    business_address: screen.business.address,
    // The renderer prints this as «Mesa/Cliente»: on a bill it is the table, which is what the
    // waiter needs to know which paper goes where.
    customer_name: screen.customer,
    items: screen.lines.map((l) => ({ name: l.name, quantity: l.qty, total: l.total })),
    total: screen.total,
    notice: screen.footer,
  };
}

/**
 * Sale → **the ticket**, for the printer. Used to reprint a sale from its document viewer.
 *
 * The authority is the sale as the hub returns it (`sales.get` / `sales.lines`) plus its fiscal
 * record — never what a screen happens to hold. That is what makes «regenerate, never store»
 * (ADR-0263) safe: the copy handed out a month later is the copy the customer got.
 */
export function saleToPrintDocument(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
  locale = 'es',
  fallbackName?: string,
  t?: (key: string) => string,
): PrintDocument {
  const screen = saleToReceipt(sale, lines, settings, fiscal, locale, fallbackName, t);
  return {
    business_name: screen.business.name,
    business_address: screen.business.address,
    vat_number: screen.business.tax_id,
    receipt_id: screen.number,
    customer_name: screen.customer,
    items: screen.lines.map((l) => ({ name: l.name, quantity: l.qty, total: l.total })),
    subtotal: screen.subtotal,
    // The tax total comes from the sale row, not from the breakdown: a sale without
    // `tax_breakdown` still has `tax_amount`, and the paper must not lose it.
    tax_amount: euros(sale.tax_amount),
    discount: euros(sale.discount_amount),
    total: screen.total,
    payment_method: screen.payment?.method,
    paid: screen.payment?.paid,
    change: screen.payment?.change,
    qr_data: screen.qr,
    receipt_footer: screen.footer,
  };
}

/**
 * Idempotency key for a bill.
 *
 * The queue is idempotent by `(hub_id, job_id)`, which is exactly what a **retry** needs: the
 * waiter pressing print twice because nothing came out must not queue two papers. But it is also
 * what a **second round** must escape: add a dessert, print again, and a key derived only from the
 * order would be swallowed as a duplicate and the table would get the old bill — or nothing.
 *
 * So the key is `prebill-<order>-<fingerprint of what is on the bill>`: same bill → same job,
 * changed bill → new job.
 *
 * Known limit: asking for a **second copy of an unchanged bill** produces the same key, so through
 * the queue it prints once. Direct printing (the app with its own printer) is unaffected, and the
 * bill is not a fiscal document — worth the trade for not double-printing every retry.
 */
export function prebillJobId(orderId: string | undefined, lines: PrebillLine[]): string {
  const fingerprint = (lines || [])
    .map((l) => `${l.name}${l.qty}${l.price}${l.is_gift ? 1 : 0}`)
    .join('');
  return `prebill-${orderId || 'open'}-${hash(fingerprint)}`;
}

/** Sequence so two attempts inside the same millisecond still get different keys. */
let reprintSeq = 0;

/**
 * Idempotency key for REPRINTING a sale's ticket (sales#92).
 *
 * Why not the sale's own key (`sale-${saleId}`): the print queue is idempotent by
 * `(hub_id, job_id)` (`printing.jobs_create`: `ON CONFLICT DO NOTHING`) and that exact key was
 * already spent by the shell's automatic print at checkout (`print-on-sale.ts`) — the reprint
 * fell into the dedup's pocket and no paper came out, with no error shown.
 *
 * Why not a content fingerprint (the prebill's answer): a sale is IMMUTABLE (fiscal record,
 * module.json `records.sale`), so its fingerprint is constant and every copy after the first
 * would be swallowed. The prebill's trade («an unchanged bill prints once») is wrong for a
 * reprint: pressing IMPRIMIR is an explicit request for ANOTHER copy, so each attempt is a new
 * job — `sale-<id>-<attempt>`, still correlatable with the sale it belongs to.
 */
export function reprintJobId(saleId: string | undefined): string | undefined {
  if (!saleId) return undefined;
  reprintSeq += 1;
  return `sale-${saleId}-${Date.now().toString(36)}-${reprintSeq}`;
}

/** FNV-1a, 32 bits, base36. Small and stable — this is a cache key, not a checksum. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
