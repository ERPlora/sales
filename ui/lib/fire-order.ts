// fire-order — ADR-0141: mandar a producción (cocina/barra) lo pedido hasta ahora.
//
// La comanda nace del PEDIDO, no del cobro. Antes cocina colgaba de `sale.completed`: la comida
// salía cuando el cliente pagaba, o sea al final del servicio. El camarero dispara al tomar nota y
// el pedido sigue abierto una hora sin que exista ninguna venta.
//
// `sales` no sabe qué es una mesa: manda una ETIQUETA OPACA que cocina imprime tal cual. Quien la
// rellena es el POS, que sí tiene a mano el nombre de la mesa asignada (o nada, si es barra).

import type { CartLine } from './pos-cart';

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
}

/** Carga útil de `sales.order.fire`, o `undefined` si no hay nada que mandar (sin pedido abierto o
 *  con el carrito vacío): disparar en vacío imprimiría una comanda en blanco en cocina. */
export function buildFirePayload(
  orderId: string | undefined,
  label: string,
  lines: CartLine[],
): FirePayload | undefined {
  if (!orderId || lines.length === 0) return undefined;
  return {
    order_id: orderId,
    label,
    // Sin mesa no es servicio de sala: barra, mostrador o para llevar.
    channel: label ? 'dine_in' : 'takeaway',
    items: lines.map((l) => ({
      product_id: l.id,
      product_name: l.name,
      quantity: l.qty,
      unit_price: l.price,
      // El motivo de una invitación es información de sala que el cocinero necesita ver.
      notes: l.is_gift ? (l.gift_reason ?? '') : '',
    })),
  };
}
