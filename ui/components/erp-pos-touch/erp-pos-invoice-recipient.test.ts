// sales#317 — picking «Factura» at the till asks WHO the invoice is for, below the ceiling too.
//
// Before: on a 51,90 € sale with no customer, the cashier picked «Factura», charged, and the screen
// handed over a «FACTURA» made out to «Cliente» with no name, tax ID or address. VeriFactu filed it
// as an F2 (`resolve_invoice_type` downgrades an F1 with no recipient), so the paper said one thing
// and the tax record another. The recipient capture existed, but only above the simplified-invoice
// ceiling (hub#297).
//
// Market shape (the QA's references): Holded, Odoo POS and Square ES all ask for the customer the
// moment an invoice is requested at the till, and without the data the valid document is the ticket.
// So: the SAME three fields the ceiling asks for, in the SAME sheet, pre-filled from the assigned
// customer; the charge is blocked until they are there, and «Tique» is always one tap away.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';

const PRODUCTS = [
  { id: 'p-acond', name: 'Acondicionador 300 ml', sku: 'ACO', price: 1190, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];
/** The Spanish ceiling, as `hub.fiscal.limits` answers it: 3.000,00 €. */
const SPANISH_CEILING = [{ simplified_invoice_max_cents: 300_000 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk(settings: Record<string, unknown> | null = null, fiscalLimits: unknown[] = SPANISH_CEILING) {
  const double = installPosDouble({
    settings,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    fiscalLimits,
    command: async (name: string) => (name === 'sales.order.open'
      ? { ok: true, new_ids: ['ord-1', 'line-1'] }
      : { ok: true, rows: [{ id: 'sale-1' }] }),
  });
  commands = double.commands;
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
  chooseDocFormat(next: 'ticket' | 'invoice'): void;
  docFormat: 'ticket' | 'invoice';
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const capture = (el: Pos) => $(el, '[data-testid="pos-invoice-recipient-capture"]');
const sheetCharge = (el: Pos) => $(el, '.sheet-foot ion-button.charge');
const sale = () => commands.find((c) => c.name === 'sales.complete_sale');

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

/** A cart with one line and the charge sheet open: where the cashier is asked «¿tique o factura?». */
async function atCheckout(): Promise<Pos> {
  const el = await mount();
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  return el;
}

/** The customer arrives the only way it can: the `customers` filler emits its context (ADR-0132). */
async function assignCustomer(el: Pos, data: { name: string; taxId: string; address: string }) {
  el.dispatchEvent(new CustomEvent('erp:customer-context', {
    detail: {
      customer_id: 'cus-1', customer_name: data.name, customer_tax_id: data.taxId, customer_address: data.address,
    },
    bubbles: false,
  }));
  await el.updateComplete;
}

/** Types into one of the capture's fields the way `ion-input` reports it. */
async function type(el: Pos, testid: string, value: string) {
  const input = $(el, `[data-testid="${testid}"]`) as (HTMLElement & { value?: string }) | null;
  expect(input, `${testid} is on screen`).toBeTruthy();
  input!.value = value;
  input!.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
  await el.updateComplete;
}

async function pickInvoice(el: Pos) {
  $(el, '[data-testid="pos-doc-format-invoice"]')!.click();
  await el.updateComplete;
}

beforeAll(async () => { await import('./erp-pos-touch'); }, 30_000);
beforeEach(() => { installSdk(); });

describe('1 · «Factura» without a customer, well below the ceiling, asks for the recipient', () => {
  it('the sheet shows the name, tax ID and address fields right away', async () => {
    const el = await atCheckout();
    expect(capture(el), 'a ticket asks nothing').toBeFalsy();

    await pickInvoice(el);

    const box = capture(el);
    expect(box, 'picking «Factura» is picking a document that needs a recipient').toBeTruthy();
    for (const id of ['pos-limit-name', 'pos-limit-tax-id', 'pos-limit-address']) {
      expect(box!.querySelector(`[data-testid="${id}"]`), id).toBeTruthy();
    }
    // The reason is the invoice, not the ceiling: «over 3.000 €» on a 11,90 € sale would be a lie.
    expect(box!.textContent).toContain('ui.invoiceRecipientTitle');
    expect(box!.textContent).not.toContain('ui.limitBlockedTitle');
    expect($(el, '[data-testid="pos-simplified-limit-capture"]'), 'this is not the ceiling').toBeFalsy();
  });

  it('the charge button is blocked — aria-disabled, never natively disabled (sales#58)', async () => {
    const el = await atCheckout();
    await pickInvoice(el);
    // The cash is typed FIRST: an untyped cash amount blocks the button on its own (sales#309), and
    // this case must measure the recipient, not the keypad.
    await tenderExactCash(el);

    const charge = sheetCharge(el)!;
    expect(charge.getAttribute('aria-disabled')).toBe('true');
    expect(charge.hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
  });

  it('🔴 confirming does NOT emit an invoice made out to nobody', async () => {
    const el = await atCheckout();
    await pickInvoice(el);
    await tenderExactCash(el);

    await el.confirm();
    await el.updateComplete;

    expect(sale(), 'the number of the chain is not spent on a «FACTURA · Cliente»').toBeUndefined();
    expect(el.docFormat, 'the cashier’s choice is kept, not silently turned into a ticket').toBe('invoice');
  });
});

describe('2 · with the recipient filled in, it charges as a complete invoice', () => {
  it('typing the three fields unblocks it and the sale travels with them', async () => {
    const el = await atCheckout();
    await pickInvoice(el);
    await type(el, 'pos-limit-name', 'Lucía Pérez');
    await type(el, 'pos-limit-tax-id', '12345678Z');
    await type(el, 'pos-limit-address', 'C/ Mayor 1, 28013 Madrid');
    await tenderExactCash(el);

    expect(sheetCharge(el)!.getAttribute('aria-disabled'), 'unblocked').toBeNull();
    await el.confirm();

    expect(sale(), 'the sale is sent').toBeTruthy();
    expect(sale()!.payload).toMatchObject({
      document_type: 'invoice',
      customer_name: 'Lucía Pérez',
      customer_tax_id: '12345678Z',
      customer_address: 'C/ Mayor 1, 28013 Madrid',
    });
  });

  it('an assigned customer with complete data fills the fields: read and charge', async () => {
    const el = await atCheckout();
    await assignCustomer(el, { name: 'ACME SL', taxId: 'B12345678', address: 'C/ Mayor 1' });
    await pickInvoice(el);

    const taxId = $(el, '[data-testid="pos-limit-tax-id"]') as (HTMLElement & { value?: string }) | null;
    expect(taxId?.value, 'the customer file is not typed twice').toBe('B12345678');
    await tenderExactCash(el);
    expect(sheetCharge(el)!.getAttribute('aria-disabled')).toBeNull();

    await el.confirm();
    expect(sale()!.payload).toMatchObject({ document_type: 'invoice', customer_tax_id: 'B12345678' });
  });

  it('an assigned customer WITHOUT an address still blocks until it is typed', async () => {
    const el = await atCheckout();
    await assignCustomer(el, { name: 'Ana', taxId: '12345678Z', address: '' });
    await pickInvoice(el);
    await tenderExactCash(el);
    expect(sheetCharge(el)!.getAttribute('aria-disabled')).toBe('true');

    await type(el, 'pos-limit-address', 'C/ Luna 3');
    expect(sheetCharge(el)!.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('3 · «Tique» stays the one-tap way out', () => {
  it('a plain ticket with no customer charges exactly as before', async () => {
    const el = await atCheckout();
    await tenderExactCash(el);
    await el.confirm();

    expect(sale()!.payload.document_type).toBe('ticket');
  });

  it('going back from «Factura» to «Tique» removes the fields and charges', async () => {
    const el = await atCheckout();
    await pickInvoice(el);
    $(el, '[data-testid="pos-doc-format-ticket"]')!.click();
    await el.updateComplete;

    expect(capture(el)).toBeFalsy();
    await tenderExactCash(el);
    await el.confirm();
    expect(sale()!.payload.document_type).toBe('ticket');
  });
});

describe('4 · the rule does not depend on how the sheet was opened', () => {
  it('a hub whose default is «Factura» opens the sheet asking for the recipient', async () => {
    installSdk({ default_document_format: 'invoice' });
    const el = await atCheckout();

    expect(el.docFormat).toBe('invoice');
    expect(capture(el)).toBeTruthy();
    await tenderExactCash(el);
    await el.confirm();
    expect(sale(), 'the default is a preference, not a licence to skip the recipient').toBeUndefined();
  });

  it('a country with no ceiling still needs a recipient for an invoice', async () => {
    installSdk(null, []);
    const el = await atCheckout();
    await pickInvoice(el);

    expect(capture(el)).toBeTruthy();
    await tenderExactCash(el);
    await el.confirm();
    expect(sale()).toBeUndefined();
  });
});

describe('5 · above the ceiling nothing changes (hub#297)', () => {
  it('the ceiling capture is still the one shown, with its own reason, and no choice of ticket', async () => {
    installSdk(null, [{ simplified_invoice_max_cents: 1_000 }]);
    const el = await atCheckout();

    expect($(el, '[data-testid="pos-simplified-limit-capture"]')).toBeTruthy();
    expect(capture(el), 'one capture, not two').toBeFalsy();
    expect($(el, '[data-testid="pos-doc-format-ticket"]'), 'above the ceiling a ticket is not offered').toBeFalsy();
    await tenderExactCash(el);
    await el.confirm();
    expect(sale()).toBeUndefined();
  });
});

describe('6 · the copy exists in BOTH languages', () => {
  it('en and es carry every key this block needs, translated', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const key of ['invoiceRecipientTitle', 'invoiceRecipientBody']) {
      expect(en[key], `en.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key} must be translated, not copied`).not.toBe(en[key]);
    }
  });
});
