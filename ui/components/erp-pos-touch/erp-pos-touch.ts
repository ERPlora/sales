import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
// La frontera EUROS ↔ CÉNTIMOS vive en el SDK (ADR-0123), no copiada en cada WC (como el desktop).
import { eurosToCents } from '@erplora/module-sdk';
import { renderDocumentModal } from '../../lib/document-modal.js';
import { orderToPrebill } from '../../lib/document-mappers.js';
import { receiptToPrintableHtml, printHtmlInIframe } from '../../lib/receipt-html.js';
import { decideOnTableChange } from '../../lib/table-switch.js';
import { defaultParkLabel } from '../../lib/park-label.js';
import { pendingLines, nextRoundNo, isLineLocked } from '../../lib/rounds.js';
import { buildFirePayload } from '../../lib/fire-order.js';
import { createSerialQueue } from '../../lib/serial-queue.js';
import { splitPayload, splitTotal } from '../../lib/split-selection.js';
import { forgetCurrentCheck, rememberCurrentCheck, resolveCurrentCheck } from '../../lib/current-check.js';
import { brandSvgFor } from '../../lib/brand-icons.js';
import { priceLabel } from '../../lib/price-label.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { payMethodIcon, needsTendered, enabledPayMethods, defaultPayMethod, payMethodDisplayName } from '../../lib/pay-icons.js';
import '@erplora/outfitkit/ok-qty-stepper';
import '@erplora/outfitkit/ok-spotlight-search';
import {
  mergeCartLines, listOpenChecks, type OpenCheck,
  // ADR-0141: el carrito lo respalda un PEDIDO real (filas), no un blob con debounce.
  openOrderWithLines, addOrderLine, updateOrderLineQty, persistLineQty, removeOrderLine, loadOrderLines, mergeOrders,
  unitContextPayload, type CartLine, type ErploraClientLike,
} from '../../lib/pos-cart.js';
import { buildCategoryRatesMap, resolveLineTax } from '../../lib/pos-tax.js';
// La frontera de la ESCALA de cantidades (ADR-0147): la UI trabaja en lógico (0,5), el cable en 10⁶.
import { toMicro, fromMicro, onGrid, formatQuantity } from '../../lib/quantity.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-pos-touch — pantalla de venta TÁCTIL: un "canvas" oscuro de TPV. A la izquierda el catálogo
// con su carrusel de CATEGORÍAS (tarjetas con imagen/gradiente + nº de productos, flechas ‹ ›) y la
// rejilla de PRODUCTOS (ion-card con foto destacada). A la derecha el carrito: cabecera con los
// "hooks" de contexto (mesa `tables` / cliente `customers`, ADR-0043) + desplegable de tickets
// aparcados + pantalla completa, la lista (ion-list + ok-qty-stepper) y el pie con Total + Cobrar
// (naranja). En móvil el carrito se recoge a un drawer abierto desde un botón flotante naranja.
// Quitar línea = cantidad a 0. Al cobrar: `sales.complete_sale` (channel='pos') → documento.

