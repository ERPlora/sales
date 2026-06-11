// pos-cart — persistencia del carrito activo del POS (tabla sales_active_cart).
// Compartido por erp-pos-touch y erp-pos-desktop: el carrito en curso del empleado actual
// sobrevive a recargas/navegación. El empleado lo resuelve el runtime (:current_user_id),
// la UI solo envía el JSON del carrito.

export interface CartLine {
  id: string;
  name: string;
  sku?: string;
  price: number;
  qty: number;
}

export interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

function parseLines(cartData: unknown): CartLine[] {
  try {
    const parsed = typeof cartData === 'string' ? JSON.parse(cartData) : cartData;
    const lines = Array.isArray(parsed) ? parsed : (parsed as { lines?: unknown[] })?.lines;
    if (!Array.isArray(lines)) return [];
    return lines
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({
        id: String(l.id ?? ''),
        name: String(l.name ?? ''),
        sku: l.sku ? String(l.sku) : undefined,
        price: Number(l.price) || 0,
        qty: Math.max(1, Number(l.qty) || 1),
      }))
      .filter((l) => l.id && l.name);
  } catch {
    return [];
  }
}

/** Recupera el carrito activo persistido del empleado actual ([] si no hay o no parsea). */
export async function loadActiveCart(client: ErploraClientLike): Promise<CartLine[]> {
  try {
    const r = rows<{ cart_data?: string }>(await client.query('sales.cart.get'));
    return r.length ? parseLines(r[0].cart_data) : [];
  } catch {
    return [];
  }
}

/** Persiste (upsert) el carrito activo; con carrito vacío lo limpia. Best-effort: nunca lanza. */
export async function persistActiveCart(client: ErploraClientLike, cart: CartLine[]): Promise<void> {
  try {
    if (cart.length) {
      await client.command('sales.cart.save', { cart_data: JSON.stringify({ lines: cart }) });
    } else {
      await client.command('sales.cart.clear', {});
    }
  } catch {
    /* la persistencia del carrito nunca debe romper la venta */
  }
}
