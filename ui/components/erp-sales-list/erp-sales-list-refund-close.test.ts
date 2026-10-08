// sales#456 — closing the refund screen reloads the sales list.
//
// Until now the list only reloaded on `refunded`. After «we can't tell» the notice sends the
// operator to check the sale, and closing the modal left the row with the status and totals it had
// BEFORE the refund that may well have gone through: the one place they were told to look showed
// the stale answer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import esCatalog from '../../../locales/es.json';
import { installErploraDouble, type ErploraDouble } from '../../test/erplora-double';
import { forgetPendingRefundKey } from '../../lib/refund-pending-key';
import './erp-sales-list';

type ListEl = HTMLElement & { updateComplete: Promise<unknown>; refundSaleId?: string };

const ROW = { id: 'venta-1', sale_number: 'T-42', status: 'completed', total: 360 };

function translator(catalog: Record<string, unknown>) {
  return (_c: Record<string, unknown>, key: string) =>
    key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog) as string ?? key;
}

let double: ErploraDouble;

beforeEach(() => {
  document.body.innerHTML = '';
  double = installErploraDouble({
    queries: {
      'sales.list': [ROW], 'sales.stats': [], 'sales.payment_methods': [],
      'sales.business_day': [{ today: '2031-01-15' }],
      'sales.get': [{ id: 'venta-1', sale_number: 'T-42', status: 'completed', total: 360 }],
      'sales.refund_options': [],
      // services#158: the refund screen reads the sale's lines for «What goes back».
      'sales.lines': [],
    } as never,
    locale: 'es',
    t: translator(esCatalog),
  });
});

afterEach(() => { forgetPendingRefundKey('venta-1'); });

async function settle(el: ListEl): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
}

async function mountList(): Promise<ListEl> {
  const el = document.createElement('erp-sales-list') as ListEl;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

const reads = (name: string): number => double.reads.filter((r) => r.name === name).length;
const refundModal = (el: ListEl): HTMLElement =>
  el.shadowRoot!.querySelector('ion-modal.refund-modal') as HTMLElement;

async function openRefund(el: ListEl): Promise<void> {
  const table = el.shadowRoot!.querySelector('ok-data-table')!;
  table.dispatchEvent(new CustomEvent('rowAction', { detail: { actionId: 'refund', row: ROW } }));
  await settle(el);
}

describe('sales list — closing the refund screen (sales#456)', () => {
  it('reloads the rows and the day figures when the refund screen is closed', async () => {
    const el = await mountList();
    await openRefund(el);
    expect(el.refundSaleId).toBe('venta-1');
    const listBefore = reads('sales.list');
    const statsBefore = reads('sales.stats');
    refundModal(el).dispatchEvent(new CustomEvent('ionModalDidDismiss'));
    await settle(el);
    expect(el.refundSaleId).toBeUndefined();
    expect(reads('sales.list')).toBeGreaterThan(listBefore);
    expect(reads('sales.stats')).toBeGreaterThan(statsBefore);
  });

  it('a refund that went through reloads ONCE, not once for the event and again for the close', async () => {
    const el = await mountList();
    await openRefund(el);
    const listBefore = reads('sales.list');
    const screen = el.shadowRoot!.querySelector('erp-sale-refund')!;
    screen.dispatchEvent(new CustomEvent('refunded', { bubbles: true, composed: true, detail: { saleId: 'venta-1' } }));
    await settle(el);
    // Ionic fires the dismiss when `isOpen` goes false.
    refundModal(el).dispatchEvent(new CustomEvent('ionModalDidDismiss'));
    await settle(el);
    expect(reads('sales.list')).toBe(listBefore + 1);
  });

  it('a dismiss with no refund screen open reloads nothing', async () => {
    const el = await mountList();
    const listBefore = reads('sales.list');
    refundModal(el).dispatchEvent(new CustomEvent('ionModalDidDismiss'));
    await settle(el);
    expect(reads('sales.list')).toBe(listBefore);
  });
});
