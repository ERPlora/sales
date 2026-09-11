// Contrato del CARRITO del TPV táctil.
//
// Dos cosas que se piden aquí:
//
// 1. El botón COBRAR vive SIEMPRE en el pie, y las líneas scrollan por dentro. El bug: el CSS daba
//    `flex:1; overflow:auto` solo a `ion-list.lines`, pero con el carrito VACÍO se pinta un
//    `<div class="lines">` — sin `flex:1` no empuja nada, así que el pie subía y quedaba pegado al
//    texto de "toca un producto". Con líneas funcionaba; vacío, no.
//
// 2. Mesa y cliente = un botón INDEPENDIENTE cada uno en el header (`sales.pos.assign`, ADR-0043 B),
//    sin mezclar funcionalidades: cada módulo —tables, customers, o uno que aún no existe— monta su
//    propio botón-icono (que abre su propio modal). Reutiliza el mismo canal cross-módulo
//    (`erplora.loadSlot`, ADR-0043); no inventa otro.
//
// happy-dom NO hace layout: aquí se fija el CONTRATO (qué se pinta y con qué clases). Que el pie
// quede visualmente abajo se verifica en un navegador real.
import { beforeEach, describe, expect, it } from 'vitest';
import esCatalog from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';

// sales#74 — la rejilla ya no deja añadir lo que el cobro rechazaría: un producto es vendible si
// tiene categoría fiscal Y esa categoría resuelve tipo. Los dobles de este fichero describen un hub
// CONFIGURADO (producto con categoría + catálogo fiscal servido) porque lo que prueban es otra cosa
// —carrito, aparcados, cobro, split—. El contrato de vendibilidad tiene su propio fichero,
// `erp-pos-sellable.test.ts`.
const CATEGORIA_IVA = 'product.generic';
const REGLAS_IVA = [{ id: 'r-21', tax_category_key: CATEGORIA_IVA, rate_pct: 21, parent_id: null, is_active: 1 }];
/** Respuesta por defecto de `queryAll` para lo que un doble no contemple: el catálogo fiscal. */
const catalogoFiscal = (name: string) => (name === 'taxes.rules.list' ? REGLAS_IVA : []);

// El WC llama al SDK en cuanto se monta. Sin esto, `connectedCallback` peta y no pinta nada.
const slotsPedidos: string[] = [];
/** The shared double of this suite: `posSdk.setQuery(...)` replaces what used to be writing on
 *  `sdk.queryAll` by hand, which is how a new SDK door left a file behind (sales#231). */
let posSdk: ReturnType<typeof installPosDouble>;
beforeEach(() => {
  slotsPedidos.length = 0;
  // El doble imita el contrato del CLIENTE (`ErploraClient`), no el del transporte: `query()` pasa
  // por `unwrapPage()` y entrega ya el array; `queryAll()` trae TODAS las filas (el TPV necesita
  // todo su catálogo, no una página — con `page_size` se quedaba en 50 y no se podía vender más).
  // sales#233 — the double is built by `installPosDouble`, shared by every till suite: the SDK
  // doors (`query`/`queryAll`/`queryOptional`/`queryAllOptional`), the currency, the TWO formatters
  // with their real contract (`formatMoney` takes CENTS, `formatAmount` takes euros — ADR-0059 /
  // ADR-0007) and the `t` that answers the KEY (ADR-0055) all live there, not here.
  posSdk = installPosDouble({
    rules: REGLAS_IVA,
    // Slots cross-módulo (ADR-0043): el POS pregunta al SDK quién quiere pintar en cada hook.
    loadSlot: (slot: string) => {
      slotsPedidos.push(slot);
      return [];
    },
  });
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

  it('Aparcar usa un icono de pausa y no una X que parezca cerrar o eliminar', async () => {
    const el = await montarCarrito();
    const boton = el.shadowRoot!.querySelector<HTMLElement>(
      'ion-button.header-action[aria-label="ui.parkCurrentSale"]',
    );

    expect(boton, 'falta la acción Aparcar').toBeTruthy();
    expect(boton?.querySelector('ion-icon[slot="icon-only"]')?.getAttribute('name')).toBe('pause-circle-outline');
    expect(boton?.querySelector('small'), 'no mezcla icono y texto en el espacio de un icon-only').toBeNull();
  });

  it('Cuentas abiertas usa el mismo patrón icon-only y conserva su nombre accesible', async () => {
    const el = await montarCarrito();
    const boton = el.shadowRoot!.querySelector<HTMLElement>(
      'ion-button.open-checks-action[aria-label="ui.parkedTickets"]',
    );

    expect(boton, 'falta la acción Cuentas abiertas').toBeTruthy();
    expect(boton?.querySelector('ion-icon[slot="icon-only"]')?.getAttribute('name')).toBe('receipt-outline');
    expect(boton?.querySelector('small'), 'el nombre no debe quedar truncado dentro del botón').toBeNull();
    expect(boton?.getAttribute('title')).toBe('ui.parkedTickets');
  });

  it('las líneas (y el estado vacío) van DENTRO del ion-content, que es quien scrollea', async () => {
    const el = await montarCarrito();
    const content = el.shadowRoot!.querySelector('aside.cart > ion-content')!;
    expect(content, 'falta el ion-content del carrito').toBeTruthy();

    // Carrito vacío: el mensaje va dentro del content, no suelto entre el header y el pie.
    expect(content.querySelector('.empty'), 'el estado vacío va dentro del ion-content').toBeTruthy();
  });

  it('cada módulo monta SU botón de asignación en el header (ADR-0043 B, sin mezclar)', async () => {
    // El POS no conoce a tables/customers: pide el slot `sales.pos.assign` y monta el WC de cada
    // aportante como un botón independiente en el header (cada uno abre su propio modal). Aquí dos
    // dobles aportan sus botones (mesa y cliente).
    posSdk.sdk.loadSlot = async (slot: string) => {
      slotsPedidos.push(slot);
      return slot === 'sales.pos.assign'
        ? [{ component: 'erp-fake-mesa' }, { component: 'erp-fake-cliente' }]
        : [];
    };

    const el = await montarCarrito();

    // Se pide por el canal cross-módulo (ADR-0043), con el slot único de asignación.
    expect(slotsPedidos, 'el POS debe pedir el slot `sales.pos.assign` al SDK').toContain('sales.pos.assign');

    // Los fillers se montan en la barra de acciones del header.
    const host = el.shadowRoot!.querySelector('.cart-actions-slot');
    expect(host, 'el header expone `.cart-actions-slot` para los botones de los módulos').toBeTruthy();
    expect(host?.closest('.order-toolbar'), 'el contenedor vive en la barra de acciones').toBeTruthy();
    expect(host?.querySelector('erp-fake-mesa'), 'monta el botón de mesa').toBeTruthy();
    expect(host?.querySelector('erp-fake-cliente'), 'monta el botón de cliente').toBeTruthy();
  });
});

