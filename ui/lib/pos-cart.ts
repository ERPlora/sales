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

/** Una elección dentro de un menú. Solo `option_id` decide dinero (lo resuelve el servidor contra
 *  `combos.options.all`); `product_name` y `category_id` son DISPLAY y ROUTING de cocina. */
export interface ComboChoice {
  option_id: string;
  product_name?: string;
  category_id?: string | null;
}

export interface CartLine {
  id: string;
  name: string;
  /** pm#93 — suplementos elegidos, EN EL ORDEN en que se eligieron. Solo el `option_id` VIAJA: el
   *  precio y el nombre definitivos los pone el catálogo del servidor al cobrar, nunca el navegador.
   *
   *  sales#208 — `price_delta` (céntimos POR UNIDAD) es DISPLAY: lo que la pantalla necesita para
   *  pintar la línea por lo que se va a cobrar. Sale del catálogo que enseñó el selector, o del
   *  snapshot que el SERVIDOR congeló en la fila al PEDIR (sales#200), que es el que manda al
   *  retomar una cuenta. Nunca entra en un payload: un delta del navegador sería un descuento que
   *  se hace el cliente solo (sales#68). Ausente = elección gratuita, o una fila escrita antes de
   *  que el delta se congelara — y esas las sigue preciando el servidor contra el catálogo. */
  modifiers?: { option_id: string; price_delta?: number }[];
  /** sales#153 / ADR-0381 — esta línea ES un combo (menú, pack). El servidor la arma entera al
   *  cobrar: lee `combos.options.all`, valida los grupos y decide cuántas líneas hermanas salen.
   *  `price` es un PREVIEW de pantalla y el servidor lo ignora. */
  combo_id?: string;
  /** Lo elegido en cada grupo, EN EL ORDEN de elección (el que lee cocina). Solo `option_id` decide
   *  dinero; `product_name` y `category_id` viajan para DISPLAY y para que el KDS enrute cada
   *  componente a SU estación — el fallo de TouchBistro que ADR-0381 nombra. */
  combo_choices?: ComboChoice[];
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
  /** CATEGORÍA del producto (`inventory.product_categories` / `services.categories`), congelada en la
   *  línea (sales#12): es lo que enruta la comanda en `kitchen` (categoría→estación) y tiene que
   *  sobrevivir a retomar la cuenta y a que alguien recategorice el producto. Opaca para `sales`.
   *  Ausente = sin clasificar (precio libre). */
  category_id?: string;
  /** DESCUENTO MANUAL de la línea, en % (0–100), sales#71. El servidor lo aplica y lo prorratea
   *  antes de extraer el IVA (`items[].discount`); aquí solo se persiste con la línea del pedido
   *  (sobrevive a retomar la cuenta) y se pinta. Ausente = sin descuento. */
  discount?: number;
  /** SERVICIO (sales#89): la línea no sale del catálogo de `inventory` — su precio es el que manda
   *  y no descuenta stock. Viaja hasta `complete_sale` y de ahí a `sale.completed`, donde
   *  `inventory` la salta. Persistida en el pedido para sobrevivir al RETOMAR la cuenta. */
  is_service?: boolean;
  /** INVITACIÓN/REGALO (comp): la línea no se cobra (net/tax/total=0) pero descuenta stock. */
  is_gift?: boolean;
  /** Motivo de la invitación (cortesía/error cocina/fidelización…). */
  gift_reason?: string;
  /** sales#156 — the line's free-text NOTE ("medium rare", "shellfish allergy", "no ice").
   *  PRODUCTION text: the cook reads it at the pass and `sales` interprets none of it. Persisted on
   *  the order row (`sales_order_item.notes`) so it survives resuming the check, splitting it and
   *  transferring it, exactly like the supplements. Absent = no note, which is what every line
   *  written before the column carries. */
  note?: string;
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
  /** EVERY row of an OPTIONAL integration (ADR-0127, sales#186): `queryAll` plus `queryOptional`'s
   *  tolerance. `undefined` ONLY when the owner module is not installed; a broken contract against
   *  a module that IS there still explodes. Without this there was no way to ask a module that may
   *  be missing for the whole set: `queryOptional` answers ONE PAGE and truncated in silence. */
  queryAllOptional<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T[] | undefined>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  /** Media autenticada por el shell; opcional para que un Hub anterior degrade a iniciales. */
  fetchMediaBlob?(ref: string, opts?: { signal?: AbortSignal }): Promise<Blob | null>;
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


/** La huella de los suplementos de una línea: los `option_id` EN SU ORDEN, tal cual.
 *
 *  El orden cuenta a propósito. Cocina lee la comanda en el orden en que se eligió —es la petición
 *  recurrente en los foros de Square, porque el orden de catálogo no sirve en el pase—, así que dos
 *  líneas con las mismas opciones en distinto orden imprimen distinto y no son la misma unidad. */
/** Lee la columna `modifiers` de una fila de pedido. Defensivo a propósito: una fila escrita antes
 *  de que existiera la columna, o media escrita, NO puede dejar al camarero sin poder abrir su
 *  mesa. Se pierde el suplemento de esa línea; nunca la cuenta entera.
 *
 *  sales#208 — vuelve también el `price_delta` que el SERVIDOR congeló al pedir (sales#200), que es
 *  con lo que la pantalla pinta la línea de una cuenta RETOMADA. Tiene que ser el congelado y no el
 *  del catálogo de hoy: subir el «+ queso» por la tarde repreciaría en pantalla las mesas de
 *  mediodía, que es justo lo que ese snapshot quitó al cobrar. Una fila ANTERIOR al snapshot no lo
 *  trae y no se inventa: esas las sigue preciando el servidor contra el catálogo. */
function parseModifiers(raw: unknown): { option_id: string; price_delta?: number }[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return undefined;
    const out = v
      .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : {}))
      .filter((m) => String(m.option_id ?? ''))
      .map((m) => ({
        option_id: String(m.option_id),
        ...(typeof m.price_delta === 'number' && Number.isFinite(m.price_delta)
          ? { price_delta: m.price_delta }
          : {}),
      }));
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** sales#169 — la COMPOSICIÓN de un menú tal y como la fila del pedido la guarda: qué combo y qué
 *  se eligió, EN SU ORDEN. Defensivo por el mismo motivo que `parseModifiers`: una fila escrita
 *  antes de que existiera la columna, o media escrita, NO puede dejar al camarero sin poder abrir
 *  su mesa. Se pierde el menú de esa línea; nunca la cuenta entera. */
