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
import { forgetPendingRefundKey, pendingRefundKey, rememberPendingRefundKey } from '../../lib/refund-pending-key';
import esCatalog from '../../../locales/es.json';
import enCatalog from '../../../locales/en.json';
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
  /** The money legs; the default has the whole 18,00 € still to give back. */
  legs?: unknown[];
  /** The slot registry itself fails. */
  slotFail?: boolean;
  /** sales#465: `sales.refund` does not answer until `releaseRefund()` - the hub is still busy. */
  hold?: boolean;
  /** `sales.refund` answers with a refusal: nothing was written. */
  refuse?: boolean;
  /** Runs when the screen asks for the slot - after the recovery, before the lines are read. */
  onLoadSlot?: () => void;
  /** sales#507: the refund documents already on record, by sale, newest first (`sales.refunds`). */
  refunds?: Record<string, unknown[]>;
  /** sales#507: `sales.refunds` fails. */
  refundsFail?: boolean;
}

/** Two refund documents on sale-1, newest first - as `sales.refunds` orders them. */
const REFUNDS: Record<string, unknown[]> = {
  'sale-1': [
    { id: 'ref-5', sale_id: 'sale-1', total: 800 },
    { id: 'ref-3', sale_id: 'sale-1', total: 1000 },
  ],
  'sale-2': [{ id: 'ref-22', sale_id: 'sale-2', total: 1800 }],
};

/** Lets a held `sales.refund` go on (and answer, or lose its answer with `lostAnswer`). */
let releaseRefund: (() => void) | undefined;

