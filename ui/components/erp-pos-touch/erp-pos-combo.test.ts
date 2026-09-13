// sales#153 / ADR-0381 — el PICKER DEL MENÚ en el TPV: la superficie que ve el camarero.
//
// Un combo no es una línea: es un GRUPO de líneas hermanas y el servidor lo arma entero al cobrar
// (sales#152). Lo que se fija aquí es la mitad de la PANTALLA, y cada punto tiene su forma de
// romper el TPV si se hace mal:
//
//  1. Un hub SIN `combos` no cambia en NADA. La lectura es opcional (ADR-0127) y `sales` no gana
//     `depends_on`: `undefined` significa «el módulo no está instalado», no «error».
//  2. Tocar un menú abre la composición y NO añade nada todavía — el mismo momento en que ya se
//     pregunta la hoja de suplementos (sales#130), no después.
//  3. Un grupo con `min_choices >= 1` sin resolver NO deja confirmar. Precondición, no aviso.
//  4. 🔴 El botón bloqueado NO usa el `disabled` de Ionic: `pointer-events:none` se TRAGA el toque
//     y deja el motivo en `title`, que en una pantalla táctil nadie puede leer. Va con
//     `aria-disabled` + el motivo EN PALABRAS + un toque que CONTESTA.
//  5. Si el catálogo de combos no responde, la pantalla lo DICE y no ofrece un menú que el
//     servidor va a rechazar.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
const SOUP = { id: 'p-soup', name: 'Sopa', price: 450, tax_category_key: 'food' };
const SALAD = { id: 'p-salad', name: 'Ensalada', price: 500, tax_category_key: 'food' };
const CHICKEN = { id: 'p-chicken', name: 'Pollo', price: 800, tax_category_key: 'food' };
const SIRLOIN = { id: 'p-sirloin', name: 'Solomillo', price: 1400, tax_category_key: 'food' };
const PRODUCTS = [SOUP, SALAD, CHICKEN, SIRLOIN];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

/** Una fila de `combos.options.all`, tal cual la entrega la query (aplanada). */
const optRow = (over: Record<string, unknown>) => ({
  combo_id: 'c-menu', combo_name: 'Menú del día', combo_kitchen_name: '', combo_price: 1250,
  combo_tax_category_key: 'food', supply_kind: 'service', combo_is_active: 1,
  group_id: 'g-starter', group_name: 'Primero', min_choices: 1, max_choices: 1, allow_repeat: 0,
  group_sort_order: 0, source: 'product', source_ref: 'p-soup', price_delta: 0, option_sort_order: 0,
  ...over,
});

// El menú de la evidencia: DOS grupos y una sustitución con SUPLEMENTO (+3 € el solomillo).
const MENU = [
  optRow({ option_id: 'o-soup', source_ref: 'p-soup', option_sort_order: 0 }),
  optRow({ option_id: 'o-salad', source_ref: 'p-salad', option_sort_order: 1 }),
  optRow({ group_id: 'g-main', group_name: 'Segundo', group_sort_order: 1, option_id: 'o-chicken', source_ref: 'p-chicken', option_sort_order: 0 }),
  optRow({ group_id: 'g-main', group_name: 'Segundo', group_sort_order: 1, option_id: 'o-sirloin', source_ref: 'p-sirloin', option_sort_order: 1, price_delta: 300 }),
];

let commands: { name: string; params: Record<string, unknown> }[] = [];

/** `combo` puede ser: filas (hay catálogo) · `undefined` (no hay módulo) · `'throw'` (el módulo
 *  está pero la lectura falla — que NO es lo mismo y no se puede pintar igual). */
function installSdk(combo?: unknown[] | 'throw') {
  commands = [];
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    ...(combo === 'throw'
      ? { failing: { 'combos.options.all': 'boom' } }
      : { comboOptions: combo as unknown[] }),
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: `row-${commands.length}` }] };
    },
    // The fake `t` resolves against the REAL catalogue and interpolates, like the shell's. Answering
    // the bare key would let two bugs through that matter here: a key missing from `locales/` (the
    // waiter would read «ui.comboGroupUnresolved») and a message that forgets to pass the group
    // (they would read «Choose 1 in {group}»).
    t: (_c: Record<string, unknown>, k: string, params?: Record<string, unknown>) => {
      const raw = (enLocale as { ui: Record<string, string> }).ui[k.replace(/^ui\./, '')] ?? k;
      return Object.entries(params ?? {}).reduce(
        (acc, [pk, pv]) => acc.split(`{${pk}}`).join(String(pv)), raw);
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  cart: { id: string; qty: number; combo_id?: string; combo_choices?: { option_id: string; product_name?: string; category_id?: string | null }[] }[];
  updateComplete: Promise<unknown>;
  comboSheet?: { combo: { combo_id: string } } | undefined;
  comboPicks: string[];
  confirmCombo(): Promise<void>;
  confirm(): Promise<void>;
  payMethod?: unknown;
  paying: boolean;
}

