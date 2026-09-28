// sales#423 — on a very low phone, or any phone on its side, the open check shows its total and
// Charge without scrolling.
//
// After sales#420 the drawer spans what the shell shows, but that is little: 291 px on a 320×568
// with the «You can't invoice yet» strip, 210–232 px on a phone on its side (640×360, 667×375),
// 170 px on a 568×320. The check's header (park, open checks, name, «Served by», table/customer)
// took ~145 px and the foot (total + Charge) ~125–139 px, so the drawer scrolled as a whole and
// Charge sat below its bottom edge: to charge, the cashier first had to scroll the check. And a
// phone on its side wider than 820 px (844×390, 932×430) still got the tablet layout, whose cart
// column is laid out in the shell's 480 px floor: its foot sat under the tab bar until the shell
// was scrolled. Measured on hub:stable, ios and md (the PR).
//
// What Square and Toast do on a phone: Charge is pinned, the header shrinks to one row. So:
//
//   1. a phone on its side (a screen no taller than 500 px) gets the phone till — catalogue and
//      the check as a drawer — whatever its width;
//   2. in the drawer, the foot is pinned to its bottom (sticky): when the check does not fit, what
//      scrolls is the header and the lines, never the total and Charge;
//   3. a LOW drawer (a size container no taller than 24rem) compacts: a thinner toolbar, the name
//      and the chips on one row, a thinner foot — so the first line is seen whole too;
//   4. a low drawer wide enough (a phone on its side) lays the foot in ONE row: total, then the
//      actions.
//
// happy-dom evaluates media queries against its viewport, so 1 and 2 are pinned on the computed
// style; it does not evaluate container queries nor lay out, so 3 and 4 pin the DECLARED contract
// inside the @container blocks, as the other style contracts of this component do. That it really
// fits is measured in a browser (the PR).
import { afterEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

type HappyWindow = Window & { happyDOM?: { setViewport(v: { width: number; height: number }): void } };

async function mountAt(width: number, height: number): Promise<ShadowRoot> {
  (window as HappyWindow).happyDOM?.setViewport({ width, height });
  installPosDouble({});
  const el = document.createElement('erp-pos-touch') as HTMLElement & { updateComplete: Promise<unknown> };
  document.body.innerHTML = '';
  document.body.appendChild(el);
  await el.updateComplete;
  return el.shadowRoot!;
}

function computed(root: ShadowRoot, selector: string): CSSStyleDeclaration {
  const node = root.querySelector(selector);
  expect(node, `${selector} is rendered`).toBeTruthy();
  return getComputedStyle(node as Element);
}

/** The CSS the component declares (Lit's `static styles`). */
function posCss(): string {
  const ctor = customElements.get('erp-pos-touch') as unknown as {
    styles: { cssText: string } | Array<{ cssText: string }>;
  };
  return [ctor.styles].flat().map((s) => s.cssText).join('\n');
}

/** The bodies of the at-rule blocks whose prelude matches, cut by counting braces — a rule written
 *  outside the block must not pass as if it were inside. */
function blocks(css: string, prelude: RegExp): string[] {
  const out: string[] = [];
  const opening = new RegExp(`@(?:container|media)\\s*([^{]*)\\{`, 'g');
  for (let m = opening.exec(css); m; m = opening.exec(css)) {
    if (!prelude.test(m[1])) continue;
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    out.push(css.slice(start, i - 1));
  }
  return out;
}

/** Every declaration block of exactly this selector inside `css`, joined. */
function rules(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]()*+]/g, '\\$&');
  return (css.match(new RegExp(`(?:^|[\\s},])${escaped}\\s*\\{[^}]*\\}`, 'g')) ?? []).join('\n');
}

