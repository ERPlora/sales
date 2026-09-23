// sales#341 — on a phone (and a portrait tablet, below 821 px) the pay sheet must open ON the
// tender: the payment methods and the keypad in sight, without scrolling.
//
// Measured in a real browser on origin/main after sales#324, a salon check (appointment service
// with the voucher gap + a product), cash selected: at 390×844 the scrolling middle is 348 px tall
// for 708 px of content and key «1» sits at y=596, out of sight; with «Invoice» chosen even Cash
// and Card are gone (y=821). Meanwhile the fixed footer already says «enter the amount tendered on
// the keypad». Two columns cannot fit there, so the trade's answer (Square, Shopify POS) is the
// other one: what the sale IS — the voucher per line, ticket or invoice — folds into ONE summary
// line («Receipt · no voucher ›») that opens with a tap, and the sheet opens on how it is PAID.
//
//   1. with something to fold (a voucher gap or an invoice) the side group starts folded behind a
//      summary button, which says the document and the voucher state and toggles the group;
//   2. folding is CSS only: the voucher filler stays mounted, so a redemption already held keeps
//      its «undo» (the till reuses the same element — sales#162);
//   3. whatever the cashier MUST answer is never folded away: above the simplified-invoice ceiling,
//      or a charge blocked for the recipient, the side opens; choosing «Invoice» keeps it open;
//   4. each charge starts folded again;
//   5. the fold only exists below 821 px — from there sales#324's two columns show everything.
//
// happy-dom does not lay out nor evaluate media queries: 5 pins the DECLARED CSS contract, as
// erp-pos-checkout-landscape.test.ts does. That it really fits is measured in a browser (the PR).
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const PRODUCTS = [{ id: 'p-champu', name: 'Champú', price: 900, is_active: 1, tax_category_key: 'product.generic' }];
const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    duration_minutes: 45, category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];
const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

class FakeVoucherTender extends HTMLElement {
  customerId = '';
  serviceId = '';
  checkoutRef = '';
  lineRef = '';
}
if (!customElements.get('erp-fake-voucher')) customElements.define('erp-fake-voucher', FakeVoucherTender);