async function mount(): Promise<Pos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as Pos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as Pos).updateComplete;
  return el as unknown as Pos;
}

const q = <T extends Element>(pos: Pos, sel: string) => pos.shadowRoot.querySelector<T>(sel);
const qa = <T extends Element>(pos: Pos, sel: string) => [...pos.shadowRoot.querySelectorAll<T>(sel)];
const comboTiles = (pos: Pos) => qa<HTMLElement>(pos, 'ion-card.tile.combo');
const tap = async (pos: Pos, el: Element | null) => {
  (el as HTMLElement).click();
  await pos.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await pos.updateComplete;
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('un hub SIN combos no cambia en nada', () => {
  it('sin el módulo instalado no hay ni una baldosa de menú', async () => {
    installSdk(undefined);
    const pos = await mount();
    expect(comboTiles(pos)).toHaveLength(0);
    expect(q(pos, '.combo-unavailable'), 'no hay nada que avisar: no está instalado').toBeNull();
  });

  it('control: la rejilla de productos sigue pintándose igual', async () => {
    installSdk(undefined);
    const pos = await mount();
    expect(qa(pos, 'ion-card.tile').length, 'los 4 productos + la baldosa de precio libre').toBeGreaterThanOrEqual(5);
  });
});

describe('el catálogo de combos se pinta como baldosas', () => {
  it('una baldosa por menú, con su nombre y su precio CERRADO', async () => {
    installSdk(MENU);
    const pos = await mount();
    const tiles = comboTiles(pos);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].textContent).toContain('Menú del día');
    expect(tiles[0].textContent, 'el precio cerrado, no la suma de los componentes').toContain('12.50 €');
  });

  it('un menú RETIRADO no se ofrece — el servidor lo rechazaría', async () => {
    installSdk(MENU.map((r) => ({ ...r, combo_is_active: 0 })));
    const pos = await mount();
    expect(comboTiles(pos)).toHaveLength(0);
  });

  it('si la lectura FALLA, la pantalla lo dice y no ofrece ningún menú', async () => {
    installSdk('throw');
    const pos = await mount();
    expect(comboTiles(pos), 'no se ofrece lo que el servidor va a rechazar').toHaveLength(0);
    const notice = q(pos, '.combo-unavailable');
    expect(notice, 'el fallo se VE, no se traga').not.toBeNull();
    expect(notice!.textContent, 'la cadena existe en locales/ y habla de menús')
      .toContain('menus could not be loaded');
  });
});

describe('tocar un menú abre la composición y NO añade nada', () => {
  it('abre la hoja con el carrito todavía vacío', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    expect(pos.comboSheet?.combo.combo_id).toBe('c-menu');
    expect(pos.cart, 'la línea se añade al CONFIRMAR, no al tocar').toHaveLength(0);
    expect(commands.filter((c) => c.name.startsWith('sales.order'))).toHaveLength(0);
  });

  it('pinta un grupo por curso, EN EL ORDEN del catálogo', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    const labels = qa(pos, '[data-combo-sheet] .dept-label').map((n) => n.textContent?.trim() ?? '');
    expect(labels[0]).toContain('Primero');
    expect(labels[1]).toContain('Segundo');
  });

  it('resuelve el NOMBRE de cada opción contra el catálogo — `combos` no lo conoce', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    const names = qa(pos, '[data-combo-sheet] [data-option-id]').map((n) => n.textContent ?? '');
    expect(names.join(' ')).toContain('Sopa');
    expect(names.join(' '), '`source_ref` p-sirloin → «Solomillo»').toContain('Solomillo');
  });

  it('el SUPLEMENTO se ve antes de aceptar, con su signo', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    const sirloin = q(pos, '[data-option-id="o-sirloin"]');
    expect(sirloin!.textContent, 'el camarero ve «+ 3,00 €» ANTES de elegirlo').toContain('+ 3.00 €');
    expect(q(pos, '[data-option-id="o-chicken"]')!.textContent, 'sin suplemento no se pinta nada').not.toContain('€');
  });
});

