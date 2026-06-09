import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';

// erp-sales-settings — formulario de la configuración singleton del módulo sales (POS).
// Carga `sales.settings.get` y guarda con `sales.settings.update` (upsert por hub_id).
// Construido sobre primitivos Ionic (inputs/toggles/segment) — el shell registra los ion-*.

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  command(name: string, payload?: Record<string, unknown>): Promise<unknown>;
}

/** Forma de la fila `sales_settings` (los booleanos viajan como 0/1). */
interface Settings {
  allow_cash: number;
  allow_card: number;
  allow_transfer: number;
  sync_products: number;
  sync_services: number;
  require_customer: number;
  allow_discounts: number;
  enable_parked_tickets: number;
  default_tax_included: number;
  ticket_expiry_hours: number;
  receipt_header: string;
  receipt_footer: string;
  receipt_footer_image: string;
  pos_layout: string;
  default_document_format: string;
  auto_invoice_with_tax_id: number;
}

const DEFAULTS: Settings = {
  allow_cash: 1,
  allow_card: 1,
  allow_transfer: 0,
  sync_products: 1,
  sync_services: 0,
  require_customer: 0,
  allow_discounts: 1,
  enable_parked_tickets: 1,
  default_tax_included: 1,
  ticket_expiry_hours: 24,
  receipt_header: '',
  receipt_footer: '',
  receipt_footer_image: '',
  pos_layout: 'touch',
  default_document_format: 'ticket',
  auto_invoice_with_tax_id: 1,
};

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpSalesSettings extends LitElement {
  static styles = css`
    :host { display:block; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    h2 { margin:0 0 .25rem; font-size:1.15rem; }
    .sub { color:#8b897f; font-size:.85rem; margin:0 0 1rem; }
    .group { border:1px solid var(--ion-border-color,#e0ddd4); border-radius:12px; padding:.4rem .9rem; margin-bottom:1rem; }
    .group > .gh { font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; color:#8b897f; padding:.6rem 0 .2rem; }
    .row { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.5rem 0; border-top:1px solid var(--ion-border-color,#eee); }
    .row:first-of-type { border-top:none; }
    .row .lbl { font-size:.92rem; }
    .row .lbl small { display:block; color:#8b897f; font-size:.78rem; }
    .seg { min-width:14rem; }
    textarea, input[type=text], input[type=number] {
      width:100%; box-sizing:border-box; font:inherit; padding:.5rem .6rem;
      border:1px solid var(--ion-border-color,#d9d6cf); border-radius:8px; background:var(--ion-background-color,#fff); color:inherit;
    }
    .field { padding:.5rem 0; }
    .field label { display:block; font-size:.85rem; margin-bottom:.25rem; }
    .bar { display:flex; gap:.6rem; align-items:center; margin-top:.5rem; }
    .msg { font-size:.85rem; }
    .msg.ok { color:#2f9e44; } .msg.err { color:#d9480f; }
  `;

  @state() s: Settings = { ...DEFAULTS };

  @state() loading = true;

  @state() saving = false;

  @state() message = '';

  @state() error = '';

  async connectedCallback() {
    super.connectedCallback();
    try {
      const rows = await erplora().query<Settings[]>('sales.settings.get');
      const row = Array.isArray(rows) ? rows[0] : (rows as Settings | undefined);
      this.s = { ...DEFAULTS, ...(row || {}) };
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error cargando ajustes';
    } finally {
      this.loading = false;
    }
  }

  private set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.s = { ...this.s, [key]: value };
    this.message = '';
  }

  private async save() {
    this.saving = true; this.message = ''; this.error = '';
    try {
      await erplora().command('sales.settings.update', { ...this.s });
      this.message = 'Ajustes guardados.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Error guardando';
    } finally {
      this.saving = false;
    }
  }

  private toggle(key: keyof Settings, label: string, hint?: string) {
    return html`<div class="row">
      <div class="lbl">${label}${hint ? html`<small>${hint}</small>` : nothing}</div>
      <ion-toggle
        .checked=${!!this.s[key]}
        @ionChange=${(e: CustomEvent) => this.set(key, ((e.target as HTMLInputElement).checked ? 1 : 0) as never)}
      ></ion-toggle>
    </div>`;
  }

  private segment(key: keyof Settings, opts: Array<{ value: string; label: string }>) {
    return html`<ion-segment
      class="seg"
      .value=${String(this.s[key])}
      @ionChange=${(e: CustomEvent) => this.set(key, String((e.detail as { value: string }).value) as never)}
    >
      ${opts.map((o) => html`<ion-segment-button value=${o.value}><ion-label>${o.label}</ion-label></ion-segment-button>`)}
    </ion-segment>`;
  }

  render() {
    if (this.loading) return html`<p class="sub">Cargando ajustes…</p>`;
    return html`<div>
      <h2>Ajustes del punto de venta</h2>
      <p class="sub">Configuración del módulo de ventas para este negocio.</p>
      ${this.error ? html`<p class="msg err">${this.error}</p>` : nothing}

      <div class="group">
        <div class="gh">Pantalla de venta</div>
        <div class="row">
          <div class="lbl">Pantalla por defecto<small>Cuál se abre al vender</small></div>
          ${this.segment('pos_layout', [
            { value: 'touch', label: 'Táctil' },
            { value: 'desktop', label: 'Escritorio' },
          ])}
        </div>
      </div>

      <div class="group">
        <div class="gh">Documento de la venta</div>
        <div class="row">
          <div class="lbl">Formato por defecto<small>Tiquet 80mm o factura A4</small></div>
          ${this.segment('default_document_format', [
            { value: 'ticket', label: 'Tiquet' },
            { value: 'invoice', label: 'Factura' },
          ])}
        </div>
        ${this.toggle('auto_invoice_with_tax_id', 'Factura automática con NIF', 'Si el cliente tiene NIF/CIF, emitir factura A4')}
      </div>

      <div class="group">
        <div class="gh">Métodos de pago</div>
        ${this.toggle('allow_cash', 'Efectivo')}
        ${this.toggle('allow_card', 'Tarjeta')}
        ${this.toggle('allow_transfer', 'Transferencia')}
      </div>

      <div class="group">
        <div class="gh">Venta</div>
        ${this.toggle('require_customer', 'Exigir cliente', 'Obliga a seleccionar cliente en cada venta')}
        ${this.toggle('allow_discounts', 'Permitir descuentos')}
        ${this.toggle('default_tax_included', 'Precios con impuestos incluidos')}
        ${this.toggle('enable_parked_tickets', 'Tiquets aparcados', 'Permite dejar ventas en espera')}
        ${this.toggle('sync_products', 'Sincronizar productos')}
        ${this.toggle('sync_services', 'Sincronizar servicios')}
        <div class="field">
          <label>Caducidad de tiquets aparcados (horas)</label>
          <input type="number" min="1" .value=${String(this.s.ticket_expiry_hours)}
            @input=${(e: Event) => this.set('ticket_expiry_hours', Number((e.target as HTMLInputElement).value || 0))} />
        </div>
      </div>

      <div class="group">
        <div class="gh">Tiquet (cabecera y pie)</div>
        <div class="field">
          <label>Cabecera</label>
          <textarea rows="2" .value=${this.s.receipt_header}
            @input=${(e: Event) => this.set('receipt_header', (e.target as HTMLTextAreaElement).value)}></textarea>
        </div>
        <div class="field">
          <label>Pie</label>
          <textarea rows="2" .value=${this.s.receipt_footer}
            @input=${(e: Event) => this.set('receipt_footer', (e.target as HTMLTextAreaElement).value)}></textarea>
        </div>
        <div class="field">
          <label>Imagen de pie (URL)</label>
          <input type="text" .value=${this.s.receipt_footer_image}
            @input=${(e: Event) => this.set('receipt_footer_image', (e.target as HTMLInputElement).value)} />
        </div>
      </div>

      <div class="bar">
        <ion-button @click=${() => this.save()} ?disabled=${this.saving}>
          ${this.saving ? 'Guardando…' : 'Guardar ajustes'}
        </ion-button>
        ${this.message ? html`<span class="msg ok">${this.message}</span>` : nothing}
      </div>
    </div>`;
  }
}

define('erp-sales-settings', ErpSalesSettings);

declare global {
  interface HTMLElementTagNameMap {
    'erp-sales-settings': ErpSalesSettings;
  }
}
