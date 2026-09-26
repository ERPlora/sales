// sales#414 — every field of the refund form shows its BOX.
//
// The Hub shell pins `mode: 'ios'` (ADR-0143), and there Ionic never paints a box on an
// ion-input/ion-select/ion-textarea with no `fill`: the amount of each leg, where the money goes
// when the original method is gone, and the reason rendered as loose text. The combination that
// paints on its own is `fill="outline" mode="md"` — the convention of the shell (hub#760), of the
// modules swept by ERPlora/pm#152 and the one the module-toolkit gate asks for (pm#479).
import { afterEach, describe, expect, it } from 'vitest';
import { installErploraDouble } from '../../test/erplora-double';
import './erp-sale-refund';

// The card leg can no longer be paid back to the card, so its destination select is on screen.
const LEGS = [
  {
    payment_id: 'pay-card', sort_order: 0, payment_method_id: 'pm-card',
    payment_method_name: 'Tarjeta', payment_method_type: 'card',
    charged: 5000, refunded: 0, remaining: 5000, refundable: 0, reason: 'method_unavailable',
  },
  {
    payment_id: 'pay-cash', sort_order: 1, payment_method_id: 'pm-cash',
    payment_method_name: 'Efectivo', payment_method_type: 'cash',
    charged: 2000, refunded: 0, remaining: 2000, refundable: 1, reason: '',
  },
];
const SALE = [{ id: 'sale-1', sale_number: '20260824-0007', status: 'completed', total: 7000 }];
const METHODS = [
  { id: 'pm-card', name: 'Tarjeta', type: 'card' },
  { id: 'pm-cash', name: 'Efectivo', type: 'cash' },
];

type Refund = HTMLElement & { updateComplete: Promise<unknown>; saleId?: string };

async function mount(): Promise<Refund> {
  const table: Record<string, unknown[]> = {
    'sales.get': SALE, 'sales.refund_options': LEGS, 'sales.payment_methods': METHODS,
  };
  installErploraDouble({
    queries: Object.fromEntries(Object.entries(table).map(([name, rows]) => [name, () => rows])),
    command: async () => ({ refund_id: 'ref-1', refund_ref: 'ref-1' }),
    locale: 'es',
  });
  const el = document.createElement('erp-sale-refund') as Refund;
  el.saleId = 'sale-1';
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

function expectBox(f: Element): void {
  const id = f.getAttribute('data-testid') ?? f.tagName;
  expect(f.getAttribute('fill'), `${id}: no fill → no box in ios mode`).toBe('outline');
  expect(f.getAttribute('mode'), `${id}: fill without mode="md" never paints in ios mode`).toBe('md');
}

afterEach(() => { document.body.innerHTML = ''; });

describe('refund form: every field has its box in ios mode (sales#414)', () => {
  it('the amounts, the destination of a dead leg and the reason are all boxed', async () => {
    const el = await mount();
    const form = el.shadowRoot!.querySelector('[data-testid="refund-form"]');
    expect(form, 'the refund form is on screen').toBeTruthy();
    const fields = [...form!.querySelectorAll('ion-input, ion-select, ion-textarea')];
    expect(fields.map((f) => f.getAttribute('data-testid'))).toEqual([
      'refund-amount-pay-card', 'refund-destination-pay-card', 'refund-amount-pay-cash', 'refund-reason',
    ]);
    for (const f of fields) expectBox(f);
    // Its label sits on the top border and would run into the «method unavailable» line above.
    const destination = form!.querySelector('[data-testid="refund-destination-pay-card"]')!;
    expect(getComputedStyle(destination).marginTop, 'no room above the destination label').toBe('12px'); // .75rem
  });
});
