// pos-cart — el carrito del TPV, respaldado por un PEDIDO real (ADR-0141/0146).
//
// Cada interacción (añadir, cambiar cantidad, invitar, quitar) escribe su FILA en `sales_order` /
// `sales_order_item` de forma transaccional e inmediata. Antes esto era un blob JSON en
// `sales_active_cart` con debounce de 400 ms —un corte de luz se llevaba el último artículo— y una
// segunda entidad para los aparcados (`sales_parked_ticket`). Ambas se retiraron: una cuenta sin
// cobrar es un pedido abierto, y punto.
//
// Lo que NO vive aquí: aparcar y soltar la mesa son de `tables` (ADR-0146), y qué cuenta mira este
// terminal es estado del dispositivo (`current-check.ts`).

import { toMicro, fromMicro } from './quantity';

export interface CartLine {
  id: string;
  name: string;
  sku?: string;
  price: number;
  /** Cantidad LÓGICA (0,5 = medio kilo). El cable habla punto fijo 10⁶ (ADR-0147): la conversión
   *  vive SOLO en las funciones de este fichero (toMicro al enviar, fromMicro al cargar). */
  qty: number;
  /** ── Contexto de unidades CONGELADO de la línea (ADR-0147 §2.4, del maestro al añadir) ──
   *  El histórico nunca relee el maestro: si mañana las gambas pasan de kg a ud, esta línea
   *  sigue siendo 0,5 kg. `increment_value` (µ) es además la rejilla que valida la UI. */
  unit_code?: string;
  unit_name?: string;
  factor_num?: number;
  factor_den?: number;
  increment_value?: number;
  price_quantity_value?: number;
  pricing_unit_code?: string;
  pricing_unit_name?: string;
  pricing_factor_num?: number;
  pricing_factor_den?: number;
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
  /** SERVICIO (sales#89): la línea no sale del catálogo de `inventory` — su precio es el que manda
   *  y no descuenta stock. Viaja hasta `complete_sale` y de ahí a `sale.completed`, donde
   *  `inventory` la salta. Persistida en el pedido para sobrevivir al RETOMAR la cuenta. */
  is_service?: boolean;
  /** INVITACIÓN/REGALO (comp): la línea no se cobra (net/tax/total=0) pero descuenta stock. */
  is_gift?: boolean;
  /** Motivo de la invitación (cortesía/error cocina/fidelización…). */
  gift_reason?: string;
  /** TANDAS (2026-07-19): ronda LOCAL en la que la línea salió a cocina (≥1). Ausente/0 = aún
   *  sin enviar (la ronda en curso, editable). `kitchen` numera lo suyo (ADR-0144). */
  round_no?: number;
  /** Cuándo salió a cocina. Presente = línea BLOQUEADA en el TPV (el SQL también lo impone). */
  fired_at?: string;
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



// ── Tickets aparcados (sales_parked_ticket) ──────────────────────────────────────────────





/** Una cuenta sin cobrar, tal y como se ve en la lista del TPV (ADR-0146). */
export interface OpenCheck {
  id: string;
  /** Céntimos. Provisional: el desglose fiscal se congela al cobrar. */
  total: number;
  created_at: string;
  /** Etiqueta de quien la owna (mesa, cliente…), si el TPV la ha resuelto. Vacía = cuenta de barra. */
  label?: string;
}

/**
 * Cuentas ABIERTAS del hub, la más reciente primero (ADR-0146).
 *
 * Sustituye a la lista de «tickets aparcados». Había tres formas de decir lo mismo —el pedido de la
 * mesa, el ticket aparcado y el blob del carrito— y eran la misma cosa: una cuenta sin cobrar. Aquí
 * salen todas, de mesa y de barra, y recuperar una es cambiar de cuenta.
 *
 * `excluir` deja fuera la que se está viendo: salir en su propia lista invita a «recuperar» lo que
 * ya tienes delante.
 */
export async function listOpenChecks(client: ErploraClientLike, excluir?: string): Promise<OpenCheck[]> {
  try {
    const r = rows<Record<string, unknown>>(await client.query('sales.orders.list'));
    return r
      .filter((o) => o.status === 'open' && String(o.id) !== excluir)
      .map((o) => ({
        id: String(o.id),
        total: Number(o.provisional_total) || 0,
        created_at: String(o.created_at ?? ''),
        label: o.label ? String(o.label) : undefined,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
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

/** El contexto de unidades congelado, tal y como viaja en los payloads (solo claves presentes). */
export function unitContextPayload(l: CartLine): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  if (l.unit_code) ctx.unit_code = l.unit_code;
  if (l.unit_name) ctx.unit_name = l.unit_name;
  if (l.factor_num) ctx.factor_num = l.factor_num;
  if (l.factor_den) ctx.factor_den = l.factor_den;
  if (l.increment_value) ctx.increment_value = l.increment_value;
  if (l.price_quantity_value) ctx.price_quantity_value = l.price_quantity_value;
  if (l.pricing_unit_code) ctx.pricing_unit_code = l.pricing_unit_code;
  if (l.pricing_unit_name) ctx.pricing_unit_name = l.pricing_unit_name;
  if (l.pricing_factor_num) ctx.pricing_factor_num = l.pricing_factor_num;
  if (l.pricing_factor_den) ctx.pricing_factor_den = l.pricing_factor_den;
  return ctx;
}

function toItemPayload(l: CartLine): Record<string, unknown> {
  return {
    product_id: l.id || null,
    product_name: l.name,
    product_sku: l.sku ?? '',
    price: l.price,
    quantity: toMicro(l.qty), // punto fijo 10⁶ (ADR-0147)
    is_gift: !!l.is_gift,
    gift_reason: l.gift_reason ?? '',
    // sales#89: viaja también al ABRIR el pedido, no solo al añadir línea suelta.
    is_service: !!l.is_service,
    tax_category_key: l.tax_category_key ?? '',
    cost: l.cost ?? 0,
    ...unitContextPayload(l),
  };
}

/** Abre un pedido MUTABLE con sus primeras líneas. Devuelve el `order_id` que generó el runtime.
 *  `label` (opcional): etiqueta OPACA de la cuenta («Mesa 4») — si ya se sabe, el pedido nace
 *  etiquetado y la lista de cuentas abiertas lo muestra bien desde el primer segundo. */
export async function openOrderWithLines(client: ErploraClientLike, lines: CartLine[], label?: string): Promise<string> {
  const payload: Record<string, unknown> = { items: lines.map(toItemPayload) };
  if (label?.trim()) payload.label = label.trim();
  const res = await client.command('sales.order.open', payload);
  return firstNewId(res);
}

/** El payload de una línea de pedido. Compartido por las DOS puertas (`add_line` y
 *  `add_open_line`): mismo efecto en la fila, distinto permiso. El nombre del comando NO se
 *  parametriza — ADR-0127 exige literal en la llamada para poder analizar la superficie consumida. */
function orderLinePayload(orderId: string, l: CartLine): Record<string, unknown> {
  return {
    order_id: orderId,
    product_id: l.id || null,
    product_name: l.name,
    product_sku: l.sku ?? '',
    quantity: toMicro(l.qty), // punto fijo 10⁶ (ADR-0147)
    unit_price: l.price,
    is_gift: !!l.is_gift,
    gift_reason: l.gift_reason ?? '',
    // sales#89: el pedido recuerda que la línea es un SERVICIO. Sin esto el flag se perdía al
    // materializar la línea (ADR-0141) y una cuenta RETOMADA cobraba el corte como producto.
    is_service: !!l.is_service,
    tax_category_key: l.tax_category_key ?? '',
    cost: l.cost ?? 0,
    line_total: provisionalLineTotal(l.price, l.qty, l.is_gift),
    ...unitContextPayload(l),
  };
}

/** Añade una línea de PRECIO LIBRE (sales#63). Mismo efecto que `addOrderLine`, pero por un comando
 *  propio: el runtime gatea por COMANDO, así que es el permiso `sales.sell_open_price` el que decide.
 *  Sin él, el dispatcher contesta `requires_elevation` y el shell pide el PIN del encargado
 *  (ADR-0238) — el comportamiento por defecto de Toast, Shopify y Vagaro. */
export async function addOpenPriceLine(client: ErploraClientLike, orderId: string, l: CartLine): Promise<string> {
  const res = await client.command('sales.order.add_open_line', orderLinePayload(orderId, l));
  return firstNewId(res);
}

/** Añade una línea al pedido AHORA (fila real, sin debounce). Devuelve su `line_id`. */
export async function addOrderLine(client: ErploraClientLike, orderId: string, l: CartLine): Promise<string> {
  const res = await client.command('sales.order.add_line', orderLinePayload(orderId, l));
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
    order_id: orderId, line_id: lineId, quantity: toMicro(qty), // punto fijo 10⁶ (ADR-0147)
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
      // La fila trae punto fijo 10⁶ (ADR-0147); la UI trabaja en lógico. Cerrar y reabrir el
      // pedido debe seguir mostrando 0,5 kg — no 500000 ni 1.
      qty: fromMicro(Number(x.quantity) || 1_000_000),
      is_gift: x.is_gift === 1 || x.is_gift === true ? true : undefined,
      gift_reason: x.gift_reason ? String(x.gift_reason) : undefined,
      // Autoridad del IVA en servidor (ADR-0085) y coste para el arqueo de invitaciones: se
      // recuperan para que un pedido REANUDADO cobre con el mismo IVA que si no se hubiera recargado.
      tax_category_key: x.tax_category_key ? String(x.tax_category_key) : undefined,
      cost: Number(x.cost) || undefined,
      // sales#89: servicio o producto. Una fila ANTERIOR a la columna no trae nada y vuelve como
      // producto — que es lo que era; marcarla de servicio haría que inventory le saltara el stock.
      is_service: x.is_service === 1 || x.is_service === true ? true : undefined,
      // Contexto de unidades CONGELADO (ADR-0147 §2.4): vuelve con la línea para que el pedido
      // reanudado valide la misma rejilla y cobre con el mismo contexto.
      unit_code: x.unit_code ? String(x.unit_code) : undefined,
      unit_name: x.unit_name ? String(x.unit_name) : undefined,
      factor_num: Number(x.factor_num) || undefined,
      factor_den: Number(x.factor_den) || undefined,
      increment_value: Number(x.increment_value) || undefined,
      price_quantity_value: Number(x.price_quantity_value) || undefined,
      pricing_unit_code: x.pricing_unit_code ? String(x.pricing_unit_code) : undefined,
      pricing_unit_name: x.pricing_unit_name ? String(x.pricing_unit_name) : undefined,
      pricing_factor_num: Number(x.pricing_factor_num) || undefined,
      pricing_factor_den: Number(x.pricing_factor_den) || undefined,
      // Tandas (2026-07-19): la ronda vuelve con la línea para que un pedido REANUDADO siga
      // sabiendo qué salió ya a cocina (y no lo re-envíe ni lo deje editar).
      round_no: Number(x.round_no) || undefined,
      fired_at: x.fired_at ? String(x.fired_at) : undefined,
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
 * Un solo comando: la transacción la cierra el SERVIDOR (sales#61). Antes esto era un bucle aquí
 * —leer las líneas del origen, re-añadirlas una a una, anular— y traía tres males: se caía a la
 * mitad y la cuenta quedaba partida en dos, el mismo clic dos veces la duplicaba, y re-añadir una
 * línea la creaba NUEVA (sin `fired_at`), así que lo ya enviado volvía a cocina.
 *
 * TRANSFERIR no pasa por aquí — ahí no se mueve nada, solo cambia a qué mesa apunta el mismo pedido
 * (lo hace la junction en `tables`), por eso los productos se conservan solos.
 */
export async function mergeOrders(client: ErploraClientLike, fromOrderId: string, toOrderId: string): Promise<void> {
  if (!fromOrderId || !toOrderId || fromOrderId === toOrderId) return;
  await client.command('sales.order.merge', { from_order_id: fromOrderId, to_order_id: toOrderId });
}

/**
 * DIVIDIR la cuenta (sales#61): abre un SEGUNDO pedido con las líneas marcadas y devuelve su id.
 *
 * `tables` ya abrió la segunda cuenta de sala y la dejó sin pedido a propósito (tables#12): las
 * líneas y los importes son de `sales`. Sin `lineIds` la cuenta nueva nace en blanco, que es una
 * petición legítima («ábreme la segunda y voy pasando»).
 *
 * También un solo comando, por lo mismo que fusionar: mover N líneas con N peticiones no es
 * atómico. El servidor mueve las filas —importe, categoría fiscal y estado de cocina intactos— y
 * recompone los dos totales desde sus líneas vivas, así que las dos mitades suman el original.
 */
export async function splitOrder(
  client: ErploraClientLike, orderId: string, lineIds: Iterable<string>, label: string,
): Promise<string> {
  if (!orderId) return '';
  const res = await client.command('sales.order.split', {
    order_id: orderId,
    line_ids: [...lineIds],
    label: label ?? '',
  });
  return firstNewId(res);
}
