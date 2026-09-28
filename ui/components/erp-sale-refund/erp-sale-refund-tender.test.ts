// sales#166 / ADR-0386 — the REFUND screen hosts `sales.refund.tender`, one hole per covered line.
//
// sales#160 gave back the MONEY. The other half of ADR-0386 is giving back the SESSION, and
// `sales` cannot do it alone: `sales_sale_item.is_covered` (migration 025) says another tender
// already paid the line and never which one, and reading `services` directly would break the very
// modularity ADR-0386 protects — a hub without `services` has to keep charging and refunding the
// same. So the screen paints the covered lines and cedes the hole, exactly like the till does with
// `sales.pos.tender` (sales#162).
//
// What the host owes the filler is four values, two ears and one hand-back:
//
//   sale-id · line-ref · service-id · line-index
//   `erp:tender-refund-armed`    → this line's tender goes back (with the warning to show first)
//   `erp:tender-refund-disarmed` → it does not
//   `erp:tender-refund-commit`   → the refund document EXISTS; here is its stable reference
//
// 🔴 THE HOST LEARNS NOTHING ABOUT VOUCHERS, and the last two tests are why the rest may exist: a
// hub with nobody filling the slot gets no section, no calls and the exact same refund payload.
//
// 🔴 AND EXPIRY WARNS, IT NEVER BLOCKS. `services.packages.refund_check` answers `voucher_expired`
// with its date, and ADR-0386 is explicit: a return undoes a past act, so weighing validity
// against today would lose the customer the session AND the money path with it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installErploraDouble } from '../../test/erplora-double';
import { forgetPendingRefundKey } from '../../lib/refund-pending-key';
import './erp-sale-refund';

const SALE = [{ id: 'sale-1', sale_number: '20260825-0007', status: 'completed', total: 1800 }];
const LEGS = [{
  payment_id: 'pay-cash', sort_order: 0, payment_method_id: 'pm-cash',
  payment_method_name: 'Efectivo', payment_method_type: 'cash',
  charged: 1800, refunded: 0, remaining: 1800, refundable: 1, reason: '',
}];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash' }];
/** One line paid in money and one paid by an external tender (`is_covered`). */
const LINES = [
  { id: 'item-1', product_id: 's-corte', product_name: 'Corte', is_covered: 1 },
  { id: 'item-2', product_id: 'p-champu', product_name: 'Champú', is_covered: 0 },
];

/** Every slot literal the screen asked the SDK for, in order. */
let slotsAsked: string[] = [];
let refundSdk: ReturnType<typeof installErploraDouble>;
/** What the screen asked for, as the shared double records it. */
const queriesAsked = (): string[] => refundSdk.reads.map((r) => r.name);
let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** What each filler instance was handed, and what it was told when the document existed. */
interface FakeFiller extends HTMLElement {
  saleId?: string;
  lineRef?: string;
  serviceId?: string;
  lineIndex?: number;
  /** The values that were already set on the element when it entered the DOM. */
  seenOnConnect?: Record<string, unknown>;
  commits: Array<Record<string, unknown>>;
}

/** How the fake filler answers the commit: resolve, reject, or say nothing at all. */
let commitBehaviour: 'silent' | 'ok' | 'fail' = 'silent';
let commitResolved: (() => void) | undefined;

class FakeTenderRefund extends HTMLElement implements FakeFiller {
  saleId?: string;
  lineRef?: string;
  serviceId?: string;
  lineIndex?: number;
  seenOnConnect?: Record<string, unknown>;
  commits: Array<Record<string, unknown>> = [];

  connectedCallback(): void {
    this.seenOnConnect = {
      saleId: this.saleId, lineRef: this.lineRef,
      serviceId: this.serviceId, lineIndex: this.lineIndex,
    };
    this.addEventListener('erp:tender-refund-commit', (e: Event) => {
      const d = (e as CustomEvent<{ waitFor?: (p: Promise<unknown>) => void }>).detail;
      this.commits.push({ ...d });
      if (commitBehaviour === 'silent') return;
      d?.waitFor?.(new Promise<void>((resolve, reject) => {
        commitResolved = () => (commitBehaviour === 'fail' ? reject(new Error('services.redemption_not_settled')) : resolve());
      }));
    });
  }
}
if (!customElements.get('erp-fake-tender-refund')) {
  customElements.define('erp-fake-tender-refund', FakeTenderRefund);
}

interface Options {
  fillers?: boolean; lines?: unknown[]; linesFail?: boolean;
  /** sales#456: the first `sales.refund` loses its answer; the hub has the document `ref-7`. */
  lostAnswer?: boolean;
}

