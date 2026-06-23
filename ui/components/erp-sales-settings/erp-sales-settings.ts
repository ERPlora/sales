import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-sales-settings — formulario de la configuración singleton del módulo sales (POS).
// Carga `sales.settings.get` y guarda con `sales.settings.update` (upsert por hub_id).
// Construido sobre primitivos Ionic (inputs/toggles/segment) — el shell registra los ion-*.

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  command(name: string, payload?: Record<string, unknown>): Promise<unknown>;
  /** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
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
    :host { display:block; height:100%; overflow-y:auto; box-sizing:border-box; padding:1rem 1rem 2rem; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
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

  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    try {
      const rows = await erplora().query<Settings[]>('sales.settings.get');
      const row = Array.isArray(rows) ? rows[0] : (rows as Settings | undefined);
      this.s = { ...DEFAULTS, ...(row || {}) };
    } catch (e) {
      this.error = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorLoadingSettings');
    } finally {
      this.loading = false;
    }
  }

  disconnectedCallback() {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    super.disconnectedCallback();
  }

  private set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.s = { ...this.s, [key]: value };
    this.message = '';
  }

  private async save() {
    this.saving = true; this.message = ''; this.error = '';
    try {
      await erplora().command('sales.settings.update', { ...this.s });
      this.message = erplora().t(CATALOG, 'ui.settingsSaved');
    } catch (e) {
      this.error = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorSaving');
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
    const t = (k: string): string => erplora().t(CATALOG, k);
    if (this.loading) return html`<p class="sub">${t('ui.loadingSettings')}</p>`;
    return html`<div>
      ${this.error ? html`<p class="msg err">${this.error}</p>` : nothing}

      <div class="group">
        <div class="gh">${t('ui.groupSaleScreen')}</div>
        <div class="row">
          <div class="lbl">${t('ui.defaultScreen')}<small>${t('ui.defaultScreenHint')}</small></div>
          ${this.segment('pos_layout', [
            { value: 'touch', label: t('ui.screenTouch') },
            { value: 'desktop', label: t('ui.screenDesktop') },
          ])}
        </div>
      </div>

      <div class="group">
        <div class="gh">${t('ui.groupSaleDocument')}</div>
        <div class="row">
          <div class="lbl">${t('ui.defaultFormat')}<small>${t('ui.defaultFormatHint')}</small></div>
          ${this.segment('default_document_format', [
            { value: 'ticket', label: t('ui.formatTicket') },
            { value: 'invoice', label: t('ui.formatInvoice') },
          ])}
        </div>
        ${this.toggle('auto_invoice_with_tax_id', t('ui.autoInvoiceTaxId'), t('ui.autoInvoiceTaxIdHint'))}
      </div>

      <div class="group">
        <div class="gh">${t('ui.groupPaymentMethods')}</div>
        ${this.toggle('allow_cash', t('ui.cash'))}
        ${this.toggle('allow_card', t('ui.card'))}
        ${this.toggle('allow_transfer', t('ui.transfer'))}
      </div>

      <div class="group">
        <div class="gh">${t('ui.groupSale')}</div>
        ${this.toggle('require_customer', t('ui.requireCustomer'), t('ui.requireCustomerHint'))}
        ${this.toggle('allow_discounts', t('ui.allowDiscounts'))}
        ${this.toggle('default_tax_included', t('ui.taxIncluded'))}
        ${this.toggle('enable_parked_tickets', t('ui.parkedTicketsToggle'), t('ui.parkedTicketsToggleHint'))}
        ${this.toggle('sync_products', t('ui.syncProducts'))}
        ${this.toggle('sync_services', t('ui.syncServices'))}
        <div class="field">
          <label>${t('ui.parkedExpiryHours')}</label>
          <input type="number" min="1" .value=${String(this.s.ticket_expiry_hours)}
            @input=${(e: Event) => this.set('ticket_expiry_hours', Number((e.target as HTMLInputElement).value || 0))} />
        </div>
      </div>

      <div class="group">
        <div class="gh">${t('ui.groupReceipt')}</div>
        <div class="field">
          <label>${t('ui.receiptHeader')}</label>
          <textarea rows="2" .value=${this.s.receipt_header}
            @input=${(e: Event) => this.set('receipt_header', (e.target as HTMLTextAreaElement).value)}></textarea>
        </div>
        <div class="field">
          <label>${t('ui.receiptFooter')}</label>
          <textarea rows="2" .value=${this.s.receipt_footer}
            @input=${(e: Event) => this.set('receipt_footer', (e.target as HTMLTextAreaElement).value)}></textarea>
        </div>
        <div class="field">
          <label>${t('ui.receiptFooterImage')}</label>
          <input type="text" .value=${this.s.receipt_footer_image}
            @input=${(e: Event) => this.set('receipt_footer_image', (e.target as HTMLInputElement).value)} />
        </div>
      </div>

      <div class="bar">
        <ion-button @click=${() => this.save()} ?disabled=${this.saving}>
          ${this.saving ? t('ui.saving') : t('ui.saveSettings')}
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
