import { describe, it, expect } from 'vitest';
import { mergeCartLines, loadActiveCart, persistActiveCart, type CartLine, type ErploraClientLike } from './pos-cart';

// Cliente de prueba que registra las llamadas a query/command (lo único que nos importa aquí:
// que la comanda se pida/guarde ATADA a la mesa — `table_id`).
function recordingClient(cartData?: string) {
  const calls: { kind: 'query' | 'command'; name: string; params?: Record<string, unknown> }[] = [];
  const client = {
    query: async (name: string, params?: Record<string, unknown>) => {
      calls.push({ kind: 'query', name, params });
      return { rows: cartData != null ? [{ cart_data: cartData }] : [] };
    },
    command: async (name: string, params?: Record<string, unknown>) => {
      calls.push({ kind: 'command', name, params });
      return {};
    },
  } as unknown as ErploraClientLike;
  return { client, calls };
}

// mergeCartLines — fusiona dos comandas al FUSIONAR mesas (punto 3). Decisión de Ioan:
// "sumar idénticas" — los productos iguales suman cantidad; lo que difiere se mantiene separado.
// `base` = comanda de la mesa DESTINO (la que sobrevive); `incoming` = comanda de la mesa origen.

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: 'p1', name: 'Cerveza', price: 250, qty: 1, ...over,
});

describe('mergeCartLines', () => {
  it('suma la cantidad de productos idénticos', () => {
    const out = mergeCartLines([line({ qty: 2 })], [line({ qty: 1 })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'p1', price: 250, qty: 3 });
  });

  it('mantiene separados productos distintos', () => {
    const out = mergeCartLines([line({ id: 'p1' })], [line({ id: 'p2', name: 'Vino' })]);
    expect(out).toHaveLength(2);
    expect(out.map((l) => l.id).sort()).toEqual(['p1', 'p2']);
  });

  it('NO fusiona una invitación con una línea normal del mismo producto', () => {
    const out = mergeCartLines([line({ qty: 1 })], [line({ qty: 1, is_gift: true, gift_reason: 'cortesía' })]);
    expect(out).toHaveLength(2);
  });

  it('NO fusiona el mismo producto a distinto precio', () => {
    const out = mergeCartLines([line({ price: 250, qty: 1 })], [line({ price: 200, qty: 1 })]);
    expect(out).toHaveLength(2);
  });

  it('con base vacía devuelve la comanda entrante; con entrante vacía, la base', () => {
    expect(mergeCartLines([], [line()])).toHaveLength(1);
    expect(mergeCartLines([line()], [])).toHaveLength(1);
  });

  it('no muta los arrays ni las líneas de entrada', () => {
    const base = [line({ qty: 2 })];
    const incoming = [line({ qty: 1 })];
    mergeCartLines(base, incoming);
    expect(base[0].qty).toBe(2);
    expect(incoming[0].qty).toBe(1);
    expect(base).toHaveLength(1);
  });
});

describe('comanda atada a la mesa (table_id)', () => {
  it('loadActiveCart pide la comanda de ESA mesa', async () => {
    const { client, calls } = recordingClient(JSON.stringify({ lines: [line()] }));
    const cart = await loadActiveCart(client, 'mesa-7');
    expect(cart).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'query', name: 'sales.cart.get', params: { table_id: 'mesa-7' } });
  });

  it('sin mesa, loadActiveCart pide el carrito suelto (table_id vacío)', async () => {
    const { client, calls } = recordingClient();
    await loadActiveCart(client);
    expect(calls[0].params).toMatchObject({ table_id: '' });
  });

  it('persistActiveCart guarda la comanda ATADA a la mesa', async () => {
    const { client, calls } = recordingClient();
    await persistActiveCart(client, [line()], 'mesa-7');
    expect(calls[0]).toMatchObject({ kind: 'command', name: 'sales.cart.save', params: { table_id: 'mesa-7' } });
  });

  it('persistActiveCart con carrito vacío LIMPIA la comanda de esa mesa', async () => {
    const { client, calls } = recordingClient();
    await persistActiveCart(client, [], 'mesa-7');
    expect(calls[0]).toMatchObject({ kind: 'command', name: 'sales.cart.clear', params: { table_id: 'mesa-7' } });
  });
});

