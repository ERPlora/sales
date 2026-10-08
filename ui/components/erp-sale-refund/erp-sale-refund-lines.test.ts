// services#158 — the refund window says WHICH lines go back, not only how much money.
//
// A 70,00 € ticket: a haircut (20,00 €) and a 5-session voucher (50,00 €). The customer returns only
// the voucher. Before this, the window only split money by tender, `sale.refunded` named no line and
// Services could only void the voucher when the WHOLE ticket went back: the customer kept a voucher
// she had been refunded. Now the operator marks the voucher in «Qué se devuelve», the proposal
// becomes its price, and `sales.refund` carries the line.
import { afterEach, describe, expect, it } from 'vitest';
import esCatalog from '../../../locales/es.json';
import enCatalog from '../../../locales/en.json';
import { installErploraDouble } from '../../test/erplora-double';
import { refundErrorKey } from './erp-sale-refund';
import './erp-sale-refund';

const SALE = [{ id: 'sale-1', sale_number: '20261008-0004', status: 'completed', total: 7000 }];
const CARD = {
  payment_id: 'pay-card', sort_order: 0, payment_method_id: 'pm-card',
  payment_method_name: 'Tarjeta', payment_method_type: 'card',
  charged: 7000, refunded: 0, remaining: 7000, refundable: 1, reason: '',
};
const METHODS = [{ id: 'pm-card', name: 'Tarjeta', type: 'card' }];
const LINES = [
  { id: 'li-cut', product_id: 'svc-cut', product_name: 'Corte', line_total: 2000, is_covered: 0 },
  { id: 'li-voucher', product_id: 'pkg-5', product_name: 'Bono 5 sesiones', line_total: 5000, is_covered: 0 },
];

type Refund = HTMLElement & {
  updateComplete: Promise<unknown>;
  saleId?: string;
  draft: Record<string, { amount: number; to?: string }>;
  reason: string;
  confirm(): Promise<void>;
};

interface Opts {
  legs?: unknown[];
  lines?: unknown[];
  returned?: unknown[];
  linesFail?: boolean;
  returnedFail?: boolean;
  refuseWith?: string;
}

let sent: Array<{ name: string; payload: Record<string, unknown> }> = [];
let notices: Array<{ type: string; message: string }> = [];