function installSdk(opts: { voucher?: boolean; fiscalLimits?: unknown[] } = {}) {
  const orderLines: Record<string, unknown>[] = [];
  let seq = 0;
  installPosDouble({
    paymentMethods: METHODS, products: PRODUCTS, rules: RULES,
    services: SERVICES, serviceCategories: [{ id: 'sc-pelo', name: 'Cabello' }],
    orderLines: () => orderLines, byIdempotencyKey: [{ id: 'sale-1' }],
    ...(opts.fiscalLimits ? { fiscalLimits: opts.fiscalLimits } : {}),
    loadSlot: (slot: string) => (opts.voucher !== false && slot === 'sales.pos.tender' ? [{ component: 'erp-fake-voucher' }] : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      if (name === 'sales.order.open' || name === 'sales.order.add_line') {
        const items = (payload.items as Record<string, unknown>[] | undefined) ?? [payload];
        const ids: string[] = name === 'sales.order.open' ? ['ord-1'] : [];
        for (const it of items) {
          const id = `line-${++seq}`;
          ids.push(id);
          orderLines.push({ id, product_id: it.product_id, product_name: it.product_name, quantity: it.quantity,
            unit_price: it.price ?? it.unit_price, line_total: it.line_total ?? it.price,
            tax_category_key: it.tax_category_key, is_service: it.is_service ? 1 : 0 });
        }
        return { ok: true, new_ids: ids };
      }
      return { ok: true, new_ids: [`x-${++seq}`] };
    },
  } as never);
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
  paying: boolean;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const byId = (el: Pos, id: string) => $(el, `[data-testid="${id}"]`);
const side = (el: Pos) => $(el, '.pay-sheet .pay-side');
const summary = (el: Pos) => byId(el, 'pos-pay-side-summary');

async function settle(el: Pos) {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

async function addByName(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((c) => c.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile named ${name}`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

/** The QA's check: a haircut from the appointment + a shampoo, a customer, the pay sheet on cash. */
async function checkout(names = ['Corte de señora', 'Champú'], customer = true): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await settle(el);
  for (const n of names) await addByName(el, n);
  if (customer) {
    el.dispatchEvent(new CustomEvent('erp:customer-context', { detail: { customer_id: 'cust-1', customer_name: 'Ana' } }));
  }
  await settle(el);
  el.openPay();
  await settle(el);
  byId(el, 'pos-pay-method-pm-cash')?.click();
  await settle(el);
  return el;
}

async function tap(el: Pos, node: HTMLElement | null) {
  expect(node, 'the control is on screen').not.toBeNull();
  node!.click();
  await settle(el);
}

beforeEach(() => { installSdk(); });

describe('the pay sheet opens on the tender, the voucher and ticket folded (sales#341)', () => {
  it('folds the side group behind a collapsed summary button', async () => {
    const el = await checkout();
    expect($(el, '.pay-side .tender-line'), 'control: the voucher row IS in the sheet').not.toBeNull();
    expect(summary(el), 'the summary lives in the side group').not.toBeNull();
    expect(side(el)!.contains(summary(el)), 'the summary heads the side group').toBe(true);
    expect(side(el)!.hasAttribute('data-folded'), 'the side group starts folded').toBe(true);
    expect(summary(el)!.getAttribute('aria-expanded')).toBe('false');
    expect(summary(el)!.tagName, 'a real button: reachable by keyboard and screen reader').toBe('BUTTON');
  });

  it('says the document chosen and the voucher state on its one line', async () => {
    const el = await checkout();
    const ticketLabel = byId(el, 'pos-doc-format-ticket')!.textContent!.trim();
    expect(summary(el)!.querySelector('[data-part="doc"]')?.textContent?.trim()).toBe(ticketLabel);
    expect(summary(el)!.querySelector('[data-part="voucher"]')?.getAttribute('data-state')).toBe('none');

    // A redemption held on the haircut line: the summary tells it without opening.
    $(el, '.tender-line[data-line="line-1"] erp-fake-voucher')!.dispatchEvent(new CustomEvent('erp:voucher-held', {
      bubbles: true, composed: true, detail: { redemptionId: 'red-1', packageId: 'pkg-1', lineRef: 'line-1', checkoutRef: 'ord-1' },
    }));
    await settle(el);
    expect(summary(el)!.querySelector('[data-part="voucher"]')?.getAttribute('data-state')).toBe('applied');
  });

  it('opens and folds again with a tap', async () => {
    const el = await checkout();
    await tap(el, summary(el));
    expect(summary(el)!.getAttribute('aria-expanded')).toBe('true');
    expect(side(el)!.hasAttribute('data-folded')).toBe(false);
    await tap(el, summary(el));
    expect(summary(el)!.getAttribute('aria-expanded')).toBe('false');
    expect(side(el)!.hasAttribute('data-folded')).toBe(true);
  });

  it('keeps the voucher filler mounted while folded, so a held redemption keeps its undo', async () => {
    const el = await checkout();
    const filler = $(el, '.tender-line[data-line="line-1"] erp-fake-voucher');
    expect(filler, 'the filler is mounted while folded').not.toBeNull();
    await tap(el, summary(el));
    expect($(el, '.tender-line[data-line="line-1"] erp-fake-voucher'), 'the SAME element, not a new one').toBe(filler);
  });

  it('starts folded again on the next charge', async () => {
    const el = await checkout();
    await tap(el, summary(el));
    await tap(el, byId(el, 'pos-pay-close'));
    el.openPay();
    await settle(el);
    expect(side(el)!.hasAttribute('data-folded')).toBe(true);
  });
});

describe('what the cashier must answer is never folded away (sales#341)', () => {
  it('keeps the side open when «Invoice» is chosen, so the recipient can be typed', async () => {
    const el = await checkout();
    await tap(el, summary(el));
    await tap(el, byId(el, 'pos-doc-format-invoice'));
    expect(side(el)!.hasAttribute('data-folded')).toBe(false);
    expect(byId(el, 'pos-invoice-recipient-capture'), 'the recipient capture is in sight').not.toBeNull();
  });

  it('does not fold the recipient away the moment «Invoice» makes the side foldable', async () => {
    installSdk({ voucher: false });
    const el = await checkout(['Champú'], false);
    expect(summary(el), 'control: nothing to fold on a plain ticket').toBeNull();
    await tap(el, byId(el, 'pos-doc-format-invoice'));
    expect(summary(el), 'now there is something to fold').not.toBeNull();
    expect(side(el)!.hasAttribute('data-folded')).toBe(false);
  });

  it('opens the side above the simplified-invoice ceiling, where the recipient is the law', async () => {
    installSdk({ fiscalLimits: [{ simplified_invoice_max_cents: 1_000 }] });
    const el = await checkout();
    expect(byId(el, 'pos-simplified-limit-capture'), 'control: the ceiling capture is shown').not.toBeNull();
    expect(side(el)!.hasAttribute('data-folded')).toBe(false);
  });

  it('unfolds when the charge is refused for the missing recipient', async () => {
    const el = await checkout();
    await tap(el, summary(el));
    await tap(el, byId(el, 'pos-doc-format-invoice'));
    await tap(el, summary(el));
    expect(side(el)!.hasAttribute('data-folded'), 'control: the cashier folded it').toBe(true);
    await el.confirm();
    await settle(el);
    expect(side(el)!.hasAttribute('data-folded'), 'the refusal shows what is missing').toBe(false);
  });

  it('has nothing to fold on a plain ticket with no voucher gap', async () => {
    installSdk({ voucher: false });
    const el = await checkout(['Champú'], false);
    expect(byId(el, 'pos-doc-format-ticket'), 'control: the ticket/invoice choice is shown').not.toBeNull();
    expect(summary(el), 'no summary for two buttons').toBeNull();
    expect(side(el)!.hasAttribute('data-folded')).toBe(false);
  });
});

/** The CSS the component declares (Lit's `static styles`). */
async function posCss(): Promise<string> {
  await import('./erp-pos-touch');
  const ctor = customElements.get('erp-pos-touch') as unknown as { styles: { cssText: string } | Array<{ cssText: string }> };
  return [ctor.styles].flat().map((s) => s.cssText).join('\n');
}

/** The bodies of every `@media (<query>) { … }` block, cut by counting braces. */
function mediaBlocks(css: string, query: RegExp): string[] {
  const blocks: string[] = [];
  const opening = new RegExp(`@media\\s*\\(${query.source}\\)\\s*\\{`, 'g');
  for (let m = opening.exec(css); m; m = opening.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

describe('the fold exists below 821 px only (sales#341)', () => {
  it('hides everything but the summary of a folded side group on a narrow screen', async () => {
    const narrow = mediaBlocks(await posCss(), /max-width:\s*820px/).join('\n');
    expect(narrow).toMatch(/\.pay-sheet\s+\.pay-side\[data-folded\]\s*>\s*:not\(\.pay-side-summary\)\s*\{[^}]*display:\s*none/);
    expect(narrow).toMatch(/\.pay-sheet\s+\.pay-side-summary\s*\{[^}]*display:\s*flex/);
  });

  // Folded, the tender still overran a 390×844 phone by 24 px (key «0» at y=542..585 under a
  // middle ending at 561): the 1rem of scrim around a 24rem card is exactly what was missing. The
  // pay sheet becomes a full-width bottom sheet there, like the park/staff dialogs already are.
  it('makes the pay sheet a full-width bottom sheet on a narrow screen', async () => {
    const narrow = mediaBlocks(await posCss(), /max-width:\s*820px/).join('\n');
    expect(narrow).toMatch(/\.scrim\.pay-scrim\s*\{[^}]*padding:\s*0[;\s}]/);
    expect(narrow).toMatch(/\.scrim\.pay-scrim\s*\{[^}]*align-items:\s*flex-end/);
    expect(narrow).toMatch(/\.pay-sheet\s*\{[^}]*width:\s*100%/);
  });

  it('marks the pay scrim, and only it, with the pay-scrim class', async () => {
    const el = await checkout();
    expect(byId(el, 'pos-pay-scrim')!.classList.contains('pay-scrim')).toBe(true);
    expect(el.shadowRoot.querySelectorAll('.pay-scrim').length).toBe(1);
  });

  it('never shows the summary nor folds anything from 821 px up', async () => {
    const css = await posCss();
    const outside = mediaBlocks(css, /max-width:\s*820px/).reduce((rest, block) => rest.split(block).join(''), css);
    expect(outside, 'the summary is hidden by default').toMatch(/\.pay-side-summary\s*\{[^}]*display:\s*none/);
    expect(outside, 'no fold rule outside the narrow block').not.toMatch(/data-folded\]/);
  });
});
