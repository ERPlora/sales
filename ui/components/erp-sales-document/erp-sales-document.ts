import { LitElement, html, css, nothing } from 'lit';
import { state, property } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-receipt';
import '@erplora/outfitkit/ok-invoice';
import {
  saleToReceipt,
  saleToInvoice,
  resolveFormat,
  type SaleRow,
  type SaleLineRow,
  type SaleSettings,
} from '../../lib/document-mappers.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-sales-document — visor del documento de una venta (tiquet u factura) en el formato adecuado.
// Carga `sales.get` + `sales.lines` + `sales.settings.get` por `sale-id`, mapea (document-mappers)
// y renderiza <ok-receipt> o <ok-invoice>. También acepta inyección directa (.sale/.lines/.settings)
// para previsualización/test sin SDK. El botón de imprimir usa window.print() + @media print.

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  /** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpSalesDocument extends LitElement {
  static styles = css`
    :host { display:block; }
    .bar { display:flex; gap:.5rem; align-items:center; justify-content:flex-end; margin-bottom:.6rem; }
    .err { color:#d9480f; }
    .muted { color:#8b897f; }
    /* Al imprimir: solo el documento; se oculta la barra de acciones. */
    @media print {
      .bar { display:none; }
      :host { background:#fff; }
    }
  `;

  /** Id de la venta a cargar (atributo `sale-id`). */
  @property({ attribute: 'sale-id' }) saleId?: string;

  /** Inyección directa (preview/test) — si están, no se llama al SDK. */
  @property({ attribute: false }) sale?: SaleRow;

  @property({ attribute: false }) lines?: SaleLineRow[];

  @property({ attribute: false }) settings?: SaleSettings;

  /** Forzar formato ('ticket' | 'invoice'); si no, se resuelve de la venta/ajustes. */
  @property() format?: 'ticket' | 'invoice';

  @state() private loading = false;

  @state() private error = '';

  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    if (!this.sale && this.saleId) await this.load();
  }

  disconnectedCallback() {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    super.disconnectedCallback();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('saleId') && this.saleId && !this.sale) this.load();
  }

  private async load() {
    this.loading = true; this.error = '';
    try {
      const [sale, lines, settingsRows] = await Promise.all([
        erplora().query<SaleRow>('sales.get', { sale_id: this.saleId }),
        erplora().query<SaleLineRow[]>('sales.lines', { sale_id: this.saleId }),
        erplora().query<SaleSettings[]>('sales.settings.get').catch(() => []),
      ]);
      this.sale = Array.isArray(sale) ? (sale as SaleRow[])[0] : sale;
      this.lines = lines || [];
      this.settings = (Array.isArray(settingsRows) ? settingsRows[0] : settingsRows) || {};
    } catch (e) {
      this.error = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorDocument');
    } finally {
      this.loading = false;
    }
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    if (this.loading) return html`<p class="muted">${t('ui.loadingDocument')}</p>`;
    if (this.error) return html`<p class="err">${this.error}</p>`;
    if (!this.sale) return html`<p class="muted">${t('ui.noSale')}</p>`;

    const settings = this.settings || {};
    const lines = this.lines || [];
    const fmt = this.format || resolveFormat(this.sale, settings);

    return html`<div>
      <div class="bar">
        <ion-button size="small" fill="outline" @click=${() => window.print()}>
          <ion-icon slot="start" name="print-outline"></ion-icon> ${t('ui.print')}
        </ion-button>
      </div>
      ${fmt === 'invoice'
        ? html`<ok-invoice .invoice=${saleToInvoice(this.sale, lines, settings)}></ok-invoice>`
        : html`<ok-receipt .receipt=${saleToReceipt(this.sale, lines, settings)}></ok-receipt>`}
    </div>`;
  }
}

define('erp-sales-document', ErpSalesDocument);

declare global {
  interface HTMLElementTagNameMap {
    'erp-sales-document': ErpSalesDocument;
  }
}
