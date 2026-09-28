// sales#452 + sales#454 — on a narrow phone the open check reads whole: the name of a line, the
// «Account / Current order» tabs and the close button.
//
// Measured on hub:dev + kitchen (the PR), ios and md:
//
//   - sales#452: with Kitchen every unsent line wears «Pending» on the row of its name. The card of a
//     line keeps its amount, three actions and the stepper on the right, so at 320 px the name got
//     36 px beside the pill and «Café con leche» broke in three lines (two at 360 px, two on a
//     tablet). Square and Toast put the state of a line above or below its name, never beside it
//     taking its width: the pill goes to its own row when the two do not fit together.
//   - sales#454: the tabs were two equal columns, and md pads each one 16 px a side and spaces the
//     letters: «Comanda actual» and its pending count needed 161 px where md gave 110 at 360 px
//     (123 on a tablet, 143 on a desktop) -- «Comanda actu» and no count. Each tab now takes the
//     width of its words, with the padding and the letter spacing of ios.
//   - sales#454: close (only ever in the drawer) put its icon and «Cerrar» side by side in 52 px, and
//     md's capitals left «CER…». As the low drawers already do (sales#433), it is an icon in every
//     drawer, its name in aria-label and title.
//
// happy-dom neither lays out nor evaluates container queries, so this pins the DECLARED contract,
// as the other style contracts of this component do. That it fits is measured in a browser (the PR).
import { afterEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

type HappyWindow = Window & { happyDOM?: { setViewport(v: { width: number; height: number }): void } };
type Pos = HTMLElement & { updateComplete: Promise<unknown>; queue<T>(t: () => Promise<T>): Promise<T> };

/** The CSS the component declares (Lit's `static styles`). */
function posCss(): string {
  const ctor = customElements.get('erp-pos-touch') as unknown as {
    styles: { cssText: string } | Array<{ cssText: string }>;
  };
  return [ctor.styles].flat().map((s) => s.cssText).join('\n');
}

/** Cuts every @media/@container block out of `css` (or keeps only the ones whose prelude matches),
 *  counting braces -- a rule inside a block must not pass as a rule for every size. */
function split(css: string, prelude?: RegExp): { inside: string[]; outside: string } {
  const inside: string[] = [];
  let outside = '';
  let from = 0;
  const opening = /@(?:container|media)\s*([^{]*)\{/g;
  for (let m = opening.exec(css); m; m = opening.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    if (!prelude || prelude.test(m[1])) inside.push(css.slice(start, i - 1));
    outside += css.slice(from, m.index);
    from = i;
    opening.lastIndex = i;
  }
  return { inside, outside: outside + css.slice(from) };
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

/** The phone drawer: narrow OR low (sales#423). */
const DRAWER = /^not all and \(min-width:\s*821px\) and \(min-height:\s*501px\)\s*$/;

/** The till with Kitchen installed and one line still to fire. */
async function mountWithPendingLine(width: number, height: number): Promise<ShadowRoot> {
  (window as HappyWindow).happyDOM?.setViewport({ width, height });
  const lines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: null,
    products: [{ id: 'p-1', name: 'Café con leche', sku: 'CAF', price: 180, is_active: 1, tax_category_key: 'product.generic' }],
    rules: [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }],
    orderLines: () => lines.map((l) => ({ ...l })),
    loadSlot: (slot: string) => (slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire-452' }] : []),
    command: async (name: string) => {
      if (name === 'sales.order.open') {
        lines.push({ id: 'l1', product_id: 'p-1', product_name: 'Café con leche', unit_price: 180, quantity: 1_000_000,
          tax_category_key: 'product.generic', fired_at: null, round_no: 0 });
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

afterEach(() => {
  document.body.innerHTML = '';
  (window as HappyWindow).happyDOM?.setViewport({ width: 1024, height: 768 });
});

describe('a pending line keeps its name on the whole width of its card (sales#452)', () => {
  it('«Pending» comes before the name, so when both do not fit it sits on its own row above it', async () => {
    const root = await mountWithPendingLine(320, 568);
    const h3 = root.querySelector('ion-list.lines ion-item h3');
    expect(h3, 'the line is rendered').toBeTruthy();
    const pill = h3!.querySelector('ok-status-pill');
    expect(pill?.textContent?.trim(), 'the unsent line says so').toBe('ui.pendingStatus');
    const name = [...h3!.children].find((c) => c.textContent?.trim() === 'Café con leche');
    expect(name, 'the name is its own element').toBeTruthy();
    expect(pill!.compareDocumentPosition(name!) & Node.DOCUMENT_POSITION_FOLLOWING, 'the state first, the name after').toBeTruthy();
  });

  it('the row of the name wraps instead of squeezing the name beside the pill, at every size', () => {
    const { outside } = split(posCss());
    const h3 = rules(outside, 'ion-list.lines ion-item h3');
    expect(h3, 'still a row: the pill and the name side by side when they fit').toMatch(/display:\s*flex/);
    expect(h3, 'the name goes under the pill when they do not').toMatch(/flex-wrap:\s*wrap/);
  });
});

describe('the «Account / Current order» tabs read whole on a narrow phone (sales#454)', () => {
  it('each tab is as wide as its words, not half the row', () => {
    const { outside } = split(posCss());
    // md lays the tabs out as minmax(auto, 360px) and ios as 1fr: two equal halves, and «Current
    // order» with its count did not fit in its half at 360 px.
    expect(rules(outside, 'ion-segment.view-tabs')).toMatch(/grid-auto-columns:\s*auto/);
  });

  it('the tabs still fill their box: the room left over is shared, not left empty on both sides', () => {
    const { outside } = split(posCss());
    // Ionic centres the columns of a segment: with columns as wide as their words, on a tablet or a
    // desktop «Account» and «Current order» sat bunched in the middle of an empty bordered box.
    expect(rules(outside, 'ion-segment.view-tabs')).toMatch(/justify-content:\s*stretch/);
  });

  it('md pads and spaces them as ios does', () => {
    const { outside } = split(posCss());
    const button = rules(outside, 'ion-segment.view-tabs ion-segment-button');
    expect(button, 'md spaces the letters .06em').toMatch(/letter-spacing:\s*0/);
    expect(rem(button, '--padding-start'), 'md pads 16 px a side').toBeLessThanOrEqual(0.6);
    expect(rem(button, '--padding-end')).toBeLessThanOrEqual(0.6);
    expect(rem(button, 'min-height'), 'still a finger tall').toBeGreaterThanOrEqual(2.75);
  });
});

describe('the close button of the drawer is an icon, in every drawer (sales#454)', () => {
  it('its words never show in the drawer: md capitals left «CER…» in 52 px', () => {
    const drawer = split(posCss(), DRAWER).inside;
    expect(drawer, 'the phone drawer block').toHaveLength(1);
    // As specific as the base rule that shows it (ion-button.header-action small { display:block }).
    expect(rules(drawer[0], 'ion-button.header-action.cart-close small')).toMatch(/display:\s*none/);
    const close = rules(drawer[0], 'ion-button.header-action.cart-close');
    expect(rem(close, 'width'), 'as wide as the icons next to it, not 3.25rem').toBeLessThanOrEqual(2.4);
    expect(rem(close, 'width'), 'a finger wide').toBeGreaterThanOrEqual(2.1);
    expect(rem(close, 'min-height'), 'ios gives a labelled button min-height 3.1em').toBe(rem(close, 'height'));
  });

  it('its name stays for screen readers and on hover', async () => {
    const root = await mountWithPendingLine(360, 640);
    const close = root.querySelector('[data-testid="pos-cart-close"]');
    expect(close?.getAttribute('aria-label')).toBe('ui.closeAction');
    expect(close?.getAttribute('title')).toBe('ui.closeAction');
    expect(close?.querySelector('ion-icon'), 'an icon to show').toBeTruthy();
  });
});
