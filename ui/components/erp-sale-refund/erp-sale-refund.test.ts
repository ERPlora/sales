// La PANTALLA de devolución (sales#160 / ADR-0386 decisión 3).
//
// Lo que se prueba aquí no es que pinte bonito: es que el operador pueda hacer lo que las tres
// referencias del mercado le impiden — repartir a mano, y sacar el dinero de una pata cuyo método
// ya no existe— y que la pantalla nunca le deje pulsar hacia un rechazo del servidor sin haberle
// dicho antes qué falla y en QUÉ pata.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import esCatalog from '../../../locales/es.json';
import enCatalog from '../../../locales/en.json';
import { installErploraDouble } from '../../test/erplora-double';
import { forgetPendingRefundKey, pendingRefundKey } from '../../lib/refund-pending-key';
import './erp-sale-refund';

interface Sdk {
  command: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
}

const LEGS = [
  {
    payment_id: 'pay-card', sort_order: 0, payment_method_id: 'pm-card',
    payment_method_name: 'Tarjeta', payment_method_type: 'card',
    charged: 5000, refunded: 0, remaining: 5000, refundable: 1, reason: '',
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

let sdk: Sdk;

/** Rows, or — for a read that answers by its params, like the idempotency probe — a function. */
type Answer = unknown[] | ((params: Record<string, unknown> | undefined) => unknown[] | Promise<unknown[]>);

function install(
  over: Partial<Record<string, Answer>> = {},
  fail?: string,
  thrown?: unknown,
  extra?: Record<string, unknown>,
): void {
  const table: Record<string, Answer> = {
    'sales.get': SALE, 'sales.refund_options': LEGS, 'sales.payment_methods': METHODS,
    // services#158: «Qué se devuelve» reads the lines; a sale with none paints no block.
    'sales.lines': [], 'sales.refund_lines': [], ...over,
  } as Record<string, Answer>;
  sdk = {
    command: vi.fn(async () => ({ refund_id: 'ref-1', refund_ref: 'ref-1' })),
    notify: vi.fn(),
  };
  installErploraDouble({
    queries: Object.fromEntries(Object.entries(table).map(([name, rows]) => [name, (params?: Record<string, unknown>) => {
      if (fail === name) throw thrown ?? new Error('boom');
      return typeof rows === 'function' ? rows(params) : rows;
    }])),
    command: (name: string, payload: Record<string, unknown>) => sdk.command(name, payload),
    notify: (n) => sdk.notify(n),
    locale: 'es',
    ...(extra ? { extra } : {}),
    // Formato ESPAÑOL, que es el de la UI que se está probando: con punto decimal, un «25,00 €»
    // en pantalla habría pasado el test sin existir.
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2).replace('.', ',')} €`,
    t: (catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => {
      const raw = key.split('.').reduce<unknown>(
        (acc, part) => (acc as Record<string, unknown>)?.[part],
        (catalog as Record<string, unknown>).es ?? esCatalog,
      );
      const text = typeof raw === 'string' ? raw : key;
      return text.replace(/\{(\w+)\}/g, (_m, k: string) => String(params?.[k] ?? ''));
    },
  });
}

type Refund = HTMLElement & {
  updateComplete: Promise<unknown>;
  saleId?: string;
  draft: Record<string, { amount: number; to?: string }>;
  reason: string;
  confirm(): Promise<void>;
  setAmount(paymentId: string, text: string): void;
  recoveryDelayMs: number;
};

async function mount(saleId = 'sale-1'): Promise<Refund> {
  const el = document.createElement('erp-sale-refund') as Refund;
  el.saleId = saleId;
  // sales#456: the pause between two questions to a hub that did not answer. Real time in the
  // product (a restarting hub is back in seconds), none here.
  el.recoveryDelayMs = 0;
  document.body.appendChild(el);
  // Las cargas son asíncronas: se deja correr la microcola y se re-renderiza. Varias vueltas: la
  // pregunta por un intento en duda (sales#456) va DESPUÉS de las lecturas y reintenta una vez.
  for (let i = 0; i < 4; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
  return el;
}

const text = (el: Refund): string => el.shadowRoot?.textContent ?? '';
const confirmButton = (el: Refund): HTMLElement | null =>
  el.shadowRoot?.querySelector('ion-button.refund-confirm') as HTMLElement | null;

beforeEach(() => install());
afterEach(() => {
  document.body.innerHTML = '';
  // sales#456: an attempt left in doubt is remembered per sale, on purpose across screens — and so
  // across tests too, unless it is dropped here.
  forgetPendingRefundKey('sale-1');
});

describe('los tres estados que una pantalla de dinero no puede saltarse', () => {
  it('mientras carga lo DICE, en vez de enseñar una devolución de 0,00 €', async () => {
    const el = document.createElement('erp-sale-refund') as Refund;
    el.saleId = 'sale-1';
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.refund-loading')).toBeTruthy();
  });

  it('si la consulta falla, el error se PINTA y no hay botón que pulsar', async () => {
    install({}, 'sales.refund_options');
    const el = await mount();
    expect(el.shadowRoot?.querySelector('ok-inline-feedback[tone="danger"]')).toBeTruthy();
    expect(confirmButton(el)).toBeNull();
  });

  it('una venta sin patas dice que no hay nada que devolver', async () => {
    install({ 'sales.refund_options': [] });
    const el = await mount();
    expect(text(el)).toContain(esCatalog.ui.refundNothing);
    expect(confirmButton(el)).toBeNull();
  });
});

describe('el campo del importe va en la moneda del hub (sales#377)', () => {
  // 🔴 En un hub en yenes el campo proponía «15,00» para una devolución de 1.500 ¥: el número con
  // el que se decide cuánto dinero sale de la caja, dividido entre 100.
  const YEN_LEG = [{ ...LEGS[1], charged: 1500, remaining: 1500 }];

  it('en yenes propone «1500», no «15,00»', async () => {
    install({ 'sales.refund_options': YEN_LEG }, undefined, undefined, { currencyDecimals: 0 });
    const el = await mount();
    const input = el.shadowRoot?.querySelector('[data-testid="refund-amount-pay-cash"]') as HTMLElement & { value?: string };
    expect(input?.value).toBe('1500');
  });

  it('y lo que el operador teclea se lee en yenes: «1.200» son 1200 ¥', async () => {
    install({ 'sales.refund_options': YEN_LEG }, undefined, undefined, { currencyDecimals: 0 });
    const el = await mount();
    el.setAmount('pay-cash', '1.200');
    expect(el.draft['pay-cash'].amount).toBe(1200);
  });
});

describe('each payment shows charged / refunded / refundable in the hub currency (sales#436)', () => {
  // A partly refunded card and an untouched cash payment: three distinct figures on the card, so a
  // figure painted raw («3150») or swapped with its neighbour can't pass for the right one.
  const PARTLY_REFUNDED = [
    { ...LEGS[0], charged: 3150, refunded: 1000, remaining: 2150 },
    { ...LEGS[1], charged: 2000, refunded: 0, remaining: 2000 },
  ];
  const figures = (el: Refund, paymentId: string): string[] =>
    [...(el.shadowRoot?.querySelectorAll(`[data-testid="refund-leg-${paymentId}"] .leg-figures span`) ?? [])]
      .map((s) => (s.textContent ?? '').replace(/\s+/g, ' ').trim());

  it('two-decimal currency (EUR): the three figures go through formatMoney', async () => {
    install({ 'sales.refund_options': PARTLY_REFUNDED });
    const el = await mount();
    expect(figures(el, 'pay-card')).toEqual([
      `${esCatalog.ui.refundLegCharged}: 31,50 €`,
      `${esCatalog.ui.refundLegRefunded}: 10,00 €`,
      `${esCatalog.ui.refundLegRemaining}: 21,50 €`,
    ]);
    // Nothing refunded yet: no «0,00 €» line, only what was charged and what can still go back.
    expect(figures(el, 'pay-cash')).toEqual([
      `${esCatalog.ui.refundLegCharged}: 20,00 €`,
      `${esCatalog.ui.refundLegRemaining}: 20,00 €`,
    ]);
  });

  it('three-decimal currency (KWD): the figures carry the hub decimals, not a fixed /100', async () => {
    install({ 'sales.refund_options': PARTLY_REFUNDED }, undefined, undefined, {
      currency: 'KWD',
      currencyDecimals: 3,
      formatMoney: (c: number) => `${((c || 0) / 1000).toFixed(3).replace('.', ',')} KWD`,
    });
    const el = await mount();
    expect(figures(el, 'pay-card')).toEqual([
      `${esCatalog.ui.refundLegCharged}: 3,150 KWD`,
      `${esCatalog.ui.refundLegRefunded}: 1,000 KWD`,
      `${esCatalog.ui.refundLegRemaining}: 2,150 KWD`,
    ]);
  });
});

describe('el reparto: propuesta por defecto, jaula nunca', () => {
  it('abre proponiendo la devolución ENTERA, repartida a prorrata', async () => {
    const el = await mount();
    expect(el.draft['pay-card'].amount).toBe(5000);
    expect(el.draft['pay-cash'].amount).toBe(2000);
  });

  it('el operador reescribe una pata y el resto NO se recalcula solo', async () => {
    // Shopify prorratea y no deja tocarlo. Aquí, si el operador pone 10,00 € en la tarjeta, la
    // pantalla no «arregla» el efectivo por su cuenta: el reparto es suyo.
    const el = await mount();
    el.setAmount('pay-card', '10,00');
    await el.updateComplete;
    expect(el.draft['pay-card'].amount).toBe(1000);
    expect(el.draft['pay-cash'].amount).toBe(2000);
  });

  it('pasarse del tope BLOQUEA y dice en qué pata, con su importe', async () => {
    const el = await mount();
    el.setAmount('pay-cash', '25,00');
    await el.updateComplete;
    const shown = text(el);
    expect(shown).toContain('Efectivo');
    expect(shown).toContain('25,00 €');
    expect(shown).toContain('20,00 €');
  });

  it('🔴 el botón bloqueado usa aria-disabled, JAMÁS el disabled de Ionic', async () => {
    // sales#58: en modo `ios` el `disabled` de Ionic es `pointer-events:none` y en una tablet de
    // mostrador el toque muere en silencio — el botón parece roto, no bloqueado.
    const el = await mount();
    el.setAmount('pay-cash', '25,00');
    await el.updateComplete;
    const btn = confirmButton(el)!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(false);
    // Y el estado se VE. Medido en un Chromium real: Ionic mueve los `aria-*` del host al <button>
    // nativo de su shadow, así que un CSS colgado de `[aria-disabled]` en el host no casa nunca y
    // el botón se pinta encendido estando bloqueado. El gancho visual es `data-blocked`.
    expect(btn.getAttribute('data-blocked')).toBe('true');
  });

  it('y un toque en el botón bloqueado CONTESTA en vez de no hacer nada', async () => {
    const el = await mount();
    el.setAmount('pay-cash', '25,00');
    await el.updateComplete;
    await el.confirm();
    expect(sdk.command).not.toHaveBeenCalled();
    expect(sdk.notify).toHaveBeenCalled();
  });
});

describe('la pata no elegible: el caso que Square no resuelve', () => {
  const dead = [{ ...LEGS[0], refundable: 0, reason: 'method_unavailable' }, LEGS[1]];

  it('se marca con su MOTIVO, y la pantalla sigue viva', async () => {
    install({ 'sales.refund_options': dead });
    const el = await mount();
    expect(text(el)).toContain(esCatalog.ui.refundReasonMethodUnavailable);
    // Y sigue proponiéndole dinero: el importe es devolvible, solo que por otra puerta.
    expect(el.draft['pay-card'].amount).toBe(5000);
  });

  it('ofrece elegir DESTINO, y hasta que se elige no se confirma', async () => {
    install({ 'sales.refund_options': dead });
    const el = await mount();
    expect(el.shadowRoot?.querySelector('ion-select.refund-destination')).toBeTruthy();
    expect(confirmButton(el)!.getAttribute('aria-disabled')).toBe('true');

    el.draft = { ...el.draft, 'pay-card': { amount: 5000, to: 'pm-cash' } };
    el.reason = 'la tarjeta ya no existe';
    await el.updateComplete;
    expect(confirmButton(el)!.getAttribute('aria-disabled')).toBeNull();
  });

  it('elegir en el selector GUARDA el destino: el evento está cableado', async () => {
    // Se dispara sobre el <ion-select> de verdad, no llamando al método por dentro: lo que falla
    // en producción es el cable, no la función.
    install({ 'sales.refund_options': dead });
    const el = await mount();
    const select = el.shadowRoot!.querySelector('ion-select.refund-destination')!;
    select.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'pm-cash' } }));
    await el.updateComplete;
    expect(el.draft['pay-card'].to).toBe('pm-cash');
    // Y el importe que ya llevaba no se pierde al elegir destino.
    expect(el.draft['pay-card'].amount).toBe(5000);
  });

  it('y al confirmar, el destino viaja con la pata', async () => {
    install({ 'sales.refund_options': dead });
    const el = await mount();
    el.draft = { 'pay-card': { amount: 5000, to: 'pm-cash' }, 'pay-cash': { amount: 2000 } };
    el.reason = 'devolución';
    await el.confirm();
    const [, payload] = sdk.command.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.allocations).toEqual([
      { payment_id: 'pay-card', amount: 5000, to_payment_method_id: 'pm-cash' },
      { payment_id: 'pay-cash', amount: 2000 },
    ]);
  });
});

describe('confirmar', () => {
  it('el motivo es obligatorio y se pide ANTES de llamar al servidor', async () => {
    const el = await mount();
    el.reason = '   ';
    await el.confirm();
    expect(sdk.command).not.toHaveBeenCalled();
    expect(sdk.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: esCatalog.ui.refundReasonRequired }),
    );
  });

  it('llama a `sales.refund` con el reparto y el motivo', async () => {
    const el = await mount();
    el.reason = 'el cliente devuelve el producto';
    await el.confirm();
    const [name, payload] = sdk.command.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('sales.refund');
    expect(payload.sale_id).toBe('sale-1');
    expect(payload.reason).toBe('el cliente devuelve el producto');
    expect(payload.allocations).toEqual([
      { payment_id: 'pay-card', amount: 5000 },
      { payment_id: 'pay-cash', amount: 2000 },
    ]);
  });

  it('🔴 un reintento tras un fallo manda la MISMA clave de idempotencia', async () => {
    // Lo pidió `services` en la issue: `refund_ref` es su clave para devolver la sesión al bono, y
    // tiene que ser el id ESTABLE del documento. Si la pantalla generase una clave nueva por
    // intento, el segundo reintento escribiría una SEGUNDA devolución — el dinero sale dos veces.
    const el = await mount();
    el.reason = 'devolución';
    sdk.command.mockRejectedValueOnce(new Error('network down'));
    await el.confirm();
    await el.confirm();
    const first = (sdk.command.mock.calls[0][1] as Record<string, unknown>).idempotency_key;
    const second = (sdk.command.mock.calls[1][1] as Record<string, unknown>).idempotency_key;
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('un fallo que no es de negocio NO se disfraza de uno que sí', async () => {
    // Un corte de red no es «te has pasado del tope». Traducir todo al mensaje más concreto que
    // haya a mano manda al operador a arreglar un problema que no tiene. (Until sales#451 this case
    // asserted «could not be recorded»: a cut network is NOT a refusal either — the request may have
    // landed — so it is the unknown-outcome notice now, never a business reason.) The network stays
    // cut, so the check by key that follows (sales#456) cannot answer either.
    install({ 'sales.refund_by_idempotency_key': () => { throw new Error('NetworkError: failed to fetch'); } });
    const el = await mount();
    el.reason = 'devolución';
    sdk.command.mockRejectedValueOnce(new Error('NetworkError: failed to fetch'));
    await el.confirm();
    await el.updateComplete;
    expect(sdk.notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: esCatalog.ui.refundExceedsTender }),
    );
    expect(el.shadowRoot?.querySelector('[data-testid="refund-unknown"]')).toBeTruthy();
  });

  it('un rechazo del servidor se traduce por CÓDIGO, no por la frase', async () => {
    const el = await mount();
    el.reason = 'devolución';
    // sales#201 — el sobre del runtime: el código en su CAMPO, y una frase que nadie lee.
    sdk.command.mockRejectedValueOnce(
      Object.assign(new Error('Efectivo was refunded beyond what it took'), { code: 'sales.refund_exceeds_tender' }),
    );
    await el.confirm();
    expect(sdk.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: esCatalog.ui.refundExceedsTender }),
    );
  });
});

// sales#451 (out of hub#2342) — the hub did not answer the refund. The request may have committed
// before the answer was lost, so «could not be recorded» is a lie that sends the cashier to hand the
// money back by hand or to refund again from scratch. The shell's SDK already toasts its generic
// «we can't tell» verdict (hub#906): the screen adds no contradicting toast, and says on itself what
// is true for THIS refund — a retry from here reuses the key and cannot record it twice.
describe('sales#451: the hub never answered the refund (unknown outcome)', () => {
  /** What the shell's SDK throws since hub#906 (`UnknownOutcomeError`, read by field). */
  const unknownOutcome = (): Error =>
    Object.assign(new Error('No sabemos si la operación se completó. Comprueba el resultado antes de reintentar.'), {
      code: 'server_unavailable',
      outcomeUnknown: true,
    });
  const panel = (el: Refund): HTMLElement | null =>
    el.shadowRoot?.querySelector('[data-testid="refund-unknown"]') as HTMLElement | null;

  // sales#456 asks the hub afterwards; here the hub stays unreachable, so the doubt is what is left.
  beforeEach(() => install({
    'sales.refund_by_idempotency_key': () => { throw Object.assign(new Error('down'), { code: 'server_unavailable' }); },
  }));

  async function failOnce(thrown: unknown): Promise<Refund> {
    const el = await mount();
    el.reason = 'devolución';
    sdk.command.mockRejectedValueOnce(thrown);
    await el.confirm();
    await el.updateComplete;
    return el;
  }

  it('says it cannot tell, and never «could not be recorded»', async () => {
    const el = await failOnce(unknownOutcome());
    expect(sdk.notify).not.toHaveBeenCalledWith(expect.objectContaining({ message: esCatalog.ui.refundFailed }));
    expect(panel(el)?.textContent).toContain(esCatalog.ui.refundUnknown);
  });

  it('adds no toast of its own: the shell already raised the one verdict', async () => {
    await failOnce(unknownOutcome());
    expect(sdk.notify).not.toHaveBeenCalled();
  });

  it('keeps the form on screen, so the retry happens HERE with the same key', async () => {
    const el = await failOnce(unknownOutcome());
    expect(confirmButton(el)).toBeTruthy();
    await el.confirm();
    const first = (sdk.command.mock.calls[0][1] as Record<string, unknown>).idempotency_key;
    const second = (sdk.command.mock.calls[1][1] as Record<string, unknown>).idempotency_key;
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('a retry that goes through clears the doubt and says it was recorded', async () => {
    const el = await failOnce(unknownOutcome());
    await el.confirm();
    await el.updateComplete;
    expect(panel(el)).toBeNull();
    expect(sdk.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', message: esCatalog.ui.refundDone }));
  });

  it('a retry the hub refuses clears the doubt: the refusal is the known answer', async () => {
    const el = await failOnce(unknownOutcome());
    sdk.command.mockRejectedValueOnce(
      Object.assign(new Error('over'), { code: 'sales.refund_exceeds_tender' }),
    );
    await el.confirm();
    await el.updateComplete;
    expect(panel(el)).toBeNull();
    expect(sdk.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: esCatalog.ui.refundExceedsTender }));
  });

  it('an older shell (typed server_unavailable, no outcomeUnknown field) gets the same notice', async () => {
    const el = await failOnce(Object.assign(new Error('request to /api/command failed'), { code: 'server_unavailable' }));
    expect(panel(el)?.textContent).toContain(esCatalog.ui.refundUnknown);
    expect(sdk.notify).not.toHaveBeenCalledWith(expect.objectContaining({ message: esCatalog.ui.refundFailed }));
  });

  it('the verdict is read from the outcomeUnknown FIELD, whatever code or sentence rides with it', async () => {
    // hub#906: bundles may carry their own copy of the SDK class, so the field is the contract.
    const el = await failOnce(Object.assign(new Error('the hub did not answer'), { outcomeUnknown: true }));
    expect(panel(el)?.textContent).toContain(esCatalog.ui.refundUnknown);
    expect(sdk.notify).not.toHaveBeenCalled();
  });

  it('the proxy 502 page (HTML where JSON was due) is an unknown outcome too', async () => {
    const el = await failOnce(new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON'));
    expect(panel(el)?.textContent).toContain(esCatalog.ui.refundUnknown);
  });

  it('an error that is neither the hub refusing nor the transport keeps «could not be recorded»', async () => {
    const el = await failOnce(new Error('boom'));
    expect(panel(el)).toBeNull();
    expect(sdk.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: esCatalog.ui.refundFailed }));
  });

  // sales#456 changed the last clause: closing is no longer the unsafe path — the key survives the
  // close on this device and the next screen asks the hub before anything else. What stays true is
  // «this device»: another till does not know the key, so the words say where the promise holds.
  it('the words: doubt + retry is safe even after closing, on this device, in es and en (never «could not»)', () => {
    const es = esCatalog.ui.refundUnknown;
    const en = enCatalog.ui.refundUnknown;
    expect(es).toMatch(/no hemos podido confirmar si la devolución se registró/i);
    expect(es).toMatch(/no se duplicará/i);
    expect(es).toMatch(/aunque cierres esta pantalla/i);
    expect(es).toMatch(/en este dispositivo/i);
    expect(es).not.toMatch(/no se ha podido registrar/i);
    expect(en).toMatch(/couldn't confirm whether the refund was recorded/i);
    expect(en).toMatch(/won't record it twice/i);
    expect(en).toMatch(/even if you close this screen/i);
    expect(en).toMatch(/on this device/i);
    expect(en).not.toMatch(/could not be recorded/i);
  });
});

// sales#456 (out of sales#451, P1 by the review of sales#457) — after «we can't tell», the screen
// asks the hub ITSELF, by the same key, the way the till does after a checkout without an answer
// (sales#91, `recoverCheckout`): recorded → it closes as recorded; not recorded → it says so and a
// retry is safe; cannot ask → the sales#451 doubt. And the key outlives the screen: closing after
// the doubt and reopening to refund a PART again used to mint a new key, and the money went out
// twice.
describe('sales#456: after the doubt, the screen finds out by itself', () => {
  const unknownOutcome = (): Error =>
    Object.assign(new Error('No sabemos si la operación se completó.'), {
      code: 'server_unavailable',
      outcomeUnknown: true,
    });
  const byTestId = (el: Refund, id: string): HTMLElement | null =>
    el.shadowRoot?.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const RECORDED = [{ id: 'ref-7', sale_id: 'sale-1', total: 7000, reason: 'devolución', created_at: '2026-09-28T10:00:00Z' }];

  let probes: Array<Record<string, unknown> | undefined>;
  type Hub = 'recorded' | 'not-recorded' | 'unreachable';
  let hub: Hub;

  function installHub(over: Partial<Record<string, Answer>> = {}): void {
    install({
      'sales.refund_by_idempotency_key': (params) => {
        probes.push(params);
        if (hub === 'unreachable') throw Object.assign(new Error('down'), { code: 'server_unavailable' });
        return hub === 'recorded' ? RECORDED : [];
      },
      ...over,
    });
  }

  beforeEach(() => {
    probes = [];
    hub = 'recorded';
    installHub();
  });

  const keyOf = (call: number): unknown =>
    (sdk.command.mock.calls[call][1] as Record<string, unknown>).idempotency_key;

  /** A refund whose answer is lost on the way back; the probe then meets `hub`. */
  async function lostAnswer(): Promise<Refund> {
    const el = await mount();
    el.reason = 'devolución';
    sdk.command.mockRejectedValueOnce(unknownOutcome());
    await el.confirm();
    await el.updateComplete;
    return el;
  }

  it('asks the hub by the SAME key the refund was sent with', async () => {
    await lostAnswer();
    expect(probes).toHaveLength(1);
    expect(probes[0]?.idempotency_key).toBe(keyOf(0));
  });

  it('recorded → it closes as «Refund recorded», and tells the list', async () => {
    const onRefunded = vi.fn();
    document.body.addEventListener('refunded', onRefunded);
    const el = await lostAnswer();
    document.body.removeEventListener('refunded', onRefunded);
    expect(sdk.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', message: esCatalog.ui.refundDone }));
    expect(onRefunded).toHaveBeenCalledTimes(1);
    expect(byTestId(el, 'refund-unknown')).toBeNull();
    expect(byTestId(el, 'refund-not-recorded')).toBeNull();
  });

  it('recorded → no second refund is sent', async () => {
    await lostAnswer();
    expect(sdk.command).toHaveBeenCalledTimes(1);
  });

  it('not recorded → it says so, and that refunding again is safe', async () => {
    hub = 'not-recorded';
    const el = await lostAnswer();
    expect(byTestId(el, 'refund-not-recorded')?.textContent).toContain(esCatalog.ui.refundNotRecorded);
    expect(byTestId(el, 'refund-unknown')).toBeNull();
    expect(sdk.notify).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('not recorded → the retry still carries the SAME key (a late write collapses into one)', async () => {
    hub = 'not-recorded';
    const el = await lostAnswer();
    await el.confirm();
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('cannot ask → it asks twice, then keeps the sales#451 doubt', async () => {
    hub = 'unreachable';
    const el = await lostAnswer();
    expect(probes).toHaveLength(2);
    expect(byTestId(el, 'refund-unknown')?.textContent).toContain(esCatalog.ui.refundUnknown);
    expect(byTestId(el, 'refund-not-recorded')).toBeNull();
  });

  it('while it asks, it says so and the button cannot send a second refund', async () => {
    let answer: (rows: unknown[]) => void = () => {};
    installHub({
      'sales.refund_by_idempotency_key': () => new Promise<unknown[]>((r) => { answer = r; }),
    });
    const el = await mount();
    el.reason = 'devolución';
    sdk.command.mockRejectedValueOnce(unknownOutcome());
    const pending = el.confirm();
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect(byTestId(el, 'refund-checking')?.textContent).toContain(esCatalog.ui.refundChecking);
    expect(confirmButton(el)?.hasAttribute('disabled')).toBe(true);
    await el.confirm();
    expect(sdk.command).toHaveBeenCalledTimes(1);
    answer([]);
    await pending;
    await el.updateComplete;
    expect(byTestId(el, 'refund-checking')).toBeNull();
  });

  describe('the key outlives the screen: close after the doubt, open again', () => {
    /** The doubt with the hub still down, then the screen closed. Returns the key it was sent with. */
    async function doubtThenClose(): Promise<unknown> {
      hub = 'unreachable';
      await lostAnswer();
      const first = keyOf(0);
      document.body.innerHTML = '';
      probes = [];
      return first;
    }

    it('the new screen asks the hub about THAT key before anything else', async () => {
      const first = await doubtThenClose();
      hub = 'recorded';
      await mount();
      expect(probes).toHaveLength(1);
      expect(probes[0]?.idempotency_key).toBe(first);
    });

    it('recorded → it says the earlier refund went through, and a new refund is a NEW one', async () => {
      const first = await doubtThenClose();
      hub = 'recorded';
      const el = await mount();
      expect(byTestId(el, 'refund-recovered')?.textContent).toContain(esCatalog.ui.refundRecoveredOnOpen);
      el.reason = 'otra parte';
      await el.confirm();
      expect(keyOf(1)).toBeTruthy();
      expect(keyOf(1)).not.toBe(first);
    });

    it('recorded → the notice stays while another part is refunded and refused', async () => {
      await doubtThenClose();
      hub = 'recorded';
      const el = await mount();
      el.reason = 'otra parte';
      sdk.command.mockRejectedValueOnce(Object.assign(new Error('over'), { code: 'sales.refund_exceeds_tender' }));
      await el.confirm();
      await el.updateComplete;
      expect(byTestId(el, 'refund-recovered')?.textContent).toContain(esCatalog.ui.refundRecoveredOnOpen);
    });

    it('not recorded → the next attempt clears that answer: the hub gives a new one', async () => {
      await doubtThenClose();
      hub = 'not-recorded';
      const el = await mount();
      el.reason = 'devolución';
      sdk.command.mockRejectedValueOnce(Object.assign(new Error('over'), { code: 'sales.refund_exceeds_tender' }));
      await el.confirm();
      await el.updateComplete;
      expect(byTestId(el, 'refund-not-recorded')).toBeNull();
    });

    it('recorded and nothing left to refund → the notice is still read', async () => {
      await doubtThenClose();
      hub = 'recorded';
      installHub({ 'sales.refund_options': [] });
      const el = await mount();
      expect(byTestId(el, 'refund-recovered')?.textContent).toContain(esCatalog.ui.refundRecoveredOnOpen);
      expect(byTestId(el, 'refund-nothing')).toBeTruthy();
    });

    it('🔴 not recorded → refunding a PART again reuses the SAME key: it cannot go out twice', async () => {
      const first = await doubtThenClose();
      hub = 'not-recorded';
      const el = await mount();
      expect(byTestId(el, 'refund-not-recorded')?.textContent).toContain(esCatalog.ui.refundNotRecorded);
      el.setAmount('pay-card', '10');
      el.setAmount('pay-cash', '0');
      el.reason = 'una parte';
      await el.confirm();
      expect(keyOf(1)).toBe(first);
    });

    it('«not recorded» after the doubt, then closed → the reopened screen keeps THAT key (a late write collapses)', async () => {
      // The probe's empty answer does not prove the first write will never land (a slow commit
      // is invisible to it), so the key stays pending across closing the screen too.
      hub = 'not-recorded';
      await lostAnswer();
      const first = keyOf(0);
      document.body.innerHTML = '';
      probes = [];
      const el = await mount();
      expect(probes[0]?.idempotency_key).toBe(first);
      el.reason = 'devolución';
      await el.confirm();
      expect(keyOf(1)).toBe(first);
    });

    it('still unreachable → the doubt is on screen from the start, and the retry reuses the key', async () => {
      const first = await doubtThenClose();
      hub = 'unreachable';
      const el = await mount();
      expect(byTestId(el, 'refund-unknown')?.textContent).toContain(esCatalog.ui.refundUnknown);
      el.reason = 'devolución';
      await el.confirm();
      expect(keyOf(1)).toBe(first);
    });

    it('a refund recorded at the first try leaves nothing pending: no question, a new key', async () => {
      const el = await mount();
      el.reason = 'devolución';
      await el.confirm();
      const first = keyOf(0);
      expect(pendingRefundKey('sale-1')).toBeUndefined();
      document.body.innerHTML = '';
      const again = await mount();
      again.reason = 'otra';
      await again.confirm();
      expect(probes).toHaveLength(0);
      expect(keyOf(1)).not.toBe(first);
    });

    it('a refund the hub REFUSED leaves nothing pending either: nothing was written', async () => {
      const el = await mount();
      el.reason = 'devolución';
      sdk.command.mockRejectedValueOnce(Object.assign(new Error('over'), { code: 'sales.refund_exceeds_tender' }));
      await el.confirm();
      expect(pendingRefundKey('sale-1')).toBeUndefined();
    });

    it('the recovered answer is dropped too: the next screen asks nothing', async () => {
      await doubtThenClose();
      hub = 'recorded';
      await mount();
      expect(pendingRefundKey('sale-1')).toBeUndefined();
    });

    it('the key is remembered BEFORE the refund leaves, not after it failed', async () => {
      const el = await mount();
      el.reason = 'devolución';
      let seen: string | undefined;
      sdk.command.mockImplementationOnce(async (_n: string, payload: Record<string, unknown>) => {
        seen = pendingRefundKey('sale-1');
        expect(seen).toBe(payload.idempotency_key);
        return { refund_id: 'ref-1', refund_ref: 'ref-1' };
      });
      await el.confirm();
      expect(seen).toBeTruthy();
    });
  });

  it('the words, in es and en', () => {
    expect(esCatalog.ui.refundChecking).toMatch(/comprobando si la devolución se registró/i);
    expect(enCatalog.ui.refundChecking).toMatch(/checking whether the refund was recorded/i);
    expect(esCatalog.ui.refundNotRecorded).toMatch(/no se registró/i);
    expect(esCatalog.ui.refundNotRecorded).toMatch(/puedes volver a devolver/i);
    expect(enCatalog.ui.refundNotRecorded).toMatch(/was not recorded/i);
    expect(enCatalog.ui.refundNotRecorded).toMatch(/you can refund again/i);
    expect(esCatalog.ui.refundRecoveredOnOpen).toMatch(/sí se registró/i);
    expect(esCatalog.ui.refundRecoveredOnOpen).toMatch(/lo que aún queda por devolver/i);
    expect(enCatalog.ui.refundRecoveredOnOpen).toMatch(/was recorded/i);
    expect(enCatalog.ui.refundRecoveredOnOpen).toMatch(/what is still left to refund/i);
  });
});

describe('la cadena i18n está COMPLETA (ADR-0055/0199)', () => {
  it('cada clave nueva existe en inglés Y en español', () => {
    const keys = [
      'refundTitle', 'refundExplain', 'refundNothing', 'refundLoading', 'refundLegCharged',
      'refundLegRefunded', 'refundLegRemaining', 'refundReasonLabel', 'refundReasonRequired',
      'refundReasonPlaceholder', 'refundConfirm', 'refundDone', 'refundFailed',
      'refundExceedsTender', 'refundOverCap', 'refundNothingToReturn', 'refundDestination',
      'refundNeedsDestination', 'refundReasonAlreadyRefunded', 'refundReasonMethodUnavailable',
      'refundReasonNotEligible', 'refundProposeAll', 'refundTotalLabel', 'refundLegAmount', 'actionRefund',
      'statusRefunded', 'refundSaleNotFound', 'refundRequiresCompleted', 'refundMethodUnavailable', 'refundUnknown',
    ];
    for (const k of keys) {
      expect((enCatalog.ui as Record<string, string>)[k], `en.${k}`).toBeTruthy();
      expect((esCatalog.ui as Record<string, string>)[k], `es.${k}`).toBeTruthy();
    }
  });
});

// sales#207 (ADR-0398) — what the screen SAYS when the read is refused.
//
// This path painted `e.message`: the server's own detail, straight onto the screen, written for
// whoever reads a log and in the language the handler was written in. With the catalogue declared,
// a code has a sentence of its own in `es`, and there is nothing left for the raw message to do.
describe('una lectura rechazada se cuenta con el CATÁLOGO, nunca con el mensaje del servidor', () => {
  const refusal = (code: string, message: string) => Object.assign(new Error(message), { code });

  it('pinta la frase DECLARADA del código, no el detalle del servidor', async () => {
    install({}, 'sales.get', refusal('sales.sale_not_found', 'sale sale-1 is not in this hub'));
    const el = await mount();
    expect(text(el)).toContain(esCatalog.errors['sales.sale_not_found']);
    expect(text(el)).not.toContain('is not in this hub');
  });

  it('un fallo SIN código de dominio cae en la frase de la pantalla, jamás en el mensaje crudo', async () => {
    install({}, 'sales.refund_options', new Error('boom'));
    const el = await mount();
    expect(text(el)).toContain(esCatalog.ui.errorLoadSale);
    expect(text(el)).not.toContain('boom');
  });

  it('el servidor caído se cuenta como servidor caído (sales#81), no como un error de negocio', async () => {
    install({}, 'sales.payment_methods', new TypeError('Failed to fetch'));
    const el = await mount();
    expect(text(el)).toContain(esCatalog.ui.serverUnavailable);
    expect(text(el)).not.toContain('Failed to fetch');
  });
});
