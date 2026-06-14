import { LitElement, html, css, nothing } from 'lit';
import { state, query } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '../erp-sales-document/erp-sales-document.js';

// erp-pos-desktop — pantalla de venta para RETAIL sin táctil: campo de escaneo/SKU (Enter añade),
// lista compacta de líneas con cantidad editable por teclado, y cobro con importe por teclado.
// Mismo backend que la táctil: sales.complete_sale (channel='pos') → set_document_type → documento.
// El carrito en curso se persiste en sales_active_cart (sales.cart.*) y sobrevive a recargas.
import {
  loadActiveCart, persistActiveCart, listParkedTickets, parkCart, retrieveParkedTicket,
  type CartLine, type ErploraClientLike, type ParkedTicket,
} from '../../lib/pos-cart.js';

interface Product { id: string; name: string; sku?: string; price: number; is_active?: number; }
interface PayMethod { id: string; name: string; }
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

export class ErpPosDesktop extends LitElement {
  static styles = css`
    :host { display:block; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    .scan { display:flex; gap:.5rem; margin-bottom:.8rem; }
    .scan input { flex:1; font-size:1.1rem; padding:.7rem .9rem; border:2px solid var(--ion-color-primary,#0091ce); border-radius:10px; background:var(--ion-background-color,#fff); color:inherit; }
    .sugg { position:relative; }
    .drop { position:absolute; z-index:5; left:0; right:0; background:var(--ion-background-color,#fff); border:1px solid var(--ion-border-color,#d9d6cf); border-radius:0 0 10px 10px; max-height:14rem; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.12); }
    .drop button { display:flex; justify-content:space-between; width:100%; border:none; background:none; padding:.5rem .8rem; cursor:pointer; font:inherit; }
    .drop button:hover { background:var(--ion-color-light,#f2f1ed); }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:.5rem .4rem; border-bottom:1px solid var(--ion-border-color,#eee); text-align:left; }
    th { font-size:.75rem; text-transform:uppercase; color:#8b897f; }
    td.num, th.num { text-align:right; white-space:nowrap; }
    td input.q { width:3.5rem; text-align:center; font:inherit; padding:.3rem; border:1px solid var(--ion-border-color,#d9d6cf); border-radius:6px; background:var(--ion-background-color,#fff); color:inherit; }
    .rm { background:none; border:none; color:#d9480f; cursor:pointer; }
    .foot { display:flex; justify-content:space-between; align-items:center; margin-top:1rem; gap:1rem; }
    .total { font-size:1.4rem; font-weight:800; display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
    .table-tag, .customer-tag { font-size:.8rem; font-weight:700; color:#fff; border-radius:999px; padding:.15rem .6rem; }
    .table-tag { background:var(--ion-color-primary,#0091ce); }
    .customer-tag { background:#5c7cfa; }
    .ct-ctx { display:flex; gap:.5rem; margin-bottom:.8rem; }
    .order-slot, .customer-slot { flex:1; min-width:0; }
    .order-slot:empty, .customer-slot:empty { display:none; }
    .ct-ctx:empty { display:none; }
    .empty { color:#8b897f; text-align:center; padding:2rem 0; }
    /* overlay cobro */
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:50; }
    .sheet { background:var(--ion-background-color,#fff); border-radius:16px; padding:1rem; width:min(92vw,24rem); box-shadow:0 12px 48px rgba(0,0,0,.35); }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:#8b897f; }
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:999px; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--ion-color-primary,#0091ce); color:#fff; border-color:transparent; }
    .field label { font-size:.85rem; color:#8b897f; }
    .field input { width:100%; box-sizing:border-box; font-size:1.3rem; padding:.6rem; border:1px solid var(--ion-border-color,#d9d6cf); border-radius:10px; background:var(--ion-background-color,#fff); color:inherit; }
    .change { color:#2f9e44; font-weight:700; }
    /* tickets aparcados */
    .actions { display:flex; gap:.4rem; flex-wrap:wrap; }
    .plist { display:flex; flex-direction:column; gap:.4rem; max-height:50vh; overflow:auto; }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.6rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:10px; padding:.5rem .7rem; }
    .pn { font-weight:700; }
    .pm { color:#8b897f; }
    .hint { color:#8b897f; font-size:.85rem; margin:.2rem 0 .6rem; }
  `;

