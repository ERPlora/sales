// Where the till's SHEETS are anchored -- and why it is not the viewport (sales#314).
//
// The symptom, on a counter tablet: the cashier taps «Charge 18,00 €» at the foot of the payment
// sheet and the sale does not happen -- the app switches to the «Sales» tab instead. The tap never
// reaches the till: it lands on the shell's module tab bar, which is painted on top.
//
// The cause is one declaration. `.scrim` was `position:fixed; inset:0`, so it spanned the WHOLE
// VIEWPORT, and `.sheet` was capped at `max-height:88vh` and centred in it -- leaving 6vh (46px on
// the tablet, 54px on the phone) of clearance at the bottom. But a module does not own the
// viewport: the shell gives it the box between the topbar and the tab bar (AppPage mounts the WC
// inside `ion-content` with `fullscreen=false`, so the content area stops where the tab bar
// starts). The tab bar is taller than that clearance, so the foot of the sheet -- the CHARGE button
// -- was laid over it. And no z-index inside the module can help: the tab bar is not in this shadow
// tree, it is a later sibling in the shell's own layout.
//
// Anchoring the scrim to the module's OWN box instead fixes every sheet at once (payment, open
// price, modifiers, combo, note, discount all share `.scrim`/`.sheet`) and needs no number: it
// works for any device, any inset and any tab bar height -- which is the point, because a fixed px
// value is the bug in a family where the phone reserves 52 and the tablet 24.
//
// MEASURED in Chromium 141 headless on a shell-shaped mount (ion-header + ion-content[ion-padding]
// > .outlet{height:100%} > WC + ion-footer > ion-segment tab bar), driving the real cashier route
// (tap product -> cart -> Charge -> type the cash) and sampling the CHARGE button's rectangle with
// `elementFromPoint` through the shadow roots, 377 points:
//
//   tablet 1280x776, inset 24 doubled (what Android ships today, hub#1895)   0/377 reachable
//   tablet 1280x776, inset 24 once    (with hub#1895 fixed)                174/377 reachable
//   phone   426x900, inset 52 doubled                                        0/377 reachable
//   phone   426x900, inset 52 once                                        116/377 reachable
//
// The tablet row reproduces the device measurement in the issue to the pixel (button at
// y=656..708, blocked by ION-SEGMENT-BUTTON / ION-SEGMENT / DIV). The second row of each pair is
// why this issue is NOT a duplicate of hub#1895: with the double reservation gone the button is
// still cut -- 26 of its 52px on the tablet, 38 of 52 on the phone -- so it never reaches the 48dp
// of usable height the issue asks for. The two defects add up; neither one alone explains it.
//
// happy-dom does NOT lay out, so what is pinned here is the DECLARED CSS contract that makes the
// geometry above possible, the same way `erp-pos-scroll.test.ts` pins the scroll contract.
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

describe('the till sheets are anchored to the module box, not to the viewport (sales#314)', () => {
  it('.scrim is absolute: it stops where the shell stops giving the module room', async () => {
    const scrim = rules(await posCss(), '.scrim');

    expect(scrim, '.scrim declares its position').toMatch(/position\s*:/);
    expect(
      scrim,
      'position:fixed spans the viewport, which includes the shell tab bar the module cannot paint over',
    ).not.toMatch(/position\s*:\s*fixed/);
    expect(scrim, 'absolute + inset:0 = exactly the box the shell laid the module out in')
      .toMatch(/position\s*:\s*absolute/);
    expect(scrim, 'and it still fills that box').toMatch(/inset\s*:\s*0/);
  });

  it('.card establishes the containing block, or absolute escapes the module', async () => {
    // `.scrim` is a direct child of `.card`, and `.card` is the module's full box (height:100%).
    // Without a positioned ancestor, `position:absolute` resolves against whatever the shell
    // happens to have positioned -- which today is `ion-content`'s own `.inner-scroll`, an
    // implementation detail of Ionic that happens to end at the same place. MEASURED, because the
    // difference is invisible until the shell changes one setting: with the module mounted under an
    // `ion-content` that is `fullscreen` (the other legitimate Ionic setting -- AppPage opts out of
    // it for an unrelated reason, rounded corners) the scroll box runs BEHIND the tab bar, and
    // dropping this one declaration puts the CHARGE button back under it: 0/377 points reachable,
    // same ION-SEGMENT-BUTTON / ION-SEGMENT / DIV blockers as the bug. With it, 377/377.
    // So the module says where its own sheets are anchored instead of inheriting it by luck.
    expect(rules(await posCss(), '.card'), '.card is the anchor of the sheets')
      .toMatch(/position\s*:\s*relative/);
  });

  it('.sheet is capped by that box, never by the viewport height', async () => {
    const sheet = rules(await posCss(), '.sheet');
    const maxHeight = sheet.match(/max-height\s*:\s*([^;}]+)/);

    expect(maxHeight, '.sheet caps its height so a long payment sheet still scrolls inside').toBeTruthy();
    expect(
      maxHeight![1],
      'vh is the viewport, and the viewport is not the module: 88vh centred leaves 6vh of clearance '
      + 'and the tab bar is taller than that',
    ).not.toMatch(/vh/);
  });
});
