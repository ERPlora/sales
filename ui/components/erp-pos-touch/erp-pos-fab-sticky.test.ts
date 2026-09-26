// sales#418 — on a low phone the cart button must stay above the module tab bar.
//
// The shell gives every module screen a floor (hub#1730: `.outlet{min-height:480px}`) and lets its
// own scroller (ion-content) take over below it. With the «You can't invoice yet» strip up, a phone
// 667 px tall leaves ~408 px for the module: the till is laid out 480 px tall and scrolls under the
// tab bar. The cart button was `position:absolute` at the bottom of THAT box, so it sat under the
// tab bar (measured 614–672 against a tab bar at 601, ios and md, 390×667 and 320×568) until the
// cashier scrolled — the only way to the cart and its total was hidden.
//
// The fix keeps the button in the SHELL's visible area, whatever the height of the box: on a phone
// it is `position:sticky` against the shell scroller, parked at the end of the catalogue cell with
// the same 1rem gap it had. For sticky to see the shell scroller, `.card` must not be a scroll
// container itself: `overflow:clip` clips exactly like `hidden` (rounded corners, the closed cart
// drawer off to the right) without being one.
//
// happy-dom does not lay out, so these pin the computed CSS contract at a phone viewport; that it
// really stays above the tab bar is measured in a browser on the real shell (the PR).
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

afterEach(() => {
  document.body.innerHTML = '';
  (window as HappyWindow).happyDOM?.setViewport({ width: 1024, height: 768 });
});

describe('the cart button stays above the tab bar on a low phone (sales#418)', () => {
  it('on a phone the button sticks to the bottom of the SHELL scroller, 1rem off its edge', async () => {
    const root = await mountAt(390, 667);
    const fab = computed(root, '[data-testid="pos-cart-fab"]');

    expect(fab.display, 'the button only exists on a phone').toBe('inline-flex');
    expect(fab.position, 'absolute pins it to the bottom of a 480 px box the shell scrolls away').toBe('sticky');
    expect(fab.bottom, 'the sticky inset: 1rem above the visible bottom').toBe('16px');
  });

  it('it is parked in the catalogue cell, at its bottom-right corner, with the same 1rem gap', async () => {
    const root = await mountAt(390, 667);
    const fab = computed(root, '[data-testid="pos-cart-fab"]');
    const catalog = computed(root, '.catalog');

    // An in-flow grid item that is not placed takes a cell of its own: an implicit second row
    // would push the catalogue up and the button under it.
    // happy-dom keeps the shorthand as declared (it does not expand it into its longhands).
    expect(fab.gridArea, 'the button shares the catalogue cell').toBe('1 / 1');
    expect(catalog.gridArea, 'placed too, or auto-placement moves it to a new row').toBe('1 / 1');
    expect(fab.alignSelf, 'at the bottom of the cell, not its top').toBe('end');
    expect(fab.justifySelf, 'at the right of the cell, not stretched across it').toBe('end');
    expect(fab.marginBottom, 'same gap as the old bottom:1rem').toBe('16px');
    expect(fab.marginRight, 'same gap as the old right:1rem').toBe('16px');
  });

  it('the card clips without being a scroll container, so sticky reaches the shell scroller', async () => {
    const root = await mountAt(390, 667);
    const card = computed(root, '.card');

    expect(card.overflow, 'hidden makes .card the scroller sticky measures against — and it never scrolls').toBe('clip');
  });

  it('on a wide screen there is no button to move', async () => {
    const root = await mountAt(1280, 800);

    expect(computed(root, '[data-testid="pos-cart-fab"]').display).toBe('none');
  });
});