function install(opts: Options = {}): void {
  const { fillers = true, lines = LINES, linesFail = false, lostAnswer = false, legs = LEGS, slotFail = false, hold = false, refuse = false, onLoadSlot, refunds = REFUNDS, refundsFail = false } = opts;
  let answerLost = false;
  const gate = hold ? new Promise<void>((resolve) => { releaseRefund = resolve; }) : Promise.resolve();
  slotsAsked = [];
  commands = [];
  commitBehaviour = 'silent';
  commitResolved = undefined;
  const table: Record<string, unknown[]> = {
    'sales.get': SALE, 'sales.refund_options': legs, 'sales.payment_methods': METHODS,
    'sales.lines': lines,
    'sales.refund_by_idempotency_key': [{ id: 'ref-7', sale_id: 'sale-1', total: 1800 }],
  };
  refundSdk = installErploraDouble({
    queries: {
      ...Object.fromEntries(Object.entries(table).map(([name, rows]) => [name, () => {
        if (linesFail && name === 'sales.lines') throw new Error('boom');
        return rows;
      }])),
      'sales.refunds': (params) => {
        if (refundsFail) throw new Error('boom');
        return refunds[String(params?.sale_id ?? '')] ?? [];
      },
    },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      await gate;
      if (refuse) throw Object.assign(new Error('nothing to return'), { code: 'sales.refund_nothing_to_return' });
      if (lostAnswer && !answerLost) {
        answerLost = true;
        throw Object.assign(new Error('the hub did not answer'), { code: 'server_unavailable', outcomeUnknown: true });
      }
      return { refund_id: 'ref-9', refund_ref: 'ref-9', total: 1800, fully_refunded: 1, already: 0 };
    },
    loadSlot: (slot: string) => {
      slotsAsked.push(slot);
      onLoadSlot?.();
      if (slotFail) throw new Error('boom');
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

// sales#462 — the screen is closed while a refund is in doubt and opened again; the check by key
// finds the document. The money half is settled (the legs say so), but the voucher session is not:
// the fillers that would have given it back died with the closed screen. The recovered document
// has to reach the NEW fillers, and the operator decides again what goes back, as on the first
// screen — or, when that side cannot even be read, the screen says it must be checked elsewhere.
describe('sales#462: reopened over a doubt that WAS recorded', () => {
  /** Every money leg already given back - as `sales.refund_options` answers it (refundable 0). */
  const ALL_BACK = [{ ...LEGS[0], refunded: 1800, remaining: 0, refundable: 0, reason: 'already_refunded' }];

  const giveBackButton = (el: Refund): HTMLElement | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-tender-commit"]') as HTMLElement | null;
  const tenderPending = (el: Refund): Element | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-tender-pending"]') ?? null;

  /** The filler says its line goes back — what the services hole does by default. */
  async function arm(el: Refund): Promise<void> {
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1' }, bubbles: true, composed: true,
    }));
    await settle(el);
  }

  /** The earlier screen wrote its key down before `sales.refund` left, and never heard back. */
  function openOverDoubt(opts: Options = {}): void {
    install({ legs: ALL_BACK, ...opts });
    rememberPendingRefundKey('sale-1', 'refund-sale-1-closed');
  }

  it('offers to give back what was paid another way, even with no money left to refund', async () => {
    openOverDoubt();
    const el = await mount();
    expect(el.shadowRoot?.querySelector('[data-testid="refund-recovered"]')).toBeTruthy();
    // sales#492: no money left, so no money button at all (it used to be a blocked «Refund 0,00 €»).
    expect(confirmButton(el)).toBeNull();
    await arm(el);
    expect(giveBackButton(el)).toBeTruthy();
  });

  it('hands the filler the RECOVERED document when the operator gives it back, and writes no refund', async () => {
    openOverDoubt();
    const el = await mount();
    await arm(el);
    giveBackButton(el)?.click();
    await settle(el);
    const commit = fillersOf(el)[0].commits[0];
    expect(commit?.refundRef).toBe('ref-7');
    expect(commit?.refundId).toBe('ref-7');
    expect(commit?.saleId).toBe('sale-1');
    expect((fillersOf(el)[0] as unknown as { refundRef?: string }).refundRef).toBe('ref-7');
    expect(commands.filter((c) => c.name === 'sales.refund')).toHaveLength(0);
    expect(refundSdk.notices.some((n) => n.type === 'success' && n.message === 'ui.refundTenderGivenBack')).toBe(true);
    expect(giveBackButton(el), 'done: offering it again would be a second give-back').toBeNull();
    expect(tenderPending(el), 'it went back: no «check it in its module»').toBeNull();
  });

  it('offers nothing while no line goes back: the operator un-ticked it, or it already came back', async () => {
    openOverDoubt();
    const el = await mount();
    expect(giveBackButton(el)).toBeNull();
    await arm(el);
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-disarmed', {
      detail: { lineRef: 'item-1' }, bubbles: true, composed: true,
    }));
    await settle(el);
    expect(giveBackButton(el)).toBeNull();
  });

  it('offers nothing on a screen with money left and no recovered document: there the refund button commits', async () => {
    install();
    const el = await mount();
    ready(el);
    await arm(el);
    expect(confirmButton(el)).toBeTruthy();
    expect(giveBackButton(el)).toBeNull();
  });

  it('a second tap while the filler is still working gives nothing back twice', async () => {
    openOverDoubt();
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    giveBackButton(el)?.click();
    await new Promise((r) => setTimeout(r, 0));
    giveBackButton(el)?.click();
    commitResolved?.();
    await settle(el);
    expect(fillersOf(el)[0].commits).toHaveLength(1);
  });

  it('SAYS SO, on the screen, when the filler could not give it back', async () => {
    openOverDoubt();
    commitBehaviour = 'fail';
    const el = await mount();
    await arm(el);
    giveBackButton(el)?.click();
    await new Promise((r) => setTimeout(r, 0));
    commitResolved?.();
    await settle(el);
    expect(tenderPending(el)?.textContent).toContain('ui.refundTenderPending');
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderGivenBack')).toBe(false);
    expect(commands.filter((c) => c.name === 'sales.refund')).toHaveLength(0);
    // A filler commits once per screen: a second offer could only announce a give-back that never
    // happens, and wipe the warning that says to check it.
    expect(giveBackButton(el), 'failed: offering it again would claim a give-back').toBeNull();
  });

  it('when the lines paid another way cannot be read, says they must be checked in their module', async () => {
    openOverDoubt({ linesFail: true });
    const el = await mount();
    expect(tenderPending(el)?.textContent).toContain('ui.refundTenderPending');
  });

  it('says the same when the slot registry itself cannot be read', async () => {
    openOverDoubt({ slotFail: true });
    const el = await mount();
    expect(tenderPending(el)?.textContent).toContain('ui.refundTenderPending');
  });

  it('the same screen moved to ANOTHER sale does not hand the first sale\'s document', async () => {
    openOverDoubt();
    const el = await mount();
    install({ legs: ALL_BACK });
    el.saleId = 'sale-2';
    await settle(el);
    expect(el.shadowRoot?.querySelector('[data-testid="refund-recovered"]')).toBeNull();
    await arm(el);
    giveBackButton(el)?.click();
    await settle(el);
    // sales#507: sale-2 has no money left either, so its own give-back is offered - with ITS document.
    expect(fillersOf(el)[0].commits.map((c) => c.refundRef)).toEqual(['ref-22']);
  });

  it('the same screen moved to another recovered sale whose lines DO read carries no stale warning', async () => {
    openOverDoubt({ linesFail: true });
    const el = await mount();
    expect(tenderPending(el)).toBeTruthy();
    install({ legs: ALL_BACK });
    rememberPendingRefundKey('sale-2', 'refund-sale-2-closed');
    try {
      el.saleId = 'sale-2';
      await settle(el);
      expect(tenderPending(el)).toBeNull();
    } finally {
      forgetPendingRefundKey('sale-2');
    }
  });

  it('no such warning when the lines cannot be read on a screen that recovered nothing', async () => {
    install({ legs: ALL_BACK, linesFail: true });
    const el = await mount();
    expect(tenderPending(el)).toBeNull();
  });

  it('no such warning when nobody fills the hole: there is nothing to give back', async () => {
    openOverDoubt({ fillers: false });
    const el = await mount();
    expect(tenderPending(el)).toBeNull();
    expect(giveBackButton(el)).toBeNull();
  });

  // sales#492 — the money already went back entirely. The screen used to keep asking for it: a red
  // «type how much goes back» the cashier had nothing to type for, and a «Refund 0,00 €» button
  // that did nothing (painted red, as if live, in `md`). With no money left, the money half says
  // so in a neutral tone and the only action left is the give-back.
  describe('sales#492: no money left to refund', () => {
    const noMoneyLeft = (el: Refund): Element | null =>
      el.shadowRoot?.querySelector('[data-testid="refund-no-money-left"]') ?? null;
    const moneyAsk = (el: Refund): Element[] => [
      ...(el.shadowRoot?.querySelectorAll(
        '[data-testid="refund-blocked"], ion-button.refund-confirm, ion-input.refund-amount, ion-textarea.refund-reason, [data-testid="refund-propose-all"], [data-testid="refund-total"]',
      ) ?? []),
    ];

    it('reopened over the recovered document: no money prompt, no 0,00 button, the give-back is the action', async () => {
      openOverDoubt();
      const el = await mount();
      await arm(el);
      expect(moneyAsk(el).map((n) => n.getAttribute('data-testid') ?? n.className)).toEqual([]);
      expect(noMoneyLeft(el)?.textContent).toContain('ui.refundNoMoneyLeft');
      expect(noMoneyLeft(el)?.getAttribute('tone'), 'neutral, never an error').toBe('info');
      expect(giveBackButton(el)).toBeTruthy();
      // The split still says WHY: the leg reads «already refunded», which is what the cashier checks.
      expect(el.shadowRoot?.querySelector('[data-testid="refund-leg-pay-cash"]')?.textContent)
        .toContain('ui.refundReasonAlreadyRefunded');
    });

    it('a sale whose money all went back, with nothing to give back either, asks for nothing', async () => {
      install({ legs: ALL_BACK, fillers: false });
      const el = await mount();
      expect(moneyAsk(el)).toHaveLength(0);
      expect(noMoneyLeft(el)).toBeTruthy();
    });

    it('still shows the warning a filler wants read before giving back, and asks no destination of a spent leg', async () => {
      openOverDoubt();
      const el = await mount();
      fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
        detail: { lineRef: 'item-1', warning: 'El bono caducó el 31/07' }, bubbles: true, composed: true,
      }));
      await settle(el);
      // The give-back is the only button left here, so this is where its warning has to be read.
      expect(el.shadowRoot?.querySelector('[data-testid="refund-tender-notice-item-1"]')?.textContent)
        .toContain('El bono caducó el 31/07');
      // A leg with nothing left sends no money anywhere: there is no destination to choose.
      expect(el.shadowRoot?.querySelector('ion-select.refund-destination')).toBeNull();
    });

    it('one cent still refundable keeps the whole money form, button included', async () => {
      install({ legs: [{ ...LEGS[0], refunded: 1799, remaining: 1 }] });
      const el = await mount();
      expect(noMoneyLeft(el)).toBeNull();
      expect(confirmButton(el)).toBeTruthy();
      expect(el.shadowRoot?.querySelector('ion-input.refund-amount')).toBeTruthy();
    });

    it('the notice exists in both languages', () => {
      const ui = (c: unknown): Record<string, string> => (c as { ui: Record<string, string> }).ui;
      expect(ui(enCatalog).refundNoMoneyLeft).toBeTruthy();
      expect(ui(esCatalog).refundNoMoneyLeft).toBeTruthy();
      expect(ui(esCatalog).refundNoMoneyLeft).not.toBe(ui(enCatalog).refundNoMoneyLeft);
    });
  });
});

