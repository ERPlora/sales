// sales#426 — «Cobrando 1 línea(s)»: the part being charged agrees with its number.
//
// Splitting a check and charging only the marked lines, the header of the charge sheet read
// «Cobrando 1 línea(s) de 12,00 €» — a «(s)» no till on the market shows — and in English
// «Paying 1 of €12.00», with no noun at all. Only the catalogue knows the singular noun, so the
// choice is a key (`payingPartOne`, the pattern of `itemCountOne` from sales#417), never a rule in
// the code.
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

const PRODUCTS = [
  { id: 'p-1', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

interface Line { id: string; line_id?: string; qty: number }
interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: Line[];
}

async function settle(el: Pos): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

/** A saved check of three coffees on three rows (line-1..line-3), in `lang`. */
async function threeLineCheck(lang: Lang): Promise<Pos> {
  let orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    products: PRODUCTS,
    rules: RULES,
    t: realT(lang),
    orderLines: () => orderLines,
    command: async (name: string) => {
      if (name === 'sales.order.open') {
        orderLines = [{
          id: 'line-1', product_id: 'p-1', product_name: 'Café', quantity: 1_000_000,
          unit_price: 150, line_total: 150, tax_category_key: 'product.generic',
        }];
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: ['x'] };
    },
  });
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await settle(el);
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await settle(el);
  expect(el.cart.map((l) => l.line_id), 'the first coffee is a saved row').toEqual(['line-1']);
  el.cart = [el.cart[0]!, { ...el.cart[0]!, line_id: 'line-2' }, { ...el.cart[0]!, line_id: 'line-3' }];
  await settle(el);
  return el;
}

/** Marks a row for the split the way the cashier does: a tap on the line. */
async function markRow(el: Pos, lineId: string): Promise<void> {
  const row = el.shadowRoot.querySelector<HTMLElement>(`[data-testid="pos-line-${lineId}"]`);
  expect(row, `row ${lineId} is on screen`).toBeTruthy();
  row!.click();
  await settle(el);
}

/** Opens the charge sheet and reads the line under the amount, as the cashier reads it. */
async function payingPartText(el: Pos): Promise<string> {
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-charge"]')!.click();
  await settle(el);
  const part = el.shadowRoot.querySelector<HTMLElement>('.pay-sheet .pay-split');
  expect(part, 'the sheet says a PART is being charged').toBeTruthy();
  return part!.textContent!.replace(/\s+/g, ' ').trim();
}

const WORDS: Record<Lang, { one: RegExp; many: RegExp }> = {
  es: { one: /^Cobrando 1 línea de 4[.,]50\s?€$/, many: /^Cobrando 2 líneas de 4[.,]50\s?€$/ },
  en: { one: /^Paying 1 line of €?4[.,]50\s?€?$/, many: /^Paying 2 lines of €?4[.,]50\s?€?$/ },
};

describe.each(['es', 'en'] as const)('the part being charged agrees with its number (%s)', (lang) => {
  const w = WORDS[lang];

  it('one marked line says ONE line, with no «(s)»', async () => {
    const el = await threeLineCheck(lang);
    await markRow(el, 'line-2');
    const text = await payingPartText(el);
    expect(text, 'resolved from the catalogue, no key left raw').not.toContain('MISSING:');
    expect(text).not.toContain('(s)');
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).toMatch(w.one);
  });

  it('two marked lines keep the plural', async () => {
    const el = await threeLineCheck(lang);
    await markRow(el, 'line-1');
    await markRow(el, 'line-3');
    const text = await payingPartText(el);
    expect(text).not.toContain('(s)');
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).toMatch(w.many);
  });
});

describe('the catalogue carries the singular of the part in both languages', () => {
  it.each(['en', 'es'] as const)('%s: payingPartOne exists and payingPart keeps {n} and {total}', (lang) => {
    const ui = catalogOf(lang).ui as Record<string, string>;
    expect(ui.payingPart).toContain('{n}');
    expect(ui.payingPart).toContain('{total}');
    expect(ui.payingPartOne, 'the singular of the part being charged').toEqual(expect.any(String));
    expect(ui.payingPartOne, 'the singular keeps the amount').toContain('{total}');
  });
});
