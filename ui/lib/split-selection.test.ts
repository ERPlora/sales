import { describe, expect, it } from 'vitest';
import { splitPayload, splitTotal } from './split-selection';
import type { CartLine } from './pos-cart';

const l = (id: string, price: number, qty = 1, line_id = 'L-' + id): CartLine =>
  ({ id, name: 'x', price, qty, line_id });

describe('cobrar solo unas líneas (ADR-0146: cada uno paga lo suyo)', () => {
  const carrito = [l('a', 1200), l('b', 1500), l('c', 250, 2)];

  it('sin selección se cobra TODO y el pedido se cierra', () => {
    const p = splitPayload(carrito, new Set());
    expect(p.keep_order_open).toBe(false);
    expect(p.line_ids).toBeUndefined();
    expect(splitTotal(carrito, new Set())).toBe(1200 + 1500 + 500);
  });

  it('con una parte seleccionada se cobra ESA y el pedido sigue abierto', () => {
    const sel = new Set(['L-a']);
    expect(splitTotal(carrito, sel)).toBe(1200);
    const p = splitPayload(carrito, sel);
    expect(p.keep_order_open).toBe(true, 'quedan líneas por cobrar');
    expect(p.line_ids).toEqual(['L-a']);
    expect(p.items.map((i) => i.product_name)).toEqual(['x']);
  });

  it('seleccionarlo todo equivale a cobrar la cuenta entera: el pedido se cierra', () => {
    // Si no, el pedido quedaría abierto y vacío, esperando a nadie.
    const sel = new Set(['L-a', 'L-b', 'L-c']);
    const p = splitPayload(carrito, sel);
    expect(p.keep_order_open).toBe(false);
  });

  it('una línea invitada no suma, pero se cobra con las demás', () => {
    const conRegalo = [l('a', 1200), { ...l('b', 1500), is_gift: true }];
    expect(splitTotal(conRegalo, new Set(['L-a', 'L-b']))).toBe(1200);
  });
});
