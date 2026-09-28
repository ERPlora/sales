// sales#460 — with Kitchen, a screen reader hears on the «Account / Current order» tabs what they
// show: how many items are still to send, and in the language the till is in NOW.
//
// The tabs are `ion-segment-button`s: Ionic renders each as a `role="tab"` button whose name is
// its content (a <slot>), unless the host has an aria-label — and that one Ionic copies onto its
// button ONCE, at load (`inheritAttributes(el, ['aria-label'])` in componentWillLoad, no watcher).
// The till named both tabs with a host aria-label, so the button kept the name of the first
// render: «Current order» with three lines to send, and «Cuenta / Comanda actual» after switching
// to English with the till open (it repaints on `erplora:locale-changed`, it does not remount).
// Measured on hub:dev, ios and md, 1440×900 and 360×640, by CDP (`Accessibility.getFullAXTree`):
// 8/8 wrong on main (the PR). Same cause and fix as the Kitchen display (kitchen#116).
//
// So the name comes from the tab's content: the painted words and count are aria-hidden, and a
// visually hidden text says the whole name. happy-dom has no Ionic, so `ion-segment-button` is
// stubbed with exactly that load-once behaviour, and the name is computed as the browser does for
// a tab: its aria-label, else its content minus aria-hidden subtrees.
import { afterEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';

const CATALOGS = { es, en } as const;
type Locale = keyof typeof CATALOGS;
let locale: Locale = 'es';

/** The real catalog of the active language, with {params} filled as the shell does. */
function translate(_catalog: unknown, key: string, params?: Record<string, unknown>): string {
  const word = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], CATALOGS[locale]);
  expect(typeof word, `${locale}: ${key}`).toBe('string');
  return (word as string).replace(/\{(\w+)\}/g, (_m, p: string) => String(params?.[p] ?? `{${p}}`));
}

// Ionic's segment-button, as far as the tab's name goes: at load it moves the host's aria-label
// onto its native role="tab" button and never reads it again; the tab's content is the slot.
class FakeSegmentButton extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const inherited = this.getAttribute('aria-label');
    this.removeAttribute('aria-label');
    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    if (inherited !== null) tab.setAttribute('aria-label', inherited);
    tab.appendChild(document.createElement('slot'));
    this.attachShadow({ mode: 'open' }).appendChild(tab);
  }
}
if (!customElements.get('ion-segment-button')) customElements.define('ion-segment-button', FakeSegmentButton);

/** The tab's accessible name: its aria-label, else the text it slots in minus aria-hidden subtrees. */
function tabName(root: ShadowRoot, testid: string): string {
  const host = root.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  expect(host, testid).toBeTruthy();
  const tab = host!.shadowRoot?.querySelector('[role="tab"]');
  expect(tab, `${testid}: the stub rendered its role=tab button`).toBeTruthy();
  const label = tab!.getAttribute('aria-label');
  if (label) return label.trim();
  const text = (n: Node): string =>
    n.nodeType === Node.TEXT_NODE
      ? (n.textContent ?? '')
      : (n as Element).getAttribute?.('aria-hidden') === 'true'
        ? ''
        : [...n.childNodes].map(text).join('');
  return [...host!.childNodes].map(text).join('').replace(/\s+/g, ' ').trim();
}

type Pos = HTMLElement & { updateComplete: Promise<unknown>; queue<T>(t: () => Promise<T>): Promise<T> };