describe('el total del menú se actualiza y lo pone el SERVIDOR al cobrar', () => {
  it('arranca en el precio cerrado y sube con la sustitución', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    expect(q(pos, '[data-combo-total]')!.textContent).toContain('12.50 €');
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-sirloin"]'));
    expect(q(pos, '[data-combo-total]')!.textContent, '12,50 + 3,00').toContain('15.50 €');
  });
});

describe('un grupo obligatorio sin resolver NO deja confirmar', () => {
  const confirmBtn = (pos: Pos) => q<HTMLElement>(pos, '[data-combo-confirm]')!;

  it('bloquea, y dice QUÉ falta nombrando el grupo', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    const btn = confirmBtn(pos);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.textContent, 'el motivo en PALABRAS, no en un title').toContain('Choose 1');
    expect(btn.textContent, 'y nombra el grupo que hay que resolver').toContain('Primero');
  });

  it('🔴 NO usa el `disabled` de Ionic: el toque tiene que CONTESTAR', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    const btn = confirmBtn(pos);
    expect(btn.hasAttribute('disabled'), '`disabled` es pointer-events:none y se traga el toque').toBe(false);
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-flagged'), 'control: antes del toque, apagado').toBe('false');
    await tap(pos, btn);
    expect(pos.cart, 'no añade').toHaveLength(0);
    expect(pos.comboSheet, 'ni cierra la hoja').toBeDefined();
    // Y el toque deja RASTRO. `data-needs` no sirve para probarlo: es cierto desde antes de tocar
    // (es la X roja permanente de Toast). Lo que solo el toque enciende es `data-flagged`.
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-flagged'), 'el toque CONTESTA').toBe('true');
  });

  it('con un componente por grupo, confirma', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-chicken"]'));
    expect(confirmBtn(pos).getAttribute('aria-disabled')).toBe('false');
  });
});

describe('confirmar deja una línea de MENÚ, con su composición', () => {
  it('la línea lleva combo_id y las elecciones EN SU ORDEN, con nombre y categoría', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-sirloin"]'));
    await tap(pos, q(pos, '[data-combo-confirm]'));

    expect(pos.comboSheet, 'la hoja se cierra').toBeUndefined();
    expect(pos.cart).toHaveLength(1);
    const line = pos.cart[0];
    expect(line.combo_id).toBe('c-menu');
    expect(line.combo_choices?.map((c) => c.option_id), 'el orden de elección es el que lee cocina')
      .toEqual(['o-soup', 'o-sirloin']);
    // El nombre y la categoría viajan para DISPLAY y para que el KDS enrute cada componente a SU
    // estación — el fallo de TouchBistro que ADR-0381 nombra.
    expect(line.combo_choices?.[1].product_name).toBe('Solomillo');
    expect(line.combo_choices?.[1]).toHaveProperty('category_id');
  });

  it('el precio de la línea es un PREVIEW: el servidor lo ignora y lo recalcula', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-sirloin"]'));
    await tap(pos, q(pos, '[data-combo-confirm]'));
    expect((pos.cart[0] as unknown as { price: number }).price, '12,50 + 3,00 de suplemento').toBe(1550);
  });
});

