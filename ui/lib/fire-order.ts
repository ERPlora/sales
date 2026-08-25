// fire-order — ADR-0141: mandar a producción (cocina/barra) lo pedido hasta ahora.
//
// La comanda nace del PEDIDO, no del cobro. Antes cocina colgaba de `sale.completed`: la comida
// salía cuando el cliente pagaba, o sea al final del servicio. El camarero dispara al tomar nota y
// el pedido sigue abierto una hora sin que exista ninguna venta.
//
// `sales` no sabe qué es una mesa: manda una ETIQUETA OPACA que cocina imprime tal cual. Quien la
// rellena es el POS, que sí tiene a mano el nombre de la mesa asignada (o nada, si es barra).

import type { CartLine } from './pos-cart';
import { toMicro } from './quantity';

export interface FireItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes: string;
  /** Categoría del producto (snapshot de la línea, sales#12): enruta categoría→estación en kitchen. */
  category_id: string | null;
  /** Línea de pedido de la que sale: kitchen reparte anulaciones por ronda con este id. */
  order_item_id: string | null;
  /** pm#93 — suplementos elegidos, EN SU ORDEN. Solo los ids: el nombre que se IMPRIME lo resuelve
   *  el handler contra `modifiers.options.all`, por el mismo motivo que el precio — si lo pusiera
   *  el navegador, cualquiera podría escribir lo que quisiera en la comanda de cocina.
   *  Ausente cuando la línea no tiene: `order.fired` lo leen más módulos y no merece ruido. */
  modifiers?: { option_id: string }[];
}

export interface FirePayload {
  order_id: string;
  label: string;
  channel: 'dine_in' | 'takeaway';
  items: FireItem[];
  /** Ronda LOCAL del pedido (tandas, 2026-07-19): el handler marca con ella las líneas
   *  pendientes. Ausente en el camino compat (sin tandas). */
  round_no?: number;
  /** Who is serving the check (sales#179), when the cashier has CHOSEN somebody. It travels
   *  opaque to `order.fired` and from there to the `kitchen` ticket, so the pass knows who to call.
   *  **Absent when nobody was chosen**: the session user's id is put there by the SERVER, and a
   *  browser making it up would be attributing tickets to whoever it liked. */
  waiter_id?: string;
}

/** Carga útil de `sales.order.fire`, o `undefined` si no hay nada que mandar (sin pedido abierto o
 *  con el carrito vacío): disparar en vacío imprimiría una comanda en blanco en cocina. */
export function buildFirePayload(
  orderId: string | undefined,
  label: string,
  lines: CartLine[],
  roundNo?: number,
  waiterId?: string,
): FirePayload | undefined {
  if (!orderId || lines.length === 0) return undefined;
  return {
    order_id: orderId,
    label,
    ...(roundNo && roundNo >= 1 ? { round_no: roundNo } : {}),
    ...(waiterId ? { waiter_id: waiterId } : {}),
    // Sin mesa no es servicio de sala: barra, mostrador o para llevar.
    channel: label ? 'dine_in' : 'takeaway',
    items: lines.map((l) => ({
      product_id: l.id,
      product_name: l.name,
      // Punto fijo 10⁶ (ADR-0147): cocina recibe 500000 y pinta 0,5 — su frontera, su formato.
      quantity: toMicro(l.qty),
      unit_price: l.price,
      // El motivo de una invitación es información de sala que el cocinero necesita ver.
      notes: l.is_gift ? (l.gift_reason ?? '') : '',
      // sales#12: la CATEGORÍA (snapshot de la línea) es lo que deja a kitchen aplicar
      // categoría→estación; sin ella solo enrutaba lo que tuviera mapeo producto→estación.
      category_id: l.category_id ?? null,
      // Y de qué línea de pedido salió: kitchen reparte una anulación entre las estaciones que
      // recibieron cada ronda por este id.
      order_item_id: l.line_id ?? null,
      ...(l.modifiers?.length ? { modifiers: l.modifiers.map((m) => ({ option_id: m.option_id })) } : {}),
    })),
  };
}
