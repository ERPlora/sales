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
import { orderToPrebill, saleToReceipt, saleToInvoice, claimPrintFields, paperNote } from './document-mappers.js';
import { modifierIdentity, modifierLabel } from './paper-modifiers.js';
import { comboIdentity, componentLabel, type PrintedCombo } from './paper-combos.js';
import type { PrebillLine, PrebillValuation, SaleRow, SaleLineRow, SaleSettings, FiscalData } from './document-mappers.js';
import { quantityLabel, unitTag } from './price-label.js';

/** Minor units (the document, ADR-0400) → major units (the paper). The thermal renderer formats
 *  `{:.2}` over a float and expects a number (hub#1159) — this is the ONE place the document's
 *  integers are divided, by the document's own scale (JPY 0, KWD 3), never by a blind 100. */
function euros(minor: number | undefined, decimals = 2): number | undefined {
  return minor == null ? undefined : Number(minor) / 10 ** decimals;
}

/** A line as `escpos` reads it. */
export interface PrintDocumentItem {
  name: string;
  /** Cantidad: el NÚMERO de siempre, o la cadena YA compuesta («1,5 kg ») cuando la línea lleva
   *  unidad medible (sales#28). El renderer (`fmt_qty`) imprime una cadena tal cual. */
  quantity: number | string;
  total: number;
  notes?: string;
  /** sales#154 — the menu's components as a LIST, for a renderer that learns to indent them one per
   *  line (ERPlora/hub). Today's `render_receipt`/`render_prebill` ignore unknown keys, so this is
   *  additive: the text they DO print is the `notes` sub-line. Absent on a plain line. */
  components?: string[];
  /** sales#229 — the line's supplements as a LIST, on the SAME terms as `components`: labels
   *  already composed, no amount (the delta is inside the line total), absent when there are none.
   *
   *  A different axis from `components`, and both print: the menu says WHAT the item is made of,
   *  the supplement says what was CHANGED about it. `notes` keeps chaining the same texts with
   *  « · » for the renderers that only know that one sub-line — which today is all of them
   *  (ERPlora/hub#1138 is still open). Nothing is removed, so this ships before the renderer:
   *  an image that ignores the key prints exactly what it prints now. */
  modifiers?: string[];
}

/** Cantidad para la línea del papel térmico (sales#28).
 *
 * Sin unidad (línea antigua o `ud`) va el NÚMERO, como siempre: el papel sale byte a byte
 * idéntico. Con unidad medible va la cadena compuesta con un ESPACIO final, porque el renderer
 * escribe su separador como un literal — `format!("{}x {name}", …)` — y sin él «1,5 kg» saldría
 * pegado: «1,5 kgx Tomate». Con él, «1,5 kg x Tomate». */
function printQuantity(qty: number, unitCode?: string): number | string {
  return unitTag(unitCode) ? `${quantityLabel(qty, unitCode)} ` : qty;
}

/** The line's sub-line texts, in the keys the ESC/POS renderer reads (sales#148).
 *
 * `notes` is the sub-line `render_receipt` and `render_prebill` print indented under their item
 * (`  > {notes}`, crates/peripherals/src/escpos.rs). It carries EVERYTHING chained, because that is
 * the one door any deployed hub already prints — the renderer reads BY KEY, so a key it does not
 * know does not fail: it prints NOTHING, silently, the failure this file's header has been warning
 * about since sales#78. So `notes` is never dropped, only complemented.
 *
 * With no supplements and no menu the keys are NOT emitted: the paper comes out byte for byte as
 * it did.
 *
 * sales#154: the menu's components travel through the SAME sub-line, first, followed by the line's
 * supplements — one composer (`paperNote`) for the screen's `note` and this `notes`. And as a list
 * in `components`, for the renderer that will indent them (ignored by today's, by contract).
 *
 * sales#229: the supplements get the same treatment in `modifiers`. Chained in one sub-line they
 * run past the paper's 32 columns and the printer wraps them at the margin, losing the indent that
 * is what ties a supplement to its item; as a list the renderer can give each one its own row
 * (ERPlora/hub#1138). `notes` stays, so a hub that has not learnt the key prints what it prints
 * today. Both lists are built with the SAME composers the screen uses (`componentLabel`,
 * `modifierLabel`), which is what keeps the four doors from saying different things. */