/** The value (in rem) of the last `prop:` declared in `css`, or NaN. A bare `0` is 0rem. */
function rem(css: string, prop: string): number {
  const all = [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*(?:([\\d.]+)rem|0(?=\\s*(?:;|}|$)))`, 'g'))];
  return all.length ? Number(all[all.length - 1][1] ?? 0) : Number.NaN;
}

const LOW = /pos-cart\s*\(\s*max-height:\s*24rem\s*\)\s*$/;
const LOW_WIDE = /pos-cart\s*\(\s*max-height:\s*24rem\s*\)\s*and\s*\(\s*min-width:\s*26rem\s*\)/;

afterEach(() => {
  document.body.innerHTML = '';
  (window as HappyWindow).happyDOM?.setViewport({ width: 1024, height: 768 });
});

describe('a phone on its side gets the phone till (sales#423)', () => {
  for (const [w, h] of [[844, 390], [932, 430], [740, 360]]) {
    it(`${w}×${h}: the check is a drawer behind the cart button, not a column under the tab bar`, async () => {
      const root = await mountAt(w, h);
      expect(computed(root, '[data-testid="pos-cart-fab"]').display, 'the cart button is there').toBe('inline-flex');
      expect(computed(root, '.cart').position, 'the check is the drawer').toBe('absolute');
    });
  }

  it('844×390: the catalogue takes the whole width and the drawer is a phone drawer, as on a phone held upright', async () => {
    // Without its own block, the tablet rules written after the phone block (two columns, the check
    // 23rem wide) won again: a 390 px tall screen got a catalogue squeezed next to an empty column.
    const upright = await mountAt(390, 844);
    const want = {
      columns: computed(upright, '.body').gridTemplateColumns,
      pad: computed(upright, '.grid').paddingBottom,
    };
    const root = await mountAt(844, 390);
    expect(computed(root, '.body').gridTemplateColumns, 'one column: the catalogue').toBe(want.columns);
    expect(computed(root, '.cart').position, 'the check is the drawer').toBe('absolute');
    expect(computed(root, '.grid').paddingBottom, 'the last tiles clear the cart button').toBe(want.pad);
    expect(want.columns.trim().split(/\s+/), 'a single track').toHaveLength(1);
  });

  it('844×390: the drawer is as wide as on a phone held upright', () => {
    // happy-dom does not compute min(): the declared width is compared, block against block.
    const widthIn = (prelude: RegExp) => {
      const all = [...rules(blocks(posCss(), prelude).join('\n'), '.cart').matchAll(/(?:^|[;{\s])width:\s*([^;}]+)/g)];
      return all.length ? all[all.length - 1][1].trim() : '';
    };
    const upright = widthIn(/^\(max-width:\s*820px\)\s*$/);
    expect(upright, 'the phone drawer declares its width').not.toBe('');
    expect(widthIn(/^\(min-width:\s*821px\) and \(max-height:\s*500px\)/)).toBe(upright);
  });

  for (const [w, h] of [[1024, 768], [1280, 800], [834, 1112]]) {
    it(`${w}×${h}: a tablet keeps the check as a column`, async () => {
      const root = await mountAt(w, h);
      expect(computed(root, '[data-testid="pos-cart-fab"]').display).toBe('none');
      expect(computed(root, '.cart').position).not.toBe('absolute');
    });
  }
});

describe('in the drawer, the total and Charge are pinned to its bottom (sales#423)', () => {
  it('the foot sticks to the bottom of the drawer, so what scrolls is the header and the lines', async () => {
    const root = await mountAt(390, 667);
    const foot = computed(root, '.cart ion-footer');
    expect(foot.position, 'in flow, it scrolled away with the drawer').toBe('sticky');
    expect(foot.bottom).toBe('0px');
    expect(foot.zIndex, 'above the lines scrolling under it').toBe('1');
  });

  it('the drawer is the size container the compact rules measure', async () => {
    const drawer = blocks(posCss(), /^not all and \(min-width:\s*821px\) and \(min-height:\s*501px\)/).join('\n');
    const cart = rules(drawer, '.cart');
    expect(cart, 'a named size container: its height is what the shell shows').toMatch(/container:\s*pos-cart\s*\/\s*size/);
  });

  it('a tablet column is no container and has no sticky foot (it never scrolls as a whole)', async () => {
    const root = await mountAt(1280, 800);
    expect(computed(root, '.cart ion-footer').position).not.toBe('sticky');
  });
});

describe('a low drawer compacts its header and foot (sales#423)', () => {
  it('declares the low-drawer block', () => {
    expect(blocks(posCss(), LOW), '@container pos-cart (max-height: 24rem)').toHaveLength(1);
  });

  it('the toolbar is thinner, still a finger tall', () => {
    const low = blocks(posCss(), LOW).join('\n');
    const bar = rem(rules(low, '.order-toolbar'), 'min-height');
    expect(bar, 'thinner than the 3.6rem of the tall drawer').toBeLessThan(3.6);
    expect(bar, 'a 44 px touch target').toBeGreaterThanOrEqual(2.75);
    expect(rem(rules(low, '.cart ion-toolbar'), '--min-height')).toBe(bar);
    expect(rem(rules(low, 'ion-button.header-action'), 'height'), 'the header buttons fit the thinner bar (3.05rem)')
      .toBeLessThan(3.05);
  });

  it('the name and the chips share one row, the chips scrolling sideways instead of wrapping', () => {
    const low = blocks(posCss(), LOW).join('\n');
    const heading = rules(low, '.order-heading');
    expect(heading).toMatch(/display:\s*flex/);
    expect(heading).toMatch(/align-items:\s*center/);
    expect(rem(heading, 'padding-top') + rem(heading, 'padding-bottom'), 'thinner than .62 + .58').toBeLessThan(1.2);
    // Measured at 320 px: with the title allowed to shrink, the chips left «Cue» of «Cuenta nueva».
    const basis = rules(low, '.order-title-row').match(/flex:\s*1\s+0\s+([\d.]+)rem/);
    expect(basis, 'the name grows and never shrinks under its basis: the chips scroll instead').not.toBeNull();
    expect(Number(basis![1]), 'room for «Cuenta nueva»').toBeGreaterThanOrEqual(6);
    expect(rules(low, '.order-title-row'), 'a long name ellipsizes instead of pushing the chips out').toMatch(/min-width:\s*0/);
    expect(rules(low, '.order-context > *'), 'a chip keeps its size: the row scrolls, the chip is not squeezed')
      .toMatch(/flex:\s*none/);
    const context = rules(low, '.order-context');
    expect(context).toMatch(/flex-wrap:\s*nowrap/);
    expect(context).toMatch(/overflow-x:\s*auto/);
    expect(context, 'it can shrink next to the name').toMatch(/min-width:\s*0/);
    expect(context, 'no second-row gap').toMatch(/margin-top:\s*0/);
  });

  it('the filler «No table or customer» gives its room to the name', () => {
    const low = blocks(posCss(), LOW).join('\n');
    expect(rules(low, '.context-empty')).toMatch(/display:\s*none/);
  });

  it('a line shows its NAME at the top of its card, not centred below what the drawer shows', () => {
    // The card of a line is ~105 px (amount, three actions, stepper) and ion-item centres its label:
    // in the ~80 px a low drawer leaves, the amount showed and the product name did not.
    const low = blocks(posCss(), LOW).join('\n');
    expect(rules(low, 'ion-list.lines ion-item')).toMatch(/align-items:\s*flex-start/);
  });

  it('Charge keeps its amount on one line: narrower side buttons, no card icon, no wrapping', () => {
    // Measured at 320 px: «Charge · 45,50 €» broke in two and made the foot 116-122 px.
    const low = blocks(posCss(), LOW).join('\n');
    expect(rem(rules(low, '.foot-actions .ticket-discount, .foot-actions .prebill'), 'width'), 'still a 44 px target')
      .toBeGreaterThanOrEqual(2.75);
    expect(rem(rules(low, '.foot-actions .ticket-discount, .foot-actions .prebill'), 'width'), 'narrower than 3.25rem')
      .toBeLessThan(3.25);
    expect(rules(low, '.foot-actions .charge ion-icon')).toMatch(/display:\s*none/);
    expect(rules(low, '.foot-actions .charge')).toMatch(/white-space:\s*nowrap/);
  });

  it('the kitchen tabs are thinner too', () => {
    const low = blocks(posCss(), LOW).join('\n');
    expect(rem(rules(low, 'ion-segment.view-tabs ion-segment-button'), 'min-height')).toBeLessThan(2.85);
    const tabs = rules(low, 'ion-segment.view-tabs');
    expect(rem(tabs, 'margin-top') + rem(tabs, 'margin-bottom'), 'less room around them than .62 + .28').toBeLessThan(0.9);
  });

  it('the foot is thinner: less padding, a smaller total, Charge still a finger tall', () => {
    const low = blocks(posCss(), LOW).join('\n');
    const foot = rules(low, '.cart-foot');
    expect(rem(foot, 'padding-top') + rem(foot, 'padding-bottom'), 'thinner than .62 + .7').toBeLessThan(1.32);
    expect(rem(rules(low, '.total b'), 'font-size'), 'smaller than 1.55rem').toBeLessThan(1.55);
    expect(rem(rules(low, '.total'), 'margin-bottom'), 'less than .5rem under the total').toBeLessThan(0.5);
    expect(rem(rules(low, '.foot-actions .charge'), 'min-height'), 'a 44 px touch target').toBeGreaterThanOrEqual(2.75);
  });
});

describe('a low and wide drawer lays the foot in one row (sales#423)', () => {
  it('total first, then the actions, on one row', () => {
    const wide = blocks(posCss(), LOW_WIDE).join('\n');
    const foot = rules(wide, '.cart-foot');
    expect(foot).toMatch(/display:\s*flex/);
    expect(foot).toMatch(/align-items:\s*center/);
    expect(foot, 'a ticket discount row still takes its own line').toMatch(/flex-wrap:\s*wrap/);
    expect(foot, 'the total does not touch the actions').toMatch(/gap:\s*[\d.]+rem\s+[\d.]+rem/);
    expect(rules(wide, '.ticket-discount-row')).toMatch(/flex-basis:\s*100%/);
    const total = rules(wide, '.total');
    expect(total, 'the label over the amount, not beside it').toMatch(/flex-direction:\s*column/);
    expect(total).toMatch(/margin:\s*0/);
    expect(total, 'the label and the amount aligned left, not stretched').toMatch(/align-items:\s*flex-start/);
    const actions = rules(wide, '.foot-actions');
    expect(actions, 'the actions take the rest of the row').toMatch(/flex:\s*1\s+1\s+0/);
    expect(actions, 'and shrink to it, Charge never overflowing the drawer').toMatch(/min-width:\s*0/);
  });
});

describe('Charge fits a low drawer whatever the amount (sales#423)', () => {
  // Measured at 320 px: on one line, «Charge · 45,50 €» ran 9 px (ios) to 41 px (md, uppercase)
  // past the drawer's edge, and a four-figure amount would not fit on a phone on its side either.
  // The amount is what is still OWED (it differs from the total once some lines are paid), so it
  // is not hidden: the label and the amount are stacked on two tight lines inside the same 44 px.
  it('the button holds its label and its amount as two pieces, and still reads «Charge · amount»', async () => {
    const root = await mountAt(390, 667);
    const charge = root.querySelector('[data-testid="pos-charge"]')!;
    const label = charge.querySelector('.charge-text .charge-label');
    const amount = charge.querySelector('.charge-text .charge-amount');
    expect(label?.textContent, 'the label').toBe('ui.charge');
    expect(amount?.textContent, 'the amount owed').toMatch(/\d/);
    expect(charge.querySelector('.charge-text')!.textContent, 'one reading for tests and screen readers')
      .toBe(`${label!.textContent} · ${amount!.textContent}`);
  });

  it('a low drawer stacks them: the label over the amount, no separator, each on one line', () => {
    const low = blocks(posCss(), LOW).join('\n');
    const text = rules(low, '.foot-actions .charge .charge-text');
    expect(text).toMatch(/display:\s*flex/);
    expect(text).toMatch(/flex-direction:\s*column/);
    const lh = text.match(/line-height:\s*([\d.]+)/);
    expect(lh, 'tight lines: two of them fit the 44 px button').not.toBeNull();
    expect(Number(lh![1])).toBeLessThanOrEqual(1.15);
    expect(rules(low, '.foot-actions .charge .charge-sep')).toMatch(/display:\s*none/);
    expect(rem(rules(low, '.foot-actions .charge .charge-label'), 'font-size'), 'the label smaller than the amount')
      .toBeLessThan(0.9);
    expect(rules(low, '.foot-actions .charge'), 'the button shrinks to its cell').toMatch(/min-width:\s*0/);
    // Measured on ios: its 13 px of vertical padding around the two ~30 px lines made the button
    // 56 px and the foot 11 px taller, which hid the first line on a 640×360.
    const charge = rules(low, '.foot-actions .charge');
    expect(rem(charge, '--padding-top') + rem(charge, '--padding-bottom'), 'two lines + padding within 2.75rem')
      .toBeLessThanOrEqual(0.5);
  });
});

// sales#432 — a phone on its side under the «You can't invoice yet» strip leaves a drawer of
// 131-193 px (568×320, 667×375; 170 px on a 568×320 without the strip). The low block above still
// spends ~105 px on the header (toolbar, then the name and chips) and ~67 px on the foot, so the
// first line of the check sat under the foot: the cashier did not see what was being charged
// without scrolling. Square and Toast leave ONE bar on a phone: the name of the check and its
// icons. So a VERY low drawer (no taller than 13rem) lays the header in one row — the name first,
// the icons after it, the close button icon-only — trims the foot to Charge's height and the air
// above the first line. Measured on hub:stable in ios and md (the PR): the name of the first line
// shows whole at 667×375 and 568×320, with and without the strip.
const VERY_LOW = /pos-cart\s*\(\s*max-height:\s*13rem\s*\)\s*$/;

describe('a very low drawer shows the first line of the check without scrolling (sales#432)', () => {
  const veryLow = () => blocks(posCss(), VERY_LOW).join('\n');

  it('declares the very-low block once, AFTER the low ones, so it wins where they tie', () => {
    const css = posCss();
    expect(blocks(css, VERY_LOW), '@container pos-cart (max-height: 13rem)').toHaveLength(1);
    const at = (re: RegExp) => [...css.matchAll(/@container\s*([^{]*)\{/g)].findIndex((m) => re.test(m[1]));
    const order = [...css.matchAll(/@container\s*([^{]*)\{/g)].map((m) => m[1].trim());
    expect(at(VERY_LOW), `order: ${order.join(' | ')}`).toBeGreaterThan(at(LOW));
    expect(at(VERY_LOW)).toBeGreaterThan(at(LOW_WIDE));
  });

  it('the header is one row: the name first, then the icons', () => {
    const css = veryLow();
    const header = rules(css, '.cart ion-header');
    expect(header).toMatch(/display:\s*flex/);
    expect(header).toMatch(/align-items:\s*center/);
    expect(header, 'the kitchen tabs still get a row of their own').toMatch(/flex-wrap:\s*wrap/);
    const heading = rules(css, '.order-heading');
    expect(heading, 'the name of the check leads the bar, as on Square and Toast').toMatch(/order:\s*-1/);
    expect(heading, 'it takes what the icons leave').toMatch(/flex:\s*1\s+1\s+0/);
    expect(heading, 'and can shrink to it').toMatch(/min-width:\s*0/);
    expect(heading, 'no rule between the name and the icons of the same row').toMatch(/border-bottom:\s*0/);
    expect(heading, 'the toolbar sets the height of the row').toMatch(/padding-top:\s*0;/);
    expect(heading).toMatch(/padding-bottom:\s*0;/);
    const toolbar = rules(css, '.cart ion-toolbar');
    expect(toolbar, 'the icons keep their size').toMatch(/flex:\s*none/);
    expect(toolbar, 'as wide as its icons, not the whole row').toMatch(/width:\s*auto/);
    // ios pads a toolbar 4px above and below: the bar was 49 px for 38 px buttons.
    expect(toolbar).toMatch(/--padding-top:\s*0/);
    expect(toolbar).toMatch(/--padding-bottom:\s*0/);
    // sales#433 superseded «the kitchen tabs wrap to the next row»: that second row (~50 px) was
    // what still hid the first line with Kitchen installed. They sit in the bar now (see below).
    expect(rules(css, 'ion-segment.view-tabs'), 'the kitchen tabs no longer take a row of their own').not.toMatch(/flex:\s*1\s+1\s+100%/);
  });

  it('the close button is icon-only (its name stays in aria-label) and no taller than the bar', async () => {
    const css = veryLow();
    // As specific as the base rule that shows it (ion-button.header-action small { display:block }):
    // `.cart-close small` lost to it and «> C…» stayed squeezed into the 2.4rem button.
    expect(rules(posCss(), 'ion-button.header-action small'), 'the base rule it overrides').toMatch(/display:\s*block/);
    expect(rules(css, 'ion-button.header-action.cart-close small')).toMatch(/display:\s*none/);
    const close = rules(css, 'ion-button.header-action.cart-close');
    const h = rem(close, 'height');
    expect(h, 'the icons next to it are 2.4rem').toBeLessThanOrEqual(2.4);
    // ios gives a button with a label min-height 3.1em (52 px here): height alone left it at 52.
    expect(rem(close, 'min-height')).toBe(h);
    const root = await mountAt(568, 320);
    expect(root.querySelector('[data-testid="pos-cart-close"]')?.getAttribute('aria-label')).toBe('ui.closeAction');
  });

  it('less air above the first line', () => {
    const css = veryLow();
    expect(rules(css, '.cart ion-content.cart-body')).toMatch(/--padding-top:\s*0/);
    expect(rules(css, 'ion-list.lines')).toMatch(/padding-top:\s*0/);
    expect(rem(rules(css, 'ion-list.lines ion-item:first-child'), 'margin-top'), 'less than .35rem').toBeLessThan(0.35);
    // ion-label takes 10 px above the name in ios (11 in md).
    expect(rem(rules(css, 'ion-list.lines ion-item ion-label'), 'margin-top'), 'less than 10 px').toBeLessThan(0.6);
  });

  it('the foot is as tall as Charge: the total beside its label, no margins around the buttons', () => {
    const css = veryLow();
    const foot = rules(css, '.cart-foot');
    expect(rem(foot, 'padding-top') + rem(foot, 'padding-bottom'), 'thinner than .4 + .45').toBeLessThanOrEqual(0.4);
    const total = rules(css, '.total');
    expect(total, '«Total 1,80 €» on one line, not the label over the amount').toMatch(/flex-direction:\s*row/);
    expect(total).toMatch(/align-items:\s*baseline/);
    // ios puts 4 px above and below every ion-button: the actions row was 52 px for 44 px buttons.
    const buttons = rules(css, '.foot-actions ion-button');
    expect(buttons).toMatch(/margin-top:\s*0/);
    expect(buttons).toMatch(/margin-bottom:\s*0/);
  });
});

// sales#433 — with Kitchen installed the check has two tabs, «Account / Current order», on a row of
// their own (~50 px) under the name. That row alone hid the first line of the check in every phone
// drawer measured but the tallest: 390×667 under the «You can't invoice yet» strip, 320×568 with
// it, and a phone on its side (667×375, 844×390, 568×320). The cashier saw the total and Charge
// but not WHAT was being charged. And upright, the card of a line (~177 px: amount, three actions,
// stepper) centred the product name under the foot.
//
// Square and Toast keep one bar on a phone: the check's name and its controls as icons. So in a
// low drawer the tabs are an icon pair (their names in aria-label, the pending count still on
// them) on the row of the check's name, and in any phone drawer a line shows its name at the top of
// its card. Measured on hub:dev + kitchen in ios and md (the PR): the first line's name shows at
// 390×667, 320×568, 667×375, 844×390 and 568×320, with and without the strip.
const KITCHEN_ROW = /pos-cart\s*\(\s*max-height:\s*28rem\s*\)\s*$/;
const KITCHEN_PRODUCTS = [{ id: 'p-1', name: 'Café', sku: 'CAF', price: 180, is_active: 1, tax_category_key: 'product.generic' }];

type Pos = HTMLElement & { updateComplete: Promise<unknown>; queue<T>(t: () => Promise<T>): Promise<T> };

/** The till with Kitchen installed (it fills sales.pos.actions) and one line still to fire. */
async function mountWithKitchenAt(width: number, height: number): Promise<ShadowRoot> {
  (window as HappyWindow).happyDOM?.setViewport({ width, height });
  const lines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: null,
    products: KITCHEN_PRODUCTS,
    rules: [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }],
    orderLines: () => lines.map((l) => ({ ...l })),
    loadSlot: (slot: string) => (slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire-433' }] : []),
    command: async (name: string) => {
      if (name === 'sales.order.open') {
        lines.push({ id: 'l1', product_id: 'p-1', product_name: 'Café', unit_price: 180, quantity: 1_000_000, tax_category_key: 'product.generic', fired_at: null, round_no: 0 });
        return { ok: true, new_ids: ['o1', 'l1'] };
      }
      return { ok: true };
    },
  });
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  return el.shadowRoot!;
}

describe('with Kitchen, a phone drawer shows the first line of the check (sales#433)', () => {
  it('each tab carries its icon, its name for screen readers, and the name as a text that can hide', async () => {
    const root = await mountWithKitchenAt(390, 667);
    const tabs = root.querySelector('[data-testid="pos-view-tabs"]');
    expect(tabs, 'the kitchen tabs are there').toBeTruthy();
    for (const [id, key] of [['pos-view-tab-account', 'ui.accountTab'], ['pos-view-tab-draft', 'ui.currentCommandTab']]) {
      const tab = root.querySelector(`[data-testid="${id}"]`)!;
      expect(tab.getAttribute('aria-label'), `${id}: named when only its icon shows`).toBe(key);
      expect(tab.querySelector('ion-icon.view-tab-icon')?.getAttribute('name'), `${id}: a literal icon`).toMatch(/-outline$/);
      expect(tab.querySelector('.view-tab-text')?.textContent?.trim(), `${id}: the visible name`).toBe(key);
    }
    const draft = root.querySelector('[data-testid="pos-view-tab-draft"]')!;
    const dot = draft.querySelector('.pending-dot');
    expect(dot?.textContent?.trim(), 'the pending count').toBe('1');
    expect(dot!.closest('.view-tab-text'), 'the count stays when the name hides').toBeNull();
  });

  it('the two tabs show different icons', async () => {
    const root = await mountWithKitchenAt(390, 667);
    const icon = (id: string) => root.querySelector(`[data-testid="${id}"] ion-icon.view-tab-icon`)?.getAttribute('name');
    expect(icon('pos-view-tab-account')).not.toBe(icon('pos-view-tab-draft'));
  });

  it('a tablet column keeps the tabs as words: the icons do not show outside a low drawer', () => {
    expect(rules(posCss(), '.view-tab-icon')).toMatch(/display:\s*none/);
  });

  it('upright, a line shows its NAME at the top of its card in the drawer (390×667 under the strip)', async () => {
    const root = await mountWithKitchenAt(390, 667);
    const item = root.querySelector('.cart ion-list.lines ion-item');
    expect(item, 'the line is in the check').toBeTruthy();
    expect(getComputedStyle(item as Element).alignItems, 'not centred under the foot').toBe('flex-start');
  });

  it('a tablet column keeps a line centred in its card', async () => {
    const root = await mountWithKitchenAt(1280, 800);
    const item = root.querySelector('.cart ion-list.lines ion-item');
    expect(item).toBeTruthy();
    expect(getComputedStyle(item as Element).alignItems).not.toBe('flex-start');
  });

  // 390×667 under the strip leaves a 385-391 px drawer: just over the 24rem of the low block, and
  // its full header (215 px) and foot (123 px) left the name of the line cut in two. So the tabs go
  // beside the name from 28rem down, before the rest of the header compacts.
  it('declares the kitchen-tabs block once, BEFORE the low ones, so they refine it', () => {
    const css = posCss();
    expect(blocks(css, KITCHEN_ROW), '@container pos-cart (max-height: 28rem)').toHaveLength(1);
    const order = [...css.matchAll(/@container\s*([^{]*)\{/g)].map((m) => m[1]);
    expect(order.findIndex((p) => KITCHEN_ROW.test(p)), order.join(' | ')).toBeLessThan(order.findIndex((p) => LOW.test(p)));
  });

  it('a drawer up to 28rem puts the tabs on the row of the check\'s name, as icons a finger wide', () => {
    const low = blocks(posCss(), KITCHEN_ROW).join('\n');
    const header = rules(low, '.cart ion-header');
    expect(header).toMatch(/display:\s*flex/);
    expect(header, 'the toolbar keeps its own row above').toMatch(/flex-wrap:\s*wrap/);
    expect(header).toMatch(/align-items:\s*center/);
    expect(rules(low, '.cart ion-toolbar'), 'the toolbar row is whole').toMatch(/flex:\s*1\s+1\s+100%/);
    const heading = rules(low, '.order-heading');
    expect(heading, 'the name takes what the tabs leave').toMatch(/flex:\s*1\s+1\s+0/);
    expect(heading).toMatch(/min-width:\s*0/);
    expect(heading, 'no rule between the name and the tabs of the same row').toMatch(/border-bottom:\s*0/);
    const tabs = rules(low, 'ion-segment.view-tabs');
    expect(tabs, 'the tabs keep their size next to the name').toMatch(/flex:\s*none/);
    // md lays the segment's columns out as minmax(auto, 360px): at its own width the pair took
    // 722 px and pushed the header icons to another row.
    expect(tabs, 'each column as wide as its icon, in md too').toMatch(/grid-auto-columns:\s*auto/);
    expect(rules(low, 'ion-segment.view-tabs ion-label, ion-segment.view-tabs .view-tab-icon'), 'no air around the icon')
      .toMatch(/margin-top:\s*0;\s*margin-bottom:\s*0/);
    expect(rules(low, 'ion-segment.view-tabs .view-tab-text'), 'the words hide').toMatch(/display:\s*none/);
    expect(rules(low, 'ion-segment.view-tabs .view-tab-icon'), 'the icons show').toMatch(/display:\s*(inline-)?block/);
    const button = rules(low, 'ion-segment.view-tabs ion-segment-button');
    expect(rem(button, 'min-width'), 'a 44 px touch target').toBeGreaterThanOrEqual(2.75);
    expect(rem(button, 'min-height'), 'as tall as the icons of the header').toBeGreaterThanOrEqual(2.4);
  });

  it('a very low drawer keeps the tabs in its one bar, after the name and before the icons', () => {
    const veryLow = blocks(posCss(), VERY_LOW).join('\n');
    const tabs = rules(veryLow, 'ion-segment.view-tabs');
    expect(tabs, 'beside the name (order -1, after it in the markup)').toMatch(/order:\s*-1/);
    expect(tabs).toMatch(/flex:\s*none/);
    expect(rules(veryLow, '.cart ion-toolbar'), 'the icons share the bar').toMatch(/flex:\s*none/);
    expect(tabs, 'no air above and below them: the bar is as tall as its buttons').toMatch(/margin-top:\s*0;\s*margin-bottom:\s*0/);
  });

  it('a very low drawer leaves no air above the first line (568×320 under the strip is 129-131 px)', () => {
    const veryLow = blocks(posCss(), VERY_LOW).join('\n');
    expect(rules(veryLow, 'ion-list.lines ion-item:first-child')).toMatch(/margin-top:\s*0/);
    expect(rem(rules(veryLow, 'ion-list.lines ion-item ion-label'), 'margin-top'), 'less than the .3rem of sales#432')
      .toBeLessThan(0.3);
  });
});
