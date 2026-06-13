import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '../erp-sales-document/erp-sales-document.js';
import {
  loadActiveCart, persistActiveCart, listParkedTickets, parkCart, retrieveParkedTicket,
  type CartLine, type ErploraClientLike, type ParkedTicket,
} from '../../lib/pos-cart.js';

// erp-pos-touch — pantalla de venta TÁCTIL de mostrador. Rejilla de productos (tap = añadir) y el
// carrito como PANEL (cabecera + cuerpo con scroll + pie). En pantalla grande el panel se ve
// desplegado al lado; en pantalla pequeña se recoge a un botón flotante con icono de carrito que lo
// abre como overlay deslizante. La cabecera aloja un botón de pantalla completa (kiosko) y una fila
// de CONTEXTO de venta que otros módulos rellenan por slots (ADR-0043): `sales.pos.order_context`
// (mesa, módulo `tables`) y `sales.pos.customer_context` (cliente, módulo `customers`). El POS NO
// conoce a esos módulos: recibe `erp:order-context`/`erp:customer-context` por DOM y adjunta
// table_id/customer a la venta; tras cobrar dispara los `*-reset` para que los fillers se limpien.
// Quitar una línea = bajar su cantidad a 0. Al cobrar: `sales.complete_sale` (channel='pos') →
// fija `document_type` → muestra el documento. El carrito en curso se persiste en sales_active_cart.

interface Product { id: string; name: string; sku?: string; price: number; is_active?: number; product_type?: string; }
interface PayMethod { id: string; name: string; type?: string; }
interface PosSettings { default_document_format?: string; currency?: string; enable_parked_tickets?: number; }

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

