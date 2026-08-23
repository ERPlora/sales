import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import { bindTabbar } from '@erplora/outfitkit/tabbar';
// La frontera EUROS ↔ CÉNTIMOS vive en el SDK (ADR-0123), no copiada en cada WC (como el desktop).
import { eurosToCents, centsToEuros } from '@erplora/module-sdk';
import { renderDocumentModal } from '../../lib/document-modal.js';
import { orderToPrebill, receiptLabels } from '../../lib/document-mappers.js';
// La CUENTA se imprime con la forma que lee el renderizador ESC/POS, no con la de la pantalla
// (sales#78): son dos documentos con el mismo contenido y distintas claves.
import { prebillToPrintDocument, prebillJobId } from '../../lib/print-document.js';
import type { PrintedModifier } from '../../lib/paper-modifiers.js';
import { receiptToPrintableHtml, printHtmlInIframe } from '../../lib/receipt-html.js';
import { decideOnTableChange } from '../../lib/table-switch.js';
import { defaultParkLabel } from '../../lib/park-label.js';
import { pendingLines, nextRoundNo, isLineLocked } from '../../lib/rounds.js';
import { buildFirePayload } from '../../lib/fire-order.js';
import { createSerialQueue } from '../../lib/serial-queue.js';
import { splitPayload, splitTotal } from '../../lib/split-selection.js';
// hub#297 — el techo de la simplificada. La REGLA vive en lib (probada sin DOM); aquí solo se
// pregunta. El techo NO está escrito en este módulo: llega como dato de `hub.fiscal.limits`.
import { isOverSimplifiedLimit, ticketIsBlocked, recipientIsComplete } from '../../lib/simplified-limit.js';
import { forgetCurrentCheck, rememberCurrentCheck, resolveCurrentCheck } from '../../lib/current-check.js';
import { brandSvgFor } from '../../lib/brand-icons.js';
import { priceLabel } from '../../lib/price-label.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { payMethodIcon, needsTendered, enabledPayMethods, defaultPayMethod, payMethodDisplayName } from '../../lib/pay-icons.js';
// The bill is painted by ok-receipt HERE, so it is registered here. It used to arrive only
// transitively (document-modal → erp-sales-document), i.e. by accident: dropping that unrelated
// import would have left `<ok-receipt>` an unknown element and the bill blank again.
import '@erplora/outfitkit/ok-receipt';
import '@erplora/outfitkit/ok-qty-stepper';
import '@erplora/outfitkit/ok-spotlight-search';
import '@erplora/outfitkit/ok-empty-state';
import '@erplora/outfitkit/ok-status-pill';
import {
  mergeCartLines, listOpenChecks, type OpenCheck,
  // ADR-0141: el carrito lo respalda un PEDIDO real (filas), no un blob con debounce.
  openOrderWithLines, addOrderLine, addOpenPriceLine, updateOrderLineQty, updateOrderLineDiscount, persistLineQty, removeOrderLine, loadOrderLines, mergeOrders, splitOrder,
  unitContextPayload, lineAmount, cartTotal, type CartLine, type ErploraClientLike,
} from '../../lib/pos-cart.js';
import { loadTaxCatalog, productSellability, resolveLineTax, type TaxCatalog } from '../../lib/pos-tax.js';
import { buildOpenPriceLine } from '../../lib/pos-open-price.js';
// La frontera de la ESCALA de cantidades (ADR-0147): la UI trabaja en lógico (0,5), el cable en 10⁶.
import { toMicro, fromMicro, onGrid, formatQuantity } from '../../lib/quantity.js';
import { checkoutErrorKey, newIdempotencyKey } from '../../lib/checkout-key.js';
// sales#81: el transporte del SDK filtra el HTML del 502 del proxy como un SyntaxError crudo
// («<!DOCTYPE … is not valid JSON»). Esta es la frontera del módulo: traducirlo a un mensaje de
// negocio para el cajero (la guarda `res.ok` del SDK se persigue aparte, en el hub).
import { transportErrorKey, SERVER_UNAVAILABLE_KEY } from '../../lib/transport-error.js';
import { recoverCheckout } from '../../lib/checkout-recovery.js';
import { MediaPhotoCache } from '../../lib/media-photo-cache.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-pos-touch — pantalla de venta TÁCTIL. A la izquierda conserva el catálogo del Hub con un
// segmento horizontal de categorías y tarjetas de producto; a la derecha, la cuenta. Los módulos
// externos añaden sus controles por slots (mesa/cliente/cocina), sin imports ni dependencias desde
// sales. En móvil la cuenta se recoge a un drawer. Quitar línea = cantidad a 0. Al cobrar:
// `sales.complete_sale` (channel='pos') → documento.

/** Fila de `services.services.list` (sales#89). Es la superficie vendible del módulo `services`;
 *  `sales` solo lee lo que necesita para cobrar: qué es, cuánto vale y con qué IVA. */
interface ServiceRow {
  id: string; name: string; price?: number; pricing_type?: string;
  category_id?: string; tax_category_key?: string;
}
/** Categoría de servicio (`services.categories.list`) — se muestra como una pestaña más. */
interface ServiceCat { id: string; name: string; }

/** Fila de `appointments.appointments.get` (ADR-0077). `sales` lee SOLO lo que necesita para
 *  armar la línea y atribuir la venta; el resto del dominio de citas no le incumbe. */
interface AppointmentRow {
  id?: string; customer_id?: string; customer_name?: string; staff_id?: string;
  service_id?: string; service_name?: string; service_price?: number;
}

/** Formas de precio que el TPV sabe cobrar HOY. `from`/`hourly`/`variable` son un precio de
 *  PARTIDA, no el precio: cobrarlos tal cual sería equivocarse en silencio, y aún no hay flujo de
 *  precio abierto. Se pintan bloqueados con su motivo (misma puerta que sales#74). */
const CLOSED_PRICING = new Set(['fixed', 'free', '']);

interface Product {
  id: string; name: string; sku?: string; price: number; cost?: number; is_active?: number;
  product_type?: string; image?: string; tax_category_key?: string;
  /** SERVICIO (sales#89): no sale del catálogo de `inventory`, no descuenta stock. Viaja hasta
   *  `complete_sale` para que el handler no lo mida contra el catálogo de productos. */
  is_service?: boolean;
  /** `pricing_type` del servicio de origen; ausente en un producto de inventario. */
  pricing_type?: string;
  // ADR-0147: unidad base + cantidad de precio del maestro (inventory/006). El POS los CONGELA
  // en la línea al añadirla — el histórico nunca relee el maestro.
  unit_code?: string; price_quantity_value?: number; pricing_unit_code?: string;
}
/** Fila de `inventory.units.list` (registro de unidades, ADR-0147). */
interface UnitRow { code: string; name?: string; increment_value?: number; factor_num?: number; factor_den?: number; }
interface PayMethod {
  id: string; name: string; type?: string;
  /** 1 = pide importe entregado y calcula cambio (efectivo); 0 = importe exacto (tarjeta, Bizum…). */
  requires_change?: number;
}
interface PosSettings {
  default_document_format?: string; currency?: string; enable_parked_tickets?: number;
  default_tax_included?: number;
  /** Formas de pago permitidas (Ajustes). 0 = desactivada. */
  allow_cash?: number; allow_card?: number; allow_transfer?: number;
  /** sales#71: descuentos manuales permitidos (Ajustes). 0 = sin botón; el servidor lo revalida. */
  allow_discounts?: number;
}
interface Category { id: string; name: string; icon?: string; color?: string; image?: string; product_count?: number; }
interface ProdCat { product_id: string; category_id: string; }
/** Categoría fiscal (`taxes.categories.list`, ADR-0085) = el "departamento" de la venta por precio
 *  libre: lleva su IVA (el % lo resuelve el servidor; el ratesMap solo es preview).
 *
 * `display_name` es el nombre YA TRADUCIDO al idioma de quien pregunta (taxes#38): el canónico
 * `name` es inglés del seed («Product — generic») y sales no puede traducirlo él — el catálogo
 * i18n de otro módulo no se importa (ADR-0043), la query es la única puerta. Sin `display_name`
 * (un taxes más viejo) se degrada al nombre crudo. */
interface TaxCategory { key: string; name: string; display_name?: string; is_active?: number; }

/** El nombre que se PINTA y se CONGELA de un departamento: el idioma del hub si taxes lo dio. */
function deptDisplayName(c: TaxCategory): string {
  return c.display_name || c.name;
}

/** Acumulador de dígitos del numpad (euros como texto): 'C' limpia, un solo separador decimal, tope
 *  9 chars. Puro para poder compartirlo entre el numpad de COBRO y el de PRECIO LIBRE sin duplicar. */
function pushDigit(cur: string, k: string): string {
  if (k === 'C') return '';
  if (k === '.' && cur.includes('.')) return cur;
  return (cur + k).slice(0, 9);
}
interface IonicAlertElement extends HTMLElement {
  header: string;
  message: string;
  buttons: Array<{ text: string; role: string }>;
  isOpen: boolean;
  present?: () => Promise<void>;
  dismiss?: () => Promise<boolean>;
}

/** Lo que contesta la puerta de impresión del shell (`apps/web/src/lib/print.ts`). `bridge` salió
 *  por una impresora, `queue` espera a un host que la drene; el resto NO ha salido papel. */
interface PrintOutcome {
  via?: string;
  error?: string;
}

/** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
interface I18nClient {
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

/** Lectura OPCIONAL a un módulo que puede no estar instalado (ADR-0127): `undefined` = no está,
 *  y el TPV sigue funcionando sin él.
 *
 *  Envuelve `queryOptional` en vez de llamarlo a pelo porque el TPV es la pantalla que NO puede
 *  romperse: un shell antiguo sin ese método haría estallar el `connectedCallback` entero —
 *  sin rejilla, sin carrito y sin slots— por una integración accesoria. Aquí ausencia y fallo se
 *  responden igual: no hay catálogo extra que ofrecer, se cobra lo de siempre. */
async function optionalRead(read: (c: ErploraClientLike) => Promise<unknown>): Promise<unknown | undefined> {
  try {
    const c = erplora() as Partial<ErploraClientLike>;
    if (typeof c.queryOptional !== 'function') return undefined;
    return await read(c as ErploraClientLike);
  } catch {
    return undefined;
  }
}

/** Un grupo de suplementos con sus opciones, tal como lo entrega `modifiers.for_target`. */
interface ModifierGroup {
  id: string;
  name: string;
  min: number;
  /** 0 = sin techo. */
  max: number;
  options: { id: string; name: string; price_delta: number }[];
}

/** Aplana las filas de `modifiers.for_target` en grupos, conservando el orden que trae el SQL
 *  (`group.sort_order, group.name, option.sort_order, option.name`). Una fila por OPCIÓN: la query
 *  devuelve el producto cartesiano a propósito, para no hacer una llamada por grupo. */
function groupModifierRows(rows: unknown[]): ModifierGroup[] {
  const out: ModifierGroup[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const gid = String(r.group_id ?? '');
    if (!gid) continue;
    let g = out.find((x) => x.id === gid);
    if (!g) {
      g = {
        id: gid,
        name: String(r.group_name ?? ''),
        min: Number(r.min_choices ?? 0),
        max: Number(r.max_choices ?? 0),
        options: [],
      };
      out.push(g);
    }
    const oid = String(r.option_id ?? '');
    // Un grupo sin opciones llega con `option_id` nulo (LEFT JOIN): es un grupo vacío, no una opción.
    if (oid) g.options.push({ id: oid, name: String(r.option_name ?? ''), price_delta: Number(r.price_delta ?? 0) });
  }
  return out;
}

/** Traduce una clave del catálogo `ui` con el idioma activo del shell. */
function t(key: string, params?: Record<string, unknown>): string {
  return (erplora() as unknown as I18nClient).t(CATALOG, key, params);
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()) || '·';
}
/** Gradiente estable derivado del texto, como placeholder de foto (CSP-safe, sin <img> externo). */
function gradient(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  const h2 = (h + 38) % 360;
  return `linear-gradient(135deg, hsl(${h} 42% 38%), hsl(${h2} 44% 26%))`;
}

