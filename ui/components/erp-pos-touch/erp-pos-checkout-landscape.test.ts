// sales#324 — on a landscape tablet the pay sheet must show the payment method AND the keypad at
// once, without scrolling.
//
// What the QA saw on a 10" tablet (1280×800 dp) with a salon check: the sheet was one 24rem column,
// and the amount, the voucher row of the appointment's service and «Ticket / Invoice» filled the
// part that scrolls. Cash, Card and the keypad sat BELOW it, while the footer — always visible —
// already said «Type the amount tendered». The receptionist was told to type with nowhere to type,
// and on the device the drag did not reveal them either. Measured in a real browser on origin/main:
// the scrolling middle was 308 px tall for 720 px of content; Cash at y=540, key «1» at y=652, both
// outside it.
//
// The trade's answer (Square, Shopify POS, Lightspeed): a landscape tender screen in TWO columns —
// what the sale is (total, voucher per line, ticket or invoice) on one side, how it is paid
// (method, tendered, keypad) on the other, each with its own scroll. So:
//
//   1. the sheet splits its content into two groups, `.pay-side` and `.pay-tender`, and the method
//      buttons and the keypad belong to the TENDER group — never to the side that grows;
//   2. from 821 px wide (the breakpoint where the cart stops being a drawer) the sheet is a
//      two-column grid and the tender group is a column of its own that scrolls by itself;
//   3. «Ticket / Invoice» is laid out like the method buttons (two side by side), not stacked.
//
// happy-dom does not lay out nor evaluate media queries: 2 and 3 pin the DECLARED CSS contract, as
// erp-pos-scroll.test.ts does. That it really fits is measured in a browser (see the PR).
import { describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const PRODUCTS = [{ id: 'p-champu', name: 'Champú', price: 890, is_active: 1, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
}

async function openSheetOnCash(): Promise<Pos> {
  installPosDouble({ paymentMethods: METHODS, products: PRODUCTS, rules: RULES, byIdempotencyKey: [{ id: 'sale-1' }] });
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  const q = (id: string) => el.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  q('pos-product-p-champu')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  q('pos-charge')!.click();
  await el.updateComplete;
  q('pos-pay-method-pm-cash')!.click();
  await el.updateComplete;
  return el;
}

/** The CSS the component declares (Lit's `static styles`). */
async function posCss(): Promise<string> {
  await import('./erp-pos-touch');
  const ctor = customElements.get('erp-pos-touch') as unknown as {
    styles: { cssText: string } | Array<{ cssText: string }>;
  };
  return [ctor.styles].flat().map((s) => s.cssText).join('\n');
}

/** Every declaration of a selector, joined (the component redeclares it in layers). */
function rules(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]()]/g, '\\$&');
  return (css.match(new RegExp(`(?:^|[\\s},])${escaped}\\s*\\{[^}]*\\}`, 'g')) ?? []).join('\n');
}

/** The body of every `@media (min-width: 821px) { … }` block with NO upper bound, cut by counting
 *  braces — a rule written outside the query must not pass as if it were inside. */
