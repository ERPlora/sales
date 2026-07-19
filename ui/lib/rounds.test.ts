import { describe, expect, it } from 'vitest';
import { groupByRound, pendingLines, nextRoundNo, isLineLocked } from './rounds';
import type { CartLine } from './pos-cart';

// TANDAS (rondas) del pedido de restaurante — decisión Ioan 2026-07-19: la pertenencia vive en la
// LÍNEA (`sales_order_item.round_no` + `fired_at`; 0/sin marcar = ronda EN CURSO, editable). Al
// disparar, `sales.order.fire` manda SOLO lo pendiente y lo marca — eso mata además el bug real de
// reenviar TODO el carrito en cada disparo (comida duplicada en cocina). `kitchen` sigue numerando
// sus rondas (ADR-0144); este número es la vista LOCAL del pedido.
const linea = (over: Partial<CartLine>): CartLine => ({
  id: 'p1', name: 'Croquetas', price: 500, qty: 1, ...over,
});

describe('tandas del pedido (round_no en la línea)', () => {
  const carta: CartLine[] = [
    linea({ name: 'Caña', round_no: 1, fired_at: '2026-07-19T14:02:00+00:00' }),
    linea({ name: 'Croquetas', round_no: 1, fired_at: '2026-07-19T14:02:00+00:00' }),
    linea({ name: 'Entrecot', round_no: 2, fired_at: '2026-07-19T14:25:00+00:00' }),
    linea({ name: 'Postre' }), // sin marcar = ronda en curso
  ];

  it('agrupa: PENDIENTE DE ENVIAR primero y las comandas más reciente arriba (sketch Ioan)', () => {
    // El camarero trabaja sobre lo pendiente (arriba, con su CTA) y la última comanda enviada
    // es la que consulta («¿ya marché los segundos?») — la 1 del principio ya está servida.
    const grupos = groupByRound(carta);
    expect(grupos.map((g) => g.round_no)).toEqual([0, 2, 1]);
    expect(grupos[0].lines.map((l) => l.name)).toEqual(['Postre']);
    expect(grupos[0].fired_at, 'lo pendiente no tiene hora de envío').toBeUndefined();
    expect(grupos[1].fired_at).toBe('2026-07-19T14:25:00+00:00');
    expect(grupos[2].lines.map((l) => l.name)).toEqual(['Caña', 'Croquetas']);
  });

  it('la sección pendiente existe SIEMPRE, aunque esté vacía (es donde caen los productos)', () => {
    const soloDisparadas = carta.slice(0, 3);
    const grupos = groupByRound(soloDisparadas);
    expect(grupos.map((g) => g.round_no)).toEqual([0, 2, 1]);
    expect(grupos[0].lines).toEqual([]);
  });

  it('pendingLines: lo que aún no se ha enviado a cocina', () => {
    expect(pendingLines(carta).map((l) => l.name)).toEqual(['Postre']);
    expect(pendingLines(carta.slice(0, 3))).toEqual([]);
  });

  it('nextRoundNo: la siguiente ronda tras la más alta disparada', () => {
    expect(nextRoundNo(carta)).toBe(3);
    expect(nextRoundNo([linea({})]), 'sin nada disparado, la primera ronda es la 1').toBe(1);
    expect(nextRoundNo([])).toBe(1);
  });

  it('isLineLocked: una línea disparada no se toca desde el TPV (corrección = ronda nueva)', () => {
    expect(isLineLocked(linea({ round_no: 1, fired_at: '2026-07-19T14:02:00+00:00' }))).toBe(true);
    expect(isLineLocked(linea({}))).toBe(false);
  });
});