  @state() private products: Product[] = [];
  @state() private cart: CartLine[] = [];
  @state() private methods: PayMethod[] = [];
  @state() private settings: PosSettings = {};
  @state() private term = '';
  @state() private paying = false;
  @state() private tendered = '';
  @state() private payMethod?: PayMethod;
  @state() private docFormat: 'ticket' | 'invoice' = 'ticket';
  @state() private busy = false;
  @state() private error = '';
  @state() private docSaleId?: string;
  @state() private parked: ParkedTicket[] = [];
  @state() private parkedOpen = false;
  // Contexto de venta aportado por slot fillers (ADR-0043): mesa (`tables`) y cliente (`customers`).
  // El POS recibe los datos por evento DOM y los adjunta a la venta; no conoce a esos módulos.
  @state() private tableId?: string;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';

  @query('#scan') private scanInput?: HTMLInputElement;

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

  async connectedCallback() {
    super.connectedCallback();
    try {
      const [prods, methods, settingsRows, savedCart, parked] = await Promise.all([
        erplora().query('inventory.products.list', { page_size: 500 }).catch(() => []),
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
    this.removeEventListener('erp:order-context', this.onOrderContext);
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }
  }

  /** Resuelve (una vez) los fillers de cada slot de contexto (ADR-0043) y crea sus instancias. */
  private async resolveSlots() {
    const sdk = (globalThis as { erplora?: { loadSlot?: (s: string) => Promise<{ component: string }[]> } }).erplora;
    for (const s of this.slots) {
      if (s.resolved) continue;
      if (!sdk?.loadSlot) { s.resolved = []; continue; }
      try {
        s.resolved = await sdk.loadSlot(s.slot);
      } catch {
        s.resolved = [];
      }
      s.els = s.resolved.map((f) => document.createElement(f.component) as HTMLElement);
    }
  }

  /** (Re)engancha los fillers en sus contenedores; idempotente, sobrevive a re-renders. */
  private ensureSlotsMounted() {
    for (const s of this.slots) {
      const host = this.renderRoot.querySelector(s.container) as HTMLElement | null;
      if (!host || !s.els.length) continue;
      if (host.firstElementChild) continue;
      s.els.forEach((el) => host.appendChild(el));
    }
  }

  /** Avisa a los fillers para que limpien su selección (tras cobrar). */
  private resetSlotContexts() {
    for (const s of this.slots) {
      s.els.forEach((el) => el.dispatchEvent(new CustomEvent(s.reset, { bubbles: false })));
    }
  }

  /** Persiste el carrito (debounced) y re-engancha los slots tras cada render. */
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
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }

  /** Aparca el carrito actual como ticket y lo deja libre para la siguiente venta. */
  private async park() {
    if (!this.cart.length) return;
    const num = await parkCart(erplora(), this.cart);
    if (!num) { this.error = 'No se pudo aparcar el ticket'; return; }
    this.cart = [];
    this.parked = await listParkedTickets(erplora());
    this.scanInput?.focus();
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

  private get matches() {
    const q = this.term.trim().toLowerCase();
    if (!q) return [];
    return this.products
      .filter((p) => (p.sku || '').toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }

  private add(p: Product) {
    const ex = this.cart.find((l) => l.id === p.id);
    this.cart = ex
      ? this.cart.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l))
      : [...this.cart, { id: p.id, name: p.name, sku: p.sku, price: Number(p.price), qty: 1 }];
    this.term = '';
    this.scanInput?.focus();
  }
  private onScanKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const q = this.term.trim().toLowerCase();
    if (!q) return;
    const exact = this.products.find((p) => (p.sku || '').toLowerCase() === q);
    const pick = exact || this.matches[0];
    if (pick) this.add(pick);
  }
  private setQty(id: string, qty: number) {
    this.cart = this.cart.map((l) => (l.id === id ? { ...l, qty: Math.max(1, qty || 1) } : l));
  }
  private remove(id: string) { this.cart = this.cart.filter((l) => l.id !== id); }