function wideBlock(css: string): string {
  const blocks: string[] = [];
  const opening = /@media\s*\(min-width:\s*821px\)\s*\{/g;
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
  return blocks.join('\n');
}

describe('the pay sheet keeps the tender apart from what grows (sales#324)', () => {
  it('puts the payment methods and the keypad in the tender group, not in the side group', async () => {
    const el = await openSheetOnCash();
    const tender = el.shadowRoot.querySelector('.sheet .pay-tender');
    const side = el.shadowRoot.querySelector('.sheet .pay-side');
    expect(tender, 'the sheet has a tender group').not.toBeNull();
    expect(side, 'the sheet has a side group').not.toBeNull();
    for (const id of ['pos-pay-method-pm-cash', 'pos-pay-method-pm-card', 'pos-keypad-1', 'pos-keypad-0']) {
      expect(tender!.querySelector(`[data-testid="${id}"]`), `${id} lives in the tender group`).not.toBeNull();
    }
    expect(side!.querySelector('[data-testid="pos-doc-format-ticket"]'), 'ticket/invoice lives on the side').not.toBeNull();
    expect(side!.querySelector('[data-testid^="pos-keypad-"]'), 'no key on the side').toBeNull();
  });
});

describe('from 821 px the pay sheet is two columns (sales#324)', () => {
  it('turns the sheet into a two-column grid wider than the old single column', async () => {
    const wide = wideBlock(await posCss());
    const sheet = rules(wide, '.pay-sheet');
    expect(sheet).toMatch(/display:\s*grid/);
    expect(sheet).toMatch(/grid-template-columns:\s*minmax\(0(px)?,\s*1fr\)\s+minmax\(0(px)?,\s*1fr\)/);
    expect(sheet, 'wider than the 24rem of the phone sheet').toMatch(/width:\s*min\(100%,\s*46rem\)/);
  });

  it('lets the two groups be the grid items, each scrolling on its own', async () => {
    const wide = wideBlock(await posCss());
    expect(rules(wide, '.pay-sheet .pay')).toMatch(/display:\s*contents/);
    for (const group of ['.pay-side', '.pay-tender']) {
      const r = rules(wide, `.pay-sheet ${group}`);
      expect(r, `${group} has an area`).toMatch(/grid-area:/);
      expect(r, `${group} scrolls by itself`).toMatch(/overflow:\s*auto/);
      expect(r, `${group} can shrink into its row`).toMatch(/min-height:\s*0/);
    }
  });

  it('gives the tender column the full height between header and footer', async () => {
    const sheet = rules(wideBlock(await posCss()), '.pay-sheet');
    // head spans both; the total sits over the side; the tender runs from the total to the footer.
    expect(sheet).toMatch(/grid-template-areas:\s*"head head"\s*"top tender"\s*"side tender"\s*"foot foot"/);
  });
});

describe('ticket or invoice is laid out like the method buttons (sales#324)', () => {
  it('shows the two document buttons side by side', async () => {
    const r = rules(await posCss(), '.pay-docformat');
    expect(r).toMatch(/display:\s*grid/);
    expect(r).toMatch(/grid-template-columns:\s*repeat\(2,\s*1fr\)/);
  });
});

// rv-342 — the two-column grid is for the PAY sheet only. `.sheet` and `.pay` are shared by the
// discount, open-price, line-note, modifier and combo sheets: a bare `.sheet { display:grid }` in
// the wide block turned the open-price keypad into a right-hand column beside the amount and
// stretched the discount sheet to 46rem with its keypad in half of it (measured in Chromium at
// 1280×776 and 1440×900 on the branch; on main both were one 24rem column).
describe('the two-column grid touches the pay sheet only (sales#324, review)', () => {
  it('scopes every rule of the wide block to the pay sheet', async () => {
    const wide = wideBlock(await posCss());
    const selectors = [...wide.matchAll(/(?:^|[}\s])([^{}]+?)\s*\{/g)].map((m) => m[1].trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel, `«${sel}» must be scoped to the pay sheet`).toMatch(/^\.pay-sheet(\s|$|\.)/);
    }
  });

  it('marks the pay sheet, and only it, with the pay-sheet class', async () => {
    const el = await openSheetOnCash();
    const paySheet = el.shadowRoot.querySelector('[data-testid="pos-pay-scrim"] .sheet');
    expect(paySheet?.classList.contains('pay-sheet'), 'the pay sheet carries .pay-sheet').toBe(true);
    (el as unknown as { discountSheet?: { target: 'ticket' } }).discountSheet = { target: 'ticket' };
    await el.updateComplete;
    const discount = el.shadowRoot.querySelector('[data-testid="pos-discount-scrim"] .sheet');
    expect(discount, 'the discount sheet is open').not.toBeNull();
    expect(discount!.classList.contains('pay-sheet'), 'the discount sheet is NOT a pay sheet').toBe(false);
  });
});
