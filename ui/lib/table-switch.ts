// table-switch — qué pasa con la comanda que hay delante cuando el camarero toca una mesa.
//
// La regla de fondo: **lo del carrito nunca se pierde**. En barra se empieza a marcar sin mesa y
// luego se decide dónde va; y una mesa que ya tiene comanda no se puede "pisar" con otra.

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

/**
 * Decide la acción:
 * - `load-target`       — no hay nada delante: se abre lo que tenga la mesa (o nada).
 * - `assign-to-target`  — hay comanda delante y la mesa está libre: pasa a ser la comanda de esa mesa.
 * - `park-then-load`    — hay comanda delante y la mesa YA tiene la suya: la de delante se aparca
 *                         (ticket recuperable) y se abre la de la mesa. No se mezclan solas: juntar
 *                         dos cuentas es "fusionar", una acción explícita.
 * - `park-then-clear`   — se quita la mesa con productos: la comanda se aparca y la mesa queda libre.
 * - `clear`             — se quita la mesa sin nada que guardar.
 */
export function decideOnTableChange(c: TableChange): 'load-target' | 'assign-to-target' | 'park-then-load' | 'park-then-clear' | 'clear' {
  if (!c.targetTableId) return c.cartHasItems ? 'park-then-clear' : 'clear';
  if (!c.cartHasItems) return 'load-target';
  return c.targetOrderId ? 'park-then-load' : 'assign-to-target';
}