// ── ADR-0141: el carrito respaldado por un PEDIDO real (sales_order) ─────────────────────────
// El camino viejo guardaba un blob JSON con debounce de 400 ms → un corte de luz perdía el último
// artículo. Ahora cada interacción es una escritura transaccional inmediata de una FILA real.

import {
  openOrderWithLines, addOrderLine, updateOrderLineQty, removeOrderLine, loadOrderLines, findOpenOrder,
} from './pos-cart';

/** Cliente que devuelve `new_ids` en los commands (el runtime es la autoridad de ids) y filas en queries. */
function orderClient(newIds: string[] = [], queryRows: Record<string, unknown>[] = []) {
  const calls: { kind: 'query' | 'command'; name: string; params?: Record<string, unknown> }[] = [];
  const client = {
    query: async (name: string, params?: Record<string, unknown>) => {
      calls.push({ kind: 'query', name, params });
      return { rows: queryRows };
    },
    command: async (name: string, params?: Record<string, unknown>) => {
      calls.push({ kind: 'command', name, params });
      return { ok: true, new_ids: newIds };
    },
  } as unknown as ErploraClientLike;
  return { client, calls };
}

describe('carrito respaldado por pedido (ADR-0141)', () => {
  it('abre un pedido y devuelve el id que generó el runtime (new_ids[0])', async () => {
    const { client, calls } = orderClient(['ord-1']);
    const id = await openOrderWithLines(client, [line({ qty: 2 })]);
    expect(id).toBe('ord-1');
    const cmd = calls.find((c) => c.name === 'sales.order.open');
    expect(cmd).toBeTruthy();
    expect((cmd!.params!.items as unknown[])).toHaveLength(1);
  });

  it('añade una línea INMEDIATAMENTE y devuelve su line_id (sin debounce, sin blob)', async () => {
    const { client, calls } = orderClient(['line-9']);
    const lineId = await addOrderLine(client, 'ord-1', line({ qty: 3 }));
    expect(lineId).toBe('line-9');
    expect(calls.find((c) => c.name === 'sales.order.add_line')!.params).toMatchObject({
      order_id: 'ord-1', quantity: 3, unit_price: 250, line_total: 750,
    });
  });

  it('actualiza la cantidad por line_id recalculando el total provisional', async () => {
    const { client, calls } = orderClient();
    await updateOrderLineQty(client, 'ord-1', 'line-9', 4, 250);
    expect(calls.find((c) => c.name === 'sales.order.update_line')!.params).toMatchObject({
      order_id: 'ord-1', line_id: 'line-9', quantity: 4, line_total: 1000,
    });
  });

  it('elimina una línea por line_id', async () => {
    const { client, calls } = orderClient();
    await removeOrderLine(client, 'ord-1', 'line-9');
    expect(calls.find((c) => c.name === 'sales.order.remove_line')!.params).toMatchObject({
      order_id: 'ord-1', line_id: 'line-9',
    });
  });

  it('carga las líneas del pedido conservando el line_id (para poder mutarlas)', async () => {
    const { client } = orderClient([], [
      { id: 'line-1', product_id: 'p1', product_name: 'Cerveza', quantity: 2, unit_price: 250, line_total: 500 },
    ]);
    const lines = await loadOrderLines(client, 'ord-1');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ line_id: 'line-1', id: 'p1', name: 'Cerveza', qty: 2, price: 250 });
  });

  it('encuentra el pedido ABIERTO para reanudarlo tras recargar', async () => {
    const { client } = orderClient([], [
      { id: 'ord-viejo', status: 'completed' },
      { id: 'ord-abierto', status: 'open' },
    ]);
    expect(await findOpenOrder(client)).toBe('ord-abierto');
  });
});