const PRODUCTS = [
  { id: 'p-1', name: 'Café', sku: 'CAF', price: 180, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-2', name: 'Tostada', sku: 'TOS', price: 250, is_active: 1, tax_category_key: 'product.generic' },
];

/** The till with Kitchen installed (it fills sales.pos.actions), still with nothing to send: the
 *  tabs are painted — and Ionic reads their aria-label — before the first line. */
async function mountTill(): Promise<Pos> {
  const lines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: null,
    products: PRODUCTS,
    rules: [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }],
    orderLines: () => lines.map((l) => ({ ...l })),
    loadSlot: (slot: string) => (slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire-460' }] : []),
    t: translate,
    command: async (name: string, payload?: Record<string, unknown>) => {
      if (name === 'sales.order.open' || name === 'sales.order.add_line') {
        const id = `l${lines.length + 1}`;
        const p = PRODUCTS.find((x) => x.id === (payload?.product_id ?? 'p-1')) ?? PRODUCTS[0];
        lines.push({ id, product_id: p.id, product_name: p.name, unit_price: p.price, quantity: 1_000_000,
          tax_category_key: 'product.generic', fired_at: null, round_no: 0 });
        return { ok: true, new_ids: ['o1', id] };
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
  expect(el.shadowRoot!.querySelector('[data-testid="pos-view-tabs"]'), 'the kitchen tabs are there').toBeTruthy();
  return el;
}

async function addProduct(el: Pos, name: string): Promise<void> {
  const tile = [...el.shadowRoot!.querySelectorAll<HTMLElement>('ion-card.tile')].find((x) => x.textContent?.includes(name));
  expect(tile, `the ${name} tile`).toBeTruthy();
  tile!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

async function switchTo(el: Pos, next: Locale): Promise<void> {
  locale = next;
  window.dispatchEvent(new CustomEvent('erplora:locale-changed', { detail: { locale: next } }));
  await el.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = '';
  locale = 'es';
});

describe('sales#460: the kitchen tabs of the till are named by what they show, kept up to date', () => {
  it.each(['es', 'en'] as const)('nothing to send: «Account» and «Current order» (%s)', async (lang) => {
    locale = lang;
    const root = (await mountTill()).shadowRoot!;
    expect(tabName(root, 'pos-view-tab-account')).toBe(CATALOGS[lang].ui.accountTab);
    expect(tabName(root, 'pos-view-tab-draft')).toBe(CATALOGS[lang].ui.currentCommandTab);
  });

  it('a line added after the till opened is announced as one item to send, then two', async () => {
    const el = await mountTill();
    await addProduct(el, 'Café');
    expect(tabName(el.shadowRoot!, 'pos-view-tab-draft')).toBe('Comanda actual, 1 artículo por enviar');
    await addProduct(el, 'Tostada');
    expect(tabName(el.shadowRoot!, 'pos-view-tab-draft')).toBe('Comanda actual, 2 artículos por enviar');
  });

  it('switching the language with the till open renames both tabs in the new language', async () => {
    const el = await mountTill();
    await addProduct(el, 'Café');
    await switchTo(el, 'en');
    expect(tabName(el.shadowRoot!, 'pos-view-tab-account')).toBe('Account');
    expect(tabName(el.shadowRoot!, 'pos-view-tab-draft')).toBe('Current order, 1 item to send');
    await switchTo(el, 'es');
    expect(tabName(el.shadowRoot!, 'pos-view-tab-account')).toBe('Cuenta');
    expect(tabName(el.shadowRoot!, 'pos-view-tab-draft')).toBe('Comanda actual, 1 artículo por enviar');
  });

  it('the pending count still shows on the tab, next to its words', async () => {
    const el = await mountTill();
    await addProduct(el, 'Café');
    const draft = el.shadowRoot!.querySelector('[data-testid="pos-view-tab-draft"]')!;
    expect(draft.querySelector('.view-tab-text')?.textContent?.trim()).toBe('Comanda actual');
    expect(draft.querySelector('.pending-dot')?.textContent?.trim()).toBe('1');
  });

  // A low drawer hides the words of the tabs and shows icons (sales#433). What names the tab there
  // must be hidden from the eye only: display:none would take it out of the name as well.
  it('the spoken name is hidden from the eye only, never with display:none', async () => {
    const ctor = customElements.get('erp-pos-touch') as unknown as { styles: { cssText: string } | Array<{ cssText: string }> };
    const css = [ctor.styles].flat().map((s) => s.cssText).join('\n');
    const el = await mountTill();
    for (const id of ['pos-view-tab-account', 'pos-view-tab-draft']) {
      const spoken = el.shadowRoot!.querySelector(`[data-testid="${id}"] .view-tab-name`);
      expect(spoken, `${id}: carries its spoken name`).toBeTruthy();
      expect(spoken!.closest('[aria-hidden="true"]'), `${id}: its spoken name is not aria-hidden`).toBeNull();
    }
    const decls = [...css.matchAll(/([^{}]*\.view-tab-name[^{}]*)\{([^}]*)\}/g)];
    expect(decls.length, '.view-tab-name has its own rule').toBeGreaterThan(0);
    for (const [, , body] of decls) expect(body, 'hidden from the eye, not from the reader').not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/);
    const own = decls.map(([, , body]) => body).join(';');
    expect(own).toMatch(/position\s*:\s*absolute/);
    expect(own).toMatch(/clip(-path)?\s*:/);
  });
});