export class ErpPosTouch extends LitElement {
  static styles = css`
    :host { display:block; height:100%; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    .pos { display:grid; grid-template-columns: 1fr 22rem; gap:1rem; height:100%; min-height:30rem; }
    .catalog { display:flex; flex-direction:column; min-width:0; }
    .search { margin-bottom:.6rem; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap:.6rem; overflow:auto; align-content:start; }
    .tile { border:1px solid var(--ion-border-color,#e0ddd4); border-radius:14px; padding:.7rem; cursor:pointer; background:var(--ion-background-color,#fff); text-align:left; min-height:5rem; display:flex; flex-direction:column; justify-content:space-between; transition:transform .05s; }
    .tile:active { transform:scale(.97); }
    .tile .n { font-weight:600; font-size:.92rem; line-height:1.2; }
    .tile .p { font-weight:700; color:var(--ion-color-primary,#0091ce); margin-top:.4rem; }

    /* Panel del carrito: cabecera + cuerpo (scroll) + pie */
    .cart { display:flex; flex-direction:column; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:14px; overflow:hidden; background:var(--ion-background-color,#fff); }
    .cart-top { display:flex; flex-direction:column; gap:.5rem; padding:.6rem .7rem; border-bottom:1px solid var(--ion-border-color,#e0ddd4); }
    .ct-row { display:flex; align-items:center; gap:.5rem; }
    .ct-title { font-size:1rem; font-weight:700; flex:1; }
    .ct-close, .ct-fs { background:none; border:none; cursor:pointer; color:var(--ion-text-color,#1c1b18); display:inline-flex; align-items:center; justify-content:center; width:2rem; height:2rem; border-radius:8px; }
    .ct-close { display:none; }
    .ct-fs:hover, .ct-close:hover { background:var(--ion-color-light,#f2f1ed); }
    .ct-fs ion-icon, .ct-close ion-icon { font-size:1.25rem; }
    /* Fila de contexto: aquí montan el shell los fillers de slot (mesa / cliente). */
    .ct-ctx { display:flex; gap:.4rem; }
    .order-slot, .customer-slot { flex:1; min-width:0; }
    .order-slot:empty, .customer-slot:empty { display:none; }
    .ct-ctx:empty { display:none; }

    .lines { flex:1; overflow:auto; display:flex; flex-direction:column; gap:.4rem; padding:.7rem; min-height:6rem; }
    .line { display:grid; grid-template-columns: 1fr auto; gap:.2rem .5rem; align-items:center; border-bottom:1px solid var(--ion-border-color,#eee); padding-bottom:.4rem; }
    .line .nm { font-size:.9rem; }
    .line .lt { font-weight:700; white-space:nowrap; }
    .qty { display:flex; align-items:center; gap:.5rem; }
    .qbtn { width:2rem; height:2rem; border-radius:50%; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); font-size:1.1rem; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
    .qty span { min-width:1.2rem; text-align:center; }
    .empty { color:#8b897f; text-align:center; padding:2rem 0; }

    .cart-foot { padding:.7rem; border-top:1px solid var(--ion-border-color,#e0ddd4); }
    .total { display:flex; justify-content:space-between; align-items:baseline; margin:.2rem 0 .6rem; font-size:1rem; }
    .total b { font-size:1.5rem; }
    .charge { font-size:1.1rem; }

    /* Botón flotante de carrito — solo móvil (ver @media) */
    .fab { display:none; }
    .cart-backdrop { display:none; }

    /* numpad / cobro */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:999px; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--ion-color-primary,#0091ce); color:#fff; border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:#2f9e44; }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.5rem; }
    .numpad button { font-size:1.3rem; padding:1rem; border-radius:12px; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); cursor:pointer; }
    /* Overlays propios (en el shadow → conservan estilos; ion-modal los perdería). */
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:70; }
    .sheet { background:var(--ion-background-color,#fff); border-radius:16px; padding:1rem; width:min(92vw,24rem); max-height:90vh; overflow:auto; box-shadow:0 12px 48px rgba(0,0,0,.35); }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:#8b897f; }
    /* tickets aparcados */
    .parkrow { display:flex; gap:.4rem; margin-top:.4rem; }
    .parkrow ion-button { flex:1; }
    .plist { display:flex; flex-direction:column; gap:.4rem; max-height:50vh; overflow:auto; }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.6rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:10px; padding:.5rem .7rem; }
    .pn { font-weight:700; }
    .pm { color:#8b897f; }
    .hint { color:#8b897f; font-size:.85rem; margin:.2rem 0 .6rem; }

    @media (max-width: 820px) {
      .pos { grid-template-columns: 1fr; }
      .cart {
        position:fixed; top:0; right:0; bottom:0; width:min(92vw,26rem);
        z-index:60; border-radius:0; border:none;
        box-shadow:-8px 0 32px rgba(0,0,0,.25);
        transform:translateX(100%); transition:transform .25s ease;
      }
      .cart[data-open] { transform:translateX(0); }
      .cart-backdrop[data-open] { display:block; position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:55; }
      .ct-close { display:inline-flex; }
      .fab {
        display:inline-flex; align-items:center; gap:.5rem; position:fixed; right:1rem; bottom:1rem; z-index:50;
        padding:.7rem 1rem; border:none; border-radius:999px; cursor:pointer;
        background:var(--ion-color-primary,#0091ce); color:#fff; font:inherit; font-weight:700;
        box-shadow:0 8px 24px rgba(0,0,0,.3);
      }
      .fab ion-icon { font-size:1.4rem; }
      .fab .fab-badge { position:absolute; top:-.35rem; left:1.4rem; min-width:1.2rem; height:1.2rem; padding:0 .25rem; border-radius:999px; background:#d9480f; color:#fff; font-size:.72rem; display:inline-flex; align-items:center; justify-content:center; }
    }
  `;