export class ErpPosTouch extends LitElement {
  static styles = css`
    /* El COLOR lo pone el tema de Ionic (claro/oscuro según el hub); el POS solo aporta el LAYOUT.
       Los nombres internos (--bg/--tile/--accent…) se remapean a tokens --ion-* con fallback. */
    :host {
      --bg: var(--ion-background-color, #fff);
      --panel: var(--ion-background-color, #fff);
      --tile: var(--ion-card-background, var(--ion-background-color, #fff));
      --tile-hi: var(--ion-color-light, #f2f1ed);
      --line: var(--ion-border-color, #e6e3db);
      --tx: var(--ion-text-color, #1c1b18);
      --mut: var(--ion-color-medium, #8b897f);
      --accent: var(--ion-color-primary, #0091ce);
      display:block; height:100%; box-sizing:border-box; font-family: system-ui, sans-serif; color:var(--tx);
    }
    *, *::before, *::after { box-sizing:border-box; }

    .card { height:100%; display:flex; flex-direction:column; overflow:hidden; background:var(--bg);
      border:1px solid var(--ion-border-color); border-radius:16px; }
    .body { position:relative; flex:1; min-height:0; display:grid; grid-template-columns: 1fr 23rem; }

    /* ── Catálogo ── */
    .catalog { display:flex; flex-direction:column; min-width:0; padding:.8rem; }
    .catbar { position:relative; display:flex; align-items:center; gap:.4rem; margin-bottom:.7rem; }

    /* Menú ⋮ de PANTALLA (no de venta): anclado bajo su botón, como cualquier kebab. La capa de
       cierre va fija sobre todo el viewport para que un toque fuera lo cierre venga de donde venga. */
    .more-scrim { position:fixed; inset:0; z-index:30; background:transparent; }
    dialog.more-menu { position:absolute; top:calc(100% + .35rem); right:0; left:auto; z-index:31;
      display:flex; flex-direction:column; gap:.15rem; margin:0; padding:.3rem;
      min-width:13rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px);
      background:var(--panel); color:var(--tx); box-shadow:var(--ok-shadow-modal, 0 18px 50px rgba(0,0,0,.35)); }
    dialog.more-menu button { display:flex; align-items:center; gap:.6rem; width:100%;
      padding:.7rem .7rem; font-size:.92rem; text-align:left; color:inherit; cursor:pointer;
      background:none; border:none; border-radius:var(--ok-radius-sm,10px); }
    dialog.more-menu button:hover { background:var(--tile-hi); }
    dialog.more-menu ion-icon { font-size:1.15rem; color:var(--mut); }
    .arrow { flex:none; width:2.1rem; height:2.1rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
    .arrow:hover { background:var(--tile-hi); color:var(--tx); }
    .arrow ion-icon { font-size:1.1rem; }
    ion-segment.category-segment { flex:1; min-width:0; width:auto; justify-content:flex-start;
      overflow-x:auto; scroll-behavior:smooth;
      overscroll-behavior-x:contain; padding:.15rem; scrollbar-width:none; --background:transparent; }
    ion-segment.category-segment::-webkit-scrollbar { display:none; }
    /* Mismo indicio de overflow que la bottom bar de OutfitKit. bindTabbar() publica qué borde
       esconde opciones y estas máscaras viven aquí porque el CSS global no cruza el Shadow DOM. */
    ion-segment.category-segment.ok-tabbar[data-overflow='end'] {
      -webkit-mask-image:linear-gradient(to right,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to right,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment.category-segment.ok-tabbar[data-overflow='start'] {
      -webkit-mask-image:linear-gradient(to left,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to left,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment.category-segment.ok-tabbar[data-overflow='both'] {
      -webkit-mask-image:linear-gradient(to right,transparent 0,#000 var(--ok-tabbar-fade,36px),
        #000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to right,transparent 0,#000 var(--ok-tabbar-fade,36px),
        #000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment-button.cat-segment-button { flex:0 0 9.5rem; min-width:9.5rem; min-height:4.4rem;
      margin:0 .275rem; border:1px solid transparent; border-radius:var(--ok-radius,12px);
      text-transform:none; --background:var(--tile); --background-checked:var(--tile-hi);
      --color:var(--tx); --color-checked:var(--tx); --indicator-color:transparent;
      --indicator-box-shadow:none; --padding-start:.65rem; --padding-end:.65rem; }
    ion-segment-button.cat-segment-button.segment-button-checked { border-color:var(--accent); }
    .cat-segment-label { display:flex; width:100%; height:100%; flex-direction:column;
      justify-content:center; align-items:flex-start; min-width:0; margin:0; text-align:left; }
    .cat-segment-label .cc-n { width:100%; font-weight:700; font-size:.92rem; line-height:1.1;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cat-segment-label .cc-c { font-size:.72rem; color:var(--mut); margin-top:.1rem; }

    /* Resultados del buscador de productos (proyectados en el slot de ok-spotlight-search). */
    .sp-list { background:transparent; }
    ion-list.sp-list { background:transparent; }
    .sp-list ion-item { --background:transparent; border-radius:var(--ok-radius-sm,10px); }
    .sp-price { font-weight:800; color:var(--accent); }
    .sp-list ion-item[disabled] .sp-warn { color:var(--ion-color-warning-shade,#b26a00); white-space:normal; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap:.7rem; overflow:auto; align-content:start; padding-bottom:.3rem; }
    ion-card.tile { margin:0; border-radius:var(--ok-radius,14px); box-shadow:none; border:1px solid var(--ion-border-color); background:var(--tile);
      overflow:hidden; display:flex; flex-direction:column; transition:border-color .12s, transform .05s; }
    ion-card.tile:hover { border-color:var(--accent); }
    ion-card.tile:active { transform:scale(.98); }
    /* sales#74 + sales#58 - an item checkout would reject: it shows, it takes the tap, and the tap
       SAYS why. Never the native disabled attribute: on Ionic that means pointer-events none, so a
       touchscreen swallows the tap and the reason (title needs a hover, aria-label needs a screen
       reader) reaches nobody - the grid just looks broken. Colour and opacity are not the message
       either (colour blindness, bad screens): the reason travels in WORDS, on the tile itself. */
    ion-card.tile[aria-disabled='true'] { opacity:.72; border-style:dashed; cursor:not-allowed; }
    ion-card.tile[aria-disabled='true']:hover { border-color:var(--ion-color-warning,#ffc409); }
    .thumb { height:5.6rem; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:1.4rem; color:rgba(255,255,255,.85); position:relative; }
    /* La foto TAPA el marcador en vez de sustituirlo: va absoluta sobre el degradado y las
       iniciales, que quedan debajo. Si no carga, no ocupa y asoma lo de abajo. */
    .thumb img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .thumb .warn { z-index:1; position:absolute; top:.28rem; right:.28rem; display:flex; align-items:center; justify-content:center;
      width:1.5rem; height:1.5rem; border-radius:50%; background:var(--ion-color-warning,#ffc409);
      color:var(--ion-color-warning-contrast,#000); font-size:1.05rem; }
    .tinfo { padding:.5rem .6rem .65rem; }
    /* The block label, on the tile and in words (Square and Toast paint "Sold Out" right there).
       The long reason goes to the notice the tap raises; the short label is what fits here. */
    .tile .blocked-badge { margin-top:.3rem; display:inline-block; max-width:100%; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; padding:.08rem .38rem; border-radius:var(--ok-radius-pill,999px);
      background:var(--ion-color-warning,#ffc409); color:var(--ion-color-warning-contrast,#000);
      font-size:.68rem; font-weight:700; letter-spacing:.02em; text-transform:uppercase; }
    /* The notice the tap raises: where the cashier is already looking, not in a corner. */
    .blocked-notice { display:flex; align-items:center; gap:.4rem; margin:0 0 .5rem; padding:.45rem .6rem;
      border-radius:var(--ok-radius,14px); border:1px solid var(--ion-color-warning,#ffc409);
      background:color-mix(in srgb, var(--ion-color-warning,#ffc409) 16%, transparent);
      color:var(--tx); font-size:.82rem; line-height:1.25; }
    .blocked-notice ion-icon { flex:none; font-size:1.05rem; color:var(--ion-color-warning-shade,#e0ac08); }
    .tile .n { font-weight:600; font-size:.9rem; line-height:1.2; color:var(--tx); }
    .tile .p { font-weight:800; color:var(--accent); margin-top:.25rem; }

    /* ── Carrito ── */
    .cart { position:relative; display:flex; flex-direction:column; min-height:0; background:var(--panel); border-left:1px solid var(--ion-border-color); }
    .cart ion-header ion-toolbar { --background:var(--panel); --color:var(--tx); --border-color:var(--ion-border-color); }
    .cart ion-title { font-size:1rem; }
    /* Contexto asignado (mesa/cliente) como CHIPS en el título — sustituye al texto "Venta". */
    /* Tamaño ÚNICO de los iconos de la cabecera del carrito. Ahí conviven iconos de tres dueños
       (TPV, mesas, clientes) y cada uno traía el suyo: el chip de mesa a 20px y los botones de al
       lado a 17px. Además el de mesa es de otro set (Material Symbols), con viewBox y grosor
       distintos de Ionicons: con el mismo número se ve MÁS PEQUEÑO, por eso se compensa aquí. Las
       custom properties cruzan el Shadow DOM, así que los módulos del slot heredan este valor. */
    ion-toolbar { --pos-hdr-icon-size: 1.75rem; }
    ion-buttons ion-icon { font-size: var(--pos-hdr-icon-size); }
    .cart-actions-slot { --pos-hdr-icon-size: 1.75rem; }
    .ctx-chips { display:flex; gap:.35rem; flex-wrap:wrap; }
    .ctx-chips .chip { font-size:.8rem; font-weight:700; color:var(--ok-on-accent, #fff); border-radius:var(--ok-radius-pill,999px); padding:.12rem .55rem; background:var(--accent); white-space:nowrap; }
    .ctx-chips .chip.cust { background:var(--ion-color-secondary, #5c7cfa); }
    /* Contenedor donde los módulos montan su botón de asignación (mesa, cliente…) en el header. */
    .cart-actions-slot { display:flex; align-items:center; }
    .cart-actions-slot:empty { display:none; }
    /* El CUERPO. Ionic ya resuelve «header fijo · cuerpo con scroll · pie fijo»: ion-content trae
       su propio scroll, así que aquí solo hay que decirle que ocupe el hueco que queda. Antes esto
       era flex:1 + overflow:auto a mano sobre ion-list.lines, que no aplicaba al div del carrito
       vacío: nada empujaba al pie y COBRAR se movía. */
    .cart ion-content.cart-body { flex:1; min-height:0; --background:var(--panel); --color:var(--tx); }
    ion-list.lines { padding:0; background:transparent; }
    ion-list.lines ion-item { --background:transparent; --color:var(--tx); --border-color:var(--ion-border-color); --padding-start:.7rem; --inner-padding-end:.5rem; }
    ion-list.lines ion-item h3 { font-weight:600; color:var(--tx); }
    ion-list.lines ion-item p { color:var(--mut); }
    .lineend { display:flex; flex-direction:column; align-items:flex-end; gap:.3rem; }
    .lineend .lt { font-weight:700; white-space:nowrap; }
    ok-qty-stepper { --ok-qty-field-width:2.3rem; --ok-surface:var(--tile); --ok-text:var(--tx); --ok-border:var(--ion-border-color); }
    .empty { color:var(--mut); text-align:center; padding:2.5rem 1rem; }
    /* El PIE. ion-footer se queda abajo por su cuenta (es un pie de verdad, no un div con flex). */
    .cart ion-footer { flex:none; }
    .cart ion-footer ion-toolbar { --background:var(--panel); }
    .cart-foot { padding:.75rem; border-top:1px solid var(--ion-border-color); background:var(--panel); }
    .total { display:flex; justify-content:space-between; align-items:baseline; margin:.1rem 0 .65rem; font-size:1rem; color:var(--mut); }
    .total b { font-size:1.7rem; color:var(--tx); }
    .charge { font-size:1.05rem; font-weight:700; }
    /* Dos acciones solo-icono (ADR-0133): la cuenta ocupa lo justo y cobrar se lleva el resto,
       porque es la acción primaria y el dedo la busca sin mirar. */
    /* Cobro: los segments son la elección (método, formato) y abajo las dos salidas. */
    /* El importe manda: grande, centrado y solo. */
    .pay-total { font-size:2.4rem; font-weight:800; text-align:center; letter-spacing:-.02em;
      margin:.2rem 0 1rem; color:var(--tx); }
    /* Etiqueta de sección: dice QUÉ estás eligiendo (antes dos segments iguales sin contexto). */
    .pay-lbl { margin:.9rem 0 .35rem; font-size:.75rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:var(--mut); }
    /* Selector de MÉTODO dentro del sheet (tender): botones grandes con icono + nombre, objetivo
       táctil ≥56px. El elegido se marca por borde/acento Y por aria-pressed (no solo color). */
    .pay-methods { display:grid; grid-template-columns:repeat(2,1fr); gap:.5rem; margin:.1rem 0 .55rem; }
    .pm-btn { display:flex; align-items:center; justify-content:center; gap:.5rem; min-height:56px;
      border-radius:12px; border:1px solid var(--ion-border-color); background:var(--tile);
      color:var(--tx); font-weight:700; font-size:.95rem; cursor:pointer; }
    .pm-btn ion-icon { font-size:1.3rem; }
    .pm-btn[aria-pressed=true] { border-color:var(--accent); color:var(--accent);
      box-shadow:var(--ok-ring-accent, inset 0 0 0 1px var(--accent)); }
    .pm-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* Logo de marca (Bizum): es un wordmark ANCHO, no un glifo cuadrado como los Ionicons, así que
       se acota a la altura del icono y se deja crecer a lo ancho sin romper el botón. */
    .pay-methods .brand { display:inline-flex; align-items:center; height:1.15rem; }
    .pay-methods .brand svg { height:100%; width:auto; max-width:4.5rem; display:block; }
    /* Tarjeta: nada que teclear — el importe exacto y la pista del datáfono. */
    .pay-hint { margin:.1rem 0 .4rem; color:var(--mut); font-size:.9rem; }
    /* El cambio es lo que el cajero busca con el ojo al devolver. */
    .amt.big-change .v { font-size:1.6rem; font-weight:800; color:var(--accent); }
    .print-row { --background:transparent; --padding-start:0; --inner-padding-end:0; margin:.5rem 0 .2rem; }
    .pay-err { color:var(--ion-color-danger,#d9480f); margin:.4rem 0 0; }
    /* hub#297 — la captura de NIF+domicilio por encima del techo de la simplificada. Va ARRIBA del
       todo en el sheet porque es lo primero que hay que resolver, y cambia de ámbar a neutro en
       cuanto está completa: el color deja de pedir algo cuando ya no hay nada que pedir. */
    .limit-capture { display:flex; flex-direction:column; gap:.35rem; margin:0 0 .8rem;
      padding:.7rem .75rem; border-radius:.7rem;
      border:1px solid var(--ion-color-warning,#e8a33d); background:color-mix(in srgb,var(--ion-color-warning,#e8a33d) 12%,transparent); }
    .limit-capture[data-done] { border-color:var(--ion-color-success,#2dd36f);
      background:color-mix(in srgb,var(--ion-color-success,#2dd36f) 10%,transparent); }
    .limit-head { display:flex; gap:.55rem; align-items:flex-start; margin-bottom:.25rem; }
    .limit-head ion-icon { font-size:1.35rem; flex:0 0 auto; margin-top:.1rem; }
    .limit-head strong { display:block; font-size:.98rem; }
    .limit-head p { margin:.15rem 0 0; font-size:.86rem; color:var(--mut); }
    .limit-capture ion-input { --background:var(--ion-background-color,#fff); --padding-start:.6rem;
      --padding-end:.6rem; border-radius:.5rem; }
    .err { color:var(--ion-color-danger,#d9480f); }
    .pay-actions { display:flex; gap:.5rem; }
    .pay-actions .charge { flex:1; }
    .pay-actions .charge-print { flex:none; width:64px; }
    .foot-actions { display:flex; gap:.5rem; }
    .foot-actions .ticket-discount { flex:none; width:56px; }
    .ticket-discount-row { display:flex; justify-content:space-between; font-size:.9rem; color:var(--ion-color-warning-shade, #b7791f); margin:.1rem 0; }
    .discount-mode { margin:0 0 .4rem; max-width:12rem; }
    .discount-foot { display:flex; gap:.5rem; align-items:center; }
    .discount-foot .charge { flex:1; }
    .line-discount-badge { vertical-align:middle; }
    .foot-actions .prebill { flex:none; width:56px; }
    .foot-actions .charge { flex:1; }

    /* desplegable tickets aparcados */
    .pdrop-back { position:absolute; inset:0; z-index:40; }
    .pdrop { position:absolute; top:2.9rem; right:.5rem; z-index:41; width:min(20rem,90%); background:var(--tile);
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px); box-shadow:var(--ok-shadow-pop, 0 12px 32px rgba(0,0,0,.5)); padding:.5rem; max-height:60%; overflow:auto; }
    .pdrop .hint { color:var(--mut); font-size:.82rem; margin:.3rem .2rem .5rem; }
    .pdrop .hint.hint--center { text-align:center; }
    .pdrop .hint strong { color:var(--tx); }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.3rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-sm,10px); padding:.2rem .3rem .2rem .6rem; margin-bottom:.35rem; }
    /* La FILA entera recupera: botón de verdad (accesible), sin pintas de botón. */
    .prow { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:.1rem;
      background:none; border:none; padding:.3rem 0; text-align:left; cursor:pointer; color:var(--tx); }
    .pn { font-weight:700; font-size:.9rem; }
    .pm { color:var(--mut); font-size:.78rem; }
    .pdel { margin:0; }

    .lqty { color:var(--mut); font-weight:700; }
    /* Secciones POR DATO: PENDIENTE DE ENVIAR arriba (borde de acento — donde trabaja el
       camarero) y ENVIADO debajo. El detalle por comanda es del chip+modal de kitchen, que se
       monta en .sec-slot de la cabecera de ENVIADO. */
    .secs { padding:.4rem .5rem .8rem; display:flex; flex-direction:column; gap:.6rem; }
    .sec { border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px); overflow:hidden; }
    .sec.sec-pending { border-color:var(--accent); }
    .sec-h { display:flex; align-items:center; gap:.4rem; padding:.5rem .7rem;
      font-weight:700; font-size:.82rem; text-transform:uppercase; letter-spacing:.04em;
      background:var(--tile); }
    .sec-h .ccount { color:var(--mut); }
    .sec-h .sec-slot { margin-left:auto; display:inline-flex; align-items:center;
      text-transform:none; letter-spacing:0; }

    /* Diálogos nativos (top layer): aparcar-con-nombre y carrito sucio. En móvil/tablet toman
       ASPECTO de sheet (suben desde abajo, asa, esquinas solo arriba — pregunta de Ioan
       2026-07-19): mismo <dialog> nativo, que ion-action-sheet no aloja contenido rico y los
       overlays de Ionic en shadow Lit se re-parentan al body (ADR-0028). */
    dialog.park-dialog, dialog.dirty-dialog { border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,14px);
      background:var(--panel); color:var(--tx); padding:1rem 1.1rem; width:min(94vw,24rem);
      box-shadow:var(--ok-shadow-modal, 0 18px 50px rgba(0,0,0,.35)); }
    dialog.park-dialog::backdrop, dialog.dirty-dialog::backdrop { background:var(--ok-scrim, rgba(0,0,0,.45)); }
    @media (max-width: 820px) {
      dialog.park-dialog, dialog.dirty-dialog { width:100vw; max-width:100vw; margin:auto 0 0;
        border-radius:var(--ok-radius-sheet-top, 18px 18px 0 0); border-bottom:none; padding-bottom:max(1rem, env(safe-area-inset-bottom)); }
      dialog.park-dialog::before, dialog.dirty-dialog::before { content:''; display:block;
        width:2.4rem; height:.3rem; border-radius:var(--ok-radius-pill,999px); background:var(--ion-border-color);
        margin:0 auto .7rem; }
      .dlg-actions ion-button { flex:1; }
    }
    dialog h3 { margin:0 0 .5rem; font-size:1.05rem; }
    dialog p { margin:0 0 .8rem; color:var(--mut); }
    dialog.park-dialog input { width:100%; box-sizing:border-box; font-size:1rem; padding:.6rem .7rem;
      border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); }
    .dlg-actions { display:flex; justify-content:flex-end; gap:.4rem; margin-top:.9rem; flex-wrap:wrap; }
    .badge-num { font-size:.62rem; min-width:1rem; height:1rem; padding:0 .2rem; border-radius:var(--ok-radius-pill,999px); background:var(--accent); color:var(--ok-on-accent,#fff); display:inline-flex; align-items:center; justify-content:center; position:absolute; top:.2rem; right:.2rem; }

    /* botón flotante de carrito (solo móvil) */
    .fab { display:none; position:absolute; right:1rem; bottom:1rem; z-index:50; width:3.6rem; height:3.6rem; border-radius:50%;
      border:none; background:var(--accent); color:var(--ok-on-accent,#fff); cursor:pointer; box-shadow:var(--ok-shadow-modal, 0 10px 26px rgba(0,0,0,.45)); align-items:center; justify-content:center; }
    .fab ion-icon { font-size:1.6rem; }
    .fab .badge { position:absolute; top:-.2rem; right:-.2rem; min-width:1.3rem; height:1.3rem; padding:0 .25rem; border-radius:var(--ok-radius-pill,999px);
      background:var(--ok-on-accent,#fff); color:var(--accent); font-size:.72rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
    .cart-close { display:none; }

    /* cobro / numpad (sheet oscuro) */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:var(--ok-radius-pill,999px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--accent); color:var(--ok-on-accent,#fff); border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:var(--ion-color-success, #2f9e44); }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.35rem; margin-bottom:.2rem; }
    .numpad button { font-size:1.15rem; padding:.6rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    /* Precio libre: el tile fijo del catálogo + los botones de DEPARTAMENTO dentro del sheet. */
    .tile.open-price .op-thumb { display:flex; align-items:center; justify-content:center; font-size:2rem; color:var(--ion-color-primary,#3880ff); background:var(--ion-color-primary-tint,rgba(56,128,255,.14)); }
    .dept-label { margin:.5rem 0 .3rem; font-size:.8rem; opacity:.7; }
    .dept-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:.4rem; }
    .dept-btn { display:flex; flex-direction:column; align-items:flex-start; gap:.1rem; padding:.55rem .7rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; text-align:left; }
    .dept-btn[aria-pressed='true'] { border-color:var(--ion-color-primary,#3880ff); background:var(--ion-color-primary-tint,rgba(56,128,255,.16)); }
    .dept-btn .dn { font-size:1rem; }
    .dept-btn .dr { font-size:.8rem; opacity:.7; }
    .dept-empty { grid-column:1/-1; opacity:.6; font-size:.85rem; padding:.5rem; }
    .scrim { position:fixed; inset:0; background:var(--ok-scrim, rgba(0,0,0,.6)); display:flex; align-items:center; justify-content:center; z-index:70; }
    /* Columna flex: el importe y el botón de cobrar NO se mueven; solo scrollea el centro. Antes
       el sheet entero scrolleaba y el botón principal quedaba fuera de pantalla — la acción más
       importante del TPV no puede exigir scroll. */
    .sheet { background:var(--panel); color:var(--tx); border:1px solid var(--ion-border-color);
      border-radius:var(--ok-radius-lg,16px); width:min(92vw,24rem); max-height:88vh; display:flex; flex-direction:column;
      overflow:hidden; box-shadow:var(--ok-shadow-modal, 0 12px 48px rgba(0,0,0,.6)); }
    .sheet-h, .sheet-top, .sheet-foot { flex:none; padding:0 1rem; }
    .sheet-h { padding-top:1rem; }
    .sheet-foot { padding:.75rem 1rem 1rem; border-top:1px solid var(--ion-border-color); }
    .pay { flex:1; min-height:0; overflow:auto; padding:0 1rem; }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--mut); }

    @media (max-width: 820px) {
      .body { grid-template-columns: 1fr; }
      /* Sin sombra: aun cerrado (translateX(100%)) su box-shadow se derramaba ~30px hacia dentro
         por el borde derecho de la tarjeta; la separación al abrir la dan el backdrop y el borde. */
      /* Cerrado = INEXISTENTE, no solo «fuera de pantalla» (sales#58). Con únicamente el transform,
         sus botones —asignar mesa, asignar cliente, cobrar, cuentas abiertas— seguían anunciados en
         el árbol accesible y aceptaban clicks sin que ocurriera nada visible: controles fantasma,
         para un lector de pantalla igual que para Playwright. La propiedad visibility se hereda a
         todo el subárbol, así que este único punto cubre TODOS los controles de la cuenta, incluidos
         los que montan otros módulos en el slot. La transición retrasa el ocultado hasta que termina
         el deslizamiento; al abrir es inmediata. */
      .cart { position:absolute; top:0; right:0; bottom:0; width:min(92%,26rem); z-index:60;
        transform:translateX(100%); visibility:hidden;
        transition:transform .25s ease, visibility 0s linear .25s; }
      .cart[data-open] { transform:translateX(0); visibility:visible;
        transition:transform .25s ease, visibility 0s; }
      .cart-close { display:inline-flex; }
      .cart-backdrop[data-open] { display:block; position:absolute; inset:0; background:var(--ok-scrim, rgba(0,0,0,.5)); z-index:55; }
      .fab { display:inline-flex; }
    }
    .cart-backdrop { display:none; }

    /* ── Pulido visual 2026-07: conserva la estructura modular y acerca el POS al prototipo. ── */
    .card { border-radius:var(--ok-radius-lg,16px); box-shadow:var(--ok-shadow-card,none); }
    .body { grid-template-columns:minmax(0,1fr) minmax(23rem,24.5rem); }
    .catalog { padding:.72rem; }
    .catbar { gap:.5rem; margin-bottom:.68rem; }
    ion-segment.category-segment { padding:.05rem; }
    ion-segment-button.cat-segment-button { flex-basis:8.7rem; min-width:8.7rem; min-height:3.65rem;
      margin:0 .24rem; border-color:var(--line); --background:var(--tile);
      --background-checked:color-mix(in srgb,var(--accent) 10%,var(--tile)); }
    ion-segment-button.cat-segment-button:hover { --background:var(--tile-hi); }
    ion-segment-button.cat-segment-button.segment-button-checked { border-color:var(--accent);
      box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent); }
    .cat-segment-label .cc-n { font-size:.88rem; }
    .cat-segment-label .cc-c { font-size:.7rem; }
    .arrow.search-trigger { width:3rem; height:3.65rem; border-radius:var(--ok-radius,12px); color:var(--accent); }
    /* El ⋮ crece con su vecina: quedaba en 34px al lado de una lupa de 48×58 —se leía como un
       botón de segunda— y por debajo del área táctil que pide un dedo en el mostrador. Alto igual,
       ancho algo menor porque el icono es estrecho y no debe robarle sitio a las categorías. */
    .arrow.more-trigger { width:2.6rem; height:3.65rem; border-radius:var(--ok-radius,12px); }

    .grid { grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr)); gap:.62rem; }
    ion-card.tile { min-height:8.4rem; border-radius:var(--ok-radius,14px); cursor:pointer; }
    .thumb { height:4.85rem; flex:none; }
    .tinfo { flex:1; display:grid; grid-template-columns:minmax(0,1fr) auto; grid-template-rows:auto auto;
      gap:.15rem .5rem; align-content:center; padding:.52rem .62rem .58rem; }
    .tile .n { grid-column:1 / -1; font-size:.86rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tile .sku { color:var(--mut); font-size:.66rem; align-self:end; }
    /* #277 — el precio («1,50 €») con white-space:nowrap desbordaba la celda auto del grid y la
       tarjeta overflow:hidden recortaba el «€». Se asegura espacio a la derecha del precio. */
    .tile .p { margin:0; padding-right:.15rem; color:var(--tx); font-size:.9rem; align-self:end; white-space:nowrap; }

    .cart { border-left:1px solid var(--line); }
    .cart ion-header { flex:none; border-bottom:1px solid var(--line); }
    .cart ion-toolbar { --min-height:3.6rem; }
    .order-toolbar { min-height:3.6rem; display:flex; align-items:stretch; gap:.12rem; padding:.24rem .35rem; }
    ion-button.header-action { width:3.25rem; height:3.05rem; margin:0; font-size:1.05rem;
      --padding-start:.2rem; --padding-end:.2rem; --border-radius:var(--ok-radius-sm,10px); --color:var(--mut); }
    ion-button.header-action::part(native) { display:flex; flex-direction:column; gap:.08rem; }
    ion-button.header-action ion-icon { font-size:1.2rem; }
    ion-button.header-action small { display:block; max-width:3rem; font-size:.56rem; line-height:1;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* Aparcar y Cuentas abiertas comparten fila con selectores icon-only aportados por otros
       módulos. Sus etiquetas viven en title/aria-label: pintarlas dentro de 52 px producía textos
       truncados y hacía que pareciesen acciones de otro nivel. */
    ion-button.header-action.icon-action { width:2.4rem; height:2.4rem; margin:auto 0;
      --padding-start:0; --padding-end:0; }
    ion-button.header-action.icon-action::part(native) { flex-direction:row; gap:0; }
    ion-button.header-action.icon-action ion-icon { font-size:var(--pos-hdr-icon-size,1.75rem); }
    /* El badge .badge-num (absoluto) se ancla a este botón: necesita un contexto de posicionamiento. */
    .open-checks-action { position:relative; }
    ion-button.header-action.assigned { --color:var(--accent); --background:color-mix(in srgb,var(--accent) 12%,transparent); }
    .cart-actions-slot { display:flex; align-items:center; min-width:0; }
    .actions-spacer { flex:1; min-width:.2rem; }
    .order-heading { padding:.62rem .8rem .58rem; border-bottom:1px solid var(--line); }
    .order-title-row { display:flex; align-items:center; gap:.35rem; }
    .order-title { flex:1; min-width:0; border:0; outline:0; padding:.08rem 0; background:transparent;
      color:var(--tx); font:inherit; font-size:1rem; font-weight:750; }
    .order-title::placeholder { color:var(--mut); }
    .title-edit { flex:none; width:2rem; height:2rem; display:inline-grid; place-items:center; padding:0;
      border:0; border-radius:var(--ok-radius-sm,8px); background:transparent; color:var(--mut); cursor:pointer; }
    .title-edit:hover, .title-edit:focus-visible { color:var(--accent); background:var(--tile-hi); outline:none; }
    .title-edit ion-icon { font-size:1rem; }
    .order-context { display:flex; gap:.3rem; flex-wrap:wrap; min-height:1.55rem; margin-top:.32rem; }
    .order-context ion-chip { height:1.55rem; margin:0; font-size:.68rem; --background:var(--tile); color:var(--mut); }
    .context-empty { color:var(--mut); font-size:.72rem; align-self:center; }

    ion-segment.view-tabs { margin:.62rem .72rem .28rem; width:auto; border:1px solid var(--line);
      border-radius:var(--ok-radius-sm,11px); background:var(--tile); }
    ion-segment.view-tabs ion-segment-button { min-height:2.85rem; --indicator-color:var(--tile-hi);
      --color:var(--mut); --color-checked:var(--tx); font-weight:700; text-transform:none; }
    .view-tab-label { display:inline-flex; align-items:center; justify-content:center; gap:.38rem; }
    .pending-dot { display:inline-grid; place-items:center; min-width:1.18rem; height:1.18rem; padding:0 .25rem;
      border-radius:var(--ok-radius-pill,999px); background:var(--ion-color-warning,#f5a623); color:var(--ion-color-warning-contrast,#241700); font-size:.65rem; font-weight:850; }

    .cart ion-content.cart-body { --padding-top:.15rem; }
    ion-list.lines { padding:.28rem .48rem .45rem; }
    ion-list.lines ion-item { margin:.35rem 0; --background:var(--tile); --border-color:transparent;
      --border-radius:var(--ok-radius,12px); border:1px solid var(--line); border-radius:var(--ok-radius,12px); overflow:hidden; }
    ion-list.lines ion-item.sel { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 7%,var(--tile)); }
    ion-list.lines ion-item h3 { display:flex; align-items:center; gap:.35rem; margin-bottom:.12rem; font-size:.85rem; }
    ion-list.lines ion-item p { font-size:.7rem; }
    ok-status-pill { vertical-align:middle; }
    .lineend .lt { font-size:.84rem; }
    .lineend .lt.is-gift { text-decoration:line-through; opacity:.55; }
    .secs { padding:.32rem .48rem .65rem; gap:.52rem; }
    .sec { border-radius:var(--ok-radius,12px); }
    .sec-h { padding:.48rem .58rem; font-size:.7rem; background:transparent; border-bottom:1px solid var(--line); }
    .sec.sec-pending { border-color:color-mix(in srgb,var(--accent) 55%,var(--line)); }
    .sec-slot { min-width:0; }
    .draft-pane { padding:.28rem .48rem .7rem; }
    .draft-hint { margin:.2rem .18rem .52rem; color:var(--mut); font-size:.76rem; line-height:1.35; }
    .draft-actions-slot { display:flex; margin:.65rem 0 0; }
    .draft-actions-slot:empty { display:none; }
    .draft-empty { min-height:10rem; display:grid; place-items:center; }

    .cart-foot { padding:.62rem .72rem .7rem; }
    .total { margin:0 0 .5rem; font-size:.78rem; }
    .total b { font-size:1.55rem; }
    .foot-actions .prebill { width:3.25rem; }
    .foot-actions .charge { min-height:3rem; font-size:.98rem; }
    .pdrop { top:3.5rem; right:.45rem; width:min(22rem,calc(100% - .9rem)); max-height:72%; }
    .pitem { padding:.35rem .35rem .35rem .65rem; }

    @media (min-width:821px) and (max-width:1100px) {
      .body { grid-template-columns:minmax(0,1fr) 22rem; }
      .grid { grid-template-columns:repeat(auto-fill,minmax(8.8rem,1fr)); }
      ion-segment-button.cat-segment-button { flex-basis:8rem; min-width:8rem; }
    }
    @media (max-width:820px) {
      .body { grid-template-columns:1fr; }
      .catalog { padding:.58rem; }
      .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.5rem; }
      ion-card.tile { min-height:8rem; }
      ion-segment-button.cat-segment-button { flex-basis:7.8rem; min-width:7.8rem; }
      .cart { width:min(100%,27rem); }
      .order-toolbar { padding-left:.2rem; padding-right:.2rem; }
      .memory-only { display:none; }
      /* #277 — en tiles de 2 columnas el precio «1,50 €» se recortaba por la derecha (overflow:hidden
         de la tarjeta + white-space:nowrap). Un font-size algo menor lo hace caber sin recortar el «€». */
      .tile .p { font-size:.82rem; }
    }
    @media (max-width:340px) {
      .catalog { padding:.45rem; }
      .grid { gap:.42rem; }
      ion-segment-button.cat-segment-button { flex-basis:7rem; min-width:7rem; }
      ion-card.tile { min-height:7.7rem; }
      .thumb { height:4.5rem; }
    }
  `;

  /**
   * El shell descarga cada ruta portable con la sesión del Hub y esta caché posee los `blob:` que
   * sí puede pintar un `<img>`. Un shell anterior no expone la capacidad y deja las iniciales.
   */
  private readonly photos = new MediaPhotoCache(
    () => erplora(),
    () => this.requestUpdate(),
  );
  /** Invalida continuaciones asíncronas de montajes anteriores, incluso tras reconectar rápido. */
  private connectionEpoch = 0;

  /**
   * Controles de chrome que el SHELL honra en esta pestaña, separados por espacios (ADR-0048).
   * Los pone el shell a partir de `navigation[].chrome` del manifest; el TPV solo los OFRECE.
   *
   * Vacío o ausente = ningún control → no se pinta el ⋮. Es la comprobación de capacidad, no
   * decorado: los módulos se actualizan solos y la imagen del hub no, así que este `sales` puede
   * caer sobre un shell que no escucha `erp:chrome-request`. Ahí el botón no haría nada, y un
   * botón muerto en el mostrador cuesta más que la función que no se ofrece.
   */
  @property() chrome = '';
  /**
   * ¿El shell está AHORA en pantalla completa? Lo dice él, no lo deduce el TPV de sus propios
   * clics: también se entra y se sale con Esc o con F11, que este componente no ve. Deducirlo
   * dejaría la etiqueta del menú mintiendo en cuanto el cajero tocase Esc.
   */
  @property({ type: Boolean }) fullscreen = false;
  /** ¿Está desplegado el menú ⋮ de la barra de categorías? */
  @state() private moreOpen = false;

