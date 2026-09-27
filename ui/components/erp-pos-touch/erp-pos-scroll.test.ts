// SCROLL contract of the product grid and anchoring of the cart footer (sales#178).
//
// Why this exists: with a restaurant's full menu (281 items) the POS was cut off whole -- nothing
// scrolled, about 14 tiles were reachable and CHARGE sat 10.000-20.000px below the viewport. The
// cause is pure CSS and it has TWO halves, both needed:
//
//   1. .body holds ONE implicit `auto` row, and an auto track is sized by its CONTENT: its base
//      size is .catalog's min-content, ~6.800px at 1440 and ~13.600px at 834 with that menu. So the
//      row itself grew to the height of the grid.
//   2. .catalog is a grid item, and a grid item's automatic minimum size is its content: without
//      min-height:0 it cannot shrink into the row even once the row is bounded.
//
// Either half alone leaves the screen broken -- measured, not assumed: with only min-height:0 the
// browser bench still reported the grid at 6777/6777 and CHARGE at y=6810. .grid never reached its
// own overflow:auto because its ancestor had already grown, aside.cart -- same row -- stretched
// with it and carried its ion-footer to the end of those 20.000px, and .card is overflow:hidden, so
// there was not even a scrollbar: the content simply did not exist for the cashier.
//
// happy-dom does NOT lay out and does not evaluate media queries: what is pinned here is the
// DECLARED CSS contract, the same way the other style contracts of this component are written. That
// the grid really scrolls and CHARGE really lands inside the viewport is verified in a browser.
import { describe, expect, it } from 'vitest';
import './erp-pos-touch';

/** The CSS the component declares (Lit's `static styles`). */
async function posCss(): Promise<string> {
  const ctor = customElements.get('erp-pos-touch') as unknown as {
    styles: { cssText: string } | Array<{ cssText: string }>;
  };
  return [ctor.styles].flat().map((s) => s.cssText).join('\n');
}

/** Every declaration of a selector, joined (the component redeclares it in layers). */
function rules(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]()]/g, '\\$&');
  return (css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, 'g')) ?? []).join('\n');
}

/**
 * The phone blocks -- where the cart becomes a drawer and the FAB appears: `(max-width: 820px)`,
 * and since sales#423 the phone till itself, `not all and (min-width: 821px) and (min-height:
 * 501px)` (narrow OR low, so a phone on its side gets it too).
 * They are cut by COUNTING BRACES: keeping "everything after the @media" would let a rule written
 * outside the media query pass, which is the opposite of what these tests mean to prove.
 */
function mobileBlock(css: string): string {
  const blocks: string[] = [];
  const opening = /@media(?:[^{]*\(max-width:\s*820px\)|\s*not all and \(min-width:\s*821px\) and \(min-height:\s*501px\))[^{]*\{/g;
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

describe('the product grid scrolls inside its own column (sales#178)', () => {
  it('the container chain can shrink: .body, .catalog and .cart all declare min-height:0', async () => {
    const css = await posCss();

    expect(rules(css, '.body'), '.body is the two-column grid and could already shrink')
      .toMatch(/min-height\s*:\s*0/);
    expect(
      rules(css, '.catalog'),
      '.catalog is a grid item: without min-height:0 its minimum is its content and it overflows the row',
    ).toMatch(/min-height\s*:\s*0/);
    expect(rules(css, '.cart'), '.cart already had it: its ion-footer anchors because the column does not grow')
      .toMatch(/min-height\s*:\s*0/);
  });

  // Measured in Chrome 151 on the real shell mount (ion-content > .outlet{height:100%} > WC) with
  // 281 items: min-height:0 on .catalog is NOT enough. Letting the ITEM shrink does not stop the
  // TRACK from growing -- the item just stretches to fill a 6.800px row. The row has to be bounded
  // explicitly: minmax(0,1fr) pins it to .body's own height, and only then does .grid reach its
  // overflow:auto and the cart's ion-footer stay on screen.
  it('the grid row is BOUNDED: it is not sized by the content of the grid', async () => {
    const css = await posCss();
    const body = rules(css, '.body');
    const rows = body.match(/grid-template-rows\s*:\s*([^;}]+)/);

    expect(rows, '.body declares its row instead of leaving it implicit (auto = height of the content)').toBeTruthy();
    expect(
      rows![1].replace(/\s+/g, ''),
      'minmax(0,1fr): minimum 0 (the row does not grow with the grid) and maximum the height of .body',
    ).toBe('minmax(0,1fr)');
  });

  it('.grid is the one that scrolls: overflow:auto', async () => {
    expect(rules(await posCss(), '.grid'), 'the grid keeps the catalogue scroll to itself')
      .toMatch(/overflow\s*:\s*auto/);
  });

  it('the card still clips: the scroll lives inside it, not in the page', async () => {
    expect(rules(await posCss(), '.card')).toMatch(/overflow\s*:\s*hidden/);
  });
});

// The cart FAB floats over the grid (position:absolute; bottom:1rem, 3.6rem a side) and at 390px it
// covered the price of the tile underneath -- the last item of the menu cannot be read. Square and
// Toast reserve that room at the end of the list instead of letting the button cover content. It
// only applies where the FAB exists: the mobile block.
describe('the cart FAB does not cover the last row of tiles (sales#178)', () => {
  it('on mobile the grid reserves the room of the FAB below its content', async () => {
    const mobile = mobileBlock(await posCss());
    const grid = rules(mobile, '.grid');
    const padding = grid.match(/padding-bottom\s*:\s*([\d.]+)rem/);

    expect(padding, 'the mobile block declares the padding-bottom of the grid').toBeTruthy();
    expect(
      Number(padding![1]),
      'at least the height of the FAB (3.6rem) plus its gap to the edge (1rem)',
    ).toBeGreaterThanOrEqual(4.6);
  });

  it('the FAB is painted only in that block: on desktop there is nothing to dodge', async () => {
    const css = await posCss();
    expect(rules(css, '.fab'), 'hidden by default').toMatch(/display\s*:\s*none/);
    expect(rules(mobileBlock(css), '.fab'), 'and only the mobile block shows it')
      .toMatch(/display\s*:\s*inline-flex/);
  });
});
