import { describe, it, expect } from 'vitest';
import { mergeCartLines, listOpenChecks, persistLineQty, type CartLine, type ErploraClientLike } from './pos-cart';

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

// El carrito-blob por mesa (ADR-0139) se retiró: la comanda ES el pedido, con sus líneas como filas
// reales, y aparcar pertenece a `tables` (ADR-0146). Sus tests se van con él.

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
      order_id: 'ord-1', quantity: 3_000_000, unit_price: 250, line_total: 750, // cable en 10⁶ (ADR-0147); el dinero NO se reescala
    });
  });

  it('actualiza la cantidad por line_id recalculando el total provisional', async () => {
    const { client, calls } = orderClient();
    await updateOrderLineQty(client, 'ord-1', 'line-9', 4, 250);
    expect(calls.find((c) => c.name === 'sales.order.update_line')!.params).toMatchObject({
      order_id: 'ord-1', line_id: 'line-9', quantity: 4_000_000, line_total: 1000,
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
      { id: 'line-1', product_id: 'p1', product_name: 'Cerveza', quantity: 2_000_000, unit_price: 250, line_total: 500 },
    ]);
    const lines = await loadOrderLines(client, 'ord-1');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ line_id: 'line-1', id: 'p1', name: 'Cerveza', qty: 2, price: 250 });
  });

  it('sales#12: la categoría del producto se persiste con la línea y vuelve al retomar la cuenta', async () => {
    const { client, calls } = orderClient([], [
      { id: 'line-1', product_id: 'p1', product_name: 'Cerveza', quantity: 1_000_000, unit_price: 250, line_total: 250, category_id: 'cat-bebidas' },
      { id: 'line-2', product_id: null, product_name: 'Varios', quantity: 1_000_000, unit_price: 100, line_total: 100, category_id: null },
    ]);
    // Al añadir: viaja en el payload de la línea (abrir el pedido y añadir a uno abierto).
    await openOrderWithLines(client, [{ id: 'p1', name: 'Cerveza', price: 250, qty: 1, category_id: 'cat-bebidas' }]);
    expect((calls.find((c) => c.name === 'sales.order.open')!.params.items as Record<string, unknown>[])[0])
      .toMatchObject({ category_id: 'cat-bebidas' });
    await addOrderLine(client, 'ord-1', { id: 'p1', name: 'Cerveza', price: 250, qty: 1, category_id: 'cat-bebidas' });
    expect(calls.find((c) => c.name === 'sales.order.add_line')!.params).toMatchObject({ category_id: 'cat-bebidas' });
    // Al retomar: vuelve con la línea (y una línea sin clasificar vuelve sin ella, no con '').
    const lines = await loadOrderLines(client, 'ord-1');
    expect(lines[0].category_id).toBe('cat-bebidas');
    expect(lines[1].category_id).toBeUndefined();
  });

  it('encuentra el pedido ABIERTO para reanudarlo tras recargar', async () => {
    const { client } = orderClient([], [
      { id: 'ord-viejo', status: 'completed' },
      { id: 'ord-abierto', status: 'open' },
    ]);
    expect(await findOpenOrder(client)).toBe('ord-abierto');
  });
});

// ── ADR-0141: fusionar/transferir mesas con el modelo de PEDIDO ──────────────────────────────
// Transferir = la mesa cambia, el pedido NO se toca (los productos se conservan solos).
// Fusionar   = las líneas del pedido origen se suman al destino y el origen se anula.
//
// El CÓMO cambia en sales#61: el contrato que había aquí (leer las líneas del origen y re-añadirlas
// una a una al destino con `sales.order.add_line`, y luego `sales.order.void`) describía un bucle
// de CLIENTE, y eso es justo lo que no puede ser. Se cae a la mitad → la cuenta queda partida en
// dos; llega el mismo clic dos veces → líneas duplicadas; y re-añadir una línea la crea NUEVA, sin
// `fired_at`, así que lo que ya estaba en fuego volvía a cocina. El QUÉ (todas las líneas acaban en
// el destino, el origen queda anulado) no cambia: se comprueba abajo, y sobre todo en
// `tests/split_merge.postgres.test.py`, que es donde vive de verdad desde ahora.
import { mergeOrders } from './pos-cart';

