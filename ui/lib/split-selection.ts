// split-selection — cobrar solo una parte de la cuenta (ADR-0146: «cada uno paga lo suyo»).
//
// En una mesa de cuatro es lo normal: uno paga su menú y se va, y los demás siguen. El modelo ya lo
// soporta —1 pedido → N ventas— y las líneas cobradas quedan atadas a SU venta, así que lo que falta
// es decidir cuáles entran en este cobro.
//
// Regla que evita el estado absurdo: si se seleccionan TODAS, esto no es un cobro parcial sino la
// cuenta entera, y el pedido se cierra. Si no, quedaría abierto y vacío esperando a nadie.

import type { CartLine } from './pos-cart';
import { cartTotal } from './pos-cart';

export interface SplitPayload {
  /** Líneas que cubre este cobro. `undefined` = la cuenta entera (no es un split). */
  line_ids?: string[];
  /** Deja el pedido abierto para los siguientes. Falso cuando se cobra todo lo que queda. */
  keep_order_open: boolean;
  items: Array<Record<string, unknown>>;
}

/** ¿Es un cobro de una PARTE? Vacío o todo seleccionado = la cuenta entera. */
function esParcial(cart: CartLine[], sel: ReadonlySet<string>): boolean {
  const conId = cart.filter((l) => l.line_id);
  return sel.size > 0 && sel.size < conId.length;
}

/** Importe (céntimos) de lo seleccionado; con nada seleccionado, el total de la cuenta.
 *  Las invitaciones no suman: se sirven pero no se cobran. */
export function splitTotal(cart: CartLine[], sel: ReadonlySet<string>, ticketDiscount = 0): number {
  const lineas = sel.size ? cart.filter((l) => l.line_id && sel.has(l.line_id)) : cart;
  // sales#71: con los descuentos (línea + ticket), redondeando como el servidor.
  return cartTotal(lineas, ticketDiscount);
}

/** Qué mandarle a `sales.complete_sale` según lo que el camarero haya marcado. */
export function splitPayload(cart: CartLine[], sel: ReadonlySet<string>): SplitPayload {
  const parcial = esParcial(cart, sel);
  const lineas = parcial ? cart.filter((l) => l.line_id && sel.has(l.line_id)) : cart;
  return {
    line_ids: parcial ? lineas.map((l) => l.line_id as string) : undefined,
    keep_order_open: parcial,
    items: lineas.map((l) => ({
      product_id: l.id || null,
      product_name: l.name,
      price: l.price,
      quantity: l.qty,
      tax_rate: l.tax_rate ?? 0,
      tax_category_key: l.tax_category_key ?? '',
      cost: l.cost ?? 0,
      is_gift: !!l.is_gift,
      gift_reason: l.gift_reason ?? '',
    })),
  };
}
