// sales#181 — THE TILL SCREEN, with the payment methods exactly as the seed leaves them.
//
// `seed/install.postgres.sql` writes «Cash» and «Card» on purpose: the name is canonical DATA in
// English (ADR-0055, the same shape as inventory's units) and it is what the sale row stores, so
// the paper and the history can be regenerated years later. The language is put on at PAINT time
// by `payMethodDisplayName`.
//
// Every other till test in this module mounts with methods already named «Efectivo»/«Tarjeta», so
// none of them would notice the day someone dropped the translator from the tender buttons: the
// cashier would be charging from buttons labelled in English on a Spanish till. This is that
// guard, and it mounts the FACTORY data.
import { beforeEach, describe, expect, it } from 'vitest';
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// ⚠️ `tax_category_key` is mandatory or the tile is blocked by data (sales#74/#58).
const PRODUCTS = [
  { id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-10', tax_category_key: 'product.generic', rate_pct: 10, parent_id: null, is_active: 1 }];
/** The two rows `seed/install.postgres.sql` inserts, verbatim — plus one the owner renamed. */
const SEEDED_METHODS = [
  { id: 'h|paymethod|cash', name: 'Cash', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'h|paymethod|card', name: 'Card', type: 'card', requires_change: 0, sort_order: 20 },
  { id: 'h|paymethod|bbva', name: 'BBVA TPV', type: 'card', requires_change: 0, sort_order: 30 },
];

/** Translates from the module's REAL catalogue: what is measured is the language on the button. */
function translate(locale: string) {
  return (_catalog: unknown, key: string): string => {
    const table = (CATALOG[locale] ?? CATALOG.es) as Record<string, unknown>;
    return (key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], table) as string) ?? key;
  };
}

function installSdk(locale: string): void {
  installPosDouble({
    locale,
    paymentMethods: SEEDED_METHODS,
    products: PRODUCTS,
    rules: RULES,
    t: translate(locale),
    command: async () => ({ ok: true, new_ids: ['ord-1', 'line-1'] }),
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(task: () => Promise<T>): Promise<T>;
  openPay(): void;
}

/** A cart with one coffee and the pay sheet open — where the method buttons live. */
async function withPaySheet(locale: string): Promise<Pos> {
  installSdk(locale);
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  return el;
}

const methodNames = (el: Pos): string[] =>
  [...el.shadowRoot.querySelectorAll<HTMLElement>('.sheet .pay-methods button.pm-btn')]
    .map((b) => b.textContent?.trim() ?? '');

beforeEach(() => { document.body.innerHTML = ''; });

describe('till tender buttons — factory methods, hub language (sales#181)', () => {
  it('a Spanish hub reads «Efectivo» and «Tarjeta», never the stored English', async () => {
    const el = await withPaySheet('es');
    expect(methodNames(el)).toEqual(['Efectivo', 'Tarjeta', 'BBVA TPV']);
  });

  it('an English hub reads the same rows as «Cash» and «Card»', async () => {
    const el = await withPaySheet('en');
    expect(methodNames(el)).toEqual(['Cash', 'Card', 'BBVA TPV']);
  });

  it('the button the till starts on is cash, and it says so in Spanish', async () => {
    const el = await withPaySheet('es');
    const active = el.shadowRoot.querySelector<HTMLElement>('.sheet .pay-methods button.pm-btn[aria-pressed="true"]');
    expect(active?.textContent?.trim(), 'defaultPayMethod picks the cash row').toBe('Efectivo');
  });
});
