// **The bill on SCREEN** — what the waiter sees before carrying it to the table (sales#87).
//
// With three lines in the cart and a total of 46,40 €, opening «Cuenta» painted a white box reading
// «No receipt data.» — no lines, no amounts, no total. The paper was already right (sales#78); the
// screen was not.
//
// Two defects, one cause: the bill was handed to `<ok-receipt>` on a property that component does
// NOT have (`.data`), so `receipt` stayed undefined and it fell to its empty state — and no
// `.labels` were passed either, so that empty state (and every label around it) spoke ok-receipt's
// built-in ENGLISH, on a hub running in Spanish. The two strings coincide («No receipt data.» is
// both the English catalog entry and the component default), which is why it read like a broken
// locale and is not one.
//
// So what is pinned here is the SCREEN document: it is built from the open CART, it paints, and it
// speaks the hub's language — while staying non-fiscal (ADR-0141: the fiscal series and the
// VeriFactu QR are consumed when CHARGING, never before).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReceiptData } from '@erplora/outfitkit';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

beforeAll(async () => {
}, 60_000);

/** The hub's real Spanish catalog, resolved like the shell's `t()` does (ADR-0055) — so a label
 *  falling back to ok-receipt's English default is VISIBLE here instead of hiding behind a stub
 *  that echoes the key. */
function translate(_catalog: unknown, key: string): string {
  const found = key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    esLocale as unknown,
  );
  return typeof found === 'string' ? found : key;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installPosDouble({ t: translate });
});

/** The cart QA had open: 3 lines, 46,40 € (2×12,00 + 3×5,80 + 1×5,00). */
const CART = [
  { line_id: 'l1', name: 'Entrecot', price: 1200, qty: 2 },
  { line_id: 'l2', name: 'Caña', price: 580, qty: 3 },
  { line_id: 'l3', name: 'Postre', price: 500, qty: 1 },
];

interface OkReceiptLike extends HTMLElement {
  receipt?: ReceiptData;
  labels?: Record<string, string>;
}

/** Mounts the POS with an open table order and OPENS the bill, as the waiter does. */
async function openBill(cart: unknown[] = CART): Promise<OkReceiptLike> {
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  const pos = el as unknown as Record<string, unknown>;
  pos.cart = cart;
  pos.orderId = 'order-1';
  pos.tableLabel = 'Mesa 4';
  pos.prebillOpen = true;
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

  const doc = el.shadowRoot!.querySelector<OkReceiptLike>('#prebill-doc');
  expect(doc, 'the bill document is rendered').toBeTruthy();
  await (doc as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
  return doc!;
}

describe('the bill on screen, built from the open cart', () => {
  it('hands the document to ok-receipt on the property it actually reads', async () => {
    const doc = await openBill();

    // `.data` is not a property of ok-receipt: setting it left `receipt` undefined and the component
    // painted its empty box. This is the whole of sales#87.
    expect(doc.receipt, 'ok-receipt reads `receipt`, nothing else').toBeTruthy();
    expect((doc as unknown as Record<string, unknown>).data, 'no stray `.data` expando').toBeUndefined();
  });

  it('PAINTS the lines, quantities and amounts — not an empty box', async () => {
    const doc = await openBill();
    const painted = doc.shadowRoot!.textContent || '';

    expect(painted, 'the empty state must be gone').not.toContain('Sin datos de tiquet');
    expect(doc.shadowRoot!.querySelector('.paper.empty'), 'no empty paper').toBeNull();
    for (const name of ['Entrecot', 'Caña', 'Postre']) {
      expect(painted, `the line «${name}» is on the bill`).toContain(name);
    }
    expect(painted, 'the amount of the entrecot line (2×12,00)').toContain('24.00');
  });

  it('totals what is on the table: 2×12,00 + 3×5,80 + 1×5,00 = 46,40', async () => {
    const doc = await openBill();

    expect(doc.receipt!.total, 'in minor units, as the document contract wants (ADR-0400)').toBe(4640);
    expect(doc.receipt!.decimals).toBe(2);
    expect(doc.receipt!.lines, 'one document line per cart line').toHaveLength(3);
    expect(doc.receipt!.lines[1]).toMatchObject({ name: 'Caña', qty: 3, unit_price: 580, total: 1740 });
    expect(doc.shadowRoot!.textContent, 'and the total is PAINTED').toContain('46.40');
  });

  it('says whose bill it is, so the waiter does not mix up tables', async () => {
    const doc = await openBill();
    expect(doc.receipt!.customer).toBe('Mesa 4');
    expect(doc.shadowRoot!.textContent).toContain('Mesa 4');
  });

  it('warns on the document that it is NOT an invoice, in the hub language', async () => {
    const doc = await openBill();
    expect(doc.receipt!.footer).toBe(esLocale.ui.prebillNotice);
    expect(doc.shadowRoot!.textContent).toContain('no es una factura');
  });

  it('carries NO fiscal series and NO VeriFactu QR (ADR-0141: both are consumed on payment)', async () => {
    const doc = await openBill();
    expect(doc.receipt!.number, 'the series is consumed when charging, not now').toBeFalsy();
    expect(doc.receipt!.qr, 'there is no billing record yet').toBeFalsy();
    expect(doc.receipt!.payment, 'nothing has been charged yet').toBeUndefined();
  });

  it('speaks SPANISH on a Spanish hub — no ok-receipt English defaults leaking in', async () => {
    const doc = await openBill();
    const painted = doc.shadowRoot!.textContent || '';

    // ok-receipt merges its own English DEFAULT_LABELS unless the module hands over its catalog.
    // Without `.labels` the bill read «Item», «Amount», «TOTAL» next to «Mesa 4» and «Cuenta».
    expect(doc.labels?.total, 'labels come from the module catalog (ADR-0055)').toBe(esLocale.ui.docTotal);
    expect(doc.labels?.item).toBe(esLocale.ui.docItem);
    // The empty state too: it is the very string QA saw in English.
    expect(doc.labels?.empty).toBe(esLocale.ui.docEmpty);
    expect(painted, 'the column header is translated').toContain(esLocale.ui.docItem);
    expect(painted, 'no English default on a Spanish hub').not.toContain('Amount');
  });

  it('an empty cart still speaks Spanish instead of «No receipt data.»', async () => {
    const doc = await openBill([]);
    expect(doc.labels?.empty).toBe('Sin datos de tiquet.');
  });
});
