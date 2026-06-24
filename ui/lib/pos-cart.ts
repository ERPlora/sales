// pos-cart — persistencia del carrito activo (sales_active_cart) y tickets aparcados
// (sales_parked_ticket) del POS. Compartido por erp-pos-touch y erp-pos-desktop: el carrito
// en curso del empleado actual sobrevive a recargas/navegación, y se puede aparcar como
// ticket recuperable. El empleado lo resuelve el runtime (:current_user_id), la UI solo
// envía el JSON del carrito.

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
  /** Moneda del hub + formateo de dinero (ADR-0059). El POS formatea con la moneda del HUB. */
  currency: string;
  formatAmount(units: number, opts?: { currency?: string; locale?: string }): string;
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

/** Parsea el JSON de `cart_data` ({lines:[…]} o array suelto) a líneas ([] si no parsea). */
export function parseCartLines(cartData: unknown): CartLine[] {
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
    return r.length ? parseCartLines(r[0].cart_data) : [];
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

// ── Tickets aparcados (sales_parked_ticket) ──────────────────────────────────────────────

export interface ParkedTicket {
  id: string;
  ticket_number: string;
  cart_data?: string;
  employee_id?: string;
  notes?: string;
  expires_at?: string;
  created_at?: string;
}

/** Tickets aparcados vigentes (no expirados), más recientes primero ([] si falla). */
export async function listParkedTickets(client: ErploraClientLike): Promise<ParkedTicket[]> {
  try {
    return rows<ParkedTicket>(await client.query('sales.parked_tickets'));
  } catch {
    return [];
  }
}

/** Aparca el carrito como ticket recuperable; devuelve el número asignado o null si falla.
 *  La caducidad (expires_at) la calcula la BD con ticket_expiry_hours de sales_settings. */
export async function parkCart(client: ErploraClientLike, cart: CartLine[], notes = ''): Promise<string | null> {
  if (!cart.length) return null;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ticketNumber = `P-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  try {
    await client.command('sales.park_ticket', {
      ticket_number: ticketNumber,
      cart_data: JSON.stringify({ lines: cart }),
      notes,
    });
    return ticketNumber;
  } catch {
    return null;
  }
}

/** Recupera un ticket aparcado: lo retira de la lista (soft-delete) y devuelve sus líneas. */
export async function retrieveParkedTicket(client: ErploraClientLike, ticket: ParkedTicket): Promise<CartLine[]> {
  const lines = parseCartLines(ticket.cart_data);
  await client.command('sales.retrieve_ticket', { ticket_id: ticket.id });
  return lines;
}
