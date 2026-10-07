// services#157 — the refund window hosts `sales.reversal.notice`, next to the confirm button.
//
// Refunding a sale in full voids what other modules sold on it (the voucher of Services, used or
// not). The operator reads it BEFORE pressing «Devolver»; Sales only mounts the filler with the
// sale and the door ('refund') and never learns what a voucher is. A hub without a filler gets no
// hole and the same refund as before.
import { afterEach, describe, expect, it } from 'vitest';
import { installErploraDouble } from '../../test/erplora-double';
import './erp-sale-refund';

const SALE = [{ id: 'sale-1', sale_number: '20261007-0003', status: 'completed', total: 6000 }];
const LEGS = [{
  payment_id: 'pay-card', sort_order: 0, payment_method_id: 'pm-card',
  payment_method_name: 'Tarjeta', payment_method_type: 'card',
  charged: 6000, refunded: 0, remaining: 6000, refundable: 1, reason: '',
}];
const METHODS = [{ id: 'pm-card', name: 'Tarjeta', type: 'card' }];

class FakeReversalNotice extends HTMLElement {
  saleId?: string;
  action?: string;
  seenOnConnect?: Record<string, unknown>;
  connectedCallback(): void { this.seenOnConnect = { saleId: this.saleId, action: this.action }; }
}
if (!customElements.get('erp-fake-reversal-notice')) customElements.define('erp-fake-reversal-notice', FakeReversalNotice);

type Refund = HTMLElement & { updateComplete: Promise<unknown>; saleId?: string };

let commands: string[] = [];

async function mount(opts: { fillers?: string[]; slotFail?: boolean } = {}): Promise<Refund> {
  commands = [];
  const table: Record<string, unknown[]> = {
    'sales.get': SALE, 'sales.refund_options': LEGS, 'sales.payment_methods': METHODS,
  };
  installErploraDouble({
    queries: Object.fromEntries(Object.entries(table).map(([name, rows]) => [name, () => rows])),
    command: async (name: string) => { commands.push(name); return { refund_id: 'ref-1', refund_ref: 'ref-1', fully_refunded: 1 }; },
    loadSlot: (slot: string) => {
      if (opts.slotFail) throw new Error('boom');
      return slot === 'sales.reversal.notice' ? (opts.fillers ?? []).map((component) => ({ component })) : [];
    },
    locale: 'es',
  });
  const el = document.createElement('erp-sale-refund') as Refund;
  el.saleId = 'sale-1';
  document.body.appendChild(el);
  for (let i = 0; i < 4; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
  return el;
}

const hole = (el: Refund): HTMLElement | null =>
  el.shadowRoot!.querySelector('[data-testid="refund-reversal-notice"]');

afterEach(() => { document.body.innerHTML = ''; });

describe('refund window — what else is undone is read before confirming (services#157)', () => {
  it('mounts the filler with the sale and the door already set when it connects', async () => {
    const el = await mount({ fillers: ['erp-fake-reversal-notice'] });
    const filler = hole(el)?.querySelector('erp-fake-reversal-notice') as FakeReversalNotice | null;
    expect(filler, 'the filler is in the hole').toBeTruthy();
    expect(filler!.seenOnConnect).toEqual({ saleId: 'sale-1', action: 'refund' });
  });

  it('the hole sits above the confirm button, where the thumb already is', async () => {
    const el = await mount({ fillers: ['erp-fake-reversal-notice'] });
    const confirm = el.shadowRoot!.querySelector('[data-testid="refund-confirm"]')!;
    expect(hole(el)!.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('re-rendering (typing the reason) keeps a single instance', async () => {
    const el = await mount({ fillers: ['erp-fake-reversal-notice'] });
    (el as unknown as { reason: string }).reason = 'Se arrepintió';
    await el.updateComplete;
    (el as unknown as { reason: string }).reason = 'Se arrepintió del bono';
    await el.updateComplete;
    expect(el.shadowRoot!.querySelectorAll('erp-fake-reversal-notice').length).toBe(1);
  });

  it('with nobody filling it there is no hole, and the refund goes on the same', async () => {
    const el = await mount();
    expect(hole(el)).toBeNull();
    expect(el.shadowRoot!.querySelector('[data-testid="refund-confirm"]')).toBeTruthy();
  });

  it('a failing slot registry leaves no hole instead of breaking the window', async () => {
    const el = await mount({ fillers: ['erp-fake-reversal-notice'], slotFail: true });
    expect(hole(el)).toBeNull();
    expect(el.shadowRoot!.querySelector('[data-testid="refund-form"]')).toBeTruthy();
  });
});