  @state() private products: Product[] = [];
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
  // Panel del carrito (overlay en móvil) + kiosko a pantalla completa.
  @state() private cartOpen = false;
  @state() private fullscreen = false;
  // Contexto de venta aportado por slot fillers (ADR-0043): mesa (`tables`) y cliente (`customers`).
  // El POS recibe los datos por evento DOM y los adjunta a la venta; no conoce a esos módulos.
  @state() private tableId?: string;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';

  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  /** Slots de contexto que el POS expone; cada uno lo rellena (o no) un módulo externo. */
  private readonly slots: Array<{ slot: string; container: string; reset: string; resolved?: { component: string }[]; els: HTMLElement[] }> = [
    { slot: 'sales.pos.order_context', container: '.order-slot', reset: 'erp:order-context-reset', els: [] },
    { slot: 'sales.pos.customer_context', container: '.customer-slot', reset: 'erp:customer-context-reset', els: [] },
  ];
  private readonly onOrderContext = (e: Event) => {
    const d = (e as CustomEvent<{ table_id: string | null; label?: string }>).detail ?? { table_id: null };
    this.tableId = d.table_id ?? undefined;
    this.tableLabel = d.label ?? '';
  };
  private readonly onCustomerContext = (e: Event) => {
    const d = (e as CustomEvent<{ customer_id: string | null; customer_name?: string }>).detail ?? { customer_id: null };
    this.customerId = d.customer_id ?? undefined;
    this.customerName = d.customer_name ?? '';
  };
  private readonly onFsChange = () => { this.fullscreen = document.fullscreenElement === this; };

  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener('fullscreenchange', this.onFsChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked] = await Promise.all([
        erplora().query('inventory.products.list', { page_size: 200 }).catch(() => []),
        erplora().query('sales.payment_methods').catch(() => []),
        erplora().query('sales.settings.get').catch(() => []),
        loadActiveCart(erplora()),
        listParkedTickets(erplora()),
      ]);
      this.products = rows<Product>(prods).filter((p) => p.is_active !== 0);
      this.methods = rows<PayMethod>(methods);
      this.settings = rows<PosSettings>(settingsRows)[0] || {};
      this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
      this.payMethod = this.methods[0];
      this.parked = parked;
      if (savedCart.length) this.cart = savedCart;
      await this.updateComplete;
      this.addEventListener('erp:order-context', this.onOrderContext);
      this.addEventListener('erp:customer-context', this.onCustomerContext);
      await this.resolveSlots();
      this.ensureSlotsMounted();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error cargando el POS';
    } finally {
      this.cartRestored = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('fullscreenchange', this.onFsChange);
    this.removeEventListener('erp:order-context', this.onOrderContext);
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }
  }

  /**
   * Resuelve (una vez) los fillers de cada slot de contexto (ADR-0043) y crea sus instancias. El POS
   * no conoce a los proveedores (`tables`, `customers`): pregunta al cliente SDK qué Web Components
   * rellenan cada slot y carga su ESM. Las instancias se crean aquí y se re-enganchan en
   * `ensureSlotsMounted` — así sobreviven a que el carrito cambie de layout (panel ↔ overlay móvil).
   */
  private async resolveSlots() {
    const sdk = (globalThis as { erplora?: { loadSlot?: (s: string) => Promise<{ component: string }[]> } }).erplora;
    for (const s of this.slots) {
      if (s.resolved) continue;
      if (!sdk?.loadSlot) { s.resolved = []; continue; }
      try {
        s.resolved = await sdk.loadSlot(s.slot);
      } catch {
        s.resolved = []; // slot vacío o ESM no disponible → el POS funciona igual
      }
      s.els = s.resolved.map((f) => document.createElement(f.component) as HTMLElement);
    }
  }

  /**
   * (Re)engancha los fillers en sus contenedores ACTUALES. Idempotente y barato: si el contenedor ya
   * tiene hijos, no hace nada. Se llama tras resolver y en CADA `updated()`, para que los slots
   * sobrevivan a que el carrito se re-renderice o pase a overlay móvil (el contenedor se recrea).
   * Reusa las MISMAS instancias → conserva el estado del filler (mesa/cliente elegido). Contrato con
   * cualquier rediseño del carrito: basta con conservar un `<div class="order-slot">` y un
   * `<div class="customer-slot">` en la zona de venta.
   */
  private ensureSlotsMounted() {
    for (const s of this.slots) {
      const host = this.renderRoot.querySelector(s.container) as HTMLElement | null;
      if (!host || !s.els.length) continue;
      if (host.firstElementChild) continue; // ya montado en este contenedor
      s.els.forEach((el) => host.appendChild(el));
    }
  }

  /** Avisa a los fillers para que limpien su selección (tras cobrar). */
  private resetSlotContexts() {
    for (const s of this.slots) {
      s.els.forEach((el) => el.dispatchEvent(new CustomEvent(s.reset, { bubbles: false })));
    }
  }

  /** Persiste el carrito (debounced) y re-engancha los slots tras cada render (layout responsive). */
  protected updated(changed: Map<PropertyKey, unknown>) {
    this.ensureSlotsMounted();
    if (!changed.has('cart') || !this.cartRestored) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }, 400);
  }

  private cur() { return this.settings.currency || '€'; }
  private money(n: number) { return `${n.toFixed(2)} ${this.cur()}`; }
  private get total() { return this.cart.reduce((s, l) => s + l.price * l.qty, 0); }
  private get itemCount() { return this.cart.reduce((s, l) => s + l.qty, 0); }
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }

  /** Pantalla completa de TODO el POS (modo kiosko). */
  private async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.requestFullscreen();
    } catch { /* el navegador puede rechazar fullscreen; se ignora */ }
  }

  /** Aparca el carrito actual como ticket y lo deja libre para la siguiente venta. */
  private async park() {
    if (!this.cart.length) return;
    const num = await parkCart(erplora(), this.cart);
    if (!num) { this.error = 'No se pudo aparcar el ticket'; return; }
    this.cart = [];
    this.parked = await listParkedTickets(erplora());
  }

  /** Recupera un ticket aparcado al carrito (solo con el carrito vacío). */
  private async retrieve(t: ParkedTicket) {
    if (this.cart.length) return;
    try {
      this.cart = await retrieveParkedTicket(erplora(), t);
      this.parkedOpen = false;
      this.parked = await listParkedTickets(erplora());
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo recuperar el ticket';
    }
  }

  private add(p: Product) {
    const ex = this.cart.find((l) => l.id === p.id);
    this.cart = ex
      ? this.cart.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l))
      : [...this.cart, { id: p.id, name: p.name, sku: p.sku, price: Number(p.price), qty: 1 }];
  }
  /** Cambia la cantidad; al llegar a 0 la línea se elimina (quitar = poner a 0). */
  private setQty(id: string, d: number) {
    this.cart = this.cart
      .map((l) => (l.id === id ? { ...l, qty: l.qty + d } : l))
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
  private get tenderedNum() { return Number(this.tendered || '0'); }
  private get change() { return Math.max(0, this.tenderedNum - this.total); }

  private async confirm() {
    this.busy = true; this.error = '';
    try {
      const items = this.cart.map((l) => ({ product_id: l.id, product_name: l.name, product_sku: l.sku || '', price: l.price, quantity: l.qty }));
      await erplora().command('sales.complete_sale', {
        items,
        payment_method_id: this.payMethod?.id ?? null,
        payment_method_name: this.payMethod?.name ?? 'Efectivo',
        amount_tendered: this.tenderedNum || this.total,
        channel: 'pos',
        source_module: 'pos',
        table_id: this.tableId ?? null,
        customer_id: this.customerId ?? null,
        customer_name: this.customerName,
      });
      // El handler WASM no devuelve el id → tomamos la venta más reciente.
      const recent = rows<{ id: string }>(await erplora().query('sales.list', { page_size: 1, sort: 'created_at', dir: 'desc' }));
      const saleId = recent[0]?.id;
      if (saleId && this.docFormat === 'invoice') {
        await erplora().command('sales.set_document_type', { sale_id: saleId, document_type: 'invoice' });
      }
      this.paying = false;
      this.cart = [];
      // Libera el contexto de venta (mesa/cliente) y avisa a los fillers para que se limpien.
      this.tableId = undefined; this.tableLabel = '';
      this.customerId = undefined; this.customerName = '';
      this.resetSlotContexts();
      if (saleId) this.docSaleId = saleId;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error al cobrar';
    } finally {
      this.busy = false;
    }
  }

  private get filtered() {
    const q = this.q.trim().toLowerCase();
    return q ? this.products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)) : this.products;
  }

  render() {
    return html`<div class="pos">
      <div class="catalog">
        <ion-searchbar class="search" placeholder="Buscar producto…" value=${this.q}
          @ionInput=${(e: CustomEvent) => { this.q = (e.target as HTMLInputElement).value || ''; }}></ion-searchbar>
        ${this.error ? html`<p style="color:#d9480f">${this.error}</p>` : nothing}
        <div class="grid">
          ${this.filtered.map((p) => html`<button class="tile" @click=${() => this.add(p)}>
            <div class="n">${p.name}</div>
            <div class="p">${this.money(Number(p.price))}</div>
          </button>`)}
          ${!this.filtered.length ? html`<div class="empty">Sin productos.</div>` : nothing}
        </div>
      </div>

      <!-- Botón flotante (solo móvil): abre el panel del carrito -->
      ${!this.cartOpen
        ? html`<button class="fab" @click=${() => { this.cartOpen = true; }}>
            <ion-icon name="cart-outline"></ion-icon>
            ${this.itemCount ? html`<span class="fab-badge">${this.itemCount}</span>` : nothing}
            <span>${this.money(this.total)}</span>
          </button>`
        : nothing}

      <!-- Backdrop del panel (solo móvil, cuando está abierto) -->
      <div class="cart-backdrop" ?data-open=${this.cartOpen} @click=${() => { this.cartOpen = false; }}></div>

      <aside class="cart" ?data-open=${this.cartOpen}>
        <header class="cart-top">
          <div class="ct-row">
            <button class="ct-close" title="Cerrar" @click=${() => { this.cartOpen = false; }}>
              <ion-icon name="chevron-down-outline"></ion-icon>
            </button>
            <span class="ct-title">Venta</span>
            <button class="ct-fs" title="Pantalla completa" @click=${() => this.toggleFullscreen()}>
              <ion-icon name=${this.fullscreen ? 'contract-outline' : 'expand-outline'}></ion-icon>
            </button>
          </div>
          <!-- Fila de contexto (ADR-0043): el shell monta aquí los fillers (mesa / cliente). Cada
               contenedor se oculta si ningún módulo rellena su slot. -->
          <div class="ct-ctx">
            <div class="order-slot"></div>
            <div class="customer-slot"></div>
          </div>
        </header>

        <div class="lines">
          ${this.cart.length
            ? this.cart.map((l) => html`<div class="line">
                <div class="nm">${l.name}</div>
                <div class="lt">${this.money(l.price * l.qty)}</div>
                <div class="qty">
                  <button class="qbtn" @click=${() => this.setQty(l.id, -1)}>−</button>
                  <span>${l.qty}</span>
                  <button class="qbtn" @click=${() => this.setQty(l.id, 1)}>+</button>
                </div>
              </div>`)
            : html`<div class="empty">Toca un producto para añadirlo.</div>`}
        </div>

        <footer class="cart-foot">
          <div class="total"><span>Total</span><b>${this.money(this.total)}</b></div>
          <ion-button class="charge" expand="block" ?disabled=${!this.cart.length} @click=${() => this.openPay()}>Cobrar</ion-button>
          ${this.parkingEnabled
            ? html`<div class="parkrow">
                <ion-button size="small" fill="outline" ?disabled=${!this.cart.length} @click=${() => this.park()}>Aparcar</ion-button>
                <ion-button size="small" fill="outline" ?disabled=${!this.parked.length} @click=${() => { this.parkedOpen = true; }}>
                  Aparcados (${this.parked.length})
                </ion-button>
              </div>`
            : nothing}
        </footer>
      </aside>

      ${this.parkedOpen
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.parkedOpen = false; }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">Tickets aparcados</span>
                <button class="x" @click=${() => { this.parkedOpen = false; }}>✕</button>
              </div>
              ${this.cart.length ? html`<p class="hint">Cobra o aparca la venta actual para recuperar un ticket.</p>` : nothing}
              <div class="plist">
                ${this.parked.map((t) => html`<div class="pitem">
                  <div>
                    <div class="pn">${t.ticket_number}</div>
                    <small class="pm">${(t.created_at || '').replace('T', ' ').slice(0, 16)}</small>
                  </div>
                  <ion-button size="small" ?disabled=${!!this.cart.length} @click=${() => this.retrieve(t)}>Recuperar</ion-button>
                </div>`)}
                ${!this.parked.length ? html`<div class="empty">No hay tickets aparcados.</div>` : nothing}
              </div>
            </div>
          </div>`
        : nothing}

      ${this.paying
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.paying = false; }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">Cobrar ${this.money(this.total)}</span>
                <button class="x" @click=${() => { this.paying = false; }}>✕</button>
              </div>
              <div class="pay">
                <div class="methods">
                  ${this.methods.map((m) => html`<button class="chip" aria-pressed=${this.payMethod?.id === m.id} @click=${() => { this.payMethod = m; }}>${m.name}</button>`)}
                  ${!this.methods.length ? html`<button class="chip" aria-pressed="true">Efectivo</button>` : nothing}
                </div>
                <div class="amt"><span>Entregado</span><span class="v">${this.money(this.tenderedNum)}</span></div>
                <div class="amt"><span>Cambio</span><span class="v change">${this.money(this.change)}</span></div>
                <div class="numpad">
                  ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button @click=${() => this.tap(k)}>${k}</button>`)}
                </div>
                <ion-segment value=${this.docFormat} @ionChange=${(e: CustomEvent) => { this.docFormat = ((e.detail as { value: string }).value === 'invoice' ? 'invoice' : 'ticket'); }}>
                  <ion-segment-button value="ticket"><ion-label>Tiquet</ion-label></ion-segment-button>
                  <ion-segment-button value="invoice"><ion-label>Factura</ion-label></ion-segment-button>
                </ion-segment>
                ${this.error ? html`<p style="color:#d9480f">${this.error}</p>` : nothing}
                <ion-button expand="block" ?disabled=${this.busy} @click=${() => this.confirm()}>
                  ${this.busy ? 'Cobrando…' : 'Confirmar cobro'}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <ion-modal .isOpen=${!!this.docSaleId} @ionModalDidDismiss=${() => { this.docSaleId = undefined; }}>
        <ion-header><ion-toolbar>
          <ion-title>Documento</ion-title>
          <ion-buttons slot="end"><ion-button @click=${() => { this.docSaleId = undefined; }}>Cerrar</ion-button></ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="ion-padding">
          ${this.docSaleId ? html`<erp-sales-document .saleId=${this.docSaleId}></erp-sales-document>` : nothing}
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
