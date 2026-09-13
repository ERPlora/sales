// sales#164 — THE AMOUNT ON THE «COBRAR» BUTTON IS THE SERVER'S, NOT THE SCREEN'S.
//
// The till used to add the ticket up itself (`cartTotal`) and hand the server legs of a mixed
// payment built on that number. The server refuses legs that do not add up to the cent
// (`sales.payments_do_not_match_total`), and it was right to: a sale whose legs do not add up is a
// drawer that ends the day short. Two ways the two numbers diverged, both real:
//
//   * a cent, on a prorated fixed discount, a quantity by weight or a goods combo split by rates;
//   * THE WHOLE VAT, on every single sale, when `default_tax_included = 0` — the button showed the
//     taxable base and the server charged base + quota.
//
// So the screen stops answering that question. `sales.checkout.preview` values the ticket with the
// SAME function that charges it, and this file is the contract that the till uses that answer —
// and that it degrades to its own arithmetic, never to a zero, when there is no answer.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];
const PRODUCTS = [{ id: 'p-1', name: 'Consultoría', price: 10_000, is_active: 1, tax_category_key: 'product.generic' }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
/** What `sales.checkout.preview` answers. `null` = the hub has no such command (older image). */
let previewAnswer: Record<string, unknown> | null = null;

function installSdk() {
  commands = [];
  let seq = 0;
  installPosDouble({
    paymentMethods: METHODS,
    products: PRODUCTS,
    rules: RULES,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.checkout.preview') {
        return previewAnswer ? { ok: true, operations: 0, result: previewAnswer } : { ok: true, operations: 0 };
      }
      return { ok: true, new_ids: [`x-${++seq}`] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: unknown[];
  tenders: unknown[];
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

/** Mounts the till with one 100,00 € line already in the cart and the charge sheet open. */
async function tillCharging(): Promise<Pos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  el.cart = [{ id: 'p-1', name: 'Consultoría', price: 10_000, qty: 1, line_id: 'l-1', tax_category_key: 'product.generic', tax_rate: 21 }];
  await el.updateComplete;
  el.openPay();
  await settle(el);
  return el;
}

/** Lets the preview round trip land and Lit repaint. */
async function settle(el: Pos) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

const chargeCta = (el: Pos) => el.shadowRoot.querySelector('.sheet-foot ion-button.charge')?.textContent ?? '';

/** 100,00 € of base at 21 %: the screen says 100,00 € and the server charges 121,00 €. */
const TAX_EXCLUDED_PREVIEW = {
  total: 12_100, subtotal: 10_000, tax_total: 2_100, discount_amount: 0, gift_total: 0,
  tax_included: false,
  lines: [{
    product_id: 'p-1', product_name: 'Consultoría', tax_category_key: 'product.generic',
    tax_rate: 21, quantity: 1_000_000, unit_price: 10_000,
    net_amount: 10_000, tax_amount: 2_100, line_total: 12_100,
    combo_group_ref: null, is_gift: false, covered: false,
  }],
  tax_breakdown: { '21.00': { base: 10_000, tax: 2_100, kind: 'tax' } },
};

beforeEach(() => {
  previewAnswer = null;
  installSdk();
  document.body.innerHTML = '';
});

describe('sales#164 — the authoritative total', () => {
  it('asks the server to value the ticket when the charge sheet opens', async () => {
    previewAnswer = TAX_EXCLUDED_PREVIEW;
    await tillCharging();
    const asked = commands.filter((c) => c.name === 'sales.checkout.preview');
    expect(asked, 'the till asks once, when it opens the sheet').toHaveLength(1);
    expect(asked[0].payload.items, 'and it asks about the SAME lines it will charge')
      .toMatchObject([{ product_id: 'p-1', price: 10_000, quantity: 1_000_000 }]);
  });

  it('with prices that EXCLUDE tax, «Cobrar» says what will be charged, not the base', async () => {
    previewAnswer = TAX_EXCLUDED_PREVIEW;
    const el = await tillCharging();
    expect(chargeCta(el), 'the screen said 100,00 € and the drawer took 121,00 €').toContain('121.00 €');
    expect(chargeCta(el)).not.toContain('100.00 €');
  });

  it('and so does the total at the top of the sheet', async () => {
    previewAnswer = TAX_EXCLUDED_PREVIEW;
    const el = await tillCharging();
    expect(el.shadowRoot.querySelector('.sheet .pay-total')?.textContent?.trim()).toBe('121.00 €');
  });

  it('the legs of a MIXED payment are built on the authoritative total', async () => {
    previewAnswer = TAX_EXCLUDED_PREVIEW;
    const el = await tillCharging();
    (el as unknown as { startSplit(): void }).startSplit();
    await el.updateComplete;
    // With nothing typed a leg covers the WHOLE remaining — which must be the server's 121,00 €.
    (el as unknown as { addTender(): void }).addTender();
    await el.updateComplete;
    expect((el.tenders as { amount: number }[])[0].amount,
      'a leg built on the screen preview would be 10000 and the sale would be refused').toBe(12_100);
  });

  it('WITHOUT an answer it falls back to its own arithmetic — never to a zero', async () => {
    previewAnswer = null; // a hub whose image predates the command
    const el = await tillCharging();
    expect(chargeCta(el), 'the till keeps charging with what it can compute').toContain('100.00 €');
    expect(el.shadowRoot.querySelector('.sheet .pay-total')?.textContent?.trim(),
      'a missing preview must never read as a free ticket').toBe('100.00 €');
  });

  it('re-values when the ticket changes while the sheet is open, and not otherwise', async () => {
    previewAnswer = TAX_EXCLUDED_PREVIEW;
    const el = await tillCharging();
    const asked = () => commands.filter((c) => c.name === 'sales.checkout.preview').length;
    const first = asked();
    await settle(el);
    expect(asked(), 'a repaint on its own is not a reason to re-value').toBe(first);

    el.cart = [...(el.cart as Record<string, unknown>[]), { id: 'p-1', name: 'Consultoría', price: 10_000, qty: 1, line_id: 'l-2' }];
    await settle(el);
    expect(asked(), 'a new line IS').toBe(first + 1);
  });

  it('the charge sends the SAME items the preview valued', async () => {
    previewAnswer = TAX_EXCLUDED_PREVIEW;
    const el = await tillCharging();
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    const previewed = commands.find((c) => c.name === 'sales.checkout.preview')!.payload.items;
    const charged = commands.find((c) => c.name === 'sales.complete_sale')!.payload.items;
    expect(charged, 'a preview of a different ticket is worse than no preview').toEqual(previewed);
  });
  it('the BILL taken to the table says the same number the drawer will take', async () => {
    // One cent of difference on purpose: that is exactly what separates the screen's arithmetic
    // from the charge when there is a prorated discount, a quantity by weight or a goods set menu
    // split across rates. Composing on screen would give 121.00 €; the hub charges 120.99 €.
    previewAnswer = {
      ...TAX_EXCLUDED_PREVIEW, total: 12_099, subtotal: 9_999,
      tax_breakdown: { '21.00': { base: 9_999, tax: 2_100, kind: 'tax' } },
    };
    const el = await tillCharging();
    (el as unknown as { paying: boolean }).paying = false;
    (el as unknown as { prebillOpen: boolean }).prebillOpen = true;
    await settle(el);
    const doc = (el.shadowRoot.querySelector('#prebill-doc') as unknown as { receipt?: { total?: number; subtotal?: number } })?.receipt;
    expect(doc?.total, 'the paper the customer checks says what will be charged').toBe(12_099);
    expect(doc?.subtotal).toBe(9_999);
  });

  it('with a line SELECTION the bill does NOT use the valuation: it priced something else', async () => {
    previewAnswer = { ...TAX_EXCLUDED_PREVIEW, total: 99_999, subtotal: 99_999 };
    const el = await tillCharging();
    (el as unknown as { paying: boolean }).paying = false;
    (el as unknown as { splitSel: Set<string> }).splitSel = new Set(['l-1']);
    (el as unknown as { prebillOpen: boolean }).prebillOpen = true;
    await settle(el);
    const doc = (el.shadowRoot.querySelector('#prebill-doc') as unknown as { receipt?: { total?: number } })?.receipt;
    expect(doc?.total, 'a total for a different set of lines would be worse than composing on screen')
      .not.toBe(99_999);
  });
  it('if the valuation FAILS, reopening the charge asks for it again', async () => {
    // Closing and reopening is what anyone does when a number does not show up. Without this the
    // ticket's signature stayed the same and the till never retried: it kept its own arithmetic
    // until somebody touched the check.
    previewAnswer = null;
    const el = await tillCharging();
    const asked = () => commands.filter((c) => c.name === 'sales.checkout.preview').length;
    const first = asked();
    expect(first).toBeGreaterThan(0);

    (el as unknown as { paying: boolean }).paying = false;
    await settle(el);
    previewAnswer = TAX_EXCLUDED_PREVIEW; // la red vuelve
    el.openPay();
    await settle(el);
    expect(asked(), 'the retry goes out').toBeGreaterThan(first);
    expect(chargeCta(el), 'and now the server rules').toContain('121.00 €');
  });
});