function printNotes(
  l: { printed_modifiers?: Parameters<typeof paperNote>[1]; combo?: PrintedCombo; line_note?: string },
): { notes?: string; components?: string[]; modifiers?: string[] } {
  // sales#156: the waiter's free note shares this sub-line, last. It is the same composer the
  // screen uses, so paper and screen cannot drift apart.
  const notes = paperNote(l.combo, l.printed_modifiers, l.line_note);
  const components = l.combo?.components.map(componentLabel).filter(Boolean);
  // In the order they were chosen: the paper is read against what was ordered, not sorted.
  const modifiers = l.printed_modifiers?.map(modifierLabel).filter(Boolean);
  return {
    ...(notes ? { notes } : {}),
    ...(components?.length ? { components } : {}),
    ...(modifiers?.length ? { modifiers } : {}),
  };
}

/**
 * The document `escpos::render_document` reads. Keys are its lookups, verbatim.
 *
 * Everything is optional except what a document cannot be without, because the renderer prints
 * only the fields that are there — a bill has no `payment_method`, a comped ticket has no `change`.
 */
export interface PrintDocument extends Record<string, unknown> {
  business_name: string;
  /** sales#483 — the hub's language: the renderer writes its own words (the tax row, «TOTAL»…) in
   *  it (`Locale::from_document`, hub#1159). Without it they come out in Spanish whatever the hub. */
  locale?: string;
  /** hub#1931 — `true` on a REPRINT: the renderer prints «DUPLICADO» on it (RD 1619/2012 art. 14).
   *  Never set on the first print — there is only one original. */
  duplicate?: boolean;
  business_address?: string;
  vat_number?: string;
  /** Ticket number. **Never** set on a bill: the fiscal series is consumed when charging. */
  receipt_id?: string;
  customer_name?: string;
  items: PrintDocumentItem[];
  subtotal?: number;
  tax_amount?: number;
  /** How the renderer names that quota ("IVA 10%"). It defaults to "IVA"; naming a single rate is
   *  only honest when there IS a single rate -- sales#180. */
  tax_label?: string;
  discount?: number;
  total: number;
  payment_method?: string;
  paid?: number;
  change?: number;
  /** VeriFactu (or any) QR, as the renderer names it. */
  qr_data?: string;
  /** sales#327 — the legal legend printed right under `qr_data` («VERI*FACTU», RD 1619/2012
   *  art. 6.5.b). Present exactly when the fiscal QR is. */
  qr_legend?: string;
  /** sales#339 — «QR tributario:», printed right ABOVE `qr_data`, which opens the ticket (AEAT QR
   *  spec v0.5.0 §3). Present exactly when the fiscal QR is. */
  qr_heading?: string;
  /** sales#103 (ADR-0363) — the SECOND QR: `https://<hub>/p/<locator>`, the self-service door to
   *  ask for the full invoice. Deliberately SEPARATE from `qr_data`: that one points at the AEAT
   *  and its numserie is sequential and public, so it cannot serve as a locator — two codes, two
   *  destinations. Printed only when a claim was minted (a plain F2 with the invoice module). */
  claim_qr_data?: string;
  /** The legend beside it («Pide tu factura» / «Get your invoice»): without it nobody knows what
   *  the second code is for. Translated at render time from the module catalog (ADR-0055). */
  claim_note?: string;
  /** The locator IN TEXT — the only way in when the camera won't focus or the ticket is a copy. */
  claim_locator?: string;
  /** hub#2009 — the business's promotional QR (reviews, social media) from the POS settings, which
   *  the renderer prints at the foot of a TICKET, smaller than the fiscal one. Only present when
   *  the URL was configured; never on a full invoice (formal, like the A4). */
  promo_qr?: string;
  /** hub#2009 — the text above it («Scan and leave us a review»), as the business typed it. */
  promo_note?: string;
  receipt_footer?: string;
  /** Printed at the foot of a bill: «this is not an invoice» (ADR-0141). */
  notice?: string;
  /** sales#350 — only on a full invoice (`documentType: 'invoice'`): the customer's tax id, printed
   *  under their name. Required by the renderer for an invoice (ERPlora/hub#2005). */
  customer_tax_id?: string;
  /** sales#350 — optional, printed under the customer's tax id. */
  customer_address?: string;
  /** sales#350 — the VAT broken down per rate, required by the renderer for an invoice: one row per
   *  rate, `rate` in percent, `base`/`tax` in the unit of `total`, `label` naming the row. */
  tax_breakdown?: PrintTaxRow[];
}

