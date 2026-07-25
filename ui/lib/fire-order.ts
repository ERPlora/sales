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
}

export interface FirePayload {
  order_id: string;
  label: string;
  channel: 'dine_in' | 'takeaway';
  items: FireItem[];
  /** Ronda LOCAL del pedido (tandas, 2026-07-19): el handler marca con ella las líneas
   *  pendientes. Ausente en el camino compat (sin tandas). */
  round_no?: number;
}

/** Carga útil de `sales.order.fire`, o `undefined` si no hay nada que mandar (sin pedido abierto o
 *  con el carrito vacío): disparar en vacío imprimiría una comanda en blanco en cocina. */
export function buildFirePayload(
  orderId: string | undefined,
  label: string,
  lines: CartLine[],
  roundNo?: number,
): FirePayload | undefined {
  if (!orderId || lines.length === 0) return undefined;
  return {
    order_id: orderId,
    label,
    ...(roundNo && roundNo >= 1 ? { round_no: roundNo } : {}),
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
    })),
  };
}
