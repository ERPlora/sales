import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '../erp-sales-document/erp-sales-document.js';
import {
  loadActiveCart, persistActiveCart, listParkedTickets, parkCart, retrieveParkedTicket,
  type CartLine, type ErploraClientLike, type ParkedTicket,
} from '../../lib/pos-cart.js';

// erp-pos-touch — pantalla de venta TÁCTIL de mostrador. Rejilla de productos (tap = añadir),
// carrito con +/−, cobro con numpad y elección de documento (tiquet/factura), y al cobrar:
// `sales.complete_sale` → fija `document_type` → muestra el documento (erp-sales-document).
// Todas las ventas pasan por `sales.complete_sale` (channel='pos'). Cliente = a pie por defecto.
// El carrito en curso se persiste en sales_active_cart (sales.cart.*) y sobrevive a recargas.

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
    .cart { display:flex; flex-direction:column; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:14px; padding:.7rem; }
    .cart h3 { margin:0 0 .5rem; font-size:1rem; }
    .lines { flex:1; overflow:auto; display:flex; flex-direction:column; gap:.4rem; }
    .line { display:grid; grid-template-columns: 1fr auto; gap:.2rem .5rem; align-items:center; border-bottom:1px solid var(--ion-border-color,#eee); padding-bottom:.4rem; }
    .line .nm { font-size:.9rem; }
    .line .lt { font-weight:700; white-space:nowrap; }
    .qty { display:flex; align-items:center; gap:.4rem; }
    .qbtn { width:1.9rem; height:1.9rem; border-radius:50%; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); font-size:1.1rem; cursor:pointer; }
    .rm { background:none; border:none; color:#d9480f; cursor:pointer; font-size:.8rem; }
    .total { display:flex; justify-content:space-between; align-items:baseline; margin:.6rem 0; font-size:1rem; }
    .total b { font-size:1.5rem; }
    .charge { font-size:1.1rem; padding:1rem; }
    .empty { color:#8b897f; text-align:center; padding:2rem 0; }
    /* numpad */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:999px; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--ion-color-primary,#0091ce); color:#fff; border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:#2f9e44; }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.5rem; }
    .numpad button { font-size:1.3rem; padding:1rem; border-radius:12px; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); cursor:pointer; }
    /* Overlay de cobro propio (en el shadow → conserva estos estilos; ion-modal los perdería). */
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:50; }
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

  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  async connectedCallback() {
    super.connectedCallback();
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
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error cargando el POS';
    } finally {
      this.cartRestored = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }
  }

  /** Persiste el carrito (debounced) cada vez que cambia, una vez restaurado el guardado. */
  protected updated(changed: Map<PropertyKey, unknown>) {
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
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }

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
  private setQty(id: string, d: number) {
    this.cart = this.cart
      .map((l) => (l.id === id ? { ...l, qty: l.qty + d } : l))
      .filter((l) => l.qty > 0);
  }
  private remove(id: string) { this.cart = this.cart.filter((l) => l.id !== id); }

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
      });
      // El handler WASM no devuelve el id → tomamos la venta más reciente.
      const recent = rows<{ id: string }>(await erplora().query('sales.list', { page_size: 1, sort: 'created_at', dir: 'desc' }));
      const saleId = recent[0]?.id;
      if (saleId && this.docFormat === 'invoice') {
        await erplora().command('sales.set_document_type', { sale_id: saleId, document_type: 'invoice' });
      }
      this.paying = false;
      this.cart = [];
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

      <div class="cart">
        <h3>Venta</h3>
        <div class="lines">
          ${this.cart.length
            ? this.cart.map((l) => html`<div class="line">
                <div class="nm">${l.name}</div>
                <div class="lt">${this.money(l.price * l.qty)}</div>
                <div class="qty">
                  <button class="qbtn" @click=${() => this.setQty(l.id, -1)}>−</button>
                  <span>${l.qty}</span>
                  <button class="qbtn" @click=${() => this.setQty(l.id, 1)}>+</button>
                  <button class="rm" @click=${() => this.remove(l.id)}>quitar</button>
                </div>
              </div>`)
            : html`<div class="empty">Toca un producto para añadirlo.</div>`}
        </div>
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
      </div>

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