  @state() private products: Product[] = [];
  @state() private categories: Category[] = [];
  @state() private taxCategories: TaxCategory[] = [];
  @state() private activeCat = '';
  @state() private q = '';
  @state() private cart: CartLine[] = [];
  @state() private methods: PayMethod[] = [];
  @state() private settings: PosSettings = {};
  @state() private paying = false;
  @state() private tendered = '';
  // Precio libre / venta por departamento (fuera de catálogo): sheet propio con su importe tecleado
  // y el departamento (categoría fiscal) elegido.
  @state() private openPriceOpen = false;
  /** sales#71 — descuento de TICKET (%) de la cuenta en curso; 0 = ninguno. Se persiste en el
   *  pedido (`sales.order.set_discount`) y vuelve al retomar la cuenta (`OpenCheck.discount`). */
  @state() ticketDiscount = 0;
  /** El sheet de descuento: sobre una LÍNEA o sobre el TICKET. */
  @state() private discountSheet?: { target: 'line' | 'ticket'; lineId?: string };
  @state() private discountInput = '';
  /** sales#113 — importe FIJO al ticket (céntimos); el servidor lo reparte por resto mayor. */
  @state() ticketDiscountAmount = 0;
  /** Modo del sheet de descuento del TICKET: porcentaje o importe. */
  @state() private discountMode: 'percent' | 'amount' = 'percent';
  @state() private openAmount = '';
  /** pm#93 — hoja de suplementos abierta: el producto que la disparó y sus grupos ya aplanados.
   *  `undefined` = no hay hoja. Mismo patrón que el precio libre de un servicio sin importe. */
  @state() modifierSheet?: { product: Product; groups: ModifierGroup[] };
  /** Opciones elegidas, EN EL ORDEN de elección — cocina lee la comanda en ese orden. */
  @state() modifierPicks: string[] = [];
  @state() private openDept = '';
  @state() private payMethod?: PayMethod;
  @state() private docFormat: 'ticket' | 'invoice' = 'ticket';
  @state() private busy = false;
  @state() private error = '';
  /** sales#58 - why the LAST tapped tile did not reach the check. It lives apart from `error`
   *  (a sale failure, which drags the "check the sales list" link along): this is not a failure,
   *  it is an unconfigured catalogue, and it clears itself as soon as something sellable goes in. */
  @state() private blockedNotice = '';
  @state() private docSaleId?: string;
  /** Clave del INTENTO de cobro en curso (sales#20): se genera al abrir la pantalla de cobro, se
   *  REUTILIZA en cada reintento —por eso un timeout no crea una segunda venta— y se descarta en
   *  cuanto la venta consta. Vacía = no hay cobro en curso. */
  private checkoutKey = '';
  /** hub#923: el cobro falló y NO se pudo averiguar si la venta entró. Enciende el aviso con la
   *  salida a Ventas — es la diferencia entre «cobro dudoso» y volver a cobrar a ciegas. */
  @state() private checkoutUnknown = false;
  @state() private parked: OpenCheck[] = [];
  /** Líneas marcadas para cobrar por separado (ADR-0146). Vacío = se cobra la cuenta entera. */
  @state() private splitSel = new Set<string>();
  @state() private parkedOpen = false;
  @state() private cartOpen = false;
  /** Etiqueta visible de la cuenta. Se persiste en el pedido existente con sales.order.set_label. */
  @state() private orderLabel = '';
  /** Cocina aporta la segunda vista; sin su slot el POS queda en una única cuenta universal. */
  @state() private orderView: 'account' | 'draft' = 'account';
  /** El search del catálogo se despliega desde una lupa (gana alto para la rejilla). */
  @state() private searchOpen = false;
  @state() private tableId?: string;
  /** ADR-0141: pedido MUTABLE que respalda el carrito. Cada artículo se escribe como FILA real al
   *  instante (antes: blob con debounce de 400 ms → un corte de luz perdía el último artículo). */
  @state() private orderId?: string;
  /** Cuenta de sala (sales#61) que espera pedido tras dividir. OPACA: `sales` no la interpreta,
   *  solo la reenvía en `erp:order-linked` para que el segundo pedido cuelgue de ELLA. */
  private pendingSplitSession?: string;
  /** Modal de la CUENTA previa (pre-bill) que se lleva a la mesa antes de cobrar. No es fiscal. */
  @state() private prebillOpen = false;
  /** sales#148 — catálogo de suplementos resuelto (`option_id` → nombre + delta), para poder
   *  IMPRIMIR la cuenta. La fila del pedido guarda solo los ids (migración 023, a propósito: el
   *  precio y el nombre los pone el servidor al cobrar), así que al retomar una mesa el navegador
   *  no sabe cómo se llama «o-queso». Se rellena de `modifiers.options.all`, la misma lectura
   *  autoritativa que usa el cobro. Vacío = aún no se pidió, o el módulo no está. */
  @state() private modifierCatalog = new Map<string, PrintedModifier>();
  /** Diálogo del NOMBRE al aparcar sin mesa (default: la hora, editable de un toque). */
  @state() private parkPromptOpen = false;
  @state() private parkName = '';
  /** Diálogo «¿aparcar o eliminar la cuenta actual?» (solo con carrito sucio SIN mesa). */
  @state() private dirtyOpen = false;
  @state() private dirtyAllowCancel = false;
  private dirtyResolve?: (c: 'park' | 'discard' | 'cancel') => void;
  /** Overlay de Ionic montado en document.body. Los overlays declarados dentro del Shadow DOM
   *  son reubicados por Ionic y pierden el contexto visual del Hub (la «ventana negra»). */
  private pendingSwitchAlert?: IonicAlertElement;
  /** Borrado en DOS toques de una cuenta de la lista: el primero arma, el segundo anula. */
  @state() private armedDelete?: string;
  private armedTimer?: ReturnType<typeof setTimeout>;
  /** Preferencia del cobro: imprimir el tiquet al confirmar. Sustituye al 2º botón azul gemelo. */
  @state() private printOnCharge = true;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';
  /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta.
   *  Reactivos desde hub#297: la captura del mostrador los edita a mano cuando la venta pasa del
   *  techo de la simplificada, y el botón de cobrar se enciende con ellos. */
  @state() private customerTaxId = '';
  @state() private customerAddress = '';
  /** Techo de la factura simplificada EN CÉNTIMOS, tal y como lo responde el core
   *  (`hub.fiscal.limits`, hub#297). `null` = este país no pone techo, y entonces aquí no pasa
   *  nada nunca. El número NO se escribe en este módulo: un TPV no sabe de derecho fiscal español,
   *  y el día que cambie el importe cambia una fila, no este fichero. */
  @state() private simplifiedMaxCents: number | null = null;
  /** CITA de origen y PROFESIONAL que atendió (ADR-0077). Ids OPACOS: `sales` no los interpreta,
   *  solo los reenvía a `complete_sale`. `appointment_id` dispara
   *  `sales.sale.created_from_appointment`, con el que `appointments` marca la cita convertida;
   *  `staff_id` (≠ `employee_id`, el cajero) es lo que permite el cierre por profesional. */
  private appointmentId?: string;
  private staffId?: string;

  private prodCats = new Map<string, Set<string>>();
  /** Registro de unidades (ADR-0147): code → fila, para congelar el contexto al añadir línea. */
  private units = new Map<string, UnitRow>();
  /** Catálogo fiscal del hub: mapa tax_category_key → rate_pct (preview del IVA) + si LLEGÓ.
   *  Vacío y `available:false` mientras carga o si `taxes` no responde. ADR-0064/0066/0085. */
  private taxCatalog: TaxCatalog = { rates: new Map<string, number>(), available: false };
  /** Pista de overflow compartida con la bottom bar (fade dinámico + pequeño gesto inicial). */
  private categorySegment?: HTMLElement;
  private categorySegmentCleanup?: () => void;
  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
  // (mesa, cliente…) en el header. Botones independientes: cada uno abre su propio modal. El POS no
  // conoce a `tables`/`customers`; solo monta sus WC y escucha `erp:order-context`/`erp:customer-context`.
  private assignFillers: Array<{ component: string; el: HTMLElement }> = [];
  /** Fillers de acciones (`sales.pos.actions`): Cocina aporta «Enviar comanda» dentro del borrador. */
  private actionFillers: Array<{ component: string; el: HTMLElement }> = [];
  /** Fillers del slot de INFO del pedido (`sales.pos.order_info`, cabecera de ENVIADO):
   *  kitchen aporta su chip «Comandas · N» que abre el modal con estados en vivo. */
  private infoFillers: Array<{ component: string; el: HTMLElement }> = [];
  // Comanda ATADA a la mesa (puntos 1+2): al cambiar de mesa se GUARDA la comanda de la mesa
  // actual y se RECUPERA la de la nueva (o el carrito suelto si es null). Así tocar una mesa
  // ocupada trae su tiquet a la pantalla de venta, como cualquier POS.
  private readonly onOrderContext = async (e: Event) => {
    const d = (e as CustomEvent<{ table_id: string | null; label?: string; order_id?: string | null }>).detail
      ?? { table_id: null };
    const nextTable = d.table_id ?? undefined;

    // Restauración modular: Tables puede resolver la junction después de que Sales ya haya
    // reabierto el pedido y sus líneas. No es un cambio de cuenta, sino el contexto que faltaba
    // para ESE MISMO pedido; adoptarlo directamente evita el falso diálogo «cuenta a medias».
    if (nextTable && d.order_id && d.order_id === this.orderId) {
      const previousTableLabel = this.tableLabel;
      this.tableId = nextTable;
      this.tableLabel = d.label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      return;
    }
    if (nextTable && nextTable === this.tableId) {
      const previousTableLabel = this.tableLabel;
      this.tableLabel = d.label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      return;
    }

    // Reglas de sala (ADR-0141): lo que hay marcado NUNCA se pierde al tocar una mesa.
    const accion = decideOnTableChange({
      cartHasItems: this.cart.length > 0,
      currentTableId: this.tableId,
      targetTableId: nextTable,
      targetOrderId: d.order_id ?? undefined,
    });

    // La comanda de delante no se mezcla sola con la de la mesa (juntar dos cuentas es FUSIONAR,
    // una acción explícita). `park-then-*` solo ocurre con carrito de BARRA (sin mesa): se
    // PREGUNTA qué hacer — aparcar con nombre o eliminar (decisión Ioan 2026-07-19). Aparcar
    // JAMÁS anula: el `sales.order.void` que vivía aquí hacía «desaparecer» los aparcados.
    const aparcarOEliminar = async () => {
      const eleccion = await this.resolveDirtyCart(false);
      if (eleccion === 'discard') await this.discardCurrent();
      else await this.parkWith(defaultParkLabel('', new Date()));
    };

    if (accion === 'clear' || accion === 'park-then-clear') {
      const habiaMesa = !!this.tableId;
      this.tableId = undefined; this.tableLabel = '';
      if (accion === 'park-then-clear') {
        if (habiaMesa) {
          // La X del chip = QUITAR la mesa (el filler ya aparcó SU sesión): la cuenta pasa a
          // aparcada CON NOMBRE — se pide, para no dejar cuentas «Mesa 4» cuya mesa quedó libre.
          this.parkName = defaultParkLabel('', new Date());
          this.parkedOpen = false;
          this.parkPromptOpen = true;
        } else {
          await aparcarOEliminar();
        }
        return;
      }
      this.orderId = undefined; this.orderLabel = ''; this.cart = [];
      return;
    }

    if (accion === 'start-new-check') {
      // Ya veníamos de una mesa: la comanda de antes SE QUEDA allí, abierta, y aquí se empieza una
      // cuenta nueva. Llevarse la cuenta a otra mesa es TRANSFERIR, un botón aparte (igual que en
      // Toast/Lightspeed). Antes esto arrastraba la comanda y re-enlazaba la junction en cada mesa
      // tocada: ninguna se liberaba y acabábamos con tres mesas ocupadas por el mismo pedido.
      this.tableId = nextTable; this.tableLabel = d.label ?? '';
      this.orderId = undefined; this.orderLabel = this.tableLabel; this.cart = [];
      return;
    }

    if (accion === 'assign-to-target') {
      // La comanda de delante pasa a SER la de esa mesa: se enlaza la junction, no se mueve nada.
      this.tableId = nextTable; this.tableLabel = d.label ?? '';
      if (!this.orderLabel) this.orderLabel = this.tableLabel;
      this.notifyOrderLinked();
      return;
    }

    if (accion === 'park-then-load') await aparcarOEliminar();

    // Abrir la comanda de la mesa (o empezar en blanco si no tiene).
    this.tableId = nextTable; this.tableLabel = d.label ?? '';
    const linked = d.order_id ?? undefined;
    this.orderId = linked;
    this.orderLabel = this.tableLabel;
    if (linked) rememberCurrentCheck(localStorage, linked); else forgetCurrentCheck(localStorage);
    this.cart = linked ? await loadOrderLines(erplora(), linked) : [];
  };

