// sales#417 — «1 artículos»: the till's item counts agree with their number.
//
// The cart button of the phone layout is announced by its accessible name (sales#84), and with one
// item in the cart the screen reader said «Abrir carrito, 1 artículos» / «Open cart, 1 items». The
// category tabs of the grid painted the same mistake for everyone to read: «Bebidas · 1 artículos»,
// glued by hand as `${count} ${t('ui.items')}`. Only the catalogue knows the singular noun, so the
// choice is a key (`…One`, the pattern of `catalogBlockedOne`), never a rule in the code.
//
// The double of t() here resolves against the REAL locales/*.json and fills {params}: the symptom is
// a text, so the words are pinned, not only the keys.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

function moduleRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('module.json not found walking up from the test');
    dir = up;
  }
  return dir;
}

type Lang = 'en' | 'es';

function catalogOf(lang: Lang): Record<string, unknown> {
  return JSON.parse(readFileSync(join(moduleRoot(), 'locales', `${lang}.json`), 'utf8'));
}

/** A t() that speaks `lang` from the module's own catalogue, the way the hub does. */
function realT(lang: Lang) {
  const catalog = catalogOf(lang);
  return (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => {
    const text = key.split('.').reduce<unknown>((node, part) =>
      (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), catalog);
    if (typeof text !== 'string') return `MISSING:${key}`;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
      (params && name in params ? String(params[name]) : whole));
  };
}

const CATEGORIES = [
  { id: 'c-drinks', name: 'Bebidas' },
  { id: 'c-food', name: 'Comida' },
];
const PRODUCTS = [
  { id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-2', name: 'Tostada', price: 220, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-3', name: 'Bocadillo', price: 450, is_active: 1, tax_category_key: 'product.generic' },
];
const LINKS = [
  { product_id: 'p-1', category_id: 'c-drinks' },
  { product_id: 'p-2', category_id: 'c-food' },
  { product_id: 'p-3', category_id: 'c-food' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
}

async function mount(lang: Lang): Promise<Pos> {
  installPosDouble({
    settings: { sync_products: 1, sync_services: 0 },
    products: PRODUCTS,
    categories: CATEGORIES,
    productCategories: LINKS,
    rules: RULES,
    t: realT(lang),
    command: async () => ({ ok: true, new_ids: ['ord-1', 'line-1'] }),
  });
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function tapTile(el: Pos, index: number) {
  el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')[index]!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

const fabLabel = (el: Pos) =>
  el.shadowRoot.querySelector<HTMLButtonElement>('[data-testid="pos-cart-fab"]')!.getAttribute('aria-label')!;

/** The counter of a category tab, read as the cashier reads it. */
function tabCounter(el: Pos, id: string): string {
  const tab = el.shadowRoot.querySelector<HTMLElement>(`[data-testid="pos-category-${id}"] .cc-c`);
  expect(tab, `the ${id} tab is painted`).toBeTruthy();
  return tab!.textContent!.replace(/\s+/g, ' ').trim();
}

const WORDS: Record<Lang, { one: string; many: string; wrongOne: string }> = {
  es: { one: '1 artículo', many: '2 artículos', wrongOne: '1 artículos' },
  en: { one: '1 item', many: '2 items', wrongOne: '1 items' },
};

describe.each(['es', 'en'] as const)('item counts agree with their number (%s)', (lang) => {
  const w = WORDS[lang];

  it('the cart button says ONE item to the screen reader, with the total', async () => {
    const el = await mount(lang);
    await tapTile(el, 0);
    const label = fabLabel(el);
    expect(label, 'resolved from the catalogue, no key left raw').not.toContain('MISSING:');
    expect(label).toMatch(new RegExp(`(^|\\D)${w.one}(\\W|$)`));
    expect(label).not.toContain(w.wrongOne);
    expect(label, 'the amount stays in the name (sales#412)').toMatch(/1[.,]50/);
    expect(label, 'no placeholder left unfilled').not.toMatch(/\{\w+\}/);
  });

  it('with two items the cart button keeps the plural', async () => {
    const el = await mount(lang);
    await tapTile(el, 0);
    await tapTile(el, 1);
    const label = fabLabel(el);
    expect(label).toContain(w.many);
    expect(label, 'the amount stays in the name').toMatch(/3[.,]70/);
    expect(label).not.toMatch(/\{\w+\}/);
  });

  it('a category tab with one product says «1 item», one with two keeps the plural', async () => {
    const el = await mount(lang);
    expect(tabCounter(el, 'c-drinks')).toBe(w.one);
    expect(tabCounter(el, 'c-food')).toBe(w.many);
  });
});

describe('the catalogue carries the singular in both languages', () => {
  it.each(['en', 'es'] as const)('%s: the singular keys exist and the plural ones keep {count}', (lang) => {
    const ui = catalogOf(lang).ui as Record<string, string>;
    expect(ui.openCartWithItems).toContain('{count}');
    expect(ui.openCartWithItemsOne, 'the singular of the cart button').toEqual(expect.any(String));
    expect(ui.openCartWithItemsOne, 'the singular keeps the amount').toContain('{total}');
    expect(ui.itemCount).toContain('{count}');
    expect(ui.itemCountOne, 'the singular of the tab counter').toEqual(expect.any(String));
  });
});
