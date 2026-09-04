import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import '@erplora/outfitkit/ok-data-table';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import { renderDocumentModal } from '../../lib/document-modal.js';
import '../erp-sale-refund/erp-sale-refund.js';
import { payMethodDisplayName } from '../../lib/pay-icons.js';
import type { PayMethodLike } from '../../lib/pay-icons.js';
import { formatDateTime } from '../../lib/document-mappers.js';
import { errorCode } from '../../lib/checkout-key.js';
import { domainErrorText } from '../../lib/domain-error-text.js';
import { transportErrorKey } from '../../lib/transport-error.js';
import { createListController } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };
/** Estado de la venta (columna `status`) → su clave i18n. Lo que no esté aquí se enseña crudo. */
const STATUS_KEYS: Record<string, string> = {
  completed: 'ui.statusCompleted',
  voided: 'ui.statusVoided',
  // sales#160: una venta devuelta ENTERA pasa a `refunded`. Sin su clave, la celda pintaba la
  // palabra cruda de la base de datos sobre una UI en español (el mismo defecto que hub#923).
  refunded: 'ui.statusRefunded',
};

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  command<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  /** SOLO para mostrar/ocultar UI: la seguridad la revalida el runtime en cada command. */
  hasPermission?(perm: string): boolean;
  notify?(n: { type: 'success' | 'error' | 'info'; message: string }): void;
  /** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** Overlay global de Ionic (mismo patrón que el TPV): declarado en body para heredar el tema. */
interface IonicAlertElement extends HTMLElement {
  header: string;
  message: string;
  inputs: Array<{ name: string; type: string; placeholder?: string; attributes?: Record<string, unknown> }>;
  buttons: Array<{ text: string; role?: string; handler?: (data: Record<string, string>) => boolean | void }>;
  isOpen: boolean;
  present?: () => Promise<void>;
}

/** sales#26 — códigos de `sales.void` → clave i18n. La UI se orienta por el CÓDIGO, no por la frase. */
const VOID_MESSAGES: Record<string, string> = {
  'sales.void_requires_credit_note': 'ui.voidRequiresCreditNote',
  'sales.already_voided': 'ui.voidAlreadyVoided',
  'sales.void_reason_required': 'ui.voidReasonRequired',
  'sales.sale_not_found': 'ui.voidSaleNotFound',
  // sales#247 — la venta ya tiene devoluciones. La frase NO se queda en «no se pudo»: nombra la
  // salida (devolver lo que queda), que es la acción de al lado y sigue estando ahí.
  'sales.sale_already_refunded': 'ui.voidAlreadyRefunded',
};
/**
 * sales#201 — the key for a refused void, read from the CODE the envelope carries.
 *
 * It used to take the MESSAGE and look each code up inside it with `includes`, which worked only
 * while the handler formatted its refusal as `"<code>: <detail>"` and the runtime carried that
 * whole string. Now the refusal travels through `Output.error`, so the runtime answers
 * `{code, message}` and the message is the detail ALONE — a substring search would stop matching
 * in silence and every void refusal would collapse into the generic one. The lookup is EXACT:
 * a code is a field, never a prefix of a sentence.
 */
export function voidErrorKey(code: string): string {
  return VOID_MESSAGES[code] ?? 'ui.voidFailed';
}

interface Sale {
  id: string;
  sale_number: string;
  status: string;
  total: number;
  customer_name: string;
  payment_method_name: string;
  created_at: string;
}

interface Stats { count: number; total_revenue: number; avg_ticket: number; tax_total?: number; net_total?: number; discount_total?: number; voided_count?: number; }

