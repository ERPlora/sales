import { LitElement, html, css, nothing } from 'lit';
import { state, property } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import '@erplora/outfitkit/ok-receipt';
import { receiptToPrintableHtml } from '../../lib/receipt-html.js';
// El mismo tiquet, en la forma que lee la impresora térmica (sales#79).
import { saleToPrintDocument, type PrintDocument } from '../../lib/print-document.js';
import '@erplora/outfitkit/ok-invoice';
import {
  saleToReceipt,
  saleToInvoice,
  receiptLabels,
  invoiceLabels,
  resolveFormat,
  type SaleRow,
  type SaleLineRow,
  type SaleSettings,
  type FiscalData,
} from '../../lib/document-mappers.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-sales-document — visor del documento de una venta (tiquet u factura) en el formato adecuado.
// Carga `sales.get` + `sales.lines` + `sales.settings.get` por `sale-id`, mapea (document-mappers,
// con el locale del hub y las labels del catálogo ADR-0055) y renderiza <ok-receipt> o <ok-invoice>.
// También acepta inyección directa (.sale/.lines/.settings) para previsualización/test sin SDK.
// Pinta SOLO el documento: el botón de imprimir vive en el modal anfitrión (document-modal.ts).

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  /** Integración OPCIONAL (ADR-0127): undefined SOLO si el módulo dueño no está instalado;
   *  un contrato roto contra un módulo presente EXPLOTA (no es un catch silencioso). */
  queryOptional<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T | undefined>;
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
    .err { color:#d9480f; }
    .muted { color:#8b897f; }
    /* Presencia de PAPEL: sombra sutil sobre el fondo gris del modal (tiquet térmico / folio A4). */
    ok-receipt::part(paper),
    ok-invoice::part(sheet) {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08);
      border-radius: 2px;
    }
    @media print {
      :host { background: #fff; }
      /* En papel de verdad no hay sombras. */
      ok-receipt::part(paper),
      ok-invoice::part(sheet) { box-shadow: none; }
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

  /** Datos fiscales (VeriFactu) resueltos para el documento: QR de validación AEAT + nº oficial. */
  @state() private fiscal: FiscalData = {};

  /** Backoff del reintento fiscal (ms). Override en tests. */
  @property({ attribute: false }) fiscalRetryDelays: number[] = [400, 900, 1800];

  /** Venta ya cargada/en curso — evita el doble load (connectedCallback + updated disparan ambos). */
  private loadedFor?: string;

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
    if (!this.saleId || this.loadedFor === this.saleId) return;
    this.loadedFor = this.saleId;
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
      // Datos fiscales (QR VeriFactu) — best-effort y SIN bloquear el primer pintado: el Outbox es
      // asíncrono (la factura/registro se crean unos ms después de cobrar), así que se observa con
      // reintentos y el QR aparece solo cuando llega.
      void this.watchFiscal(this.saleId);
    } catch (e) {
      this.error = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorDocument');
    } finally {
      this.loading = false;
    }
  }

  /** Resuelve lo fiscal con backoff: reintenta SOLO si el módulo está instalado pero el registro
   *  aún no existe (el race del Outbox). Módulo ausente (`queryOptional` → undefined) = una consulta
   *  y en paz. Si el usuario cambió de venta, aborta. */
  private async watchFiscal(saleId: string): Promise<void> {
    for (const delay of [0, ...this.fiscalRetryDelays]) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (this.saleId !== saleId || !this.isConnected) return;
      const { fiscal, retry } = await this.resolveFiscal(saleId);
      this.fiscal = fiscal;
      if (fiscal.qr || !retry) return;
    }
  }

  /** Resuelve venta → factura (`invoice.by_source`) → registro VeriFactu (`verifactu.records.by_invoice`)
   *  para obtener el QR de validación AEAT + nº fiscal oficial + CSV. Tolerante a fallos.
   *  `retry` = merece reintento (módulo presente, registro todavía no). */
  private async resolveFiscal(saleId: string): Promise<{ fiscal: FiscalData; retry: boolean }> {
    try {
      // `queryOptional` (ADR-0127): ni `invoice` ni `verifactu` son dependencias de sales — un hub
      // puede cobrar sin módulo de facturación. Ausentes → sin QR fiscal y en paz; contrato ROTO →
      // explota (lo atrapa el catch tolerante de este método).
      const invRows = await erplora().queryOptional<Record<string, unknown> | Record<string, unknown>[]>(
        'invoice.by_source', { source_id: saleId });
      if (invRows === undefined) return { fiscal: {}, retry: false }; // módulo invoice ausente
      const invoice = (Array.isArray(invRows) ? invRows[0] : invRows) as Record<string, unknown> | undefined;
      if (!invoice?.id) return { fiscal: {}, retry: true }; // factura aún no creada (Outbox)
      const base: FiscalData = {
        number: (invoice.number as string) || undefined,
        issuer_nif: (invoice.issuer_nif as string) || undefined,
        // Issuer legal name resolved by the runtime from hub_settings.business_legal_name
        // (ADR-0061) — the document header must honor the business profile (#32).
        issuer_name: (invoice.issuer_name as string) || undefined,
        customer_name: (invoice.customer_name as string) || undefined,
        customer_tax_id: (invoice.customer_tax_id as string) || undefined,
      };
      const recRows = await erplora().queryOptional<Record<string, unknown> | Record<string, unknown>[]>(
        'verifactu.records.by_invoice', { invoice_id: invoice.id });
      if (recRows === undefined) return { fiscal: base, retry: false }; // sin módulo verifactu
      const rec = (Array.isArray(recRows) ? recRows[0] : recRows) as Record<string, unknown> | undefined;
      if (!rec) return { fiscal: base, retry: true }; // registro fiscal aún no creado (Outbox)
      const csv = (rec.aeat_csv as string) || '';
      const qr = (rec.qr_url as string) || '';
      const t = (k: string): string => erplora().t(CATALOG, k);
      return {
        fiscal: {
          ...base,
          qr: qr || undefined,
          qr_note: csv ? `CSV: ${csv}` : (qr ? t('ui.qrValidateNote') : undefined),
        },
        retry: false,
      };
    } catch {
      return { fiscal: {}, retry: false }; // sin permiso / contrato roto → documento sin QR
    }
  }

  /**
   * El documento como **HTML plano y autocontenido**, para imprimirlo aislado (iframe) o para
   * generar el PDF desde Rust. No se imprime el DOM de este componente: vive dentro de un
   * `ion-modal` reparentado y con shadow DOM, y el navegador acababa sacando la app entera.
   * Devuelve '' si aún no hay venta cargada.
   */
  printableHtml(): string {
    if (!this.sale) return '';
    const t = (k: string): string => erplora().t(CATALOG, k);
    const doc = saleToReceipt(
      this.sale, this.lines || [], this.settings || {}, this.fiscal, erplora().locale,
      t('ui.docDefaultBusiness'), t,
    );
    // sales#120: el papel habla el idioma del hub — las palabras son labels del catálogo, no
    // constantes de la plantilla («Cambio» junto a un tique en inglés era el papel mezclado).
    return receiptToPrintableHtml({
      ...(doc as unknown as Parameters<typeof receiptToPrintableHtml>[0]),
      labels: { subtotal: t('ui.docSubtotal'), total: t('ui.docTotal'), change: t('ui.docChange'), document: t('ui.document') },
    });
  }

  /**
   * El documento **estructurado** que lee el renderizador ESC/POS (`escpos::render_receipt`).
   *
   * No es lo mismo que `printableHtml()`: aquel es para un navegador, este para una impresora
   * térmica, que busca POR CLAVE (`items`, `total`, `receipt_id`). Reimprimir mandaba `data` vacío
   * y el papel salía con todos los valores por defecto —«ERPlora», sin líneas, TOTAL 0,00— sin dar
   * ningún error (sales#79). `undefined` si aún no hay venta: nada que imprimir es mejor que un
   * tique en blanco.
   */
  printableDocument(): PrintDocument | undefined {
    if (!this.sale) return undefined;
    const t = (k: string): string => erplora().t(CATALOG, k);
    return saleToPrintDocument(
      this.sale, this.lines || [], this.settings || {}, this.fiscal, erplora().locale,
      t('ui.docDefaultBusiness'), t,
    );
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    if (this.loading) return html`<p class="muted">${t('ui.loadingDocument')}</p>`;
    if (this.error) return html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.error}</ok-inline-feedback>`;
    if (!this.sale) return html`<p class="muted">${t('ui.noSale')}</p>`;

    const settings = this.settings || {};
    const lines = this.lines || [];
    const fmt = this.format || resolveFormat(this.sale, settings);

    const locale = erplora().locale;
    // Translated last-resort business name (ADR-0055): the mapper's bare fallback is English
    // canonical; the UI always hands over the hub-language default (#32).
    const fallbackName = t('ui.docDefaultBusiness');
    return fmt === 'invoice'
      ? html`<ok-invoice
          .invoice=${saleToInvoice(this.sale, lines, settings, this.fiscal, locale, fallbackName, t)}
          .labels=${invoiceLabels(t)}></ok-invoice>`
      : html`<ok-receipt
          .receipt=${saleToReceipt(this.sale, lines, settings, this.fiscal, locale, fallbackName, t)}
          .labels=${receiptLabels(t)}></ok-receipt>`;
  }
}

define('erp-sales-document', ErpSalesDocument);

declare global {
  interface HTMLElementTagNameMap {
    'erp-sales-document': ErpSalesDocument;
  }
}
