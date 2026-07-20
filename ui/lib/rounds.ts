// rounds — TANDAS del pedido de restaurante (decisión Ioan 2026-07-19).
//
// La pertenencia vive en la LÍNEA (`sales_order_item.round_no` + `fired_at`): 0/sin marcar = la
// ronda EN CURSO (editable, donde caen los productos tocados); ≥1 = enviada a cocina en esa ronda.
// Disparar (`sales.order.fire` con `round_no`) marca SOLO lo pendiente — lo que mata el bug real
// de reenviar el carrito entero en cada fire (comida duplicada en cocina). `kitchen` sigue
// numerando sus rondas (ADR-0144): este número es la vista LOCAL del pedido y coincide porque
// ambos cuentan los mismos disparos. Puro: sin DOM ni SDK, para testear la sala sin navegador.

import type { CartLine } from './pos-cart';

export interface RoundGroup {
  /** 0 = la ronda EN CURSO (aún sin enviar); ≥1 = ronda ya disparada. */
  round_no: number;
  /** Cuándo salió a cocina (de sus líneas). Ausente en la ronda en curso. */
  fired_at?: string;
  lines: CartLine[];
}

/** Líneas aún SIN enviar a cocina (la ronda en curso). */
export function pendingLines(lines: CartLine[]): CartLine[] {
  return lines.filter((l) => !l.fired_at);
}

/** Una línea ya disparada no se toca desde el TPV: la comida está en fuego (corrección = ronda
 *  nueva o invitación; el SQL de update/remove lo bloquea con `fired_at IS NULL`). */
export function isLineLocked(l: CartLine): boolean {
  return !!l.fired_at;
}

/** Número de la SIGUIENTE ronda a disparar: la más alta enviada + 1 (primera = 1). */
export function nextRoundNo(lines: CartLine[]): number {
  const max = lines.reduce((m, l) => (l.fired_at && (l.round_no ?? 0) > m ? (l.round_no ?? 0) : m), 0);
  return max + 1;
}

/**
 * Las líneas agrupadas para la vista única (sketch Ioan 2026-07-19): PENDIENTE DE ENVIAR
 * primero — SIEMPRE presente aunque esté vacía, porque es donde caen los productos y donde vive
 * el CTA de enviar — y después las comandas enviadas, la MÁS RECIENTE arriba (la que el
 * camarero consulta; la primera del servicio ya está servida).
 */
export function groupByRound(lines: CartLine[]): RoundGroup[] {
  const fired = new Map<number, RoundGroup>();
  const current: RoundGroup = { round_no: 0, lines: [] };
  for (const l of lines) {
    if (!l.fired_at) { current.lines.push(l); continue; }
    const n = l.round_no ?? 0;
    let g = fired.get(n);
    if (!g) { g = { round_no: n, fired_at: l.fired_at, lines: [] }; fired.set(n, g); }
    g.lines.push(l);
  }
  return [current, ...[...fired.values()].sort((a, b) => b.round_no - a.round_no)];
}
