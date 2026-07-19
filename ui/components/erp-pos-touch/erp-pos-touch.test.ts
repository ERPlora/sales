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

// El WC llama al SDK en cuanto se monta. Sin esto, `connectedCallback` peta y no pinta nada.
const slotsPedidos: string[] = [];
beforeEach(() => {
  slotsPedidos.length = 0;
  // El doble imita el contrato del CLIENTE (`ErploraClient`), no el del transporte: `query()` pasa
  // por `unwrapPage()` y entrega ya el array; `queryAll()` trae TODAS las filas (el TPV necesita
  // todo su catálogo, no una página — con `page_size` se quedaba en 50 y no se podía vender más).
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async () => [],
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

  it('cada módulo monta SU botón de asignación en el header (ADR-0043 B, sin mezclar)', async () => {
    // El POS no conoce a tables/customers: pide el slot `sales.pos.assign` y monta el WC de cada
    // aportante como un botón independiente en el header (cada uno abre su propio modal). Aquí dos
    // dobles aportan sus botones (mesa y cliente).
    (globalThis as Record<string, unknown>).erplora = {
      ...((globalThis as Record<string, unknown>).erplora as object),
      loadSlot: async (slot: string) => {
        slotsPedidos.push(slot);
        return slot === 'sales.pos.assign'
          ? [{ component: 'erp-fake-mesa' }, { component: 'erp-fake-cliente' }]
          : [];
      },
    };

    const el = await montarCarrito();

    // Se pide por el canal cross-módulo (ADR-0043), con el slot único de asignación.
    expect(slotsPedidos, 'el POS debe pedir el slot `sales.pos.assign` al SDK').toContain('sales.pos.assign');

    // Los fillers se montan en el contenedor del header, DENTRO del ion-buttons de la toolbar.
    const host = el.shadowRoot!.querySelector('.cart-actions-slot');
    expect(host, 'el header expone `.cart-actions-slot` para los botones de los módulos').toBeTruthy();
    expect(host?.closest('ion-buttons'), 'el contenedor va dentro de un ion-buttons de la toolbar').toBeTruthy();
    expect(host?.querySelector('erp-fake-mesa'), 'monta el botón de mesa').toBeTruthy();
    expect(host?.querySelector('erp-fake-cliente'), 'monta el botón de cliente').toBeTruthy();
  });
});

// ── La mesa se pintaba DOS VECES (visto en el TPV real, 2026-07-18) ───────────────────────────
// Con una mesa asignada salían dos chips «Mesa 2» solapados en la cabecera del carrito: uno lo
// pintaba `sales` (`<span class="chip">`, resto de cuando el POS creía saber de mesas) y otro
// `tables` (`ion-chip` con icono y la X de soltar) desde el slot `sales.pos.assign`.
//
// El dueño de la asociación mesa↔comanda es `tables` (ADR-0141/0144), y su chip es el único que
// lleva la X: el de `sales` sobra. El del CLIENTE se queda, y no es una asimetría caprichosa —
// `erp-customers-pos-search` monta un `ok-spotlight-search` que pone el nombre solo en
// `aria-label`/`title`, así que sin este chip el cliente asignado no se vería en ninguna parte.
describe('contexto en la cabecera del carrito: cada dueño pinta lo suyo, una sola vez', () => {
  it('la MESA no la pinta el POS: es de `tables`, que ya trae su chip con la X', async () => {
    const el = await montarCarrito();

    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm2', label: 'Mesa 2' }, bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const textos = [...el.shadowRoot!.querySelectorAll('.ctx-chips .chip')].map((c) => c.textContent?.trim());
    expect(textos, 'el POS no debe repetir la etiqueta de la mesa (la pinta `tables`)').not.toContain('Mesa 2');
  });

  it('el CLIENTE sí lo pinta el POS: `ok-spotlight-search` solo lo deja en el aria-label', async () => {
    const el = await montarCarrito();

    el.dispatchEvent(new CustomEvent('erp:customer-context', {
      detail: { customer_id: 'c1', customer_name: 'Ana Ruiz', customer_tax_id: '', customer_address: '' },
      bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const cust = el.shadowRoot!.querySelector('.ctx-chips .chip.cust');
    expect(cust?.textContent?.trim(), 'el nombre del cliente asignado tiene que verse').toBe('Ana Ruiz');
  });

  it('sin nada asignado no se pinta el contenedor de chips', async () => {
    const el = await montarCarrito();
    expect(el.shadowRoot!.querySelector('.ctx-chips')).toBeFalsy();
  });

  // La mesa deja de PINTARSE, pero `sales` sigue necesitando su etiqueta: viaja OPACA en la comanda
  // que se manda a cocina (ADR-0144). Borrar el chip no puede llevarse por delante el estado.
  it('aunque no se pinte, el POS conserva la etiqueta de mesa para la comanda de cocina', async () => {
    const el = await montarCarrito();
    el.dispatchEvent(new CustomEvent('erp:order-context', {
      detail: { table_id: 'm2', label: 'Mesa 2' }, bubbles: true, composed: true,
    }));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect((el as unknown as { tableLabel: string }).tableLabel).toBe('Mesa 2');
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
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.formatMoney = (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`;
    sdk.formatAmount = (units: number) => `${(units || 0).toFixed(2)} €`;
    const productos = [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1 }];
    sdk.query = async () => [];
    sdk.queryAll = async (name: string) => (name === 'inventory.products.list' ? productos : []);
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
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    const productos = [{ id: 'p1', name: 'Champú reparador', sku: 'CR', price: 1250, is_active: 1 }];
    sdk.query = async () => [];
    sdk.queryAll = async (name: string) => (name === 'inventory.products.list' ? productos : []);
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
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    const productos = [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1 }];
    sdk.query = async () => [];
    sdk.queryAll = async (name: string) => (name === 'inventory.products.list' ? productos : []);
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
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.queryAll = async (name: string) =>
      (name === 'inventory.products.list' ? [{ id: 'p1', name: 'Café solo', sku: 'CAF', price: 180, is_active: 1 }] : []);
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
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
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