function parseCombo(raw: unknown): { combo_id: string; combo_choices: ComboChoice[] } | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const v = JSON.parse(raw) as { combo_id?: unknown; combo_choices?: unknown };
    if (!v || typeof v !== 'object') return undefined;
    const combo_id = String(v.combo_id ?? '');
    if (!combo_id) return undefined;
    const raws = Array.isArray(v.combo_choices) ? v.combo_choices : [];
    const combo_choices: ComboChoice[] = raws
      .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
      .filter((c) => String(c.option_id ?? ''))
      .map((c) => ({
        option_id: String(c.option_id),
        // DISPLAY y ROUTING: sin el nombre no se pinta el componente, y sin la categoría el KDS
        // no sabe a qué estación mandarlo al RETOMAR la cuenta (ADR-0381).
        product_name: c.product_name ? String(c.product_name) : undefined,
        category_id: c.category_id ? String(c.category_id) : null,
      }));
    return { combo_id, combo_choices };
  } catch {
    return undefined;
  }
}

/** La composición serializada para la columna TEXT de la fila del pedido. Sin dinero: el precio
 *  cerrado y el reparto los decide el servidor AL COBRAR contra `combos.options.all`. `'{}'` en una
 *  línea normal, que es lo que dice la columna por defecto. */
function comboColumn(l: CartLine): string {
  if (!l.combo_id) return '{}';
  return JSON.stringify({
    combo_id: l.combo_id,
    combo_choices: (l.combo_choices ?? []).map((c) => ({
      option_id: c.option_id,
      product_name: c.product_name ?? '',
      category_id: c.category_id ?? null,
    })),
  });
}

/** Lo que viaja a un comando CON handler (`sales.order.open`, `sales.complete_sale`): objeto, no
 *  texto. Solo `option_id` decide dinero; el resto es display y routing. */
function comboPayload(l: CartLine): Record<string, unknown> {
  if (!l.combo_id) return {};
  return {
    combo_id: l.combo_id,
    combo_choices: (l.combo_choices ?? []).map((c) => ({
      option_id: c.option_id,
      product_name: c.product_name ?? '',
      category_id: c.category_id ?? null,
    })),
  };
}