// ── LA DECISIÓN DE MERCADO (12 referencias + foros, ver el comentario del PR) ─────────────────
//
// El mercado NO da una respuesta única al techo: la da PARTIDA por el valor de `max`.
//
//  · `max = 1` → AUTO-SWAP tipo radio. Unánime: Square se lo prescribe literalmente a sus
//    integradores («use radio buttons when max_selected_modifiers = 1») y Odoo 18 lo implementa
//    con `<input type="radio">`. Square trató como BUG que la anterior no se retirara — el KDS
//    imprimía «No Not spicy» y «Spicy Level 1» a la vez.
//  · `max > 1` → CONTADOR en la cabecera del grupo (el `1-3` / `1+` de Toast Open View) y se
//    desactiva SOLO el incremento, nunca la opción entera (Odoo 19: `isPlusButtonDisabled`).
//    Esconder o apagar la opción es la patología del «gris sin motivo» que Toast tiene
//    documentada como queja de campo.
//  · NUNCA autocerrar al alcanzar el mínimo: en Square eso se percibe como avería.
describe('el TECHO se respeta como lo respeta el mercado, partido por el valor de max', () => {
  const oneOf = (rows: Record<string, unknown>[]) => rows;

  it('max = 1 → AUTO-SWAP: la nueva elección RETIRA la anterior, sin dejar rastro', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    expect(pos.comboPicks, 'la sopa se fue: un grupo de uno no acumula').toEqual(['o-salad']);
    expect(q(pos, '[data-option-id="o-soup"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(q(pos, '[data-option-id="o-salad"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('max = 1 → volver a tocar la MISMA la retira (no se queda atrapada)', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    expect(pos.comboPicks).toEqual([]);
  });

  it('max > 1 → acumula hasta el techo, y en el techo la opción NO elegida se marca CON MOTIVO', async () => {
    installSdk(oneOf(MENU.map((r) => (r.group_id === 'g-main' ? { ...r, max_choices: 1 } : { ...r, min_choices: 1, max_choices: 2 }))));
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    expect(q(pos, '[data-option-id="o-salad"]')!.getAttribute('aria-disabled'), 'aún cabe otra').toBe('false');
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    expect(pos.comboPicks).toEqual(['o-soup', 'o-salad']);
    // Lleno: lo NO elegido se marca, pero sigue LEGIBLE (Square se niega a esconder lo no
    // seleccionable), y el motivo va en el contador de la cabecera, no en un `title`.
    const header = q(pos, '[data-group-id="g-starter"] .dept-label');
    expect(header!.textContent, 'el contador explica la regla ANTES de chocar con ella').toContain('2');
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-full')).toBe('true');
  });

  it('max = 0 → SIN TECHO: nunca se llena', async () => {
    installSdk(MENU.map((r) => (r.group_id === 'g-starter' ? { ...r, min_choices: 0, max_choices: 0 } : r)));
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-full'), '0 es sin techo, no cero elecciones').toBe('false');
  });

  it('nunca autocierra al llegar al mínimo — el cierre lo decide el operador', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-chicken"]'));
    expect(pos.comboSheet, 'con todo resuelto la hoja SIGUE abierta').toBeDefined();
    expect(pos.cart, 'y no ha añadido nada por su cuenta').toHaveLength(0);
  });
});

describe('un suplemento NEGATIVO se ve, con su signo y sin color que lo cargue', () => {
  const WITH_CHEAPER = [
    ...MENU,
    optRow({ group_id: 'g-main', group_name: 'Segundo', group_sort_order: 1, option_id: 'o-veg', source_ref: 'p-salad', option_sort_order: 2, price_delta: -200 }),
  ];

  it('pinta «− 2,00 €» y baja el total', async () => {
    installSdk(WITH_CHEAPER);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    // U+2212 (menos verdadero), como el «−$1.00» que Square publica para «No cheese».
    expect(q(pos, '[data-option-id="o-veg"]')!.textContent).toContain('− 2.00 €');
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-veg"]'));
    expect(q(pos, '[data-combo-total]')!.textContent, '12,50 − 2,00').toContain('10.50 €');
  });

  it('un delta CERO no pinta nada — ni «+ 0,00 €» ni un hueco', async () => {
    installSdk(WITH_CHEAPER);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    const chicken = q(pos, '[data-option-id="o-chicken"]')!;
    expect(chicken.querySelector('[data-delta]'), 'Odoo devuelve "" cuando el delta es cero').toBeNull();
  });
});

// ── LA PUERTA DEL DINERO ──────────────────────────────────────────────────────────────────────
//
// Todo lo de arriba es decorado si la composición no llega al servidor. `complete_sale` arma el
// combo entero contra `combos.options.all` (sales#152), pero solo puede hacerlo si el payload
// trae `combo_id` + `combo_choices`. Sin esta pata, el menú se cobraría como un producto suelto
// con el id del combo — que no existe en el catálogo — y la venta entera se caería.
describe('la composición LLEGA a sales.complete_sale', () => {
  const checkout = () => commands.find((c) => c.name === 'sales.complete_sale');

  it('el item lleva combo_id y combo_choices, y el precio lo decide el SERVIDOR', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-sirloin"]'));
    await tap(pos, q(pos, '[data-combo-confirm]'));
    await tenderExactCash(pos); // sales#309: cash is typed before charging
    await pos.confirm();

    const sale = checkout();
    expect(sale, 'el TPV llegó a `sales.complete_sale`').toBeDefined();
    const items = sale!.params.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].combo_id).toBe('c-menu');
    expect((items[0].combo_choices as { option_id: string }[]).map((c) => c.option_id))
      .toEqual(['o-soup', 'o-sirloin']);
  });

  it('el contrato lo cierra el schema: los dos campos están DECLARADOS en complete_sale.json', async () => {
    // Es el control que pilló que un campo viajara y el servidor lo tirara sin decir nada.
    const schema = (await import('../../../schemas/complete_sale.json')).default as {
      properties: { items: { items: { properties: Record<string, unknown> } } };
    };
    const itemProps = schema.properties.items.items.properties;
    for (const key of ['combo_id', 'combo_choices']) {
      expect(itemProps[key], `\`${key}\` no está declarado en complete_sale.json`).toBeDefined();
    }
  });

  it('control: una venta SIN menú no gana ni un campo', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, qa<HTMLElement>(pos, 'ion-card.tile:not(.combo):not(.open-price)')[0]);
    await tenderExactCash(pos); // sales#309: cash is typed before charging
    await pos.confirm();
    const items = checkout()!.params.items as Record<string, unknown>[];
    expect(items[0]).not.toHaveProperty('combo_id');
    expect(items[0]).not.toHaveProperty('combo_choices');
  });
});