/** sales#27 — el rango que gobierna filas y KPIs a la vez. `today` por defecto (Odoo, Square). */
type Range = 'today' | '7d' | '30d' | 'all';
const RANGE_KEYS: Record<Range, string> = { today: 'ui.rangeToday', '7d': 'ui.range7d', '30d': 'ui.range30d', all: 'ui.rangeAll' };
/** Día ISO local `YYYY-MM-DD` de hace `daysAgo` días. */
function isoDay(daysAgo = 0): string {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Límites del rango (ambos inclusivos); `all` = sin límites. */
export function rangeBounds(range: Range): { from?: string; to?: string } {
  if (range === 'all') return {};
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
  return { from: isoDay(days), to: isoDay(0) };
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpSalesList extends LitElement {
  static styles = css`
    /* sales#126 — la vista LLENA el alto del outlet y gestiona SU scroll (el mismo contrato que
       payments/list y erp-pos). El body del hub tiene «overflow: hidden»: si el contenido crece
       por debajo del viewport y la propia vista no scrolla, no hay forma de llegar a él — ni rueda,
       ni teclado, ni arrastre. «min-height: 0» es lo que deja al hijo encogerse en el flex. */
    :host { display:flex; flex-direction:column; height:100%; min-height:0; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    /* sales#126 — TODO el contenido vive en el contenedor con scroll propio: título, rangos, KPIs,
       tabla y pie «N registros» se alcanzan scrollando AQUÍ, salga lo que salga en cada viewport. */
    .scroll { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
    h2 { margin:0 0 .75rem; font-size:1.15rem; }
    .cards { display:flex; gap:.6rem; margin-bottom:1rem; flex-wrap:wrap; }
    /* sales#126 — por debajo de 768 px los 6 KPI NO se apilan en 2 columnas × 3 filas (~230 px que
       se comían el viewport): UNA fila desplazable horizontalmente (Square/Toast). El desbordamiento
       horizontal lo absorbe la propia tira, nunca la página. */
    .cards.kpi-row { flex-wrap:nowrap; overflow-x:auto; min-width:0; scrollbar-width:thin; }
    .cards.kpi-row .card { flex:0 0 auto; }
    .range-segment { margin:.25rem 0 .75rem; max-width:32rem; }
    .card { flex:1; min-width:8rem; padding:.7rem .9rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius: var(--ok-radius, 12px); }
    .card .k { color:#8b897f; font-size:.75rem; text-transform:uppercase; }
    .card .v { font-size:1.3rem; font-weight:700; }
    .err { color:#d9480f; }
  `;

  @state() stats: Stats = { count: 0, total_revenue: 0, avg_ticket: 0 };
  /** sales#27: rango activo; hoy por defecto. */
  @state() range: Range = 'today';

  @state() statsError = '';

  @state() tick = 0;

  /** sales#126 — por debajo de 768 px los KPI colapsan en UNA fila desplazable (Square/Toast).
   *  La clase `kpi-row` es la que apaga el `flex-wrap`; así el contrato es medible en DOM y sigue
   *  al viewport en vivo (mismo mecanismo de matchMedia que usa ok-data-table para su modo tarjetas). */
  static readonly KPI_ROW_QUERY = '(max-width: 767.98px)';

  @state() private kpiRow = false;

  private kpiMq?: MediaQueryList;

  private readonly onKpiMqChange = (e: MediaQueryListEvent): void => {
    if (this.kpiRow !== e.matches) this.kpiRow = e.matches;
  };

  /** sales#181 — the hub's payment methods, so the column FILTER can offer the very labels the cell
   *  paints. Empty = they could not be loaded: the filter falls back to a text box (see `columns`). */
  @state() private payMethods: PayMethodLike[] = [];

  /** Venta seleccionada para ver su documento (tiquet/factura) en el modal. */
  @state() docSaleId?: string;

  /** sales#160 — venta que se está devolviendo. El modal está abierto mientras haya id. */
  @state() refundSaleId?: string;

  // Getter (no campo): se re-evalúa en cada render, así los textos cambian con el idioma activo
  // (ADR-0055). El listener `erplora:locale-changed` re-renderiza.
  private get documentActions(): DataTableAction[] {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const actions: DataTableAction[] = [
      { id: 'document', label: t('ui.actionDocument'), icon: 'receipt-outline' },
    ];
    // sales#26: anular se ofrece SOLO a quien tiene el permiso (el runtime lo revalida igual), y
    // solo sobre una venta cerrada: una anulada o reembolsada no se anula dos veces.
    //
    // sales#247: y tampoco sobre una venta de la que YA ha salido dinero. Una devolución parcial
    // deja la venta `completed` (`_mark_refunded` solo marca con el último céntimo), así que sin
    // mirar `refunded_total` la fila seguía ofreciendo «Anular» sobre un cobro medio devuelto —
    // que es lo que ningún TPV del mercado ofrece. Se BLOQUEA, como Dynamics 365 BC bloquea su
    // Cancel; la puerta que queda es «Devolver», la acción de al lado, que no se toca.
    //
    // Sin la columna (una fila servida por un hub anterior a este cambio) se comporta como antes:
    // el botón es la conveniencia y el handler es la garantía — `sales.void` rechaza igual.
    if (erplora().hasPermission?.('sales.void_sale')) {
      actions.push({
        id: 'void', label: t('ui.actionVoid'), icon: 'ban-outline', color: 'danger',
        disabled: (r) => r.status !== 'completed' || Number(r.refunded_total ?? 0) > 0,
      });
    }
    // sales#160 — devolver es permiso PROPIO (manager + admin, nunca cashier: saca dinero de la
    // caja), y solo sobre una venta cerrada. A diferencia de anular, una venta CON FACTURA sí se
    // devuelve: la devolución es el hecho económico y la rectificativa su documento.
    // sales#255 — y DICE cuánto queda, en el punto de elección. `refunded_total` viaja en
    // `sales.list` desde sales#247, así que la fila ya trae el dato: hasta ahora el importe solo
    // aparecía dentro del modal, un clic más tarde, que es donde ya no ayuda a elegir. El mercado
    // lo pone aquí (Square y Lightspeed etiquetan la acción con lo que queda por devolver; Business
    // Central hace lo propio en sus acciones por línea).
    //
    // Dos frases, no una: «el resto» solo es cierto cuando YA ha vuelto algo, y el caso corriente
    // de una lista es la venta intacta. Decir «el resto» sobre ella sería mentirle al cajero en la
    // fila que más se lee.
    //
    // Sin `refunded_total` (una fila servida por un hub anterior a sales#247) el resto ES el total:
    // se degrada a la frase de siempre con su importe, nunca a un `NaN €` en el botón.
    if (erplora().hasPermission?.('sales.refund_sale')) {
      actions.push({
        id: 'refund',
        // Función, no texto: la etiqueta lleva un dato de la FILA (outfitkit#110). La acción es
        // icon-only por ADR-0133, así que esto es además su nombre accesible (`aria-label`).
        label: (r) => {
          const refunded = Number(r.refunded_total ?? 0);
          const amount = erplora().formatMoney(Number(r.total ?? 0) - refunded);
          return t(refunded > 0 ? 'ui.actionRefundRemaining' : 'ui.actionRefundAmount', { amount });
        },
        icon: 'return-down-back-outline', color: 'warning',
        disabled: (r) => r.status !== 'completed',
      });
    }
    return actions;
  }

  /** sales#26 — pide el MOTIVO (obligatorio: Toast, Lightspeed y el software fiscal español lo
   *  exigen; es lo que luego se lee en el historial) y anula. Overlay global de Ionic, como el TPV. */
  private async confirmVoid(sale: Sale): Promise<void> {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const alert = document.createElement('ion-alert') as IonicAlertElement;
    alert.header = t('ui.voidTitle', { number: sale.sale_number });
    alert.message = t('ui.voidExplain');
    alert.inputs = [{ name: 'reason', type: 'textarea', placeholder: t('ui.voidReasonPlaceholder'), attributes: { maxlength: 500 } }];
    alert.buttons = [
      { text: t('ui.cancel'), role: 'cancel' },
      { text: t('ui.actionVoid'), role: 'destructive', handler: (data) => {
        const reason = (data?.reason ?? '').trim();
        if (!reason) { erplora().notify?.({ type: 'error', message: t('ui.voidReasonRequired') }); return false; }
        void this.voidSale(sale.id, reason);
        return true;
      } },
    ];
    alert.addEventListener('ionAlertDidDismiss', () => alert.remove(), { once: true });
    document.body.appendChild(alert);
    try {
      if (typeof alert.present === 'function') await alert.present();
      else alert.isOpen = true;
    } catch {
      alert.remove();
    }
  }

  /** Ejecuta `sales.void`; el servidor decide (motivo, estado, factura) y aquí solo se cuenta. */
  private async voidSale(saleId: string, reason: string): Promise<void> {
    const t = (k: string): string => erplora().t(CATALOG, k);
    try {
      await erplora().command('sales.void', { sale_id: saleId, reason });
      erplora().notify?.({ type: 'success', message: t('ui.voidDone') });
      await Promise.all([this.ctrl.load(), this.loadStats()]);
    } catch (e) {
      erplora().notify?.({ type: 'error', message: t(voidErrorKey(errorCode(e))) });
    }
  }

  private ctrl!: ListController<Sale>;

  private unsub?: () => void;

  private readonly onLocaleChange = (): void => this.requestUpdate();

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
    // sales#27: la hora de cada venta a la vista (antes se ordenaba por ella y no se pintaba).
    { key: 'created_at', header: t('ui.colDate'), sortable: true, filterable: true, filterType: 'daterange',
      format: (r) => formatDateTime(String(r.created_at ?? ''), erplora().locale) },
    { key: 'sale_number', header: t('ui.colNumber'), sortable: true, filterable: true, filterType: 'text' },
    { key: 'customer_name', header: t('ui.colCustomer'), sortable: true, filterable: true, filterType: 'text', format: (r) => (r.customer_name as string) || '—' },
    // sales#108: the row stores the canonical seed name («Cash»); the cell speaks the user's language.
    // sales#181: and so does the FILTER. Free text went to the server verbatim, against that same
    // canonical name, so filtering by the «Efectivo» you can read returned zero sales without a
    // word. Payment method is an enumerated dimension (Square, Toast, Odoo, Shopify all offer a
    // picker): the options carry the visible name and send the stored one. Same shape as `status`.
    { key: 'payment_method_name', header: t('ui.colPayment'), sortable: true, filterable: true,
      ...(this.payMethods.length
        ? {
            filterType: 'select' as const,
            options: this.payMethods.map((m) => ({ value: m.name, label: payMethodDisplayName(m, t) })),
          }
        // With no methods loaded an empty dropdown would be a DEAD filter: the text box is better,
        // since it at least still matches against the stored name.
        : { filterType: 'text' as const }),
      format: (r) => (r.payment_method_name ? payMethodDisplayName({ id: '', name: r.payment_method_name as string }, t) : '—') },
    {
      key: 'status',
      header: t('ui.colStatus'),
      sortable: true,
      filterable: true,
      filterType: 'select',
      options: [
        { value: 'completed', label: t('ui.statusCompleted') },
        { value: 'voided', label: t('ui.statusVoided') },
        { value: 'refunded', label: t('ui.statusRefunded') },
      ],
      // hub#923: el filtro traducía, pero la CELDA pintaba el valor crudo de la BD — «completed»,
      // en inglés, sobre una UI en español. Es la lista a la que se manda al cajero cuando un cobro
      // queda en duda, así que la palabra que dice «esto se cobró» no puede ser jerga. Un estado
      // desconocido (un módulo más nuevo escribiendo `refunded`) cae a su valor crudo: peor sería
      // una celda vacía, que esconde el estado de la fila.
      format: (r) => STATUS_KEYS[String(r.status ?? '')] ? t(STATUS_KEYS[String(r.status)]) : String(r.status ?? ''),
    },
    { key: 'total', header: t('ui.colTotal'), align: 'right', sortable: true, filterable: true, filterType: 'range', format: (r) => erplora().formatMoney(Number(r.total || 0)) },
    ];
  }

  // TODO-LIT: componentWillLoad → connectedCallback. Recuerda: connectedCallback se dispara
  // en CADA reconexión al DOM (no solo en el primer montaje). Si la init debe correr una
  // sola vez tras el primer render, considera firstUpdated() en su lugar.
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    // sales#126 — estado inicial del viewport + seguimiento en vivo (rotar/mover la ventana).
    if (typeof window.matchMedia === 'function') {
      this.kpiMq = window.matchMedia(ErpSalesList.KPI_ROW_QUERY);
      this.kpiRow = this.kpiMq.matches;
      this.kpiMq.addEventListener('change', this.onKpiMqChange);
    }
    const b = rangeBounds(this.range);
    this.ctrl = createListController<Sale>(erplora(), 'sales.list', () => this.requestUpdate(), {
      pageSize: 50,
      sort: 'created_at',
      dir: 'desc',
      // sales#27: se abre en HOY — las filas y los KPIs responden al mismo rango.
      // sales#125: el rango viaja como DÍAS (`erp_date`, la parte fecha que proyecta la query), no
      // sobre el timestamp crudo: el motor compara la columna tal cual y «hasta hoy» cortaba a las
      // 00:00 — «Hoy»/«7 días»/«30 días» salían vacías mientras los KPIs (que comparan por día)
      // sí contaban el día en curso.
      filters: b.from ? { erp_date: { from: b.from, to: b.to } } : {},
    });
    await Promise.all([this.ctrl.load(), this.loadStats(), this.loadPayMethods()]);
    try { this.unsub = erplora().on('sale.completed', () => { this.ctrl.load(); this.loadStats(); }); }
    catch { /* preview sin SDK */ }
  }

  disconnectedCallback() {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    this.kpiMq?.removeEventListener('change', this.onKpiMqChange); // sales#126
    super.disconnectedCallback(); this.unsub?.(); }

  /** sales#181 — the active payment methods, only to populate the column filter. If the query fails
   *  (no permission, a half-installed module) the list stays empty and the filter remains a text
   *  box: the history still opens, which is what the cashier came here for. */
  private async loadPayMethods(): Promise<void> {
    try {
      const rows = await erplora().query<PayMethodLike[]>('sales.payment_methods');
      this.payMethods = Array.isArray(rows) ? rows : [];
    } catch {
      this.payMethods = [];
    }
  }

  /** El selector de fechas de la propia tabla (columna «Fecha») también filtra por DÍA: la
   *  columna pinta `created_at`, pero el rango que pide el usuario es de días y el filtro del
   *  servidor es `erp_date` (sales#125). Mandarlo al timestamp repetiría el corte a las 00:00. */
  private onFilterChange(e: CustomEvent<{ col: string; value: unknown }>): void {
    const col = e.detail.col === 'created_at' ? 'erp_date' : e.detail.col;
    this.ctrl.setFilter(col, e.detail.value);
  }

  /** sales#243 — la columna «Nº» PINTA `sale_number` y ORDENA por `sale_seq`.
   *
   *  Mismo desdoblamiento que la columna «Fecha» de aquí arriba, y por el mismo motivo: lo que la
   *  celda enseña y lo que el servidor sabe ordenar son dos columnas distintas, y la traducción
   *  vive en esta frontera, que es la única que conoce las dos.
   *
   *  `sale_number` es TEXTO `YYYYMMDD-<secuencia>` y el relleno es un MÍNIMO, no un techo
   *  (hub#1393, tras la caída de sales#241): pasada la venta 9.999 del día la secuencia crece un
   *  dígito y el orden de texto deja de ser el numérico — la 10.000 caía entre la 1.000 y la 2.000.
   *  `sales.list` proyecta `sale_seq` justo para esto: una clave sintética que solo existe para
   *  ordenar. El número fiscal no se reescribe en ninguna parte — ni en la celda, ni en la query,
   *  ni en la fila.
   *
   *  El mapa es de UNA columna a propósito: reescribir a ciegas es como la columna de fecha
   *  acabaría pidiendo en silencio una clave que no existe. */
  private static readonly SORT_KEYS: Record<string, string> = { sale_number: 'sale_seq' };

  private onSortChange(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>): void {
    this.ctrl.setSort(ErpSalesList.SORT_KEYS[e.detail.sort] ?? e.detail.sort, e.detail.dir);
  }

  /** La columna que la tabla marca como activa: la que el usuario pulsó, no la clave con la que se
   *  pregunta. Sin la vuelta atrás, `ok-data-table` recibiría `sale_seq` —una columna que no
   *  tiene—, borraría la flecha de «Nº» y la pantalla parecería sin ordenar estándo ordenada. */
  private get paintedSort(): string | undefined {
    const asked = this.ctrl?.state.sort;
    if (asked === undefined) return undefined;
    return Object.keys(ErpSalesList.SORT_KEYS).find((k) => ErpSalesList.SORT_KEYS[k] === asked) ?? asked;
  }

  /** sales#27: cambia el rango de filas Y KPIs a la vez. */
  async setRange(range: Range): Promise<void> {
    this.range = range;
    const b = rangeBounds(range);
    // sales#125: el filtro es la columna DÍA (`erp_date`), no el timestamp.
    this.ctrl.setFilter('erp_date', b.from ? { from: b.from, to: b.to } : null);
    await this.loadStats();
  }

  private async loadStats() {
    try {
      const b = rangeBounds(this.range);
      const rows = await erplora().query<Stats[]>('sales.stats', { date_from: b.from ?? null, date_to: b.to ?? null });
      this.stats = (rows && rows[0]) || { count: 0, total_revenue: 0, avg_ticket: 0 };
    } catch (e) {
      // sales#207 (ADR-0398/0055): same door as the refund screen — the declared sentence of the
      // code, the screen's own line otherwise, and the server's message never.
      const t = (k: string): string => erplora().t(CATALOG, k);
      const transport = transportErrorKey(e);
      this.statsError = transport
        ? t(transport)
        : domainErrorText(CATALOG, erplora().locale, e) || t('ui.errorStats');
    }
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    // sales#126 — todo dentro de `.scroll`: lo que no quepa en el outlet se alcanza scrollando
    // la propia vista (antes desbordaba en `overflow: visible` y el body `hidden` lo recortaba).
    return html`<div class="scroll">
        <h2>${t('ui.sales')}</h2>
        <ion-segment class="range-segment" value=${this.range} aria-label=${t('ui.rangeLabel')}
          @ionChange=${(e: CustomEvent<{ value?: string }>) => { void this.setRange((e.detail.value as Range) || 'today'); }}>
          ${(Object.keys(RANGE_KEYS) as Range[]).map((r) => html`<ion-segment-button value=${r}><ion-label>${t(RANGE_KEYS[r])}</ion-label></ion-segment-button>`)}
        </ion-segment>
        <div class=${this.kpiRow ? 'cards kpi-row' : 'cards'}>
          <div class="card">
            <div class="k">${t('ui.tickets')}</div>
            <div class="v">${this.stats.count}</div>
          </div>
          <div class="card">
            <div class="k">${t('ui.revenue')}</div>
            <div class="v">${erplora().formatMoney(Number(this.stats.total_revenue || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t('ui.avgTicket')}</div>
            <div class="v">${erplora().formatMoney(Number(this.stats.avg_ticket || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t('ui.kpiTax')}</div>
            <div class="v">${erplora().formatMoney(Number(this.stats.tax_total || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t('ui.kpiDiscounts')}</div>
            <div class="v">${erplora().formatMoney(Number(this.stats.discount_total || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t('ui.kpiVoided')}</div>
            <div class="v">${Number(this.stats.voided_count || 0)}</div>
          </div>
        </div>
        ${this.statsError ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.statsError}</ok-inline-feedback>` : nothing}
        ${this.ctrl?.error ? html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : nothing}
        <!-- The «document» button is not the only door: rowClickable makes the whole row open the
             same document (outfitkit#67 — the actions column can be off-screen at 1440 px). -->
        <ok-data-table .serverSide=${true} .columns=${this.columns} .views=${true} .cardTitle=${(r: Record<string, unknown>) => String(r.sale_number ?? '—')} .cardIcon=${() => 'receipt-outline'} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.paintedSort} .sortDir=${this.ctrl?.state.dir ?? 'desc'} .searchable=${true} .searchPlaceholder=${t('ui.searchSalePlaceholder')} .emptyMessage=${this.ctrl?.loading ? t('ui.loading') : t('ui.noSales')} .actions=${this.documentActions} .rowClickable=${true} @rowAction=${(e: CustomEvent<{ actionId: string; row: Sale }>) => { if (e.detail.actionId === 'document') this.docSaleId = e.detail.row.id; else if (e.detail.actionId === 'void') void this.confirmVoid(e.detail.row); else if (e.detail.actionId === 'refund') this.refundSaleId = e.detail.row.id; }} @rowClick=${(e: CustomEvent<{ row: Sale }>) => { this.docSaleId = e.detail.row.id; }} @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.onSortChange(e)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.onFilterChange(e)}></ok-data-table>
      </div>
      <!-- sales#126 — el modal FUERA del contenedor con scroll: Ionic lo reparenta al light-DOM
           igual, pero así la vista no arrastra overlays al scrollear. -->
      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => { this.docSaleId = undefined; }, t })}
      <!-- sales#160 — la devolución vive en su propio modal: el reparto por tender no cabe en un
           ion-alert, y el operador tiene que poder leer los topes mientras teclea. -->
      <ion-modal class="refund-modal" .isOpen=${!!this.refundSaleId}
        @ionModalDidDismiss=${() => { this.refundSaleId = undefined; }}>
        <ion-content>
          ${this.refundSaleId
            ? html`<erp-sale-refund .saleId=${this.refundSaleId} @refunded=${() => {
                this.refundSaleId = undefined;
                void this.ctrl.load();
                void this.loadStats();
              }}></erp-sale-refund>`
            : nothing}
        </ion-content>
      </ion-modal>`;
  }
}

define('erp-sales-list', ErpSalesList);
