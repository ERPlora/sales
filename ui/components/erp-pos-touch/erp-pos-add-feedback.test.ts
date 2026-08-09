// #270 — «El TPV no añade productos a la cuenta»: addNow falla CERRADO por diseño (su catch setea
// this.error y NO añade al carrito — la comanda es la fuente de verdad, no se miente en la UI).
// El síntoma "no añade nada" = el backend rechaza sales.order.open/add_line. El único feedback era
// `this.error`, un <p class="err"> discreto que en un TPV táctil es fácil de perder → parece que
// "no pasa nada". El fix de UX (independiente de la causa raíz): al fallar la escritura de la
// primera línea, emitir además un `notify({type:'error'})` (toast del shell) para feedback visible
// e inmediato. El usuario ve qué falló en vez de un silencio confuso.
import { beforeEach, describe, expect, it } from 'vitest';
import esCatalog from '../../../locales/es.json';

const notifyCalls: { type: string; message: string }[] = [];
const CATEGORIA_IVA = 'product.generic';
const REGLAS_IVA = [{ id: 'r-21', tax_category_key: CATEGORIA_IVA, rate_pct: 21, parent_id: null, is_active: 1 }];

beforeEach(() => {
  notifyCalls.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    // sales#74: la rejilla solo deja añadir lo que se puede cobrar → el hub del doble está
    // configurado (el producto trae categoría fiscal y el catálogo la resuelve).
    queryAll: async (name: string) => (name === 'taxes.rules.list' ? REGLAS_IVA : []),
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    // Canal de toasts del shell. El TPV ya lo usa para avisos de éxito (p.ej. enviar a cocina).
    notify: (n: { type: string; message: string }) => notifyCalls.push(n),
  };
});

async function montar() {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as unknown as {
    shadowRoot: ShadowRoot;
    products: unknown[];
    add: (p: { id: string; name: string; price: number; tax_category_key?: string }) => Promise<void>;
    updateComplete: Promise<unknown>;
  };
}

describe('al fallar la escritura de una línea, el TPV avisa de forma visible (#270)', () => {
  it('si el backend rechaza abrir el pedido, se emite un toast de error (no silencio)', async () => {
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    // El backend rechaza (p.ej. permission denied): sales.order.open lanza.
    sdk.command = async (name: string) => {
      if (name === 'sales.order.open') throw new Error('permission denied');
      return {};
    };
    const el = await montar();
    // Forzar al menos un producto en el catálogo para poder "tocarlo".
    (el as unknown as { products: unknown[] }).products = [{ id: 'p1', name: 'Café', price: 150, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    await (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate?.();
    await el.updateComplete;

    await el.add({ id: 'p1', name: 'Café', price: 150, tax_category_key: CATEGORIA_IVA });

    const errs = notifyCalls.filter((n) => n.type === 'error');
    expect(errs.length, 'sin feedback visible, un rechazo del backend parece "no pasa nada"').toBeGreaterThan(0);
  });
});