/** One row of a full invoice's VAT breakdown, as `escpos::render_tax_breakdown` reads it. */
export interface PrintTaxRow {
  rate: number;
  base: number;
  tax: number;
  label?: string;
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
  opts: { tableLabel?: string; customerName?: string; datetime?: string; locale?: string; notice?: string; fallbackName?: string; t?: (key: string) => string } = {},
  /** sales#164 — the hub's authoritative valuation, so paper and screen say the same number. */
  valuation?: PrebillValuation,
): PrintDocument {
  const screen = orderToPrebill(lines, settings, opts, valuation);
  return {
    business_name: screen.business.name,
    ...(opts.locale ? { locale: opts.locale } : {}),
    business_address: screen.business.address,
    // The renderer prints this as «Mesa/Cliente»: on a bill it is the table, which is what the
    // waiter needs to know which paper goes where.
    customer_name: screen.customer,
    items: screen.lines.map((l) => ({ name: l.name, quantity: printQuantity(l.qty, l.unit_code), total: euros(l.total, screen.decimals)!, ...printNotes(l) })),
    // sales#180 — the bill carries its provisional VAT too: `render_prebill` already prints
    // `subtotal` + `tax_amount` under a `tax_label`, so this is data the paper knew how to show and
    // was not being given. With more than one rate the aggregate is NOT labelled with one of them.
    ...(screen.subtotal != null ? { subtotal: euros(screen.subtotal, screen.decimals) } : {}),
    ...(screen.taxes?.length
      ? {
          tax_amount: euros(screen.taxes.reduce((s, t) => s + (t.amount ?? 0), 0), screen.decimals),
          ...(screen.taxes.length === 1 ? { tax_label: screen.taxes[0].label } : {}),
        }
      : {}),
    total: euros(screen.total, screen.decimals)!,
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
  // sales#274 — paper never inherits the screen's `pending`: a printed copy cannot update itself
  // when the invoice number lands, so it goes out with the best identifier it has (the sale's).
  // Stripped HERE and not only in the viewer, so no caller can compose an ESC/POS document with
  // no `receipt_id`.
  const screen = saleToReceipt(sale, lines, settings, { ...fiscal, pending: false }, locale, fallbackName, t);
  return {
    business_name: screen.business.name,
    locale,
    business_address: screen.business.address,
    vat_number: screen.business.tax_id,
    receipt_id: screen.number,
    customer_name: screen.customer,
    items: screen.lines.map((l) => ({ name: l.name, quantity: printQuantity(l.qty, l.unit_code), total: euros(l.total, screen.decimals)!, ...printNotes(l) })),
    subtotal: euros(screen.subtotal, screen.decimals),
    // The tax total comes from the sale row, not from the breakdown: a sale without
    // `tax_breakdown` still has `tax_amount`, and the paper must not lose it.
    tax_amount: euros(sale.tax_amount, screen.decimals),
    discount: euros(sale.discount_amount, screen.decimals),
    total: euros(screen.total, screen.decimals)!,
    payment_method: screen.payment?.method,
    paid: euros(screen.payment?.paid, screen.decimals),
    change: euros(screen.payment?.change, screen.decimals),
    qr_data: screen.qr,
    qr_legend: screen.qr_legend,
    qr_heading: screen.qr_heading,
    // sales#103: el bloque «pide tu factura», VACÍO sin locator acuñado — el renderer imprime
    // solo los campos presentes, así que un tique sin claim sale byte a byte como hoy.
    ...claimPrintFields(fiscal, t),
    // hub#2009: the same promotional QR the screen and the browser paper carry (sales#345). The
    // keys only exist when the business configured the URL, so its ticket is unchanged otherwise.
    ...(screen.promo_qr ? { promo_qr: screen.promo_qr, ...(screen.promo_note ? { promo_note: screen.promo_note } : {}) } : {}),
    receipt_footer: screen.footer,
  };
}

/**
 * Sale in invoice format → **the full invoice**, for the thermal printer (sales#350).
 *
 * The renderer prints a `documentType: 'invoice'` as a full invoice on the 80 mm roll and REFUSES
 * one without the customer's tax id or the VAT broken down per rate (ERPlora/hub#2005,
 * `escpos::check_full_invoice`): paper that is not an invoice is not cut as if it were. So this is
 * the ticket's document plus what makes it an invoice, taken from `saleToInvoice` — the A4 the
 * screen paints — so the roll and the sheet name the same customer and the same rates.
 *
 * A missing tax id is left missing, never filled with a blank: the hub then fails the job naming
 * the field, and the viewer warns before printing. A hub that predates hub#2005 ignores the extra
 * keys and prints the ticket it prints today.
 */
export function saleToInvoicePrintDocument(
  sale: SaleRow,
  lines: SaleLineRow[],
  settings: SaleSettings = {},
  fiscal: FiscalData = {},
  locale = 'es',
  fallbackName?: string,
  t?: (key: string) => string,
): PrintDocument {
  // hub#2009 — the full invoice is formal, like the A4: the ticket's promotion stays off it.
  const { promo_qr: _promoQr, promo_note: _promoNote, ...ticket } = saleToPrintDocument(sale, lines, settings, fiscal, locale, fallbackName, t);
  const invoice = saleToInvoice(sale, lines, settings, { ...fiscal, pending: false }, locale, fallbackName, t);
  const decimals = invoice.decimals;
  return {
    ...ticket,
    ...(invoice.customer.tax_id ? { customer_tax_id: invoice.customer.tax_id } : {}),
    ...(invoice.customer.address ? { customer_address: invoice.customer.address } : {}),
    tax_breakdown: (invoice.taxes || []).map((row) => ({
      // A rate key that is not a number keeps its row: `label` carries it, and the renderer prints
      // the label instead of the rate.
      rate: row.rate ?? 0,
      base: euros(row.base, decimals)!,
      tax: euros(row.amount, decimals)!,
      ...(row.label ? { label: row.label } : {}),
    })),
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
    // sales#154: and the menu's composition — swapping a component is a corrected bill, a new job.
    // sales#156: and the note — correcting «poco hecho» to «muy hecho» is a corrected bill, and a
    // corrected bill that hashes the same never comes out of the queue.
    .map((l) => `${l.name}${l.qty}${l.price}${l.is_gift ? 1 : 0}${modifierPrint(l.modifiers)}${comboIdentity(l.combo)}${(l.note ?? '').trim()}`)
    .join('');
  return `prebill-${orderId || 'open'}-${hash(fingerprint)}`;
}

/** Los suplementos DENTRO de la huella (sales#148).
 *
 * Sin esto la huella se toma solo de `name/qty/price/is_gift`, así que «+ queso» y «sin cebolla»
 * hashean IGUAL: el camarero corrige la cuenta, la cola la reconoce como el mismo `job_id`
 * (`ON CONFLICT DO NOTHING`) y **no sale papel** — sin error, sin aviso, con el cliente esperando.
 * Es el mismo fallo mudo de sales#92 por la otra puerta.
 *
 * Vacío para una línea sin suplementos, y para una con la lista vacía: una cuenta que no cambió no
 * puede cambiar de huella, o cada reintento imprimiría otra vez. */
function modifierPrint(mods: PrebillLine['modifiers']): string {
  if (!mods?.length) return '';
  return `[${mods.map(modifierIdentity).join('|')}]`;
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
