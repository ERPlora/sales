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
  /** ADR-0141: id de la FILA `sales_order_item` que respalda esta línea. Presente cuando el carrito
   *  está respaldado por un pedido real; es lo que permite mutarla (update/remove) sin reescribir
   *  todo el carrito. Ausente en el camino viejo (blob) y en tickets aparcados. */
  line_id?: string;
  /** CATEGORÍA fiscal del producto (`inventory.products.list`). La AUTORIDAD del % es el servidor:
   *  `complete_sale` la envía y el handler resuelve el `rate_pct` por país+categoría desde el
   *  catálogo de confianza (`taxes.rules.list` pre-cargado), aplicando componentes. ADR-0085. */
  tax_category_key?: string;
  /** % de IVA PREVIEW resuelto en cliente SOLO para el total del carrito; NO es autoridad (el
   *  servidor recalcula por categoría). 0 si no se resuelve. ADR-0085. */
  tax_rate?: number;
  /** Coste unitario del producto (céntimos), del catálogo. Se usa para el arqueo de invitaciones
   *  (a coste); el servidor lo suma a `gift_total` solo en líneas regalo. */
  cost?: number;
  /** INVITACIÓN/REGALO (comp): la línea no se cobra (net/tax/total=0) pero descuenta stock. */
  is_gift?: boolean;
  /** Motivo de la invitación (cortesía/error cocina/fidelización…). */
  gift_reason?: string;
}

export interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  /** Integración OPCIONAL (ADR-0127): undefined SOLO si el módulo dueño no está instalado;
   *  un contrato roto contra un módulo presente EXPLOTA (no es un catch silencioso). */
  queryOptional<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T | undefined>;
  /** TODAS las filas, sin tope (salvo que pases `limit`). Para lo que no es «una página»: la
   *  rejilla de productos del TPV, un `<ion-select>` de categorías fiscales, el mapa
   *  producto↔categoría. El viejo `page_size` NO era un parámetro del runtime: truncaba a 50. */
  queryAll<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T[]>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  /** Moneda del hub + formateo de dinero (ADR-0059). El POS formatea con la moneda del HUB. */
  currency: string;
  /** Importe en CÉNTIMOS (divide entre 100). El dinero es INTEGER (ADR-0007) → es ESTE el del POS. */
  formatMoney(cents: number, opts?: { currency?: string; locale?: string }): string;
  /** Importe ya en EUROS (no divide). No usar con columnas de dinero. */
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
        // Preserva la categoría fiscal del producto en el round-trip de persistencia/aparcado:
        // es lo que el servidor usa para resolver el % por país+categoría (ADR-0085). El % es preview.
        tax_category_key: l.tax_category_key != null && String(l.tax_category_key) !== '' ? String(l.tax_category_key) : undefined,
        tax_rate: l.tax_rate != null && Number.isFinite(Number(l.tax_rate)) ? Number(l.tax_rate) : undefined,
        cost: l.cost != null && Number.isFinite(Number(l.cost)) ? Number(l.cost) : undefined,
        is_gift: l.is_gift === true || l.is_gift === 1 ? true : undefined,
        gift_reason: l.gift_reason ? String(l.gift_reason) : undefined,
      }))
      .filter((l) => l.id && l.name);
  } catch {
    return [];
  }
}

/** Dos líneas son "la misma" (fusionables) si coinciden producto, precio, categoría/tipo fiscal,
 *  condición de invitación y sku. Una invitación (comp) NO se fusiona con una línea normal, ni el
 *  mismo producto a distinto precio: son unidades de cobro distintas. Los `modifiers` no viven en
 *  la línea del carrito (se resuelven al vender), por eso no entran en la identidad. */
function sameCartLine(a: CartLine, b: CartLine): boolean {
  return a.id === b.id
    && a.price === b.price
    && a.sku === b.sku
    && a.tax_category_key === b.tax_category_key
    && a.tax_rate === b.tax_rate
    && !!a.is_gift === !!b.is_gift
    && a.gift_reason === b.gift_reason;
}

/** Fusiona dos comandas al FUSIONAR mesas (punto 3): parte de `base` (comanda de la mesa DESTINO,
 *  la que sobrevive) y añade las líneas de `incoming` (mesa origen) SUMANDO las idénticas y dejando
 *  separado lo que difiere. Puro: devuelve un array nuevo con líneas nuevas, sin mutar las entradas. */
