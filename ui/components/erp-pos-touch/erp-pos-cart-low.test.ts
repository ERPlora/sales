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

/** The value (in rem) of the last `prop:` declared in `css`, or NaN. */
function rem(css: string, prop: string): number {
  const all = [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([\\d.]+)rem`, 'g'))];
  return all.length ? Number(all[all.length - 1][1]) : Number.NaN;
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
