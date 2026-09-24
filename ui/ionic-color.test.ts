// No `ion-*` of this module takes its colour from `color=` (ERPlora/pm#392, module-toolkit#273).
//
// Ionic implements `color="danger"` with a GLOBAL rule of the document stylesheet
// (`.ion-color-danger { --ion-color-base: … }`), which does not reach inside a shadow root. In the
// till that meant: the solid «Delete» of the departments and quick-notes confirmations had an
// invisible fill (white text on nothing), the discount/gift badges of a cart line had no background,
// the state icons of a line (discount, note, gift, split selection) and of the course headers never
// changed colour, and the outline/clear «Remove», «Discard and open» or the parked-check ✕ fell back
// to primary blue.
//
// Two recipes, by where the element lives:
//   · the two delete confirmations sit in an `ion-modal`, which Ionic reparents to <body>: neither
//     the component's `static styles` nor a class reach it → the tone goes INLINE, as custom
//     properties read from the theme token (`ionTone`). The document modal already carries its own
//     <style> inside the modal, so its ✕ is painted there;
//   · everything in the till lives in `erp-pos-touch`'s own shadow root (the sheets are divs with a
//     scrim, the dialogs are native <dialog>: the DOM does not move) → a `tone-*` class painted from
//     `static styles`.
//
// happy-dom neither lays out nor loads Ionic's CSS, so what is pinned here is the CONTRACT; the
// computed colours were measured in a real browser in `ios` mode.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { render } from 'lit';
import { describe, expect, it } from 'vitest';
import { ionTone } from './lib/ion-tone';
import { installErploraDouble } from './test/erplora-double';
import { installPosDouble } from './test/pos-double';
import { renderDocumentModal } from './lib/document-modal';

// The `ui/` of THIS checkout, from the test's own URL: a fixed folder name (`modules/sales`, a
// worktree) would scan a sibling checkout and let a `color=` added HERE through.
const UI = path.dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The attribute names of every `<ion-*>` opening tag. A Lit tag does not end at the first `>`
 * (`@click=${() => …}`), so `${…}` expressions and quoted values are skipped, not read.
 */
function ionTags(source: string): { line: number; attrs: string }[] {
  const found: { line: number; attrs: string }[] = [];
  const start = /<ion-[a-z-]+(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(source))) {
    let attrs = '';
    let depth = 0;
    let quote: string | null = null;
    for (let i = m.index + m[0].length; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (depth > 0) {
        if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        continue;
      }
      if (ch === '$' && source[i + 1] === '{') { depth = 1; i += 1; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '>') break;
      attrs += ch;
    }
    found.push({ line: source.slice(0, m.index).split('\n').length, attrs: `${m[0]}${attrs}` });
  }
  return found;
}

const DECLARES_COLOR = /(?:^|\s)\.?color=/;

describe('pm#392: no ion-* delegates its colour to color=', () => {
  it('the source of ui/ carries no color= on an ion-* element', () => {
    const offenders = sources(UI).flatMap((file) =>
      ionTags(readFileSync(file, 'utf8'))
        .filter((t) => DECLARES_COLOR.test(t.attrs))
        .map((t) => `${path.relative(UI, file)}:${t.line}`),
    );
    expect(offenders, 'color= paints nothing inside a module shadow root').toEqual([]);
  });

  it('the reader sees a color= bound to an expression or behind an arrow function (control of the control)', () => {
    expect(ionTags('<ion-icon name="x"\n  color=${a ? \'warning\' : \'medium\'}></ion-icon>').filter((t) => DECLARES_COLOR.test(t.attrs))).toHaveLength(1);
    expect(ionTags('<ion-button ?disabled=${a || b}\n  @click=${() => this.go()} color="danger">x</ion-button>').filter((t) => DECLARES_COLOR.test(t.attrs))).toHaveLength(1);
    expect(ionTags('<ion-button @click=${() => ({ color: 1 })}>x</ion-button>').filter((t) => DECLARES_COLOR.test(t.attrs))).toHaveLength(0);
  });
});

