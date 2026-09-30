// sales#477 — the bill a waiter carries to the table writes its VAT rate in the HUB's language:
// «IVA 10 %» in a Spanish hub, «IVA 10%» in an English one, on screen and on the printed paper.
// The bill was composed without the hub's locale, so it fell back to Spanish whatever the hub
// spoke — once the rate follows the language, an English hub would have read «10 %».
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReceiptData } from '@erplora/outfitkit';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const NBSP = ' ';

interface PrintRequest {
  data?: { tax_label?: string };
}

let printed: PrintRequest[];

function install(locale: string) {
  printed = [];
  installPosDouble({
    locale,
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

async function printedTaxLabel(el: HTMLElement): Promise<string | undefined> {
  const modal = [...el.shadowRoot!.querySelectorAll('ion-modal.doc-modal')].find((m) => m.querySelector('#prebill-doc'))!;
  modal.querySelector<HTMLElement>('ion-button[aria-label="ui.print"]')!.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(printed, 'the bill reached the print gate').toHaveLength(1);
  return printed[0].data?.tax_label;
}

describe('the bill writes its VAT rate in the hub language (sales#477)', () => {
  it('en hub: «IVA 10%» on screen and on paper', async () => {
    install('en');
    const el = await openBill();
    expect(screenTaxLabels(el)).toEqual(['IVA 10%']);
    expect(await printedTaxLabel(el)).toBe('IVA 10%');
  });

  it('es hub: «IVA 10 %» on screen and on paper', async () => {
    install('es');
    const el = await openBill();
    expect(screenTaxLabels(el)).toEqual([`IVA 10${NBSP}%`]);
    expect(await printedTaxLabel(el)).toBe(`IVA 10${NBSP}%`);
  });
});