function install(opts: Options = {}): void {
  const { fillers = true, lines = LINES, linesFail = false, lostAnswer = false } = opts;
  let answerLost = false;
  slotsAsked = [];
  commands = [];
  commitBehaviour = 'silent';
  commitResolved = undefined;
  const table: Record<string, unknown[]> = {
    'sales.get': SALE, 'sales.refund_options': LEGS, 'sales.payment_methods': METHODS,
    'sales.lines': lines,
    'sales.refund_by_idempotency_key': [{ id: 'ref-7', sale_id: 'sale-1', total: 1800 }],
  };
  refundSdk = installErploraDouble({
    queries: Object.fromEntries(Object.entries(table).map(([name, rows]) => [name, () => {
      if (linesFail && name === 'sales.lines') throw new Error('boom');
      return rows;
    }])),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (lostAnswer && !answerLost) {
        answerLost = true;
        throw Object.assign(new Error('the hub did not answer'), { code: 'server_unavailable', outcomeUnknown: true });
      }
      return { refund_id: 'ref-9', refund_ref: 'ref-9', total: 1800, fully_refunded: 1, already: 0 };
    },
    loadSlot: (slot: string) => {
      slotsAsked.push(slot);
      if (!fillers) return [];
      return slot === 'sales.refund.tender' ? [{ component: 'erp-fake-tender-refund' }] : [];
    },
    locale: 'es',
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2).replace('.', ',')} €`,
    // The catalogue answers with the KEY: what is asserted below is the contract, never the prose.
  });
}

type Refund = HTMLElement & {
  updateComplete: Promise<unknown>;
  saleId?: string;
  reason: string;
  confirm(): Promise<void>;
};

async function mount(): Promise<Refund> {
  const el = document.createElement('erp-sale-refund') as Refund;
  el.saleId = 'sale-1';
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** The loads are asynchronous; let the microqueue drain and the element re-render. */
async function settle(el: Refund): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
}

const holes = (el: Refund): HTMLElement[] =>
  [...(el.shadowRoot?.querySelectorAll('.refund-tender-line') ?? [])] as HTMLElement[];
const fillersOf = (el: Refund): FakeFiller[] =>
  [...(el.shadowRoot?.querySelectorAll('erp-fake-tender-refund') ?? [])] as unknown as FakeFiller[];
const confirmButton = (el: Refund): HTMLElement | null =>
  el.shadowRoot?.querySelector('ion-button.refund-confirm') as HTMLElement | null;

/** Fills in the reason so the only thing under test is the tender side. */
function ready(el: Refund): void {
  (el as unknown as { reason: string }).reason = 'Se arrepintió';
}

beforeEach(() => install());
afterEach(() => {
  document.body.innerHTML = '';
  forgetPendingRefundKey('sale-1');
});

describe('the hole: one COVERED line, one slot', () => {
  it('asks for the slot by its literal, the way the till asks for its own', async () => {
    await mount();
    expect(slotsAsked).toContain('sales.refund.tender');
  });

  it('mounts ONE instance per covered line, and none on the line paid in money', async () => {
    const el = await mount();
    expect(holes(el)).toHaveLength(1);
    expect(holes(el)[0].dataset.line).toBe('item-1');
    expect(fillersOf(el)).toHaveLength(1);
  });

  it('has the four properties set BEFORE the element enters the DOM', async () => {
    // The filler reads in `connectedCallback`: inserting it first would make it ask about an
    // empty sale and paint "nothing to give back here" over a session that does go back.
    const el = await mount();
    expect(fillersOf(el)[0].seenOnConnect).toEqual({
      saleId: 'sale-1', lineRef: 'item-1', serviceId: 's-corte', lineIndex: 0,
    });
  });

  it('numbers two lines of the SAME service, so each hole claims ITS own session', async () => {
    install({ lines: [
      { id: 'item-1', product_id: 's-corte', product_name: 'Corte', is_covered: 1 },
      { id: 'item-2', product_id: 's-corte', product_name: 'Corte', is_covered: 1 },
    ] });
    const el = await mount();
    expect(fillersOf(el).map((f) => f.seenOnConnect?.lineIndex)).toEqual([0, 1]);
  });

  it('keeps the MONEY refund standing when `sales.lines` fails', async () => {
    // Money is this screen's authority. A failure on the accessory side cannot leave the operator
    // unable to hand back the 18,00 € the customer is standing there waiting for.
    install({ linesFail: true });
    const el = await mount();
    expect(el.shadowRoot?.querySelector('ok-inline-feedback[tone="danger"]')).toBeNull();
    expect(confirmButton(el)).toBeTruthy();
    expect(holes(el)).toHaveLength(0);
  });
});

describe('the warning: read BEFORE confirming, and it does not block', () => {
  it('paints the filler warning next to the button', async () => {
    const el = await mount();
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1', warning: 'El bono caducó el 31/07' },
      bubbles: true, composed: true,
    }));
    await settle(el);
    const notice = el.shadowRoot?.querySelector('.rt-notice');
    expect(notice?.textContent).toContain('El bono caducó el 31/07');
  });

  it('an expired voucher WARNS but still lets the refund be confirmed (ADR-0386)', async () => {
    const el = await mount();
    ready(el);
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1', warning: 'El bono caducó el 31/07' },
      bubbles: true, composed: true,
    }));
    await settle(el);
    expect(confirmButton(el)?.getAttribute('data-blocked')).toBeNull();
  });

  it('drops the warning on disarm: what the filler undid stops being announced', async () => {
    const el = await mount();
    const f = fillersOf(el)[0];
    f.dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1', warning: 'El bono caducó el 31/07' }, bubbles: true, composed: true,
    }));
    await settle(el);
    f.dispatchEvent(new CustomEvent('erp:tender-refund-disarmed', {
      detail: { lineRef: 'item-1' }, bubbles: true, composed: true,
    }));
    await settle(el);
    expect(el.shadowRoot?.querySelector('.rt-notice')).toBeNull();
  });
});

describe('the document: the reference goes down to the filler, and the screen waits for it', () => {
  it('hands every filler `refund_ref` after `sales.refund` — the STABLE document id', async () => {
    const el = await mount();
    ready(el);
    await el.confirm();
    const commit = fillersOf(el)[0].commits[0];
    expect(commit.refundRef).toBe('ref-9');
    expect(commit.refundId).toBe('ref-9');
    expect(commit.saleId).toBe('sale-1');
    expect(typeof commit.waitFor).toBe('function');
  });

  it('sales#456: a refund recovered after «we can\'t tell» hands the filler the RECOVERED document', async () => {
    // The answer was lost, so `sales.refund` returned no `refund_ref`; the check by key found the
    // document. Without handing its id down, the voucher session would stay spent.
    install({ lostAnswer: true });
    const el = await mount();
    ready(el);
    await el.confirm();
    expect(commands).toHaveLength(1);
    const commit = fillersOf(el)[0].commits[0];
    expect(commit?.refundRef).toBe('ref-7');
    expect(commit?.refundId).toBe('ref-7');
  });

  it('also leaves the reference as a PROPERTY, for a filler that reads instead of listening', async () => {
    const el = await mount();
    ready(el);
    await el.confirm();
    const f = fillersOf(el)[0] as unknown as { refundRef?: string; refundId?: string };
    expect(f.refundRef).toBe('ref-9');
    expect(f.refundId).toBe('ref-9');
  });

  it('does NOT close while the filler is still giving the session back', async () => {
    // Closing here unmounts the filler mid-command, and the session stays spent with nobody at
    // the counter able to give it back.
    commitBehaviour = 'ok';
    const el = await mount();
    ready(el);
    let closed = false;
    el.addEventListener('refunded', () => { closed = true; });
    const done = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    expect(closed, 'not yet: the filler has not finished').toBe(false);
    commitResolved?.();
    await done;
    expect(closed).toBe(true);
  });

  it('keeps the MONEY already refunded and SAYS SO when the filler fails', async () => {
    commitBehaviour = 'fail';
    const el = await mount();
    ready(el);
    let closed = false;
    el.addEventListener('refunded', () => { closed = true; });
    const done = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    commitResolved?.();
    await done;
    const said = refundSdk.notices;
    expect(said.some((n) => n.type === 'success' && n.message === 'ui.refundDone')).toBe(true);
    expect(said.some((n) => n.type === 'error' && n.message === 'ui.refundTenderPending')).toBe(true);
    expect(closed, 'the sale IS refunded: the screen cannot stay open pretending otherwise').toBe(true);
    expect(commands.filter((c) => c.name === 'sales.refund')).toHaveLength(1);
  });
});

describe('a hub WITHOUT the owning module', () => {
  it('paints no section, asks for no lines and mounts nothing', async () => {
    install({ fillers: false });
    const el = await mount();
    expect(holes(el)).toHaveLength(0);
    expect(el.shadowRoot?.querySelector('.rt-list')).toBeNull();
    expect(queriesAsked()).not.toContain('sales.lines');
  });

  it('sends the refund EXACTLY as it did before the slot existed', async () => {
    install({ fillers: false });
    const el = await mount();
    ready(el);
    await el.confirm();
    const sent = commands.find((c) => c.name === 'sales.refund');
    expect(Object.keys(sent?.payload ?? {}).sort())
      .toEqual(['allocations', 'idempotency_key', 'reason', 'sale_id']);
  });
});