// ── Render: every place that used to say `color=` now carries its tone ───────────────────────────

type Wc = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> } & Record<string, unknown>;

const settle = async (el: Wc) => {
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};

async function mount(tag: string, load: () => Promise<unknown>): Promise<Wc> {
  document.body.innerHTML = '';
  await load();
  const el = document.createElement(tag) as Wc;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

const byTestId = (root: ParentNode, id: string) => root.querySelector(`[data-testid="${id}"]`);

/** The CSS text of the component's `static styles`, where the `tone-*` classes are painted. */
function componentCss(el: Wc): string {
  const styles = (el.constructor as unknown as { elementStyles: { cssText: string }[] }).elementStyles;
  return styles.map((s) => s.cssText).join('\n').replace(/\s+/g, ' ');
}

/** An element painted by a class: no `color=`, the class, and the rule that paints it. */
function expectTone(el: Wc, node: Element | null | undefined, tone: string) {
  expect(node, 'the element is rendered').toBeTruthy();
  expect(node!.hasAttribute('color'), 'it still delegates to color=').toBe(false);
  expect(node!.classList.contains(`tone-${tone}`), `missing class tone-${tone}`).toBe(true);
  const css = componentCss(el);
  const tag = node!.tagName.toLowerCase();
  if (tag === 'ion-icon') {
    expect(css).toContain(`ion-icon.tone-${tone} { color: var(--ion-color-${tone},`);
  } else if (tag === 'ion-badge') {
    expect(css).toContain(`ion-badge.tone-${tone} {`);
    expect(css).toContain(`--background: var(--ion-color-${tone},`);
    expect(css).toContain(`--color: var(--ion-color-${tone}-contrast,`);
  } else if (!node!.hasAttribute('fill')) {
    expect(css).toContain(`ion-button.tone-${tone}:not([fill]) {`);
  } else {
    expect(css).toContain(`ion-button.tone-${tone}[fill] { --color: var(--ion-color-${tone},`);
    expect(css).toContain(`--border-color: var(--ion-color-${tone},`);
  }
}

describe('pm#392: the delete confirmations (inside an ion-modal) paint their solid danger inline', () => {
  const t = (_c: unknown, key: string) => key;

  it('departments: «Delete» carries the danger tone as inline custom properties', async () => {
    installErploraDouble({
      queries: { 'sales.departments.list': () => [], 'taxes.categories.list': () => [], 'taxes.rules.list': () => [] },
      t,
    });
    const el = await mount('erp-pos-departments', () => import('./components/erp-pos-departments/erp-pos-departments'));
    el.deleteTarget = { id: 'd-1', name: 'Bar' };
    await settle(el);
    const btn = byTestId(el.shadowRoot, 'pos-departments-delete-confirm');
    expect(btn).toBeTruthy();
    expect(btn!.hasAttribute('color')).toBe(false);
    expect(btn!.getAttribute('style') ?? '').toContain(ionTone('solid', 'danger'));
  });

  it('quick notes: «Delete» carries the danger tone as inline custom properties', async () => {
    installErploraDouble({ queries: { 'sales.quick_notes.list': () => [] }, t });
    const el = await mount('erp-pos-quick-notes', () => import('./components/erp-pos-quick-notes/erp-pos-quick-notes'));
    el.deleteTarget = { id: 'qn-1', text: 'no salt' };
    await settle(el);
    const btn = byTestId(el.shadowRoot, 'pos-quick-notes-delete-confirm');
    expect(btn).toBeTruthy();
    expect(btn!.hasAttribute('color')).toBe(false);
    expect(btn!.getAttribute('style') ?? '').toContain(ionTone('solid', 'danger'));
  });
});

describe('pm#392: the document modal paints its ✕ from its own in-modal <style>', () => {
  it('the close button is medium, painted by the rule that travels with the modal', () => {
    installPosDouble({ locale: 'es' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(renderDocumentModal({ saleId: undefined, onClose: () => {}, t: (k) => k }), host);
    const close = host.querySelector('ion-button.doc-close');
    expect(close).toBeTruthy();
    expect(close!.hasAttribute('color')).toBe(false);
    const css = (host.querySelector('ion-modal.doc-modal > style')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(css).toMatch(/ion-modal\.doc-modal ion-button\.doc-close \{[^}]*--color: var\(--ion-color-medium, #636469\)/);
  });
});

describe('pm#392: the till paints its tones from classes of its own shadow root', () => {
  const PRODUCTS = [{ id: 'p-cafe', name: 'Café', price: 180, is_active: 1, tax_category_key: 'product.generic' }];
  const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

  async function till(): Promise<Wc> {
    installPosDouble({ settings: () => ({ allow_discounts: 1 }), products: PRODUCTS, rules: RULES });
    return mount('erp-pos-touch', () => import('./components/erp-pos-touch/erp-pos-touch'));
  }

  const LINE = { id: 'p-cafe', line_id: 'l-1', name: 'Café', price: 180, qty: 1 };

  it('a line: discount badge and icon warning, note icon primary, gift badge and icon success', async () => {
    const el = await till();
    el.cart = [{ ...LINE, discount: 10, note: 'no sugar', is_gift: true, gift_reason: 'x' }];
    await settle(el);
    const root = el.shadowRoot;
    expectTone(el, root.querySelector('ion-badge.line-discount-badge'), 'warning');
    expectTone(el, [...root.querySelectorAll('ion-badge')].find((b) => b.textContent?.includes('ui.giftBadge')), 'success');
    expectTone(el, byTestId(root, 'pos-line-p-cafe-discount')?.querySelector('ion-icon'), 'warning');
    expectTone(el, byTestId(root, 'pos-line-p-cafe-note')?.querySelector('ion-icon'), 'primary');
    expectTone(el, byTestId(root, 'pos-line-p-cafe-gift')?.querySelector('ion-icon'), 'success');
  });

  it('a plain line: its discount, note and gift icons are medium; the split mark follows the selection', async () => {
    const el = await till();
    el.cart = [{ ...LINE }, { ...LINE, id: 'p-2', line_id: 'l-2', name: 'Té' }];
    await settle(el);
    const root = el.shadowRoot;
    expectTone(el, byTestId(root, 'pos-line-p-cafe-discount')?.querySelector('ion-icon'), 'medium');
    expectTone(el, byTestId(root, 'pos-line-p-cafe-note')?.querySelector('ion-icon'), 'medium');
    expectTone(el, byTestId(root, 'pos-line-p-cafe-gift')?.querySelector('ion-icon'), 'medium');
    expectTone(el, root.querySelector('ion-icon.selmark'), 'medium');
    el.splitSel = new Set(['l-1']);
    await settle(el);
    expectTone(el, root.querySelector('ion-icon.selmark'), 'primary');
  });

  it('the course headers: «in progress» primary, «sent» warning', async () => {
    const el = await till();
    el.cart = [{ ...LINE }, { ...LINE, id: 'p-2', line_id: 'l-2', name: 'Té', fired_at: '2026-09-24T10:00:00Z' }];
    await settle(el);
    const icons = [...el.shadowRoot.querySelectorAll('.sec-h ion-icon')];
    expectTone(el, icons.find((i) => i.getAttribute('name') === 'create-outline'), 'primary');
    expectTone(el, icons.find((i) => i.getAttribute('name') === 'flame'), 'warning');
  });

  it('the ticket discount button turns warning only while a discount applies', async () => {
    const el = await till();
    el.cart = [{ ...LINE }];
    await settle(el);
    const btn = () => byTestId(el.shadowRoot, 'pos-ticket-discount');
    expect(btn()!.hasAttribute('color')).toBe(false);
    expect(btn()!.classList.contains('tone-warning')).toBe(false);
    el.ticketDiscount = 10;
    await settle(el);
    expectTone(el, btn(), 'warning');
  });

  // A tone that follows STATE must toggle its class, not rewrite the attribute: Ionic stamps its own
  // classes on the host (`hydrated`, `ios`, `button`…) and without `hydrated` its global CSS hides the
  // element (`visibility: hidden`). Measured in a real browser: a `class=${…}` binding made the
  // ticket discount button vanish the moment a discount applied.
  it('a tone that follows state keeps the classes Ionic stamped on the host', async () => {
    const el = await till();
    el.cart = [{ ...LINE }, { ...LINE, id: 'p-2', line_id: 'l-2', name: 'Té' }];
    await settle(el);
    const root = el.shadowRoot;
    const nodes = () => [
      byTestId(root, 'pos-ticket-discount'),
      byTestId(root, 'pos-line-p-cafe-discount')?.querySelector('ion-icon'),
      byTestId(root, 'pos-line-p-cafe-note')?.querySelector('ion-icon'),
      byTestId(root, 'pos-line-p-cafe-gift')?.querySelector('ion-icon'),
      root.querySelector('ion-icon.selmark'),
    ];
    for (const n of nodes()) n!.classList.add('hydrated', 'ios');
    el.ticketDiscount = 10;
    el.cart = [{ ...LINE, discount: 10, note: 'x', is_gift: true }, { ...LINE, id: 'p-2', line_id: 'l-2', name: 'Té' }];
    el.splitSel = new Set(['l-1']);
    await settle(el);
    for (const n of nodes()) {
      expect(n!.classList.contains('hydrated'), `${n!.tagName} lost Ionic's hydrated class`).toBe(true);
      expect(n!.classList.contains('ios')).toBe(true);
    }
    expectTone(el, nodes()[0], 'warning');
    expect(byTestId(root, 'pos-ticket-discount')!.classList.contains('ticket-discount')).toBe(true);
    expect(root.querySelector('ion-icon.selmark')!.classList.contains('tone-primary')).toBe(true);
    expect(root.querySelector('ion-icon.selmark')!.classList.contains('tone-medium')).toBe(false);
  });

  // sales#359 — the same trap on the line itself. Splitting the payment, the cashier taps lines to
  // mark them; a `class=${… 'sel' : ''}` on the `ion-item` rewrote the attribute on every toggle and
  // dropped `ion-activatable`/`ion-focusable`, which Ionic stamps once: from the second tap on the
  // line gave no press feedback and no keyboard focus ring (measured on kitchen#88 in <ion-app>).
  it('marking and unmarking a line for the split keeps the classes Ionic stamped on the item', async () => {
    const el = await till();
    el.cart = [{ ...LINE }, { ...LINE, id: 'p-2', line_id: 'l-2', name: 'Té' }];
    await settle(el);
    const item = () => byTestId(el.shadowRoot, 'pos-line-p-cafe')!;
    const ionic = ['item', 'ios', 'hydrated', 'ion-activatable', 'ion-focusable'];
    item().classList.add(...ionic);

    for (const marked of [true, false, true]) {
      item().click();
      await settle(el);
      expect(item().classList.contains('sel'), `after the tap the line is ${marked ? '' : 'un'}marked`).toBe(marked);
      for (const c of ionic) expect(item().classList.contains(c), `the line lost Ionic's ${c}`).toBe(true);
    }
  });

  it('sheets and dialogs: note/discount «Remove» medium, «Discard and open» and the parked ✕ danger', async () => {
    const el = await till();
    el.cart = [{ ...LINE }];
    el.noteSheet = { lineId: 'l-1' };
    await settle(el);
    expectTone(el, byTestId(el.shadowRoot, 'pos-note-remove'), 'medium');
    el.noteSheet = undefined;
    el.discountSheet = { target: 'ticket' };
    await settle(el);
    expectTone(el, byTestId(el.shadowRoot, 'pos-discount-remove'), 'medium');
    el.discountSheet = undefined;
    el.dirtyOpen = true;
    await settle(el);
    expectTone(el, byTestId(el.shadowRoot, 'pos-dirty-discard'), 'danger');
    el.dirtyOpen = false;
    el.parked = [{ id: 'oc-1', total: 500, label: 'Mesa 1' }];
    el.parkedOpen = true;
    await settle(el);
    expectTone(el, byTestId(el.shadowRoot, 'pos-parked-oc-1-delete'), 'danger');
  });
});
