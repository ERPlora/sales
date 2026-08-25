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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
let queriesAsked: string[] = [];
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

interface Options { fillers?: boolean; lines?: unknown[]; linesFail?: boolean }

function install(opts: Options = {}): void {
  const { fillers = true, lines = LINES, linesFail = false } = opts;
  slotsAsked = [];
  queriesAsked = [];
  commands = [];
  commitBehaviour = 'silent';
  commitResolved = undefined;
  const table: Record<string, unknown[]> = {
    'sales.get': SALE, 'sales.refund_options': LEGS, 'sales.payment_methods': METHODS,
    'sales.lines': lines,
  };
  (globalThis as Record<string, unknown>).erplora = {
    query: vi.fn(async (name: string) => {
      queriesAsked.push(name);
      if (linesFail && name === 'sales.lines') throw new Error('boom');
      return table[name] ?? [];
    }),
    command: vi.fn(async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return { refund_id: 'ref-9', refund_ref: 'ref-9', total: 1800, fully_refunded: 1, already: 0 };
    }),
    loadSlot: vi.fn(async (slot: string) => {
      slotsAsked.push(slot);
      if (!fillers) return [];
      return slot === 'sales.refund.tender' ? [{ component: 'erp-fake-tender-refund' }] : [];
    }),
    notify: vi.fn(),
    currency: 'EUR',
    locale: 'es',
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2).replace('.', ',')} €`,
    hasPermission: () => true,
    // The catalogue answers with the KEY: what is asserted below is the contract, never the prose.
    t: (_catalog: unknown, key: string) => key,
  };
}

type Refund = HTMLElement & {
  updateComplete: Promise<unknown>;
  saleId?: string;
  reason: string;
  confirm(): Promise<void>;
};

async function mount(): Promise<Refund> {
  await import('./erp-sale-refund');
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
afterEach(() => { document.body.innerHTML = ''; vi.resetModules(); });

describe('el hueco: una línea CUBIERTA, un slot', () => {
  it('pide el slot por su literal, como el TPV pide el suyo', async () => {
    await mount();
    expect(slotsAsked).toContain('sales.refund.tender');
  });

  it('monta UNA instancia por línea cubierta, y ninguna sobre la que se pagó en dinero', async () => {
    const el = await mount();
    expect(holes(el)).toHaveLength(1);
    expect(holes(el)[0].dataset.line).toBe('item-1');
    expect(fillersOf(el)).toHaveLength(1);
  });

  it('las cuatro propiedades están puestas ANTES de entrar al DOM', async () => {
    // El filler lee en `connectedCallback`: insertarlo primero le haría preguntar por una venta
    // vacía y pintar «aquí no hay nada que devolver» sobre una sesión que sí vuelve.
    const el = await mount();
    expect(fillersOf(el)[0].seenOnConnect).toEqual({
      saleId: 'sale-1', lineRef: 'item-1', serviceId: 's-corte', lineIndex: 0,
    });
  });

  it('dos líneas del MISMO servicio se numeran, para que cada hueco reclame SU sesión', async () => {
    install({ lines: [
      { id: 'item-1', product_id: 's-corte', product_name: 'Corte', is_covered: 1 },
      { id: 'item-2', product_id: 's-corte', product_name: 'Corte', is_covered: 1 },
    ] });
    const el = await mount();
    expect(fillersOf(el).map((f) => f.seenOnConnect?.lineIndex)).toEqual([0, 1]);
  });

  it('si `sales.lines` falla, la devolución del DINERO sigue en pie', async () => {
    // La autoridad de esta pantalla es el dinero. Un fallo del lado accesorio no puede dejar al
    // operador sin poder devolver 18,00 € que el cliente está esperando.
    install({ linesFail: true });
    const el = await mount();
    expect(el.shadowRoot?.querySelector('ok-inline-feedback[tone="danger"]')).toBeNull();
    expect(confirmButton(el)).toBeTruthy();
    expect(holes(el)).toHaveLength(0);
  });
});

describe('el aviso: se lee ANTES de confirmar, y no bloquea', () => {
  it('el aviso del filler se pinta junto al botón', async () => {
    const el = await mount();
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1', warning: 'El bono caducó el 31/07' },
      bubbles: true, composed: true,
    }));
    await settle(el);
    const notice = el.shadowRoot?.querySelector('.rt-notice');
    expect(notice?.textContent).toContain('El bono caducó el 31/07');
  });

  it('un bono caducado AVISA pero deja confirmar (ADR-0386)', async () => {
    const el = await mount();
    ready(el);
    fillersOf(el)[0].dispatchEvent(new CustomEvent('erp:tender-refund-armed', {
      detail: { lineRef: 'item-1', warning: 'El bono caducó el 31/07' },
      bubbles: true, composed: true,
    }));
    await settle(el);
    expect(confirmButton(el)?.getAttribute('data-blocked')).toBeNull();
  });

  it('desarmar retira el aviso: lo que el filler deshizo deja de anunciarse', async () => {
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

describe('el documento: la referencia baja al filler, y la pantalla lo espera', () => {
  it('tras `sales.refund`, cada filler recibe `refund_ref` — el id ESTABLE del documento', async () => {
    const el = await mount();
    ready(el);
    await el.confirm();
    const commit = fillersOf(el)[0].commits[0];
    expect(commit.refundRef).toBe('ref-9');
    expect(commit.refundId).toBe('ref-9');
    expect(commit.saleId).toBe('sale-1');
    expect(typeof commit.waitFor).toBe('function');
  });

  it('la referencia también queda como PROPIEDAD, para el filler que la lee en vez de escuchar', async () => {
    const el = await mount();
    ready(el);
    await el.confirm();
    const f = fillersOf(el)[0] as unknown as { refundRef?: string; refundId?: string };
    expect(f.refundRef).toBe('ref-9');
    expect(f.refundId).toBe('ref-9');
  });

  it('la pantalla NO se cierra mientras el filler está devolviendo la sesión', async () => {
    // Cerrar aquí desmonta el filler a mitad de su command, y la sesión se queda gastada sin que
    // nadie en la caja pueda devolverla.
    commitBehaviour = 'ok';
    const el = await mount();
    ready(el);
    let closed = false;
    el.addEventListener('refunded', () => { closed = true; });
    const done = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    expect(closed, 'todavía no: el filler no ha terminado').toBe(false);
    commitResolved?.();
    await done;
    expect(closed).toBe(true);
  });

  it('si el filler falla, el DINERO ya devuelto se mantiene y la pantalla lo DICE', async () => {
    commitBehaviour = 'fail';
    const el = await mount();
    ready(el);
    let closed = false;
    el.addEventListener('refunded', () => { closed = true; });
    const done = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    commitResolved?.();
    await done;
    const notify = (globalThis as { erplora?: { notify: ReturnType<typeof vi.fn> } }).erplora!.notify;
    const said = notify.mock.calls.map((c) => (c[0] as { type: string; message: string }));
    expect(said.some((n) => n.type === 'success' && n.message === 'ui.refundDone')).toBe(true);
    expect(said.some((n) => n.type === 'error' && n.message === 'ui.refundTenderPending')).toBe(true);
    expect(closed, 'la venta ESTÁ devuelta: la pantalla no puede quedarse abierta fingiendo que no').toBe(true);
    expect(commands.filter((c) => c.name === 'sales.refund')).toHaveLength(1);
  });
});

describe('un hub SIN el módulo dueño', () => {
  it('no pinta sección, no pregunta por las líneas y no monta nada', async () => {
    install({ fillers: false });
    const el = await mount();
    expect(holes(el)).toHaveLength(0);
    expect(el.shadowRoot?.querySelector('.rt-list')).toBeNull();
    expect(queriesAsked).not.toContain('sales.lines');
  });

  it('la devolución viaja EXACTAMENTE igual que antes del slot', async () => {
    install({ fillers: false });
    const el = await mount();
    ready(el);
    await el.confirm();
    const sent = commands.find((c) => c.name === 'sales.refund');
    expect(Object.keys(sent?.payload ?? {}).sort())
      .toEqual(['allocations', 'idempotency_key', 'reason', 'sale_id']);
  });
});