async function mount(opts: Opts = {}): Promise<Refund> {
  sent = [];
  notices = [];
  const table: Record<string, unknown[]> = {
    'sales.get': SALE,
    'sales.refund_options': opts.legs ?? [CARD],
    'sales.payment_methods': METHODS,
    'sales.lines': opts.lines ?? LINES,
    'sales.refund_lines': opts.returned ?? [],
  };
  installErploraDouble({
    queries: Object.fromEntries(Object.entries(table).map(([name, rows]) => [name, () => {
      if (opts.linesFail && name === 'sales.lines') throw new Error('boom');
      if (opts.returnedFail && name === 'sales.refund_lines') throw new Error('boom');
      return rows;
    }])),
    command: async (name: string, payload: Record<string, unknown>) => {
      sent.push({ name, payload });
      if (opts.refuseWith) throw Object.assign(new Error('refused'), { code: opts.refuseWith });
      return { refund_id: 'ref-1', refund_ref: 'ref-1' };
    },
    notify: (n) => { notices.push(n as { type: string; message: string }); },
    locale: 'es',
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2).replace('.', ',')} €`,
    // The catalogue answers with the KEY: what is asserted is the contract, never the prose.
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

const box = (el: Refund, id: string): HTMLElement | null =>
  el.shadowRoot!.querySelector(`[data-testid="refund-line-${id}"] ion-checkbox`);

async function mark(el: Refund, id: string, checked = true): Promise<void> {
  box(el, id)!.dispatchEvent(new CustomEvent('ionChange', { detail: { checked }, bubbles: true, composed: true }));
  await el.updateComplete;
}

const total = (el: Refund): string =>
  el.shadowRoot!.querySelector('[data-testid="refund-total"]')?.textContent?.trim() ?? '';

afterEach(() => { document.body.innerHTML = ''; });

describe('«Qué se devuelve»: the lines of the ticket, marked by the operator (services#158)', () => {
  it('lists every line paid in money, unmarked, with its name', async () => {
    const el = await mount();
    const block = el.shadowRoot!.querySelector('[data-testid="refund-lines"]');
    expect(block, 'the block is painted').toBeTruthy();
    expect(block!.textContent).toContain('ui.refundLinesTitle');
    expect(block!.textContent).toContain('Corte');
    expect(block!.textContent).toContain('Bono 5 sesiones');
    expect((box(el, 'li-cut') as HTMLElement & { checked?: boolean }).checked).toBeFalsy();
    expect((box(el, 'li-voucher') as HTMLElement & { checked?: boolean }).checked).toBeFalsy();
  });

  it('opens proposing the whole refund, as before', async () => {
    const el = await mount();
    expect(total(el)).toBe('70,00 €');
  });

  it('marking the voucher proposes ITS price', async () => {
    const el = await mount();
    await mark(el, 'li-voucher');
    expect(el.draft['pay-card']?.amount).toBe(5000);
    expect(total(el)).toBe('50,00 €');
  });

  it('un-marking every line goes back to the whole refund', async () => {
    const el = await mount();
    await mark(el, 'li-voucher');
    await mark(el, 'li-voucher', false);
    expect(total(el)).toBe('70,00 €');
  });

  it('the proposal never goes over what is left to refund', async () => {
    const el = await mount({ legs: [{ ...CARD, refunded: 4000, remaining: 3000 }] });
    await mark(el, 'li-voucher');
    expect(el.draft['pay-card']?.amount).toBe(3000);
  });

  it('the refund carries the marked line', async () => {
    const el = await mount();
    await mark(el, 'li-voucher');
    el.reason = 'Devuelve el bono';
    await el.confirm();
    const call = sent.find((c) => c.name === 'sales.refund');
    expect(call?.payload.lines).toEqual([{ line_id: 'li-voucher' }]);
  });

  it('with nothing marked only money goes back: no `lines` in the payload', async () => {
    const el = await mount();
    el.reason = 'Compensación';
    await el.confirm();
    const call = sent.find((c) => c.name === 'sales.refund');
    expect(call).toBeTruthy();
    expect('lines' in (call!.payload)).toBe(false);
  });

  it('a line an earlier refund took back is shown as such and cannot be marked again', async () => {
    const el = await mount({ returned: [{ sale_item_id: 'li-voucher', refund_id: 'ref-0' }] });
    const row = el.shadowRoot!.querySelector('[data-testid="refund-line-li-voucher"]')!;
    expect(row.textContent).toContain('ui.refundLineAlreadyReturned');
    expect(box(el, 'li-voucher')!.hasAttribute('disabled')).toBe(true);
    await mark(el, 'li-voucher');
    expect(total(el), 'the proposal does not follow a line that cannot be marked').toBe('70,00 €');
    el.reason = 'otra vez';
    await el.confirm();
    expect(sent.find((c) => c.name === 'sales.refund')?.payload.lines).toBeUndefined();
  });

  it('a line paid by another tender is not offered here (its own hole gives it back)', async () => {
    const el = await mount({ lines: [...LINES, { id: 'li-covered', product_id: 'svc-cut', product_name: 'Corte bono', line_total: 0, is_covered: 1 }] });
    expect(el.shadowRoot!.querySelector('[data-testid="refund-line-li-covered"]')).toBeNull();
  });

  it('when the lines cannot be read, the block is not painted and the money refund stands', async () => {
    const el = await mount({ linesFail: true });
    expect(el.shadowRoot!.querySelector('[data-testid="refund-lines"]')).toBeNull();
    el.reason = 'Compensación';
    await el.confirm();
    expect(sent.some((c) => c.name === 'sales.refund')).toBe(true);
  });

  it('when what went back earlier cannot be read, the lines are still offered (the server refuses a repeat)', async () => {
    const el = await mount({ returnedFail: true });
    expect(box(el, 'li-voucher')).toBeTruthy();
  });

  it('a line refused as already returned is told by its CODE', async () => {
    const el = await mount({ refuseWith: 'sales.refund_line_already_returned' });
    await mark(el, 'li-voucher');
    el.reason = 'Devuelve el bono';
    await el.confirm();
    expect(notices).toContainEqual(expect.objectContaining({ type: 'error', message: 'ui.refundLineAlreadyReturnedError' }));
  });
});

describe('the codes of the lines, and their words in en + es', () => {
  it('each code has its own sentence', () => {
    expect(refundErrorKey('sales.refund_line_already_returned')).toBe('ui.refundLineAlreadyReturnedError');
    expect(refundErrorKey('sales.refund_line_unknown')).toBe('ui.refundLineUnknown');
    expect(refundErrorKey('sales.refund_line_duplicated')).toBe('ui.refundLineDuplicated');
  });

  it('every new key exists in English AND Spanish', () => {
    const keys = [
      'refundLinesTitle', 'refundLinesHint', 'refundLineAlreadyReturned',
      'refundLineAlreadyReturnedError', 'refundLineUnknown', 'refundLineDuplicated',
    ];
    for (const k of keys) {
      expect((enCatalog.ui as Record<string, string>)[k], `en.${k}`).toBeTruthy();
      expect((esCatalog.ui as Record<string, string>)[k], `es.${k}`).toBeTruthy();
    }
  });
});