/** sales#208 — y su DELTA, por el mismo motivo por el que `price` entra en la identidad
 *  (sales#175): el mismo «+ queso» congelado a 3,00 € en una mesa y a 5,00 € en otra no es la misma
 *  unidad de cobro, y fusionarlas cobraría las dos al delta que sobreviviera. Sin delta congelado
 *  la huella es la de siempre, así que nada cambia para el 99 % de las líneas. */
function modifierFingerprint(l: CartLine): string {
  return (l.modifiers ?? [])
    .map((m) => (m.price_delta ? `${m.option_id}\u0002${m.price_delta}` : m.option_id))
    .join('\u0000');
}

/** sales#153 — la COMPOSICIÓN de un menú, con su orden. Vacío cuando la línea no es un combo, así
 *  que una línea normal conserva exactamente la identidad de siempre. */
function comboFingerprint(l: CartLine): string {
  if (!l.combo_id) return '';
  return `${l.combo_id}\u0001${(l.combo_choices ?? []).map((c) => c.option_id).join('\u0000')}`;
}

/** Dos líneas son "la misma" (fusionables) si coinciden producto, precio, categoría/tipo fiscal,
 *  condición de invitación, sku y SUPLEMENTOS. Una invitación (comp) NO se fusiona con una línea
 *  normal, ni el mismo producto a distinto precio: son unidades de cobro distintas.
 *
 *  pm#93: los suplementos entran en la identidad. Antes no vivían en la línea del carrito («se
 *  resuelven al vender») y por eso quedaban fuera; con el selector del TPV la elección se hace al
 *  AÑADIR. Sin esto, una hamburguesa «sin cebolla» se fusiona con una normal y cocina recibe
 *  «2 × Hamburguesa» — una de ellas mal, y sin forma de saber cuál. */
