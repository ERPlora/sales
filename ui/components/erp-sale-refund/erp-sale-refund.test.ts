// La PANTALLA de devolución (sales#160 / ADR-0386 decisión 3).
//
// Lo que se prueba aquí no es que pinte bonito: es que el operador pueda hacer lo que las tres
// referencias del mercado le impiden — repartir a mano, y sacar el dinero de una pata cuyo método
// ya no existe— y que la pantalla nunca le deje pulsar hacia un rechazo del servidor sin haberle
// dicho antes qué falla y en QUÉ pata.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import esCatalog from '../../../locales/es.json';
import enCatalog from '../../../locales/en.json';

interface Sdk {
  query: ReturnType<typeof vi.fn>;
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

function install(over: Partial<Record<string, unknown[]>> = {}, fail?: string): void {
  const table: Record<string, unknown[]> = {
    'sales.get': SALE, 'sales.refund_options': LEGS, 'sales.payment_methods': METHODS, ...over,
  };
  sdk = {
    query: vi.fn(async (name: string) => {
      if (fail && name === fail) throw new Error('boom');
      return table[name] ?? [];
    }),
    command: vi.fn(async () => ({ refund_id: 'ref-1', refund_ref: 'ref-1' })),
    notify: vi.fn(),
  };
  (globalThis as Record<string, unknown>).erplora = {
    ...sdk,
    currency: 'EUR',
    locale: 'es',
    // Formato ESPAÑOL, que es el de la UI que se está probando: con punto decimal, un «25,00 €»
    // en pantalla habría pasado el test sin existir.
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2).replace('.', ',')} €`,
    hasPermission: () => true,
    on: () => () => {},
    t: (catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => {
      const raw = key.split('.').reduce<unknown>(
        (acc, part) => (acc as Record<string, unknown>)?.[part],
        (catalog as Record<string, unknown>).es ?? esCatalog,
      );
      const text = typeof raw === 'string' ? raw : key;
      return text.replace(/\{(\w+)\}/g, (_m, k: string) => String(params?.[k] ?? ''));
    },
  };
}

type Refund = HTMLElement & {
  updateComplete: Promise<unknown>;
  saleId?: string;
  draft: Record<string, { amount: number; to?: string }>;
  reason: string;
  confirm(): Promise<void>;
  setAmount(paymentId: string, text: string): void;
};

async function mount(saleId = 'sale-1'): Promise<Refund> {
  await import('./erp-sale-refund');
  const el = document.createElement('erp-sale-refund') as Refund;
  el.saleId = saleId;
  document.body.appendChild(el);
  await el.updateComplete;
  // Las cargas son asíncronas: se deja correr la microcola y se re-renderiza.
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const text = (el: Refund): string => el.shadowRoot?.textContent ?? '';
const confirmButton = (el: Refund): HTMLElement | null =>
  el.shadowRoot?.querySelector('ion-button.refund-confirm') as HTMLElement | null;

beforeEach(() => install());
afterEach(() => { document.body.innerHTML = ''; vi.resetModules(); });

describe('los tres estados que una pantalla de dinero no puede saltarse', () => {
  it('mientras carga lo DICE, en vez de enseñar una devolución de 0,00 €', async () => {
    await import('./erp-sale-refund');
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
    // haya a mano manda al operador a arreglar un problema que no tiene.
    const el = await mount();
    el.reason = 'devolución';
    sdk.command.mockRejectedValueOnce(new Error('NetworkError: failed to fetch'));
    await el.confirm();
    expect(sdk.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: esCatalog.ui.refundFailed }),
    );
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

describe('la cadena i18n está COMPLETA (ADR-0055/0199)', () => {
  it('cada clave nueva existe en inglés Y en español', () => {
    const keys = [
      'refundTitle', 'refundExplain', 'refundNothing', 'refundLoading', 'refundLegCharged',
      'refundLegRefunded', 'refundLegRemaining', 'refundReasonLabel', 'refundReasonRequired',
      'refundReasonPlaceholder', 'refundConfirm', 'refundDone', 'refundFailed',
      'refundExceedsTender', 'refundOverCap', 'refundNothingToReturn', 'refundDestination',
      'refundNeedsDestination', 'refundReasonAlreadyRefunded', 'refundReasonMethodUnavailable',
      'refundReasonNotEligible', 'refundProposeAll', 'refundTotalLabel', 'refundLegAmount', 'actionRefund',
      'statusRefunded', 'refundSaleNotFound', 'refundRequiresCompleted', 'refundMethodUnavailable',
    ];
    for (const k of keys) {
      expect((enCatalog.ui as Record<string, string>)[k], `en.${k}`).toBeTruthy();
      expect((esCatalog.ui as Record<string, string>)[k], `es.${k}`).toBeTruthy();
    }
  });
});
