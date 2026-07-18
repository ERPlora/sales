// table-switch — qué pasa con la comanda que hay delante cuando el camarero toca una mesa.
//
// La regla de sala, tal y como funcionan los TPV de referencia (Toast, Lightspeed): **tocar una
// mesa es CAMBIAR de mesa, no llevarse la cuenta**. Si la mesa tocada tiene cuenta, se abre la
// suya; si está libre y ya venías de otra mesa, se empieza una cuenta NUEVA allí. Mover una cuenta
// de una mesa a otra es **transferir**, una acción explícita con su propio botón (en Toast es
// "Move X Check", y si el destino ya tiene cuenta pregunta si fusionar).
//
// El único caso en que lo marcado SÍ se asigna a la mesa es cuando **no había mesa**: se empieza a
// marcar en barra y luego se decide dónde va. Ahí no hay ninguna mesa que pueda quedarse la comanda.
//
// Por qué importa (bug real, 2026-07-18): arrastrar la comanda a cada mesa tocada dejaba la
// junction escrita en TODAS, así que ninguna se liberaba nunca — acabamos con tres mesas ocupadas
// por el mismo pedido y el TPV sin saber en cuál estaba.

export interface TableChange {
  /** ¿Hay algo marcado ahora mismo? */
  cartHasItems: boolean;
  /** Mesa en la que estábamos (si había). */
  currentTableId?: string;
  /** Mesa que se acaba de tocar. `undefined` = quitar la mesa. */
  targetTableId?: string;
  /** Comanda que YA tiene la mesa destino (junction). `undefined` = mesa sin comanda. */
  targetOrderId?: string;
}

export type TableAction =
  | 'load-target'
  | 'assign-to-target'
  | 'start-new-check'
  | 'park-then-load'
  | 'park-then-clear'
  | 'clear';

/**
 * Decide la acción:
 * - `load-target`       — se abre la cuenta de la mesa tocada (o se empieza en blanco si no tiene).
 * - `assign-to-target`  — lo marcado SIN mesa pasa a ser la comanda de esa mesa.
 * - `start-new-check`   — ya había mesa y la tocada está libre: la comanda de antes **se queda en
 *                         su mesa** (sigue abierta) y aquí empieza una cuenta nueva.
 * - `park-then-load`    — hay comanda SIN mesa y la tocada ya tiene la suya: la de delante se
 *                         aparca (ticket recuperable) y se abre la de la mesa. No se mezclan solas:
 *                         juntar dos cuentas es "fusionar", una acción explícita.
 * - `park-then-clear`   — se quita la mesa con productos: la comanda se aparca y la mesa queda libre.
 * - `clear`             — se quita la mesa sin nada que guardar.
 */
export function decideOnTableChange(c: TableChange): TableAction {
  if (!c.targetTableId) return c.cartHasItems ? 'park-then-clear' : 'clear';
  // Venías de una mesa: nunca te llevas la cuenta. O abres la de la mesa tocada, o empiezas otra.
  if (c.currentTableId) return c.targetOrderId ? 'load-target' : 'start-new-check';
  if (!c.cartHasItems) return 'load-target';
  return c.targetOrderId ? 'park-then-load' : 'assign-to-target';
}