  // Fusionar mesas (punto 3): el filler ya ejecutó tables.sessions.merge; aquí se combinan los
  // tiquets (sumando líneas idénticas) en la mesa destino y se limpia el origen.
  private readonly onOrderMerge = async (e: Event) => {
    const d = (e as CustomEvent<{
      from_table_id: string; to_table_id: string; to_label?: string;
      from_order_id?: string | null; to_order_id?: string | null;
    }>).detail;
    if (!d?.from_table_id || !d?.to_table_id || d.from_table_id === d.to_table_id) return;
    // ADR-0141: FUSIONAR = las líneas del pedido ORIGEN se suman al del DESTINO y el origen se
    // anula → una sola cuenta en una sola mesa. Son filas que se mueven, así que las cantidades y
    // precios se conservan. (Antes esto reescribía dos blobs; con el pedido ya no hay blob.)
    const from = d.from_order_id ?? undefined;
    let to = d.to_order_id ?? undefined;
    if (!from) return; // el origen no tenía comanda: nada que sumar
    if (!to) {
      // La mesa destino aún no tenía pedido: la comanda del origen pasa a ser SU comanda.
      to = from;
    } else {
      await mergeOrders(erplora(), from, to);
    }
    if (this.tableId === d.from_table_id || this.tableId === d.to_table_id) {
      const previousTableLabel = this.tableLabel;
      this.tableId = d.to_table_id;
      this.tableLabel = d.to_label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      this.orderId = to;
      this.cart = await loadOrderLines(erplora(), to);
    }
  };
  // Dividir la cuenta (sales#61): el filler ya ejecutó `tables.sessions.split`, así que la mesa
  // tiene una SEGUNDA cuenta viva — y nace sin pedido a propósito, porque las líneas y los importes
  // son de `sales`. Aquí se materializa ese segundo pedido con lo que el camarero haya MARCADO en
  // el carrito (la misma marca que ya sirve para cobrar por partes: se toca lo de quien se va) y se
  // publica para que la sala lo cuelgue de ESA cuenta, no de "la mesa".
  private readonly onOrderSplit = async (e: Event) => {
    const d = (e as CustomEvent<{
      table_id?: string | null; from_order_id?: string | null;
      session_id?: string | null; label?: string;
    }>).detail;
    if (!d) return;
    // El id de la cuenta nueva es OPACO: se guarda para el `erp:order-linked` y no se interpreta.
    this.pendingSplitSession = d.session_id ?? undefined;

    const source = d.from_order_id ?? this.orderId;
    if (!source) {
      // La mesa aún no había pedido nada: no hay nada que repartir. La cuenta nueva queda esperando
      // y el primer producto abrirá su pedido — que ya se enganchará a ella (`pendingSplitSession`).
      this.orderId = undefined; this.cart = []; this.splitSel = new Set();
      this.orderLabel = d.label ?? this.orderLabel;
      forgetCurrentCheck(localStorage);
      return;
    }

    // Lo marcado solo vale si lo marcado ES de esta cuenta: el ⋮ del plano se abre mires lo que
    // mires, y dividir la mesa 7 con las líneas de la 4 seleccionadas no movería nada.
    const marcadas = source === this.orderId ? this.splitSel : new Set<string>();
    let nuevo = '';
    try {
      nuevo = await splitOrder(erplora(), source, marcadas, d.label ?? '');
    } catch {
      this.error = t('ui.splitFailed');
      return;
    }
    if (!nuevo) { this.error = t('ui.splitFailed'); return; }

    // La pantalla se queda en la SEGUNDA cuenta: dividir se hace para cobrarla, no para mirarla.
    this.splitSel = new Set();
    this.orderId = nuevo;
    this.orderLabel = d.label ?? this.orderLabel;
    if (d.table_id) this.tableId = d.table_id;
    rememberCurrentCheck(localStorage, nuevo);
    this.notifyOrderLinked();
    this.cart = await loadOrderLines(erplora(), nuevo);
    this.parked = await listOpenChecks(erplora(), nuevo);
  };
  // Transferir mesa (punto 4): el filler ya ejecutó tables.sessions.transfer; aquí se mueve la
  // comanda de la mesa origen a la destino (libre → sin comanda previa) y se limpia el origen.
  private readonly onOrderTransfer = async (e: Event) => {
    const d = (e as CustomEvent<{
      from_table_id: string; to_table_id: string; to_label?: string; to_order_id?: string | null;
    }>).detail;
    if (!d?.from_table_id || !d?.to_table_id || d.from_table_id === d.to_table_id) return;
    // ADR-0141: TRANSFERIR no mueve la comanda — es el MISMO pedido, que ahora cuelga de otra mesa
    // (la sesión nueva arrastró el `order_id`). Por eso los productos se conservan sin copiar nada:
    // aquí solo se actualiza el contexto de la pantalla. Antes había que reescribir dos blobs.
    if (this.tableId !== d.from_table_id) return;
    const previousTableLabel = this.tableLabel;
    this.tableId = d.to_table_id;
    this.tableLabel = d.to_label ?? this.tableLabel;
    if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
    const order = d.to_order_id ?? this.orderId;
    if (order && order !== this.orderId) {
      this.orderId = order;
      this.cart = await loadOrderLines(erplora(), order);
    }
  };
  private readonly onCustomerContext = (e: Event) => {
    const d = (e as CustomEvent<{
      customer_id: string | null; customer_name?: string;
      customer_tax_id?: string; customer_address?: string;
    }>).detail ?? { customer_id: null };
    this.customerId = d.customer_id ?? undefined;
    this.customerName = d.customer_name ?? '';
    this.customerTaxId = d.customer_tax_id ?? '';
    this.customerAddress = d.customer_address ?? '';
    // ADR-0141: el pedido NO guarda el cliente y `sales` NO llama a `customers` (sería depender de
    // él, y una tienda de alimentación vende sin clientes). La junction la escribe SU dueño al
    // recibir `erp:order-linked`, igual que hace `tables`. Aquí solo se guarda el SNAPSHOT FISCAL
    // (nombre/NIF/dirección), que es otra cosa: viaja congelado en la venta al cobrar (ADR-0132).
    this.notifyOrderLinked();
  };
  private readonly onOrderFire = () => { void this.fireToKitchen(); };
  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    const connectionEpoch = ++this.connectionEpoch;
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked, cats, prodCats, taxCatalog, unitRows,
             svcRows, svcCats, taxCats, fiscalLimits] = await Promise.all([
        erplora().queryAll<Product>('inventory.products.list').catch(() => []),
        erplora().query('sales.payment_methods').catch(() => []),
        erplora().query('sales.settings.get').catch(() => []),
        this.restoreOpenOrder(),
        listOpenChecks(erplora()),
        erplora().queryAll<Category>('inventory.categories.list', { sort: 'name', dir: 'asc' }).catch(() => []),
        erplora().queryAll<ProdCat>('inventory.product_categories').catch(() => []),
        loadTaxCatalog(erplora()),
        erplora().queryAll<UnitRow>('inventory.units.list').catch(() => [] as UnitRow[]),
        // sales#89 — el catálogo VENDIBLE de servicios. Lectura OPCIONAL (ADR-0127): `services` NO
        // está en `depends_on` a propósito, porque `depends_on` es un contrato DURO que obligaría a
        // todo restaurante a instalar el módulo y ataría `sales` a su cascada de desactivación. Un
        // hub sin `services` recibe `undefined` y el TPV sigue siendo exactamente el de antes.
        this.loadServices(),
        this.loadServiceCategories(),
        // Departamentos para la venta por precio libre (ADR-0085). Best-effort: si taxes no responde,
        // el sheet queda sin departamentos y avisa (no rompe el TPV).
        erplora().queryAll<TaxCategory>('taxes.categories.list').catch(() => [] as TaxCategory[]),
        // hub#297 — qué techo pone el régimen fiscal de ESTE hub. Es una query del CORE
        // (`hub.`), no de `verifactu`: así el TPV no gana una dependencia del módulo fiscal y la
        // respuesta no desaparece el día que alguien lo desinstale.
        //
        // Best-effort a propósito. Si no responde (hub anterior a la query, arranque a medias) se
        // vende exactamente como siempre: un TPV no deja de cobrar porque una lectura falle. Lo
        // que NO queda desprotegido es el cable — §15.8 en el validador para el registro igual, y
        // esa es la mitad que impide que el número se gaste en una factura que la AEAT rechaza.
        erplora().query('hub.fiscal.limits').catch(() => []),
      ]);
      if (connectionEpoch !== this.connectionEpoch || !this.isConnected) return;
      this.taxCatalog = taxCatalog;
      // `?? null` y no `?? 0`: el core ya devuelve `null` cuando el país no pone techo, y un 0 que
      // se colara aquí como importe pararía TODAS las ventas del local.
      this.simplifiedMaxCents =
        rows<{ simplified_invoice_max_cents?: number | null }>(fiscalLimits)[0]?.simplified_invoice_max_cents ?? null;
      for (const u of rows<UnitRow>(unitRows)) if (u.code) this.units.set(u.code, u);
      // sales#89: retail + servicios en la MISMA rejilla. Los servicios van detrás para que una
      // tienda sin `services` vea exactamente el orden de siempre.
      this.products = [...rows<Product>(prods).filter((p) => p.is_active !== 0), ...svcRows];
      void this.photos.replace(this.products.map((p) => p.image));
      for (const s of svcRows) {
        if (!s.category_id) continue;
        if (!this.prodCats.has(s.id)) this.prodCats.set(s.id, new Set());
        this.prodCats.get(s.id)!.add(s.category_id);
      }
      this.methods = rows<PayMethod>(methods);
      this.settings = rows<PosSettings>(settingsRows)[0] || {};
      this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
      this.payMethod = defaultPayMethod(this.payMethods);
      this.parked = parked;
      this.categories = [...rows<Category>(cats).filter((c) => c.name), ...svcCats];
      // Departamentos = categorías fiscales ACTIVAS (el inactivo no se ofrece para vender).
      this.taxCategories = rows<TaxCategory>(taxCats).filter((c) => c.key && c.is_active !== 0);
      for (const pc of rows<ProdCat>(prodCats)) {
        if (!this.prodCats.has(pc.product_id)) this.prodCats.set(pc.product_id, new Set());
        this.prodCats.get(pc.product_id)!.add(pc.category_id);
      }
      if (savedCart.length) this.cart = savedCart;
      // ADR-0077: la agenda manda aquí con `?appointment_id=`. Se consume UNA vez y se borra de la
      // URL — si sobreviviera, recargar la pantalla volvería a sembrar la misma cita sobre el
      // carrito. Va después del carrito guardado para no pisar una cuenta ya abierta.
      await this.consumeAppointmentDeepLink(svcRows);
      await this.updateComplete;
      this.addEventListener('erp:order-context', this.onOrderContext);
      this.addEventListener('erp:order-merge', this.onOrderMerge);
      this.addEventListener('erp:order-split', this.onOrderSplit);
      this.addEventListener('erp:order-transfer', this.onOrderTransfer);
      this.addEventListener('erp:customer-context', this.onCustomerContext);
      // Contrato del slot del footer: el filler emite `erp:order-fire` (bubbles+composed) y el
      // HOST ejecuta su comando — el estado del carrito vive aquí, al filler no viaja nada.
      this.addEventListener('erp:order-fire', this.onOrderFire);
      await this.resolveSlots();
      this.ensureSlotsMounted();
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorLoadingPos');
    } finally {
      this.cartRestored = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    ++this.connectionEpoch;
    this.photos.dispose();
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    this.removeEventListener('erp:order-context', this.onOrderContext);
    this.removeEventListener('erp:order-merge', this.onOrderMerge);
    this.removeEventListener('erp:order-split', this.onOrderSplit);
    this.removeEventListener('erp:order-transfer', this.onOrderTransfer);
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    this.removeEventListener('erp:order-fire', this.onOrderFire);
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    if (this.pendingSwitchAlert) {
      void this.pendingSwitchAlert.dismiss?.();
      this.pendingSwitchAlert.remove();
      this.pendingSwitchAlert = undefined;
    }
    this.categorySegmentCleanup?.();
    this.categorySegmentCleanup = undefined;
    this.categorySegment = undefined;
  }

  private async resolveSlots() {
    const sdk = (globalThis as {
      erplora?: { loadSlot?: (s: string) => Promise<Array<Record<string, unknown> & { component: string }>> };
    }).erplora;
    if (!sdk?.loadSlot) return;
    // Hidratación POR LITERAL (ADR-0127): el nombre del slot va en la propia llamada al SDK.
    let resolved: Array<Record<string, unknown> & { component: string }> = [];
    try { resolved = (await sdk.loadSlot('sales.pos.assign')) ?? []; } catch { resolved = []; }
    this.assignFillers = resolved.map((f) => ({
      component: f.component,
      el: document.createElement(f.component) as HTMLElement,
    }));
    // Acciones de la comanda: kitchen aporta aquí su «Enviar a cocina». El host lo monta dentro
    // de la vista Comanda actual; sin filler no existe esa vista ni queda hueco vacío.
    let acciones: Array<Record<string, unknown> & { component: string }> = [];
    try { acciones = (await sdk.loadSlot('sales.pos.actions')) ?? []; } catch { acciones = []; }
    this.actionFillers = acciones.map((f) => ({
      component: f.component,
      el: document.createElement(f.component) as HTMLElement,
    }));
    // Slot de INFO del pedido: kitchen cuelga aquí su chip de comandas (modal con estados).
    let info: Array<Record<string, unknown> & { component: string }> = [];
    try { info = (await sdk.loadSlot('sales.pos.order_info')) ?? []; } catch { info = []; }
    this.infoFillers = info.map((f) => ({
      component: f.component,
      el: document.createElement(f.component) as HTMLElement,
    }));
    this.requestUpdate();
  }

  /** (Re)engancha los botones de los fillers en el header; idempotente, sobrevive a re-renders. */
  private ensureSlotsMounted() {
    const host = this.renderRoot.querySelector('.cart-actions-slot') as HTMLElement | null;
    if (host) for (const f of this.assignFillers) {
      if (f.el.parentElement === host) continue;
      host.appendChild(f.el);
      // Al montarse, si ya hay un pedido reanudado, se le pide que recupere LO SUYO. El aviso de
      // `restoreOpenOrder` puede llegar ANTES de que los fillers existan (los resuelve el SDK de
      // forma asíncrona), y entonces no lo recibía nadie: la comanda salía «sin mesa» aunque la
      // mesa siguiera ocupada. Aquí el orden ya da igual.
      if (this.orderId) {
        f.el.dispatchEvent(new CustomEvent('erp:order-restored', { detail: { order_id: this.orderId }, bubbles: false }));
      }
    }
    // Acción de Cocina dentro de «Comanda actual»: las MISMAS instancias se reenganchan cuando
    // el usuario entra en esa vista, sin duplicar ni importar código del módulo proveedor.
    const draftActions = this.renderRoot.querySelector('.draft-actions-slot') as HTMLElement | null;
    if (draftActions) for (const f of this.actionFillers) {
      if (f.el.parentElement === draftActions) continue;
      draftActions.appendChild(f.el);
      this.emitPosState([f]);
    }
    // Info del pedido: el chip de comandas de kitchen vive en la cabecera de ENVIADO (solo se
    // pinta cuando hay líneas enviadas; el montaje resiliente lo re-engancha al reaparecer).
    const infoHost = this.renderRoot.querySelector('.sec-slot') as HTMLElement | null;
    if (infoHost) for (const f of this.infoFillers) {
      if (f.el.parentElement === infoHost) continue;
      infoHost.appendChild(f.el);
      this.emitPosState([f]);
    }
  }

  /** Cuenta a los fillers el estado mínimo del carrito (`erp:pos-state`). No viaja ninguna línea:
   *  `pending_count` permite que Mesas impida cambiar de cuenta antes de enviar la comanda y que
   *  Cocina pinte su acción/badge, sin acoplar esos módulos a los datos de sales. */
  private emitPosState(fillers = [...this.assignFillers, ...this.actionFillers, ...this.infoFillers]): void {
    for (const f of fillers) {
      f.el.dispatchEvent(new CustomEvent('erp:pos-state', {
        detail: {
          order_id: this.orderId,
          items_count: this.cart.length,
          pending_count: pendingLines(this.cart).length,
          kitchen_enabled: this.hasKitchen,
          label: this.tableLabel,
          channel: 'dine_in',
        },
        bubbles: false,
      }));
    }
  }

  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  private resetSlotContexts() {
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-context-reset', { bubbles: false }));
      f.el.dispatchEvent(new CustomEvent('erp:customer-context-reset', { bubbles: false }));
    }
  }

  protected updated(_changed: Map<PropertyKey, unknown>) {
    this.ensureSlotsMounted();
    const categorySegment = this.renderRoot.querySelector<HTMLElement>('ion-segment.category-segment') ?? undefined;
    if (categorySegment !== this.categorySegment) {
      this.categorySegmentCleanup?.();
      this.categorySegment = categorySegment;
      this.categorySegmentCleanup = bindTabbar(categorySegment ?? null);
    }
    // Estado del carrito → fillers del footer (contrato `erp:pos-state`). Barato y sin bucles:
    // el filler solo guarda el detail (no re-renderiza al host).
    this.emitPosState();
    // Los <dialog> se abren MODALES (top layer): inmunes al transform del drawer del carrito
    // (gotcha conocido: un overlay fixed dentro de un ancestro con transform queda atrapado).
    // El atributo `open` del markup ya los muestra donde showModal no exista (happy-dom).
    for (const d of this.renderRoot.querySelectorAll<HTMLDialogElement>('dialog.park-dialog, dialog.dirty-dialog')) {
      try {
        if (typeof d.showModal === 'function' && !d.matches(':modal')) { d.close(); d.showModal(); }
      } catch { /* sin soporte (happy-dom) o pseudo-clase desconocida: el atributo open basta */ }
    }
    if (this.parkPromptOpen) {
      const campo = this.renderRoot.querySelector<HTMLInputElement>('dialog.park-dialog input');
      // El default (la hora) va PRE-SELECCIONADO: teclear lo sobreescribe de un toque.
      if (campo && document.activeElement !== campo) { campo.focus(); campo.select(); }
    }
    // ADR-0141: YA NO se guarda el carrito aquí. Antes esto era un debounce de 400 ms que escribía
    // un blob JSON: si se iba la luz (o moría la tablet) dentro de esa ventana, el último artículo
    // se perdía. Ahora cada mutación (add/qty/invitación/quitar) escribe su FILA en el pedido de
    // forma transaccional e inmediata, así que aquí no queda nada pendiente que persistir.
  }


  // Dinero formateado con la MONEDA DEL HUB (ADR-0059): el SDK la resuelve de /api/hub/context
  // (misma fuente que dashboard/billing). Antes hardcodeaba '€' / la moneda por-módulo.
  // FIX QA (2026-06-25): el POS trabaja en CÉNTIMOS → formatMoney (divide /100), NO formatAmount
  // (que mostraba precios ×100).
  private money(n: number) { return erplora().formatMoney(Number(n) || 0); }
  /** Formas de pago que se ofrecen: activas (query) y permitidas por Ajustes (allow_*). */
  private get payMethods(): PayMethod[] {
    return enabledPayMethods(this.methods, {
      allow_cash: this.settings.allow_cash, allow_card: this.settings.allow_card,
      allow_transfer: this.settings.allow_transfer,
    });
  }

  /** Total PREVIEW con los descuentos (sales#71); la autoridad sigue siendo el servidor. */
  private get total() { return Math.max(0, cartTotal(this.cart, this.ticketDiscount) - this.ticketDiscountAmount); }
  /** Lo que el descuento de ticket quita (porcentaje + importe), para pintarlo. */
  private get ticketDiscountTotal() { return cartTotal(this.cart, 0) - this.total; }
  private get discountsAllowed(): boolean { return this.settings.allow_discounts !== 0; }
  private get itemCount() { return this.cart.reduce((s, l) => s + l.qty, 0); }
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }
  /** La capacidad Cocina existe solo si el registro de slots ha montado alguno de sus fillers. */
  private get hasKitchen() { return this.actionFillers.length > 0 || this.infoFillers.length > 0; }
  private get pendingCount() { return pendingLines(this.cart).length; }
  private get visibleOrderLabel() { return this.orderLabel || this.tableLabel; }

  /** Guarda el título en el pedido abierto. Antes de la primera línea queda preparado en memoria y
   *  `ensureOrder` lo usa al abrir el pedido, sin inventar otra entidad ni almacenamiento local. */
  private async saveOrderLabel(value: string): Promise<void> {
    const label = value.trim();
    this.orderLabel = label;
    if (!this.orderId) return;
    try {
      await erplora().command('sales.order.set_label', { order_id: this.orderId, label });
      this.parked = await listOpenChecks(erplora(), this.orderId);
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorSavingTitle');
    }
  }

  private focusOrderTitle(): void {
    const input = this.renderRoot.querySelector<HTMLInputElement>('.order-title');
    input?.focus();
    input?.select();
  }

  /** Presenta el aviso como overlay GLOBAL de Ionic. Declararlo en el template del WC lo deja
   *  dentro de su Shadow DOM y, al portalizarlo Ionic, puede aparecer como una superficie negra
   *  sin contenido. En body hereda correctamente el modo y los colores claro/oscuro del Hub. */
  private async showPendingSwitchAlert(count: number): Promise<void> {
    if (this.pendingSwitchAlert) return;
    const alert = document.createElement('ion-alert') as IonicAlertElement;
    alert.header = t('ui.pendingSwitchTitle');
    alert.message = t('ui.pendingBeforeSwitch', { count: String(count) });
    alert.buttons = [{ text: t('ui.close'), role: 'cancel' }];
    const cleanup = () => {
      if (this.pendingSwitchAlert === alert) this.pendingSwitchAlert = undefined;
      alert.remove();
    };
    alert.addEventListener('ionAlertDidDismiss', cleanup, { once: true });
    document.body.appendChild(alert);
    this.pendingSwitchAlert = alert;
    try {
      if (typeof alert.present === 'function') await alert.present();
      else alert.isOpen = true; // happy-dom/test: conserva el contrato aun sin runtime de Ionic.
    } catch {
      cleanup();
    }
  }

  /** En un TPV con Cocina no se cambia de cuenta desde el almacén mientras haya una comanda sin
   *  enviar. Sin Cocina no aplica: retail/peluquería pueden aparcar y recuperar con normalidad. */
  private blockPendingAccountSwitch(): boolean {
    if (!this.hasKitchen || this.pendingCount === 0) return false;
    this.orderView = 'draft';
    this.parkedOpen = false;
    this.cartOpen = true;
    void this.showPendingSwitchAlert(this.pendingCount);
    return true;
  }
  /** La categoría PRIMARIA de un producto (la primera de `prodCats`); `undefined` sin clasificar. */
  private primaryCategory(productId: string): string | undefined {
    return this.prodCats.get(productId)?.values().next().value ?? undefined;
  }
  private catCount(id: string) {
    const c = this.categories.find((x) => x.id === id);
    return c?.product_count ?? this.products.filter((p) => this.prodCats.get(p.id)?.has(id)).length;
  }

  /** Un ratón convencional no tiene gesto horizontal: sobre el segmento, su rueda desplaza las
   *  categorías lateralmente. Trackpad y táctil conservan su scroll nativo. */
  private onCategoryWheel(e: WheelEvent): void {
    const seg = e.currentTarget as HTMLElement;
    if (seg.scrollWidth <= seg.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault();
    seg.scrollLeft += e.deltaY;
  }

  /** Aparcar (ADR-0146): la cuenta se queda ABIERTA y solo se suelta de la pantalla. Ya no se
   *  copia a otra entidad —el pedido ya es la cuenta— y por eso no se pierde nada por el camino.
   *  Si venía de una mesa, su dueño la suelta también: la mesa queda libre para otros. */
  private async park() {
    if (!this.cart.length) return;
    this.notifyPark();
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
    this.orderLabel = '';
    this.cart = [];
    this.tableId = undefined;
    this.tableLabel = '';
    this.parkedOpen = false;
    // Ya no hay cuenta delante: la recién aparcada SÍ debe salir en la lista.
    this.parked = await listOpenChecks(erplora());
  }

  /** Punto de entrada del botón del desplegable. Con mesa es «DEJAR EN LA MESA» (la cuenta vive
   *  allí — modelo Toast/Lightspeed, decisión Ioan 2026-07-19): se suelta solo la PANTALLA y la
   *  mesa sigue ocupada con su cuenta. Sin mesa es APARCAR con nombre (default: la hora, patrón
   *  Loyverse), pre-seleccionado para sobreescribirlo de un toque. */
  private async requestPark(): Promise<void> {
    if (!this.cart.length) return;
    if (this.blockPendingAccountSwitch()) return;
    if (this.tableLabel.trim()) { await this.leaveOnTable(); return; }
    this.parkName = defaultParkLabel('', new Date());
    this.parkedOpen = false;
    this.parkPromptOpen = true;
  }

  /** «Dejar en la mesa»: etiqueta la cuenta con su mesa, suelta la PANTALLA y avisa a los
   *  fillers con `erp:order-detached` — que limpian su selección SIN tocar la sesión. La mesa
   *  sigue ocupada; la cuenta se recupera tocándola o desde la lista. JAMÁS aparca ni anula. */
  private async leaveOnTable(): Promise<void> {
    const id = this.orderId;
    const donde = this.tableLabel.trim();
    if (id && donde) await erplora().command('sales.order.set_label', { order_id: id, label: donde }).catch(() => undefined);
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
    this.orderLabel = '';
    this.cart = [];
    this.tableId = undefined;
    this.tableLabel = '';
    this.parkedOpen = false;
    this.notifyOrderDetached();
    erplora().notify?.({ type: 'success', message: t('ui.leftAtTable', { label: donde }) });
    this.parked = await listOpenChecks(erplora());
  }

  /** Avisa a los fillers de que la cuenta se suelta DE PANTALLA: limpian su selección local y
   *  nada más (la sesión de mesa no se toca — soltarla es `erp:order-parked`, otra cosa). */
  private notifyOrderDetached(): void {
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-detached', { detail: {}, bubbles: false }));
    }
  }

  /** Aparca la cuenta actual CON nombre: persiste la etiqueta y luego suelta la pantalla.
   *  Aparcar JAMÁS anula (`sales.order.void` solo sale de una decisión explícita de eliminar) —
   *  el void que vivía aquí era la causa de «los tiquets aparcados desaparecen». */
  private async parkWith(label: string): Promise<void> {
    const id = this.orderId;
    const nombre = label.trim() || defaultParkLabel('', new Date());
    this.orderLabel = nombre;
    if (id) await erplora().command('sales.order.set_label', { order_id: id, label: nombre }).catch(() => undefined);
    await this.park();
    erplora().notify?.({ type: 'success', message: t('ui.parkedToast', { name: nombre }) });
  }

  /** ELIMINAR la cuenta actual (decisión explícita del diálogo de carrito sucio): anula el pedido
   *  y limpia la pantalla. El rastro queda (`voided`), no se borra nada. */
  private async discardCurrent(): Promise<void> {
    const id = this.orderId;
    if (id) await erplora().command('sales.order.void', { order_id: id }).catch(() => undefined);
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
    this.orderLabel = '';
    this.cart = [];
    this.resetSlotContexts();
  }

  /** Abre el diálogo «¿aparcar o eliminar?» y espera la decisión. `allowCancel` solo al recuperar
   *  desde la lista (al tocar una mesa el filler ya cambió su selección: cancelar dejaría a los
   *  dos descoordinados, así que ahí solo hay aparcar/eliminar y cerrar equivale a aparcar). */
  private resolveDirtyCart(allowCancel: boolean): Promise<'park' | 'discard' | 'cancel'> {
    this.dirtyAllowCancel = allowCancel;
    this.dirtyOpen = true;
    return new Promise((res) => { this.dirtyResolve = res; });
  }

  private answerDirty(c: 'park' | 'discard' | 'cancel'): void {
    this.dirtyOpen = false;
    const res = this.dirtyResolve;
    this.dirtyResolve = undefined;
    res?.(c);
  }

  /** Eliminar una cuenta DE LA LISTA, en dos toques (armar → confirmar). Anula el pedido
   *  (`voided`, con rastro) — nunca de un roce: el primer toque solo cambia el icono. */
  private async deleteCheck(oc: OpenCheck): Promise<void> {
    if (this.armedDelete !== oc.id) {
      this.armedDelete = oc.id;
      if (this.armedTimer) clearTimeout(this.armedTimer);
      this.armedTimer = setTimeout(() => { this.armedDelete = undefined; }, 3000);
      return;
    }
    if (this.armedTimer) { clearTimeout(this.armedTimer); this.armedTimer = undefined; }
    this.armedDelete = undefined;
    await erplora().command('sales.order.void', { order_id: oc.id }).catch(() => undefined);
    this.parked = await listOpenChecks(erplora(), this.orderId);
  }

  /** Recuperar una cuenta abierta = CAMBIAR de cuenta, igual que tocar otra mesa. Qué pasa con lo
   *  de delante (decisión Ioan 2026-07-19): si tiene MESA, se queda EN SU MESA — ni se aparca ni
   *  se suelta la sesión, recuperable tocándola (patrón Toast/Lightspeed) — y se avisa con toast;
   *  sin mesa, se PREGUNTA: aparcar (con la hora de nombre) o eliminar. */
  private async retrieve(c: OpenCheck) {
    try {
      if (this.orderId !== c.id && this.blockPendingAccountSwitch()) return;
      if (this.cart.length && this.orderId !== c.id) {
        if (this.tableId) {
          // La cuenta de delante SE QUEDA EN SU MESA (los fillers sueltan solo la pantalla).
          await this.leaveOnTable();
        } else {
          this.parkedOpen = false;
          const eleccion = await this.resolveDirtyCart(true);
          if (eleccion === 'cancel') return;
          if (eleccion === 'discard') await this.discardCurrent();
          else await this.parkWith(defaultParkLabel('', new Date()));
        }
      }
      this.orderId = c.id;
      this.orderLabel = c.label ?? '';
      this.ticketDiscount = c.discount ?? 0; // sales#71
      this.ticketDiscountAmount = c.discount_amount ?? 0; // sales#113
      rememberCurrentCheck(localStorage, c.id);
      this.cart = await loadOrderLines(erplora(), c.id);
      this.notifyOrderRestored();
      this.parkedOpen = false;
      this.parked = await listOpenChecks(erplora(), c.id);
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorRetrieve');
    }
  }

  /** Avisa a los dueños de que la cuenta se aparca, para que suelten lo suyo (la mesa). */
  private notifyPark(): void {
    if (!this.orderId) return;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-parked', { detail: { order_id: this.orderId }, bubbles: false }));
    }
  }

  /** Avisa a los dueños de que se ha reabierto una cuenta, para que recuperen su contexto. */
  private notifyOrderRestored(): void {
    if (!this.orderId) return;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-restored', { detail: { order_id: this.orderId }, bubbles: false }));
    }
  }

  /** Reanuda LA CUENTA QUE TENÍA ESTE TERMINAL tras recargar (ADR-0141/0146).
   *
   *  Antes se cogía «el primer pedido abierto»: con varias cuentas abiertas eso es aterrizar en la
   *  de otro camarero. La cuenta en curso es estado del DISPOSITIVO, así que se recuerda ahí; si ya
   *  se cobró, se empieza en blanco y el camarero elige — no se cae a otra cualquiera. */
  private async restoreOpenOrder(): Promise<CartLine[]> {
    try {
      const cuentas = await listOpenChecks(erplora());
      const id = resolveCurrentCheck(localStorage, cuentas.map((c) => c.id));
      if (!id) return [];
      this.orderId = id;
      this.orderLabel = cuentas.find((c) => c.id === id)?.label ?? '';
      this.ticketDiscount = cuentas.find((c) => c.id === id)?.discount ?? 0; // sales#71
      this.ticketDiscountAmount = cuentas.find((c) => c.id === id)?.discount_amount ?? 0; // sales#113
      // El pedido vuelve, pero su MESA y su CLIENTE los saben sus dueños, no `sales`. Se les avisa
      // para que restauren lo suyo (y el de mesas nos devuelva el contexto por `erp:order-context`).
      // Sin esto, al recargar el TPV la comanda aparecía "sin mesa" aunque la mesa siguiera ocupada.
      for (const f of this.assignFillers) {
        f.el.dispatchEvent(new CustomEvent('erp:order-restored', { detail: { order_id: id }, bubbles: false }));
      }
      return await loadOrderLines(erplora(), id);
    } catch {
      return [];
    }
  }

  /** Avisa a los fillers de que hay pedido abierto para que ENLACEN lo suyo (mesa, cliente…).
   *  `sales` no escribe junctions ajenas ni conoce a esos módulos: solo publica el `order_id`.
   *
   *  Viaja también la CUENTA a la que engancharlo cuando se sabe (`pendingSplitSession`, sales#61).
   *  Una mesa dividida tiene varias cuentas vivas: sin ese id el dueño de la junction resuelve a la
   *  más antigua y el segundo pedido aterriza en la primera cuenta — las dos mitades acabarían
   *  cobrando la misma comanda. El id es OPACO para `sales`: se recibió en el evento y se reenvía. */
  private notifyOrderLinked(): void {
    if (!this.orderId) return;
    const session = this.pendingSplitSession;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-linked', {
        detail: session ? { order_id: this.orderId, session_id: session } : { order_id: this.orderId },
        bubbles: false,
      }));
    }
    // De un solo uso: la cuenta ya tiene su pedido, y lo siguiente que se abra no es suyo.
    this.pendingSplitSession = undefined;
  }

  /** Asegura que existe un pedido abierto que respalde el carrito; devuelve su id ('' si falla).
   *  Si hay una MESA seleccionada, avisa a los fillers (`tables`) para que escriban la junction
   *  mesa↔pedido — `sales` no toca `tables`: es un contrato por evento (ADR-0043/0141). */
  /** Manda a cocina lo pedido hasta ahora (ADR-0141). La comanda nace del PEDIDO, no del cobro: el
   *  camarero dispara al tomar nota y el pedido sigue abierto hasta que el cliente pague. Cada
   *  disparo es una RONDA (bebidas primero, comida después), y `kitchen` las numera.
   *
   *  La etiqueta que verá el cocinero es la de la mesa asignada, y viaja OPACA: `sales` no depende
   *  de `tables`, solo reenvía el texto que el slot de mesas le dejó en `tableLabel`. */
  /** sales#80 — un disparo en vuelo. El filler de kitchen puede emitir dos `erp:order-fire` con un
   *  doble toque; el segundo llega antes de que el primero haya releído las líneas y vería las
   *  mismas pendientes. Mientras haya uno en vuelo, los demás se ignoran (defensa en la UI); el
   *  handler además rechaza `sales.nothing_to_fire` si el pedido ya no tiene nada pendiente. */
  private firing = false;

  private async fireToKitchen(): Promise<void> {
    if (!this.cart.length || this.firing) return;
    this.firing = true;
    try {
      await this.fireToKitchenNow();
    } finally {
      this.firing = false;
    }
  }

  private async fireToKitchenNow(): Promise<void> {
    const orderId = await this.ensureOrder(this.cart[0]);
    // TANDAS (decisión Ioan 2026-07-19): se dispara SOLO lo pendiente, con su ronda local, y el
    // handler lo marca (`fired_at`). Antes cada fire reenviaba el carrito ENTERO: dos disparos =
    // comida duplicada en cocina. Vale para todo el TPV, con o sin modo restaurante — el modo
    // solo cambia lo que se VE (pestaña Tandas), no lo que se envía.
    const pendientes = pendingLines(this.cart);
    const payload = buildFirePayload(orderId, this.tableLabel, pendientes, nextRoundNo(this.cart));
    if (!payload) return;
    try {
      await erplora().command('sales.order.fire', payload as unknown as Record<string, unknown>);
      // Éxito → canal de AVISO del shell (toast verde). El hueco rojo es SOLO para fallos: decía
      // que algo había ido bien con la pinta de algo que había ido mal.
      erplora().notify?.({ type: 'success', message: t('ui.firedToKitchen') });
      // Las líneas recién marcadas (round_no/fired_at) se releen de la BD: es lo que bloquea su
      // edición y lo que pinta la ronda como «enviada» en la pestaña Tandas.
      if (this.orderId) this.cart = await loadOrderLines(erplora(), this.orderId);
    } catch (e) {
      // sales#80: «no había nada pendiente» significa que la tanda YA se envió (doble toque que
      // se coló, u otra caja): no es un fallo para el cajero — se relee el pedido y ya.
      const msg = e instanceof Error ? e.message : String(e ?? '');
      if (msg.includes('sales.nothing_to_fire')) {
        if (this.orderId) this.cart = await loadOrderLines(erplora(), this.orderId).catch(() => this.cart);
        return;
      }
      // Sin `kitchen` instalado el evento no lo escucha nadie: el comando de `sales` igual pasa.
      // Un fallo aquí NO debe bloquear la venta — la comanda se puede repetir.
      this.error = t('ui.fireFailed');
    }
  }

  /** Abre el pedido, opcionalmente ya con su primera línea.
   *
   *  🔴 sales#63 — `first: null` NO es un detalle: `sales.order.open` va con `sales.add_sale`, que
   *  tiene todo cajero. Si la línea de PRECIO LIBRE viajara dentro del payload que abre la cuenta,
   *  el importe entraría por una puerta que no pide el permiso y el control no ocurriría nunca.
   *  Por eso ese camino abre la cuenta VACÍA y añade su línea por el comando gateado. */
  private async ensureOrder(first: CartLine | null): Promise<string> {
    if (this.orderId) return this.orderId;
    // Si el usuario escribió un título antes de añadir la primera línea, nace ya etiquetado;
    // si no, la mesa sigue siendo el fallback legible del pedido.
    this.orderId = await openOrderWithLines(erplora(), first ? [first] : [], this.visibleOrderLabel);
    rememberCurrentCheck(localStorage, this.orderId);
    // Aviso a TODOS los fillers: cada uno enlaza lo suyo si tiene algo seleccionado (la mesa en
    // `tables`, el cliente en `customers`). `sales` no sabe qué enlazan ni le importa.
    this.notifyOrderLinked();
    return this.orderId;
  }

  /** Empuja una línea NUEVA al carrito (sin fusionar), persistiéndola YA: abre el pedido con ella si
   *  no hay ninguno, o la añade al abierto. La fila queda escrita ANTES de que la UI siga (un corte de
   *  corriente ya no se lleva el artículo). Compartido por `addNow` (producto de catálogo) y la venta
   *  por PRECIO LIBRE, que nunca fusiona: todas sus líneas llevan `id: ''`. */
  /** Empuja una línea de PRECIO LIBRE, siempre por su puerta (sales#63).
   *
   *  Dos reglas, y ninguna es cosmética: la cuenta se abre **vacía** si aún no existe (meter el
   *  importe en `sales.order.open` lo colaría por `sales.add_sale`), y la línea entra por
   *  `sales.order.add_open_line`, que pide `sales.sell_open_price`. Al cajero sin ese permiso el
   *  runtime le contesta `requires_elevation` y el shell levanta el PIN del encargado — no es un
   *  callejón sin salida, es la autorización en el momento sin cerrar su sesión (ADR-0238). */
  private async pushOpenPriceLine(line: CartLine): Promise<void> {
    const orderId = await this.ensureOrder(null);
    line.line_id = await addOpenPriceLine(erplora(), orderId, line);
    this.cart = [...this.cart, line];
  }

  private async pushNewLine(line: CartLine): Promise<void> {
    if (!this.orderId) {
      await this.ensureOrder(line);
      const persisted = this.orderId ? await loadOrderLines(erplora(), this.orderId) : [];
      this.cart = persisted.length ? persisted.map((pl) => ({ ...line, ...pl })) : [...this.cart, line];
      return;
    }
    line.line_id = await addOrderLine(erplora(), this.orderId, line);
    this.cart = [...this.cart, line];
  }

  /** Una sola vía para el trabajo del carrito. Sin esto, cinco toques seguidos abrían cinco
   *  pedidos: cada uno veía «aún no hay pedido» porque el anterior seguía en vuelo (ADR-0144). */
  private readonly queue = createSerialQueue();

  /** Lee `?appointment_id=` de la URL, siembra la cita y BORRA el parámetro.
   *
   *  El shell no pasa props ni la ruta a los Web Components, así que el deep link es el único canal
   *  que tiene la agenda para decir «cobra esta cita». Se limpia con `replaceState` para que la
   *  orden no quede pegada a la barra de direcciones. */
  private async consumeAppointmentDeepLink(services: Product[]): Promise<void> {
    let id: string | null = null;
    try {
      id = new URLSearchParams(window.location.search).get('appointment_id');
    } catch { return; }
    if (!id) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('appointment_id');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* sin History API no pasa nada: la siembra es lo que importa */ }
    await this.seedFromAppointment(id, services);
  }

  /** Siembra el carrito con el servicio de una CITA (ADR-0077, seam cerrado en sales#89).
   *
   *  `sales` no sabe qué es una cita: lee UNA query pública y se queda con dos ids OPACOS
   *  (`appointment_id`, `staff_id`) que reenvía al cobrar. No hay `depends_on`, ni JOIN, ni
   *  conocimiento del dominio de citas — un hub sin el módulo abre el TPV vacío y en paz.
   *
   *  La cita guarda `service_price` pero NO la categoría fiscal, así que el IVA quedaría colgando.
   *  Se resuelve contra el catálogo de servicios que el TPV ya carga para el walk-in: una sola
   *  fuente de verdad fiscal para las dos puertas. */
  private async seedFromAppointment(appointmentId: string, services: Product[]): Promise<void> {
    const rowsIn = await optionalRead((c) => c.queryOptional<unknown>('appointments.appointments.get', { id: appointmentId }));
    if (rowsIn === undefined) return; // módulo ausente: TPV vacío, sin ruido
    const ap = rows<AppointmentRow>(rowsIn)[0];
    if (!ap) return;

    // El catálogo manda en lo fiscal; la cita, en el precio pactado con el cliente.
    const svc = services.find((s) => s.id === ap.service_id);
    const price = Number(ap.service_price) || Number(svc?.price) || 0;
    const name = ap.service_name || svc?.name || '';
    if (!name) return;

    this.appointmentId = ap.id || appointmentId;
    this.staffId = ap.staff_id || undefined;
    if (ap.customer_id) this.customerId = ap.customer_id;
    if (ap.customer_name) this.customerName = ap.customer_name;

    const tax_category_key = svc?.tax_category_key;
    await this.queue(() => this.addNow({
      id: svc?.id ?? '', name, price, tax_category_key,
      is_service: true, pricing_type: 'fixed', is_active: 1,
    }));
  }

  /** El catálogo VENDIBLE de `services`, mapeado a la forma de la rejilla (sales#89).
   *
   *  Un servicio se cobra por la MISMA puerta que un producto —misma tarjeta, mismo carrito, mismo
   *  cobro— para que no pueda divergir del camino fiscal. Lo único que lo distingue es
   *  `is_service`, que hace que el handler no lo mida contra el catálogo de `inventory` ni le
   *  descuente stock. `services` es la autoridad del precio y de la categoría fiscal. */
  private async loadServices(): Promise<Product[]> {
    const rowsIn = await optionalRead((c) => c.queryOptional<unknown>('services.services.list', { page_size: 500 }));
    if (rowsIn === undefined) return []; // módulo no instalado: el TPV sigue siendo el de siempre
    return rows<ServiceRow>(rowsIn).map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price) || 0,
      // sales#99: without this the service never enters `prodCats` and its tab counts 0.
      category_id: s.category_id,
      tax_category_key: s.tax_category_key,
      pricing_type: s.pricing_type ?? 'fixed',
      is_service: true,
      is_active: 1,
    }));
  }

  /** Las categorías de servicio salen como una pestaña más: 40 servicios en un muro plano no son
   *  usables en una peluquería con cliente delante. */
  private async loadServiceCategories(): Promise<Category[]> {
    const rowsIn = await optionalRead((c) => c.queryOptional<unknown>('services.categories.list', { sort: 'name', dir: 'asc' }));
    if (rowsIn === undefined) return [];
    return rows<ServiceCat>(rowsIn).filter((c) => c.name).map((c) => ({ id: c.id, name: c.name }));
  }

  /** Motivo por el que este producto NO se puede cobrar, ya traducido; `undefined` si se puede
   *  (o si no hay catálogo fiscal con el que juzgarlo: eso es un incidente de `taxes`, no del
   *  producto, y cobrar es lo último que puede romperse). sales#74, ampliado en sales#89. */
  /** Best-effort: the shell toast goes ON TOP of our own notice, never instead of it. A shell with
   *  no notifier wired (or an older one) would leave the cashier with no explanation at all. */
  private notifyShell(message: string) {
    const c = erplora() as Partial<{ notify(n: { type: string; message: string }): void }>;
    try { c.notify?.({ type: 'warning', message }); } catch { /* el aviso propio ya está pintado */ }
  }

  private blockedReason(p: Product): string | undefined {
    // services#12: un servicio de precio NO cerrado ya no se bloquea — se PREGUNTA (ver `add`).
    // Cobrar «desde 65 €» como si fuera el precio sigue estando mal; la diferencia es que ahora
    // el TPV sabe pedir la cifra.
    switch (productSellability(this.taxCatalog, p.tax_category_key)) {
      case 'no_tax_category': return t('ui.notSellableNoTaxCategory');
      case 'no_tax_rule': return t('ui.notSellableNoTaxRule');
      default: return undefined;
    }
  }

  /** ¿Este servicio deja el precio SIN decidir? (services#12)
   *
   *  El mercado tiene dos estados, no cinco: un artículo lleva precio o es variable, y el variable
   *  «just asks the cashier how much» (Square; Vagaro lo cambia en el cobro). El «desde X» no es un
   *  motor de precios, es una etiqueta del catálogo — en Square ni siquiera existe. Así que
   *  `from`/`hourly`/`variable` caen todos en la misma pregunta, y `fixed`/`free` son precio final
   *  (gratis es una cifra decidida: preguntar sería preguntar algo que ya tiene respuesta). */
  private needsAmount(p: Product): boolean {
    return !!p.is_service && !CLOSED_PRICING.has(p.pricing_type ?? 'fixed');
  }

  private add(p: Product): Promise<void> {
    // sales#58 - a blocked tile DOES take the tap, and this is the only place that answers it.
    // Staying silent here is what turned "VAT is not configured yet" into "the POS is broken":
    // with no line, no error and no log, a cashier has no way to tell those two apart.
    const blocked = this.blockedReason(p);
    if (blocked) {
      this.blockedNotice = blocked;
      this.notifyShell(blocked);
      return Promise.resolve();
    }
    // Whatever does go in closes the incident: the notice is about the last tap, not a banner.
    this.blockedNotice = '';
    // services#12: si el servicio no trae precio final, esto no añade nada — abre la pregunta con
    // el importe listado como SUGERENCIA y su categoría fiscal ya elegida. Lo que el cajero
    // confirme entra por la puerta gateada (sales#63), que es donde vive el permiso.
    if (this.needsAmount(p)) {
      this.openOpenPrice({ amountCents: Number(p.price) || 0, deptKey: p.tax_category_key });
      return Promise.resolve();
    }
    return this.queue(() => this.addWithModifiers(p));
  }

  /** pm#93 — si lo que se añade tiene grupos de suplementos, se PREGUNTA antes; si no, se añade
   *  igual que siempre.
   *
   *  La lectura es OPCIONAL (ADR-0127): `undefined` = el módulo `modifiers` no está instalado, y el
   *  TPV sigue cobrando sin enterarse. Ese es el 99 % de las pulsaciones de un TPV, y meterles un
   *  paso sería empeorar el producto para casi todo el mundo. */
  private async addWithModifiers(p: Product) {
    const rows = await optionalRead((c) =>
      c.queryOptional<unknown>('modifiers.for_target', {
        target_kind: p.is_service ? 'service' : 'product',
        target_ref: p.id,
        category_ref: this.primaryCategory(p.id) ?? null,
      }),
    );
    const groups = groupModifierRows(Array.isArray(rows) ? rows : []);
    if (!groups.length) return this.addNow(p);
    this.modifierPicks = [];
    this.modifierSheet = { product: p, groups };
  }

  /** ¿Se puede confirmar la hoja? Un grupo con `min >= 1` sin resolver NO deja seguir: es una
   *  PRECONDICIÓN, no un aviso — Toast bloquea el envío a cocina por lo mismo. El techo `max` se
   *  respeta igual (0 = sin techo). */
  canConfirmModifiers(): boolean {
    const sheet = this.modifierSheet;
    if (!sheet) return false;
    return sheet.groups.every((g) => {
      const n = g.options.filter((o) => this.modifierPicks.includes(o.id)).length;
      return n >= g.min && (g.max === 0 || n <= g.max);
    });
  }

  /** Confirma la hoja y añade la línea con sus suplementos. Solo viajan los `option_id`, en el
   *  ORDEN elegido: el importe lo resuelve el servidor contra `modifiers.options.all`. */
  async confirmModifiers(): Promise<void> {
    const sheet = this.modifierSheet;
    if (!sheet || !this.canConfirmModifiers()) return;
    const picks = this.modifierPicks.map((option_id) => ({ option_id }));
    this.modifierSheet = undefined;
    this.modifierPicks = [];
    await this.addNow(sheet.product, picks);
  }

  private toggleModifier(id: string) {
    this.modifierPicks = this.modifierPicks.includes(id)
      ? this.modifierPicks.filter((x) => x !== id)
      : [...this.modifierPicks, id];
  }

  private async addNow(p: Product, picks: { option_id: string }[] = []) {
    // pm#93: la fusión mira los suplementos. Sin esto, una hamburguesa «sin cebolla» sube la
    // cantidad de la normal y cocina recibe «2 × Hamburguesa», una de ellas mal. Es la misma regla
    // que `sameCartLine` aplica al fusionar mesas, y este camino tenía su propia búsqueda.
    const fingerprint = (m?: { option_id: string }[]) => (m ?? []).map((x) => x.option_id).join('\u0000');
    const want = fingerprint(picks);
    const ex = this.cart.find((l) => l.id === p.id && !l.is_gift && fingerprint(l.modifiers) === want);
    // tax_category_key = referencia fiscal del producto (autoridad del servidor, ADR-0085).
    // tax_rate = % resuelto en cliente SOLO para el preview del total. cost = para el arqueo de regalos.
    const tax_rate = resolveLineTax(this.taxCatalog.rates, p.tax_category_key);
    try {
      if (ex) {
        // Ya está en la comanda: sube la cantidad y PERSISTE YA (una fila, no todo el carrito).
        const qty = ex.qty + 1;
        this.cart = this.cart.map((l) => (l === ex ? { ...l, qty } : l));
        // Antes esto solo escribía si YA se conocía el `line_id`; si no, la cantidad subía en
        // pantalla y no llegaba a la comanda (5 tortillas a la vista, 1 en la BD). `persistLineQty`
        // recupera el id releyendo el pedido, y si aun así no puede escribir, lo DECIMOS.
        if (this.orderId && !(await persistLineQty(erplora(), this.orderId, ex, qty))) {
          this.cart = this.cart.map((l) => (l.id === ex.id && !l.is_gift ? { ...l, qty: ex.qty } : l));
          this.error = t('ui.lineNotSaved');
        }
        return;
      }
      const line: CartLine = {
        id: p.id, name: p.name, sku: p.sku, price: Number(p.price), qty: 1,
        tax_category_key: p.tax_category_key, tax_rate, cost: Number(p.cost) || 0,
        // sales#12: la categoría se congela en la línea — es lo que enruta la comanda en kitchen y
        // sobrevive a retomar la cuenta (antes solo vivía en `prodCats`, en memoria).
        category_id: this.primaryCategory(p.id),
        // pm#93: solo los ids, en su orden de elección.
        ...(picks.length ? { modifiers: picks } : {}),
        // sales#89: viaja hasta `complete_sale`, que por él no mide la línea contra el catálogo de
        // `inventory` ni le descuenta stock, y hasta `sale.completed`, donde `inventory` la salta.
        ...(p.is_service ? { is_service: true } : {}),
        ...this.frozenUnitContext(p),
      };
      await this.pushNewLine(line);
    } catch (e) {
      // La comanda es la fuente de verdad: si la escritura falla, NO dejamos la UI mintiendo.
      // sales#81: si el error es del TRANSPORTE (el proxy devolvió HTML 502 porque el contenedor
      // del hub murió, o el fetch no llegó), el mensaje crudo del parser («<!DOCTYPE … is not
      // valid JSON») no le sirve al cajero: lo traducimos a un aviso de negocio. Los errores de
      // dominio pasan tal cual — su frase sí es útil.
      const transportKey = transportErrorKey(e);
      const msg = transportKey ? t(transportKey) : (e instanceof Error ? e.message : String(e));
      this.error = msg;
      // #270 — el banner `this.error` es discreto y en un TPV táctil se pierde → el rechazo del
      // backend parecía "no pasa nada" al tocar un producto. Avisamos además por el canal de toasts
      // del shell (mismo `notify` que los avisos de éxito) para feedback visible e inmediato.
      erplora().notify?.({ type: 'error', message: msg });
    }
  }

  /** Invitar/quitar invitación a una línea (comp, ADR-comp): toggle is_gift con un motivo por defecto.
   *  La línea regalo no se cobra (el servidor pone net/tax/total=0) pero descuenta stock. */
  private async toggleGift(id: string) {
    const ex = this.cart.find((l) => l.id === id);
    if (!ex) return;
    const is_gift = !ex.is_gift;
    const gift_reason = is_gift ? (ex.gift_reason || 'Invitación') : undefined;
    this.cart = this.cart.map((l) => (l === ex ? { ...l, is_gift, gift_reason } : l));
    // Cambia el importe de la línea → se persiste YA (ADR-0141).
    if (this.orderId && ex.line_id) {
      await updateOrderLineQty(erplora(), this.orderId, ex.line_id, ex.qty, ex.price, is_gift, gift_reason ?? '', ex.discount ?? 0);
    }
  }
  /** Contexto de unidades CONGELADO desde el maestro (ADR-0147 §2.4): unidad de la línea, su
   *  incremento y la cantidad de precio (KPEIN). Sin registro/unidad → unidad suelta implícita. */
  private frozenUnitContext(p: Product): Partial<CartLine> {
    const u = p.unit_code ? this.units.get(p.unit_code) : undefined;
    if (!u) return {};
    return {
      unit_code: u.code,
      unit_name: u.name || '',
      factor_num: Number(u.factor_num) || 1,
      factor_den: Number(u.factor_den) || 1,
      increment_value: Number(u.increment_value) || undefined,
      price_quantity_value: Number(p.price_quantity_value) || undefined,
      pricing_unit_code: p.pricing_unit_code || u.code,
    };
  }

  /** Paso del stepper de una línea: el incremento congelado de su unidad (1 para `ud`). */
  private stepOf(l: CartLine): number {
    return l.increment_value ? fromMicro(l.increment_value) : 1;
  }

  /** Fija la cantidad de una línea (desde ok-qty-stepper); al llegar a 0 la línea se elimina. */
  private async setQtyAbs(id: string, v: number, stepper?: HTMLElement & { value: number; updateComplete?: Promise<unknown> }) {
    const ex = this.cart.find((l) => l.id === id);
    if (!ex) return;
    // ADR-0147 §2.2: el incremento VALIDA, no redondea. Fuera de rejilla → se RECHAZA y el
    // pedido no se altera.
    const qtyMicro = toMicro(Math.max(0, v));
    if (!onGrid(qtyMicro, ex.increment_value ?? 0)) {
      this.error = `${t('ui.qtyOffGrid')} (${formatQuantity(ex.increment_value ?? 0)} ${ex.unit_code ?? ''})`.trim();
      // Incidencia 4a: el re-render NO repinta el campo del stepper — `.value=${l.qty}` no cambió
      // (0,5 → 0,5) y Lit no toca el input, que se queda con lo tecleado. Y el stepper COMMITEÓ lo
      // tecleado a su `value` antes de emitir `ok-change` (síncrono), así que restaurar en este
      // mismo tick tampoco repinta (valor neto igual → dirty-check). Se deja asentar su render en
      // vuelo y ENTONCES se restaura la propiedad: eso SÍ es un cambio → el input vuelve a la
      // cantidad real.
      if (stepper) {
        await stepper.updateComplete;
        stepper.value = ex.qty;
      }
      return;
    }
    const qty = fromMicro(qtyMicro);
    this.cart = qty > 0
      ? this.cart.map((l) => (l === ex ? { ...l, qty } : l))
      : this.cart.filter((l) => l !== ex);
    // Persistencia INMEDIATA de la fila (0 → se elimina del pedido).
    if (!this.orderId || !ex.line_id) return;
    if (qty > 0) await updateOrderLineQty(erplora(), this.orderId, ex.line_id, qty, ex.price, ex.is_gift, undefined, ex.discount ?? 0);
    else await removeOrderLine(erplora(), this.orderId, ex.line_id);
  }

  /** Imprime la CUENTA que se lleva a la mesa (no fiscal, ADR-0141).
   *
   *  Sale por la puerta GLOBAL del hub (`erplora.print`): impresora del rol `receipt` si la hay,
   *  cola del hub si no, y el diálogo del navegador como último respaldo. NO se imprime el DOM de
   *  la app —el papel vive en un ion-modal reparentado con shadow DOM y salía la app entera— sino
   *  el HTML PLANO en un iframe aislado.
   *
   *  Van DOS documentos con el mismo contenido y distinta forma, y confundirlos era el fallo
   *  (sales#78): el HTML plano es lo que imprime un navegador, y `data` es lo que lee el
   *  renderizador ESC/POS, que busca POR CLAVE (`items`, `business_name`) y con la forma de
   *  pantalla no falla —saca «ERPlora», sin líneas y TOTAL 0,00—. El `jobId` no es opcional: sin él
   *  la puerta ni intenta la cola del hub, y cambia con la cuenta para que una segunda ronda no se
   *  trague como duplicado. */
  /** Trae el catálogo de suplementos si la cuenta lo necesita (sales#148).
   *
   *  Solo cuando alguna línea lleva suplementos: en el 99 % de las cuentas de un TPV no hay
   *  ninguno, y cobrarle una lectura de más a ese 99 % por una integración accesoria es empeorar
   *  el producto para casi todo el mundo — el mismo criterio que `addWithModifiers`.
   *
   *  Lectura OPCIONAL (ADR-0127): si `modifiers` no está instalado no hay nada que resolver y la
   *  cuenta se imprime igual, con el id en lugar del nombre. Un papel feo es preferible a un cobro
   *  que el cliente no puede leer, que es justo el fallo que esta issue arregla. */
  private async loadModifierCatalog(): Promise<void> {
    if (!this.cart.some((l) => l.modifiers?.length)) return;
    const rows = await optionalRead((c) => c.queryOptional<unknown>('modifiers.options.all', {}));
    if (!Array.isArray(rows)) return;
    const map = new Map<string, PrintedModifier>();
    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const option_id = String(r.option_id ?? '');
      if (!option_id) continue;
      const name = String(r.name ?? '');
      const delta = Number(r.price_delta);
      map.set(option_id, {
        option_id,
        ...(name ? { name } : {}),
        ...(Number.isFinite(delta) ? { price_delta: delta } : {}),
      });
    }
    this.modifierCatalog = map;
  }

  /** Los suplementos de una línea, con el nombre que el cliente debe leer. Sin resolver queda el
   *  id: la línea sale fea, pero sale. */
  private resolvedModifiers(l: CartLine): PrintedModifier[] | undefined {
    if (!l.modifiers?.length) return undefined;
    return l.modifiers.map((m) => this.modifierCatalog.get(m.option_id) ?? { option_id: m.option_id });
  }

  /** El carrito en la forma de la CUENTA. Una sola fuente para el papel y para la pantalla del
   *  modal: si cada uno compusiera la suya, el camarero vería algo distinto de lo que imprime. */
  private prebillLines() {
    // La unidad congelada viaja con la línea (sales#28): la cuenta que se lleva a la mesa pinta
    // «1,5 kg», como el tiquet y la factura.
    return this.cart.map((l) => ({
      name: l.name, price: l.price, qty: l.qty, is_gift: l.is_gift,
      unit_code: l.unit_code, unit_name: l.unit_name,
      // sales#148: y sus suplementos, o el cliente paga un «+ queso» que su papel no nombra.
      ...(this.resolvedModifiers(l) ? { modifiers: this.resolvedModifiers(l) } : {}),
    }));
  }

  private async printPrebill() {
    // El nombre de cada suplemento sale del catálogo, no del navegador (sales#148).
    await this.loadModifierCatalog();
    const lines = this.prebillLines();
    const opts = {
      tableLabel: this.tableLabel || undefined,
      title: t('ui.prebillTitle'),
      notice: t('ui.prebillNotice'),
      fallbackName: t('ui.docDefaultBusiness'),
    };
    const html = receiptToPrintableHtml({
      ...(orderToPrebill(lines, this.settings, opts) as Parameters<typeof receiptToPrintableHtml>[0]),
      // sales#120: el papel de la cuenta sale en el idioma del hub (labels, no plantilla).
      labels: { subtotal: t('ui.docSubtotal'), total: t('ui.docTotal'), change: t('ui.docChange'), document: t('ui.document') },
    });
    const sdk = (globalThis as { erplora?: { print?: (r: Record<string, unknown>) => Promise<PrintOutcome> } }).erplora;
    if (!sdk?.print) {
      printHtmlInIframe(html);
      return;
    }
    const res = await sdk
      .print({
        role: 'receipt',
        documentType: 'prebill',
        jobId: prebillJobId(this.orderId, lines),
        data: prebillToPrintDocument(lines, this.settings, opts),
        html,
      })
      .catch((e: unknown) => ({ via: 'none', error: e instanceof Error ? e.message : String(e) }) as PrintOutcome);
    // Salió por una impresora, o quedó en la cola para que la saque un host: las dos son éxito.
    if (res?.via === 'bridge' || res?.via === 'queue') return;
    // Cualquier otra cosa hay que DECIRLA: en la app instalada el respaldo del navegador no imprime
    // nada, así que un fallo mudo deja al camarero yendo a la mesa con las manos vacías creyendo
    // que la cuenta está en la impresora.
    erplora().notify?.({
      type: 'error',
      message: res?.error ? `${t('ui.prebillPrintFailed')}: ${res.error}` : t('ui.prebillPrintFailed'),
    });
  }

  /** Marca/desmarca una línea para el cobro por partes. Solo tiene sentido con más de una línea:
   *  con una sola, «lo suyo» y «la cuenta» son lo mismo. */
  private toggleSplit(l: CartLine) {
    if (!l.line_id || this.cart.length < 2) return;
    const s = new Set(this.splitSel);
    if (s.has(l.line_id)) s.delete(l.line_id); else s.add(l.line_id);
    this.splitSel = s;
  }

  private openPay() {
    if (!this.cart.length) return;
    // Una clave por INTENTO de cobro (sales#20): todos los reintentos de ESTA pantalla comparten
    // clave, así que el servidor los resuelve a la misma venta en vez de duplicarla.
    this.checkoutKey = newIdempotencyKey();
    this.tendered = '';
    this.payMethod = defaultPayMethod(this.payMethods);
    this.docFormat = this.defaultDocFormat;
    // hub#297 — por encima del techo el tique NO es una opción, así que el formato se cambia solo
    // y lo que queda en pantalla es la única pregunta que sí hay que hacerle al cliente: quién es.
    //
    // El cambio de formato es LA conversión: `resolve_invoice_type` solo degrada, nunca asciende,
    // así que sin este `invoice` la venta saldría como F2 por muy completo que esté el cliente.
    if (this.overSimplifiedLimit) this.docFormat = 'invoice';
    this.paying = true;
  }

  /**
   * Con qué formato se ABRE el cobro (hub#962).
   *
   * `auto_invoice_with_tax_id` llevaba desde su alta guardándose sin que lo leyera nadie: un
   * interruptor que no hace nada es peor que no tener interruptor, porque el comercio cree haber
   * pedido algo. Lo que dice es exactamente esto — «si el cliente se ha identificado con su NIF, es
   * que quiere factura» — y es la regla que aplican Odoo, Holded y los TPV españoles: quien da su
   * NIF en el mostrador no lo da por gusto.
   *
   * No decide sobre el techo: por encima, `openPay` fuerza factura igual, porque ahí no es una
   * preferencia del comercio sino la ley.
   */
  private get defaultDocFormat(): 'ticket' | 'invoice' {
    if (this.settings.default_document_format === 'invoice') return 'invoice';
    const auto = this.settings.auto_invoice_with_tax_id;
    if ((auto === 1 || auto === true) && this.customerTaxId.trim()) return 'invoice';
    return 'ticket';
  }

  /**
   * ¿Hay algo que elegir? (hub#962) Por encima del techo de la simplificada, **no**: la venta sale
   * en factura por ley, y ofrecer un botón que devuelve a tique sería ofrecer romperla. Se oculta
   * en vez de deshabilitarse porque un control apagado y sin motivo se lee como una avería.
   */
  private get canChooseDocFormat(): boolean {
    return !this.overSimplifiedLimit;
  }

  /** El cajero elige. Por encima del techo no se admite volver a tique (ver `canChooseDocFormat`). */
  private chooseDocFormat(next: 'ticket' | 'invoice') {
    if (next === 'ticket' && this.overSimplifiedLimit) return;
    this.docFormat = next;
  }

  /** ¿Este cobro pasa del techo de la simplificada? (independiente de quién sea el cliente). */
  private get overSimplifiedLimit(): boolean {
    return isOverSimplifiedLimit(this.payable, this.simplifiedMaxCents);
  }

  /** Lo que el TPV le puede pedir al mostrador, reunido para no repetirlo en tres sitios. */
  private get limitState() {
    return {
      payableCents: this.payable,
      maxCents: this.simplifiedMaxCents,
      documentFormat: this.docFormat,
      customerName: this.customerName,
      customerTaxId: this.customerTaxId,
      customerAddress: this.customerAddress,
    };
  }

  /** ¿Se puede cerrar este cobro tal y como está? Ver `lib/simplified-limit.ts`. */
  private get chargeBlocked(): boolean {
    return ticketIsBlocked(this.limitState);
  }
  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // sales#71: el descuento de ticket pertenece a la CUENTA. Al soltarla (cobrada, aparcada,
    // eliminada, mesa cambiada) no puede arrastrarse a la siguiente.
    if (changed.has('orderId') && !this.orderId) { this.ticketDiscount = 0; this.ticketDiscountAmount = 0; }
  }
  private tap(k: string) { this.tendered = pushDigit(this.tendered, k); }

  // ── sales#71 · descuentos manuales ─────────────────────────────────────────────────────────
  openDiscount(target: 'line' | 'ticket', lineId?: string): void {
    // sales#113: si la cuenta ya lleva importe fijo, el sheet abre en € con él; si no, en %.
    this.discountMode = target === 'ticket' && this.ticketDiscountAmount > 0 && this.ticketDiscount === 0 ? 'amount' : 'percent';
    const current = target === 'ticket'
      ? (this.discountMode === 'amount' ? Number(centsToEuros(this.ticketDiscountAmount)) : this.ticketDiscount)
      : (this.cart.find((l) => l.line_id === lineId)?.discount ?? 0);
    this.discountInput = current > 0 ? String(current) : '';
    this.discountSheet = { target, lineId };
  }
  private setDiscountMode(mode: 'percent' | 'amount'): void {
    if (mode === this.discountMode) return;
    this.discountMode = mode;
    this.discountInput = '';
  }
  private tapDiscount(k: string) {
    const next = pushDigit(this.discountInput, k);
    // Un %: nunca por encima de 100 (el servidor también lo rechaza). Un importe: teclea EUROS.
    if (this.discountMode === 'amount' || Number(next || '0') <= 100) this.discountInput = next;
  }
  /** Importe tecleado en céntimos (modo €). */
  private get discountInputCents(): number { return Math.max(0, eurosToCents(this.discountInput || '0')); }
  /** sales#113 — aplica un importe FIJO (céntimos; 0 = quitar) al ticket, persistiéndolo en el pedido. */
  async applyDiscountAmount(cents: number): Promise<void> {
    const sheet = this.discountSheet;
    this.discountSheet = undefined;
    if (!sheet || sheet.target !== 'ticket') return;
    const value = Math.max(0, Math.round(cents));
    this.ticketDiscountAmount = value;
    if (this.orderId) {
      try { await erplora().command('sales.order.set_discount', { order_id: this.orderId, discount_percent: this.ticketDiscount, discount_amount: value }); }
      catch (e) { this.error = e instanceof Error ? e.message : String(e); }
    }
  }
  private get discountInputPct(): number { return Math.min(100, Math.max(0, Number(this.discountInput || '0'))); }
  /** Aplica el % tecleado (0 = quitar) a la línea o al ticket, persistiéndolo en el pedido. */
  async applyDiscount(pct: number): Promise<void> {
    const sheet = this.discountSheet;
    this.discountSheet = undefined;
    if (!sheet) return;
    const value = Math.min(100, Math.max(0, pct));
    if (sheet.target === 'ticket') {
      this.ticketDiscount = value;
      if (this.orderId) {
        try { await erplora().command('sales.order.set_discount', { order_id: this.orderId, discount_percent: value, discount_amount: this.ticketDiscountAmount }); }
        catch (e) { this.error = e instanceof Error ? e.message : String(e); }
      }
      return;
    }
    const line = this.cart.find((l) => l.line_id === sheet.lineId);
    if (!line) return;
    const discount = value > 0 ? value : undefined;
    this.cart = this.cart.map((l) => (l === line ? { ...l, discount } : l));
    if (this.orderId && line.line_id) {
      try { await updateOrderLineDiscount(erplora(), this.orderId, { ...line, discount }, value); }
      catch (e) { this.error = e instanceof Error ? e.message : String(e); }
    }
  }
  // El pinpad teclea EUROS («20» = 20 €); el contrato de la venta es CÉNTIMOS (ADR-0007/0123),
  // como `total`. Sin esta conversión: «Efectivo 0.20 €» y cambio 0 en el tiquet (QA 2026-07-17).
  private get tenderedNum() { return eurosToCents(this.tendered || '0'); }
  private get change() { return Math.max(0, this.tenderedNum - this.payable); }
  /** sales#24 — cash typed in but SHORT of the payable. 0 (nothing typed) means «exact amount»;
   *  the server refuses the same case (`sales.insufficient_tendered`), this just spares the trip. */
  private get tenderedShort(): boolean {
    return needsTendered(this.payMethod) && this.tenderedNum > 0 && this.tenderedNum < this.payable;
  }
  /** Lo que se cobra AHORA: la selección si la hay, o la cuenta entera (ADR-0146). */
  private get payable() {
    // sales#113: el importe fijo se resta del cobro entero (con split, el servidor lo reparte
    // igualmente sobre las líneas que se cobran; el preview resta lo que corresponda a lo cobrado).
    const base = splitTotal(this.cart, this.splitSel, this.ticketDiscount);
    return Math.max(0, base - (this.splitSel.size ? 0 : this.ticketDiscountAmount));
  }

  // ── Precio libre / venta por DEPARTAMENTO (fuera de catálogo) ──────────────────────────────
  /** Abre la pregunta del importe. Sin argumentos es la tecla suelta «Precio libre» (en blanco);
   *  con ellos viene de un SERVICIO de precio no cerrado y arranca sugerido (services#12).
   *  `0` no se sugiere: un «desde 0 €» no es una pista, es ruido en la casilla. */
  private openOpenPrice(seed?: { amountCents?: number; deptKey?: string }) {
    const cents = seed?.amountCents ?? 0;
    this.openAmount = cents > 0 ? centsToEuros(cents) : '';
    this.openDept = seed?.deptKey ?? '';
    this.openPriceOpen = true;
  }
  private tapOpen(k: string) { this.openAmount = pushDigit(this.openAmount, k); }
  /** El numpad teclea EUROS; el contrato es CÉNTIMOS (ADR-0007), igual que en el cobro. */
  private get openAmountCents() { return eurosToCents(this.openAmount || '0'); }
  /** El % del departamento para pintarlo junto a su nombre; vacío si taxes no dio reglas (preview). */
  private deptRateLabel(key: string): string {
    // sales#74 cambió `ratesMap` suelto por el catálogo con su mapa dentro; el preview es el mismo.
    const rates = this.taxCatalog.rates;
    return rates.has(key) ? `${rates.get(key)}%` : '';
  }
  /** Añade la venta libre: nombre = el del DEPARTAMENTO (estilo frutería, sin teclear), precio
   *  tecleado y su categoría fiscal. Nunca fusiona → siempre línea nueva (`pushNewLine`, serializada
   *  por `queue` como el resto del carrito). `buildOpenPriceLine` valida que no sea línea desnuda.
   *  sales#120: el nombre congelado es el del idioma del HUB (`display_name`, taxes#38) — es el que
   *  persiste como `product_name` y el que el cliente se lleva en el tique impreso; la IDENTIDAD
   *  fiscal sigue siendo `key`. */
  private async addOpenPrice(): Promise<void> {
    const dept = this.taxCategories.find((c) => c.key === this.openDept);
    if (!dept || this.openAmountCents <= 0) return;
    const line = buildOpenPriceLine({ name: deptDisplayName(dept), priceCents: this.openAmountCents, taxCategoryKey: dept.key });
    line.tax_rate = resolveLineTax(this.taxCatalog.rates, dept.key); // % SOLO para el preview del total
    this.openPriceOpen = false;
    try {
      await this.queue(() => this.pushOpenPriceLine(line));
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Cierra la venta. La IMPRESIÓN no se dispara desde aquí: la hace el shell por el Bridge al
   *  recibir `sale.completed` (ajuste `auto_print_on_sale`). El toggle de la pantalla de cobro
   *  refleja esa preferencia; el diálogo del navegador solo aparece como respaldo manual. */
  private async confirm(_print = false) {
    // hub#297 — la ÚLTIMA puerta antes de gastar un número de la cadena. El sheet ya deshabilita el
    // botón, pero esto no es una duplicación decorativa: a `confirm` se llega también por atajo, sin
    // pasar por `openPay`, y una guarda que solo vive en el `?disabled` de un botón es una guarda
    // que se salta el primer camino que no pinte ese botón.
    //
    // Se para ANTES de `busy = true`: no hay nada en vuelo que cancelar, solo una pregunta que
    // hacer. Y NO es un error — el cobro no ha fallado, le falta un dato —, así que no se escribe
    // en `this.error`: el sheet ya explica arriba por qué esto no puede salir como tique.
    if (this.chargeBlocked) {
      this.docFormat = 'invoice';
      this.paying = true;
      return;
    }
    // El aviso de duda muere al reintentar: si este intento vuelve a fallar, se decide de nuevo con
    // la evidencia de AHORA (hub#923).
    this.busy = true; this.error = ''; this.checkoutUnknown = false;
    // Declarados FUERA del try: el `catch` los necesita para preguntar por la venta (hub#923). La
    // clave se fija aquí — si el intento viene por atajo, sin pasar por `openPay`, se estrena una.
    if (!this.checkoutKey) this.checkoutKey = newIdempotencyKey();
    const checkoutKey = this.checkoutKey;
    const split = splitPayload(this.cart, this.splitSel);
    try {
      // ADR-0069: la AUTORIDAD del IVA es el servidor. Cada línea manda su `tax_category_key`
      // (referencia fiscal del producto) y el handler resuelve `rate_pct` desde el catálogo de
      // confianza (`taxes.rates.list` pre-cargado vía `reads`), expandiendo grupos. Mantenemos
      // `tax_rate` (% resuelto en cliente) SOLO como pista/preview; el handler lo ignora si puede
      // resolver el id (fallback al % solo si no hay catálogo o el id no existe — backward-compat).
      // category_id por línea (aditivo, QA 2026-06-25): el KDS enruta cada comanda a su estación
      // por la categoría del producto. Se toma la categoría PRIMARIA (primera) del producto desde
      // `prodCats` (Map product_id → Set category_id). null si el producto no está clasificado.
      // ADR-0146 — «cada uno paga lo suyo»: si hay líneas marcadas, este cobro cubre SOLO esas y el
      // pedido sigue abierto para los demás. Marcarlas todas equivale a cobrar la cuenta entera.
      const cobradas = split.line_ids
        ? this.cart.filter((l) => l.line_id && this.splitSel.has(l.line_id))
        : this.cart;
      // `quantity` viaja en punto fijo 10⁶ y la línea lleva su contexto de unidades congelado
      // (ADR-0147): el servidor valida la rejilla y calcula el importe por el SDK (KPEIN).
      // 🔴 sales#148: y sus SUPLEMENTOS. Sin ellos el servidor no tiene nada que valorar
      // (`authoritative_modifiers` devuelve delta 0 y snapshot vacío), así que la hamburguesa con
      // queso se cobraba a precio de hamburguesa —la línea del carrito lleva el precio BASE, el
      // delta lo pone el catálogo al cobrar— y `sales_sale_item.modifiers` se congelaba VACÍO, de
      // modo que el tique no podía nombrarlos por mucho que el papel supiera leerlos. Va SOLO el
      // `option_id`: un `price_delta` del navegador sería un descuento que se hace el cliente solo.
      const items = cobradas.map((l) => ({ product_id: l.id, product_name: l.name, product_sku: l.sku || '', price: l.price, quantity: toMicro(l.qty), tax_category_key: l.tax_category_key ?? null, tax_rate: l.tax_rate ?? 0, category_id: l.category_id ?? this.primaryCategory(l.id) ?? null, is_gift: l.is_gift ?? false, gift_reason: l.gift_reason ?? '', cost: l.cost ?? 0, discount: l.discount ?? 0, ...(l.modifiers?.length ? { modifiers: l.modifiers.map((m) => ({ option_id: m.option_id })) } : {}), ...unitContextPayload(l) }));
      await erplora().command('sales.complete_sale', {
        items,
        // sales#71: descuento de TICKET (%); el servidor lo prorratea por línea antes del IVA.
        discount_percent: this.ticketDiscount,
        // sales#113: importe FIJO (céntimos), repartido por resto mayor en el servidor (ADR-0210).
        // Con split (cobro parcial) no se manda: se aplica al cerrar la cuenta entera.
        ...(this.ticketDiscountAmount > 0 && !split.line_ids ? { discount_amount: this.ticketDiscountAmount } : {}),
        // sales#20: el servidor no cierra una venta sin clave, y con la misma clave dos veces
        // registra UNA. Es lo que hace seguro reintentar cuando el wifi del local parpadea.
        idempotency_key: checkoutKey,
        line_ids: split.line_ids ?? null,
        keep_order_open: split.keep_order_open,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        // El nombre viaja al tiquet: el de fábrica va traducido (seed canónico EN → i18n).
        // sales#108: the CANONICAL name travels (the server persists the catalogue row's name anyway,
        // ADR-0085); the ticket and the list translate it when they paint it.
        payment_method_name: this.payMethod?.name ?? '',
        // Sin entregado tecleado (tarjeta, importe justo) se cobra el PAYABLE: con split, caer al
        // total inflaba lo entregado y el cambio del tiquet.
        // sales#24: viaja SOLO lo que la cajera TECLEA. Sin nada tecleado (o con tarjeta) es importe
        // exacto y lo decide el servidor: el `payable` de pantalla es un preview que puede quedar por
        // debajo del total real (IVA excluido, a peso, descuentos) y haría saltar `insufficient_tendered`.
        ...(needsTendered(this.payMethod) && this.tenderedNum > 0 ? { amount_tendered: this.tenderedNum } : {}),
        channel: 'pos',
        source_module: 'pos',
        // ADR-0141: la venta nace de este PEDIDO. El servidor lo marca completado (open→completed)
        // en el cobro final; para split-bill se enviaría `keep_order_open: true`.
        order_id: this.orderId ?? null,
        // ADR-0077 (seam cerrado en sales#89) — ids OPACOS que `sales` reenvía sin interpretar.
        // `appointment_id` hace que el handler emita `sales.sale.created_from_appointment`, con el
        // que `appointments` marca la cita cobrada en SU listener; `staff_id` atribuye la venta a
        // la profesional que atendió (≠ `employee_id`, que es la persona que cobra).
        appointment_id: this.appointmentId ?? null,
        staff_id: this.staffId ?? null,
        customer_id: this.customerId ?? null,
        customer_name: this.customerName,
        // Snapshot fiscal del cliente (ADR-0132): sin esto la factura emitida desde el TPV sale sin
        // NIF ni dirección aunque el cliente los tenga en su ficha.
        customer_tax_id: this.customerTaxId,
        customer_address: this.customerAddress,
        // Tipo de documento fiscal (ADR-0140): viaja ATÓMICAMENTE con la venta; `invoice` lo lee del
        // evento para elegir F1 (completa) vs F2 (simplificada). Reemplaza al `set_document_type` retro.
        document_type: this.docFormat,
      });
      // complete_sale (WASM) no devuelve el id de la venta creada, así que la re-consultamos POR SU
      // CLAVE de idempotencia (sales#20). Antes se pedía «la última venta» (`sales.list` limit 1),
      // que con dos cajas cobrando a la vez devolvía la del compañero — y en un reintento devolvía
      // una venta que no era esta. El tipo ya quedó fijado dentro de complete_sale (ADR-0140).
      const recorded = rows<{ id: string }>(await erplora().query('sales.by_idempotency_key', { idempotency_key: checkoutKey }));
      const saleId = recorded[0]?.id;
      await this.finishSale(saleId, split);
    } catch (e) {
      await this.handleCheckoutFailure(e, checkoutKey, split);
    } finally {
      this.busy = false;
    }
  }

  /** Cierra la venta EN PANTALLA: limpia la comanda, suelta mesa y cliente, abre el documento.
   *
   *  Vive aparte porque hay DOS caminos que llegan aquí (hub#923): el cobro que responde, y el que
   *  perdió la respuesta pero cuya venta aparece luego por su clave de idempotencia. Duplicar este
   *  cierre era garantizar que un día divergieran. */
  private async finishSale(saleId: string | undefined, split: { keep_order_open?: boolean }) {
      // El intento terminó: la próxima venta estrena clave.
      this.checkoutKey = '';
      this.error = '';
      // Cobrada: limpia la comanda de ESA mesa (o el carrito suelto) antes de soltarla, si no la
      // comanda seguiría recuperándose al volver a tocar la mesa. La sesión la cierra el filler
      // al recibir el reset de abajo.
      if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
      this.paying = false;
      this.splitSel = new Set();

      // COBRO PARCIAL (ADR-0146): el pedido sigue abierto y en pantalla queda lo que falta por
      // pagar. Las líneas cobradas ya no vuelven —la query solo devuelve lo pendiente—, así que no
      // se pueden cobrar dos veces. La mesa tampoco se suelta: los demás siguen sentados.
      if (split.keep_order_open && this.orderId) {
        this.cart = await loadOrderLines(erplora(), this.orderId);
        if (saleId) this.docSaleId = saleId;
        return;
      }

      // Cobro de la cuenta entera: se limpia y se sueltan mesa y cliente.
      this.cart = [];
      // El pedido quedó `completed` en el servidor dentro de la misma transacción de la venta: se
      // suelta para que el siguiente ticket abra uno nuevo (ADR-0141).
      forgetCurrentCheck(localStorage);
      this.orderId = undefined;
      this.orderLabel = '';
      this.orderView = 'account';
      this.tableId = undefined; this.tableLabel = '';
      this.customerId = undefined; this.customerName = '';
      this.customerTaxId = ''; this.customerAddress = '';
      this.resetSlotContexts();
      if (saleId) this.docSaleId = saleId;
      // NOTA (impresión): aquí NO se llama a window.print(). El tiquet lo imprime el SHELL por el
      // BRIDGE (ESC/POS, rol `receipt`) escuchando `sale.completed` con el ajuste `auto_print_on_sale`
      // — ya existía (apps/web/src/lib/print-on-sale.ts) y el runtime no toca hardware (§2.7).
      // Abrir el diálogo del navegador por nuestra cuenta duplicaba ese camino y se lo comía.
      // El diálogo del navegador queda SOLO como respaldo manual, desde el botón del documento.
  }

  /** El cobro no terminó. Decide QUÉ se le dice al cajero — y esa decisión vale dinero.
   *
   *  hub#923 (saas#1460): con un fallo de TRANSPORTE no se sabe si la venta entró. En el incidente
   *  entró (200 en el servidor) y el proceso murió antes de que el cliente leyera la respuesta; la
   *  cajera vio la cadena cruda del motor, dedujo «no ha cobrado» y volvió a cobrar. Aquí se le
   *  pregunta al servidor por la CLAVE DE IDEMPOTENCIA, que es lo que convierte la duda en dato:
   *
   *    cobrada     → se cierra como si la respuesta hubiera llegado (el cliente ya pagó).
   *    no cobrada  → el servidor lo dice: reintentar es seguro (misma clave, nunca dos ventas).
   *    no se sabe  → se dice la verdad y se manda a Ventas. NUNCA «no se ha cobrado».
   *
   *  Un rechazo de DOMINIO (`sales.empty_sale`, …) no pasa por aquí: su frase lleva el código que
   *  el encargado necesita y se enseña tal cual. */
  private async handleCheckoutFailure(e: unknown, checkoutKey: string, split: { keep_order_open?: boolean }) {
    // OJO: `this.checkoutKey` NO se limpia en ninguna rama de fallo. Reintentar con la MISMA clave
    // es justo lo que impide que un timeout (la venta pudo entrar) acabe cobrando dos veces.
    if (transportErrorKey(e) !== SERVER_UNAVAILABLE_KEY) {
      const raw = e instanceof Error ? e.message : String(e ?? '');
      const key = checkoutErrorKey(raw);
      this.error = key === 'ui.errorCharge' && raw ? raw : t(key);
      return;
    }

    const recovery = await recoverCheckout(
      async (key) => rows<{ id: string }>(await erplora().query('sales.by_idempotency_key', { idempotency_key: key })),
      checkoutKey,
      // Dos intentos: un hub tumbado por OOM vuelve en segundos, y preguntar de nuevo es lo que
      // convierte «no sé» en una respuesta la mayoría de las veces.
      { attempts: 2 },
    );

    if (recovery.outcome === 'charged') {
      // La venta SÍ entró. Cerrar en silencio es lo correcto: el cliente pagó y el tique existe.
      await this.finishSale(recovery.saleId, split);
      return;
    }
    // `not_charged`: el servidor habló y no hay venta → el aviso de siempre, reintento seguro.
    // `unknown`: no se pudo preguntar → la duda explícita, con la salida a Ventas al lado.
    this.checkoutUnknown = recovery.outcome === 'unknown';
    this.error = t(this.checkoutUnknown ? 'ui.checkoutUnknown' : SERVER_UNAVAILABLE_KEY);
  }

  /** La salida del cobro dudoso (hub#923): ir a Ventas a comprobar si aquello se cobró.
   *
   *  Solo aparece cuando NO se pudo averiguar. Un Web Component no recibe el router, así que el
   *  canal módulo→shell es empujar la URL y avisar con `popstate` (mismo patrón que `appointments`
   *  al mandar una cita al TPV). */
  private renderCheckSalesLink() {
    if (!this.checkoutUnknown) return nothing;
    return html`<ion-button size="small" fill="outline" class="check-sales" data-testid="checkout-check-sales"
      @click=${() => this.goToSales()}>
      <ion-icon slot="start" name="cart-outline"></ion-icon>${t('ui.checkSales')}
    </ion-button>`;
  }

  private goToSales() {
    window.history.pushState({}, '', '/m/sales/sales');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  /** hub#297 — la captura de NIF + domicilio cuando la venta pasa del techo de la simplificada.
   *
   *  **En la MISMA pantalla del cobro**, no en un modal encima: quien la tiene que rellenar está
   *  con el cliente delante y con el importe a la vista, y mandarlo a otra pantalla es donde estos
   *  flujos se abandonan. Los tres campos se pintan siempre (no escondidos tras un botón) porque no
   *  son opcionales: sin ellos esta venta no tiene documento válido que emitir.
   *
   *  Los campos vienen RELLENOS si hay cliente asignado (`sales.pos.assign` → ADR-0132), así que el
   *  caso normal del cliente de empresa que ya está en la ficha es leer y cobrar. */
  private renderSimplifiedLimitCapture() {
    const done = recipientIsComplete(this.limitState);
    return html`
      <div class="limit-capture" data-testid="simplified-limit-capture" ?data-done=${done}>
        <div class="limit-head">
          <ion-icon name=${done ? 'document-text-outline' : 'alert-circle-outline'}></ion-icon>
          <div>
            <strong>${done ? t('ui.limitReadyTitle') : t('ui.limitBlockedTitle')}</strong>
            <p>${done
              ? t('ui.limitReadyBody')
              : t('ui.limitBlockedBody', { max: this.money(this.simplifiedMaxCents ?? 0) })}</p>
          </div>
        </div>
        <ion-input label=${t('ui.limitFieldName')} label-placement="stacked" .value=${this.customerName}
                   data-testid="limit-name" autocomplete="off"
                   @ionInput=${(e: CustomEvent) => { this.customerName = String((e.target as HTMLInputElement).value ?? ''); }}></ion-input>
        <ion-input label=${t('ui.limitFieldTaxId')} label-placement="stacked" .value=${this.customerTaxId}
                   data-testid="limit-tax-id" autocomplete="off"
                   @ionInput=${(e: CustomEvent) => { this.customerTaxId = String((e.target as HTMLInputElement).value ?? ''); }}></ion-input>
        <ion-input label=${t('ui.limitFieldAddress')} label-placement="stacked" .value=${this.customerAddress}
                   data-testid="limit-address" autocomplete="off"
                   @ionInput=${(e: CustomEvent) => { this.customerAddress = String((e.target as HTMLInputElement).value ?? ''); }}></ion-input>
      </div>`;
  }

  /** La REJILLA del catálogo: filtra por la categoría activa (la búsqueda por texto vive en el
   *  Spotlight, no empuja la rejilla). */
  private get filtered() {
    if (this.activeCat && this.prodCats.size) {
      return this.products.filter((p) => this.prodCats.get(p.id)?.has(this.activeCat));
    }
    return this.products;
  }

  /** Resultados del buscador SPOTLIGHT: `q` sobre TODO el catálogo (nombre o SKU), sin categoría. */
  private get searchResults() {
    const q = this.q.trim().toLowerCase();
    if (!q) return [];
    return this.products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }

  private renderCatBar() {
    const cell = (id: string, name: string, count: number) => html`
      <ion-segment-button class="cat-segment-button" value=${id}>
        <ion-label class="cat-segment-label">
          <span class="cc-n">${name}</span><span class="cc-c">${count} ${t('ui.items')}</span>
        </ion-label>
      </ion-segment-button>`;
    return html`
      <div class="catbar">
        <ion-segment class="category-segment" scrollable value=${this.activeCat}
          aria-label=${t('ui.categoryFilter')} @wheel=${this.onCategoryWheel}
          @ionChange=${(e: CustomEvent<{ value?: string }>) => { this.activeCat = e.detail.value ?? ''; }}>
          ${cell('', t('ui.all'), this.products.length)}
          ${this.categories.map((c) => cell(c.id, c.name, this.catCount(c.id)))}
        </ion-segment>
        <!-- Lupa: despliega el buscador (gana alto para la rejilla). Hueco natural para el micro
             de búsqueda por voz cuando llegue. -->
        <button class="arrow search-trigger" title=${t('ui.searchAction')} aria-pressed=${this.searchOpen}
          @click=${() => (this.renderRoot.querySelector('ok-spotlight-search') as { openSearch?: () => void } | null)?.openSearch?.()}>
          <ion-icon name="search-outline"></ion-icon>
        </button>
        ${this.renderMoreMenu()}
      </div>`;
  }

  /** Controles de chrome que el shell dice honrar en esta pestaña (`chrome="fullscreen …"`). */
  private get chromeControls(): string[] {
    return this.chrome.split(/\s+/).filter(Boolean);
  }

  /**
   * Menú ⋮ de la barra de categorías: lo que afecta a la PANTALLA, no a la venta.
   *
   * Va aquí y no en la barra del carrito porque en un móvil el carrito se cierra —y con él se
   * llevaría su cabecera—, mientras que la barra de categorías está en todos los tamaños. Es
   * también el único sitio que sigue en pie DENTRO del modo: la topbar del shell, que es donde
   * ADR-0048 puso este botón, se esconde ella misma al activarlo y se lleva la salida consigo.
   *
   * Hoy lleva un solo control; nace como menú a propósito, porque es la lista la que va a crecer.
   */
  private renderMoreMenu() {
    if (!this.chromeControls.length) return nothing;
    return html`
      <button class="arrow more-trigger" title=${t('ui.screenMenu')} aria-label=${t('ui.screenMenu')}
        aria-haspopup="menu" aria-expanded=${this.moreOpen}
        @click=${() => { this.moreOpen = !this.moreOpen; }}>
        <ion-icon name="ellipsis-vertical-outline"></ion-icon>
      </button>
      ${this.moreOpen
        ? html`
          <!-- Capa de cierre: un menú que solo se cierra por su propio botón se queda abierto en
               cuanto el cajero toca cualquier otra cosa. Transparente y sin scrim visible: es un
               menú, no un diálogo que exija atención. -->
          <div class="more-scrim" @click=${() => { this.moreOpen = false; }}></div>
          <!-- <dialog> nativo como el resto de overlays del TPV: los de Ionic dentro de un shadow
               Lit se re-parentan al body y pierden el CSS (ADR-0028). NO modal a propósito —es un
               menú anclado al ⋮, no un diálogo—, así que la salida con Esc se cablea a mano. -->
          <dialog class="more-menu" open role="menu"
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this.moreOpen = false; }}>
            ${this.chromeControls.includes('fullscreen')
              ? html`
                <button type="button" role="menuitem" data-action="fullscreen"
                  @click=${() => this.requestChrome('fullscreen')}>
                  <ion-icon name=${this.fullscreen ? 'contract-outline' : 'expand-outline'}></ion-icon>
                  <span>${this.fullscreen ? t('ui.exitFullscreen') : t('ui.fullscreen')}</span>
                </button>`
              : nothing}
          </dialog>`
        : nothing}`;
  }

  /**
   * Pide al SHELL un control de chrome (ADR-0048: el módulo es contenido, el chrome es del shell).
   * `composed` para salir del shadow root y `bubbles` para llegar al host del módulo; sin las dos
   * la petición muere dentro del componente. Quien no la escuche, no la atiende —y por eso el ⋮ no
   * se pinta si el shell no anunció el control.
   */
  private requestChrome(control: string): void {
    this.moreOpen = false;
    this.dispatchEvent(new CustomEvent('erp:chrome-request', {
      detail: { control, action: 'toggle' },
      bubbles: true,
      composed: true,
    }));
  }

  private renderCart() {
    return html`
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <div class="order-toolbar">
            ${this.parkingEnabled
              ? html`<ion-button class="header-action icon-action park-action" fill="clear" ?disabled=${!this.cart.length}
                    title=${t('ui.parkCurrentSale')} aria-label=${t('ui.parkCurrentSale')}
                    @click=${() => void this.requestPark()}>
                  <ion-icon slot="icon-only" name="pause-circle-outline"></ion-icon>
                </ion-button>`
              : nothing}
            <!-- Cada módulo sigue siendo dueño de su botón y modal. Sales solo ofrece el hueco. -->
            <span class="cart-actions-slot"></span>
            <span class="actions-spacer"></span>
            <ion-button class="header-action icon-action open-checks-action" fill="clear"
                        title=${t('ui.parkedTickets')} aria-label=${t('ui.parkedTickets')}
                        @click=${() => { this.parkedOpen = !this.parkedOpen; }}>
              <ion-icon slot="icon-only" name="receipt-outline"></ion-icon>
              ${this.parked.length ? html`<span class="badge-num">${this.parked.length}</span>` : nothing}
            </ion-button>
            <ion-button class="header-action cart-close" fill="clear" title=${t('ui.closeAction')}
                        aria-label=${t('ui.closeAction')} @click=${() => { this.cartOpen = false; }}>
              <ion-icon name="chevron-forward-outline"></ion-icon><small>${t('ui.closeAction')}</small>
            </ion-button>
          </div>
        </ion-toolbar>

        <div class="order-heading">
          <div class="order-title-row">
            <input class="order-title" .value=${this.visibleOrderLabel}
                   placeholder=${t('ui.newCheckTitle')} aria-label=${t('ui.checkTitleLabel')}
                   @input=${(e: Event) => { this.orderLabel = (e.target as HTMLInputElement).value; }}
                   @change=${(e: Event) => void this.saveOrderLabel((e.target as HTMLInputElement).value)} />
            <button class="title-edit" type="button" title=${t('ui.editCheckTitle')}
                    aria-label=${t('ui.editCheckTitle')} @click=${() => this.focusOrderTitle()}>
              <ion-icon name="create-outline"></ion-icon>
            </button>
          </div>
          <div class="order-context">
            <!-- Los módulos siguen siendo dueños de la asociación y del selector; sales solo
                 muestra las etiquetas opacas que recibe, iguales para Mesa y Cliente. Sus
                 botones permanecen libres arriba para asignar/cambiar cada contexto. -->
            ${this.tableLabel
              ? html`<ion-chip><ion-icon name="grid-outline"></ion-icon><ion-label>${this.tableLabel}</ion-label></ion-chip>`
              : nothing}
            ${this.customerName
              ? html`<ion-chip><ion-icon name="person-outline"></ion-icon><ion-label>${this.customerName}</ion-label></ion-chip>`
              : nothing}
            ${!this.tableLabel && !this.customerName
              ? html`<span class="context-empty">${t('ui.noCheckContext')}</span>` : nothing}
          </div>
        </div>

        ${this.hasKitchen ? html`
          <ion-segment class="view-tabs" .value=${this.orderView}
            @ionChange=${(e: CustomEvent) => { this.orderView = (e.detail as { value: 'account' | 'draft' }).value; }}>
            <ion-segment-button value="account"><ion-label>${t('ui.accountTab')}</ion-label></ion-segment-button>
            <ion-segment-button value="draft"><ion-label><span class="view-tab-label">
              ${t('ui.currentCommandTab')}
              ${this.pendingCount ? html`<span class="pending-dot">${this.pendingCount}</span>` : nothing}
            </span></ion-label></ion-segment-button>
          </ion-segment>` : nothing}
      </ion-header>

      ${this.parkedOpen
        ? html`
          <div class="pdrop-back" @click=${() => { this.parkedOpen = false; }}></div>
          <div class="pdrop">
            <ion-button size="small" expand="block" fill="outline" ?disabled=${!this.cart.length} @click=${() => void this.requestPark()}>${this.tableLabel.trim() ? t('ui.leaveAtTable') : t('ui.parkCurrentSale')}</ion-button>
            <p class="hint">${this.tableLabel.trim()
              ? t('ui.leaveAtTableHint', { label: this.tableLabel })
              : t('ui.parkForLaterHint')}</p>
            <p class="hint"><strong>${t('ui.parkedTickets')}</strong><br>${t('ui.openChecksHint')}</p>
            ${this.parked.map((oc) => html`<div class="pitem">
              <!-- La FILA entera recupera (objetivo táctil grande); eliminar es el icono aparte,
                   armado en dos toques para no borrar cuentas de un roce. Ya NO se bloquea con
                   algo marcado: lo de delante se aparca o se queda en su mesa (ADR-0146). -->
              <button class="prow" @click=${() => this.retrieve(oc)}>
                <span class="pn">${oc.label || this.money(oc.total)}</span>
                <span class="pm">${(oc.created_at || '').replace('T', ' ').slice(11, 16)}${oc.label ? ' · ' + this.money(oc.total) : ''}</span>
              </button>
              <ion-button size="small" fill="clear" color="danger" class="pdel"
                          title=${this.armedDelete === oc.id ? t('ui.deleteCheckConfirm') : t('ui.deleteCheck')}
                          aria-label=${this.armedDelete === oc.id ? t('ui.deleteCheckConfirm') : t('ui.deleteCheck')}
                          @click=${() => void this.deleteCheck(oc)}>
                <ion-icon slot="icon-only" name=${this.armedDelete === oc.id ? 'alert-circle-outline' : 'trash-outline'}></ion-icon>
              </ion-button>
            </div>`)}
            ${!this.parked.length ? html`<div class="hint hint--center">${t('ui.noParkedTickets')}</div>` : nothing}
          </div>`
        : nothing}

      <!-- El CUERPO. ion-content es quien scrollea: las líneas crecen aquí dentro y ni el header ni
           el pie se mueven. Con divs a pelo, una comanda larga empujaba el botón de COBRAR fuera de
           la pantalla — en un TPV eso es no poder cobrar. -->
      <ion-content class="cart-body">
        ${this.hasKitchen && this.orderView === 'draft'
          ? this.renderDraft()
          : this.hasFired ? this.renderSections() : this.renderOrderList()}
      </ion-content>

      <!-- El PIE. ion-footer es un pie de verdad: se queda abajo pase lo que pase. -->
      <ion-footer class="ion-no-border">
        <div class="cart-foot">
          ${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? html`
          <div class="ticket-discount-row"><span>${t('ui.discountTicket')}${this.ticketDiscount > 0 ? ` −${this.ticketDiscount}%` : ''}</span><span>−${this.money(this.ticketDiscountTotal)}</span></div>` : nothing}
          <div class="total"><span>${t('ui.colTotal')}</span><b>${this.money(this.total)}</b></div>
          <!-- Forma de pago ANTES de cobrar (decisión de Ioan): se elige aquí, con la comanda
               delante, y el modal de cobro queda limpio. Solo-icono porque son 3-4 opciones fijas
               que el camarero reconoce de un vistazo; el nombre va en title/aria. Solo aparecen
               las ACTIVAS (is_active en la query + los allow_* de Ajustes). -->
          <!-- Los iconos de forma de pago se eligen en RUNTIME (payMethodIcon), y el empaquetador
               del módulo solo hornea LITERALES: sin esta lista el icono viaja vacío y el botón sale
               en blanco (le pasó a Bizum). Oculta, solo para que el build los recoja; hay un test
               (pay-icons-baked) que vigila que estén todos. -->
          <span hidden aria-hidden="true">
            <ion-icon name="cash-outline"></ion-icon>
            <ion-icon name="card-outline"></ion-icon>
            <ion-icon name="phone-portrait-outline"></ion-icon>
            <ion-icon name="swap-horizontal-outline"></ion-icon>
            <ion-icon name="ticket-outline"></ion-icon>
            <ion-icon name="gift-outline"></ion-icon>
            <ion-icon name="ellipsis-horizontal-circle-outline"></ion-icon>
            <!-- Borrado en dos toques de la lista de cuentas: el nombre del icono es DINÁMICO
                 (trash → alert al armar), y el empaquetador solo hornea literales. -->
            <ion-icon name="trash-outline"></ion-icon>
            <ion-icon name="alert-circle-outline"></ion-icon>
            <!-- sales#71: el icono del descuento cambia con el estado (outline ↔ relleno). -->
            <ion-icon name="pricetag-outline"></ion-icon>
            <ion-icon name="pricetag"></ion-icon>
          </span>
          <!-- El MÉTODO de pago ya no se elige aquí: vive DENTRO del sheet de cobro, como la
               pantalla de tender de cualquier TPV (rediseño 2026-07-19). El footer solo acciona. -->
          <!-- Acciones SOLO-ICONO (ADR-0133): imprimir la CUENTA para llevarla a la mesa (no es un
               documento fiscal) y COBRAR (que sí emite el tiquet fiscal). El importe ya se ve
               grande arriba, así que el texto sobra; la etiqueta va en aria-label/title. -->
          <!-- El botón de COCINA ya no vive aquí: entra por el slot sales.pos.actions (lo
               aporta kitchen si está instalado/activo) y se monta dentro de Comanda actual. -->
          <div class="foot-actions">
            ${this.discountsAllowed ? html`
            <ion-button class="ticket-discount" fill="outline" ?disabled=${!this.cart.length}
                        color=${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? 'warning' : undefined}
                        title=${t('ui.discountTicket')} aria-label=${t('ui.discountTicket')}
                        @click=${() => this.openDiscount('ticket')}>
              <ion-icon slot="icon-only" name=${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? 'pricetag' : 'pricetag-outline'}></ion-icon>
            </ion-button>` : nothing}
            <ion-button class="prebill" fill="outline" ?disabled=${!this.cart.length}
                        title=${t('ui.printPrebill')} aria-label=${t('ui.printPrebill')}
                        @click=${() => { this.prebillOpen = true; void this.loadModifierCatalog(); }}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button class="charge" ?disabled=${!this.cart.length}
                        title=${t('ui.charge')} aria-label=${t('ui.charge')}
                        @click=${() => this.openPay()}>
              <ion-icon slot="start" name="card-outline"></ion-icon>
              ${t('ui.charge')} · ${this.money(this.total)}
            </ion-button>
          </div>
        </div>
      </ion-footer>`;
  }

  /** Vista temporal que existe únicamente cuando Cocina rellena sales.pos.actions. El botón
   *  sigue siendo propiedad de kitchen: sales solo lo coloca debajo de las líneas pendientes. */
  private renderDraft() {
    const pendientes = pendingLines(this.cart);
    return html`<div class="draft-pane">
      <p class="draft-hint">${t('ui.currentCommandHint')}</p>
      ${pendientes.length
        ? html`<ion-list class="lines" lines="none">${pendientes.map((l) => this.renderLine(l))}</ion-list>`
        : html`<div class="draft-empty"><ok-empty-state icon="checkmark-done-outline"
            heading=${t('ui.noPendingCommand')} message=${t('ui.noPendingCommandHint')}></ok-empty-state></div>`}
      <div class="draft-actions-slot"></div>
    </div>`;
  }

  /** ¿Hay líneas ya ENVIADAS a producción? El carrito se parte en secciones cuando el DATO lo
   *  dice — no hay toggle: la funcionalidad llega instalando módulos (kitchen dispara; una
   *  tienda jamás dispara y jamás ve secciones). Composición de lo básico a lo complejo. */
  private get hasFired(): boolean {
    return this.cart.some((l) => !!l.fired_at);
  }

  /** La pestaña PEDIDO (y el carrito plano sin modo restaurante): la cuenta a cobrar. */
  private renderOrderList() {
    return this.cart.length
      ? html`<ion-list class="lines" lines="full">
          ${this.cart.map((l) => this.renderLine(l))}
        </ion-list>`
      : html`<div class="empty">${t('ui.cartEmptyTouch')}</div>`;
  }

  /** Una línea de la cuenta. BLOQUEADA si ya salió a cocina (`fired_at`): la comida está en
   *  fuego — ni stepper ni invitación (el SQL también lo impone). Tocarla sigue marcándola para
   *  el cobro por partes: enviada ≠ no cobrable. */
  private renderLine(l: CartLine) {
    const locked = isLineLocked(l);
    return html`<ion-item class=${l.line_id && this.splitSel.has(l.line_id) ? 'sel' : ''}
        button ?detail=${false} @click=${() => this.toggleSplit(l)}>
      ${this.cart.length > 1 && l.line_id
        ? html`<ion-icon slot="start" class="selmark"
                  name=${this.splitSel.has(l.line_id) ? 'checkmark-circle' : 'ellipse-outline'}
                  color=${this.splitSel.has(l.line_id) ? 'primary' : 'medium'}></ion-icon>`
        : nothing}
      <ion-label>
        <h3>
          ${this.hasKitchen
            ? locked
              ? html`<ok-status-pill tone="success" size="sm" dot>${t('ui.commandRound', { n: String(l.round_no ?? '') })}</ok-status-pill>`
              : html`<ok-status-pill tone="warning" size="sm" dot>${t('ui.pendingStatus')}</ok-status-pill>`
            : nothing}
          <span>${l.name}</span>${l.is_gift
            ? html` <ion-badge color="success">${t('ui.giftBadge')}</ion-badge>` : nothing}</h3>
        <p>${priceLabel(this.money(l.price), l.unit_code)}${l.is_gift && l.gift_reason ? html` · ${l.gift_reason}` : nothing}${l.discount
          ? html` <ion-badge class="line-discount-badge" color="warning">−${l.discount}%</ion-badge>` : nothing}</p>
      </ion-label>
      <div slot="end" class="lineend">
        <span class="lt ${l.is_gift ? 'is-gift' : ''}">${this.money(lineAmount(l))}</span>
        ${locked
          ? html`<span class="lqty">×${formatQuantity(toMicro(l.qty))}</span>`
          : html`
            ${this.discountsAllowed ? html`
            <ion-button class="line-discount" fill="clear" size="small" title=${t('ui.discountLine')} aria-label=${t('ui.discountLine')}
                        @click=${() => this.openDiscount('line', l.line_id)}>
              <ion-icon name=${l.discount ? 'pricetag' : 'pricetag-outline'} slot="icon-only" color=${l.discount ? 'warning' : 'medium'}></ion-icon>
            </ion-button>` : nothing}
            <ion-button fill="clear" size="small" title=${t('ui.giftAction')} @click=${() => this.toggleGift(l.id)}>
              <ion-icon name=${l.is_gift ? 'gift' : 'gift-outline'} slot="icon-only" color=${l.is_gift ? 'success' : 'medium'}></ion-icon>
            </ion-button>
            <ok-qty-stepper .value=${l.qty} .min=${0} .step=${this.stepOf(l)}
              @ok-change=${(e: CustomEvent) => this.setQtyAbs(l.id, (e.detail as { value: number }).value,
                e.currentTarget as HTMLElement & { value: number; updateComplete?: Promise<unknown> })}></ok-qty-stepper>`}
      </div>
    </ion-item>`;
  }

  /** Secciones POR DATO (debate Ioan 2026-07-19, 2ª ronda): PENDIENTE DE ENVIAR arriba
   *  (editable — donde trabaja el camarero) y ENVIADO debajo (bloqueado, cobrable). El detalle
   *  por comanda — números, horas, ESTADOS EN VIVO del KDS — no vive aquí: lo aporta kitchen
   *  con su chip+modal por el slot `sales.pos.order_info` (montado en la cabecera de ENVIADO).
   *  El envío es el botón de kitchen dentro de «Comanda actual» (uno solo, con badge). */
  private renderSections() {
    const pendientes = pendingLines(this.cart);
    const enviadas = this.cart.filter((l) => !!l.fired_at);
    return html`<div class="secs">
      ${pendientes.length ? html`<div class="sec sec-pending">
        <div class="sec-h">
          <ion-icon name="create-outline" color="primary"></ion-icon>
          <span>${t('ui.courseInProgress')}</span>
          <span class="ccount">· ${pendientes.length}</span>
        </div>
        <ion-list class="lines" lines="full">${pendientes.map((l) => this.renderLine(l))}</ion-list>
      </div>` : nothing}
      ${enviadas.length ? html`<div class="sec sec-sent">
        <div class="sec-h">
          <ion-icon name="flame" color="warning"></ion-icon>
          <span>${t('ui.sentHeader')}</span>
          <span class="ccount">· ${enviadas.length}</span>
          <span class="sec-slot"></span>
        </div>
        <ion-list class="lines" lines="full">${enviadas.map((l) => this.renderLine(l))}</ion-list>
      </div>` : nothing}
    </div>`;
  }

  render() {
    return html`<div class="card">
      <div class="body">
        <div class="catalog">
          ${this.renderCatBar()}
          ${this.error ? html`<p class="err">${this.error}</p>${this.renderCheckSalesLink()}` : nothing}
          ${this.blockedNotice
            ? html`<div class="blocked-notice" role="status">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon><span>${this.blockedNotice}</span>
              </div>`
            : nothing}
          <div class="grid">
            ${this.filtered.map((p) => {
              // sales#74 — lo que el cobro va a rechazar (sin categoría fiscal, o con una que no
              // resuelve tipo) se pinta DESHABILITADO, no se esconde: escondiéndolo el negocio
              // nunca se entera de que tiene el catálogo a medio configurar. El motivo viaja en
              // `title`/`aria-label` y con una marca visible — no solo por color.
              const blocked = this.blockedReason(p);
              const photo = this.photos.get(p.image);
              // El degradado y las iniciales son el SUELO de la baldosa, no la alternativa a la
              // foto: se pintan siempre y la foto se superpone. Si la foto no llega —URL caduca,
              // 404, esquema que nadie resuelve, wifi caído al abrir— lo que asoma es el marcador,
              // no un hueco vacío. Antes eran el `else` de `image`, así que un producto CON foto
              // que no cargaba se quedaba sin foto Y sin iniciales: una baldosa en blanco.
              return html`<ion-card button class="tile" aria-disabled=${blocked ? 'true' : nothing}
                title=${blocked ?? nothing} aria-label=${blocked ? `${p.name} · ${blocked}` : nothing}
                @click=${() => this.add(p)}>
              <div class="thumb" style=${`background:${gradient(p.name)}`}>
                ${initials(p.name)}
                ${p.image && photo
                  ? html`<img src=${photo} alt="" loading="lazy" aria-hidden="true"
                      @error=${() => this.photos.drop(p.image!, photo)}>`
                  : nothing}
                ${blocked ? html`<span class="warn"><ion-icon name="alert-circle"></ion-icon></span>` : nothing}
              </div>
              <!-- sales#57: nombre y precio mandan. El SKU/slug NO se pinta (ruido interno que además
                   entraba en el nombre accesible del botón; Square/Toast/Lightspeed no lo enseñan —
                   vive en la búsqueda). La UNIDAD sí, cuando no es la pieza: «kg», «l». -->
              <div class="tinfo"><div class="n">${p.name}</div><div class="sku">${p.unit_code && p.unit_code !== 'ud' ? p.unit_code : ''}</div><div class="p">${this.money(Number(p.price))}</div>
                ${blocked ? html`<div class="blocked-badge">${t('ui.notSellableBadge')}</div>` : nothing}</div>
            </ion-card>`;
            })}
            <!-- PRECIO LIBRE: vender género suelto que no está fichado (fruta a ojo). Va al FINAL de la
                 rejilla para no interceptar el "primer producto" (que es lo que tocan los tests y el
                 flujo normal); es una acción aparte, no un producto de catálogo. -->
            <ion-card button class="tile open-price" @click=${() => this.openOpenPrice()}>
              <div class="thumb op-thumb"><ion-icon name="pricetag-outline"></ion-icon></div>
              <div class="tinfo"><div class="n">${t('ui.openPrice')}</div><div class="sku"></div><div class="p">+ €</div></div>
            </ion-card>
            ${!this.filtered.length ? html`<div class="empty">${t('ui.noProducts')}</div>` : nothing}
          </div>
        </div>

        <div class="cart-backdrop" ?data-open=${this.cartOpen} @click=${() => { this.cartOpen = false; }}></div>
        <aside class="cart" id="pos-cart-drawer" ?data-open=${this.cartOpen}>${this.renderCart()}</aside>

        <!-- Botón flotante de carrito (solo móvil). sales#84: nombre accesible con la cantidad (el
             badge visual no lo lee nadie), y estado abierto/cerrado del cajón que controla. -->
        <button class="fab"
                aria-label=${this.itemCount ? t('ui.openCartWithItems', { count: this.itemCount }) : t('ui.openCart')}
                aria-expanded=${this.cartOpen ? 'true' : 'false'} aria-controls="pos-cart-drawer"
                @click=${() => { this.cartOpen = true; }}>
          <ion-icon name="cart-outline" aria-hidden="true"></ion-icon>
          ${this.itemCount ? html`<span class="badge">${this.itemCount}</span>` : nothing}
        </button>
      </div>

      ${this.paying
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.paying = false; }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${t('ui.charge')}</span>
                <button class="x" @click=${() => { this.paying = false; }}>✕</button>
              </div>
              <!-- El IMPORTE manda en esta pantalla: grande, solo y SIEMPRE visible (fuera del
                   scroll). Antes vivía en letra pequeña del título y el ojo no lo encontraba. -->
              <div class="sheet-top">
                <div class="pay-total">${this.money(this.payable)}</div>
                ${this.splitSel.size
                  ? html`<div class="pay-split">${t('ui.payingPart', { n: String(this.splitSel.size), total: this.money(this.total) })}</div>`
                  : nothing}
              </div>
              <div class="pay">

                ${this.overSimplifiedLimit ? this.renderSimplifiedLimitCapture() : nothing}

                <!-- TIQUE o FACTURA (hub#962). Dos botones grandes al lado del importe, como el
                     método de pago: es la otra pregunta que el mostrador hace en voz alta
                     («¿necesita factura?») y hasta ahora no tenía dónde contestarse — solo se podía
                     dejar puesto un valor por defecto en Ajustes. Por encima del techo de la
                     simplificada no se pinta: ahí la factura es obligatoria y ofrecer el botón de
                     tique sería ofrecer romper la ley. -->
                ${this.canChooseDocFormat ? html`
                  <div class="pay-docformat" role="group" aria-label=${t('ui.documentFormat')}>
                    ${(['ticket', 'invoice'] as const).map((f) => html`
                      <button
                        class="pm-btn"
                        aria-pressed=${this.docFormat === f ? 'true' : 'false'}
                        @click=${() => this.chooseDocFormat(f)}
                      >${f === 'ticket' ? t('ui.docTicket') : t('ui.docInvoice')}</button>`)}
                  </div>` : nothing}

                <!-- El MÉTODO se elige AQUÍ, como en la pantalla de tender de cualquier TPV:
                     botones grandes con icono y NOMBRE (el dueño los renombra a su gusto, así que
                     un icono mudo no basta). Solo se pinta con más de un método activo. -->
                ${this.payMethods.length > 1 ? html`
                  <div class="pay-methods" role="group" aria-label=${t('ui.paymentMethod')}>
                    ${this.payMethods.map((m) => {
                      // Marcas que no existen en Iconify (Bizum) van INLINE desde ui/assets; el
                      // resto, su Ionicon. currentColor tiñe igual el SVG al seleccionar.
                      const marca = brandSvgFor(m.type, m.name);
                      const nombre = payMethodDisplayName(m, t);
                      return html`
                      <button class="pm-btn" aria-pressed=${this.payMethod?.id === m.id ? 'true' : 'false'}
                              title=${nombre}
                              @click=${() => { this.payMethod = m; if (!needsTendered(m)) this.tendered = ''; }}>
                        ${marca
                          ? html`<span class="brand">${unsafeSVG(marca)}</span>`
                          : html`<ion-icon name=${payMethodIcon(m.type, m.name)}></ion-icon>`}
                        <span class="pm-name">${nombre}</span>
                      </button>`;
                    })}
                  </div>` : nothing}

                <!-- Entregado/cambio/teclado SOLO en efectivo: con tarjeta se cobra el importe
                     exacto y no hay nada que teclear (lo decide requires_change, no un "si es
                     efectivo"). Los ATAJOS son el patrón Toast: el exacto y los redondeos por
                     encima — el cajero toca en vez de teclear y el cambio sale solo. -->
                ${needsTendered(this.payMethod)
                  ? html`
                    <div class="amt"><span>${t('ui.tendered')}</span><span class="v">${this.money(this.tenderedNum)}</span></div>
                    ${this.change > 0
                      ? html`<div class="amt big-change"><span>${t('ui.change')}</span><span class="v">${this.money(this.change)}</span></div>`
                      : nothing}
                    <!-- SIN atajos de importe (73/75/80…): Ioan los eliminó el 2026-07-19 y pidió
                         NO volver a añadirlos. El entregado se teclea en el numpad, punto. -->
                    <div class="numpad">
                      ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button @click=${() => this.tap(k)}>${k}</button>`)}
                    </div>`
                  : html`
                    <div class="amt pay-exact"><span>${t('ui.payExact')}</span><span class="v">${this.money(this.payable)}</span></div>
                    <p class="pay-hint">${t('ui.payCardHint', { amount: this.money(this.payable) })}</p>`}

                <!-- Imprimir deja de ser un botón gemelo del de cobrar (dos botones azules iguales
                     no dicen cuál hace qué): es una PREFERENCIA del cobro. -->
                <ion-item lines="none" class="print-row">
                  <ion-icon slot="start" name="print-outline"></ion-icon>
                  <ion-label>${t('ui.printReceipt')}</ion-label>
                  <ion-toggle slot="end" .checked=${this.printOnCharge}
                              @ionChange=${(e: CustomEvent) => { this.printOnCharge = !!(e.detail as { checked: boolean }).checked; }}></ion-toggle>
                </ion-item>

              </div>
              <div class="sheet-foot">
                ${this.error ? html`<p class="pay-err">${this.error}</p>${this.renderCheckSalesLink()}` : nothing}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla.
                     El importe es el PAYABLE: con split decía «Cobrar 3,60 €» para cobrar 1,80 €. -->
                <ion-button class="charge" expand="block" ?disabled=${this.busy || this.chargeBlocked || this.tenderedShort}
                            @click=${() => this.confirm(this.printOnCharge)}>
                  ${this.busy
                    ? t('ui.charging')
                    : this.chargeBlocked
                      // Dice lo que FALTA, no «no puedes». El motivo largo está arriba, en el aviso.
                      ? t('ui.limitChargeBlocked')
                      : this.tenderedShort
                        ? t('ui.tenderedShort')
                        : needsTendered(this.payMethod)
                        ? `${t('ui.charge')} ${this.money(this.payable)}`
                        : t('ui.chargeWithCard', { amount: this.money(this.payable) })}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <!-- PRECIO LIBRE: reutiliza el sheet del cobro (.scrim/.sheet/.numpad). Tecleas el importe y
           eliges el DEPARTAMENTO (categoría fiscal, que lleva su IVA); "Añadir" queda deshabilitado
           hasta tener importe > 0 y departamento (nunca una línea desnuda). -->
      ${this.modifierSheet
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) { this.modifierSheet = undefined; } }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${this.modifierSheet.product.name}</span>
                <button class="x" @click=${() => { this.modifierSheet = undefined; }}>✕</button>
              </div>
              <div class="pay">
                ${this.modifierSheet.groups.map((g) => html`
                  <div class="dept-label">
                    ${g.name}
                    <!-- La obligatoriedad se LEE de min/max: el cajero ve la misma regla que aplica
                         el servidor, en vez de una etiqueta que puede contradecirla. -->
                    <small>${g.min >= 1
                      ? t('ui.modifierRequired', { n: g.min })
                      : g.max > 0 ? t('ui.modifierUpTo', { n: g.max }) : t('ui.modifierOptional')}</small>
                  </div>
                  <div class="dept-grid" role="group" aria-label=${g.name}>
                    ${g.options.map((o) => html`
                      <button class="dept-btn" aria-pressed=${this.modifierPicks.includes(o.id) ? 'true' : 'false'}
                              @click=${() => this.toggleModifier(o.id)}>
                        <span class="dn">${o.name}</span>
                        <span class="dr">${o.price_delta ? this.money(o.price_delta) : ''}</span>
                      </button>`)}
                  </div>`)}
              </div>
              <div class="sheet-foot">
                <ion-button class="charge" expand="block" ?disabled=${!this.canConfirmModifiers()}
                            @click=${() => this.confirmModifiers()}>
                  ${this.canConfirmModifiers() ? t('ui.add') : t('ui.modifierPickOne')}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}
      ${this.openPriceOpen
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.openPriceOpen = false; }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${t('ui.openPrice')}</span>
                <button class="x" @click=${() => { this.openPriceOpen = false; }}>✕</button>
              </div>
              <div class="sheet-top"><div class="pay-total">${this.money(this.openAmountCents)}</div></div>
              <div class="pay">
                <div class="numpad">
                  ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button @click=${() => this.tapOpen(k)}>${k}</button>`)}
                </div>
                <div class="dept-label">${t('ui.department')}</div>
                <div class="dept-grid" role="group" aria-label=${t('ui.department')}>
                  ${this.taxCategories.map((c) => html`
                    <button class="dept-btn" aria-pressed=${this.openDept === c.key ? 'true' : 'false'}
                            @click=${() => { this.openDept = c.key; }}>
                      <span class="dn">${deptDisplayName(c)}</span>
                      <span class="dr">${this.deptRateLabel(c.key)}</span>
                    </button>`)}
                  ${!this.taxCategories.length ? html`<div class="dept-empty">${t('ui.noDepartments')}</div>` : nothing}
                </div>
              </div>
              <div class="sheet-foot">
                <ion-button class="charge" expand="block"
                            ?disabled=${!(this.openAmountCents > 0 && this.openDept)}
                            @click=${() => this.addOpenPrice()}>
                  ${t('ui.add')}${this.openAmountCents > 0 ? ` ${this.money(this.openAmountCents)}` : ''}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <!-- DESCUENTO (sales#71): mismo sheet/numpad del cobro. Se teclea el %, y Aplicar; 0 = quitar.
           Sobre la LÍNEA elegida o sobre el TICKET entero. El servidor prorratea y revalida
           allow_discounts; aquí solo se recoge la cifra. -->
      ${this.discountSheet
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.discountSheet = undefined; }}>
            <div class="sheet discount-sheet">
              <div class="sheet-h">
                <span class="t">${this.discountSheet.target === 'ticket'
                  ? t('ui.discountTicket')
                  : t('ui.discountLineOf', { name: this.cart.find((l) => l.line_id === this.discountSheet?.lineId)?.name ?? '' })}</span>
                <button class="x" aria-label=${t('ui.closeAction')} @click=${() => { this.discountSheet = undefined; }}>✕</button>
              </div>
              ${this.discountSheet.target === 'ticket' ? html`
              <!-- sales#113: % o € (importe fijo, «5 € menos»); ambos estándar en el mercado. -->
              <ion-segment class="discount-mode" value=${this.discountMode}
                @ionChange=${(e: CustomEvent<{ value?: string }>) => this.setDiscountMode(e.detail.value === 'amount' ? 'amount' : 'percent')}>
                <ion-segment-button value="percent"><ion-label>%</ion-label></ion-segment-button>
                <ion-segment-button value="amount"><ion-label>€</ion-label></ion-segment-button>
              </ion-segment>` : nothing}
              <div class="sheet-top"><div class="pay-total">${this.discountMode === 'amount'
                ? this.money(this.discountInputCents)
                : `${this.discountInput || '0'} %`}</div></div>
              <div class="pay">
                <div class="numpad">
                  ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button @click=${() => this.tapDiscount(k)}>${k}</button>`)}
                </div>
              </div>
              <div class="sheet-foot discount-foot">
                <ion-button fill="outline" color="medium"
                  @click=${() => (this.discountMode === 'amount' ? this.applyDiscountAmount(0) : this.applyDiscount(0))}>${t('ui.discountRemove')}</ion-button>
                ${this.discountMode === 'amount'
                  ? html`<ion-button class="charge" expand="block" ?disabled=${this.discountInputCents > cartTotal(this.cart, this.ticketDiscount)}
                      @click=${() => this.applyDiscountAmount(this.discountInputCents)}>
                      ${t('ui.discountApply')}${this.discountInputCents > 0 ? ` −${this.money(this.discountInputCents)}` : ''}
                    </ion-button>`
                  : html`<ion-button class="charge" expand="block" @click=${() => this.applyDiscount(this.discountInputPct)}>
                      ${t('ui.discountApply')}${this.discountInputPct > 0 ? ` −${this.discountInputPct}%` : ''}
                    </ion-button>`}
              </div>
            </div>
          </div>`
        : nothing}

      <!-- APARCAR sin mesa: se pide un NOMBRE (default: la hora, patrón Loyverse) pre-seleccionado
           para sobreescribirlo de un toque. <dialog> nativo: top layer, inmune al transform del
           drawer del carrito (gotcha conocido de overlays en ancestros con transform). -->
      ${this.parkPromptOpen ? html`
        <dialog class="park-dialog" open>
          <h3>${t('ui.parkTitle')}</h3>
          <p>${t('ui.parkNameHint')}</p>
          <input type="text" .value=${this.parkName} placeholder=${t('ui.parkNamePlaceholder')}
                 aria-label=${t('ui.parkNameLabel')}
                 @input=${(e: Event) => { this.parkName = (e.target as HTMLInputElement).value; }}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { this.parkPromptOpen = false; void this.parkWith(this.parkName); } }} />
          <div class="dlg-actions">
            <ion-button fill="clear" @click=${() => { this.parkPromptOpen = false; }}>${t('ui.cancel')}</ion-button>
            <ion-button class="park-confirm"
                        @click=${() => { this.parkPromptOpen = false; void this.parkWith(this.parkName); }}>
              ${t('ui.parkCurrentSale')}
            </ion-button>
          </div>
        </dialog>` : nothing}

      <!-- CARRITO SUCIO al recuperar/tocar mesa: ¿qué hacemos con la cuenta actual? Aparcar es la
           salida segura (primario); eliminar anula con rastro (danger). Cancelar solo desde la
           lista — al tocar una mesa el filler ya cambió su selección y cancelar los descoordina. -->
      ${this.dirtyOpen ? html`
        <dialog class="dirty-dialog" open>
          <h3>${t('ui.dirtyCartTitle')}</h3>
          <p>${t('ui.dirtyCartBody')}</p>
          <div class="dlg-actions">
            ${this.dirtyAllowCancel
              ? html`<ion-button fill="clear" @click=${() => this.answerDirty('cancel')}>${t('ui.cancel')}</ion-button>`
              : nothing}
            <ion-button class="discard-opt" color="danger" fill="outline"
                        @click=${() => this.answerDirty('discard')}>${t('ui.discardAndOpen')}</ion-button>
            <ion-button class="park-opt" @click=${() => this.answerDirty('park')}>${t('ui.parkAndOpen')}</ion-button>
          </div>
        </dialog>` : nothing}

      <!-- Buscador de productos = ok-spotlight-search (OutfitKit): overlay translúcido flotante que
           NO empuja la rejilla. La lupa del catbar controla su apertura. Al pulsar un resultado se
           añade al carrito y se cierra. -->
      <ok-spotlight-search placeholder=${t('ui.searchProductPlaceholder')} .value=${this.q}
        @ok-open=${(e: CustomEvent) => { this.searchOpen = e.detail.open; if (!e.detail.open) this.q = ''; }}
        @ok-input=${(e: CustomEvent) => { this.q = e.detail.value; }}>
        <ion-list class="sp-list" lines="none">
          ${this.searchResults.map((p) => {
            // Misma regla que la rejilla: buscar un producto no es otra puerta para colar en la
            // cuenta lo que no se puede cobrar (sales#74).
            const blocked = this.blockedReason(p);
            return html`
            <ion-item button detail="false" aria-disabled=${blocked ? 'true' : nothing} title=${blocked ?? nothing}
              @click=${() => { this.add(p); this.q = ''; (this.renderRoot.querySelector('ok-spotlight-search') as { close?: () => void } | null)?.close?.(); }}>
              <ion-label><h3>${p.name}</h3>${blocked ? html`<p class="sp-warn">${blocked}</p>` : p.sku ? html`<p>${p.sku}</p>` : nothing}</ion-label>
              <span slot="end" class="sp-price">${this.money(Number(p.price))}</span>
            </ion-item>`;
          })}
          ${this.q.trim() && !this.searchResults.length ? html`<div class="empty">${t('ui.noProducts')}</div>` : nothing}
        </ion-list>
      </ok-spotlight-search>

      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => { this.docSaleId = undefined; }, t })}
      <!-- CUENTA previa (ADR-0141): lo que se lleva a la mesa antes de cobrar. NO es fiscal — sin
           número de serie ni QR VeriFactu; el tiquet fiscal lo emite el cobro. -->
      <ion-modal class="doc-modal" .isOpen=${this.prebillOpen}
                 @ionModalDidDismiss=${() => { this.prebillOpen = false; }}>
        <ion-header><ion-toolbar>
          <ion-title>${t('ui.prebillTitle')}</ion-title>
          <ion-buttons slot="end">
            <ion-button title=${t('ui.print')} aria-label=${t('ui.print')} @click=${() => void this.printPrebill()}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button title=${t('ui.close')} aria-label=${t('ui.close')}
                        @click=${() => { this.prebillOpen = false; }}>
              <ion-icon slot="icon-only" name="close-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="doc-body ion-padding">
          <!-- .receipt and .labels are the ONLY properties ok-receipt reads. The bill used to be
               handed to it on .data —a property that does not exist— so receipt stayed undefined
               and the document was a white box reading «No receipt data.» in English on a Spanish
               hub (sales#87). Both defects were that one line: no document AND no labels, so the
               component fell back to its own built-in English DEFAULT_LABELS.
               (No backticks in comments inside a Lit template: they close the literal.) -->
          <ok-receipt id="prebill-doc" .receipt=${orderToPrebill(
            this.prebillLines(),
            this.settings,
            { tableLabel: this.tableLabel || undefined, title: t('ui.prebillTitle'), notice: t('ui.prebillNotice'), fallbackName: t('ui.docDefaultBusiness') },
          )} .labels=${receiptLabels(t)}></ok-receipt>
        </ion-content>
      </ion-modal>
    </div>`;
  }
}

define('erp-pos-touch', ErpPosTouch);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos-touch': ErpPosTouch;
  }
}
