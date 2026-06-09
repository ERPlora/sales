import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-data-table';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import '../erp-sales-document/erp-sales-document.js';
import { createListController } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  on(event: string, cb: (payload: unknown) => void): () => void;
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

interface Stats { count: number; total_revenue: number; avg_ticket: number; }

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpSalesList extends LitElement {
  static styles = css`
    :host { display:block; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    h2 { margin:0 0 .75rem; font-size:1.15rem; }
    .cards { display:flex; gap:.6rem; margin-bottom:1rem; flex-wrap:wrap; }
    .card { flex:1; min-width:8rem; padding:.7rem .9rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:12px; }
    .card .k { color:#8b897f; font-size:.75rem; text-transform:uppercase; }
    .card .v { font-size:1.3rem; font-weight:700; }
    .err { color:#d9480f; }
  `;

  @state() stats: Stats = { count: 0, total_revenue: 0, avg_ticket: 0 };

  @state() statsError = '';

  @state() tick = 0;

  /** Venta seleccionada para ver su documento (tiquet/factura) en el modal. */
  @state() docSaleId?: string;

  private documentActions: DataTableAction[] = [
    { id: 'document', label: 'Documento', icon: 'receipt-outline' },
  ];

  private ctrl!: ListController<Sale>;

  private unsub?: () => void;

  private columns: DataTableColumn[] = [
    { key: 'sale_number', header: 'Número', sortable: true, filterable: true, filterType: 'text' },
    { key: 'customer_name', header: 'Cliente', sortable: true, filterable: true, filterType: 'text', format: (r) => (r.customer_name as string) || '—' },
    { key: 'payment_method_name', header: 'Pago', sortable: true, filterable: true, filterType: 'text', format: (r) => (r.payment_method_name as string) || '—' },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      filterable: true,
      filterType: 'select',
      options: [
        { value: 'completed', label: 'Completada' },
        { value: 'voided', label: 'Anulada' },
      ],
    },
    { key: 'total', header: 'Total', align: 'right', sortable: true, filterable: true, filterType: 'range', format: (r) => Number(r.total || 0).toFixed(2) },
  ];

  // TODO-LIT: componentWillLoad → connectedCallback. Recuerda: connectedCallback se dispara
  // en CADA reconexión al DOM (no solo en el primer montaje). Si la init debe correr una
  // sola vez tras el primer render, considera firstUpdated() en su lugar.
  async connectedCallback() {
    super.connectedCallback();
    this.ctrl = createListController<Sale>(erplora(), 'sales.list', () => this.requestUpdate(), {
      pageSize: 50,
      sort: 'created_at',
      dir: 'desc',
    });
    await Promise.all([this.ctrl.load(), this.loadStats()]);
    try { this.unsub = erplora().on('sale.completed', () => { this.ctrl.load(); this.loadStats(); }); }
    catch { /* preview sin SDK */ }
  }

  disconnectedCallback() {
    super.disconnectedCallback(); this.unsub?.(); }

  private async loadStats() {
    try {
      const rows = await erplora().query<Stats[]>('sales.stats');
      this.stats = (rows && rows[0]) || { count: 0, total_revenue: 0, avg_ticket: 0 };
    } catch (e) {
      this.statsError = e instanceof Error ? e.message : 'Error cargando métricas';
    }
  }

  render() {
    return html`<div>
        <h2>Ventas</h2>
        <div class="cards">
          <div class="card">
            <div class="k">Tickets</div>
            <div class="v">${this.stats.count}</div>
          </div>
          <div class="card">
            <div class="k">Ingresos</div>
            <div class="v">${Number(this.stats.total_revenue || 0).toFixed(2)}</div>
          </div>
          <div class="card">
            <div class="k">Ticket medio</div>
            <div class="v">${Number(this.stats.avg_ticket || 0).toFixed(2)}</div>
          </div>
        </div>
        ${this.statsError ? html`<p class="err">${this.statsError}</p>` : nothing}
        ${this.ctrl?.error ? html`<p class="err">${this.ctrl.error}</p>` : nothing}
        <ok-data-table .serverSide=${true} .columns=${this.columns} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? 'desc'} .searchable=${true} .searchPlaceholder=${"Buscar número o cliente…"} .emptyMessage=${this.ctrl?.loading ? 'Cargando…' : 'Aún no hay ventas.'} .actions=${this.documentActions} @rowAction=${(e: CustomEvent<{ actionId: string; row: Sale }>) => { if (e.detail.actionId === 'document') this.docSaleId = e.detail.row.id; }} @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)} @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)} @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)} @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}></ok-data-table>

        <ion-modal .isOpen=${!!this.docSaleId} @ionModalDidDismiss=${() => { this.docSaleId = undefined; }}>
          <ion-header>
            <ion-toolbar>
              <ion-title>Documento de venta</ion-title>
              <ion-buttons slot="end">
                <ion-button @click=${() => { this.docSaleId = undefined; }}>Cerrar</ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content class="ion-padding">
            ${this.docSaleId ? html`<erp-sales-document .saleId=${this.docSaleId}></erp-sales-document>` : nothing}
          </ion-content>
        </ion-modal>
      </div>`;
  }
}

define('erp-sales-list', ErpSalesList);