// sales#507 — the money went back WITHOUT the session, and no attempt is left in doubt on this
// device: refunded from another device or by the assistant, the session un-ticked and claimed
// later, or its give-back failed the first time. With no money left there is no refund button to
// commit through, so the hole's ticked box did nothing. The give-back is offered here too, handing
// the hole the newest refund document of the sale - `sales.refund` demands money, so it cannot
// write a new one, and the session's return needs a document to point at (services ties one
// session to one document). As in Square or Shopify: what is left of a ticket goes back from it.
describe('sales#507: the money went back without the session', () => {
  const ALL_BACK = [{ ...LEGS[0], refunded: 1800, remaining: 0, refundable: 0, reason: 'already_refunded' }];
  const giveBackButton = (el: Refund): HTMLElement | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-tender-commit"]') as HTMLElement | null;
  const tenderPending = (el: Refund): Element | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-tender-pending"]') ?? null;
  const refundsReads = (): Array<Record<string, unknown> | undefined> =>
    refundSdk.reads.filter((r) => r.name === 'sales.refunds').map((r) => r.params);
  async function arm(el: Refund): Promise<void> {
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1' }, bubbles: true, composed: true,
    }));
    await settle(el);
  }
  async function giveBack(el: Refund): Promise<void> {
    giveBackButton(el)?.click();
    await new Promise((r) => setTimeout(r, 0));
    await settle(el);
    commitResolved?.();
    await settle(el);
  }

  it('offers the give-back while the hole says the session goes back', async () => {
    install({ legs: ALL_BACK });
    const el = await mount();
    expect(giveBackButton(el), 'nothing armed yet: nothing to hand').toBeNull();
    await arm(el);
    expect(giveBackButton(el)).toBeTruthy();
    expect(el.shadowRoot?.querySelector('[data-testid="refund-no-money-left"]')).toBeTruthy();
    expect(confirmButton(el)).toBeNull();
  });

  it('hands the hole the NEWEST refund document of THIS sale, and writes no refund', async () => {
    install({ legs: ALL_BACK });
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    await giveBack(el);
    expect(refundsReads()).toEqual([{ sale_id: 'sale-1' }]);
    const commit = fillersOf(el)[0].commits[0];
    expect(commit?.refundRef).toBe('ref-5');
    expect(commit?.refundId).toBe('ref-5');
    expect(commit?.saleId).toBe('sale-1');
    expect(commands.filter((c) => c.name === 'sales.refund')).toHaveLength(0);
    expect(refundSdk.notices.some((n) => n.type === 'success' && n.message === 'ui.refundTenderGivenBack')).toBe(true);
    expect(tenderPending(el)).toBeNull();
    expect(giveBackButton(el), 'done: offering it again would be a second give-back').toBeNull();
  });

  it('reads the documents only when the operator gives it back, not on every open', async () => {
    install({ legs: ALL_BACK });
    const el = await mount();
    await arm(el);
    expect(refundsReads()).toEqual([]);
  });

  it('SAYS SO, on the screen, when the hole could not give it back - and offers nothing twice', async () => {
    install({ legs: ALL_BACK });
    commitBehaviour = 'fail';
    const el = await mount();
    await arm(el);
    await giveBack(el);
    expect(fillersOf(el)[0].commits).toHaveLength(1);
    expect(tenderPending(el)?.textContent).toContain('ui.refundTenderPending');
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderGivenBack')).toBe(false);
    expect(giveBackButton(el)).toBeNull();
  });

  it('the documents cannot be read: hands nothing, says so on the screen, and lets the operator try again', async () => {
    install({ legs: ALL_BACK, refundsFail: true });
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    await giveBack(el);
    expect(fillersOf(el)[0].commits).toHaveLength(0);
    expect(tenderPending(el)?.textContent).toContain('ui.refundTenderPending');
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderGivenBack')).toBe(false);
    expect(giveBackButton(el), 'the hole has not been handed anything: it can still try').toBeTruthy();
    install({ legs: ALL_BACK });
    commitBehaviour = 'ok';
    await giveBack(el);
    expect(fillersOf(el)[0].commits.map((c) => c.refundRef)).toEqual(['ref-5']);
    expect(tenderPending(el)).toBeNull();
  });

  it('no refund document on record: hands nothing and never claims it went back', async () => {
    install({ legs: ALL_BACK, refunds: {} });
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    await giveBack(el);
    expect(fillersOf(el)[0].commits).toHaveLength(0);
    expect(tenderPending(el)?.textContent).toContain('ui.refundTenderPending');
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderGivenBack')).toBe(false);
  });

  it('the same screen moved to another sale after giving back offers that sale its own give-back', async () => {
    install({ legs: ALL_BACK });
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    await giveBack(el);
    expect(giveBackButton(el)).toBeNull();
    install({ legs: ALL_BACK, lines: [{ id: 'item-9', product_id: 's-corte', product_name: 'Corte', is_covered: 1 }] });
    commitBehaviour = 'ok';
    el.saleId = 'sale-2';
    await settle(el);
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-9' }, bubbles: true, composed: true,
    }));
    await settle(el);
    await giveBack(el);
    expect(fillersOf(el)[0].commits.map((c) => c.refundRef)).toEqual(['ref-22']);
  });

  it('once handed, asking again (the method is public) announces no second give-back', async () => {
    install({ legs: ALL_BACK });
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    await giveBack(el);
    const given = (): number => refundSdk.notices.filter((n) => n.message === 'ui.refundTenderGivenBack').length;
    expect(given()).toBe(1);
    await (el as unknown as { giveBackRecovered(): Promise<void> }).giveBackRecovered();
    await settle(el);
    expect(given()).toBe(1);
    expect(refundsReads()).toHaveLength(1);
  });

  it('a second tap while the documents are being read hands nothing twice', async () => {
    install({ legs: ALL_BACK });
    commitBehaviour = 'ok';
    const el = await mount();
    await arm(el);
    giveBackButton(el)?.click();
    giveBackButton(el)?.click();
    await new Promise((r) => setTimeout(r, 0));
    await settle(el);
    commitResolved?.();
    await settle(el);
    expect(refundsReads()).toHaveLength(1);
    expect(fillersOf(el)[0].commits).toHaveLength(1);
  });
});

