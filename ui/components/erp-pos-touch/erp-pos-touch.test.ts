// Contrato del CARRITO del TPV táctil.
//
// Dos cosas que se piden aquí:
//
// 1. El botón COBRAR vive SIEMPRE en el pie, y las líneas scrollan por dentro. El bug: el CSS daba
//    `flex:1; overflow:auto` solo a `ion-list.lines`, pero con el carrito VACÍO se pinta un
//    `<div class="lines">` — sin `flex:1` no empuja nada, así que el pie subía y quedaba pegado al
//    texto de "toca un producto". Con líneas funcionaba; vacío, no.
//
// 2. El header expone un HOOK (`sales.pos.cart_actions`) para que otros módulos —tables, customers,
//    o uno que aún no existe— inyecten su botón (que abre su propio modal). Reutiliza el mecanismo
//    de slots cross-módulo que ya usa el POS (`erplora.loadSlot`, ADR-0043); no inventa otro.
//
// happy-dom NO hace layout: aquí se fija el CONTRATO (qué se pinta y con qué clases). Que el pie
// quede visualmente abajo se verifica en un navegador real.
import { beforeEach, describe, expect, it } from 'vitest';

// El WC llama al SDK en cuanto se monta. Sin esto, `connectedCallback` peta y no pinta nada.
const slotsPedidos: string[] = [];
beforeEach(() => {
  slotsPedidos.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => ({ rows: [] }),
    command: async () => ({}),
    // Moneda del hub + formateo (ADR-0059). Los DOS formateadores del SDK, con su contrato real:
    // `formatMoney` recibe CÉNTIMOS (divide entre 100) y es el que usan los WC porque el dinero es
    // INTEGER (ADR-0007); `formatAmount` recibe EUROS y no divide.
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    // i18n del módulo (ADR-0055): el WC hace `erplora().t(CATALOG, key)`. Devolvemos la clave: al
    // test le da igual el idioma, lo que mira es la ESTRUCTURA de lo que se pinta.
    t: (_catalog: unknown, key: string) => key,
    // Slots cross-módulo (ADR-0043): el POS pregunta al SDK quién quiere pintar en cada hook.
    loadSlot: async (slot: string) => {
      slotsPedidos.push(slot);
      return [];
    },
  };
});

/** Monta el WC y espera a que Lit termine de pintar. */
async function montarCarrito() {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  // El primer render dispara la carga (productos, slots); espera a que asiente.
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

describe('carrito del TPV', () => {
  it('usa los primitivos de Ionic: header + content + footer (no flex a mano)', async () => {
    // Ionic YA resuelve «cabecera fija · cuerpo con scroll · pie fijo»: `ion-content` trae su propio
    // scroll y `ion-footer` es un pie de verdad. Pelearse con `flex:1` + `overflow:auto` a mano es
    // reinventarlo peor (y así estaba: la regla vivía en `ion-list.lines`, y con el carrito VACÍO se
    // pintaba un `<div class="lines">` al que no aplicaba → nada empujaba al pie y COBRAR se movía).
    // Regla del proyecto: Ionic primero; los ok-* solo para lo que Ionic NO tiene.
    const el = await montarCarrito();
    const cart = el.shadowRoot!.querySelector('aside.cart')!;
    expect(cart, 'no se pintó el carrito').toBeTruthy();

    const hijos = [...cart.children].map((c) => c.tagName.toLowerCase());
    expect(hijos, 'el carrito es header → content → footer, en ese orden').toEqual([
      'ion-header',
      'ion-content',
      'ion-footer',
    ]);
  });

  it('el botón COBRAR vive en el ion-footer, esté el carrito vacío o lleno', async () => {
    const el = await montarCarrito();
    const cart = el.shadowRoot!.querySelector('aside.cart')!;

    const pie = cart.querySelector('ion-footer');
    expect(pie, 'el pie es un ion-footer').toBeTruthy();
    expect(pie?.querySelector('ion-button.charge'), 'COBRAR vive en el pie').toBeTruthy();
    // Y es lo último: nada puede empujarlo fuera de la vista.
    expect(cart.lastElementChild, 'el pie es el último elemento del carrito').toBe(pie);
  });

  it('las líneas (y el estado vacío) van DENTRO del ion-content, que es quien scrollea', async () => {
    const el = await montarCarrito();
    const content = el.shadowRoot!.querySelector('aside.cart > ion-content')!;
    expect(content, 'falta el ion-content del carrito').toBeTruthy();

    // Carrito vacío: el mensaje va dentro del content, no suelto entre el header y el pie.
    expect(content.querySelector('.empty'), 'el estado vacío va dentro del ion-content').toBeTruthy();
  });

  it('el header ofrece un HOOK para que otros módulos metan su botón', async () => {
    const el = await montarCarrito();
    const header = el.shadowRoot!.querySelector('ion-header')!;

    // El contenedor donde aterrizan los botones que inyectan tables/customers/…
    const hook = header.querySelector('.cart-actions-slot');
    expect(hook, 'el header debe exponer `.cart-actions-slot` para los botones de otros módulos').toBeTruthy();

    // Y va DENTRO del ion-buttons, para que Ionic lo coloque como un botón más de la toolbar.
    expect(hook?.closest('ion-buttons'), 'el hook va dentro de un ion-buttons de la toolbar').toBeTruthy();

    // Se pide por el mismo canal cross-módulo que los otros slots del POS (ADR-0043).
    expect(slotsPedidos, 'el POS debe pedir el slot `sales.pos.cart_actions` al SDK').toContain('sales.pos.cart_actions');
  });
});

// El dinero es un INTEGER en CÉNTIMOS (ADR-0007): `price: 180` son 1,80 €. El SDK tiene DOS
// formateadores y no son intercambiables — `formatMoney(cents)` divide entre 100 y es «la entrada
// canónica para los Web Components de módulo»; `formatAmount(units)` NO divide (para importes que
// ya llegan en euros). El TPV llamaba a `formatAmount` con céntimos → todo el dinero salía ×100
// («Café solo 180,00 €»). Aquí el stub reproduce el contrato REAL de ambos, así que llamar al
// formateador equivocado se ve.
describe('precios del TPV (dinero = céntimos, ADR-0007)', () => {
  beforeEach(() => {
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.formatMoney = (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`;
    sdk.formatAmount = (units: number) => `${(units || 0).toFixed(2)} €`;
    sdk.query = async (name: string) =>
      name === 'inventory.products.list'
        ? { rows: [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1 }] }
        : { rows: [] };
  });

  it('un café de 180 céntimos se pinta 1,80 € en la rejilla (no 180,00 €)', async () => {
    const el = await montarCarrito();
    const precio = el.shadowRoot!.querySelector('.tile .tinfo .p')?.textContent?.trim();
    expect(precio, 'la rejilla del TPV pinta el precio ×100').toBe('1.80 €');
  });

  it('el total del carrito también va en céntimos', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const total = el.shadowRoot!.querySelector('.total b')?.textContent?.trim();
    expect(total, 'el total del carrito sale ×100').toBe('1.80 €');
  });
});