function sameCartLine(a: CartLine, b: CartLine): boolean {
  return a.id === b.id
    && a.price === b.price
    && a.sku === b.sku
    && a.tax_category_key === b.tax_category_key
    && a.tax_rate === b.tax_rate
    && !!a.is_gift === !!b.is_gift
    && a.gift_reason === b.gift_reason
    // sales#156: the NOTE enters the identity for the same reason the supplements did — without
    // it, "medium rare" and "well done" merge into "2 x Steak" and the kitchen gets one of the two
    // wrong with no way of telling which. No note and an empty note are the same thing: the waiter
    // never touched the field, and splitting the line over that would be a defect, not precision.
    && (a.note ?? '') === (b.note ?? '')
    && modifierFingerprint(a) === modifierFingerprint(b)
    // sales#153: dos menús con primeros distintos son dos líneas. Sin esto se fusionarían en
    // «2 × Menú del día» y cocina recibiría dos veces el mismo plato, uno de ellos mal.
    && comboFingerprint(a) === comboFingerprint(b);
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
  /** sales#71: descuento de TICKET (%) que la cuenta lleva puesto; vuelve al retomarla. */
  discount?: number;
  /** sales#113: importe FIJO (céntimos) de descuento del ticket; vuelve al retomarla. */
  discount_amount?: number;
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
        discount: Number(o.discount_percent) > 0 ? Number(o.discount_percent) : undefined,
        discount_amount: Number(o.discount_amount) > 0 ? Number(o.discount_amount) : undefined,
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
 *  cuota HALF_UP + el desglose por tipo los congela el servidor al COBRAR.
 *
 *  sales#208 — el suplemento entra por el PRECIO UNITARIO, igual que en el servidor
 *  (`unit_price + modifier_delta`): un solo redondeo y una sola aritmética. Es lo que el SQL
 *  `order_recompute_total.sql` suma en el `provisional_total` de la cuenta abierta, así que sin
 *  esto la lista de cuentas abiertas enseñaba menos de lo que se iba a cobrar. */
function provisionalLineTotal(
  unitPrice: number, qty: number, isGift?: boolean, discount = 0, modifierDelta = 0,
): number {
  return isGift ? 0 : roundHalfUp((unitPrice + modifierDelta) * qty * (1 - discount / 100));
}

/** HALF_UP sobre céntimos, inmune al ruido de coma flotante (2,4999999… es 2,5). */
function roundHalfUp(x: number): number {
  return Math.round(x + 1e-9);
}

/** sales#208 — lo que suman los SUPLEMENTOS de la línea, por unidad y en céntimos.
 *
 *  Es dinero de PANTALLA: el servidor lo resuelve otra vez contra el catálogo (venta de mostrador)
 *  o contra el snapshot congelado de la fila (cuenta retomada, sales#200), y su cifra es la que se
 *  cobra. Aquí solo evita que la pantalla enseñe un número y el cajón cobre otro. */
export function modifierDelta(l: CartLine): number {
  return (l.modifiers ?? []).reduce((s, m) => s + (Number(m.price_delta) || 0), 0);
}

/** El precio unitario que se PINTA: el de catálogo más lo que suman sus suplementos.
 *
 *  Es el mismo que acaba en el tique — el cobro mete el delta por el precio unitario de la línea
 *  (`unit_price + modifier_delta`, handler/src/lib.rs), y por eso el papel no imprime un importe al
 *  lado de cada suplemento (sales#148). `l.price` a secas sigue siendo la BASE, y es lo único que
 *  viaja en los payloads. */
export function unitPriceWithModifiers(l: CartLine): number {
  return l.price + modifierDelta(l);
}

/** sales#71 — importe PREVIEW de una línea (céntimos): precio × cantidad × (1 − línea %) ×
 *  (1 − ticket %), UN solo redondeo HALF_UP — exactamente como el servidor compone el descuento
 *  global con el de la línea (`complete_sale`), para que «Cobrar 9,50 €» sea la cifra del tique.
 *  Una invitación es 0. La autoridad sigue siendo el servidor (ADR-0085).
 *
 *  sales#208 — «precio» aquí incluye los suplementos elegidos: una hamburguesa de 9,00 € con
 *  «+ queso 3,00 €» vale 12,00 €, que es lo que se cobra. Antes la línea pintaba la base y el
 *  cliente leía 9,00 € en la cuenta que se le llevaba a la mesa. */
export function lineAmount(l: CartLine, ticketDiscount = 0): number {
  if (l.is_gift) return 0;
  return roundHalfUp(
    unitPriceWithModifiers(l) * l.qty * (1 - (l.discount ?? 0) / 100) * (1 - ticketDiscount / 100),
  );
}

/** Total PREVIEW del carrito con los descuentos aplicados (sales#71). */
export function cartTotal(cart: CartLine[], ticketDiscount = 0): number {
  return cart.reduce((s, l) => s + lineAmount(l, ticketDiscount), 0);
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
    // sales#12: la categoría se congela en la línea del pedido (routing de cocina).
    category_id: l.category_id ?? null,
    // sales#71: descuento manual de la línea, en %.
    discount: l.discount ?? 0,
    // sales#156: the free-text note. Always present (empty string = no note) so the shape of the
    // payload does not depend on whether the waiter typed anything.
    notes: l.note ?? '',
    // pm#93: solo los ids, en su orden. El importe lo resuelve el servidor contra
    // `modifiers.options.all` — el navegador no es autoridad del precio de un suplemento.
    modifiers: (l.modifiers ?? []).map((m) => ({ option_id: m.option_id })),
    // sales#169: y la COMPOSICIÓN del menú, por el mismo motivo. Es la puerta por la que entra la
    // PRIMERA línea de toda cuenta: sin esto, abrir la mesa CON el menú lo perdía igual que
    // retomarla. El precio sigue siendo el del servidor.
    ...comboPayload(l),
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
    // sales#12: la categoría se congela en la línea del pedido (routing de cocina).
    category_id: l.category_id ?? null,
    // sales#71: descuento manual de la línea (%), persistido con ella.
    discount_percent: l.discount ?? 0,
    // sales#156: the line's free-text note, persisted with it.
    notes: l.note ?? '',
    // pm#93: `order.add_line` es DECLARATIVO — el payload bindea a una columna TEXT, así que viaja
    // serializado. Solo los ids: el nombre y el precio definitivos los resuelve el cobro contra
    // `modifiers.options.all`. Esta fila es de trabajo, como su `line_total` provisional.
    modifiers: JSON.stringify((l.modifiers ?? []).map((m) => ({ option_id: m.option_id }))),
    // sales#169: la composición del menú, serializada igual y con el mismo criterio. `'{}'` cuando
    // la línea no es un menú — y entonces el SQL deja `combo_group_ref` en NULL, así que una línea
    // normal no cambia en nada. El grupo NO se manda: lo minta el servidor con el id de la fila.
    combo: comboColumn(l),
    line_total: provisionalLineTotal(l.price, l.qty, l.is_gift, l.discount ?? 0, modifierDelta(l)),
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
  await updateOrderLineQty(
    client, orderId, lineId, qty, line.price, line.is_gift, line.gift_reason,
    line.discount ?? 0, line.modifiers,
  );
  return true;
}

export async function updateOrderLineQty(
  client: ErploraClientLike, orderId: string, lineId: string, qty: number, unitPrice: number,
  isGift?: boolean, giftReason?: string, discount = 0,
  /** sales#208 — los suplementos de la línea: sin ellos el stepper reescribía el `line_total` a la
   *  base y la cuenta abierta perdía el suplemento cada vez que alguien tocaba la cantidad. */
  modifiers?: { option_id: string; price_delta?: number }[],
): Promise<void> {
  await client.command('sales.order.update_line', {
    order_id: orderId, line_id: lineId, quantity: toMicro(qty), // punto fijo 10⁶ (ADR-0147)
    line_total: provisionalLineTotal(unitPrice, qty, isGift, discount, modifierDelta({ modifiers } as CartLine)),
    // Alternar invitación cambia el importe: viaja junto para que la fila quede coherente.
    is_gift: isGift === undefined ? null : (isGift ? 1 : 0),
    gift_reason: giftReason ?? null,
  });
}

/** sales#71 — cambia el DESCUENTO (%) de una línea del pedido y su total provisional. */
export async function updateOrderLineDiscount(
  client: ErploraClientLike, orderId: string, line: CartLine, discount: number,
): Promise<void> {
  if (!line.line_id) return;
  await client.command('sales.order.update_line', {
    order_id: orderId, line_id: line.line_id, quantity: toMicro(line.qty),
    line_total: provisionalLineTotal(line.price, line.qty, line.is_gift, discount, modifierDelta(line)),
    discount_percent: discount,
    is_gift: null, gift_reason: null,
  });
}

/** sales#156 — changes the free-text NOTE of an order line.
 *
 * It goes through the same `update_line` as the quantity and the discount, which is why it sends
 * the quantity and total the line ALREADY has: the statement always writes them, so omitting them
 * would rewrite the row to a quantity nobody asked for. Every other field travels as `null` so the
 * SQL's `COALESCE` leaves it alone.
 *
 * Without a `line_id` there is no row to address and NOTHING is written: inventing the write would
 * send it against whatever row the server guessed — or against none, in silence. */
export async function updateOrderLineNote(
  client: ErploraClientLike, orderId: string, line: CartLine, note: string,
): Promise<void> {
  if (!line.line_id) return;
  await client.command('sales.order.update_line', {
    order_id: orderId, line_id: line.line_id, quantity: toMicro(line.qty),
    line_total: provisionalLineTotal(line.price, line.qty, line.is_gift, line.discount ?? 0, modifierDelta(line)),
    notes: note,
    is_gift: null, gift_reason: null,
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
      // sales#12: la categoría congelada vuelve con la línea (routing de cocina al retomar).
      category_id: x.category_id ? String(x.category_id) : undefined,
      // sales#71: el descuento de la línea vuelve al retomar la cuenta.
      discount: Number(x.discount_percent) > 0 ? Number(x.discount_percent) : undefined,
      // sales#156: the note comes back with the line. `undefined` and NOT '' when there is none:
      // the line then looks identical to those of every check opened before the column, and
      // nothing paints an empty sub-line under it.
      note: x.notes ? String(x.notes) : undefined,
      // pm#93: los suplementos vuelven con la línea. Una fila ANTERIOR a la columna, o un JSON
      // corrupto, devuelven `undefined` — se pierde el suplemento de esa línea, nunca la comanda.
      modifiers: parseModifiers(x.modifiers),
      // sales#169: el MENÚ vuelve con la línea. Sin esto la línea retomada solo conserva el
      // `combo_id` metido en `product_id`, el cobro la toma por una línea de catálogo y RECHAZA la
      // venta entera (`sales.product_not_available`): la mesa no puede pagar.
      ...parseCombo(x.combo),
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