// sales#465 — the screen is CLOSED while the hub is still answering `sales.refund`. The money goes
// back, but the holes that would have given the voucher session back were unmounted with the
// screen: handing them the document is handing it to nobody. What the screen showed as going back
// at the moment it closed is still owed, so the attempt stays pending and the next screen on that
// sale recovers the document and offers it again (the sales#462 button). And the same holds when
// that offer is closed without being taken.
describe('sales#465: closed while the hub was still answering', () => {
  const ALL_BACK = [{ ...LEGS[0], refunded: 1800, remaining: 0, refundable: 0, reason: 'already_refunded' }];
  const giveBackButton = (el: Refund): HTMLElement | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-tender-commit"]') as HTMLElement | null;
  const recoveredBanner = (el: Refund): Element | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-recovered"]') ?? null;

  async function arm(el: Refund): Promise<void> {
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1' }, bubbles: true, composed: true,
    }));
    await settle(el);
  }
  async function disarm(el: Refund, extra: { unknown?: boolean } = {}): Promise<void> {
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-disarmed', {
      detail: { lineRef: 'item-1', ...extra }, bubbles: true, composed: true,
    }));
    await settle(el);
  }

  /** Confirms, closes the screen while `sales.refund` is in flight, then lets the hub answer. */
  async function confirmAndClose(el: Refund): Promise<FakeFiller> {
    const filler = fillersOf(el)[0];
    const done = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    el.remove();
    releaseRefund?.();
    await done;
    return filler;
  }

  /** The next screen on the same sale: the money is already back. */
  async function reopen(opts: Options = {}): Promise<Refund> {
    install({ legs: ALL_BACK, ...opts });
    return mount();
  }

  it('the next screen on that sale recovers the document and offers to give the session back', async () => {
    install({ hold: true });
    const first = await mount();
    ready(first);
    await arm(first);
    await confirmAndClose(first);

    const el = await reopen();
    expect(recoveredBanner(el)).toBeTruthy();
    await arm(el);
    giveBackButton(el)?.click();
    await settle(el);
    expect(fillersOf(el)[0].commits[0]?.refundRef).toBe('ref-7');
  });

  it('does not hand the document to the holes of the closed screen', async () => {
    install({ hold: true });
    const first = await mount();
    ready(first);
    await arm(first);
    const deadFiller = await confirmAndClose(first);
    expect(deadFiller.commits).toHaveLength(0);
    expect((deadFiller as unknown as { refundRef?: string }).refundRef).toBeUndefined();
  });

  it('SAYS SO when the answer arrives: the money is back, the session waits for the refund to be reopened', async () => {
    install({ hold: true });
    const first = await mount();
    ready(first);
    await arm(first);
    let refunded = false;
    first.addEventListener('refunded', () => { refunded = true; });
    await confirmAndClose(first);
    expect(refunded, 'whoever listens to the screen still learns the sale was refunded').toBe(true);
    expect(refundSdk.notices.some((n) => n.type === 'success' && n.message === 'ui.refundDone')).toBe(true);
    expect(refundSdk.notices.some((n) => n.type === 'error' && n.message === 'ui.refundTenderReopen')).toBe(true);
  });

  it('the notice tells the operator to REOPEN the refund, in both languages', () => {
    // The double answers with the key; this anchors the words the till actually shows.
    const es = (esCatalog as { ui: Record<string, string> }).ui.refundTenderReopen;
    const en = (enCatalog as { ui: Record<string, string> }).ui.refundTenderReopen;
    expect(es).toMatch(/vuelve a abrir la devolución/i);
    expect(en).toMatch(/open this sale's refund again/i);
  });

  it('the same when the answer was lost and the check by key finds the document after closing', async () => {
    install({ hold: true, lostAnswer: true });
    const first = await mount();
    ready(first);
    await arm(first);
    await confirmAndClose(first);
    expect(pendingRefundKey('sale-1')).toBeTruthy();
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderReopen')).toBe(true);

    const el = await reopen();
    await arm(el);
    expect(giveBackButton(el)).toBeTruthy();
  });

  it('nothing is kept owed when no line was set to go back at the moment of closing', async () => {
    install({ hold: true });
    const first = await mount();
    ready(first);
    await confirmAndClose(first);
    expect(pendingRefundKey('sale-1')).toBeUndefined();
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderReopen')).toBe(false);

    const el = await reopen();
    expect(recoveredBanner(el)).toBeNull();
  });

  it('a screen still open when the hub answers hands the document over itself and keeps nothing owed', async () => {
    install({ hold: true });
    const el = await mount();
    ready(el);
    await arm(el);
    const done = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    releaseRefund?.();
    await done;
    expect(fillersOf(el)[0].commits[0]?.refundRef).toBe('ref-9');
    expect(pendingRefundKey('sale-1')).toBeUndefined();
    expect(refundSdk.notices.some((n) => n.message === 'ui.refundTenderReopen')).toBe(false);
  });

  it('a refused refund keeps nothing owed even if the screen was closed with a line armed', async () => {
    install({ hold: true, refuse: true });
    const first = await mount();
    ready(first);
    await arm(first);
    await confirmAndClose(first);
    expect(pendingRefundKey('sale-1')).toBeUndefined();
  });

  describe('reopened over the recovered document', () => {
    /** The earlier screen closed with the voucher line armed: its key is still pending. */
    async function reopenOverOwed(opts: Options = {}): Promise<Refund> {
      install({ legs: ALL_BACK, ...opts });
      rememberPendingRefundKey('sale-1', 'refund-sale-1-closed');
      return mount();
    }

    it('closed WITHOUT taking the offer: the next screen offers it again', async () => {
      const el = await reopenOverOwed();
      await arm(el);
      expect(giveBackButton(el)).toBeTruthy();
      el.remove();

      const again = await reopen();
      expect(recoveredBanner(again)).toBeTruthy();
      await arm(again);
      expect(giveBackButton(again)).toBeTruthy();
    });

    // The real hole arms only once ITS read answers: closing before that is «not heard yet», never
    // «nothing goes back», or a quick open-and-close loses the session for good.
    it('closed before the hole said whether the session goes back: the next screen offers it again', async () => {
      const el = await reopenOverOwed();
      el.remove();
      expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
    });

    it('closed while the screen was still reading its lines: the next screen offers it again', async () => {
      const el = document.createElement('erp-sale-refund') as Refund;
      install({ legs: ALL_BACK, onLoadSlot: () => el.remove() });
      rememberPendingRefundKey('sale-1', 'refund-sale-1-closed');
      el.saleId = 'sale-1';
      document.body.appendChild(el);
      await settle(el);
      expect(el.isConnected).toBe(false);
      expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
    });

    it('two sessions on the ticket and only one hole has answered: the next screen offers it again', async () => {
      const el = await reopenOverOwed({
        lines: [...LINES, { id: 'item-3', product_id: 's-tinte', product_name: 'Tinte', is_covered: 1 }],
      });
      await disarm(el);
      el.remove();
      expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
    });

    it('the hole says the session already came back: nothing is offered again', async () => {
      const el = await reopenOverOwed();
      await disarm(el);
      el.remove();
      expect(pendingRefundKey('sale-1')).toBeUndefined();
    });

    it('the operator un-ticked the line and closed: nothing is offered again', async () => {
      const el = await reopenOverOwed();
      await arm(el);
      await disarm(el);
      el.remove();
      expect(pendingRefundKey('sale-1')).toBeUndefined();

      const again = await reopen();
      expect(recoveredBanner(again)).toBeNull();
    });

    // sales#470 - since services#139 the hole can take back an `armed` it can no longer stand by
    // (it lost the voucher's read) with `unknown: true`: «I can't tell», not «it does not go back».
    // The warning goes, but the line is NOT answered: closing keeps the session owed.
    describe('the hole takes back its promise because it cannot tell any more (`unknown`)', () => {
      it('the warning next to the button goes', async () => {
        const el = await reopenOverOwed();
        await arm(el);
        expect(giveBackButton(el)).toBeTruthy();
        await disarm(el, { unknown: true });
        expect(giveBackButton(el)).toBeNull();
      });

      it('closed then: the next screen offers it again', async () => {
        const el = await reopenOverOwed();
        await arm(el);
        await disarm(el, { unknown: true });
        el.remove();
        expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');

        const again = await reopen();
        expect(recoveredBanner(again)).toBeTruthy();
        await arm(again);
        expect(giveBackButton(again)).toBeTruthy();
      });

      it('a later plain answer counts again: «it does not go back» settles it', async () => {
        const el = await reopenOverOwed();
        await arm(el);
        await disarm(el, { unknown: true });
        await disarm(el);
        el.remove();
        expect(pendingRefundKey('sale-1')).toBeUndefined();
      });

      it('a later `armed` counts again: the session is shown as going back, so it stays owed', async () => {
        const el = await reopenOverOwed();
        await arm(el);
        await disarm(el, { unknown: true });
        await arm(el);
        expect(giveBackButton(el)).toBeTruthy();
        el.remove();
        expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
      });

      it('only `true` is a doubt: `unknown: false` is a plain answer', async () => {
        const el = await reopenOverOwed();
        await arm(el);
        await disarm(el, { unknown: false });
        el.remove();
        expect(pendingRefundKey('sale-1')).toBeUndefined();
      });

      it('two sessions, one answered «no» and the other «I can\'t tell»: the next screen offers it again', async () => {
        const el = await reopenOverOwed({
          lines: [...LINES, { id: 'item-3', product_id: 's-tinte', product_name: 'Tinte', is_covered: 1 }],
        });
        const [first, second] = fillersOf(el);
        first.dispatchEvent(new CustomEvent('erp:tender-refund-disarmed', {
          detail: { lineRef: 'item-1' }, bubbles: true, composed: true,
        }));
        second.dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
          detail: { lineRef: 'item-3' }, bubbles: true, composed: true,
        }));
        second.dispatchEvent(new CustomEvent('erp:tender-refund-disarmed', {
          detail: { lineRef: 'item-3', unknown: true }, bubbles: true, composed: true,
        }));
        await settle(el);
        el.remove();
        expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
      });
    });

    it('given back: the next screen offers nothing', async () => {
      commitBehaviour = 'ok';
      const el = await reopenOverOwed();
      commitBehaviour = 'ok';
      await arm(el);
      giveBackButton(el)?.click();
      await new Promise((r) => setTimeout(r, 0));
      commitResolved?.();
      await settle(el);
      expect(pendingRefundKey('sale-1')).toBeUndefined();
      el.remove();
      const again = await reopen();
      expect(recoveredBanner(again)).toBeNull();
    });

    it('the give-back failed: the next screen offers it again, with a hole that can try once more', async () => {
      const el = await reopenOverOwed();
      commitBehaviour = 'fail';
      await arm(el);
      giveBackButton(el)?.click();
      await new Promise((r) => setTimeout(r, 0));
      commitResolved?.();
      await settle(el);
      el.remove();
      expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
    });

    it('nobody fills the hole: nothing can be given back here, so nothing stays owed', async () => {
      await reopenOverOwed({ fillers: false });
      expect(pendingRefundKey('sale-1')).toBeUndefined();
    });

    it('no line was paid another way: nothing stays owed', async () => {
      await reopenOverOwed({ lines: [LINES[1]] });
      expect(pendingRefundKey('sale-1')).toBeUndefined();
    });

    it('the lines paid another way cannot be read: kept, so the next screen tries again', async () => {
      const el = await reopenOverOwed({ linesFail: true });
      el.remove();
      expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-closed');
    });

    it('closing it with a NEW refund in flight keeps THAT attempt pending, not the recovered one', async () => {
      install({ legs: LEGS, hold: true });
      rememberPendingRefundKey('sale-1', 'refund-sale-1-closed');
      const el = await mount();
      ready(el);
      // The hole has answered «nothing goes back», so closing does settle the recovered attempt -
      // and must leave the NEW one alone.
      await disarm(el);
      const done = el.confirm();
      await new Promise((r) => setTimeout(r, 0));
      el.remove();
      const sent = String(commands.find((c) => c.name === 'sales.refund')?.payload.idempotency_key);
      expect(sent).not.toBe('refund-sale-1-closed');
      expect(pendingRefundKey('sale-1'), 'the hub has not answered the new attempt yet').toBe(sent);
      releaseRefund?.();
      await done;
    });

    it('a new refund from this screen settles it: its own document goes to the holes', async () => {
      install({ legs: LEGS });
      rememberPendingRefundKey('sale-1', 'refund-sale-1-closed');
      const el = await mount();
      ready(el);
      await arm(el);
      await el.confirm();
      expect(fillersOf(el)[0].commits[0]?.refundRef).toBe('ref-9');
      expect(pendingRefundKey('sale-1')).toBeUndefined();
    });
  });
});
