// sales#332 — an invoice at the till for a customer from abroad says where they are from and what
// their number is.
//
// Before: the recipient capture had name, tax ID and address only, so a company from the US or a
// tourist with a passport went to the AEAT as if the number were a Spanish NIF and came back with
// errors. The chain after the till already declares a foreign customer (hub#1967, invoice#82);
// the till only has to ask and send it with the sale.
//
// Market shape (Odoo `l10n_es_edi_verifactu`): the COUNTRY decides, the kind of document is only
// asked outside Spain, pre-set to the usual one (EU VAT number inside the EU, tax id elsewhere).
// All document numbers below are synthetic.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';

const PRODUCTS = [
  { id: 'p-1', name: 'Corte', sku: 'CUT', price: 1190, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

beforeEach(() => {
  const double = installPosDouble({
    settings: null,
    products: PRODUCTS,
    rules: RULES,
    paymentMethods: METHODS,
    fiscalLimits: [{ simplified_invoice_max_cents: 300_000 }],
    command: async (name: string) => (name === 'sales.order.open'
      ? { ok: true, new_ids: ['ord-1', 'line-1'] }
      : { ok: true, rows: [{ id: 'sale-1' }] }),
  });
  commands = double.commands;
});

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

type Field = HTMLElement & { value?: string };
const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<Field>(sel);
const country = (el: Pos) => $(el, '[data-testid="pos-limit-country"]');
const idType = (el: Pos) => $(el, '[data-testid="pos-limit-id-type"]');
const sale = () => commands.find((c) => c.name === 'sales.complete_sale');

async function atInvoice(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  await openInvoice(el);
  return el;
}

/** One line in the cart, the charge sheet open and «Factura» picked. */
async function openInvoice(el: Pos) {
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  $(el, '[data-testid="pos-doc-format-invoice"]')!.click();
  await el.updateComplete;
}

async function type(el: Pos, testid: string, value: string) {
  const input = $(el, `[data-testid="${testid}"]`);
  expect(input, `${testid} is on screen`).toBeTruthy();
  input!.value = value;
  input!.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
  await el.updateComplete;
}

/** `ion-select` reports the pick through `ionChange` with the value in `detail`. */
async function pick(el: Pos, field: Field | null, value: string) {
  expect(field, 'the select is on screen').toBeTruthy();
  field!.value = value;
  field!.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
  await el.updateComplete;
}

async function fillAndCharge(el: Pos) {
  await type(el, 'pos-limit-name', 'Test Company Inc');
  await type(el, 'pos-limit-tax-id', 'TEST-TAXID-1');
  await type(el, 'pos-limit-address', '1 Test Street');
  await tenderExactCash(el);
  await el.confirm();
}

beforeAll(async () => { await import('./erp-pos-touch'); }, 30_000);

describe('1 · the country is asked, Spain by default, and the document kind only abroad', () => {
  it('a Spanish customer sees the country (Spain) and no document kind', async () => {
    const el = await atInvoice();
    expect(country(el)?.value).toBe('ES');
    expect(idType(el), 'a Spanish number is a NIF: nothing to ask').toBeFalsy();
  });

  it('picking a non-EU country shows the document kind, pre-set to their tax id (04)', async () => {
    const el = await atInvoice();
    await pick(el, country(el), 'US');
    expect(idType(el)?.value).toBe('04');
  });

  it('picking an EU country pre-sets the EU VAT number (02)', async () => {
    const el = await atInvoice();
    await pick(el, country(el), 'FR');
    expect(idType(el)?.value).toBe('02');
  });

  it('the kind of document is labelled, in en and es, for every option', async () => {
    const el = await atInvoice();
    await pick(el, country(el), 'US');
    const labels = [...idType(el)!.querySelectorAll('ion-select-option')].map((o) => o.textContent?.trim());
    expect(labels).toEqual(['ui.idType02', 'ui.idType04', 'ui.idType03', 'ui.idType06']);
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const k of ['limitFieldCountry', 'limitFieldIdType', 'idType02', 'idType03', 'idType04', 'idType06']) {
      expect(en[k], `en ${k}`).toBeTruthy();
      expect(es[k], `es ${k}`).toBeTruthy();
      expect(es[k], `es ${k} is translated`).not.toBe(en[k]);
    }
  });
});

describe('2 · the sale carries them', () => {
  it('🔴 a customer from the US with a passport travels as US / 03', async () => {
    const el = await atInvoice();
    await pick(el, country(el), 'US');
    await pick(el, idType(el), '03');
    await fillAndCharge(el);
    expect(sale()!.payload).toMatchObject({
      document_type: 'invoice', customer_tax_id: 'TEST-TAXID-1', customer_country: 'US', customer_id_type: '03',
    });
  });

  it('a Spanish customer sends nothing, so the VAT prefix keeps deciding as before', async () => {
    const el = await atInvoice();
    await fillAndCharge(el);
    expect(sale()!.payload).toMatchObject({ customer_country: '', customer_id_type: '' });
  });

  it('going back to Spain after picking abroad clears the document kind', async () => {
    const el = await atInvoice();
    await pick(el, country(el), 'US');
    await pick(el, country(el), 'ES');
    expect(idType(el)).toBeFalsy();
    await fillAndCharge(el);
    expect(sale()!.payload).toMatchObject({ customer_country: '', customer_id_type: '' });
  });
});

describe('3 · the customer file pre-fills the country', () => {
  it('an assigned customer whose file says GB comes in as GB / 04', async () => {
    const el = await atInvoice();
    el.dispatchEvent(new CustomEvent('erp:customer-context', {
      detail: {
        customer_id: 'cus-1', customer_name: 'Test Ltd', customer_tax_id: 'TEST-TAXID-2',
        customer_address: '2 Test Road', customer_country: 'gb',
      },
    }));
    await el.updateComplete;
    expect(country(el)?.value).toBe('GB');
    expect(idType(el)?.value).toBe('04');
  });

  it('🔴 sales#336 — a customer from French Guiana comes in as France / 04 and the sale says so', async () => {
    const el = await atInvoice();
    el.dispatchEvent(new CustomEvent('erp:customer-context', {
      detail: {
        customer_id: 'cus-2', customer_name: 'Test SARL', customer_tax_id: 'TEST-TAXID-3',
        customer_address: '3 Test Avenue', customer_country: 'GF',
      },
    }));
    await el.updateComplete;
    expect(country(el)?.value).toBe('FR');
    expect(idType(el)?.value).toBe('04');
    await tenderExactCash(el);
    await el.confirm();
    expect(sale()!.payload).toMatchObject({ customer_country: 'FR', customer_id_type: '04' });
  });

  it('after charging, the next check starts again from Spain', async () => {
    const el = await atInvoice();
    await pick(el, country(el), 'US');
    await fillAndCharge(el);
    expect(sale(), 'the first sale went through').toBeTruthy();
    await openInvoice(el);
    expect(country(el)?.value).toBe('ES');
    expect(idType(el)).toBeFalsy();
  });
});
