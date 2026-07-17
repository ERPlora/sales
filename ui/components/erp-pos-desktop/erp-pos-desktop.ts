import { LitElement, html, css, nothing } from 'lit';
import { state, query } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
// La frontera EUROS ↔ CÉNTIMOS vive en el SDK (ADR-0123), no copiada en cada WC. Su gemelo Rust
// es `guest_sdk::money::euros_to_cents`.
import { eurosToCents } from '@erplora/module-sdk';
import { renderDocumentModal } from '../../lib/document-modal.js';

// erp-pos-desktop — pantalla de venta para RETAIL sin táctil: campo de escaneo/SKU (Enter añade),
// lista compacta de líneas con cantidad editable por teclado, y cobro con importe por teclado.
// Mismo backend que la táctil: sales.complete_sale (channel='pos') → set_document_type → documento.
// El carrito en curso se persiste en sales_active_cart (sales.cart.*) y sobrevive a recargas.
import {
  loadActiveCart, persistActiveCart, listParkedTickets, parkCart, retrieveParkedTicket,
  type CartLine, type ErploraClientLike, type ParkedTicket,
} from '../../lib/pos-cart.js';
import { buildCategoryRatesMap, resolveLineTax } from '../../lib/pos-tax.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

interface Product { id: string; name: string; sku?: string; price: number; cost?: number; is_active?: number; tax_category_key?: string; }
interface PayMethod { id: string; name: string; }
interface PosSettings { default_document_format?: string; currency?: string; enable_parked_tickets?: number; default_tax_included?: number; }

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
    /* Panel de cada pestaña del modal Asignar: el filler del módulo se monta aquí dentro. */
    .assign-panel[hidden] { display:none; }
    .assign-tabs { margin-bottom:.8rem; }
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
  /** Modal "Asignar" (mesa/cliente…) y su pestaña activa (ADR-0043 B). */
  @state() private assignOpen = false;
  @state() private assignTab = 0;
  // Contexto de venta aportado por slot fillers (ADR-0043): mesa (`tables`) y cliente (`customers`).
  // El POS recibe los datos por evento DOM y los adjunta a la venta; no conoce a esos módulos.
  @state() private tableId?: string;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';
  /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta. */
  private customerTaxId = '';
  private customerAddress = '';

  @query('#scan') private scanInput?: HTMLInputElement;

  /** Mapa tax_category_key → rate_pct (vía taxes.rates.list); vacío si taxes no responde. ADR-0064/0066. */
  private ratesMap = new Map<string, number>();
  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  // Fillers del modal "Asignar" (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` = una
  // pestaña. El POS no conoce a `tables`/`customers`; monta su WC inline y escucha sus eventos.
  private assignFillers: Array<{ component: string; tab_label: string; tab_icon: string; el: HTMLElement }> = [];
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
  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked, ratesMap] = await Promise.all([
        erplora().queryAll('inventory.products.list').catch(() => []),
        erplora().query('sales.payment_methods').catch(() => []),
        erplora().query('sales.settings.get').catch(() => []),
        loadActiveCart(erplora()),
        listParkedTickets(erplora()),
        buildCategoryRatesMap(erplora()),
      ]);
      this.ratesMap = ratesMap;
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
      this.error = e instanceof Error ? e.message : t('ui.errorLoadingPos');
    } finally {
      this.cartRestored = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    this.removeEventListener('erp:order-context', this.onOrderContext);
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      void persistActiveCart(erplora(), this.cart);
    }
  }

  /** Resuelve (una vez) los fillers del modal Asignar (ADR-0043 B) y crea sus instancias. */
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
      tab_label: typeof f.tab_label === 'string' ? f.tab_label : f.component,
      tab_icon: typeof f.tab_icon === 'string' ? f.tab_icon : 'ellipse-outline',
      el: document.createElement(f.component) as HTMLElement,
    }));
    this.requestUpdate();
  }

  /** (Re)engancha cada filler en el panel de su pestaña; idempotente, sobrevive a re-renders. */
  private ensureSlotsMounted() {
    for (let i = 0; i < this.assignFillers.length; i++) {
      const host = this.renderRoot.querySelector(`.assign-panel[data-i="${i}"]`) as HTMLElement | null;
      const el = this.assignFillers[i].el;
      if (host && el.parentElement !== host) host.appendChild(el);
    }
  }

  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  private resetSlotContexts() {
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-context-reset', { bubbles: false }));
      f.el.dispatchEvent(new CustomEvent('erp:customer-context-reset', { bubbles: false }));
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

  // Dinero formateado con la MONEDA DEL HUB (ADR-0059): el SDK la resuelve de /api/hub/context
  // (misma fuente que dashboard/billing). Antes hardcodeaba '€' / la moneda por-módulo.
  // FIX QA (2026-06-25): el POS trabaja en CÉNTIMOS (price de inventory.products.list, total del
  // carrito) → debe usar formatMoney (divide /100), NO formatAmount (espera unidades) que mostraba
  // los precios ×100 ("3.500,00 €" por un servicio de 35 €).
  private money(n: number) { return erplora().formatMoney(Number(n) || 0); }
  private get total() { return this.cart.reduce((s, l) => s + (l.is_gift ? 0 : l.price * l.qty), 0); }
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }

  /** Aparca el carrito actual como ticket y lo deja libre para la siguiente venta. */
  private async park() {
    if (!this.cart.length) return;
    const num = await parkCart(erplora(), this.cart);
    if (!num) { this.error = t('ui.errorPark'); return; }
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
      this.error = e instanceof Error ? e.message : t('ui.errorRetrieve');
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
    const ex = this.cart.find((l) => l.id === p.id && !l.is_gift);
    // tax_category_key = referencia fiscal del producto (autoridad del servidor, ADR-0085).
    // tax_rate = % preview; cost = para el arqueo de invitaciones (a coste).
    const tax_rate = resolveLineTax(this.ratesMap, p.tax_category_key);
    this.cart = ex
      ? this.cart.map((l) => (l.id === p.id && !l.is_gift ? { ...l, qty: l.qty + 1 } : l))
      : [...this.cart, { id: p.id, name: p.name, sku: p.sku, price: Number(p.price), qty: 1, tax_category_key: p.tax_category_key, tax_rate, cost: Number(p.cost) || 0 }];
    this.term = '';
    this.scanInput?.focus();
  }

  /** Invitar/quitar invitación a una línea (comp): toggle is_gift con motivo por defecto. */
  private toggleGift(id: string) {
    this.cart = this.cart.map((l) =>
      l.id === id ? { ...l, is_gift: !l.is_gift, gift_reason: !l.is_gift ? (l.gift_reason || 'Invitación') : undefined } : l,
    );
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
    // `total` son CÉNTIMOS y el campo «entregado» es un `<input step="0.01">`, o sea EUROS. Sin
    // dividir, una venta de 14,93 € prerrellenaba «1493.00»; y teclear «20» (un billete) registraba
    // 20 CÉNTIMOS entregados → cambio 0 € y arqueo de caja corrupto (ADR-0123).
    this.tendered = (this.total / 100).toFixed(2);
    this.payMethod = this.methods[0];
    this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
    this.paying = true;
  }
  /** Lo entregado por el cliente, en CÉNTIMOS (el input está en euros). */
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
      const items = this.cart.map((l) => ({ product_id: l.id, product_name: l.name, product_sku: l.sku || '', price: l.price, quantity: l.qty, tax_category_key: l.tax_category_key ?? null, tax_rate: l.tax_rate ?? 0, is_gift: l.is_gift ?? false, gift_reason: l.gift_reason ?? '', cost: l.cost ?? 0 }));
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
        // Snapshot fiscal del cliente (ADR-0132): sin esto la factura del TPV sale sin NIF.
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
      // Libera el contexto de venta (mesa/cliente) y avisa a los fillers para que se limpien.
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

  render() {
    return html`<div>
      <div class="scan">
        <div class="sugg" style="flex:1">
          <input id="scan" placeholder=${t('ui.scanPlaceholder')}
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

      <table>
        <thead><tr><th>${t('ui.colProduct')}</th><th class="num">${t('ui.colPrice')}</th><th class="num">${t('ui.colQty')}</th><th class="num">${t('ui.colAmount')}</th><th></th></tr></thead>
        <tbody>
          ${this.cart.length
            ? this.cart.map((l) => html`<tr>
                <td>${l.name} ${l.sku ? html`<small style="color:#8b897f">· ${l.sku}</small>` : nothing}${l.is_gift ? html` <ion-badge color="success">${t('ui.giftBadge')}</ion-badge>` : nothing}</td>
                <td class="num">${this.money(l.price)}</td>
                <td class="num"><input class="q" type="number" min="1" .value=${String(l.qty)}
                  @input=${(e: Event) => this.setQty(l.id, Number((e.target as HTMLInputElement).value))} /></td>
                <td class="num" style=${l.is_gift ? 'text-decoration:line-through;opacity:.55' : ''}>${this.money(l.price * l.qty)}</td>
                <td class="num"><button class="rm" @click=${() => this.toggleGift(l.id)} title=${t('ui.giftAction')} style=${l.is_gift ? 'color:var(--ion-color-success,#2dd36f)' : ''}>🎁</button> <button class="rm" @click=${() => this.remove(l.id)} title=${t('ui.remove')}>✕</button></td>
              </tr>`)
            : html`<tr><td colspan="5"><div class="empty">${t('ui.cartEmptyDesktop')}</div></td></tr>`}
        </tbody>
      </table>

      <div class="foot">
        <div class="total">${t('ui.colTotal')} ${this.money(this.total)}${this.tableLabel ? html`<span class="table-tag">${this.tableLabel}</span>` : nothing}${this.customerName ? html`<span class="customer-tag">${this.customerName}</span>` : nothing}</div>
        <div class="actions">
          ${this.assignFillers.length
            ? html`<ion-button fill="outline" @click=${() => { this.assignOpen = true; }}>
                <ion-icon slot="start" name=${this.tableId || this.customerId ? 'people' : 'people-outline'}></ion-icon>
                ${t('ui.assign')}
              </ion-button>`
            : nothing}
          ${this.parkingEnabled
            ? html`
                <ion-button fill="outline" ?disabled=${!this.cart.length} @click=${() => this.park()}>${t('ui.park')}</ion-button>
                <ion-button fill="outline" ?disabled=${!this.parked.length} @click=${() => { this.parkedOpen = true; }}>
                  ${t('ui.parked')} (${this.parked.length})
                </ion-button>`
            : nothing}
          <ion-button ?disabled=${!this.cart.length} @click=${() => this.openPay()}>${t('ui.chargeShortcut')}</ion-button>
        </div>
      </div>

      ${this.assignOpen
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.assignOpen = false; }}>
            <div class="sheet" role="dialog" aria-modal="true" aria-label=${t('ui.assign')}>
              <div class="sheet-h"><span class="t">${t('ui.assign')}</span>
                <button class="x" @click=${() => { this.assignOpen = false; }}>✕</button></div>
              ${this.assignFillers.length > 1
                ? html`<ion-segment class="assign-tabs" value=${String(this.assignTab)}
                    @ionChange=${(e: CustomEvent) => { this.assignTab = Number((e.detail as { value: string }).value); }}>
                    ${this.assignFillers.map((f, i) => html`<ion-segment-button value=${String(i)}>
                      <ion-icon name=${f.tab_icon}></ion-icon><ion-label>${f.tab_label}</ion-label>
                    </ion-segment-button>`)}
                  </ion-segment>`
                : nothing}
              ${this.assignFillers.map((_, i) => html`<div class="assign-panel" data-i=${i} ?hidden=${i !== this.assignTab}></div>`)}
            </div>
          </div>`
        : nothing}

      ${this.parkedOpen
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.parkedOpen = false; }}>
            <div class="sheet">
              <div class="sheet-h"><span class="t">${t('ui.parkedTickets')}</span>
                <button class="x" @click=${() => { this.parkedOpen = false; }}>✕</button></div>
              ${this.cart.length ? html`<p class="hint">${t('ui.retrieveHint')}</p>` : nothing}
              <div class="plist">
                ${this.parked.map((pt) => html`<div class="pitem">
                  <div>
                    <div class="pn">${pt.ticket_number}</div>
                    <small class="pm">${(pt.created_at || '').replace('T', ' ').slice(0, 16)}</small>
                  </div>
                  <ion-button size="small" ?disabled=${!!this.cart.length} @click=${() => this.retrieve(pt)}>${t('ui.retrieve')}</ion-button>
                </div>`)}
                ${!this.parked.length ? html`<div class="empty">${t('ui.noParkedTickets')}</div>` : nothing}
              </div>
            </div>
          </div>`
        : nothing}

      ${this.paying
        ? html`<div class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.paying = false; }}>
            <div class="sheet">
              <div class="sheet-h"><span class="t">${t('ui.charge')} ${this.money(this.total)}</span>
                <button class="x" @click=${() => { this.paying = false; }}>✕</button></div>
              <div class="pay">
                <div class="methods">
                  ${this.methods.map((m) => html`<button class="chip" aria-pressed=${this.payMethod?.id === m.id} @click=${() => { this.payMethod = m; }}>${m.name}</button>`)}
                  ${!this.methods.length ? html`<button class="chip" aria-pressed="true">${t('ui.cash')}</button>` : nothing}
                </div>
                <div class="field"><label>${t('ui.tendered')}</label>
                  <input type="number" step="0.01" .value=${this.tendered}
                    @input=${(e: Event) => { this.tendered = (e.target as HTMLInputElement).value; }} /></div>
                <div>${t('ui.change')}: <span class="change">${this.money(this.change)}</span></div>
                <ion-segment value=${this.docFormat} @ionChange=${(e: CustomEvent) => { this.docFormat = ((e.detail as { value: string }).value === 'invoice' ? 'invoice' : 'ticket'); }}>
                  <ion-segment-button value="ticket"><ion-label>${t('ui.formatTicket')}</ion-label></ion-segment-button>
                  <ion-segment-button value="invoice"><ion-label>${t('ui.formatInvoice')}</ion-label></ion-segment-button>
                </ion-segment>
                ${this.error ? html`<p style="color:#d9480f">${this.error}</p>` : nothing}
                <ion-button expand="block" ?disabled=${this.busy} @click=${() => this.confirm()}>${this.busy ? t('ui.charging') : t('ui.confirmCharge')}</ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => { this.docSaleId = undefined; }, t })}
    </div>`;
  }
}

define('erp-pos-desktop', ErpPosDesktop);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos-desktop': ErpPosDesktop;
  }
}
