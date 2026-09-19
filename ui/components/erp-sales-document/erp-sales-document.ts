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
  claimPrintFields,
  type SaleRow,
  type SaleLineRow,
  type SaleSettings,
  type FiscalData,
} from '../../lib/document-mappers.js';
// sales#223 — the settings row is resolved through ONE set of defaults, never read raw.
import { withPosSettingsDefaults } from '../../lib/pos-settings.js';
// sales#103 — el acuñado del claim «pide tu factura» contra la puerta pública del hub.
import { mintInvoiceRequestClaim, type MintedClaim } from '../../lib/public-claim.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-sales-document — visor del documento de una venta (tiquet u factura) en el formato adecuado.
// Carga `sales.get` + `sales.lines` + `sales.pos_settings.get` por `sale-id`, mapea (document-mappers,
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
    /* sales#308 — the ticket being issued: centred where the paper will appear. */
    .issuing { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.75rem; min-height:240px; text-align:center; }
    .issuing p { margin:0; }
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

  /** sales#103 — el claim «pide tu factura» acuñado para la F2 de esta venta (si la hay). */
  @state() private claim?: MintedClaim;

  /** La F2 cuya claim está acuñada/en vuelo — clave del single-flight de `ensureClaim`. */
  private claimInvoiceId?: string;

  private claimFlight?: Promise<void>;

  /**
   * sales#308 — the document was JUST charged (the till says so). The viewer then waits behind a
   * loader until the ticket is complete —number AND VeriFactu QR— instead of painting it half-built.
   * A reprint from the sales list never sets it: an old ticket must never wait for a record that
   * may not exist.
   */
  @property({ attribute: false }) issuing = false;

  /**
   * Backoff del reintento fiscal (ms). Override en tests.
   *
   * sales#308 — it used to end at ~3 s, and the VeriFactu record becomes readable only once the
   * command that writes it has filed it with the AEAT: ~5 s on banco-pre with an own certificate.
   * The viewer gave up first and the QR never reached the ticket. The tail keeps watching for about
   * a minute, so a slow AEAT still completes the ticket on its own.
   */
  @property({ attribute: false }) fiscalRetryDelays: number[] = [400, 900, 1800, 3000, 5000, 10000, 20000];

  /** sales#308 — how long a just-charged document waits behind the loader before painting what
   *  there is. The watch goes on after it; the till is never left staring at a spinner. */
  @property({ attribute: false }) fiscalWaitMs = 10000;

  /** sales#308 — the just-charged document is still being issued: the loader is on screen. */
  @state() private awaitingFiscal = false;

  /** hub#1867 — how the just-charged wait ended (`issued()`), once it has. */
  private issuedResult?: boolean;

  /** hub#1867 — whoever asked `issued()` before the wait ended. */
  private issuedWaiters: Array<(complete: boolean) => void> = [];

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
    // hub#1867 — a viewer taken out of the document stops watching (`watchFiscal`), so nobody may be
    // left waiting on a wait that will never end.
    this.settleIssued(false);
    super.disconnectedCallback();
  }

  /**
   * hub#1867 — resolves when the document is ready to be PRINTED: the paper the hub shell prints on
   * its own at checkout mounts this viewer hidden, with `issuing`, and has no screen to watch.
   *
   * `true` = the document is final: the VeriFactu QR arrived, or nothing more will come (no invoicing
   * or VeriFactu app, or a reprint, which never waits). `false` = it was not: the `fiscalWaitMs`
   * ceiling ran out with the invoice or its record still missing (a slow AEAT), the sale failed to
   * load, or the viewer was removed. Either way `printableDocument()` then answers the best paper
   * there is; `false` tells the caller that paper lacks something a reprint will carry.
   */
  issued(): Promise<boolean> {
    if (this.issuedResult !== undefined) return Promise.resolve(this.issuedResult);
    // A sale injected directly (preview/test) is never loaded nor watched: nothing to wait for.
    if (this.sale && this.loadedFor === undefined) return Promise.resolve(true);
    return new Promise((resolve) => this.issuedWaiters.push(resolve));
  }

  private settleIssued(complete: boolean): void {
    if (this.issuedResult !== undefined) return;
    this.issuedResult = complete;
    const waiters = this.issuedWaiters;
    this.issuedWaiters = [];
    for (const resolve of waiters) resolve(complete);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('saleId') && this.saleId && !this.sale) this.load();
  }

  private async load() {
    if (!this.saleId || this.loadedFor === this.saleId) return;
    // hub#1867 — a new sale is a new wait; whoever is already waiting gets THIS sale's answer.
    if (this.loadedFor !== undefined) this.issuedResult = undefined;
    this.loadedFor = this.saleId;
    this.loading = true; this.error = '';
    try {
      const [sale, lines, settingsRows, businessRows] = await Promise.all([
        erplora().query<SaleRow>('sales.get', { sale_id: this.saleId }),
        erplora().query<SaleLineRow[]>('sales.lines', { sale_id: this.saleId }),
        // sales#203 — the RECEIPT's own settings (header, footer, promotional QR, whether prices
        // carry VAT inside) through `sales.pos_settings.get`, not the admin-only
        // `sales.settings.get`. Whoever prints a ticket is the cashier, and that query needs
        // `sales.manage_settings`: through it the paper came out blank of everything the shop had
        // configured for exactly the person who hands it over.
        erplora().query<SaleSettings[]>('sales.pos_settings.get').catch(() => []),
        // sales#274 — WHOSE ticket this is, live from `hub_settings` (single source ADR-0061)
        // through the cashier-sized door sales#180 opened for the bill. The invoice carries the
        // same datum frozen, but it is written by the Outbox a few ms AFTER the charge — and the
        // instant in between is precisely when this viewer opens and the cashier turns the screen
        // towards the customer. Without asking, that first paint headed the ticket with the
        // generic default name and no NIF: a business that does not exist, read by the customer.
        // Best-effort: a hub with no identity saved yet still gets its ticket.
        erplora().query<{ name?: string; tax_id?: string }[]>('sales.business.get').catch(() => []),
      ]);
      this.sale = Array.isArray(sale) ? (sale as SaleRow[])[0] : sale;
      this.lines = lines || [];
      // sales#223 — resolved through the ONE set of UI defaults. A hub where nobody ever saved
      // the settings answers no row at all, and every reader below used to decide on its own
      // what that absence meant.
      const business = (Array.isArray(businessRows) ? businessRows[0] : businessRows) || {};
      this.settings = {
        ...(withPosSettingsDefaults(
          (Array.isArray(settingsRows) ? settingsRows[0] : settingsRows) as Record<string, unknown>,
        ) as SaleSettings),
        // sales#274 — the LAST-RESORT identity, exactly as the bill composes it (sales#180): a
        // deliberate `receipt_header` still wins the name, and the invoice's own snapshot wins
        // over both the moment it lands.
        ...(business.name ? { issuer_name: business.name } : {}),
        ...(business.tax_id ? { issuer_tax_id: business.tax_id } : {}),
      };
      // Datos fiscales (QR VeriFactu) — el Outbox es asíncrono (la factura/registro se crean unos
      // segundos después de cobrar), así que se observa con reintentos y el QR aparece cuando llega.
      // sales#308: recién cobrado, la pantalla espera tras un indicador de carga en vez de pintar
      // un tique a medias; una reimpresión se pinta al momento, como siempre.
      this.awaitingFiscal = this.issuing;
      // hub#1867 — a reprint has no wait: its document is as final as it gets right now.
      if (!this.issuing) this.settleIssued(true);
      void this.watchFiscal(this.saleId);
    } catch (e) {
      this.error = e instanceof Error ? e.message : erplora().t(CATALOG, 'ui.errorDocument');
      this.settleIssued(false);
    } finally {
      this.loading = false;
    }
  }

  /** Resuelve lo fiscal con backoff: reintenta SOLO si el módulo está instalado pero el registro
   *  aún no existe (el race del Outbox). Módulo ausente (`queryOptional` → undefined) = una consulta
   *  y en paz. Si el usuario cambió de venta, aborta. */
  private async watchFiscal(saleId: string): Promise<void> {
    // sales#308 — the loader has a ceiling. Past it the screen paints what there is and the watch
    // below goes on, so a slow AEAT completes the ticket on its own instead of freezing the till.
    // `fellBack` = the screen already painted the sale's own number because the wait ended. Only then
    // may a later lookup not blank it again; a reprint keeps the sales#274 blank until retries end.
    let fellBack = false;
    const endWait = () => {
      if (this.saleId !== saleId) return;
      fellBack = true;
      this.awaitingFiscal = false;
      // hub#1867 — the ceiling ran out (or the retries did) with the fiscal data still missing.
      this.settleIssued(false);
      // sales#274 — the wait is over and the invoice has not landed: the ticket falls back to its
      // own number rather than being painted with no identifier at all.
      if (this.fiscal.pending) this.fiscal = { ...this.fiscal, pending: false };
    };
    const ceiling = this.awaitingFiscal ? setTimeout(endWait, this.fiscalWaitMs) : undefined;
    try {
      for (const delay of [0, ...this.fiscalRetryDelays]) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (this.saleId !== saleId || !this.isConnected) return;
        const { fiscal, retry, claimInvoiceId } = await this.resolveFiscal(saleId);
        if (this.saleId !== saleId) return;
        // Once the wait ended the screen already painted the sale's own number: a later lookup that
        // still finds no invoice must not blank it again.
        this.fiscal = fellBack && fiscal.pending ? { ...fiscal, pending: false } : fiscal;
        // sales#103: en cuanto la F2 existe, se acuña el claim (best-effort, single-flight). La
        // ventana del Outbox que retrasa el QR fiscal retrasa igual el acuñado — mismo race.
        if (claimInvoiceId) {
          this.claimInvoiceId = claimInvoiceId;
          void this.ensureClaim(claimInvoiceId);
        }
        if (fiscal.qr || !retry) {
          // Complete (or nothing more will come): the final document, in one go.
          this.awaitingFiscal = false;
          this.settleIssued(true);
          return;
        }
      }
      // sales#274 — se acabaron los reintentos y la factura no ha llegado (Outbox atascado). El
      // hueco era una espera, no un estado permanente: el tique cae a su propio número antes que
      // quedarse sin identificador ninguno.
      if (this.saleId === saleId) endWait();
    } finally {
      if (ceiling !== undefined) clearTimeout(ceiling);
    }
  }

  /** Resuelve venta → factura (`invoice.by_source`) → registro VeriFactu (`verifactu.records.by_invoice`)
   *  para obtener el QR de validación AEAT + nº fiscal oficial + CSV. Tolerante a fallos.
   *  `retry` = merece reintento (módulo presente, registro todavía no).
   *  `claimInvoiceId` = hay una F2 con algo que canjear (sales#103). */
  private async resolveFiscal(saleId: string): Promise<{ fiscal: FiscalData; retry: boolean; claimInvoiceId?: string }> {
    try {
      // `queryOptional` (ADR-0127): ni `invoice` ni `verifactu` son dependencias de sales — un hub
      // puede cobrar sin módulo de facturación. Ausentes → sin QR fiscal y en paz; contrato ROTO →
      // explota (lo atrapa el catch tolerante de este método).
      const invRows = await erplora().queryOptional<Record<string, unknown> | Record<string, unknown>[]>(
        'invoice.by_source', { source_id: saleId });
      if (invRows === undefined) return { fiscal: {}, retry: false }; // módulo invoice ausente
      const invoice = (Array.isArray(invRows) ? invRows[0] : invRows) as Record<string, unknown> | undefined;
      // sales#274 — la app de facturación ESTÁ y su factura todavía no: eso no es «sin número», es
      // «el número aún no se sabe». La pantalla deja el hueco en vez de enseñar el de la venta.
      if (!invoice?.id) return { fiscal: { pending: true }, retry: true };
      // sales#103: SOLO una F2 (simplificada) tiene algo que canjear — una F1 nació completa (con
      // NIF) y una F3 ya ES el canje (y `by_source` devuelve la más reciente, así que la F3 la
      // descarta sola). Cero acuñamientos en ambos casos.
      const claimInvoiceId = invoice.invoice_type === 'F2' ? String(invoice.id) : undefined;
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
      if (recRows === undefined) return { fiscal: base, retry: false, claimInvoiceId }; // sin módulo verifactu
      const rec = (Array.isArray(recRows) ? recRows[0] : recRows) as Record<string, unknown> | undefined;
      if (!rec) return { fiscal: base, retry: true, claimInvoiceId }; // registro fiscal aún no creado (Outbox)
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
        claimInvoiceId,
      };
    } catch {
      return { fiscal: {}, retry: false }; // sin permiso / contrato roto → documento sin QR
    }
  }

  /**
   * sales#103 — acuña (o recupera) el claim «pide tu factura» de la F2, single-flight.
   *
   * La puerta es IDEMPOTENTE por `(kind, subject_id)` y el locator determinista, así que llamar
   * en cada impresión es el uso previsto; el single-flight local añade que ni dos ciclos del
   * watch ni una reimpresión inmediata disparen DOS acuñamientos observables. Un acuñamiento que
   * FALLA no se cachea: el siguiente intento (p. ej. otra impresión) vuelve a probar, y el hub lo
   * trata como la misma promesa de papel.
   *
   * Los `items` del payload sellado salen de `invoice.lines` (módulo invoice, OPCIONAL — ADR-0127):
   * el esquema de `invoice.substitute` los EXIGE y no se derivan server-side. Sin módulo no hay
   * claim y el tique sale exactamente como hoy.
   */
  private async ensureClaim(invoiceId: string): Promise<void> {
    if (this.claim && this.claimInvoiceId === invoiceId) return; // acuñado: reprint = mismo locator
    if (this.claimFlight && this.claimInvoiceId === invoiceId) return; // ya en vuelo
    this.claimInvoiceId = invoiceId;
    const flight = (async () => {
      const items = await erplora().queryOptional<Record<string, unknown>[]>(
        'invoice.lines', { invoice_id: invoiceId });
      if (items === undefined || items.length === 0) return; // sin módulo invoice / sin líneas
      const claim = await mintInvoiceRequestClaim(invoiceId, items);
      if (claim) this.claim = claim; // fallo → sin claim: el papel sale como hoy
    })().catch(() => undefined)
      .finally(() => { if (this.claimFlight === flight) this.claimFlight = undefined; });
    this.claimFlight = flight;
    await flight;
  }

  /** El fiscal del papel MÁS el claim acuñado (si lo hay): viajan juntos en `FiscalData`.
   *
   *  sales#274 — y SIN `pending`: la espera es de la pantalla, que se actualiza sola cuando el
   *  número llega. Una copia impresa no se actualiza nunca, así que sale con el mejor
   *  identificador que haya (el de la venta) antes que sin ninguno. */
  private fiscalForPaper(): FiscalData {
    if (!this.claim) return { ...this.fiscal, pending: false };
    return {
      ...this.fiscal,
      pending: false,
      claim_locator: this.claim.locator,
      // La puerta devuelve `/p/<locator>` relativo; el QR impreso necesita la URL ABSOLUTA del
      // hub (el origen de esta app ES el origen del hub).
      claim_qr: this.absoluteUrl(this.claim.url),
    };
  }

  /** `/p/<locator>` → URL absoluta contra el origen actual; si algo raro pasa, tal cual. */
  private absoluteUrl(url: string): string {
    const base = (globalThis as { location?: Location }).location?.href;
    if (!base) return url;
    try {
      return new URL(url, base).href;
    } catch {
      return url;
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
    // sales#103: si aún no hay claim (Outbox lento, primera carga), se reintenta best-effort —
    // la puerta es idempotente; esta copia saldrá sin él, la siguiente lo lleva.
    if (this.claimInvoiceId && !this.claim && !this.claimFlight) void this.ensureClaim(this.claimInvoiceId);
    const doc = saleToReceipt(
      // sales#274: el papel, con su `pending` ya resuelto (ver `fiscalForPaper`) — nunca sin número.
      this.sale, this.lines || [], this.settings || {}, this.fiscalForPaper(), erplora().locale,
      t('ui.docDefaultBusiness'), t,
    );
    // sales#120: el papel habla el idioma del hub — las palabras son labels del catálogo, no
    // constantes de la plantilla («Cambio» junto a un tique en inglés era el papel mezclado).
    return receiptToPrintableHtml({
      ...(doc as unknown as Parameters<typeof receiptToPrintableHtml>[0]),
      // sales#103: el mismo bloque «pide tu factura» que el papel térmico (claimPrintFields es
      // la única fuente, para que HTML y ESC/POS no puedan discrepar).
      ...claimPrintFields(this.fiscalForPaper(), t),
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
    // sales#103: reintento best-effort del acuñado si aún no llegó (idempotente en el hub).
    if (this.claimInvoiceId && !this.claim && !this.claimFlight) void this.ensureClaim(this.claimInvoiceId);
    return saleToPrintDocument(
      this.sale, this.lines || [], this.settings || {}, this.fiscalForPaper(), erplora().locale,
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

    // sales#308 — just charged and still being issued: a loader, never a half-built document.
    if (this.awaitingFiscal) {
      return html`<div class="issuing" data-testid="doc-issuing" role="status" aria-live="polite">
        <ion-spinner name="crescent"></ion-spinner>
        <p class="muted">${t(fmt === 'invoice' ? 'ui.issuingInvoice' : 'ui.issuingReceipt')}</p>
      </div>`;
    }

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