  private openPay() {
    if (!this.cart.length) return;
    this.tendered = String(this.total.toFixed(2));
    this.payMethod = this.methods[0];
    this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
    this.paying = true;
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

  render() {
    return html`<div>
      <div class="scan">
        <div class="sugg" style="flex:1">
          <input id="scan" placeholder="Escanea código / escribe SKU o nombre y Enter…"
            .value=${this.term}
            @input=${(e: Event) => { this.term = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => this.onScanKey(e)} />
          ${this.matches.length
            ? html`<div class="drop">
                ${this.matches.map((p) => html`<button @click=${() => this.add(p)}>
                  <span>${p.name} ${p.sku ? html`<small style="color:#8b897f">· ${p.sku}</small>` : nothing}</span>
                  <span>${this.money(Number(p.price))}</span>
                </button>`)}
              </div>`
            : nothing}
        </div>
      </div>
      ${this.error ? html`<p style="color:#d9480f">${this.error}</p>` : nothing}

      <!-- Slots de contexto de venta (ADR-0043): el shell monta aquí los WC de los proveedores
           (mesa = módulo tables, cliente = módulo customers). Cada contenedor se oculta si nadie
           rellena su slot. -->
      <div class="ct-ctx">
        <div class="order-slot"></div>
        <div class="customer-slot"></div>
      </div>

      <table>
        <thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Cant.</th><th class="num">Importe</th><th></th></tr></thead>
        <tbody>
          ${this.cart.length
            ? this.cart.map((l) => html`<tr>
                <td>${l.name} ${l.sku ? html`<small style="color:#8b897f">· ${l.sku}</small>` : nothing}</td>
                <td class="num">${this.money(l.price)}</td>
                <td class="num"><input class="q" type="number" min="1" .value=${String(l.qty)}
                  @input=${(e: Event) => this.setQty(l.id, Number((e.target as HTMLInputElement).value))} /></td>
                <td class="num">${this.money(l.price * l.qty)}</td>
                <td class="num"><button class="rm" @click=${() => this.remove(l.id)} title="Quitar">✕</button></td>
              </tr>`)
            : html`<tr><td colspan="5"><div class="empty">Escanea o busca un producto para empezar.</div></td></tr>`}
        </tbody>
      </table>

      <div class="foot">
        <div class="total">Total ${this.money(this.total)}${this.tableLabel ? html`<span class="table-tag">${this.tableLabel}</span>` : nothing}${this.customerName ? html`<span class="customer-tag">${this.customerName}</span>` : nothing}</div>
        <div class="actions">
          ${this.parkingEnabled
            ? html`
                <ion-button fill="outline" ?disabled=${!this.cart.length} @click=${() => this.park()}>Aparcar</ion-button>
                <ion-button fill="outline" ?disabled=${!this.parked.length} @click=${() => { this.parkedOpen = true; }}>
                  Aparcados (${this.parked.length})
                </ion-button>`
            : nothing}
          <ion-button ?disabled=${!this.cart.length} @click=${() => this.openPay()}>Cobrar (F2)</ion-button>
        </div>
      </div>

      ${this.parkedOpen
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.parkedOpen = false; }}>
            <div class="sheet">
              <div class="sheet-h"><span class="t">Tickets aparcados</span>
                <button class="x" @click=${() => { this.parkedOpen = false; }}>✕</button></div>
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
              <div class="sheet-h"><span class="t">Cobrar ${this.money(this.total)}</span>
                <button class="x" @click=${() => { this.paying = false; }}>✕</button></div>
              <div class="pay">
                <div class="methods">
                  ${this.methods.map((m) => html`<button class="chip" aria-pressed=${this.payMethod?.id === m.id} @click=${() => { this.payMethod = m; }}>${m.name}</button>`)}
                  ${!this.methods.length ? html`<button class="chip" aria-pressed="true">Efectivo</button>` : nothing}
                </div>
                <div class="field"><label>Entregado</label>
                  <input type="number" step="0.01" .value=${this.tendered}
                    @input=${(e: Event) => { this.tendered = (e.target as HTMLInputElement).value; }} /></div>
                <div>Cambio: <span class="change">${this.money(this.change)}</span></div>
                <ion-segment value=${this.docFormat} @ionChange=${(e: CustomEvent) => { this.docFormat = ((e.detail as { value: string }).value === 'invoice' ? 'invoice' : 'ticket'); }}>
                  <ion-segment-button value="ticket"><ion-label>Tiquet</ion-label></ion-segment-button>
                  <ion-segment-button value="invoice"><ion-label>Factura</ion-label></ion-segment-button>
                </ion-segment>
                ${this.error ? html`<p style="color:#d9480f">${this.error}</p>` : nothing}
                <ion-button expand="block" ?disabled=${this.busy} @click=${() => this.confirm()}>${this.busy ? 'Cobrando…' : 'Confirmar cobro'}</ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <ion-modal .isOpen=${!!this.docSaleId} @ionModalDidDismiss=${() => { this.docSaleId = undefined; }}>
        <ion-header><ion-toolbar><ion-title>Documento</ion-title>
          <ion-buttons slot="end"><ion-button @click=${() => { this.docSaleId = undefined; }}>Cerrar</ion-button></ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="ion-padding">
          ${this.docSaleId ? html`<erp-sales-document .saleId=${this.docSaleId}></erp-sales-document>` : nothing}
        </ion-content>
      </ion-modal>
    </div>`;
  }
}

define('erp-pos-desktop', ErpPosDesktop);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos-desktop': ErpPosDesktop;
  }
}