export function mergeCartLines(base: CartLine[], incoming: CartLine[]): CartLine[] {
  const out: CartLine[] = base.map((l) => ({ ...l }));
  for (const inc of incoming) {
    const match = out.find((l) => sameCartLine(l, inc));
    if (match) match.qty += inc.qty;
    else out.push({ ...inc });
  }
  return out;
}

/** Recupera la comanda persistida de una MESA (`table_id`) o, sin mesa, el carrito suelto de
 *  mostrador ([] si no hay o no parsea). La clave real (mesa vs `u:<empleado>`) la deriva el SQL;
 *  la UI solo dice a qué mesa pertenece (cadena vacía = sin mesa). */
export async function loadActiveCart(client: ErploraClientLike, tableId?: string): Promise<CartLine[]> {
  try {
    const r = rows<{ cart_data?: string }>(await client.query('sales.cart.get', { table_id: tableId ?? '' }));
    return r.length ? parseCartLines(r[0].cart_data) : [];
  } catch {
    return [];
  }
}

/** Persiste (upsert) la comanda de una MESA (o el carrito suelto si no hay `table_id`); con carrito
 *  vacío la limpia. Best-effort: nunca lanza. */
export async function persistActiveCart(client: ErploraClientLike, cart: CartLine[], tableId?: string): Promise<void> {
  try {
    if (cart.length) {
      await client.command('sales.cart.save', { cart_data: JSON.stringify({ lines: cart }), table_id: tableId ?? '' });
    } else {
      await client.command('sales.cart.clear', { table_id: tableId ?? '' });
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

// ── ADR-0141: carrito respaldado por un PEDIDO real (sales_order/sales_order_item) ────────────
// El camino viejo (`sales_active_cart`) guardaba un BLOB JSON con debounce de 400 ms: un corte de
// corriente perdía el último artículo. Aquí cada interacción es una escritura TRANSACCIONAL
// INMEDIATA de una fila real. El runtime es la autoridad de ids y los devuelve en `new_ids`.

/** Primer id del lote que devolvió el runtime (`new_ids[0]` = entidad principal, §5.3). */
function firstNewId(res: unknown): string {
  const ids = (res as { new_ids?: unknown[] })?.new_ids;
  return Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : '';
}

/** Importe provisional de una línea (céntimos). Las invitaciones no se cobran. NO es fiscal: la
 *  cuota HALF_UP + el desglose por tipo los congela el servidor al COBRAR. */
function provisionalLineTotal(unitPrice: number, qty: number, isGift?: boolean): number {
  return isGift ? 0 : Math.round(unitPrice * qty);
}

function toItemPayload(l: CartLine): Record<string, unknown> {
  return {
    product_id: l.id || null,
    product_name: l.name,
    product_sku: l.sku ?? '',
    price: l.price,
    quantity: l.qty,
    is_gift: !!l.is_gift,
    gift_reason: l.gift_reason ?? '',
    tax_category_key: l.tax_category_key ?? '',
    cost: l.cost ?? 0,
  };
}

/** Abre un pedido MUTABLE con sus primeras líneas. Devuelve el `order_id` que generó el runtime. */
export async function openOrderWithLines(client: ErploraClientLike, lines: CartLine[]): Promise<string> {
  const res = await client.command('sales.order.open', { items: lines.map(toItemPayload) });
  return firstNewId(res);
}

/** Añade una línea al pedido AHORA (fila real, sin debounce). Devuelve su `line_id`. */
export async function addOrderLine(client: ErploraClientLike, orderId: string, l: CartLine): Promise<string> {
  const res = await client.command('sales.order.add_line', {
    order_id: orderId,
    product_id: l.id || null,
    product_name: l.name,
    product_sku: l.sku ?? '',
    quantity: l.qty,
    unit_price: l.price,
    is_gift: !!l.is_gift,
    gift_reason: l.gift_reason ?? '',
    tax_category_key: l.tax_category_key ?? '',
    cost: l.cost ?? 0,
    line_total: provisionalLineTotal(l.price, l.qty, l.is_gift),
  });
  return firstNewId(res);
}

/** Cambia la cantidad de una línea por su `line_id`; el servidor recompone el total del pedido. */
/**
 * Persiste la cantidad de una línea, RECUPERANDO su `line_id` si el POS no lo tiene (ADR-0144).
 *
 * Encontrado en el navegador: cinco toques rápidos a la tortilla dejaban 37,50 € en pantalla y una
 * sola tortilla en la BD. El POS solo escribía cuando ya conocía el `line_id`; si no, subía la
 * cantidad en la vista y se callaba. La fila SÍ existía —la había creado `add_line`—, pero su id se
 * había perdido, así que nadie volvía a tocarla: la comanda se retomaba en otra tablet con la
 * cantidad vieja y se servía más de lo que se cobraba.
 *
 * @returns `true` si quedó escrita. `false` = no se pudo identificar la fila; el llamador NO debe
 * dejar la pantalla mostrando algo que no está en la comanda.
 */
export async function persistLineQty(
  client: ErploraClientLike, orderId: string, line: CartLine, qty: number,
): Promise<boolean> {
  let lineId = line.line_id;
  if (!lineId) {
    // Relee el pedido y busca la fila por producto: es la misma que creó `add_line`.
    const persisted = await loadOrderLines(client, orderId);
    lineId = persisted.find((p) => p.id === line.id && !p.is_gift === !line.is_gift)?.line_id;
  }
  if (!lineId) return false;
  line.line_id = lineId;
  await updateOrderLineQty(client, orderId, lineId, qty, line.price, line.is_gift, line.gift_reason);
  return true;
}

export async function updateOrderLineQty(
  client: ErploraClientLike, orderId: string, lineId: string, qty: number, unitPrice: number,
  isGift?: boolean, giftReason?: string,
): Promise<void> {
  await client.command('sales.order.update_line', {
    order_id: orderId, line_id: lineId, quantity: qty,
    line_total: provisionalLineTotal(unitPrice, qty, isGift),
    // Alternar invitación cambia el importe: viaja junto para que la fila quede coherente.
    is_gift: isGift === undefined ? null : (isGift ? 1 : 0),
    gift_reason: giftReason ?? null,
  });
}

/** Quita una línea del pedido (soft-delete); el servidor recompone el total. */
export async function removeOrderLine(client: ErploraClientLike, orderId: string, lineId: string): Promise<void> {
  await client.command('sales.order.remove_line', { order_id: orderId, line_id: lineId });
}

/** Líneas persistidas de un pedido → líneas de carrito, CONSERVANDO `line_id` para poder mutarlas. */
export async function loadOrderLines(client: ErploraClientLike, orderId: string): Promise<CartLine[]> {
  try {
    const r = rows<Record<string, unknown>>(await client.query('sales.order.lines', { order_id: orderId }));
    return r.map((x) => ({
      line_id: String(x.id ?? ''),
      id: String(x.product_id ?? ''),
      name: String(x.product_name ?? ''),
      sku: x.product_sku ? String(x.product_sku) : undefined,
      price: Number(x.unit_price) || 0,
      qty: Number(x.quantity) || 1,
      is_gift: x.is_gift === 1 || x.is_gift === true ? true : undefined,
      gift_reason: x.gift_reason ? String(x.gift_reason) : undefined,
      // Autoridad del IVA en servidor (ADR-0085) y coste para el arqueo de invitaciones: se
      // recuperan para que un pedido REANUDADO cobre con el mismo IVA que si no se hubiera recargado.
      tax_category_key: x.tax_category_key ? String(x.tax_category_key) : undefined,
      cost: Number(x.cost) || undefined,
    }));
  } catch {
    return [];
  }
}

/** Pedido ABIERTO del hub para reanudarlo tras recargar (el TPV de mostrador no tiene mesa que lo
 *  identifique). Devuelve '' si no hay ninguno abierto. */
export async function findOpenOrder(client: ErploraClientLike): Promise<string> {
  try {
    const r = rows<{ id?: string; status?: string }>(await client.query('sales.orders.list'));
    return r.find((o) => o.status === 'open')?.id ?? '';
  } catch {
    return '';
  }
}

/**
 * FUSIONAR comandas (ADR-0141): lleva las líneas del pedido `fromOrderId` al `toOrderId` y **anula**
 * el origen. Es la operación de "juntar dos mesas en una cuenta".
 *
 * Con el modelo de pedido esto es mover FILAS, no reescribir un blob: las cantidades y precios se
 * conservan tal cual, y el pedido origen queda `voided` (no se borra: rastro de lo que pasó).
 * TRANSFERIR no pasa por aquí — ahí no se mueve nada, solo cambia a qué mesa apunta el mismo pedido
 * (lo hace la junction en `tables`), por eso los productos se conservan solos.
 */
export async function mergeOrders(client: ErploraClientLike, fromOrderId: string, toOrderId: string): Promise<void> {
  if (!fromOrderId || !toOrderId || fromOrderId === toOrderId) return;
  const lines = await loadOrderLines(client, fromOrderId);
  for (const l of lines) {
    await addOrderLine(client, toOrderId, l);
  }
  await client.command('sales.order.void', { order_id: fromOrderId });
}