interface Product {
  id: string; name: string; sku?: string; price: number; cost?: number; is_active?: number;
  product_type?: string; image?: string; tax_category_key?: string;
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
}
interface Category { id: string; name: string; icon?: string; color?: string; image?: string; product_count?: number; }
interface ProdCat { product_id: string; category_id: string; }

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
      --accent-2: var(--ion-color-primary-shade, #0081b9);
      display:block; height:100%; box-sizing:border-box; font-family: system-ui, sans-serif; color:var(--tx);
    }
    *, *::before, *::after { box-sizing:border-box; }

    .card { height:100%; display:flex; flex-direction:column; overflow:hidden; background:var(--bg);
      border:1px solid var(--ion-border-color); border-radius:16px; }
    .body { position:relative; flex:1; min-height:0; display:grid; grid-template-columns: 1fr 23rem; }

    /* ── Catálogo ── */
    .catalog { display:flex; flex-direction:column; min-width:0; padding:.8rem; }
    .catbar { display:flex; align-items:center; gap:.4rem; margin-bottom:.7rem; }
    .arrow { flex:none; width:2.1rem; height:2.1rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
    .arrow:hover { background:var(--tile-hi); color:var(--tx); }
    .arrow ion-icon { font-size:1.1rem; }
    .seg { flex:1; min-width:0; display:flex; gap:.55rem; overflow-x:auto; scroll-behavior:smooth; padding:.15rem; scrollbar-width:none; }
    .seg::-webkit-scrollbar { display:none; }
    .catcard { flex:none; width:9.5rem; height:4.4rem; border-radius:12px; overflow:hidden; position:relative; cursor:pointer;
      border:2px solid transparent; background:var(--tile); padding:0; text-align:left; color:#fff; }
    .catcard .cc-img { position:absolute; inset:0; background-size:cover; background-position:center; }
    .catcard .cc-img::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.72)); }
    .catcard .cc-meta { position:absolute; left:.6rem; right:.6rem; bottom:.45rem; }
    .catcard .cc-n { font-weight:700; font-size:.92rem; line-height:1.1; }
    .catcard .cc-c { font-size:.72rem; color:#d8d6cf; margin-top:.1rem; }
    .catcard[aria-pressed=true] { border-color:var(--accent); }

    /* Resultados del buscador de productos (proyectados en el slot de ok-spotlight-search). */
    .sp-list { background:transparent; }
    ion-list.sp-list { background:transparent; }
    .sp-list ion-item { --background:transparent; border-radius:10px; }
    .sp-price { font-weight:800; color:var(--accent); }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap:.7rem; overflow:auto; align-content:start; padding-bottom:.3rem; }
    ion-card.tile { margin:0; border-radius:14px; box-shadow:none; border:1px solid var(--ion-border-color); background:var(--tile);
      overflow:hidden; display:flex; flex-direction:column; transition:border-color .12s, transform .05s; }
    ion-card.tile:hover { border-color:var(--accent); }
    ion-card.tile:active { transform:scale(.98); }
    .thumb { height:5.6rem; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:1.4rem; color:rgba(255,255,255,.85); }
    .thumb img { width:100%; height:100%; object-fit:cover; }
    .tinfo { padding:.5rem .6rem .65rem; }
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
    .ctx-chips .chip { font-size:.8rem; font-weight:700; color:#fff; border-radius:999px; padding:.12rem .55rem; background:var(--accent); white-space:nowrap; }
    .ctx-chips .chip.cust { background:#5c7cfa; }
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
      box-shadow:inset 0 0 0 1px var(--accent); }
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
    .pay-actions { display:flex; gap:.5rem; }
    .pay-actions .charge { flex:1; }
    .pay-actions .charge-print { flex:none; width:64px; }
    .foot-actions { display:flex; gap:.5rem; }
    .foot-actions .prebill { flex:none; width:56px; }
    .foot-actions .charge { flex:1; }

    /* desplegable tickets aparcados */
    .pdrop-back { position:absolute; inset:0; z-index:40; }
    .pdrop { position:absolute; top:2.9rem; right:.5rem; z-index:41; width:min(20rem,90%); background:var(--tile);
      border:1px solid var(--ion-border-color); border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.5); padding:.5rem; max-height:60%; overflow:auto; }
    .pdrop .hint { color:var(--mut); font-size:.82rem; margin:.3rem .2rem .5rem; }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.3rem; border:1px solid var(--ion-border-color); border-radius:10px; padding:.2rem .3rem .2rem .6rem; margin-bottom:.35rem; }
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
    .sec { border:1px solid var(--ion-border-color); border-radius:12px; overflow:hidden; }
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
    dialog.park-dialog, dialog.dirty-dialog { border:1px solid var(--ion-border-color); border-radius:14px;
      background:var(--panel); color:var(--tx); padding:1rem 1.1rem; width:min(94vw,24rem);
      box-shadow:0 18px 50px rgba(0,0,0,.35); }
    dialog.park-dialog::backdrop, dialog.dirty-dialog::backdrop { background:rgba(0,0,0,.45); }
    @media (max-width: 820px) {
      dialog.park-dialog, dialog.dirty-dialog { width:100vw; max-width:100vw; margin:auto 0 0;
        border-radius:18px 18px 0 0; border-bottom:none; padding-bottom:max(1rem, env(safe-area-inset-bottom)); }
      dialog.park-dialog::before, dialog.dirty-dialog::before { content:''; display:block;
        width:2.4rem; height:.3rem; border-radius:999px; background:var(--ion-border-color);
        margin:0 auto .7rem; }
      .dlg-actions ion-button { flex:1; }
    }
    dialog h3 { margin:0 0 .5rem; font-size:1.05rem; }
    dialog p { margin:0 0 .8rem; color:var(--mut); }
    dialog.park-dialog input { width:100%; box-sizing:border-box; font-size:1rem; padding:.6rem .7rem;
      border-radius:10px; border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); }
    .dlg-actions { display:flex; justify-content:flex-end; gap:.4rem; margin-top:.9rem; flex-wrap:wrap; }
    .badge-num { font-size:.62rem; min-width:1rem; height:1rem; padding:0 .2rem; border-radius:999px; background:var(--accent); color:#fff; display:inline-flex; align-items:center; justify-content:center; position:absolute; top:.2rem; right:.2rem; }

    /* botón flotante de carrito (solo móvil) */
    .fab { display:none; position:absolute; right:1rem; bottom:1rem; z-index:50; width:3.6rem; height:3.6rem; border-radius:50%;
      border:none; background:var(--accent); color:#fff; cursor:pointer; box-shadow:0 10px 26px rgba(0,0,0,.45); align-items:center; justify-content:center; }
    .fab ion-icon { font-size:1.6rem; }
    .fab .badge { position:absolute; top:-.2rem; right:-.2rem; min-width:1.3rem; height:1.3rem; padding:0 .25rem; border-radius:999px;
      background:#fff; color:var(--accent); font-size:.72rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
    .cart-close { display:none; }

    /* cobro / numpad (sheet oscuro) */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:999px; border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--accent); color:#fff; border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:var(--ion-color-success, #2f9e44); }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.35rem; margin-bottom:.2rem; }
    .numpad button { font-size:1.15rem; padding:.6rem; border-radius:10px; border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:70; }
    /* Columna flex: el importe y el botón de cobrar NO se mueven; solo scrollea el centro. Antes
       el sheet entero scrolleaba y el botón principal quedaba fuera de pantalla — la acción más
       importante del TPV no puede exigir scroll. */
    .sheet { background:var(--panel); color:var(--tx); border:1px solid var(--ion-border-color);
      border-radius:16px; width:min(92vw,24rem); max-height:88vh; display:flex; flex-direction:column;
      overflow:hidden; box-shadow:0 12px 48px rgba(0,0,0,.6); }
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
      .cart { position:absolute; top:0; right:0; bottom:0; width:min(92%,26rem); z-index:60;
        transform:translateX(100%); transition:transform .25s ease; }
      .cart[data-open] { transform:translateX(0); }
      .cart-close { display:inline-flex; }
      .cart-backdrop[data-open] { display:block; position:absolute; inset:0; background:rgba(0,0,0,.5); z-index:55; }
      .fab { display:inline-flex; }
    }
    .cart-backdrop { display:none; }
  `;

  @state() private products: Product[] = [];
  @state() private categories: Category[] = [];
  @state() private activeCat = '';
  @state() private q = '';
  @state() private cart: CartLine[] = [];
  @state() private methods: PayMethod[] = [];
  @state() private settings: PosSettings = {};
  @state() private paying = false;
  @state() private tendered = '';
  @state() private payMethod?: PayMethod;
  @state() private docFormat: 'ticket' | 'invoice' = 'ticket';
  @state() private busy = false;
  @state() private error = '';
  @state() private docSaleId?: string;
  @state() private parked: OpenCheck[] = [];
  /** Líneas marcadas para cobrar por separado (ADR-0146). Vacío = se cobra la cuenta entera. */
  @state() private splitSel = new Set<string>();
  @state() private parkedOpen = false;
  @state() private cartOpen = false;
  @state() private fullscreen = false;
  /** El search del catálogo se despliega desde una lupa (gana alto para la rejilla). */
  @state() private searchOpen = false;
  @state() private tableId?: string;
  /** ADR-0141: pedido MUTABLE que respalda el carrito. Cada artículo se escribe como FILA real al
   *  instante (antes: blob con debounce de 400 ms → un corte de luz perdía el último artículo). */
  @state() private orderId?: string;
  /** Modal de la CUENTA previa (pre-bill) que se lleva a la mesa antes de cobrar. No es fiscal. */
  @state() private prebillOpen = false;
  /** Diálogo del NOMBRE al aparcar sin mesa (default: la hora, editable de un toque). */
  @state() private parkPromptOpen = false;
  @state() private parkName = '';
  /** Diálogo «¿aparcar o eliminar la cuenta actual?» (solo con carrito sucio SIN mesa). */
  @state() private dirtyOpen = false;
  @state() private dirtyAllowCancel = false;
  private dirtyResolve?: (c: 'park' | 'discard' | 'cancel') => void;
  /** Borrado en DOS toques de una cuenta de la lista: el primero arma, el segundo anula. */
  @state() private armedDelete?: string;
  private armedTimer?: ReturnType<typeof setTimeout>;
  /** Preferencia del cobro: imprimir el tiquet al confirmar. Sustituye al 2º botón azul gemelo. */
  @state() private printOnCharge = true;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';
  /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta. */
  private customerTaxId = '';
  private customerAddress = '';

  private prodCats = new Map<string, Set<string>>();
  /** Registro de unidades (ADR-0147): code → fila, para congelar el contexto al añadir línea. */
  private units = new Map<string, UnitRow>();
  /** Mapa tax_category_key → rate_pct (vía taxes.rates.list); vacío si taxes no responde. ADR-0064/0066. */
  private ratesMap = new Map<string, number>();
  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
  // (mesa, cliente…) en el header. Botones independientes: cada uno abre su propio modal. El POS no
  // conoce a `tables`/`customers`; solo monta sus WC y escucha `erp:order-context`/`erp:customer-context`.
  private assignFillers: Array<{ component: string; el: HTMLElement }> = [];
  /** Fillers del slot del FOOTER (`sales.pos.actions`): kitchen aporta «Enviar a cocina». */
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
    if (nextTable && nextTable === this.tableId) { this.tableLabel = d.label ?? this.tableLabel; return; }

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
      this.orderId = undefined; this.cart = [];
      return;
    }

    if (accion === 'start-new-check') {
      // Ya veníamos de una mesa: la comanda de antes SE QUEDA allí, abierta, y aquí se empieza una
      // cuenta nueva. Llevarse la cuenta a otra mesa es TRANSFERIR, un botón aparte (igual que en
      // Toast/Lightspeed). Antes esto arrastraba la comanda y re-enlazaba la junction en cada mesa
      // tocada: ninguna se liberaba y acabábamos con tres mesas ocupadas por el mismo pedido.
      this.tableId = nextTable; this.tableLabel = d.label ?? '';
      this.orderId = undefined; this.cart = [];
      return;
    }

    if (accion === 'assign-to-target') {
      // La comanda de delante pasa a SER la de esa mesa: se enlaza la junction, no se mueve nada.
      this.tableId = nextTable; this.tableLabel = d.label ?? '';
      this.notifyOrderLinked();
      return;
    }

    if (accion === 'park-then-load') await aparcarOEliminar();

    // Abrir la comanda de la mesa (o empezar en blanco si no tiene).
    this.tableId = nextTable; this.tableLabel = d.label ?? '';
    const linked = d.order_id ?? undefined;
    this.orderId = linked;
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
      this.tableId = d.to_table_id;
      this.tableLabel = d.to_label ?? this.tableLabel;
      this.orderId = to;
      this.cart = await loadOrderLines(erplora(), to);
    }
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
    this.tableId = d.to_table_id;
    this.tableLabel = d.to_label ?? this.tableLabel;
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
  private readonly onFsChange = () => { this.fullscreen = document.fullscreenElement === this; };
  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener('fullscreenchange', this.onFsChange);
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked, cats, prodCats, ratesMap, unitRows] = await Promise.all([
        erplora().queryAll<Product>('inventory.products.list').catch(() => []),
        erplora().query('sales.payment_methods').catch(() => []),
        erplora().query('sales.settings.get').catch(() => []),
        this.restoreOpenOrder(),
        listOpenChecks(erplora()),
        erplora().queryAll<Category>('inventory.categories.list', { sort: 'name', dir: 'asc' }).catch(() => []),
        erplora().queryAll<ProdCat>('inventory.product_categories').catch(() => []),
        buildCategoryRatesMap(erplora()),
        erplora().queryAll<UnitRow>('inventory.units.list').catch(() => [] as UnitRow[]),
      ]);
      this.ratesMap = ratesMap;
      for (const u of rows<UnitRow>(unitRows)) if (u.code) this.units.set(u.code, u);
      this.products = rows<Product>(prods).filter((p) => p.is_active !== 0);
      this.methods = rows<PayMethod>(methods);
      this.settings = rows<PosSettings>(settingsRows)[0] || {};
      this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
      this.payMethod = defaultPayMethod(this.payMethods);
      this.parked = parked;
      this.categories = rows<Category>(cats).filter((c) => c.name);
      for (const pc of rows<ProdCat>(prodCats)) {
        if (!this.prodCats.has(pc.product_id)) this.prodCats.set(pc.product_id, new Set());
        this.prodCats.get(pc.product_id)!.add(pc.category_id);
      }
      if (savedCart.length) this.cart = savedCart;
      await this.updateComplete;
      this.addEventListener('erp:order-context', this.onOrderContext);
      this.addEventListener('erp:order-merge', this.onOrderMerge);
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
    document.removeEventListener('fullscreenchange', this.onFsChange);
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    this.removeEventListener('erp:order-context', this.onOrderContext);
    this.removeEventListener('erp:order-merge', this.onOrderMerge);
    this.removeEventListener('erp:order-transfer', this.onOrderTransfer);
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    this.removeEventListener('erp:order-fire', this.onOrderFire);
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
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
    // Slot del FOOTER (acciones de la comanda): kitchen aporta aquí su «Enviar a cocina»
    // (decisión Ioan 2026-07-19 — el botón ya no está hardcodeado; sin fillers, footer limpio).
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
    // Acciones del footer (mismo montaje resiliente que el header): las MISMAS instancias se
    // re-enganchan si el contenedor se recrea, y al montarse reciben el estado actual.
    const pie = this.renderRoot.querySelector('.foot-actions') as HTMLElement | null;
    if (pie) for (const f of this.actionFillers) {
      if (f.el.parentElement === pie) continue;
      pie.insertBefore(f.el, pie.firstChild);
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

  /** Cuenta a los fillers (footer + info) el estado del carrito (`erp:pos-state`). Al filler no
   *  viaja ninguna línea: solo lo que necesita para pintarse — incluido `pending_count`, el
   *  badge del botón de cocina («cuánto queda sin enviar»). */
  private emitPosState(fillers = [...this.actionFillers, ...this.infoFillers]): void {
    for (const f of fillers) {
      f.el.dispatchEvent(new CustomEvent('erp:pos-state', {
        detail: {
          order_id: this.orderId,
          items_count: this.cart.length,
          pending_count: pendingLines(this.cart).length,
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

  private get total() { return this.cart.reduce((s, l) => s + (l.is_gift ? 0 : l.price * l.qty), 0); }
  private get itemCount() { return this.cart.reduce((s, l) => s + l.qty, 0); }
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }
  private catCount(id: string) {
    const c = this.categories.find((x) => x.id === id);
    return c?.product_count ?? this.products.filter((p) => this.prodCats.get(p.id)?.has(id)).length;
  }

  private scrollCats(dir: number) {
    const seg = this.renderRoot.querySelector('.seg') as HTMLElement | null;
    seg?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  private async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.requestFullscreen();
    } catch { /* el navegador puede rechazar fullscreen; se ignora */ }
  }

  /** Aparcar (ADR-0146): la cuenta se queda ABIERTA y solo se suelta de la pantalla. Ya no se
   *  copia a otra entidad —el pedido ya es la cuenta— y por eso no se pierde nada por el camino.
   *  Si venía de una mesa, su dueño la suelta también: la mesa queda libre para otros. */
  private async park() {
    if (!this.cart.length) return;
    this.notifyPark();
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
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
      const abiertas = (await listOpenChecks(erplora())).map((c) => c.id);
      const id = resolveCurrentCheck(localStorage, abiertas);
      if (!id) return [];
      this.orderId = id;
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
   *  `sales` no escribe junctions ajenas ni conoce a esos módulos: solo publica el `order_id`. */
  private notifyOrderLinked(): void {
    if (!this.orderId) return;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-linked', { detail: { order_id: this.orderId }, bubbles: false }));
    }
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
  private async fireToKitchen(): Promise<void> {
    if (!this.cart.length) return;
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
    } catch {
      // Sin `kitchen` instalado el evento no lo escucha nadie: el comando de `sales` igual pasa.
      // Un fallo aquí NO debe bloquear la venta — la comanda se puede repetir.
      this.error = t('ui.fireFailed');
    }
  }

  private async ensureOrder(first: CartLine): Promise<string> {
    if (this.orderId) return this.orderId;
    // Si ya hay mesa elegida, el pedido nace ETIQUETADO con ella (lista de cuentas legible).
    this.orderId = await openOrderWithLines(erplora(), [first], this.tableLabel);
    rememberCurrentCheck(localStorage, this.orderId);
    // Aviso a TODOS los fillers: cada uno enlaza lo suyo si tiene algo seleccionado (la mesa en
    // `tables`, el cliente en `customers`). `sales` no sabe qué enlazan ni le importa.
    this.notifyOrderLinked();
    return this.orderId;
  }

  /** Una sola vía para el trabajo del carrito. Sin esto, cinco toques seguidos abrían cinco
   *  pedidos: cada uno veía «aún no hay pedido» porque el anterior seguía en vuelo (ADR-0144). */
  private readonly queue = createSerialQueue();

  private add(p: Product): Promise<void> {
    return this.queue(() => this.addNow(p));
  }

  private async addNow(p: Product) {
    const ex = this.cart.find((l) => l.id === p.id && !l.is_gift);
    // tax_category_key = referencia fiscal del producto (autoridad del servidor, ADR-0085).
    // tax_rate = % resuelto en cliente SOLO para el preview del total. cost = para el arqueo de regalos.
    const tax_rate = resolveLineTax(this.ratesMap, p.tax_category_key);
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
        ...this.frozenUnitContext(p),
      };
      // Abre el pedido con la primera línea, o añádela al ya abierto. En ambos casos la fila queda
      // escrita ANTES de que la UI siga: un corte de corriente ya no se lleva el artículo.
      if (!this.orderId) {
        await this.ensureOrder(line);
        const persisted = this.orderId ? await loadOrderLines(erplora(), this.orderId) : [];
        this.cart = persisted.length ? persisted.map((pl) => ({ ...line, ...pl })) : [...this.cart, line];
        return;
      }
      line.line_id = await addOrderLine(erplora(), this.orderId, line);
      this.cart = [...this.cart, line];
    } catch (e) {
      // La comanda es la fuente de verdad: si la escritura falla, NO dejamos la UI mintiendo.
      this.error = e instanceof Error ? e.message : String(e);
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
      await updateOrderLineQty(erplora(), this.orderId, ex.line_id, ex.qty, ex.price, is_gift, gift_reason ?? '');
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
    if (qty > 0) await updateOrderLineQty(erplora(), this.orderId, ex.line_id, qty, ex.price, ex.is_gift);
    else await removeOrderLine(erplora(), this.orderId, ex.line_id);
  }

  /** Imprime la CUENTA (no fiscal). El navegador imprime el nodo del recibo; en Hub Local el
   *  bridge de impresoras ESC/POS es un paso aparte (no bloquea llevar la cuenta a la mesa). */
  private printPrebill() {
    // Puerta GLOBAL del Hub: Bridge si lo hay; si no, se imprime el HTML PLANO de la cuenta en un
    // iframe aislado. NO se imprime el DOM de la app: el papel vive en un ion-modal reparentado con
    // shadow DOM y salía la app entera (o una hoja en blanco).
    const doc = orderToPrebill(
      this.cart.map((l) => ({ name: l.name, price: l.price, qty: l.qty, is_gift: l.is_gift })),
      this.settings,
      { tableLabel: this.tableLabel || undefined, notice: t('ui.prebillNotice') },
    );
    const sdk = (globalThis as { erplora?: { print?: (r: Record<string, unknown>) => Promise<unknown> } }).erplora;
    const html = receiptToPrintableHtml(doc as Parameters<typeof receiptToPrintableHtml>[0]);
    if (sdk?.print) void sdk.print({ role: 'receipt', documentType: 'prebill', html, data: doc as unknown as Record<string, unknown> });
    else printHtmlInIframe(html);
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
    this.tendered = '';
    this.payMethod = defaultPayMethod(this.payMethods);
    this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
    this.paying = true;
  }
  private tap(k: string) {
    if (k === 'C') { this.tendered = ''; return; }
    if (k === '.' && this.tendered.includes('.')) return;
    this.tendered = (this.tendered + k).slice(0, 9);
  }
  // El pinpad teclea EUROS («20» = 20 €); el contrato de la venta es CÉNTIMOS (ADR-0007/0123),
  // como `total`. Sin esta conversión: «Efectivo 0.20 €» y cambio 0 en el tiquet (QA 2026-07-17).
  private get tenderedNum() { return eurosToCents(this.tendered || '0'); }
  private get change() { return Math.max(0, this.tenderedNum - this.payable); }
  /** Lo que se cobra AHORA: la selección si la hay, o la cuenta entera (ADR-0146). */
  private get payable() { return splitTotal(this.cart, this.splitSel); }

  /** Cierra la venta. La IMPRESIÓN no se dispara desde aquí: la hace el shell por el Bridge al
   *  recibir `sale.completed` (ajuste `auto_print_on_sale`). El toggle de la pantalla de cobro
   *  refleja esa preferencia; el diálogo del navegador solo aparece como respaldo manual. */
  private async confirm(_print = false) {
    this.busy = true; this.error = '';
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
      const split = splitPayload(this.cart, this.splitSel);
      const cobradas = split.line_ids
        ? this.cart.filter((l) => l.line_id && this.splitSel.has(l.line_id))
        : this.cart;
      // `quantity` viaja en punto fijo 10⁶ y la línea lleva su contexto de unidades congelado
      // (ADR-0147): el servidor valida la rejilla y calcula el importe por el SDK (KPEIN).
      const items = cobradas.map((l) => ({ product_id: l.id, product_name: l.name, product_sku: l.sku || '', price: l.price, quantity: toMicro(l.qty), tax_category_key: l.tax_category_key ?? null, tax_rate: l.tax_rate ?? 0, category_id: this.prodCats.get(l.id)?.values().next().value ?? null, is_gift: l.is_gift ?? false, gift_reason: l.gift_reason ?? '', cost: l.cost ?? 0, ...unitContextPayload(l) }));
      await erplora().command('sales.complete_sale', {
        items,
        line_ids: split.line_ids ?? null,
        keep_order_open: split.keep_order_open,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        // El nombre viaja al tiquet: el de fábrica va traducido (seed canónico EN → i18n).
        payment_method_name: this.payMethod ? payMethodDisplayName(this.payMethod, t) : t('ui.cash'),
        // Sin entregado tecleado (tarjeta, importe justo) se cobra el PAYABLE: con split, caer al
        // total inflaba lo entregado y el cambio del tiquet.
        amount_tendered: this.tenderedNum || this.payable,
        channel: 'pos',
        source_module: 'pos',
        // ADR-0141: la venta nace de este PEDIDO. El servidor lo marca completado (open→completed)
        // en el cobro final; para split-bill se enviaría `keep_order_open: true`.
        order_id: this.orderId ?? null,
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
      // complete_sale (WASM) no devuelve el id de la venta creada, así que re-consultamos la última
      // para recuperar el `saleId` con el que mostrar el documento. El tipo ya quedó fijado dentro de
      // complete_sale (ADR-0140) — ya no hay UPDATE retro sales.set_document_type.
      const recent = rows<{ id: string }>(await erplora().query('sales.list', { limit: 1, sort: 'created_at', dir: 'desc' }));
      const saleId = recent[0]?.id;
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
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorCharge');
    } finally {
      this.busy = false;
    }
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
    const cell = (id: string, name: string, count: number, bg: string) => html`
      <button class="catcard" aria-pressed=${this.activeCat === id} @click=${() => { this.activeCat = id; }}>
        <span class="cc-img" style=${`background-image:${bg}`}></span>
        <span class="cc-meta"><span class="cc-n">${name}</span><span class="cc-c">${count} ${t('ui.products')}</span></span>
      </button>`;
    return html`
      <div class="catbar">
        <button class="arrow" title=${t('ui.previous')} @click=${() => this.scrollCats(-1)}><ion-icon name="chevron-back-outline"></ion-icon></button>
        <div class="seg">
          ${cell('', t('ui.all'), this.products.length, gradient('Todos'))}
          ${this.categories.map((c) => cell(c.id, c.name, this.catCount(c.id), c.image ? `url(${c.image})` : gradient(c.name)))}
        </div>
        <button class="arrow" title=${t('ui.next')} @click=${() => this.scrollCats(1)}><ion-icon name="chevron-forward-outline"></ion-icon></button>
        <!-- Lupa: despliega el buscador (gana alto para la rejilla). Hueco natural para el micro
             de búsqueda por voz cuando llegue. -->
        <button class="arrow" title=${t('ui.searchAction')} aria-pressed=${this.searchOpen}
          @click=${() => (this.renderRoot.querySelector('ok-spotlight-search') as { openSearch?: () => void } | null)?.openSearch?.()}>
          <ion-icon name="search-outline"></ion-icon>
        </button>
      </div>`;
  }

  private renderCart() {
    return html`
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button class="cart-close" title=${t('ui.closeAction')} @click=${() => { this.cartOpen = false; }}>
              <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
          <!-- Contexto asignado. La MESA no se pinta aquí: la pinta su dueño en el slot, con su X
               para soltarla — pintarla en los dos sitios sacaba la misma mesa DOS VECES, solapada.
               El CLIENTE sí, y no es capricho: su buscador monta un ok-spotlight-search que deja el
               nombre solo en aria-label, así que sin este chip el cliente asignado no se vería. -->
          <ion-title>
            ${this.customerName
              ? html`<span class="ctx-chips">
                  <span class="chip cust">${this.customerName}</span>
                </span>`
              : nothing}
          </ion-title>
          <ion-buttons slot="end">
            <!-- Botones de asignación (ADR-0043 B): cada módulo (tables, customers…) monta AQUÍ su
                 propio botón-icono vía provides_slots: sales.pos.assign; cada uno abre su modal. El
                 POS no sabe nada de ellos. Van a la izquierda de aparcar/pantalla completa. Vacío si
                 no hay aportantes. -->
            <span class="cart-actions-slot"></span>
            ${this.parkingEnabled
              ? html`<ion-button title=${t('ui.parkedTickets')} style="position:relative" @click=${() => { this.parkedOpen = !this.parkedOpen; }}>
                  <ion-icon slot="icon-only" name="file-tray-stacked-outline"></ion-icon>
                  ${this.parked.length ? html`<span class="badge-num">${this.parked.length}</span>` : nothing}
                </ion-button>`
              : nothing}
            <ion-button title=${t('ui.fullscreen')} @click=${() => this.toggleFullscreen()}>
              <ion-icon slot="icon-only" name=${this.fullscreen ? 'contract-outline' : 'expand-outline'}></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      ${this.parkedOpen
        ? html`
          <div class="pdrop-back" @click=${() => { this.parkedOpen = false; }}></div>
          <div class="pdrop">
            <ion-button size="small" expand="block" fill="outline" ?disabled=${!this.cart.length} @click=${() => void this.requestPark()}>${this.tableLabel.trim() ? t('ui.leaveAtTable') : t('ui.parkCurrentSale')}</ion-button>
            <p class="hint">${t('ui.parkedTickets')}</p>
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
            ${!this.parked.length ? html`<div class="hint" style="text-align:center">${t('ui.noParkedTickets')}</div>` : nothing}
          </div>`
        : nothing}

      <!-- El CUERPO. ion-content es quien scrollea: las líneas crecen aquí dentro y ni el header ni
           el pie se mueven. Con divs a pelo, una comanda larga empujaba el botón de COBRAR fuera de
           la pantalla — en un TPV eso es no poder cobrar. -->
      <ion-content class="cart-body">
        ${this.hasFired ? this.renderSections() : this.renderOrderList()}
      </ion-content>

      <!-- El PIE. ion-footer es un pie de verdad: se queda abajo pase lo que pase. -->
      <ion-footer class="ion-no-border">
        <div class="cart-foot">
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
          </span>
          <!-- El MÉTODO de pago ya no se elige aquí: vive DENTRO del sheet de cobro, como la
               pantalla de tender de cualquier TPV (rediseño 2026-07-19). El footer solo acciona. -->
          <!-- Acciones SOLO-ICONO (ADR-0133): imprimir la CUENTA para llevarla a la mesa (no es un
               documento fiscal) y COBRAR (que sí emite el tiquet fiscal). El importe ya se ve
               grande arriba, así que el texto sobra; la etiqueta va en aria-label/title. -->
          <!-- El botón de COCINA ya no vive aquí: entra por el slot sales.pos.actions (lo
               aporta kitchen si está instalado/activo — decisión Ioan 2026-07-19). Los fillers
               se insertan al PRINCIPIO de .foot-actions (ensureSlotsMounted); Cobrar siempre es
               el más grande y el último. Ojo: nada de backticks en comentarios de un html de Lit. -->
          <div class="foot-actions">
            <ion-button class="prebill" fill="outline" ?disabled=${!this.cart.length}
                        title=${t('ui.printPrebill')} aria-label=${t('ui.printPrebill')}
                        @click=${() => { this.prebillOpen = true; }}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button class="charge" ?disabled=${!this.cart.length}
                        title=${t('ui.charge')} aria-label=${t('ui.charge')}
                        @click=${() => this.openPay()}>
              <ion-icon slot="icon-only" name="cash-outline"></ion-icon>
            </ion-button>
          </div>
        </div>
      </ion-footer>`;
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
        <h3>${l.name}${l.is_gift
            ? html` <ion-badge color="success">${t('ui.giftBadge')}</ion-badge>` : nothing}</h3>
        <p>${priceLabel(this.money(l.price), l.unit_code)}${l.is_gift && l.gift_reason ? html` · ${l.gift_reason}` : nothing}</p>
      </ion-label>
      <div slot="end" class="lineend">
        <span class="lt" style=${l.is_gift ? 'text-decoration:line-through;opacity:.55' : ''}>${this.money(l.price * l.qty)}</span>
        ${locked
          ? html`<span class="lqty">×${formatQuantity(toMicro(l.qty))}</span>`
          : html`
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
   *  El envío es el botón de kitchen del footer (uno solo, con badge de pendientes). */
  private renderSections() {
    const pendientes = pendingLines(this.cart);
    const enviadas = this.cart.filter((l) => !!l.fired_at);
    return html`<div class="secs">
      <div class="sec sec-pending">
        <div class="sec-h">
          <ion-icon name="create-outline" color="primary"></ion-icon>
          <span>${t('ui.courseInProgress')}</span>
          ${pendientes.length ? html`<span class="ccount">· ${pendientes.length}</span>` : nothing}
        </div>
        ${pendientes.length
          ? html`<ion-list class="lines" lines="full">${pendientes.map((l) => this.renderLine(l))}</ion-list>`
          : html`<div class="empty">${t('ui.cartEmptyTouch')}</div>`}
      </div>
      <div class="sec sec-sent">
        <div class="sec-h">
          <ion-icon name="flame" color="warning"></ion-icon>
          <span>${t('ui.sentHeader')}</span>
          <span class="ccount">· ${enviadas.length}</span>
          <span class="sec-slot"></span>
        </div>
        <ion-list class="lines" lines="full">${enviadas.map((l) => this.renderLine(l))}</ion-list>
      </div>
    </div>`;
  }

  render() {
    return html`<div class="card">
      <div class="body">
        <div class="catalog">
          ${this.renderCatBar()}
          ${this.error ? html`<p style="color:var(--ion-color-danger,#d9480f)">${this.error}</p>` : nothing}
          <div class="grid">
            ${this.filtered.map((p) => html`<ion-card button class="tile" @click=${() => this.add(p)}>
              <div class="thumb" style=${p.image ? `background-image:url(${p.image})` : `background:${gradient(p.name)}`}>
                ${p.image ? nothing : initials(p.name)}
              </div>
              <div class="tinfo"><div class="n">${p.name}</div><div class="p">${this.money(Number(p.price))}</div></div>
            </ion-card>`)}
            ${!this.filtered.length ? html`<div class="empty">${t('ui.noProducts')}</div>` : nothing}
          </div>
        </div>

        <div class="cart-backdrop" ?data-open=${this.cartOpen} @click=${() => { this.cartOpen = false; }}></div>
        <aside class="cart" ?data-open=${this.cartOpen}>${this.renderCart()}</aside>

        <!-- Botón flotante de carrito (solo móvil) -->
        <button class="fab" @click=${() => { this.cartOpen = true; }}>
          <ion-icon name="cart-outline"></ion-icon>
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
                ${this.error ? html`<p class="pay-err">${this.error}</p>` : nothing}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla.
                     El importe es el PAYABLE: con split decía «Cobrar 3,60 €» para cobrar 1,80 €. -->
                <ion-button class="charge" expand="block" ?disabled=${this.busy}
                            @click=${() => this.confirm(this.printOnCharge)}>
                  ${this.busy
                    ? t('ui.charging')
                    : needsTendered(this.payMethod)
                      ? `${t('ui.charge')} ${this.money(this.payable)}`
                      : t('ui.chargeWithCard', { amount: this.money(this.payable) })}
                </ion-button>
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
          ${this.searchResults.map((p) => html`
            <ion-item button detail="false" @click=${() => { this.add(p); this.q = ''; (this.renderRoot.querySelector('ok-spotlight-search') as { close?: () => void } | null)?.close?.(); }}>
              <ion-label><h3>${p.name}</h3>${p.sku ? html`<p>${p.sku}</p>` : nothing}</ion-label>
              <span slot="end" class="sp-price">${this.money(Number(p.price))}</span>
            </ion-item>`)}
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
            <ion-button title=${t('ui.print')} aria-label=${t('ui.print')} @click=${() => this.printPrebill()}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button title=${t('ui.close')} aria-label=${t('ui.close')}
                        @click=${() => { this.prebillOpen = false; }}>
              <ion-icon slot="icon-only" name="close-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="doc-body ion-padding">
          <ok-receipt id="prebill-doc" .data=${orderToPrebill(
            this.cart.map((l) => ({ name: l.name, price: l.price, qty: l.qty, is_gift: l.is_gift })),
            this.settings,
            { tableLabel: this.tableLabel || undefined, notice: t('ui.prebillNotice') },
          )}></ok-receipt>
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