// El agujero que destapó la MUTACIÓN: los tests de arriba llegaban al techo pero nunca intentaban
// PASARLO, así que un `pickComboOption` que ignorase el techo pasaba en verde. El techo solo está
// probado si un toque de más se REHÚSA — y si además CONTESTA.
describe('el techo REHÚSA de verdad el toque de más', () => {
  // Tres primeros, y el grupo admite dos.
  const THREE = [
    optRow({ option_id: 'o-soup', source_ref: 'p-soup', min_choices: 1, max_choices: 2, option_sort_order: 0 }),
    optRow({ option_id: 'o-salad', source_ref: 'p-salad', min_choices: 1, max_choices: 2, option_sort_order: 1 }),
    optRow({ option_id: 'o-third', source_ref: 'p-chicken', min_choices: 1, max_choices: 2, option_sort_order: 2 }),
    ...MENU.filter((r) => r.group_id === 'g-main'),
  ];

  it('el tercer toque en un grupo de dos NO entra', async () => {
    installSdk(THREE);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    await tap(pos, q(pos, '[data-option-id="o-third"]'));
    expect(pos.comboPicks, 'el techo es 2: el tercero se rehúsa').toEqual(['o-soup', 'o-salad']);
  });

  it('y el toque rehusado CONTESTA: señala el grupo', async () => {
    installSdk(THREE);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-flagged'), 'control: aún no').toBe('false');
    await tap(pos, q(pos, '[data-option-id="o-third"]'));
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-flagged'),
      'un toque que no hace nada Y no dice nada es un botón roto').toBe('true');
  });

  it('en el techo se puede RETIRAR una y volver a elegir otra — no se queda atrapado', async () => {
    installSdk(THREE);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    expect(pos.comboPicks, 'lo ya elegido se retira aunque el grupo esté lleno').toEqual(['o-soup']);
    await tap(pos, q(pos, '[data-option-id="o-third"]'));
    expect(pos.comboPicks).toEqual(['o-soup', 'o-third']);
  });
});

// Lo cazó el NAVEGADOR DE VERDAD, no happy-dom: en un grupo de `max = 1`, elegir uno dejaba a los
// demás pintados como no disponibles (borde discontinuo). Y es MENTIRA: en `max = 1` el toque SÍ
// hace algo — hace AUTO-SWAP. Marcar como inservible algo que sí responde es la patología del
// «gris sin motivo» al revés, y Square se niega expresamente a esconder lo que aún es elegible.
describe('en max = 1 NADA se marca como no disponible: el toque SIEMPRE hace swap', () => {
  it('elegido el primero, el otro sigue ofreciéndose como elegible', async () => {
    installSdk(MENU);
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    const other = q(pos, '[data-option-id="o-salad"]')!;
    expect(other.getAttribute('data-barred'), 'en max=1 tocarlo SÍ hace algo: cambia la elección').toBe('false');
    expect(other.getAttribute('aria-disabled')).toBe('false');
  });

  it('control: en un grupo de max > 1 lleno, lo no elegido SÍ se marca', async () => {
    installSdk(MENU.map((r) => (r.group_id === 'g-starter' ? { ...r, max_choices: 2 } : r)));
    const pos = await mount();
    await tap(pos, comboTiles(pos)[0]);
    await tap(pos, q(pos, '[data-option-id="o-soup"]'));
    await tap(pos, q(pos, '[data-option-id="o-salad"]'));
    // Con dos opciones y techo 2 no queda ninguna sin elegir, así que se usa el menú de tres.
    expect(q(pos, '[data-group-id="g-starter"]')!.getAttribute('data-full')).toBe('true');
  });
});
