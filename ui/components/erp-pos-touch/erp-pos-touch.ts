import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
// La frontera EUROS ↔ CÉNTIMOS vive en el SDK (ADR-0123), no copiada en cada WC (como el desktop).
import { eurosToCents } from '@erplora/module-sdk';
import { renderDocumentModal } from '../../lib/document-modal.js';
import '@erplora/outfitkit/ok-qty-stepper';
import '@erplora/outfitkit/ok-spotlight-search';
import {
  loadActiveCart, persistActiveCart, listParkedTickets, parkCart, retrieveParkedTicket,
  type CartLine, type ErploraClientLike, type ParkedTicket,
} from '../../lib/pos-cart.js';
import { buildCategoryRatesMap, resolveLineTax } from '../../lib/pos-tax.js';
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

interface Product { id: string; name: string; sku?: string; price: number; cost?: number; is_active?: number; product_type?: string; image?: string; tax_category_key?: string; }
interface PayMethod { id: string; name: string; type?: string; }
interface PosSettings { default_document_format?: string; currency?: string; enable_parked_tickets?: number; default_tax_included?: number; }
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

    /* desplegable tickets aparcados */
    .pdrop-back { position:absolute; inset:0; z-index:40; }
    .pdrop { position:absolute; top:2.9rem; right:.5rem; z-index:41; width:min(20rem,90%); background:var(--tile);
      border:1px solid var(--ion-border-color); border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.5); padding:.5rem; max-height:60%; overflow:auto; }
    .pdrop .hint { color:var(--mut); font-size:.82rem; margin:.3rem .2rem .5rem; }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.6rem; border:1px solid var(--ion-border-color); border-radius:10px; padding:.45rem .6rem; margin-bottom:.35rem; }
    .pn { font-weight:700; font-size:.9rem; }
    .pm { color:var(--mut); font-size:.78rem; }
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
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.5rem; }
    .numpad button { font-size:1.3rem; padding:1rem; border-radius:12px; border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:70; }
    .sheet { background:var(--panel); color:var(--tx); border:1px solid var(--ion-border-color); border-radius:16px; padding:1rem; width:min(92vw,24rem); max-height:90vh; overflow:auto; box-shadow:0 12px 48px rgba(0,0,0,.6); }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--mut); }

    @media (max-width: 820px) {
      .body { grid-template-columns: 1fr; }
      .cart { position:absolute; top:0; right:0; bottom:0; width:min(92%,26rem); z-index:60;
        box-shadow:-8px 0 32px rgba(0,0,0,.5); transform:translateX(100%); transition:transform .25s ease; }
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
  @state() private parked: ParkedTicket[] = [];
  @state() private parkedOpen = false;
  @state() private cartOpen = false;
  @state() private fullscreen = false;
  /** El search del catálogo se despliega desde una lupa (gana alto para la rejilla). */
  @state() private searchOpen = false;
  @state() private tableId?: string;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';
  /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta. */
  private customerTaxId = '';
  private customerAddress = '';

  private prodCats = new Map<string, Set<string>>();
  /** Mapa tax_category_key → rate_pct (vía taxes.rates.list); vacío si taxes no responde. ADR-0064/0066. */
  private ratesMap = new Map<string, number>();
  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
  // (mesa, cliente…) en el header. Botones independientes: cada uno abre su propio modal. El POS no
  // conoce a `tables`/`customers`; solo monta sus WC y escucha `erp:order-context`/`erp:customer-context`.
  private assignFillers: Array<{ component: string; el: HTMLElement }> = [];
  private readonly onOrderContext = (e: Event) => {
    const d = (e as CustomEvent<{ table_id: string | null; label?: string }>).detail ?? { table_id: null };
    this.tableId = d.table_id ?? undefined;
    this.tableLabel = d.label ?? '';
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
  };
  private readonly onFsChange = () => { this.fullscreen = document.fullscreenElement === this; };
  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener('fullscreenchange', this.onFsChange);
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked, cats, prodCats, ratesMap] = await Promise.all([
        erplora().queryAll<Product>('inventory.products.list').catch(() => []),
        erplora().query('sales.payment_methods').catch(() => []),
        erplora().query('sales.settings.get').catch(() => []),
        loadActiveCart(erplora()),
        listParkedTickets(erplora()),
        erplora().queryAll<Category>('inventory.categories.list', { sort: 'name', dir: 'asc' }).catch(() => []),
        erplora().queryAll<ProdCat>('inventory.product_categories').catch(() => []),
        buildCategoryRatesMap(erplora()),
      ]);
      this.ratesMap = ratesMap;
      this.products = rows<Product>(prods).filter((p) => p.is_active !== 0);
      this.methods = rows<PayMethod>(methods);
      this.settings = rows<PosSettings>(settingsRows)[0] || {};
      this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
      this.payMethod = this.methods[0];
      this.parked = parked;
      this.categories = rows<Category>(cats).filter((c) => c.name);
      for (const pc of rows<ProdCat>(prodCats)) {
        if (!this.prodCats.has(pc.product_id)) this.prodCats.set(pc.product_id, new Set());
        this.prodCats.get(pc.product_id)!.add(pc.category_id);
      }
      if (savedCart.length) this.cart = savedCart;
      await this.updateComplete;
      this.addEventListener('erp:order-context', this.onOrderContext);
      this.addEventListener('erp:customer-context', this.onCustomerContext);
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
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }
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
    this.requestUpdate();
  }

  /** (Re)engancha los botones de los fillers en el header; idempotente, sobrevive a re-renders. */
  private ensureSlotsMounted() {
    const host = this.renderRoot.querySelector('.cart-actions-slot') as HTMLElement | null;
    if (!host || !this.assignFillers.length) return;
    for (const f of this.assignFillers) {
      if (f.el.parentElement !== host) host.appendChild(f.el);
    }
  }

  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  private resetSlotContexts() {
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-context-reset', { bubbles: false }));
      f.el.dispatchEvent(new CustomEvent('erp:customer-context-reset', { bubbles: false }));
    }
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    this.ensureSlotsMounted();
    if (!changed.has('cart') || !this.cartRestored) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }, 400);
  }


  // Dinero formateado con la MONEDA DEL HUB (ADR-0059): el SDK la resuelve de /api/hub/context
  // (misma fuente que dashboard/billing). Antes hardcodeaba '€' / la moneda por-módulo.
  // FIX QA (2026-06-25): el POS trabaja en CÉNTIMOS → formatMoney (divide /100), NO formatAmount
  // (que mostraba precios ×100).
  private money(n: number) { return erplora().formatMoney(Number(n) || 0); }
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

  private async park() {
    if (!this.cart.length) return;
    const num = await parkCart(erplora(), this.cart);
    if (!num) { this.error = t('ui.errorPark'); return; }
    this.cart = [];
    this.parkedOpen = false;
    this.parked = await listParkedTickets(erplora());
  }

  private async retrieve(t: ParkedTicket) {
    if (this.cart.length) return;
    try {
      this.cart = await retrieveParkedTicket(erplora(), t);
      this.parkedOpen = false;
      this.parked = await listParkedTickets(erplora());
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorRetrieve');
    }
  }

  private add(p: Product) {
    const ex = this.cart.find((l) => l.id === p.id && !l.is_gift);
    // tax_category_key = referencia fiscal del producto (autoridad del servidor, ADR-0085).
    // tax_rate = % resuelto en cliente SOLO para el preview del total. cost = para el arqueo de regalos.
    const tax_rate = resolveLineTax(this.ratesMap, p.tax_category_key);
    this.cart = ex
      ? this.cart.map((l) => (l.id === p.id && !l.is_gift ? { ...l, qty: l.qty + 1 } : l))
      : [...this.cart, { id: p.id, name: p.name, sku: p.sku, price: Number(p.price), qty: 1, tax_category_key: p.tax_category_key, tax_rate, cost: Number(p.cost) || 0 }];
  }

  /** Invitar/quitar invitación a una línea (comp, ADR-comp): toggle is_gift con un motivo por defecto.
   *  La línea regalo no se cobra (el servidor pone net/tax/total=0) pero descuenta stock. */
  private toggleGift(id: string) {
    this.cart = this.cart.map((l) =>
      l.id === id ? { ...l, is_gift: !l.is_gift, gift_reason: !l.is_gift ? (l.gift_reason || 'Invitación') : undefined } : l,
    );
  }
  /** Fija la cantidad de una línea (desde ok-qty-stepper); al llegar a 0 la línea se elimina. */
  private setQtyAbs(id: string, v: number) {
    this.cart = this.cart
      .map((l) => (l.id === id ? { ...l, qty: Math.max(0, Math.round(v)) } : l))
      .filter((l) => l.qty > 0);
  }

  private openPay() {
    if (!this.cart.length) return;
    this.tendered = '';
    this.payMethod = this.methods[0];
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
  private get change() { return Math.max(0, this.tenderedNum - this.total); }

  private async confirm() {
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
      const items = this.cart.map((l) => ({ product_id: l.id, product_name: l.name, product_sku: l.sku || '', price: l.price, quantity: l.qty, tax_category_key: l.tax_category_key ?? null, tax_rate: l.tax_rate ?? 0, category_id: this.prodCats.get(l.id)?.values().next().value ?? null, is_gift: l.is_gift ?? false, gift_reason: l.gift_reason ?? '', cost: l.cost ?? 0 }));
      await erplora().command('sales.complete_sale', {
        items,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        payment_method_name: this.payMethod?.name ?? 'Efectivo',
        amount_tendered: this.tenderedNum || this.total,
        channel: 'pos',
        source_module: 'pos',
        table_id: this.tableId ?? null,
        customer_id: this.customerId ?? null,
        customer_name: this.customerName,
        // Snapshot fiscal del cliente (ADR-0132): sin esto la factura emitida desde el TPV sale sin
        // NIF ni dirección aunque el cliente los tenga en su ficha.
        customer_tax_id: this.customerTaxId,
        customer_address: this.customerAddress,
      });
      const recent = rows<{ id: string }>(await erplora().query('sales.list', { limit: 1, sort: 'created_at', dir: 'desc' }));
      const saleId = recent[0]?.id;
      if (saleId && this.docFormat === 'invoice') {
        await erplora().command('sales.set_document_type', { sale_id: saleId, document_type: 'invoice' });
      }
      this.paying = false;
      this.cart = [];
      this.tableId = undefined; this.tableLabel = '';
      this.customerId = undefined; this.customerName = '';
      this.customerTaxId = ''; this.customerAddress = '';
      this.resetSlotContexts();
      if (saleId) this.docSaleId = saleId;
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
          <!-- Contexto asignado como CHIPS (mesa/cliente); sin texto "Venta" (no aportaba). Se ven
               SIEMPRE en el header, por larga que sea la comanda. -->
          <ion-title>
            ${this.tableLabel || this.customerName
              ? html`<span class="ctx-chips">
                  ${this.tableLabel ? html`<span class="chip">${this.tableLabel}</span>` : nothing}
                  ${this.customerName ? html`<span class="chip cust">${this.customerName}</span>` : nothing}
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
            <ion-button size="small" expand="block" fill="outline" ?disabled=${!this.cart.length} @click=${() => this.park()}>${t('ui.parkCurrentSale')}</ion-button>
            <p class="hint">${t('ui.parkedTickets')}</p>
            ${this.parked.map((pt) => html`<div class="pitem">
              <div><div class="pn">${pt.ticket_number}</div><div class="pm">${(pt.created_at || '').replace('T', ' ').slice(0, 16)}</div></div>
              <ion-button size="small" ?disabled=${!!this.cart.length} @click=${() => this.retrieve(pt)}>${t('ui.retrieve')}</ion-button>
            </div>`)}
            ${!this.parked.length ? html`<div class="hint" style="text-align:center">${t('ui.noParkedTickets')}</div>` : nothing}
          </div>`
        : nothing}

      <!-- El CUERPO. ion-content es quien scrollea: las líneas crecen aquí dentro y ni el header ni
           el pie se mueven. Con divs a pelo, una comanda larga empujaba el botón de COBRAR fuera de
           la pantalla — en un TPV eso es no poder cobrar. -->
      <ion-content class="cart-body">
        ${this.cart.length
          ? html`<ion-list class="lines" lines="full">
              ${this.cart.map((l) => html`<ion-item>
                <ion-label>
                  <h3>${l.name}${l.is_gift ? html` <ion-badge color="success">${t('ui.giftBadge')}</ion-badge>` : nothing}</h3>
                  <p>${this.money(l.price)}${l.is_gift && l.gift_reason ? html` · ${l.gift_reason}` : nothing}</p>
                </ion-label>
                <div slot="end" class="lineend">
                  <span class="lt" style=${l.is_gift ? 'text-decoration:line-through;opacity:.55' : ''}>${this.money(l.price * l.qty)}</span>
                  <ion-button fill="clear" size="small" title=${t('ui.giftAction')} @click=${() => this.toggleGift(l.id)}>
                    <ion-icon name=${l.is_gift ? 'gift' : 'gift-outline'} slot="icon-only" color=${l.is_gift ? 'success' : 'medium'}></ion-icon>
                  </ion-button>
                  <ok-qty-stepper .value=${l.qty} .min=${0} .step=${1}
                    @ok-change=${(e: CustomEvent) => this.setQtyAbs(l.id, (e.detail as { value: number }).value)}></ok-qty-stepper>
                </div>
              </ion-item>`)}
            </ion-list>`
          : html`<div class="empty">${t('ui.cartEmptyTouch')}</div>`}
      </ion-content>

      <!-- El PIE. ion-footer es un pie de verdad: se queda abajo pase lo que pase. -->
      <ion-footer class="ion-no-border">
        <div class="cart-foot">
          <div class="total"><span>${t('ui.colTotal')}</span><b>${this.money(this.total)}</b></div>
          <ion-button class="charge" expand="block" ?disabled=${!this.cart.length} @click=${() => this.openPay()}>
            ${t('ui.charge')} ${this.money(this.total)}
          </ion-button>
        </div>
      </ion-footer>`;
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
                <span class="t">${t('ui.charge')} ${this.money(this.total)}</span>
                <button class="x" @click=${() => { this.paying = false; }}>✕</button>
              </div>
              <div class="pay">
                <div class="methods">
                  ${this.methods.map((m) => html`<button class="chip" aria-pressed=${this.payMethod?.id === m.id} @click=${() => { this.payMethod = m; }}>${m.name}</button>`)}
                  ${!this.methods.length ? html`<button class="chip" aria-pressed="true">${t('ui.cash')}</button>` : nothing}
                </div>
                <div class="amt"><span>${t('ui.tendered')}</span><span class="v">${this.money(this.tenderedNum)}</span></div>
                <div class="amt"><span>${t('ui.change')}</span><span class="v change">${this.money(this.change)}</span></div>
                <div class="numpad">
                  ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button @click=${() => this.tap(k)}>${k}</button>`)}
                </div>
                <ion-segment value=${this.docFormat} @ionChange=${(e: CustomEvent) => { this.docFormat = ((e.detail as { value: string }).value === 'invoice' ? 'invoice' : 'ticket'); }}>
                  <ion-segment-button value="ticket"><ion-label>${t('ui.formatTicket')}</ion-label></ion-segment-button>
                  <ion-segment-button value="invoice"><ion-label>${t('ui.formatInvoice')}</ion-label></ion-segment-button>
                </ion-segment>
                ${this.error ? html`<p style="color:var(--ion-color-danger,#d9480f)">${this.error}</p>` : nothing}
                <ion-button class="charge" expand="block" ?disabled=${this.busy} @click=${() => this.confirm()}>
                  ${this.busy ? t('ui.charging') : t('ui.confirmCharge')}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}

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
    </div>`;
  }
}

define('erp-pos-touch', ErpPosTouch);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos-touch': ErpPosTouch;
  }
}