describe('persistLineQty — la pantalla no puede mentir (ADR-0144)', () => {
  // Encontrado en el navegador: 5 toques rápidos a la tortilla → 37,50 € en pantalla, 1 tortilla en
  // la BD. El POS solo persistía si ya conocía el `line_id`; si no, subía la cantidad EN PANTALLA y
  // se callaba. La comanda es la fuente de verdad: si no se puede escribir, hay que recuperar el id
  // (releyendo el pedido) y escribir, o fallar a la vista — nunca fingir.
  const clientSpy = (lines: Array<Record<string, unknown>>) => {
    const calls: Array<{ name: string; payload: unknown }> = [];
    return {
      calls,
      client: {
        query: async () => lines,
        queryOptional: async () => undefined,
        queryAll: async () => lines,
        command: async (name: string, payload?: Record<string, unknown>) => {
          calls.push({ name, payload });
          return { ok: true, new_ids: ['nueva-1'] };
        },
        currency: 'EUR',
      } as unknown as ErploraClientLike,
    };
  };

  it('con line_id conocido, actualiza esa fila', async () => {
    const { client, calls } = clientSpy([]);
    const ok = await persistLineQty(client, 'ord-1', { id: 'p1', name: 'Tortilla', price: 750, qty: 5, line_id: 'l-1' }, 5);
    expect(ok).toBe(true);
    expect(calls[0].name).toBe('sales.order.update_line');
    expect((calls[0].payload as Record<string, unknown>).line_id).toBe('l-1');
  });

  it('sin line_id lo RECUPERA del pedido y persiste igual', async () => {
    // Es el caso real: la fila existe en la BD (la creó `add_line`), pero el POS perdió su id.
    const { client, calls } = clientSpy([
      { id: 'l-9', product_id: 'p1', product_name: 'Tortilla', quantity: 1, unit_price: 750, line_total: 750 },
    ]);
    const ok = await persistLineQty(client, 'ord-1', { id: 'p1', name: 'Tortilla', price: 750, qty: 5 }, 5);
    expect(ok).toBe(true);
    expect(calls[0].name).toBe('sales.order.update_line');
    expect((calls[0].payload as Record<string, unknown>).line_id).toBe('l-9');
  });

  it('si no hay forma de identificar la fila, AVISA en vez de fingir', async () => {
    const { client, calls } = clientSpy([]);
    const ok = await persistLineQty(client, 'ord-1', { id: 'p1', name: 'Tortilla', price: 750, qty: 5 }, 5);
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('cuentas abiertas: un aparcado es un pedido abierto (ADR-0146)', () => {
  // Había TRES formas de decir «cuenta sin cobrar»: `sales_order` (la de la mesa),
  // `sales_parked_ticket` (la aparcada) y `sales_active_cart` (el blob del carrito). Son lo mismo.
  // Ahora la lista de aparcados es la de CUENTAS ABIERTAS: salen todas —barra y mesa—, y recuperar
  // una es cambiar de cuenta, igual que tocar otra mesa. Antes estaba bloqueado si tenías algo
  // marcado, que es justo lo que chirriaba en sala.
  const cliente = (pedidos: Array<Record<string, unknown>>) => ({
    query: async (name: string) => (name === 'sales.orders.list' ? pedidos : []),
    queryAll: async (name: string) => (name === 'sales.orders.list' ? pedidos : []),
    queryOptional: async () => undefined,
    command: async () => ({ ok: true }),
    currency: 'EUR',
  } as unknown as ErploraClientLike);

  it('lista solo las cuentas ABIERTAS, la más reciente primero', async () => {
    const abiertas = await listOpenChecks(cliente([
      { id: 'o1', status: 'open', provisional_total: 1200, created_at: '2026-07-19T20:00:00+00:00' },
      { id: 'o2', status: 'completed', provisional_total: 500, created_at: '2026-07-19T21:00:00+00:00' },
      { id: 'o3', status: 'open', provisional_total: 300, created_at: '2026-07-19T21:30:00+00:00' },
    ]));
    expect(abiertas.map((o) => o.id)).toEqual(['o3', 'o1']);
    expect(abiertas[0].total).toBe(300);
  });

  it('la cuenta que tienes delante NO sale en la lista', async () => {
    // Salir en su propia lista invita a «recuperar» lo que ya estás viendo.
    const abiertas = await listOpenChecks(cliente([
      { id: 'o1', status: 'open', provisional_total: 1200, created_at: '2026-07-19T20:00:00+00:00' },
      { id: 'o3', status: 'open', provisional_total: 300, created_at: '2026-07-19T21:30:00+00:00' },
    ]), 'o3');
    expect(abiertas.map((o) => o.id)).toEqual(['o1']);
  });

  it('sin cuentas abiertas devuelve vacío, no revienta', async () => {
    expect(await listOpenChecks(cliente([]))).toEqual([]);
  });
});

// ── sales#61 · split and merge a check, in ONE server-side command ───────────────────────────
// `tables` already splits and joins the checks of the FLOOR (tables#12), but it does not own the
// lines or the money, so the other half is here. And it cannot be a client-side loop: moving N
// lines with N round-trips is not atomic (a dropped connection halfway duplicates or loses a
// course) and it is not replayable (the same click landing twice doubles the check).
import { splitOrder } from './pos-cart';

describe('sales#61 — dividir y juntar cuentas', () => {
  function spyClient(lines: Record<string, unknown>[] = [], newId = 'ord-nuevo') {
    const calls: { name: string; params?: Record<string, unknown> }[] = [];
    const client = {
      query: async (name: string, params?: Record<string, unknown>) => {
        calls.push({ name, params });
        return { rows: name === 'sales.order.lines' ? lines : [] };
      },
      command: async (name: string, params?: Record<string, unknown>) => {
        calls.push({ name, params });
        return { ok: true, new_ids: [newId] };
      },
    } as unknown as ErploraClientLike;
    return { client, calls };
  }

  it('fusionar es UN comando atómico del servidor, no un bucle de líneas', async () => {
    const { client, calls } = spyClient([
      { id: 'l1', product_name: 'Cerveza', quantity: 2_000_000, unit_price: 250, line_total: 500 },
      { id: 'l2', product_name: 'Tapa', quantity: 1_000_000, unit_price: 350, line_total: 350 },
    ]);
    await mergeOrders(client, 'ord-origen', 'ord-destino');

    expect(calls.map((c) => c.name), 'una sola escritura: la transacción la cierra el servidor')
      .toEqual(['sales.order.merge']);
    expect(calls[0].params).toMatchObject({ from_order_id: 'ord-origen', to_order_id: 'ord-destino' });
    // Las líneas se MUEVEN (filas), no se re-añaden: re-añadirlas les borra `fired_at` y la comanda
    // ya enviada volvería a cocina.
    expect(calls.some((c) => c.name === 'sales.order.add_line'), 'nada se re-añade').toBe(false);
    expect(calls.some((c) => c.name === 'sales.order.void'), 'anular el origen es parte del comando').toBe(false);
  });

  it('no fusiona una cuenta consigo misma', async () => {
    const { client, calls } = spyClient();
    await mergeOrders(client, 'ord-1', 'ord-1');
    expect(calls).toHaveLength(0);
  });

  it('dividir crea el SEGUNDO pedido con las líneas marcadas y devuelve su id', async () => {
    const { client, calls } = spyClient([], 'ord-2');
    const nuevo = await splitOrder(client, 'ord-1', ['l1', 'l3'], 'Mesa 4 · 2');

    expect(nuevo, 'el id del pedido nuevo sale del servidor (new_ids[0])').toBe('ord-2');
    expect(calls.map((c) => c.name)).toEqual(['sales.order.split']);
    expect(calls[0].params).toMatchObject({
      order_id: 'ord-1', line_ids: ['l1', 'l3'], label: 'Mesa 4 · 2',
    });
  });

  it('dividir sin marcar nada abre la segunda cuenta EN BLANCO', async () => {
    const { client, calls } = spyClient([], 'ord-3');
    const nuevo = await splitOrder(client, 'ord-1', [], '');
    expect(nuevo).toBe('ord-3');
    expect(calls[0].params).toMatchObject({ order_id: 'ord-1', line_ids: [] });
  });

  it('sin pedido de origen no hay nada que dividir', async () => {
    const { client, calls } = spyClient();
    expect(await splitOrder(client, '', ['l1'], '')).toBe('');
    expect(calls).toHaveLength(0);
  });
});

// ── pm#93 · los suplementos son parte de la IDENTIDAD de la línea ────────────────────────────
//
// Hasta ahora `sameCartLine` decía, literal: «Los modifiers no viven en la línea del carrito (se
// resuelven al vender), por eso no entran en la identidad». Con el selector del TPV eso deja de
// ser cierto: la elección se hace al AÑADIR, y viaja en la línea.
//
// Si no entran en la identidad, una hamburguesa «sin cebolla» se fusiona con una normal y cocina
// recibe «2 × Hamburguesa» — una de ellas mal. Es el mismo principio que ya separa una invitación
// de una línea normal, o el mismo producto a distinto precio: son unidades de cobro distintas.
describe('suplementos e identidad de la línea (pm#93)', () => {
  const base = (over: Partial<CartLine> = {}): CartLine =>
    ({ id: 'p-burger', name: 'Hamburguesa', price: 500, qty: 1, ...over }) as CartLine;

  it('el mismo producto con suplementos DISTINTOS no se fusiona', () => {
    const out = mergeCartLines(
      [base({ modifiers: [{ option_id: 'o-sin-cebolla' }] })],
      [base()],
    );
    expect(out).toHaveLength(2);
  });

  it('el mismo producto con los MISMOS suplementos sí se fusiona', () => {
    const out = mergeCartLines(
      [base({ modifiers: [{ option_id: 'o-queso' }] })],
      [base({ modifiers: [{ option_id: 'o-queso' }] })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(2);
  });

  it('el ORDEN de elección distingue: cocina lee la comanda en ese orden', () => {
    // Petición recurrente en los foros de Square: los modificadores deben salir en el orden en que
    // se eligieron, no en el del catálogo. Si el orden importa para el papel, distingue la línea.
    const out = mergeCartLines(
      [base({ modifiers: [{ option_id: 'a' }, { option_id: 'b' }] })],
      [base({ modifiers: [{ option_id: 'b' }, { option_id: 'a' }] })],
    );
    expect(out).toHaveLength(2);
  });

  it('sin suplementos, dos líneas iguales siguen fusionándose', () => {
    // Control: si esto se rompiera, cada pulsación crearía una línea nueva en TODAS las ventas.
    const out = mergeCartLines([base()], [base()]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(2);
  });
});

// ── pm#93 · los suplementos SOBREVIVEN a retomar la cuenta ───────────────────────────────────
//
// Es el caso del RESTAURANTE, y el que se pierde en silencio si no se persiste: abrir cuenta →
// añadir con suplementos → recargar / retomar → cobrar. Los demás campos de la línea ya tienen su
// comentario de «tiene que sobrevivir a retomar la cuenta» (IVA, coste, is_service, category_id,
// descuento, contexto de unidades). Los suplementos NO estaban: `sales_order_item` ni siquiera
// tenía la columna, aunque `sales_sale_item` sí.
//
// Sin esto, el selector deja elegir «sin cebolla», la elección vive solo en el navegador, y al
// volver a la cuenta la línea es una hamburguesa normal — sin que nada avise.
describe('los suplementos sobreviven a retomar la cuenta (pm#93)', () => {
  it('viajan en el payload de `order.add_line`', async () => {
    const { client, calls } = orderClient(['li-1']);
    await addOrderLine(client, 'ord-1', {
      id: 'p-burger', name: 'Hamburguesa', price: 500, qty: 1,
      modifiers: [{ option_id: 'o-sin-cebolla' }, { option_id: 'o-queso' }],
    } as CartLine);
    const [add] = calls.filter((c) => c.name === 'sales.order.add_line');
    // `order.add_line` es DECLARATIVO (SQL puro, sin handler): el payload bindea directo a una
    // columna TEXT, así que viaja serializado. Y viajan solo los `option_id`: el nombre y el precio
    // definitivos los resuelve el servidor AL COBRAR, contra `modifiers.options.all`. La línea de
    // pedido es de trabajo —su `line_total` también es provisional—, no el registro fiscal.
    expect(add.params?.modifiers).toBe(JSON.stringify([{ option_id: 'o-sin-cebolla' }, { option_id: 'o-queso' }]));
  });

  it('vuelven al releer las líneas del pedido, EN SU ORDEN', async () => {
    const { client } = orderClient([], [{
      id: 'li-1', product_id: 'p-burger', product_name: 'Hamburguesa',
      quantity: 1_000_000, unit_price: 500,
      modifiers: JSON.stringify([{ option_id: 'o-sin-cebolla' }, { option_id: 'o-queso' }]),
    }]);
    const [line] = await loadOrderLines(client, 'ord-1');
    expect(line.modifiers?.map((m) => m.option_id)).toEqual(['o-sin-cebolla', 'o-queso']);
  });

  it('una fila ANTERIOR a la columna vuelve sin suplementos, no rota', async () => {
    // Compat: las líneas ya escritas no traen la columna. Deben volver como lo que eran —una línea
    // sin suplementos— y NO tumbar la carga de la cuenta entera.
    const { client } = orderClient([], [
      { id: 'li-1', product_id: 'p-x', product_name: 'X', quantity: 1_000_000, unit_price: 100 },
    ]);
    const [line] = await loadOrderLines(client, 'ord-1');
    expect(line.modifiers).toBeUndefined();
    expect(line.name).toBe('X');
  });

  it('un JSON corrupto no tumba la cuenta', async () => {
    // Defensa: una fila manipulada o media escrita no puede dejar al camarero sin poder abrir su
    // mesa. Se pierde el suplemento de esa línea, no la comanda entera.
    const { client } = orderClient([], [
      { id: 'li-1', product_id: 'p-x', product_name: 'X', quantity: 1_000_000, unit_price: 100,
        modifiers: '{no es json' },
    ]);
    const [line] = await loadOrderLines(client, 'ord-1');
    expect(line.modifiers).toBeUndefined();
    expect(line.name).toBe('X');
  });
});
