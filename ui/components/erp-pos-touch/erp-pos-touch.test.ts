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
    // Moneda del hub + formateo (ADR-0059).
    currency: 'EUR',
    formatAmount: (units: number) => `${units.toFixed(2)} €`,
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
  it('el pie con COBRAR es el último elemento, también con el carrito VACÍO', async () => {
    const el = await montarCarrito();
    const cart = el.shadowRoot!.querySelector('aside.cart')!;
    expect(cart, 'no se pintó el carrito').toBeTruthy();

    const pie = cart.lastElementChild;
    expect(pie?.className, 'el pie de cobro debe ser el ÚLTIMO hijo del carrito').toContain('cart-foot');
    expect(pie?.querySelector('ion-button.charge'), 'el botón COBRAR vive en el pie').toBeTruthy();
  });

  it('la zona de líneas es la MISMA (`.lines`) esté vacía o con productos → el pie no se mueve', async () => {
    const el = await montarCarrito();
    const cart = el.shadowRoot!.querySelector('aside.cart')!;

    // Vacío: hoy se pinta un <div class="lines">; con productos, un <ion-list class="lines">.
    const zona = cart.querySelector('.lines');
    expect(zona, 'la zona de líneas debe existir siempre, llena o vacía').toBeTruthy();

    // Y el CSS tiene que dar el flex:1 + scroll a ESA clase, no solo a `ion-list.lines`: si no, con
    // el carrito vacío nada empuja al pie hacia abajo y el botón COBRAR sube.
    const css = (el.constructor as unknown as { styles: { cssText: string } | { cssText: string }[] }).styles;
    const cssText = Array.isArray(css) ? css.map((s) => s.cssText).join('\n') : css.cssText;
    const reglaDeLineas = cssText.match(/(^|[\s,}])\.lines\s*\{[^}]*\}/m)?.[0] ?? '';

    expect(reglaDeLineas, 'falta una regla `.lines` genérica (la de `ion-list.lines` no aplica al div vacío)').toBeTruthy();
    expect(reglaDeLineas, '`.lines` debe crecer para empujar el pie abajo').toMatch(/flex\s*:\s*1/);
    expect(reglaDeLineas, '`.lines` debe scrollar por dentro').toMatch(/overflow\s*:\s*auto/);
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
