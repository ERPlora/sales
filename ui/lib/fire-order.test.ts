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
      { product_id: 'p1', product_name: 'Croquetas', quantity: 2, unit_price: 350, notes: '' },
      { product_id: 'p2', product_name: 'Vino', quantity: 1, unit_price: 250, notes: '' },
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