// ── Mesa y cliente aparecen como CONTEXTO; sus botones quedan libres (decisión Ioan 2026-07-20) ─
// Los módulos son dueños de las asociaciones y los selectores. Sales recibe solo etiquetas opacas
// y las muestra juntas bajo el título: así el botón de Mesa no desaparece al asignar Mesa 2 y se
// puede usar inmediatamente para cambiar/asignar otra. Tables ya no aporta un segundo chip.
describe('contexto de la cuenta: mesa y cliente visibles con sus selectores libres', () => {
  it('la MESA se muestra una sola vez en el bloque de contexto de la cuenta', async () => {
    const el = await montarCarrito();

    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm2', label: 'Mesa 2' }, bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const textos = [...el.shadowRoot!.querySelectorAll('.order-context ion-chip')].map((c) => c.textContent?.trim());
    expect(textos.filter((x) => x === 'Mesa 2'), 'la etiqueta opaca aparece exactamente una vez')
      .toHaveLength(1);
  });

  it('al restaurar la mesa del mismo pedido adopta su contexto sin abrir cuenta a medias', async () => {
    const el = await montarCarrito();
    const pos = el as unknown as {
      orderId?: string; orderLabel: string; cart: Array<Record<string, unknown>>;
      tableId?: string; tableLabel: string; dirtyOpen: boolean;
      updateComplete: Promise<unknown>;
    };
    pos.orderId = 'o1';
    pos.orderLabel = 'Cena terraza';
    pos.cart = [{ id: 'l1', product_id: 'p1', name: 'Café', qty: 1, price: 180 }];

    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm6', label: 'Mesa 6', order_id: 'o1' }, bubbles: true, composed: true,
    }));
    await pos.updateComplete;

    expect(pos.tableId).toBe('m6');
    expect(pos.tableLabel).toBe('Mesa 6');
    expect(pos.orderLabel, 'el título editado del ticket se conserva').toBe('Cena terraza');
    expect(pos.dirtyOpen, 'no es otra cuenta: no se pide aparcar ni descartar').toBe(false);
  });

  it('el CLIENTE sí lo pinta el POS: `ok-spotlight-search` solo lo deja en el aria-label', async () => {
    const el = await montarCarrito();

    el.dispatchEvent(new CustomEvent('erp:customer-context', {
      detail: { customer_id: 'c1', customer_name: 'Ana Ruiz', customer_tax_id: '', customer_address: '' },
      bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const cust = el.shadowRoot!.querySelector('.order-context ion-chip');
    expect(cust?.textContent?.trim(), 'el nombre del cliente asignado tiene que verse').toBe('Ana Ruiz');
  });

  it('sin nada asignado muestra que la cuenta no tiene contexto', async () => {
    const el = await montarCarrito();
    expect(el.shadowRoot!.querySelector('.order-context .context-empty')?.textContent?.trim())
      .toBe('ui.noCheckContext');
  });

  it('el lápiz es un botón real y lleva el foco al título editable', async () => {
    const el = await montarCarrito();
    const editar = el.shadowRoot!.querySelector<HTMLButtonElement>('button.title-edit')!;
    const titulo = el.shadowRoot!.querySelector<HTMLInputElement>('input.order-title')!;

    expect(editar.getAttribute('aria-label')).toBe('ui.editCheckTitle');
    editar.click();

    expect(el.shadowRoot!.activeElement, 'el título queda listo para escribir, no parece bloqueado').toBe(titulo);
    expect((esCatalog as { ui: Record<string, string> }).ui.parkNameHint)
      .toContain('opcional');
  });

  // La etiqueta también viaja OPACA en la comanda que se manda a cocina (ADR-0144).
  it('el POS conserva la etiqueta de mesa para la comanda de cocina', async () => {
    const el = await montarCarrito();
    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm2', label: 'Mesa 2' }, bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect((el as unknown as { tableLabel: string }).tableLabel).toBe('Mesa 2');
  });
});

describe('categorías: desbordamiento horizontal', () => {
  it('usa el ion-segment scrollable de Ionic en lugar de botones sueltos', async () => {
    const el = await montarCarrito();
    const seg = el.shadowRoot!.querySelector<HTMLElement>('ion-segment.category-segment');

    expect(seg, 'falta el segmento de categorías').toBeTruthy();
    expect(seg?.hasAttribute('scrollable'), 'Ionic debe gestionar el desplazamiento horizontal').toBe(true);
    expect(seg?.classList.contains('ok-tabbar'), 'reutiliza la pista de overflow de la bottom bar').toBe(true);
    expect(seg?.querySelector('ion-segment-button[value=""]'), 'Todos también es una opción del segmento').toBeTruthy();
    expect(el.shadowRoot!.querySelector('.catcard'), 'no quedan los botones de categoría antiguos').toBeNull();
  });

  it('indica en qué borde quedan categorías ocultas, igual que la bottom bar', async () => {
    const el = await montarCarrito();
    const seg = el.shadowRoot!.querySelector<HTMLElement>('ion-segment.category-segment')!;
    Object.defineProperty(seg, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(seg, 'scrollWidth', { configurable: true, value: 1200 });

    seg.scrollLeft = 0;
    seg.dispatchEvent(new Event('scroll'));
    expect(seg.dataset.overflow).toBe('end');

    seg.scrollLeft = 200;
    seg.dispatchEvent(new Event('scroll'));
    expect(seg.dataset.overflow).toBe('both');

    seg.scrollLeft = 800;
    seg.dispatchEvent(new Event('scroll'));
    expect(seg.dataset.overflow).toBe('start');
    el.remove();
  });

  it('convierte la rueda vertical en desplazamiento horizontal cuando las categorías no caben', async () => {
    const el = await montarCarrito();
    const seg = el.shadowRoot!.querySelector<HTMLElement>('ion-segment.category-segment')!;
    Object.defineProperty(seg, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(seg, 'scrollWidth', { configurable: true, value: 1200 });
    seg.scrollLeft = 0;

    seg.dispatchEvent(new WheelEvent('wheel', { deltaY: 160, cancelable: true, bubbles: true }));

    expect(seg.scrollLeft, 'rueda/trackpad descubre las categorías que quedan a la derecha').toBe(160);
  });
});

// ── Tamaño de los iconos de la cabecera ───────────────────────────────────────────────────────
// En la cabecera conviven iconos de tres dueños distintos (POS, tables, customers) y cada uno traía
// su tamaño: el del ion-chip de mesa a 20px y los ion-button de al lado a 17px. Y el de mesa es de
// OTRO set (Material Symbols `ms-table-restaurant`), con viewBox y grosor distintos de Ionicons:
// con el mismo número se ve más pequeño.
//
// El contrato es que el tamaño lo fija UN token que el POS declara en su toolbar y que los módulos
// heredan (las custom properties cruzan el shadow boundary). Así no hay tamaños sueltos por
// componente, y quien monte mañana un tercer botón en el slot hereda el mismo.
describe('iconos de la cabecera del carrito: un único tamaño heredado', () => {
  it('el POS declara el token de tamaño en la toolbar del carrito', async () => {
    const el = await montarCarrito();
    const declaradas = (el.constructor as unknown as { styles: { cssText: string } | Array<{ cssText: string }> }).styles;
    const css = [declaradas].flat().map((s) => s.cssText).join('\n');
    expect(css, 'la toolbar del carrito debe declarar --pos-hdr-icon-size').toMatch(/--pos-hdr-icon-size\s*:/);
  });

  it('los iconos propios del POS toman su tamaño de ese token, no de un número suelto', async () => {
    const el = await montarCarrito();
    const declaradas = (el.constructor as unknown as { styles: { cssText: string } | Array<{ cssText: string }> }).styles;
    const css = [declaradas].flat().map((s) => s.cssText).join('\n');
    expect(css, 'los ion-icon de la cabecera consumen var(--pos-hdr-icon-size)')
      .toMatch(/ion-buttons\s+ion-icon\s*\{[^}]*var\(--pos-hdr-icon-size/);
  });
});

// El modal del documento (tiquet/factura tras cobrar) se vio feo en el TPV real (2026-07-16):
// título «Documento» que no aportaba, IMPRIMIR flotando arriba-derecha y el tiquet perdido en un
// modal enorme. El contrato nuevo: SIN título (solo la X de cerrar), el documento en el
// ion-content, e IMPRIMIR en un ion-footer abajo — donde el pulgar lo espera en un TPV táctil.
// El markup vive en el helper compartido document-modal.ts (touch, desktop y lista pintan el mismo).
describe('modal del documento de venta', () => {
  it('sin título, documento en el content, imprimir en el ion-footer', async () => {
    const el = await montarCarrito();
    (el as unknown as Record<string, unknown>).docSaleId = 'venta-1';
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const modal = el.shadowRoot!.querySelector('ion-modal.doc-modal')!;
    expect(modal, 'el modal del documento lleva la clase doc-modal (tamaño de papel)').toBeTruthy();
    expect(modal.querySelector('ion-title'), 'sin título «Documento»: no aporta nada').toBeNull();
    expect(modal.querySelector('ion-content erp-sales-document'), 'el documento va en el content').toBeTruthy();

    const pie = modal.querySelector('ion-footer');
    expect(pie, 'imprimir vive en un ion-footer').toBeTruthy();
    expect(pie!.querySelector('ion-button.print'), 'el botón de imprimir va en el pie').toBeTruthy();
    expect(modal.lastElementChild, 'el pie es lo último del modal').toBe(pie);

    // La X de cerrar sigue existiendo (accesible), aunque ya no haya toolbar con título.
    expect(modal.querySelector('ion-button.doc-close'), 'la X de cerrar sigue presente').toBeTruthy();
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
    const sdk = posSdk.sdk;
    sdk.formatMoney = (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`;
    sdk.formatAmount = (units: number) => `${(units || 0).toFixed(2)} €`;
    const productos = [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    posSdk.setQuery('inventory.products.list', productos);
    // ADR-0141: añadir al carrito ya no muta un array en memoria — abre/actualiza un PEDIDO real y
    // espera a que la fila esté escrita. El runtime devuelve los ids creados en `new_ids`.
    sdk.command = async () => ({ ok: true, new_ids: ['ord-1', 'line-1'] });
  });

  it('un café de 180 céntimos se pinta 1,80 € en la rejilla (no 180,00 €)', async () => {
    const el = await montarCarrito();
    const precio = el.shadowRoot!.querySelector('.tile .tinfo .p')?.textContent?.trim();
    expect(precio, 'la rejilla del TPV pinta el precio ×100').toBe('1.80 €');
  });

  it('el total del carrito también va en céntimos', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    // La línea se PERSISTE antes de pintarse (ADR-0141): hay que drenar la cola de microtareas del
    // command, no solo esperar al render.
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const total = el.shadowRoot!.querySelector('.total b')?.textContent?.trim();
    expect(total, 'el total del carrito sale ×100').toBe('1.80 €');
  });
});

// ── Incidencia 4 (ADR-0147): unidades medibles en la línea del carrito ────────────────────────
// Dos detalles vistos en el TPV real con productos a peso/volumen (0,5 kg de gamba):
//
// 4a) Al RECHAZAR una cantidad fuera de rejilla, el CAMPO del stepper se quedaba pintando lo
//     tecleado («0.0005»). El estado era correcto; el pixel no. Causa doble: el re-render del POS
//     pasa `.value=${l.qty}` pero la propiedad no cambió (0,5 → 0,5) → Lit no toca el input; y el
//     stepper ya había COMMITEADO lo tecleado a su `value` ANTES de emitir `ok-change` (síncrono),
//     así que restaurar en el mismo tick tampoco repinta (valor neto igual → dirty-check). El
//     contrato: el POS espera a que el render en vuelo del stepper asiente y ENTONCES restaura la
//     propiedad — eso SÍ es un cambio y el input vuelve a la cantidad real.
//
// 4b) La línea no decía EN QUÉ UNIDAD va la cantidad: «12,00 €» con qty 0,5 parece media docena.
//     Si la unidad congelada no es la suelta (`ud`), el precio unitario lleva el sufijo del código:
//     «12,00 € / kg». El código NO se traduce (kg/g/l son códigos, no texto).
describe('unidades medibles en la línea (incidencia 4, ADR-0147)', () => {
  /** Línea a peso, congelada en kg con rejilla de 0,5 (increment_value en µ). */
  const lineaKg = {
    id: 'p-gamba', name: 'Gamba roja', price: 1200, qty: 0.5,
    unit_code: 'kg', unit_name: 'kilogramo', increment_value: 500_000,
  };
  const lineaUd = { id: 'p-cafe', name: 'Café solo', price: 180, qty: 1, unit_code: 'ud' };

  /** Siembra el carrito directamente (las líneas ya vienen con su contexto congelado). */
  async function conCarrito(lineas: unknown[]) {
    const el = await montarCarrito();
    (el as unknown as { cart: unknown[] }).cart = lineas;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  it('4b: la línea a peso pinta el precio con su unidad («12.00 € / kg»); la suelta, sin sufijo', async () => {
    const el = await conCarrito([lineaKg, lineaUd]);
    const precios = [...el.shadowRoot!.querySelectorAll('ion-list.lines ion-item ion-label p')]
      .map((p) => p.textContent?.trim());
    expect(precios, 'kg lleva sufijo; ud no').toEqual(['12.00 € / kg', '1.80 €']);
  });

  it('4a: al rechazar una cantidad fuera de rejilla, el stepper vuelve a pintar la cantidad real', async () => {
    const el = await conCarrito([{ ...lineaKg }]);
    const stepper = el.shadowRoot!.querySelector('ok-qty-stepper') as HTMLElement & {
      value: number; updateComplete: Promise<unknown>;
    };
    expect(stepper, 'la línea tiene su stepper').toBeTruthy();
    await stepper.updateComplete;

    // El camarero teclea «0.0005» en el campo del stepper (rejilla = 0,5 → fuera de rejilla).
    const campo = stepper.shadowRoot!.querySelector('input.field') as HTMLInputElement;
    campo.value = '0.0005';
    campo.dispatchEvent(new Event('input'));

    // Deja asentar el render en vuelo del stepper y la restauración del POS.
    await new Promise((r) => setTimeout(r, 0));
    await stepper.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await stepper.updateComplete;

    // El estado real no se tocó y el error avisa (eso ya funcionaba)…
    const pos = el as unknown as { cart: { qty: number }[]; error: string };
    expect(pos.cart[0].qty, 'el carrito no se altera').toBe(0.5);
    expect(pos.error, 'se avisa del rechazo').toContain('ui.qtyOffGrid');
    // …y AHORA también el pixel: la propiedad restaurada y el campo repintado con la cantidad real.
    expect(stepper.value, 'la propiedad value vuelve a la cantidad persistida').toBe(0.5);
    expect(campo.value, 'el campo del stepper no se queda con lo rechazado').toBe('0.5');
  });
});

// El PINPAD del cobro trabaja en EUROS («20» = 20 €) pero el contrato de sales.complete_sale es
// CÉNTIMOS (ADR-0007/0123) y `total` ya viaja así. El táctil mandaba `Number('20')` = 20 «céntimos»
// → el tiquet real salía «Efectivo 0.20 €» y el cambio 0 (20 < 1250). El desktop ya convertía con
// `eurosToCents` (SDK); aquí se fija el MISMO contrato para el táctil, visto en QA real 2026-07-17.
describe('cobro táctil: lo entregado viaja en CÉNTIMOS (ADR-0007)', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];

  beforeEach(() => {
    comandos = [];
    const sdk = posSdk.sdk;
    const productos = [{ id: 'p1', name: 'Champú reparador', sku: 'CR', price: 1250, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    posSdk.setQuery('inventory.products.list', productos);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return {};
    };
  });

  it('teclear «20» en el pinpad manda amount_tendered=2000 (céntimos), no 20', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const tap = el as unknown as { tap(k: string): void; confirm(): Promise<void> };
    tap.tap('2'); tap.tap('0');
    await tap.confirm();

    const venta = comandos.find((c) => c.name === 'sales.complete_sale');
    expect(venta, 'el TPV debe completar la venta').toBeTruthy();
    expect(venta!.payload.amount_tendered, '20 € tecleados = 2000 céntimos').toBe(2000);
  });
});

// El cliente asignado en el TPV no es solo una etiqueta: es lo que hace que la FACTURA salga con NIF.
// El slot `customers` emite el snapshot fiscal en `erp:customer-context`; el POS lo guarda y lo manda
// en `sales.complete_sale`, de ahí viaja en `sale.completed` y `invoice` lo copia al documento
// (ADR-0132). Si el POS lo tira por el camino, la factura sale sin NIF aunque el cliente lo tenga.
describe('snapshot fiscal del cliente (ADR-0132)', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];

  beforeEach(() => {
    comandos = [];
    const sdk = posSdk.sdk;
    const productos = [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    posSdk.setQuery('inventory.products.list', productos);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return {};
    };
  });

  it('reenvía NIF y dirección del cliente a sales.complete_sale', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    el.dispatchEvent(new CustomEvent('erp:customer-context', {
      detail: {
        customer_id: 'cus-1',
        customer_name: 'Ana García',
        customer_tax_id: '12345678Z',
        customer_address: 'Calle Mayor 1, 28013 Madrid, ES',
      },
      bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    await (el as unknown as { confirm(): Promise<void> }).confirm();

    const venta = comandos.find((c) => c.name === 'sales.complete_sale');
    expect(venta, 'el TPV debe completar la venta').toBeTruthy();
    expect(venta!.payload.customer_id).toBe('cus-1');
    expect(venta!.payload.customer_name).toBe('Ana García');
    expect(venta!.payload.customer_tax_id).toBe('12345678Z');
    expect(venta!.payload.customer_address).toBe('Calle Mayor 1, 28013 Madrid, ES');
  });

  it('venta anónima: no arrastra el NIF de la venta anterior', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    el.dispatchEvent(new CustomEvent('erp:customer-context', {
      detail: { customer_id: null, customer_name: '', customer_tax_id: '', customer_address: '' },
      bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    await (el as unknown as { confirm(): Promise<void> }).confirm();

    const venta = comandos.find((c) => c.name === 'sales.complete_sale')!;
    expect(venta.payload.customer_id).toBeNull();
    expect(venta.payload.customer_tax_id).toBe('');
    expect(venta.payload.customer_address).toBe('');
  });
});

// ── «Enviado a cocina» salía en ROJO (visto en el TPV real, 2026-07-18) ───────────────────────
// El aviso de éxito de la comanda se metía por `this.error`, el mismo hueco rojo donde se pintan
// los fallos, y encima sobre la rejilla de productos: decía que algo había ido BIEN con la pinta
// de algo que había ido MAL. Le pasaba igual a «Aparcado como …».
//
// Causa raíz (más honda que el síntoma): el Hub YA tiene toast global y el SDK YA tiene
// `notify()`, pero nadie los conectaba — `notifier` no se pasaba nunca al crear el cliente, así
// que `notify()` era un no-op silencioso y cada módulo acababa colándose por el canal de error.
// Contrato: los avisos van por `erplora().notify()`; `this.error` queda SOLO para fallos.
describe('avisos de éxito: van por notify(), no por el hueco rojo de error', () => {
  let avisos: { type: string; message: string }[];
  let comandos: string[];

  beforeEach(() => {
    avisos = [];
    comandos = [];
    const sdk = posSdk.sdk;
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string) => {
      comandos.push(name);
      return name === 'sales.order.open' ? { ok: true, new_ids: ['o1', 'l1'] } : { ok: true };
    };
    sdk.notify = (n: { type: string; message: string }) => { avisos.push(n); };
  });

  it('mandar la comanda a cocina avisa en verde, no en rojo', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    // Añadir un artículo pasa por la COLA SERIAL del carrito (ADR-0144), así que no termina dentro
    // de `updateComplete`. Encolar una tarea vacía espera de forma determinista a las anteriores.
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    await (el as unknown as { fireToKitchen(): Promise<void> }).fireToKitchen();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(comandos, 'debe dispararse la comanda').toContain('sales.order.fire');
    expect(avisos, 'el éxito se anuncia por el canal de AVISO del shell')
      .toContainEqual({ type: 'success', message: 'ui.firedToKitchen' });
    expect((el as unknown as { error: string }).error, 'el hueco rojo se queda vacío: no hubo fallo').toBe('');
  });

  it('si cocina falla, eso SÍ es un error y va en rojo', async () => {
    const sdk = posSdk.sdk;
    sdk.command = async (name: string) => {
      if (name === 'sales.order.fire') throw new Error('sin kitchen');
      return name === 'sales.order.open' ? { ok: true, new_ids: ['o1', 'l1'] } : { ok: true };
    };

    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    // Añadir un artículo pasa por la COLA SERIAL del carrito (ADR-0144), así que no termina dentro
    // de `updateComplete`. Encolar una tarea vacía espera de forma determinista a las anteriores.
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    await (el as unknown as { fireToKitchen(): Promise<void> }).fireToKitchen();

    expect((el as unknown as { error: string }).error).toBe('ui.fireFailed');
    expect(avisos, 'un fallo no se anuncia como aviso de éxito').toHaveLength(0);
  });
});

// ── Cuenta + Comanda actual cuando Cocina aporta sus slots ───────────────────────────────────
// El vertical NO es un ajuste: la funcionalidad se pone y se quita INSTALANDO MÓDULOS
// (composición de lo básico a lo complejo). El carrito de sales es UNIVERSAL: plano mientras
// nada se haya enviado a producción; en cuanto alguna línea lleva `fired_at` (alguien disparó
// — sales no sabe quién), se parte solo en **PENDIENTE DE ENVIAR** (editable) y **ENVIADO**
// (bloqueado, cobrable). El detalle de comandas con estados vivos NO vive aquí: lo aporta
// kitchen con su chip+modal por el slot `sales.pos.order_info` (montado en la cabecera de
// ENVIADO). Una tienda jamás dispara → jamás ve secciones. Cero configuración.
describe('carrito universal: secciones Pendiente/Enviado emergen del dato', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];

  beforeEach(() => {
    comandos = [];
    const sdk = posSdk.sdk;
    sdk.t = (_catalog: unknown, key: string, params?: Record<string, unknown>) =>
      (params ? `${key} ${Object.values(params).join(' ')}` : key);
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Entrecot', sku: 'ENT', price: 2500, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return name === 'sales.order.open' ? { ok: true, new_ids: ['o1', 'l1'] } : { ok: true };
    };
    sdk.loadSlot = async (slot: string) => {
      slotsPedidos.push(slot);
      return slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire' }]
        : slot === 'sales.pos.order_info' ? [{ component: 'erp-fake-comandas' }] : [];
    };
  });

  const disparada = {
    id: 'p9', name: 'Caña', price: 250, qty: 2, line_id: 'l9',
    round_no: 1, fired_at: '2026-07-19T14:02:00+00:00',
  };
  const disparada2 = {
    id: 'p8', name: 'Croquetas', price: 700, qty: 1, line_id: 'l8',
    round_no: 2, fired_at: '2026-07-19T14:25:00+00:00',
  };
  const pendiente = { id: 'p1', name: 'Entrecot', price: 2500, qty: 1, line_id: 'l1' };

  it('con líneas enviadas: PENDIENTE DE ENVIAR arriba (editable) y ENVIADO debajo (bloqueado)', async () => {
    const el = await montarCarrito();
    const pos = el as unknown as { cart: unknown[]; updateComplete: Promise<unknown> };
    pos.cart = [disparada, disparada2, pendiente];
    await pos.updateComplete;

    const secciones = [...el.shadowRoot!.querySelectorAll('.sec')];
    expect(secciones[0]?.classList.contains('sec-pending'),
      'lo pendiente va arriba: es donde trabaja el camarero').toBe(true);
    expect(secciones[1]?.classList.contains('sec-sent')).toBe(true);
    expect(secciones[0].querySelector('ok-qty-stepper'), 'lo pendiente se edita').toBeTruthy();
    expect(secciones[1].querySelector('ok-qty-stepper'), 'lo que está en fuego no se edita').toBeFalsy();
    // El detalle por comanda (números, horas, estados) NO vive aquí: es del modal de kitchen.
    expect(el.shadowRoot!.querySelector('.course'), 'sin grupos de comanda inline').toBeFalsy();
  });

  it('con Cocina activa pero sin envíos, Cuenta sigue limpia y plana; el segmento sí aparece', async () => {
    const el = await montarCarrito();
    const pos = el as unknown as { cart: unknown[]; updateComplete: Promise<unknown> };
    pos.cart = [pendiente];
    await pos.updateComplete;
    expect(el.shadowRoot!.querySelector('.sec'), 'las secciones nacen cuando hay datos enviados').toBeFalsy();
    expect(el.shadowRoot!.querySelector('ion-list.lines'), 'la cuenta muestra sus líneas').toBeTruthy();
    expect(el.shadowRoot!.querySelector('ion-segment.view-tabs'), 'Cocina añade Cuenta/Comanda actual').toBeTruthy();
  });

  it('el slot sales.pos.order_info se monta en la cabecera de ENVIADO (ahí vive el chip de kitchen)', async () => {
    const el = await montarCarrito();
    const pos = el as unknown as { cart: unknown[]; updateComplete: Promise<unknown> };
    pos.cart = [disparada, pendiente];
    await pos.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await pos.updateComplete;

    expect(slotsPedidos, 'el POS pide el slot de info del pedido').toContain('sales.pos.order_info');
    const filler = el.shadowRoot!.querySelector('.sec-sent .sec-slot erp-fake-comandas');
    expect(filler, 'el filler se monta en la cabecera de ENVIADO').toBeTruthy();
  });

  it('disparar manda SOLO las líneas pendientes, con su número local', async () => {
    const el = await montarCarrito();
    const pos = el as unknown as {
      cart: unknown[]; orderId?: string; updateComplete: Promise<unknown>;
      fireToKitchen(): Promise<void>;
    };
    pos.cart = [disparada, pendiente];
    pos.orderId = 'o1';
    await pos.updateComplete;

    await pos.fireToKitchen();

    const fire = comandos.find((c) => c.name === 'sales.order.fire');
    expect(fire, 'se dispara el comando del host').toBeTruthy();
    const items = fire!.payload.items as Array<{ product_name: string }>;
    expect(items.map((i) => i.product_name), 'SOLO lo pendiente — nada de reenviar la caña ya servida')
      .toEqual(['Entrecot']);
    expect(fire!.payload.round_no, 'la siguiente comanda local tras la 1').toBe(2);
  });
});

// ── Cocina entra por slot dentro de Comanda actual ───────────────────────────────────────────
// «Enviar a cocina» vivía hardcodeado en el footer y lo veían peluquerías y tiendas sin cocina.
// `kitchen` aporta el botón por `sales.pos.actions`, y sales lo coloca dentro de la vista temporal
// Comanda actual. Contrato por CustomEvents (ADR-0043, decisión Ioan 2026-07-19):
//   host → filler  `erp:pos-state {order_id?, items_count, label, channel}` al montar y en cada
//                  cambio de carrito/mesa (sobre el elemento, como `erp:order-restored`).
//   filler → host  `erp:order-fire {}` → el HOST ejecuta su `sales.order.fire` (el estado del
//                  carrito vive aquí; al filler no viaja ninguna línea).
// Sin fillers desaparecen tanto la acción como la segunda vista.
describe('slot sales.pos.actions: cocina inyectada dentro de Comanda actual', () => {
  let comandos: string[];

  beforeEach(() => {
    comandos = [];
    const sdk = posSdk.sdk;
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string) => {
      comandos.push(name);
      return name === 'sales.order.open' ? { ok: true, new_ids: ['o1', 'l1'] } : { ok: true };
    };
    sdk.loadSlot = async (slot: string) => {
      slotsPedidos.push(slot);
      return slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire' }] : [];
    };
  });

  async function conCafe() {
    const el = await montarCarrito();
    (el as unknown as { orderView: 'draft' }).orderView = 'draft';
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  /** El stub del bloque solo apunta NOMBRES; para mirar el payload se envuelve aquí (hub#1411). */
  function capturarPayloads() {
    const vistos: { name: string; payload: Record<string, unknown> }[] = [];
    const sdk = posSdk.sdk;
    const previo = sdk.command;
    sdk.command = async (name: string, payload?: Record<string, unknown>) => {
      vistos.push({ name, payload: payload ?? {} });
      return previo(name, payload);
    };
    return vistos;
  }

  it('pide el slot y monta el filler en .draft-actions-slot; el footer queda solo para cobrar', async () => {
    const el = await montarCarrito();
    (el as unknown as { orderView: 'draft' }).orderView = 'draft';
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(slotsPedidos, 'el POS pide el slot de acciones').toContain('sales.pos.actions');
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire');
    expect(filler, 'el filler se monta dentro de Comanda actual').toBeTruthy();
    const botones = [...el.shadowRoot!.querySelectorAll('ion-footer ion-button')];
    expect(botones.some((b) => b.getAttribute('title') === 'ui.fireToKitchen'),
      'el botón de cocina del POS (hardcodeado) desapareció').toBe(false);
  });

  it('sin fillers desaparecen Cocina, su segmento y su hueco', async () => {
    const sdk = posSdk.sdk;
    sdk.loadSlot = async () => [];
    const el = await montarCarrito();

    expect(el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')).toBeFalsy();
    expect(el.shadowRoot!.querySelector('ion-segment.view-tabs')).toBeFalsy();
    const botones = [...el.shadowRoot!.querySelectorAll('ion-footer ion-button')];
    expect(botones.some((b) => b.getAttribute('title') === 'ui.fireToKitchen'),
      'una peluquería no ve cocina').toBe(false);
  });

  it('con Cocina no permite aparcar/cambiar de cuenta mientras haya productos sin enviar', async () => {
    const el = await conCafe();
    await (el as unknown as { requestPark(): Promise<void> }).requestPark();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect((el as unknown as { orderView: string }).orderView).toBe('draft');
    const aviso = document.body.querySelector('ion-alert') as HTMLElement & {
      isOpen: boolean; header: string; message: string;
    };
    expect(el.shadowRoot!.querySelector('ion-alert'),
      'el overlay no se declara dentro del Shadow DOM: ahí se convertía en una ventana negra').toBeNull();
    expect(aviso.isOpen, 'el bloqueo se explica en un alert de Ionic montado en body').toBe(true);
    expect(aviso.header).toBe('ui.pendingSwitchTitle');
    expect(aviso.message).toBe('ui.pendingBeforeSwitch');
    expect((esCatalog as { ui: Record<string, string> }).ui.pendingBeforeSwitch)
      .toBe('Hay productos en la comanda actual sin enviar ({count}). Envíalos o elimínalos antes de cambiar de cuenta.');
    expect((el as unknown as { error: string }).error,
      'no es un fallo: no debe ocupar el mensaje rojo del catálogo').toBe('');
    expect(comandos).not.toContain('sales.order.set_label');
  });

  it('el filler recibe erp:pos-state al montarse y al cambiar el carrito (con pending_count)', async () => {
    const estados: Array<{ items_count: number; pending_count: number }> = [];
    const el = await montarCarrito();
    (el as unknown as { orderView: 'draft' }).orderView = 'draft';
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;
    filler.addEventListener('erp:pos-state', (e) => {
      estados.push((e as CustomEvent<{ items_count: number; pending_count: number }>).detail);
    });

    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(estados.length, 'cada cambio del carrito informa al filler').toBeGreaterThan(0);
    const ultimo = estados[estados.length - 1];
    expect(ultimo.items_count, 'el último estado cuenta el café').toBe(1);
    expect(ultimo.pending_count, 'y cuánto queda SIN enviar (el badge del botón de cocina)').toBe(1);
  });

  // sales#80 — el doble toque en «Enviar a cocina» del filler llegaba como DOS `erp:order-fire` y el
  // host lanzaba dos `sales.order.fire` con las mismas líneas pendientes (misma ronda): dos comandas.
  it('dos erp:order-fire seguidos (doble toque) disparan UN solo sales.order.fire (sales#80)', async () => {
    const el = await conCafe();
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;

    filler.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    filler.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(comandos.filter((c) => c === 'sales.order.fire')).toHaveLength(1);
  });

  // sales#201 — el rechazo llega por `Output.error`, así que el código viaja en el CAMPO `code`
  // del sobre y el mensaje es solo el detalle. Mirar el código dentro de la frase funcionaba
  // únicamente mientras el handler la formateaba como «<code>: <detalle>».
  it('si el servidor dice que no había nada pendiente (sales.nothing_to_fire), no es un error para el cajero', async () => {
    const el = await conCafe();
    const sdk = posSdk.sdk as unknown as { command: (n: string, p?: unknown) => Promise<unknown> };
    const original = sdk.command;
    sdk.command = async (n: string, p?: unknown) => {
      if (n === 'sales.order.fire') {
        // Lo que lanza de verdad el SDK: un error TIPADO con su `code` y una frase que ningún
        // buscador de subcadenas reconoce.
        const e = new Error('this round was already fired') as Error & { code: string };
        e.code = 'sales.nothing_to_fire';
        throw e;
      }
      return original(n, p);
    };
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;
    filler.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect((el as unknown as { error: string }).error, 'la comanda ya estaba enviada: no hay nada que arreglar').toBe('');
    sdk.command = original;
  });

  it('y un fallo REAL de la comanda sí se dice, con su mensaje traducido', async () => {
    const el = await conCafe();
    const sdk = posSdk.sdk as unknown as { command: (n: string, p?: unknown) => Promise<unknown> };
    const original = sdk.command;
    sdk.command = async (n: string, p?: unknown) => {
      if (n === 'sales.order.fire') {
        const e = new Error('the kitchen queue is unreachable') as Error & { code: string };
        e.code = 'sales.order_id_required';
        throw e;
      }
      return original(n, p);
    };
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;
    filler.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect((el as unknown as { error: string }).error, 'un fallo que sí hay que arreglar no se traga').toContain('ui.fireFailed');
    sdk.command = original;
  });

  it('erp:order-fire del filler dispara sales.order.fire del host', async () => {
    const el = await conCafe();
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;

    filler.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(comandos, 'el host ejecuta SU comando al recibir el evento del filler')
      .toContain('sales.order.fire');
  });

  // hub#1411 — la URGENCIA la decide el filler de cocina (kitchen es dueño del concepto) y el
  // host la reenvía sin interpretarla, como la etiqueta de la mesa. Sin este paso el interruptor
  // del filler no llegaba a ninguna parte: el host componía el payload ignorando el detalle.
  it('reenvía la prioridad que trae el detalle del filler', async () => {
    const el = await conCafe();
    const disparos = capturarPayloads();
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;

    filler.dispatchEvent(new CustomEvent('erp:order-fire', {
      detail: { priority: 'rush' }, bubbles: true, composed: true,
    }));
    await new Promise((r) => setTimeout(r, 0));

    const fuego = disparos.find((c) => c.name === 'sales.order.fire');
    expect(fuego, 'el host dispara').toBeTruthy();
    expect(fuego!.payload.priority, 'la urgencia llega a `order.fired`').toBe('rush');
  });

  it('un disparo normal del filler sigue sin prioridad', async () => {
    const el = await conCafe();
    const disparos = capturarPayloads();
    const filler = el.shadowRoot!.querySelector('.draft-actions-slot erp-fake-fire')!;

    filler.dispatchEvent(new CustomEvent('erp:order-fire', { detail: {}, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));

    const fuego = disparos.find((c) => c.name === 'sales.order.fire');
    expect(fuego, 'el host dispara').toBeTruthy();
    expect('priority' in fuego!.payload, 'sin armar no viaja la clave').toBe(false);
  });
});

// ── Cuentas abiertas con NOMBRE + recuperar sin perder nada (rediseño TPV 2026-07-19) ─────────
// Tres males vistos en el TPV real: (1) los aparcados salían ANÓNIMOS (solo total+hora) porque
// nadie escribía la etiqueta; (2) recuperar/tocar mesa aparcaba EN SILENCIO — o peor: el helper
// `aparcar` de onOrderContext ANULABA (`sales.order.void`) la cuenta recién aparcada, la causa de
// «los tiquets aparcados desaparecen»; (3) la cuenta de una mesa se soltaba de su mesa al cambiar
// de tiquet. El contrato nuevo (decisiones Ioan 2026-07-19):
//
//   - Aparcar SIN mesa pide un nombre (default: la hora, patrón Loyverse) y lo persiste
//     (`sales.order.set_label`). Con MESA no pregunta: el nombre ES la mesa, una pulsación.
//   - Recuperar otro tiquet con carrito a medias: si la cuenta actual NO tiene mesa → diálogo
//     «¿aparcar o eliminar?»; si tiene mesa → SE QUEDA EN SU MESA (ni se aparca ni se suelta la
//     sesión) y se avisa con toast.
//   - Aparcar NUNCA anula: `sales.order.void` solo sale de una decisión explícita de eliminar.
describe('cuentas abiertas: aparcar con nombre, recuperar sin perder nada', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];
  let avisos: { type: string; message: string }[];
  let parqueados: number;
  let soltados: number;

  beforeEach(() => {
    comandos = [];
    avisos = [];
    parqueados = 0;
    soltados = 0;
    const sdk = posSdk.sdk;
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return name === 'sales.order.open' ? { ok: true, new_ids: ['o1', 'l1'] } : { ok: true };
    };
    sdk.notify = (n: { type: string; message: string }) => { avisos.push(n); };
  });

  /** Carrito con un café persistido (pedido o1 abierto). */
  async function conCafe() {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    // Cuenta lo que reciben los fillers: «se aparca» (tables suelta la mesa) vs «se suelta de
    // PANTALLA» (erp:order-detached: la sesión no se toca, la mesa sigue ocupada).
    (el as unknown as { assignFillers: Array<{ component: string; el: HTMLElement }> }).assignFillers
      .push({ component: 'erp-fake-mesa', el: (() => { const d = document.createElement('div'); d.addEventListener('erp:order-parked', () => { parqueados += 1; }); d.addEventListener('erp:order-detached', () => { soltados += 1; }); return d; })() });
    return el;
  }

  const asignarMesa = async (el: HTMLElement, label = 'Mesa 2') => {
    // Mesa LIBRE (sin order_id): lo marcado pasa a ser su comanda (assign-to-target), sin diálogo.
    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm2', label }, bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  };

  it('el título de una cuenta abierta se edita y persiste sobre el pedido real', async () => {
    const el = await conCafe();
    const input = el.shadowRoot!.querySelector<HTMLInputElement>('input.order-title')!;
    input.value = 'Cumpleaños de Ana';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(comandos.find((c) => c.name === 'sales.order.set_label')?.payload)
      .toMatchObject({ order_id: 'o1', label: 'Cumpleaños de Ana' });
  });

  it('aparcar SIN mesa pide nombre (default: la hora) y lo persiste con set_label', async () => {
    const el = await conCafe();
    await (el as unknown as { requestPark(): Promise<void> }).requestPark();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const dialogo = el.shadowRoot!.querySelector('dialog.park-dialog');
    expect(dialogo, 'sin mesa se pregunta el nombre').toBeTruthy();
    const campo = dialogo!.querySelector('input') as HTMLInputElement;
    expect(campo.value, 'el default es la hora HH:MM (Loyverse)').toMatch(/^\d{2}:\d{2}$/);

    campo.value = 'Ana — terraza';
    campo.dispatchEvent(new Event('input'));
    (dialogo!.querySelector('ion-button.park-confirm') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const etiqueta = comandos.find((c) => c.name === 'sales.order.set_label');
    expect(etiqueta, 'la etiqueta se persiste en el pedido').toBeTruthy();
    expect(etiqueta!.payload).toMatchObject({ order_id: 'o1', label: 'Ana — terraza' });
    expect((el as unknown as { cart: unknown[] }).cart, 'la pantalla queda libre').toHaveLength(0);
    expect(avisos.some((a) => a.type === 'success' && a.message.includes('ui.parkedToast')),
      'se avisa en VERDE, no por el hueco rojo').toBe(true);
    expect(comandos.some((c) => c.name === 'sales.order.void'), 'aparcar JAMÁS anula').toBe(false);
  });

  it('con mesa: «Dejar en la mesa» — sin diálogo, la mesa NO se suelta (la cuenta vive allí)', async () => {
    const el = await conCafe();
    await asignarMesa(el);
    await (el as unknown as { requestPark(): Promise<void> }).requestPark();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(el.shadowRoot!.querySelector('dialog.park-dialog'), 'con mesa no hay diálogo').toBeFalsy();
    const etiqueta = comandos.find((c) => c.name === 'sales.order.set_label');
    expect(etiqueta!.payload, 'la cuenta queda etiquetada con su mesa').toMatchObject({ order_id: 'o1', label: 'Mesa 2' });
    expect(parqueados, 'JAMÁS se aparca la sesión: la mesa sigue ocupada con su cuenta').toBe(0);
    expect(soltados, 'el filler solo suelta la PANTALLA (erp:order-detached)').toBeGreaterThan(0);
    expect((el as unknown as { cart: unknown[] }).cart, 'la pantalla queda libre').toHaveLength(0);
    expect(avisos.some((a) => a.message.includes('ui.leftAtTable')), 'se avisa dónde queda').toBe(true);
    expect(comandos.some((c) => c.name === 'sales.order.void')).toBe(false);
  });

  it('quitar la mesa (X del chip) con carrito: pide NOMBRE y aparca — sin diálogo de eliminar', async () => {
    // La X = «retirar la asignación de mesa» (el filler ya aparcó SU sesión): la cuenta pasa a
    // aparcada con nombre. Pedirlo evita cuentas etiquetadas «Mesa 4» cuya mesa quedó libre.
    const el = await conCafe();
    await asignarMesa(el);
    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: null }, bubbles: true, composed: true,
    }));
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const dialogo = el.shadowRoot!.querySelector('dialog.park-dialog');
    expect(dialogo, 'quitar la mesa pide el nombre del aparcado').toBeTruthy();
    expect(el.shadowRoot!.querySelector('dialog.dirty-dialog'), 'no es un ¿aparcar o eliminar?').toBeFalsy();
    (dialogo!.querySelector('ion-button.park-confirm') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(comandos.some((c) => c.name === 'sales.order.set_label'), 'la aparcada queda con nombre').toBe(true);
    expect(comandos.some((c) => c.name === 'sales.order.void'), 'aparcar JAMÁS anula').toBe(false);
  });

  it('recuperar con carrito sucio SIN mesa pregunta: eliminar anula, aparcar no', async () => {
    const el = await conCafe();
    const pos = el as unknown as {
      retrieve(c: { id: string; total: number; created_at: string }): Promise<void>;
      updateComplete: Promise<unknown>; orderId?: string;
    };
    const otra = { id: 'o2', total: 500, created_at: '2026-07-19T14:00:00+00:00' };

    const recuperando = pos.retrieve(otra);
    await new Promise((r) => setTimeout(r, 0));
    await pos.updateComplete;

    const dialogo = el.shadowRoot!.querySelector('dialog.dirty-dialog');
    expect(dialogo, 'con algo a medias se pregunta qué hacer').toBeTruthy();
    (dialogo!.querySelector('ion-button.discard-opt') as HTMLElement).click();
    await recuperando;

    expect(comandos.find((c) => c.name === 'sales.order.void')?.payload,
      'eliminar = anular LA CUENTA VIEJA (o1), no la recuperada').toMatchObject({ order_id: 'o1' });
    expect(pos.orderId, 'y se abre la elegida').toBe('o2');
  });

  it('recuperar con carrito CON mesa: la cuenta se queda en su mesa, sin diálogo ni void', async () => {
    const el = await conCafe();
    await asignarMesa(el);
    const pos = el as unknown as {
      retrieve(c: { id: string; total: number; created_at: string }): Promise<void>;
      updateComplete: Promise<unknown>; orderId?: string; tableId?: string;
    };

    await pos.retrieve({ id: 'o2', total: 500, created_at: '2026-07-19T14:00:00+00:00' });
    await pos.updateComplete;

    expect(el.shadowRoot!.querySelector('dialog.dirty-dialog'), 'con mesa no se pregunta').toBeFalsy();
    expect(comandos.some((c) => c.name === 'sales.order.void'), 'nada se anula').toBe(false);
    expect(parqueados, 'la mesa NO se suelta: la cuenta se queda allí, recuperable tocándola').toBe(0);
    expect(pos.orderId).toBe('o2');
    expect(pos.tableId, 'la pantalla ya no está en aquella mesa').toBeUndefined();
    expect(avisos.some((a) => a.message.includes('ui.leftAtTable')), 'se avisa dónde quedó').toBe(true);
  });

  it('tocar una mesa ocupada con carrito de barra pregunta — y aparcar JAMÁS anula (regresión)', async () => {
    // La causa de «los tiquets aparcados desaparecen»: el helper `aparcar` de onOrderContext
    // llamaba a `sales.order.void` tras aparcar (y usaba una variable `n` fantasma).
    const el = await conCafe();
    const pos = el as unknown as { updateComplete: Promise<unknown>; orderId?: string };

    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm9', label: 'Mesa 9', order_id: 'o9' }, bubbles: true, composed: true,
    }));
    await new Promise((r) => setTimeout(r, 0));
    await pos.updateComplete;

    const dialogo = el.shadowRoot!.querySelector('dialog.dirty-dialog');
    expect(dialogo, 'carrito de barra a medias → se pregunta').toBeTruthy();
    (dialogo!.querySelector('ion-button.park-opt') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await pos.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    expect(comandos.some((c) => c.name === 'sales.order.void'), 'aparcar JAMÁS anula').toBe(false);
    expect(comandos.some((c) => c.name === 'sales.order.set_label'), 'la aparcada queda con nombre').toBe(true);
    expect(pos.orderId, 'y se abre la comanda de la mesa tocada').toBe('o9');
  });
});

// ── Sheet de cobro = pantalla de TENDER (rediseño TPV 2026-07-19) ─────────────────────────────
// Todos los TPV del mercado (Loyverse, Square, Toast, Lightspeed…) cobran igual: UN botón Cobrar
// que abre la pantalla de tender, y AHÍ se elige el método (efectivo/tarjeta), se teclea lo
// entregado y se ve el cambio. Aquí el selector vivía FUERA, en un segment del footer del carrito
// — con la BD sin métodos sembrados ni siquiera se pintaba, y el cobro caía a efectivo a secas:
// «no hay pago con tarjeta». El contrato nuevo:
//
//   1. El selector de método vive DENTRO del sheet (botones grandes icono+NOMBRE, no un segment
//      mudo); el footer del carrito ya no lo pinta.
//   2. Efectivo (`requires_change=1`): atajos de entregado (`quickCashAmounts`, exacto primero)
//      + numpad + cambio. Los atajos existían con tests y estaban SIN cablear (estilos huérfanos).
//   3. Tarjeta (`requires_change=0`): ni numpad ni entregado — fila de importe exacto, pista del
//      datáfono y CTA que dice que se cobra con tarjeta.
//   4. El CTA y `amount_tendered` usan el PAYABLE (lo seleccionado en split), no el total: el
//      botón decía «Cobrar 3,60 €» cuando ibas a cobrar 1,80 € de una línea marcada.
describe('sheet de cobro (tender): método dentro, tarjeta sin numpad, atajos de efectivo', () => {
  const METODOS = [
    { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
    { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
  ];
  let comandos: { name: string; payload: Record<string, unknown> }[];
  /** sales#159 — los avisos del shell: es por donde CONTESTA un cobro bloqueado. */
  let avisosCobro: { type: string; message: string }[];

  beforeEach(() => {
    comandos = [];
    avisosCobro = [];
    const sdk = posSdk.sdk;
    sdk.notify = (n: { type: string; message: string }) => { avisosCobro.push(n); };
    posSdk.setQuery('sales.payment_methods', METODOS);
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return { ok: true, new_ids: ['o1', 'l1'] };
    };
  });

  /** Un carrito con un café y el sheet de cobro abierto. */
  async function conCobroAbierto() {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    (el as unknown as { openPay(): void }).openPay();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  it('el selector de método vive DENTRO del sheet, con nombre visible; el footer ya no lo pinta', async () => {
    const el = await conCobroAbierto();

    expect(el.shadowRoot!.querySelector('ion-footer .pay-methods'),
      'el footer del carrito ya no elige el método').toBeFalsy();

    const selector = el.shadowRoot!.querySelector('.sheet .pay-methods');
    expect(selector, 'el sheet de cobro contiene el selector de método').toBeTruthy();
    const nombres = [...selector!.querySelectorAll('button.pm-btn')].map((b) => b.textContent?.trim());
    expect(nombres, 'cada método es un botón grande con su NOMBRE (no un icono mudo)')
      .toEqual(['Efectivo', 'Tarjeta']);
    // El elegido se anuncia también a la accesibilidad, no solo con color.
    const activo = selector!.querySelector('button.pm-btn[aria-pressed="true"]');
    expect(activo?.textContent?.trim(), 'por defecto manda efectivo (defaultPayMethod)').toBe('Efectivo');
  });

  it('efectivo: numpad y cambio — SIN atajos de importe (Ioan los eliminó, no volver a añadirlos)', async () => {
    // GUARDA de una decisión explícita (2026-07-19): los botones de atajo (73/75/80 €) fuera
    // del sheet de cobro, y NO vuelven. El entregado se teclea en el numpad.
    const el = await conCobroAbierto();
    expect(el.shadowRoot!.querySelector('.sheet .quick'), 'sin bloque de atajos').toBeFalsy();
    expect(el.shadowRoot!.querySelector('.sheet .numpad'), 'el numpad sí').toBeTruthy();

    const tap = el as unknown as { tap(k: string): void; confirm(): Promise<void> };
    tap.tap('2');
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const cambio = el.shadowRoot!.querySelector('.sheet .big-change .v')?.textContent?.trim();
    expect(cambio, 'el cambio sale de lo tecleado').toBe('0.20 €');

    await tap.confirm();
    const venta = comandos.find((c) => c.name === 'sales.complete_sale')!;
    expect(venta.payload.amount_tendered, 'lo entregado viaja en céntimos').toBe(200);
    expect(venta.payload.payment_method_id).toBe('pm-cash');
  });

  it('sales#24 — efectivo por debajo del total: el botón no cobra y dice que falta importe', async () => {
    // El servidor rechaza (`sales.insufficient_tendered`), pero la cajera no debería tener que
    // llegar al rechazo: con 1,00 € tecleado sobre 1,80 € el CTA se apaga y avisa. Al completar
    // (2,00 €) vuelve a cobrar. Y 0 (nada tecleado) sigue siendo «importe exacto».
    //
    // 🔴 sales#159 — ESTE TEST EXIGÍA EL `disabled` NATIVO, Y ESO ERA EL BUG DE sales#58 EN EL
    // BOTÓN MÁS IMPORTANTE DE LA PANTALLA. En Ionic `disabled` es `pointer-events:none`: en una
    // tablet de mostrador el toque no llega a nada, no corre ningún handler y el motivo se queda
    // en un `title` que necesita un hover que no existe. Lo que se pide es exactamente lo que
    // sales#58 dejó escrito para las baldosas: `aria-disabled`, el motivo legible, y un toque que
    // CONTESTA. El contrato de este caso cambia aquí; lo que se comprueba —que 1,00 € sobre 1,80 €
    // no cobra y lo dice— es el mismo.
    const el = await conCobroAbierto();
    const tap = el as unknown as { tap(k: string): void; updateComplete: Promise<unknown>; error: string };
    const cta = () => el.shadowRoot!.querySelector<HTMLElement>('.sheet-foot ion-button.charge')!;

    expect(cta().getAttribute('aria-disabled'), 'sin teclear = exacto → se puede cobrar').not.toBe('true');

    tap.tap('1');
    await tap.updateComplete;
    expect(cta().hasAttribute('disabled'), 'un disabled nativo se tragaría el toque').toBe(false);
    expect(cta().getAttribute('aria-disabled'), '1,00 € no cubre 1,80 €').toBe('true');
    expect(cta().textContent, 'dice lo que pasa, no un «Cobrar» muerto').toContain('ui.tenderedShort');
    expect(el.shadowRoot!.querySelector('.sheet .pay-block-reason')?.textContent,
      'y el motivo se lee en la pantalla, no en un title').toContain('ui.tenderedShort');

    // El toque LLEGA y contesta (aviso del shell ENCIMA del motivo escrito, no en su lugar);
    // y no cobra media venta.
    cta().click();
    await new Promise((r) => setTimeout(r, 0));
    await tap.updateComplete;
    expect(avisosCobro.map((a) => a.message), 'el toque se contesta en voz alta').toContain('ui.tenderedShort');
    expect(comandos.some((c) => c.name === 'sales.complete_sale'), 'y no se cobra de menos').toBe(false);

    tap.tap('2'); // ahora 12,00 €
    await tap.updateComplete;
    expect(cta().getAttribute('aria-disabled'), '12,00 € sí cubre').not.toBe('true');
  });

  it('sales#24: en efectivo sin teclear nada NO viaja amount_tendered (exacto lo decide el servidor); tecleado, sí', async () => {
    const el = await conCobroAbierto();
    const pos = el as unknown as { tap(k: string): void; confirm(): Promise<void>; updateComplete: Promise<unknown> };
    await pos.confirm();
    let venta = comandos.filter((c) => c.name === 'sales.complete_sale').pop()!;
    expect(venta.payload.amount_tendered).toBeUndefined();

    const el2 = await conCobroAbierto();
    const pos2 = el2 as unknown as { tap(k: string): void; confirm(): Promise<void>; updateComplete: Promise<unknown> };
    pos2.tap('5'); await pos2.updateComplete;
    await pos2.confirm();
    venta = comandos.filter((c) => c.name === 'sales.complete_sale').pop()!;
    expect(venta.payload.amount_tendered, 'lo tecleado viaja en céntimos').toBe(500);
  });

  it('tarjeta: sin numpad ni entregado — importe exacto, pista del datáfono y CTA propio', async () => {
    const el = await conCobroAbierto();

    const botonTarjeta = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.sheet button.pm-btn')]
      .find((b) => b.textContent?.trim() === 'Tarjeta')!;
    botonTarjeta.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(el.shadowRoot!.querySelector('.sheet .numpad'), 'con tarjeta el numpad sobra').toBeFalsy();
    expect(el.shadowRoot!.querySelector('.sheet .quick'), 'y los atajos de efectivo también').toBeFalsy();
    // En su lugar: el importe exacto y la pista de qué hacer con el datáfono.
    expect(el.shadowRoot!.querySelector('.sheet .pay-exact')?.textContent, 'fila de importe exacto')
      .toContain('ui.payExact');
    expect(el.shadowRoot!.querySelector('.sheet .pay-hint')?.textContent, 'pista del datáfono')
      .toContain('ui.payCardHint');
    expect(el.shadowRoot!.querySelector('.sheet-foot ion-button.charge')?.textContent,
      'el CTA dice que se cobra con tarjeta').toContain('ui.chargeWithCard');

    await (el as unknown as { confirm(): Promise<void> }).confirm();
    const venta = comandos.find((c) => c.name === 'sales.complete_sale')!;
    expect(venta.payload.payment_method_id).toBe('pm-card');
    // sales#24 (2.ª vuelta): tarjeta = importe EXACTO → NO se manda entregado; el servidor persiste
    // su total. Mandar el `payable` de pantalla era un preview que podía quedar por debajo del total
    // del servidor (IVA excluido, cantidades a peso, descuentos) y hacer saltar `insufficient_tendered`.
    expect(venta.payload.amount_tendered, 'tarjeta = importe exacto: no se inventa entregado').toBeUndefined();
  });

  it('con split activo, el CTA y amount_tendered usan el PAYABLE, no el total', async () => {
    const el = await conCobroAbierto();
    // Dos líneas persistidas; el camarero marca solo la primera (cobro por partes, ADR-0146).
    (el as unknown as { cart: unknown[] }).cart = [
      { id: 'p1', name: 'Café solo', price: 180, qty: 1, line_id: 'l1' },
      { id: 'p2', name: 'Tostada', price: 180, qty: 1, line_id: 'l2' },
    ];
    (el as unknown as { splitSel: Set<string> }).splitSel = new Set(['l1']);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const cta = el.shadowRoot!.querySelector('.sheet-foot ion-button.charge')?.textContent ?? '';
    expect(cta, 'el CTA cobra lo seleccionado (1,80 €), no la cuenta entera (3,60 €)').toContain('1.80 €');
    expect(cta).not.toContain('3.60 €');

    // Con tarjeta (importe exacto) el fallback de entregado también es el payable, no el total.
    const botonTarjeta = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.sheet button.pm-btn')]
      .find((b) => b.textContent?.trim() === 'Tarjeta')!;
    botonTarjeta.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    await (el as unknown as { confirm(): Promise<void> }).confirm();
    const venta = comandos.find((c) => c.name === 'sales.complete_sale')!;
    expect(venta.payload.amount_tendered, 'split + tarjeta: importe exacto, sin entregado').toBeUndefined();
  });
});

// ── El carrito CERRADO no existe para el puntero ni para el lector de pantalla (sales#58) ─────
// Bajo 820 px la cuenta es un cajón que se esconde con `transform: translateX(100%)`. Estar fuera
// de pantalla NO la retira del árbol accesible: sus botones (asignar mesa, asignar cliente, cobrar,
// cuentas abiertas) seguían anunciándose y aceptando clicks, sin nada visible ocurriendo. Ése es el
// síntoma de #58 — «aparecen en el árbol accesible pero no responden al click» — y afecta igual a
// un lector de pantalla que a un test de Playwright.
//
// El contrato se fija en UN sitio: `visibility` se hereda al subárbol entero, así que ocultar el
// contenedor cubre todos sus controles a la vez (hoy y los que monten mañana los módulos por el
// slot). Un parche por botón no valdría: el problema es la CAPA, no cada control.
//
// happy-dom no evalúa media queries ni layout, así que aquí se comprueba la REGLA declarada; que el
// cajón se deslice bien se verifica en un navegador real.
describe('carrito cerrado en móvil: ni puntero ni árbol accesible (sales#58)', () => {
  /** CSS declarado por el componente, como en los demás contratos de estilo de este fichero. */
  async function cssDelPos(): Promise<string> {
    const el = await montarCarrito();
    const declaradas = (el.constructor as unknown as { styles: { cssText: string } | Array<{ cssText: string }> }).styles;
    return [declaradas].flat().map((s) => s.cssText).join('\n');
  }

  /** El bloque `@media (max-width: 820px)` que convierte la cuenta en cajón. */
  function bloqueMovil(css: string): string {
    const bloques = css.split(/@media[^{]*\(max-width:\s*820px\)\s*\{/).slice(1);
    return bloques.join('\n');
  }

  it('el cajón cerrado se oculta (visibility), no solo se desplaza fuera de pantalla', async () => {
    const movil = bloqueMovil(await cssDelPos());
    const cajonCerrado = movil.match(/\.cart\s*\{[^}]*\}/)?.[0] ?? '';
    expect(cajonCerrado, 'el cajón cerrado declara transform (se desplaza)').toMatch(/transform\s*:\s*translateX\(100%\)/);
    expect(cajonCerrado, 'y además visibility:hidden — desplazar no lo retira del árbol accesible')
      .toMatch(/visibility\s*:\s*hidden/);
  });

  it('abierto vuelve a ser visible, para que sus controles funcionen', async () => {
    const movil = bloqueMovil(await cssDelPos());
    const cajonAbierto = movil.match(/\.cart\[data-open\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(cajonAbierto, 'abierto se coloca en pantalla').toMatch(/transform\s*:\s*translateX\(0\)/);
    expect(cajonAbierto, 'abierto vuelve a ser visible').toMatch(/visibility\s*:\s*visible/);
  });

  // sales#84 — el FAB del carrito (móvil) era un botón con un icono y sin nombre: para un lector de
  // pantalla, «button». Es el control principal de la venta en 390 px.
  it('el FAB del carrito tiene nombre accesible, dice cuántas líneas lleva y expone su estado', async () => {
    const el = await montarCarrito();
    const fab = () => el.shadowRoot!.querySelector<HTMLButtonElement>('button.fab')!;
    expect(fab().getAttribute('aria-label'), 'vacío: «abrir carrito»').toBe('ui.openCart');
    expect(fab().getAttribute('aria-expanded'), 'cerrado').toBe('false');
    expect(fab().getAttribute('aria-controls'), 'apunta al cajón que abre').toBeTruthy();

    (el as unknown as { cart: unknown[] }).cart = [
      { id: 'p1', name: 'Café solo', price: 180, qty: 2 },
    ];
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    // Con líneas, el nombre incluye la cantidad — el badge visual no lo lee nadie.
    expect(fab().getAttribute('aria-label')).toBe('ui.openCartWithItems');

    fab().click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(fab().getAttribute('aria-expanded'), 'abierto').toBe('true');
    const cajon = el.shadowRoot!.getElementById(fab().getAttribute('aria-controls')!);
    expect(cajon?.classList.contains('cart'), 'aria-controls resuelve al cajón').toBe(true);
  });

  it('el ocultado espera al final del deslizamiento (no corta la animación)', async () => {
    const movil = bloqueMovil(await cssDelPos());
    const cajonCerrado = movil.match(/\.cart\s*\{[^}]*\}/)?.[0] ?? '';
    expect(cajonCerrado, 'la transición de visibility se retrasa hasta que termina el transform')
      .toMatch(/transition\s*:[^;]*visibility[^;]*\.25s/);
  });
});

// sales#20 — the POS side of the server-authoritative checkout.
//
// The server refuses to close a sale without an idempotency key and, given the same key twice,
// records ONE sale. That only saves a cashier if the key belongs to the CHECKOUT ATTEMPT: the
// retry after a dropped wifi has to carry the very same key, and the sale that was recorded has to
// be found back by that key — not by "the most recent sale", which on a second till is somebody
// else's ticket.
describe('checkout idempotency (sales#20)', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];
  /** What the till asked for, as the shared double records it. */
  const consultas = () => posSdk.reads;
  let fallaElProximoCobro: string | Error | null;
  /** Lo que el servidor responde cuando se le pregunta por la clave del intento.
   *
   *  hub#923: desde que el POS pregunta «¿esta clave ya produjo una venta?» tras un fallo de
   *  transporte, esta respuesta ES el escenario. Por defecto la venta consta (lo que necesita el
   *  camino feliz); los tests que modelan un cobro que NO llegó a entrar lo vacían, porque un
   *  servidor que dice «sí hay venta» describe un cobro CONSUMADO, no uno que haya que reintentar. */
  let ventaEnServidor: { id: string }[];

  beforeEach(() => {
    comandos = [];
    fallaElProximoCobro = null;
    ventaEnServidor = [{ id: 'sale-7' }];
    const sdk = posSdk.sdk;
    const productos = [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    posSdk.setQuery('sales.by_idempotency_key', () => ventaEnServidor);
    posSdk.setQuery('inventory.products.list', productos);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      if (name === 'sales.complete_sale' && fallaElProximoCobro) {
        const boom = fallaElProximoCobro;
        fallaElProximoCobro = null;
        throw boom instanceof Error ? boom : new Error(boom);
      }
      return {};
    };
  });

  async function posConUnaLinea() {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el as unknown as { confirm(): Promise<void>; error: string };
  }

  const ventas = () => comandos.filter((c) => c.name === 'sales.complete_sale');

  it('every checkout carries a key the payload schema accepts', async () => {
    const pos = await posConUnaLinea();
    await pos.confirm();
    expect(ventas()[0].payload.idempotency_key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  });

  it('retrying after a failure repeats the SAME key — a timeout never charges twice', async () => {
    const pos = await posConUnaLinea();
    // El cobro NO entró (el servidor lo confirma al preguntarle por la clave), así que hay
    // reintento de verdad — que es lo que este test mide.
    ventaEnServidor = [];
    fallaElProximoCobro = 'Failed to fetch';
    await pos.confirm();
    await pos.confirm();

    const [primero, reintento] = ventas();
    expect(reintento, 'the cashier pressed charge again').toBeTruthy();
    expect(reintento.payload.idempotency_key).toBe(primero.payload.idempotency_key);
  });

  it('the next sale starts a new key — two sales are two keys', async () => {
    const pos = await posConUnaLinea();
    await pos.confirm();
    await pos.confirm();

    const [primera, segunda] = ventas();
    expect(segunda.payload.idempotency_key).not.toBe(primera.payload.idempotency_key);
  });

  it('finds the recorded sale by its key, not by "the latest sale"', async () => {
    const pos = await posConUnaLinea();
    await pos.confirm();

    const sonda = consultas().find((q) => q.name === 'sales.by_idempotency_key');
    expect(sonda, 'the POS resolves its own sale').toBeTruthy();
    expect((sonda!.params ?? {}).idempotency_key).toBe(ventas()[0].payload.idempotency_key);
    expect(consultas().some((q) => q.name === 'sales.list'), 'no racy "last sale" lookup').toBe(false);
  });

  // sales#185 — the refusal travels TYPED, with its `code`, which is how the SDK delivers it
  // (`ErploraError`) and how the runtime's envelope serialises it. This double used to throw a
  // bare `Error` and the screen dug the code out of the SENTENCE; that reading was retired because
  // it stops matching in silence as soon as the sentence changes or is translated. The sentence
  // here is deliberately useless to a text matcher: if the test passes, it is because of the code.
  it('shows a domain rejection in the cashier own words', async () => {
    const pos = await posConUnaLinea();
    fallaElProximoCobro = Object.assign(
      new Error('the chosen payment method is no longer available'),
      { code: 'sales.payment_method_not_available' },
    );
    await pos.confirm();
    expect(pos.error).toBe('ui.errorPaymentMethod');
  });

  it('shows a business message for a transport failure (server down), not the raw browser phrase (sales#81)', async () => {
    // Antes «Failed to fetch» se mostraba tal cual: era MÁS informativo que un «no se pudo cobrar»
    // genérico. sales#81 cambia la valla: un cajero no sabe qué es un «Failed to fetch» (un mensaje
    // de red del navegador), así que se traduce a un aviso de negocio accionable. Lo que sigue
    // siendo cierto: un rechazo de dominio DESCONOCIDO se enseña tal cual (la frase lleva el código
    // y el detalle que el encargado necesita), abajo.
    const pos = await posConUnaLinea();
    // La venta no entró: el servidor contesta que no hay nada bajo esa clave (hub#923). Con la
    // venta SÍ registrada el mensaje correcto ya no es este —el cobro está hecho— y eso se cubre
    // en el bloque de la red de seguridad.
    ventaEnServidor = [];
    fallaElProximoCobro = 'Failed to fetch';
    await pos.confirm();
    expect(pos.error).toBe('ui.serverUnavailable');
  });

  // sales#91 — desde hub#782 el transporte del SDK ya NO deja pasar la frase del navegador: lanza un
  // error TIPADO `code = server_unavailable` con un mensaje técnico propio («request to /api/command
  // failed: …»). El detector de este módulo olfateaba el TEXTO, así que ese error tipado se le
  // colaba como «dominio desconocido» y el modal de cobro enseñaba el mensaje técnico crudo.
  it('a TYPED server_unavailable error from the SDK is transport too, whatever its message says (sales#91)', async () => {
    const pos = await posConUnaLinea();
    ventaEnServidor = [];
    const typed = Object.assign(new Error('request to /api/command failed: TypeError: Load failed'), { code: 'server_unavailable' });
    fallaElProximoCobro = typed;
    await pos.confirm();
    expect(pos.error, 'not the technical line').toBe('ui.serverUnavailable');
  });

  it('shows an unknown domain rejection verbatim — its phrase carries the code the manager needs', async () => {
    // Un rechazo que NO es ni de dominio conocido ni de transporte: su frase original lleva el
    // código y el detalle interno, y eso es lo que el encargado necesita para diagnosticar. No se
    // traduce a un mensaje genérico que lo borraría.
    // sales#185 — and here NO code arrives: it is a `throw` that does not come out of the hub's
    // envelope (a library, the browser itself). With no code there is nothing to translate and the
    // sentence is all there is, so it is shown. With a known code the code wins; with an UNKNOWN
    // code the generic message is shown, because then the sentence is the runtime's and it is not
    // meant for the counter.
    const pos = await posConUnaLinea();
    fallaElProximoCobro = 'something_unexpected: details the manager needs';
    await pos.confirm();
    expect(pos.error).toBe('something_unexpected: details the manager needs');
  });
});

// ── sales#61 · dividir la cuenta: el SEGUNDO pedido y la cuenta a la que se cuelga ────────────
// `tables` abre la segunda cuenta de sala y avisa con `erp:order-split {table_id, from_order_id,
// session_id, label}`. La cuenta nueva nace SIN pedido a propósito: quien tiene las líneas y los
// importes es `sales`, así que el TPV materializa el segundo pedido con lo que el camarero haya
// marcado y lo cuelga de ESA cuenta — no de «la mesa». Sin el `session_id` el pedido aterriza en
// la cuenta más antigua de la mesa y las dos mitades acaban cobrando la misma comanda.
describe('sales#61 — dividir la cuenta desde el plano de sala', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];
  let enlaces: Array<{ order_id?: string; session_id?: string }>;

  beforeEach(() => {
    comandos = [];
    enlaces = [];
    const sdk = posSdk.sdk;
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      if (name === 'sales.order.open') return { ok: true, new_ids: ['o1', 'l1'] };
      if (name === 'sales.order.split') return { ok: true, new_ids: ['o2'] };
      return { ok: true };
    };
  });

  /** TPV con un café ya persistido (pedido `o1`, línea `l1`) y un filler de sala que escucha. */
  async function conCuenta() {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const filler = document.createElement('div');
    filler.addEventListener('erp:order-linked', (e) => {
      enlaces.push((e as CustomEvent<{ order_id?: string; session_id?: string }>).detail);
    });
    (el as unknown as { assignFillers: Array<{ component: string; el: HTMLElement }> })
      .assignFillers.push({ component: 'erp-fake-mesa', el: filler });
    return el;
  }

  const dividir = async (el: HTMLElement, detail: Record<string, unknown>) => {
    el.dispatchEvent(new CustomEvent('erp:order-split', { detail, bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  };

  it('las líneas marcadas se van al segundo pedido y este se cuelga de la cuenta NUEVA', async () => {
    const el = await conCuenta();
    (el as unknown as { splitSel: Set<string> }).splitSel = new Set(['l1']);

    await dividir(el, { table_id: 'm2', from_order_id: 'o1', session_id: 's-2', label: 'Mesa 2' });

    const division = comandos.find((c) => c.name === 'sales.order.split');
    expect(division, 'se divide el pedido de origen').toBeTruthy();
    expect(division!.payload).toMatchObject({ order_id: 'o1', line_ids: ['l1'], label: 'Mesa 2' });

    const enlace = enlaces[enlaces.length - 1];
    expect(enlace?.order_id, 'se enlaza el pedido NUEVO').toBe('o2');
    expect(enlace?.session_id, 'y a la CUENTA que abrió la sala, no a la mesa').toBe('s-2');
  });

  it('el TPV se queda en la cuenta nueva, con lo marcado y la marca limpia', async () => {
    const el = await conCuenta();
    (el as unknown as { splitSel: Set<string> }).splitSel = new Set(['l1']);

    await dividir(el, { table_id: 'm2', from_order_id: 'o1', session_id: 's-2', label: 'Mesa 2' });

    const pos = el as unknown as { orderId?: string; splitSel: Set<string> };
    expect(pos.orderId, 'la pantalla pasa a la segunda cuenta (es la que se va a cobrar)').toBe('o2');
    expect(pos.splitSel.size, 'la selección se consume al dividir').toBe(0);
  });

  it('sin nada marcado la segunda cuenta nace en blanco (y sigue enlazada)', async () => {
    const el = await conCuenta();
    await dividir(el, { table_id: 'm2', from_order_id: 'o1', session_id: 's-3', label: 'Mesa 2' });

    expect(comandos.find((c) => c.name === 'sales.order.split')!.payload)
      .toMatchObject({ order_id: 'o1', line_ids: [] });
    expect(enlaces[enlaces.length - 1]?.session_id).toBe('s-3');
  });

  it('sin pedido en la mesa no se divide nada: la cuenta nueva espera al primer producto', async () => {
    const el = await montarCarrito();
    const filler = document.createElement('div');
    filler.addEventListener('erp:order-linked', (e) => {
      enlaces.push((e as CustomEvent<{ order_id?: string; session_id?: string }>).detail);
    });
    (el as unknown as { assignFillers: Array<{ component: string; el: HTMLElement }> })
      .assignFillers.push({ component: 'erp-fake-mesa', el: filler });

    await dividir(el, { table_id: 'm2', from_order_id: null, session_id: 's-4', label: 'Mesa 2' });
    expect(comandos.some((c) => c.name === 'sales.order.split'), 'no hay nada que repartir').toBe(false);

    // El primer producto abre el pedido — y ese pedido debe colgar de la cuenta reciÉn abierta.
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const enlace = enlaces[enlaces.length - 1];
    expect(enlace?.order_id, 'el pedido recién abierto').toBe('o1');
    expect(enlace?.session_id, 'se cuelga de la cuenta que abrió la división').toBe('s-4');
  });
});

// Dividir se pide desde el ⋮ de una mesa del plano, y el plano se abre mires la cuenta que mires:
// la mesa que se divide NO tiene por qué ser la que hay en pantalla. Lo marcado en el carrito son
// líneas de OTRA cuenta, así que no puede viajar — si se mandara, el servidor no encontraría
// ninguna línea que mover y la división se quedaría sin hacer (y con un error a la vista).
describe('sales#61 — dividir una mesa que no es la que hay en pantalla', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];

  beforeEach(() => {
    comandos = [];
    const sdk = posSdk.sdk;
    posSdk.setQuery('inventory.products.list', [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1, tax_category_key: CATEGORIA_IVA }]);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      if (name === 'sales.order.open') return { ok: true, new_ids: ['o1', 'l1'] };
      if (name === 'sales.order.split') return { ok: true, new_ids: ['o9'] };
      return { ok: true };
    };
  });

  it('la segunda cuenta de OTRA mesa nace en blanco, no con lo marcado aquí', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    (el as unknown as { splitSel: Set<string> }).splitSel = new Set(['l1']);

    el.dispatchEvent(new CustomEvent('erp:order-split', {
      detail: { table_id: 'm7', from_order_id: 'o-otra', session_id: 's-7', label: 'Mesa 7' },
      bubbles: true, composed: true,
    }));
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const division = comandos.find((c) => c.name === 'sales.order.split');
    expect(division!.payload, 'lo marcado es de otra cuenta: no viaja').toMatchObject({
      order_id: 'o-otra', line_ids: [],
    });
    expect((el as unknown as { error: string }).error, 'y no se avisa de un fallo que no existe').toBeFalsy();
  });
});

// hub#923 (saas#1460) — LA RED DE SEGURIDAD DEL COBRO.
//
// El incidente, tal cual: el hub confirmó la venta (200, fila en la BD) y murió por OOM antes de
// que el cliente pudiera leer la respuesta. La cajera vio «The string did not match the expected
// pattern.» —una cadena cruda de WebKit, en inglés, sobre una UI en español—, dedujo lo único
// razonable («no ha cobrado») y volvió a cobrar: cobro doble y documento fiscal duplicado.
//
// La venta lleva clave de idempotencia, así que la duda TIENE respuesta: se le pregunta al
// servidor si esa clave ya produjo una venta. Aquí se fijan las tres salidas.
describe('el cobro pierde la respuesta: la caja nunca deja al cajero sin saber (hub#923)', () => {
  /** Doble del SDK: el comando de cobro falla como falló en producción; la sonda decide el caso. */
  function montarConCobroRoto(fallo: unknown, sonda: (key: string) => Promise<Record<string, unknown>[]>) {
    const productos = [{ id: 'p1', name: 'Champú profesional 300ml', sku: 'CH', price: 1290, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    const sdk = posSdk.sdk;
    posSdk.setQuery('inventory.products.list', productos);
    posSdk.setQuery('sales.by_idempotency_key', (params) => sonda(String(params?.idempotency_key ?? '')));
    sdk.command = async () => {
      throw fallo;
    };
  }

  async function cobrar() {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const pos = el as unknown as {
      confirm(): Promise<void>; error: string; checkoutKey: string; docSaleId?: string; cart: unknown[];
    };
    await pos.confirm();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return { el, pos };
  }

  it('la venta SÍ entró: se cierra como cobrada y NO se enseña error', async () => {
    // El caso exacto del incidente: error de transporte, pero la venta está en la BD.
    montarConCobroRoto(new TypeError('The string did not match the expected pattern.'), async () => [{ id: 'sale-ok' }]);
    const { pos } = await cobrar();

    expect(pos.error, 'una venta cobrada no puede enseñarse como error').toBe('');
    expect(pos.docSaleId, 'se abre el documento de la venta que SÍ se cobró').toBe('sale-ok');
    expect(pos.cart, 'el carrito se limpia: esa cuenta está pagada').toEqual([]);
    expect(pos.checkoutKey, 'el intento terminó: la próxima venta estrena clave').toBe('');
  });

  it('la venta NO entró: avisa de servidor caído y CONSERVA la clave para reintentar', async () => {
    // El servidor contestó a la sonda («no hay venta»): reintentar es seguro, y con la MISMA clave
    // para que un duplicado en carrera colapse en una sola venta.
    montarConCobroRoto(new TypeError('Failed to fetch'), async () => []);
    const { pos } = await cobrar();

    expect(pos.error, 'se avisa con el mensaje de servidor caído').toBe('ui.serverUnavailable');
    expect(pos.checkoutKey, 'la clave se conserva: el reintento no cobra dos veces').not.toBe('');
    expect(pos.docSaleId, 'no hay documento que enseñar').toBeFalsy();
  });

  it('NO SE SABE (el servidor sigue caído): manda a Ventas ANTES de volver a cobrar', async () => {
    // La rama que evita el cobro doble: sin respuesta no se puede afirmar «no cobró».
    montarConCobroRoto(new TypeError('The string did not match the expected pattern.'), async () => {
      throw new TypeError('Failed to fetch');
    });
    const { el, pos } = await cobrar();

    expect(pos.error, 'el mensaje es el de la duda, no el crudo del motor').toBe('ui.checkoutUnknown');
    expect(pos.error, 'nunca la cadena cruda de WebKit').not.toContain('did not match');
    expect(pos.checkoutKey, 'la clave se conserva: si reintenta, no se duplica').not.toBe('');

    const enlace = el.shadowRoot!.querySelector<HTMLElement>('[data-testid="pos-check-sales"]');
    expect(enlace, 'se ofrece ir a Ventas a comprobarlo').toBeTruthy();
  });

  it('sales#91: el error TIPADO del SDK con outcomeUnknown y la sonda caída → el veredicto honesto, nunca «inténtalo de nuevo»', async () => {
    // Desde hub#906 el SDK entrega `code = server_unavailable` + `outcomeUnknown: true` con un mensaje
    // técnico propio (nada de «Failed to fetch» suelto). Si el detector no lo reconoce, cae en
    // «dominio desconocido» y enseña esa línea técnica — y NO consulta la sonda.
    const typed = Object.assign(new Error('request to /api/command failed: TypeError: Failed to fetch'),
      { code: 'server_unavailable', outcomeUnknown: true });
    montarConCobroRoto(typed, async () => { throw Object.assign(new Error('request to /api/query failed'), { code: 'server_unavailable' }); });
    const { el, pos } = await cobrar();
    expect(pos.error).toBe('ui.checkoutUnknown');
    expect(el.shadowRoot!.querySelector('[data-testid="pos-check-sales"]'), 'se ofrece ir a Ventas').toBeTruthy();
  });

  it('el catálogo español traduce los mensajes nuevos (ADR-0055)', () => {
    const ui = (esCatalog as { ui: Record<string, string> }).ui;
    expect(ui.checkoutUnknown, 'falta la traducción del cobro dudoso').toBeTruthy();
    expect(ui.checkoutUnknown).toMatch(/Ventas/i);
    expect(ui.checkSales, 'falta la traducción del enlace a Ventas').toBeTruthy();
  });
});

describe('venta por precio libre (fuera de catálogo)', () => {
  // El frutero vende género suelto que no está fichado: teclea el importe y elige el "departamento"
  // (categoría fiscal, ADR-0085), que lleva su IVA. La línea viaja sin producto de catálogo
  // (`id: ''` → `toItemPayload` manda `product_id: null` → no descuenta stock).

  it('el TPV pinta un disparador de "Precio libre"', async () => {
    const el = await montarCarrito();
    expect(el.shadowRoot!.querySelector('.tile.open-price'), 'falta el botón de precio libre').toBeTruthy();
  });

  it('el sheet lista un departamento por categoría fiscal ACTIVA, con su %', async () => {
    posSdk = installPosDouble({
      taxCategories: [
        { key: 'product.generic', name: 'General', is_active: 1 },
        { key: 'restaurant.food', name: 'Comida', is_active: 1 },
        { key: 'old.zero', name: 'Antiguo', is_active: 0 }, // inactivo → NO sale
      ],
      rules: [
        { id: 'r1', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, valid_from: '2020-01-01', is_active: 1 },
        { id: 'r2', tax_category_key: 'restaurant.food', rate_pct: 10, parent_id: null, valid_from: '2020-01-01', is_active: 1 },
      ],
    });
    const el = await montarCarrito();
    (el.shadowRoot!.querySelector('.tile.open-price') as HTMLElement).click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const depts = [...el.shadowRoot!.querySelectorAll('.dept-btn')];
    expect(depts, 'un botón por departamento activo (el inactivo no sale)').toHaveLength(2);
    const txt = depts.map((d) => d.textContent ?? '');
    expect(txt.some((s) => s.includes('General') && s.includes('21')), 'General 21%').toBe(true);
    expect(txt.some((s) => s.includes('Comida') && s.includes('10')), 'Comida 10%').toBe(true);
  });

  it('añadir crea una línea libre (id vacío → product_id null) con el nombre del departamento', async () => {
    // Opening the order with no id → the line falls into the local cart, which is enough here.
    posSdk = installPosDouble({
      taxCategories: [{ key: 'product.generic', name: 'General', is_active: 1 }],
      rules: [{ id: 'r1', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, valid_from: '2020-01-01', is_active: 1 }],
    });
    const el = await montarCarrito();
    const c = el as unknown as {
      openPriceOpen: boolean; openDept: string; openAmount: string;
      updateComplete: Promise<unknown>; addOpenPrice(): Promise<void>;
      cart: Array<Record<string, unknown>>;
    };
    c.openPriceOpen = true;
    c.openDept = 'product.generic';
    c.openAmount = '3.5';
    await c.updateComplete;
    await c.addOpenPrice();

    expect(c.cart, 'una línea en el carrito').toHaveLength(1);
    expect(c.cart[0].id, 'id vacío → product_id null').toBe('');
    expect(c.cart[0].name, 'la línea toma el nombre del departamento').toBe('General');
    expect(c.cart[0].price, 'importe en céntimos').toBe(350);
    expect(c.cart[0].tax_category_key).toBe('product.generic');
  });
});

// sales#12 — de la baldosa a la comanda: la categoría del producto se CONGELA en la línea al
// añadirla (viaja en `sales.order.open` / `add_line`) y es la que sale en `sales.order.fire`.
// Antes solo vivía en `prodCats` (memoria del TPV) y el disparo no la mandaba: la regla
// categoría→estación de kitchen no se aplicaba nunca.
describe('la categoría del producto viaja con la línea hasta cocina (sales#12)', () => {
  let comandos: { name: string; payload: Record<string, unknown> }[];

  beforeEach(() => {
    comandos = [];
    const sdk = posSdk.sdk;
    const productos = [{ id: 'p-cerveza', name: 'Cerveza', price: 250, is_active: 1, tax_category_key: CATEGORIA_IVA }];
    posSdk.setQuery('inventory.products.list', productos);
    posSdk.setQuery('inventory.categories.list', [{ id: 'cat-bebidas', name: 'Bebidas' }]);
    posSdk.setQuery('inventory.product_categories', [{ product_id: 'p-cerveza', category_id: 'cat-bebidas' }]);
    sdk.command = async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return { ok: true, new_ids: ['ord-1', 'line-1'] };
    };
  });

  it('al añadir el producto, la línea del pedido nace con su category_id', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    const apertura = comandos.find((c) => c.name === 'sales.order.open')!;
    expect((apertura.payload.items as Record<string, unknown>[])[0]).toMatchObject({ category_id: 'cat-bebidas' });
  });

  it('y el disparo a cocina la reenvía por línea', async () => {
    const el = await montarCarrito();
    el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!.click();
    await (el as unknown as { queue: <T>(t: () => Promise<T>) => Promise<T> }).queue(async () => undefined);
    await (el as unknown as { fireToKitchen(): Promise<void> }).fireToKitchen();
    const fuego = comandos.find((c) => c.name === 'sales.order.fire')!;
    expect(fuego, 'se disparó').toBeTruthy();
    expect((fuego.payload.items as Record<string, unknown>[])[0]).toMatchObject({ category_id: 'cat-bebidas' });
  });
});

// sales#120 — los DEPARTAMENTOS (categorías fiscales) en el idioma del hub. El sheet de precio
// libre pintaba `dept.name`, el nombre CANÓNICO del seed de taxes («Product — generic») — en un
// hub español la tecla decía «Product — generic», y esa palabra es la que se congelaba como
// nombre de la línea: el cliente se llevaba «Product — generic» impreso en el tique.
//
// taxes#38 ya publica `display_name` resuelto AL IDIOMA DE QUIEN PREGUNTA (la query lee el
// idioma del hub/usuario del CORE; ningún módulo puede importar el catálogo i18n de otro,
// ADR-0043): el TPV solo tiene que pintarlo y congelarlo. Sin `display_name` (un taxes más
// viejo) degrada al nombre crudo — peor sería una tecla vacía.
describe('los departamentos hablan el idioma del hub (sales#120)', () => {
  const CATS_ES = [
    { key: 'product.generic', name: 'Product — generic', display_name: 'Producto — general', is_active: 1 },
    { key: 'restaurant.food', name: 'Restaurant — food', display_name: 'Restauración — comida', is_active: 1 },
  ];
  const RULES_ES = [
    { id: 'r1', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, valid_from: '2020-01-01', is_active: 1 },
    { id: 'r2', tax_category_key: 'restaurant.food', rate_pct: 10, parent_id: null, valid_from: '2020-01-01', is_active: 1 },
  ];
  /** A Spanish hub: `taxes` resolves `display_name` into the asker's language (taxes#38). */
  const installEs = (cats: Record<string, unknown>[] = CATS_ES) =>
    installPosDouble({ taxCategories: cats, rules: RULES_ES });

  it('la tecla del departamento pinta display_name (el idioma del hub), no el nombre canónico', async () => {
    installEs();
    const el = await montarCarrito();
    (el.shadowRoot!.querySelector('.tile.open-price') as HTMLElement).click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const txt = [...el.shadowRoot!.querySelectorAll('.dept-btn')].map((d) => d.textContent ?? '');
    expect(txt.some((s) => s.includes('Producto — general')), 'la tecla habla el idioma del hub').toBe(true);
    expect(txt.some((s) => s.includes('Restauración — comida'))).toBe(true);
    expect(txt.join(' '), 'el nombre canónico EN ya no se pinta').not.toContain('Product — generic');
  });

  it('la línea libre congela el nombre en el idioma del hub — es el que viaja al tique impreso', async () => {
    installEs();
    const el = await montarCarrito();
    const c = el as unknown as {
      openPriceOpen: boolean; openDept: string; openAmount: string;
      updateComplete: Promise<unknown>; addOpenPrice(): Promise<void>;
      cart: Array<Record<string, unknown>>;
    };
    c.openPriceOpen = true;
    c.openDept = 'product.generic';
    c.openAmount = '3.5';
    await c.updateComplete;
    await c.addOpenPrice();

    expect(c.cart[0].name, 'el cliente se lleva «Producto — general» en el papel').toBe('Producto — general');
    expect(c.cart[0].tax_category_key, 'la clave fiscal no cambia: es la identidad').toBe('product.generic');
  });

  it('sin display_name (taxes más viejo) degrada al nombre crudo — la tecla nunca queda vacía', async () => {
    installEs([{ key: 'product.generic', name: 'Product — generic', is_active: 1 }]);
    const el = await montarCarrito();
    (el.shadowRoot!.querySelector('.tile.open-price') as HTMLElement).click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const txt = [...el.shadowRoot!.querySelectorAll('.dept-btn')].map((d) => d.textContent ?? '');
    expect(txt.some((s) => s.includes('Product — generic')), 'fallback al nombre crudo').toBe(true);
  });
});

// ── hub#1173: un parámetro que la query NO declara se ignoraba en silencio ────────────────────
//
// The grid asked `services` for its catalogue with `{ page_size: 500 }`. `page_size` is **not a
// runtime parameter** (the engine reads `limit`) and the module ALREADY knew it: its own comment in
// `ui/lib/pos-cart.ts` says so. The engine dropped it without a word, so the call did not do what it
// looked like it did — and today the runtime REJECTS it with `unknown_filter`, which would leave the
// till with no services to sell.
//
// hub#1173 swapped it for an explicit `limit: 500`, which at least told the truth. sales#186 removes
// that cap too: `/api/query` on a query with a `list` block answers ONE PAGE (`execute_query_page`),
// so any number there is a truncation waiting for a bigger business. The read now goes through
// `queryAllOptional` — the whole set plus ADR-0127's tolerance — and what this block pins is that no
// cap travels over the wire. That the rows beyond the cap REACH the grid is proved in
// `erp-pos-services.test.ts`.
describe('sales#186 — the service catalogue read sends no cap at all', () => {
  /** Listens to what the till asks for, with `services` NOT installed — the optional door answers
   *  `undefined` and the record of reads is the double's own. */
  function spyOnOptionalRead(): { name: string; params?: Record<string, unknown> }[] {
    posSdk = installPosDouble({ rules: REGLAS_IVA, absentModules: ['services'] });
    return posSdk.reads;
  }

  it('asks services.services.list without `page_size`', async () => {
    const calls = spyOnOptionalRead();

    await montarCarrito();

    const call = calls.find((c) => c.name === 'services.services.list');
    expect(call, 'the till reads the sellable catalogue of `services`').toBeTruthy();
    expect(
      Object.keys((call?.params as Record<string, unknown>) ?? {}),
      '`page_size` does not exist in the runtime: sending it was asking for something nobody applied',
    ).not.toContain('page_size');
  });

  it('does not send `limit` either: the whole set does not fit in a hand-written number', async () => {
    const calls = spyOnOptionalRead();

    await montarCarrito();

    for (const name of ['services.services.list', 'services.categories.list']) {
      const call = calls.find((c) => c.name === name);
      expect(call, `the till reads ${name}`).toBeTruthy();
      expect(
        (call?.params as Record<string, unknown>)?.limit,
        'a cap here truncates in silence again as soon as the business grows',
      ).toBeUndefined();
    }
  });
});
