import { LitElement, html, css, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import '@erplora/outfitkit/ok-data-table';
import type { DataTableColumn, DataTableAction } from '@erplora/outfitkit';
import { createListController } from '@erplora/module-sdk';
import type { ListController, ListClient, ListParams, ListPage } from '@erplora/module-sdk';
// Module i18n (ADR-0055/0199): esbuild inlines these catalogues into the module's `dist`. English
// is the SOURCE language and Spanish its translation — no visible string is hardcoded.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
import { domainErrorText } from '../../lib/domain-error-text';
import { ionTone } from '../../lib/ion-tone';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// «Quick notes» screen of the till (sales#206): the CRUD behind the chips the waiter taps on the
// line-note sheet.
//
// THE SHAPE IS LIGHTSPEED'S. Of the eight references only Lightspeed Restaurant (K-Series) ships
// preconfigured notes as a feature: the business creates them in the Back Office — add, edit,
// delete and REORDER — and the order set there is the order the POS shows. Toast, Square, Clover,
// Revel, Simphony and SumUp give free text only (Square's own answer in its community to «how do I
// add predefined notes» is: use modifiers); Odoo needs its configuration/app, and Shopify POS
// needs an app. So this screen copies Lightspeed and nobody else.
//
// AND IT IS NOT A NEW KIND OF SCREEN. It is the CRUD every catalogue of the fleet already uses —
// an `ok-data-table` where «+» opens the create panel, the row action «edit» pre-fills the SAME
// form (the submit decides by `editingId`) and «delete» confirms first (`services.categories`,
// `inventory.categories`, `modifiers.groups`). Reusing it is what gives loading, empty, search and
// the phone/tablet/desktop layouts without a fourth hand-rolled list.

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  hasPermission?(permission: string): boolean;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** Row of `sales.quick_notes.list`. */
interface QuickNote {
  id: string;
  text: string;
  sort_order: number;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK not initialised by the shell');
  return c;
}

/** UI visibility only; the runtime re-validates the permission on every command. */
function can(permission: string): boolean {
  const client = erplora();
  return typeof client.hasPermission === 'function' ? client.hasPermission(permission) : true;
}

export class ErpPosQuickNotes extends LitElement {
  static styles = css`
    :host { display:flex; flex-direction:column; height:100%; min-height:0;
            font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
    .page > ok-data-table { flex:1 1 auto; min-height:0; }
    .intro { margin:0 0 .6rem; font-size:.85rem; color: var(--ion-color-medium, #6b6b6b); }
    .form { display:flex; flex-direction:column; gap:.7rem; }
    .form ion-button[type='submit'] { align-self:flex-end; }
  `;

  @state() newText = '';
  @state() newSortOrder = '';
  @state() saving = false;
  /** What «Save» in the panel was refused: painted inside that form, never on the page (pm#513). */
  @state() formError = '';
  /** What a delete was refused: the confirmation is closed and no panel is open then, so it goes on the page. */
  @state() pageError = '';
  /** Note being edited; `null` = create mode. The submit decides create vs update. */
  @state() editingId: string | null = null;
  /** Note waiting for the delete confirmation. */
  @state() deleteTarget: QuickNote | null = null;

  private ctrl!: ListController<QuickNote>;

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return [
      { key: 'text', header: t('ui.quickNoteText'), sortable: true, filterable: true, filterType: 'text' },
      // The position is the ONLY thing that decides the order of the chips at the till, so it is a
      // column and not a hidden field: the business has to see what it is changing.
      { key: 'sort_order', header: t('ui.quickNoteOrder'), align: 'right', sortable: true },
    ];
  }

  get actions(): DataTableAction[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return can('sales.manage_settings')
      ? [
          { id: 'edit', label: t('ui.quickNoteEdit'), icon: 'create-outline' },
          { id: 'delete', label: t('ui.quickNoteDelete'), icon: 'trash-outline', color: 'danger' },
        ]
      : [];
  }

  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    this.ctrl = createListController<QuickNote>(
      erplora(),
      'sales.quick_notes.list',
      () => this.requestUpdate(),
      { pageSize: 50, sort: 'sort_order', dir: 'asc' },
    );
    await this.ctrl.load();
  }

  disconnectedCallback(): void {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    super.disconnectedCallback();
  }

  private dataTable(): { open(p?: 'filters' | 'create'): void; close(): void } | null {
    return this.renderRoot.querySelector('ok-data-table') as
      { open(p?: 'filters' | 'create'): void; close(): void } | null;
  }

  async onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void> {
    if (!can('sales.manage_settings')) return;
    const { actionId, row } = ev.detail;
    const note = row as unknown as QuickNote;
    if (actionId === 'edit') {
      this.editingId = note.id;
      this.newText = note.text ?? '';
      this.newSortOrder = String(note.sort_order ?? 0);
      this.formError = '';
      this.dataTable()?.open('create');
    } else if (actionId === 'delete') {
      // Never on the first tap, and the confirmation says what is NOT lost: the notes already
      // typed are text on their own rows and keep it.
      this.deleteTarget = note;
    }
  }

  /** Back to a clean CREATE form. */
  cancelEdit(): void {
    this.editingId = null;
    this.newText = '';
    this.newSortOrder = '';
    this.formError = '';
  }

  /** Submit: create OR update by `editingId`. */
  async save(ev: Event): Promise<void> {
    ev.preventDefault();
    if (!can('sales.manage_settings')) return;
    const text = this.newText.trim();
    // An empty chip is a chip nobody can read at the pass. The schema refuses it too
    // (`minLength: 1`); this is only so the till never sends a call it knows is going to fail.
    if (!text) return;
    this.saving = true;
    this.formError = '';
    this.pageError = ''; // a save is the next thing the person did: an older delete refusal is stale (staff#75)
    try {
      const fields = { text, sort_order: Number(this.newSortOrder) || 0 };
      if (this.editingId) {
        await erplora().command('sales.quick_notes.update', { quick_note_id: this.editingId, ...fields });
      } else {
        await erplora().command('sales.quick_notes.create', fields);
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainErrorText(CATALOG, erplora().locale, e) || erplora().t(CATALOG, 'ui.quickNoteSaveFailed');
    } finally {
      this.saving = false;
    }
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget;
    if (!target || !can('sales.manage_settings')) return;
    this.saving = true;
    this.pageError = '';
    try {
      await erplora().command('sales.quick_notes.delete', { quick_note_id: target.id });
      this.deleteTarget = null;
      await this.ctrl.load();
    } catch (e) {
      this.pageError = domainErrorText(CATALOG, erplora().locale, e) || erplora().t(CATALOG, 'ui.quickNoteDeleteFailed');
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }

  private renderDeleteConfirm() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`<ion-modal data-testid="pos-quick-notes-delete-modal" .isOpen=${!!this.deleteTarget}
        @ionModalDidDismiss=${() => { this.deleteTarget = null; }}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t('ui.quickNoteDeleteTitle')}</ion-title></ion-toolbar>
      </ion-header>
      <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
      <ion-content class="ion-padding">
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <b>${this.deleteTarget?.text ?? ''}</b> — ${t('ui.quickNoteDeleteHint')}
            </ion-label>
          </ion-item>
        </ion-list>
        <ion-button class="ion-margin-top" data-testid="pos-quick-notes-delete-confirm" expand="block" style=${ionTone('solid', 'danger')} ?disabled=${this.saving}
          @click=${() => this.confirmDelete()}>${t('ui.quickNoteDelete')}</ion-button>
        <ion-button data-testid="pos-quick-notes-delete-cancel" expand="block" fill="outline" ?disabled=${this.saving}
          @click=${() => { this.deleteTarget = null; }}>${t('ui.quickNoteCancel')}</ion-button>
      </ion-content>
    </ion-modal>`;
  }

  /** pm#513: the refusal appears above the button that was pressed — on a phone that can leave it
   *  off the sheet. Bring it into view when it appears, not again on every keystroke. */
  updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('formError') && this.formError) void this.revealRefusal();
  }

  /** ok-inline-feedback lays itself out in its own update: scrolled to before it, the box is empty. */
  private async revealRefusal(): Promise<void> {
    const banner = this.renderRoot.querySelector('[data-testid="pos-quick-notes-form-error"]') as
      (HTMLElement & { updateComplete?: Promise<unknown> }) | null;
    await banner?.updateComplete;
    banner?.scrollIntoView?.({ block: 'center' });
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const editable = can('sales.manage_settings');
    return html`<div class="page">
      <p class="intro">${t('ui.quickNotesIntro')}</p>
      ${this.pageError
        ? html`<ok-inline-feedback data-testid="pos-quick-notes-error" tone="danger" icon="alert-circle-outline">${this.pageError}</ok-inline-feedback>`
        : nothing}
      ${this.ctrl?.error
        ? html`<ok-inline-feedback data-testid="pos-quick-notes-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>`
        : nothing}
      <ok-data-table
        data-testid="pos-quick-notes-table"
        testid="pos-quick-notes-table"
        .serverSide=${true}
        .fill=${true}
        .views=${true}
        .addable=${editable}
        .cardTitle=${(row: Record<string, unknown>) => String(row.text ?? '')}
        .columns=${this.columns}
        .rows=${this.ctrl?.rows ?? []}
        .total=${this.ctrl?.total ?? 0}
        .page=${this.ctrl?.state.page ?? 0}
        .pageSize=${this.ctrl?.state.pageSize ?? 50}
        .sort=${this.ctrl?.state.sort}
        .sortDir=${this.ctrl?.state.dir ?? 'asc'}
        .searchable=${true}
        .searchPlaceholder=${t('ui.quickNotesSearch')}
        .actions=${this.actions}
        .rowClickable=${editable}
        .emptyMessage=${this.ctrl?.loading ? t('ui.quickNotesLoading') : t('ui.quickNotesEmpty')}
        @rowAction=${(e: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) => this.onRowAction(e)}
        @rowClick=${(e: CustomEvent<{ row: Record<string, unknown> }>) =>
          this.onRowAction({ detail: { actionId: 'edit', row: e.detail.row } } as CustomEvent<{ actionId: string; row: Record<string, unknown> }>)}
        @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)}
        @pageSizeChange=${(e: CustomEvent<number>) => this.ctrl.setPageSize(e.detail)}
        @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)}
        @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)}
        @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}>
        <form slot="create" class="form" data-testid="pos-quick-notes-form" @submit=${(e: Event) => this.save(e)}>
          ${this.editingId
            ? html`<ok-inline-feedback tone="info" icon="create-outline">
                <b>${t('ui.quickNoteEditing')}</b> — ${this.newText}
                <ion-button data-testid="pos-quick-notes-edit-cancel" size="small" fill="clear" @click=${() => this.cancelEdit()}>${t('ui.quickNoteEditCancel')}</ion-button>
              </ok-inline-feedback>`
            : nothing}
          <!-- mode="md" is not decoration: the shell pins Ionic's ios mode (ADR-0143) and fill
               paints in md only, so without it the box has no border and the person cannot see
               where to type. -->
          <ion-input mode="md" fill="outline" label-placement="floating" maxlength="80"
            data-testid="pos-quick-notes-text"
            label=${t('ui.quickNoteText')} .value=${this.newText}
            @ionInput=${(e: Event) => { this.newText = (e.target as HTMLInputElement).value; }}></ion-input>
          <ion-input mode="md" fill="outline" label-placement="floating" type="number" min="0" step="1"
            data-testid="pos-quick-notes-order"
            label=${t('ui.quickNoteOrder')} .value=${this.newSortOrder}
            @ionInput=${(e: Event) => { this.newSortOrder = (e.target as HTMLInputElement).value; }}></ion-input>
          <!-- pm#513: the refusal travels WITH the form — under 834 px the panel is a full-screen
               sheet and a notice on the page underneath it is never seen. -->
          ${this.formError
            ? html`<ok-inline-feedback data-testid="pos-quick-notes-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>`
            : nothing}
          <ion-button type="submit" data-testid="pos-quick-notes-submit" ?disabled=${this.saving || !this.newText.trim()}>
            ${this.saving ? t('ui.quickNoteSaving') : this.editingId ? t('ui.quickNoteSave') : t('ui.quickNoteAdd')}
          </ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
    </div>`;
  }
}

define('erp-pos-quick-notes', ErpPosQuickNotes);
