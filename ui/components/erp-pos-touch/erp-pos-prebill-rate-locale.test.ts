// sales#477 — the bill a waiter carries to the table writes its VAT rate in the HUB's language:
// «IVA 10 %» in a Spanish hub, «IVA 10%» in an English one, on screen and on the printed paper.
// The bill was composed without the hub's locale, so it fell back to Spanish whatever the hub
// spoke — once the rate follows the language, an English hub would have read «10 %».
//
// sales#483 — and the tax is NAMED in that language too: «VAT 10%» in English, not «IVA 10%». The
// words come from the module's REAL catalogs, so the test proves what the customer reads.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReceiptData } from '@erplora/outfitkit';
import { installPosDouble } from '../../test/pos-double';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';
import './erp-pos-touch';

const CATALOGS = { en, es } as const;
type Locale = keyof typeof CATALOGS;

const NBSP = ' ';

interface PrintRequest {
  data?: { tax_label?: string };
}

let printed: PrintRequest[];

/** The real catalog of `locale`, with {params} filled as the shell does. */
function translator(locale: Locale) {
  return (_catalog: unknown, key: string, params?: Record<string, unknown>): string => {
    const word = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], CATALOGS[locale]);
    return typeof word === 'string' ? word.replace(/\{(\w+)\}/g, (_m, p: string) => String(params?.[p] ?? `{${p}}`)) : key;
  };
}

function install(locale: Locale) {
  printed = [];
  installPosDouble({
    locale,
    t: translator(locale),
    extra: {
      print: async (req: PrintRequest) => {
        printed.push(req);
        return { via: 'bridge' };
      },
    },
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

/** Mounts the POS with an open table order at one VAT rate and opens its bill. */
async function openBill(): Promise<HTMLElement> {
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  const pos = el as unknown as Record<string, unknown>;
  pos.cart = [{ line_id: 'l1', name: 'Menú', price: 1100, qty: 1, tax_rate: 10 }];
  pos.orderId = 'order-1';
  pos.tableLabel = 'Mesa 4';
  pos.prebillOpen = true;
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

function screenTaxLabels(el: HTMLElement): string[] {
  const doc = el.shadowRoot!.querySelector<HTMLElement & { receipt?: ReceiptData }>('#prebill-doc');
  expect(doc, 'the bill document is rendered').toBeTruthy();
  return (doc!.receipt?.taxes ?? []).map((x) => x.label);
}

async function printedTaxLabel(el: HTMLElement, locale: Locale): Promise<string | undefined> {
  const modal = [...el.shadowRoot!.querySelectorAll('ion-modal.doc-modal')].find((m) => m.querySelector('#prebill-doc'))!;
  modal.querySelector<HTMLElement>(`ion-button[aria-label="${CATALOGS[locale].ui.print}"]`)!.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(printed, 'the bill reached the print gate').toHaveLength(1);
  return printed[0].data?.tax_label;
}

describe('the bill writes its VAT rate in the hub language (sales#477, sales#483)', () => {
  it('en hub: «VAT 10%» on screen and on paper', async () => {
    install('en');
    const el = await openBill();
    expect(screenTaxLabels(el)).toEqual(['VAT 10%']);
    expect(await printedTaxLabel(el, 'en')).toBe('VAT 10%');
  });

  it('es hub: «IVA 10 %» on screen and on paper', async () => {
    install('es');
    const el = await openBill();
    expect(screenTaxLabels(el)).toEqual([`IVA 10${NBSP}%`]);
    expect(await printedTaxLabel(el, 'es')).toBe(`IVA 10${NBSP}%`);
  });
});
