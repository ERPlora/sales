import { describe, expect, it } from 'vitest';
import { buildFirePayload } from './fire-order';
import type { CartLine } from './pos-cart';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: 'p1', name: 'Croquetas', price: 350, qty: 2, ...over,
});

describe('buildFirePayload (ADR-0141: la comanda nace del pedido)', () => {
  it('manda la etiqueta de la mesa tal cual, como texto opaco', () => {
    // `sales` no sabe qué es una mesa: lo que cocina imprime es este texto y punto. Si mañana el
    // pedido es para llevar, la etiqueta dirá otra cosa sin tocar ni sales ni kitchen.
    const p = buildFirePayload('ord-1', 'Mesa 4', [line()]);
    expect(p.order_id).toBe('ord-1');
    expect(p.label).toBe('Mesa 4');
    expect(p.channel).toBe('dine_in');
  });

  it('sin mesa el canal es para llevar', () => {
    // Un ultramarinos o la barra: no hay mesa que etiquetar y la comanda no es de sala.
    const p = buildFirePayload('ord-1', '', [line()]);
    expect(p.channel).toBe('takeaway');
    expect(p.label).toBe('');
  });

  it('traduce las líneas del carrito a lo que necesita el cocinero', () => {
    const p = buildFirePayload('ord-1', 'Mesa 4', [
      line({ id: 'p1', name: 'Croquetas', qty: 2, price: 350 }),
      line({ id: 'p2', name: 'Vino', qty: 1, price: 250 }),
    ]);
    expect(p.items).toEqual([
      // El CABLE habla punto fijo 10⁶ (ADR-0147): 2 croquetas son 2000000. La UI sigue en lógico.
      // sales#12: category_id / order_item_id viajan siempre (null si la línea no los tiene).
      { product_id: 'p1', product_name: 'Croquetas', quantity: 2_000_000, unit_price: 350, notes: '', category_id: null, order_item_id: null },
      { product_id: 'p2', product_name: 'Vino', quantity: 1_000_000, unit_price: 250, notes: '', category_id: null, order_item_id: null },
    ]);
  });

  it('el motivo de una invitación llega a cocina como nota', () => {
    // «Cortesía de la casa» tiene que verse en la comanda: el cocinero lo prepara igual, pero
    // sala necesita saber por qué sale un plato que nadie ha pedido en la cuenta.
    const p = buildFirePayload('ord-1', 'Mesa 4', [
      line({ is_gift: true, gift_reason: 'Cortesía de la casa' }),
    ]);
    expect(p.items[0].notes).toBe('Cortesía de la casa');
  });

  it('un carrito vacío no se dispara', () => {
    expect(buildFirePayload('ord-1', 'Mesa 4', [])).toBeUndefined();
  });

  it('sin pedido abierto no hay nada que disparar', () => {
    expect(buildFirePayload(undefined, 'Mesa 4', [line()])).toBeUndefined();
  });
});

// Tandas (2026-07-19): el POS dispara la RONDA EN CURSO y manda su número local para que el
// handler marque las líneas pendientes. Sin número (compat) el payload no lo lleva.
describe('ronda local en el payload del disparo', () => {
  const linea = { id: 'p1', name: 'Entrecot', price: 2500, qty: 1 };

  it('con round_no, viaja en el payload', () => {
    const p = buildFirePayload('ord-1', 'Mesa 4', [linea], 2);
    expect(p?.round_no).toBe(2);
  });

  it('sin round_no, el payload no lo inventa (compat)', () => {
    const p = buildFirePayload('ord-1', 'Mesa 4', [linea]);
    expect(p && 'round_no' in p && p.round_no !== undefined).toBe(false);
  });
});

// sales#12 — el enrutado por CATEGORÍA. `kitchen` resuelve la estación en este orden: estación
// explícita → producto→estación → categoría→estación «si el caller aporta category_id». El caller
// es este payload, y no la mandaba: la regla categoría→estación no se aplicaba nunca. La línea la
// lleva congelada (snapshot, sales#12) y aquí solo se reenvía. `order_item_id` también viaja: es
// lo que kitchen usa para repartir una anulación entre las estaciones que recibieron cada ronda.
describe('la categoría y el id de línea viajan en el disparo (sales#12)', () => {
  it('cada item lleva category_id (null si la línea no está clasificada) y order_item_id', () => {
    const p = buildFirePayload('ord-1', 'Mesa 4', [
      line({ id: 'p1', name: 'Cerveza', qty: 1, price: 250, category_id: 'cat-bebidas', line_id: 'l-1' }),
      line({ id: '', name: 'Varios', qty: 1, price: 100 }),
    ])!;
    expect(p.items[0]).toMatchObject({ category_id: 'cat-bebidas', order_item_id: 'l-1' });
    expect(p.items[1]).toMatchObject({ category_id: null, order_item_id: null });
  });
});

// pm#93 — los suplementos viajan en el disparo a cocina. Solo los ids: el nombre que se IMPRIME lo
// resuelve el handler contra `modifiers.options.all`, por el mismo motivo que el precio.
describe('suplementos en la comanda (pm#93)', () => {
  const linea = (over: Partial<CartLine> = {}): CartLine =>
    ({ id: 'p-burger', name: 'Hamburguesa', price: 500, qty: 1, line_id: 'li-1', ...over }) as CartLine;

  it('viajan con la línea, en su orden', () => {
    const p = buildFirePayload('ord-1', 'Mesa 4', [
      linea({ modifiers: [{ option_id: 'o-no-onion' }, { option_id: 'o-cheese' }] }),
    ]);
    expect(p?.items[0].modifiers).toEqual([{ option_id: 'o-no-onion' }, { option_id: 'o-cheese' }]);
  });

  it('una línea sin suplementos no gana ruido', () => {
    // Control: el 99 % de las comandas. Un array vacío en cada línea sería basura en el evento que
    // consume kitchen, y `order.fired` lo leen más módulos.
    const p = buildFirePayload('ord-1', 'Mesa 4', [linea()]);
    expect(p?.items[0].modifiers).toBeUndefined();
  });
});
