// pm#93 — el selector de suplementos: se pregunta ANTES de añadir, y solo cuando hace falta.
//
// Tres cosas que este fichero fija, y las tres pueden romper el TPV entero si se hacen mal:
//
//  1. Un producto SIN grupos se añade con UN toque, como siempre. El 99 % de las pulsaciones de un
//     TPV son esto; meterles un paso sería empeorar el producto para casi todo el mundo.
//  2. Un producto CON grupos abre la hoja y NO añade nada todavía — mismo patrón que ya usa el
//     precio libre de un servicio sin importe (`needsAmount`).
//  3. Un grupo obligatorio (`min_choices >= 1`) sin resolver NO deja confirmar. Es precondición,
//     no aviso: Toast bloquea el envío a cocina por lo mismo.
//
// Y el caso que se cuela por la puerta de atrás: `addNow` tiene su PROPIA fusión
// (`cart.find(l => l.id === p.id)`), distinta de `sameCartLine`. Si no mira los suplementos, la
// hamburguesa «sin cebolla» sube la cantidad de la normal y cocina nunca se entera.
import { beforeEach, describe, expect, it } from 'vitest';

const BURGER = { id: 'p-burger', name: 'Hamburguesa', price: 500, tax_category_key: 'product.generic' };
const COFFEE = { id: 'p-coffee', name: 'Café', price: 120, tax_category_key: 'product.generic' };

/** Lo que devuelve `modifiers.for_target`: grupos con sus opciones, ya aplanados. */
const GROUPS_FOR_BURGER = [
  { group_id: 'g-point', group_name: 'Punto', group_kitchen_name: 'PUNTO', min_choices: 1, max_choices: 1,
    allow_repeat: 0, group_sort_order: 10, option_id: 'o-rare', option_name: 'Poco hecho',
    option_kitchen_name: 'POCO', price_delta: 0, tax_category_key: null, option_sort_order: 10 },
  { group_id: 'g-point', group_name: 'Punto', group_kitchen_name: 'PUNTO', min_choices: 1, max_choices: 1,
    allow_repeat: 0, group_sort_order: 10, option_id: 'o-well', option_name: 'Muy hecho',
    option_kitchen_name: 'MUY', price_delta: 0, tax_category_key: null, option_sort_order: 20 },
  { group_id: 'g-extras', group_name: 'Extras', group_kitchen_name: '', min_choices: 0, max_choices: 0,
    allow_repeat: 0, group_sort_order: 20, option_id: 'o-cheese', option_name: 'Extra de queso',
    option_kitchen_name: '+QUESO', price_delta: 100, tax_category_key: null, option_sort_order: 10 },
];

let commands: { name: string; params: Record<string, unknown> }[] = [];

function installSdk(groupsByProduct: Record<string, unknown[]> = {}) {
  commands = [];
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => {
      if (name === 'inventory.products.for_sale') return [BURGER, COFFEE];
      return [];
    },
    queryOptional: async (name: string, params?: Record<string, unknown>) => {
      if (name !== 'modifiers.for_target') return undefined;
      return groupsByProduct[String(params?.target_ref ?? '')] ?? [];
    },
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: `row-${commands.length}` }] };
    },
    currency: 'EUR',
    formatMoney: (c: number) => `${((c || 0) / 100).toFixed(2)} €`,
    formatAmount: (u: number) => `${(u || 0).toFixed(2)} €`,
    t: (_c: unknown, k: string) => k,
    loadSlot: async () => [],
    notify: () => {},
  };
}

interface Pos {
  shadowRoot: ShadowRoot;
  cart: { id: string; qty: number; modifiers?: { option_id: string }[] }[];
  updateComplete: Promise<unknown>;
  modifierSheet?: { product: { id: string }; groups: unknown[] } | undefined;
  modifierPicks: string[];
  add(p: unknown): Promise<void>;
  canConfirmModifiers(): boolean;
  confirmModifiers(): Promise<void>;
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

beforeEach(() => { document.body.innerHTML = ''; });

describe('un producto SIN suplementos se añade de un toque (el 99 % de las pulsaciones)', () => {
  it('no abre ninguna hoja y entra en el carrito', async () => {
    installSdk({}); // ningún producto tiene grupos
    const el = await mount();
    await el.add(COFFEE);
    await el.updateComplete;
    expect(el.modifierSheet, 'no debe abrirse la hoja').toBeFalsy();
    expect(el.cart).toHaveLength(1);
  });

  it('tampoco la abre si el módulo `modifiers` NO está instalado', async () => {
    // `queryOptional` devuelve undefined: el TPV sigue cobrando como siempre (ADR-0127).
    installSdk();
    (globalThis as Record<string, unknown>).erplora = {
      ...(globalThis as Record<string, { erplora: object }> & { erplora: object }).erplora as object,
      queryOptional: async () => undefined,
    };
    const el = await mount();
    await el.add(BURGER);
    await el.updateComplete;
    expect(el.modifierSheet).toBeFalsy();
    expect(el.cart).toHaveLength(1);
  });
});

describe('un producto CON grupos pregunta antes de añadir', () => {
  it('abre la hoja y no añade nada todavía', async () => {
    installSdk({ 'p-burger': GROUPS_FOR_BURGER });
    const el = await mount();
    await el.add(BURGER);
    await el.updateComplete;
    expect(el.modifierSheet, 'la hoja debe abrirse').toBeTruthy();
    expect(el.cart, 'nada entra hasta confirmar').toHaveLength(0);
  });

  it('un grupo OBLIGATORIO sin resolver no deja confirmar', async () => {
    installSdk({ 'p-burger': GROUPS_FOR_BURGER });
    const el = await mount();
    await el.add(BURGER);
    await el.updateComplete;
    expect(el.canConfirmModifiers(), '«Punto» exige elegir uno').toBe(false);
    el.modifierPicks = ['o-rare'];
    await el.updateComplete;
    expect(el.canConfirmModifiers(), 'resuelto el obligatorio, ya se puede').toBe(true);
  });

  it('al confirmar, la línea lleva las opciones EN EL ORDEN elegido', async () => {
    installSdk({ 'p-burger': GROUPS_FOR_BURGER });
    const el = await mount();
    await el.add(BURGER);
    await el.updateComplete;
    el.modifierPicks = ['o-cheese', 'o-rare']; // extras primero, a propósito
    await el.confirmModifiers();
    await el.updateComplete;
    expect(el.cart).toHaveLength(1);
    expect(el.cart[0].modifiers?.map((m) => m.option_id)).toEqual(['o-cheese', 'o-rare']);
  });
});

describe('la fusión de `addNow` también mira los suplementos', () => {
  it('una línea con suplementos NO sube la cantidad de la normal', async () => {
    installSdk({ 'p-burger': GROUPS_FOR_BURGER });
    const el = await mount();
    // Primera: sin suplementos (se fuerza saltando la hoja, como haría un producto sin grupos).
    el.cart = [{ id: 'p-burger', qty: 1 }];
    await el.add(BURGER);
    await el.updateComplete;
    el.modifierPicks = ['o-rare'];
    await el.confirmModifiers();
    await el.updateComplete;
    expect(el.cart, 'dos unidades de cobro distintas').toHaveLength(2);
    expect(el.cart[0].qty, 'la normal no se toca').toBe(1);
  });
});
