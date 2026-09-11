import { LitElement, html, css, nothing } from 'lit';
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
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// «Departments» screen of the till (sales#267): the CRUD behind the buttons the cashier picks from
// when charging an amount that is not in the catalogue.
//
// WHY THE BUSINESS OWNS THIS LIST. The sheet used to paint one department per ACTIVE TAX CATEGORY,
// and that catalogue is identical in every hub — the `taxes` seed plants the same ten `is_system=1`
// rows everywhere. A grocer had to choose between «Restaurant — alcohol» and «Service —
// healthcare» and could not find «Fruit and veg». Of the twelve references checked, NOT ONE ships a
// fixed list: the classic cash register (Sharp XE-A207: 99 departments the shop names, each with
// its own taxability), Toast's open items, Lightspeed's Departments and the Spanish tills'
// *familias* all let the shop name its own and carry the VAT as an ATTRIBUTE. The ones that offer a
// bare amount button with no department — Shopify POS, Zettle, Square — are the documented
// counter-example: a Shopify merchant reported in its own community that they had been
// «overcharging customers for a year» through that button.
//
// AND IT IS NOT A NEW KIND OF SCREEN. It is the CRUD every catalogue of the fleet already uses —
// an `ok-data-table` where «+» opens the create panel, the row action «edit» pre-fills the SAME
// form and «delete» confirms first. Reusing it is what gives loading, empty, search and the
// phone/tablet/desktop layouts without another hand-rolled list.
//
// 🔴 THE VAT IS PICKED, NEVER TYPED. `tax_category_key` is a canonical fiscal key
// (`product.super_reduced`, ADR-0085). Typed by hand, one typo makes a department that resolves NO
// rate — and the till would only find out at checkout, with the customer already holding the card.
// The picker is fed by the hub's OWN categories, so what cannot be charged cannot be chosen.

interface ErploraClientLike extends ListClient {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  queryAll<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T[]>;
  queryPage<R = unknown>(name: string, params: ListParams): Promise<ListPage<R>>;
  command<T = unknown>(name: string, payload?: Record<string, unknown>): Promise<T>;
  on(event: string, cb: (payload: unknown) => void): () => void;
  hasPermission?(permission: string): boolean;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

/** Row of `sales.departments.list`. */
interface Department {
  id: string;
  name: string;
  tax_category_key: string;
  sort_order: number;
}

/** Row of `taxes.categories.list` (ADR-0085). `display_name` is already in the hub's language
 *  (taxes#38); the canonical `name` is the seed's English and `sales` cannot translate another
 *  module's catalogue (ADR-0043), so the query is the only door. */
interface TaxCategory { key: string; name: string; display_name?: string; is_active?: number }
interface TaxRuleRow {
  id?: string;
  tax_category_key?: string;
  rate_pct?: number | string;
  parent_id?: string | null;
  valid_from?: string | null;
}

/** What the picker offers: the key that is stored and the label that is read. */
interface TaxChoice { key: string; label: string }

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
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

/** `tax_category_key → rate_pct`, root rule plus its components (equivalence surcharge).
 *
 *  It is the same arithmetic `lib/pos-tax.ts` does for the till's preview, and for the same
 *  reason it is only a LABEL: the rate that gets charged is the server's. Here it exists so the
 *  business reads «Producto — superreducido · 4%» instead of a fiscal key it has to know by heart.
 *  A category with no rule keeps its name and shows no rate — it is not hidden, because hiding it
 *  would silently shrink the picker and nobody would know why. */
export function ratesByCategory(ruleRows: TaxRuleRow[]): Map<string, number> {
  const isRoot = (r: TaxRuleRow): boolean => r.parent_id == null || String(r.parent_id) === '';
  const rootByCat = new Map<string, TaxRuleRow>();
  for (const r of ruleRows) {
    if (!r || !r.tax_category_key || !isRoot(r)) continue;
    const cat = String(r.tax_category_key);
    const cur = rootByCat.get(cat);
    if (!cur || String(r.valid_from ?? '') > String(cur.valid_from ?? '')) rootByCat.set(cat, r);
  }
  const out = new Map<string, number>();
  for (const [cat, root] of rootByCat) {
    let pct = Number(root.rate_pct) || 0;
    for (const r of ruleRows) {
      if (r && root.id != null && String(r.parent_id ?? '') === String(root.id)) pct += Number(r.rate_pct) || 0;
    }
    out.set(cat, pct);
  }
  return out;
}

/** The picker's options: ACTIVE categories only, named in the hub's language, with their rate.
 *
 *  A retired category is left out because it could never be charged — offering it would build a
 *  department that fails at the till. */
export function toTaxChoices(cats: TaxCategory[], rates: Map<string, number>): TaxChoice[] {
  return cats
    .filter((c) => c.key && c.is_active !== 0)
    .map((c) => {
      const name = c.display_name || c.name || c.key;
      const pct = rates.get(c.key);
      return { key: c.key, label: pct === undefined ? name : `${name} · ${pct}%` };
    });
}

export class ErpPosDepartments extends LitElement {
  static styles = css`
    :host { display:flex; flex-direction:column; height:100%; min-height:0;
            font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
    .page > ok-data-table { flex:1 1 auto; min-height:0; }
    .intro { margin:0 0 .6rem; font-size:.85rem; color: var(--ion-color-medium, #6b6b6b); }
    .form { display:flex; flex-direction:column; gap:.7rem; }
    .form ion-button[type='submit'] { align-self:flex-end; }
  `;

  @state() newName = '';
  @state() newTaxCategoryKey = '';
  @state() newSortOrder = '';
  @state() saving = false;
  @state() formError = '';
  /** Department being edited; `null` = create mode. The submit decides create vs update. */
  @state() editingId: string | null = null;
  /** Department waiting for the delete confirmation. */
  @state() deleteTarget: Department | null = null;
  /** The hub's own tax categories, which is what the VAT picker offers. */
  @state() private taxChoices: TaxChoice[] = [];

  private ctrl!: ListController<Department>;

  private get columns(): DataTableColumn[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const label = (key: string): string => this.taxChoices.find((c) => c.key === key)?.label ?? key;
    return [
      { key: 'name', header: t('ui.departmentName'), sortable: true, filterable: true, filterType: 'text' },
      // The fiscal key is shown as the business reads it, never raw: `product.super_reduced` on a
      // screen is a key somebody has to decode. It falls back to the key when the category is gone,
      // which is exactly the case worth seeing.
      { key: 'tax_category_key', header: t('ui.departmentTaxCategory'), format: (r) => label(String(r.tax_category_key ?? '')) },
      // The position is the ONLY thing that decides the order of the buttons at the till, so it is
      // a column and not a hidden field: the business has to see what it is changing.
      { key: 'sort_order', header: t('ui.departmentOrder'), align: 'right', sortable: true },
    ];
  }

  get actions(): DataTableAction[] {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return can('sales.manage_settings')
      ? [
          { id: 'edit', label: t('ui.departmentEdit'), icon: 'create-outline' },
          { id: 'delete', label: t('ui.departmentDelete'), icon: 'trash-outline', color: 'danger' },
        ]
      : [];
  }

  private readonly onLocaleChange = (): void => this.requestUpdate();

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    this.ctrl = createListController<Department>(
      erplora(),
      'sales.departments.list',
      () => this.requestUpdate(),
      { pageSize: 50, sort: 'sort_order', dir: 'asc' },
    );
    await Promise.all([this.ctrl.load(), this.loadTaxChoices()]);
  }

  disconnectedCallback(): void {
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    super.disconnectedCallback();
  }

  /** Fills the VAT picker from the hub's own tax catalogue.
   *
   *  The rates are best-effort — without them the options keep their names and lose the «· 4%», so
   *  the screen still works. The CATEGORIES are not: with none of them there is nothing to pick,
   *  and the form says so instead of showing an empty picker that looks broken. */
  private async loadTaxChoices(): Promise<void> {
    const [cats, ruleRows] = await Promise.all([
      erplora().queryAll<TaxCategory>('taxes.categories.list').catch(() => [] as TaxCategory[]),
      erplora().queryAll<TaxRuleRow>('taxes.rules.list').catch(() => [] as TaxRuleRow[]),
    ]);
    this.taxChoices = toTaxChoices(rows<TaxCategory>(cats), ratesByCategory(rows<TaxRuleRow>(ruleRows)));
  }

  private dataTable(): { open(p?: 'filters' | 'create'): void; close(): void } | null {
    return this.renderRoot.querySelector('ok-data-table') as
      { open(p?: 'filters' | 'create'): void; close(): void } | null;
  }

  async onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void> {
    if (!can('sales.manage_settings')) return;
    const { actionId, row } = ev.detail;
    const dept = row as unknown as Department;
    if (actionId === 'edit') {
      this.editingId = dept.id;
      this.newName = dept.name ?? '';
      this.newTaxCategoryKey = dept.tax_category_key ?? '';
      this.newSortOrder = String(dept.sort_order ?? 0);
      this.formError = '';
      this.dataTable()?.open('create');
    } else if (actionId === 'delete') {
      // Never on the first tap, and the confirmation says what is NOT lost: everything already
      // sold froze its name and its VAT on its own line.
      this.deleteTarget = dept;
    }
  }

  /** Back to a clean CREATE form. */
  cancelEdit(): void {
    this.editingId = null;
    this.newName = '';
    this.newTaxCategoryKey = '';
    this.newSortOrder = '';
    this.formError = '';
  }

  /** Submit: create OR update by `editingId`. */
  async save(ev: Event): Promise<void> {
    ev.preventDefault();
    if (!can('sales.manage_settings')) return;
    const name = this.newName.trim();
    // A nameless department is a blank key at the till. The schema refuses it too
    // (`minLength: 1`); this is only so the screen never sends a call it knows will fail.
    if (!name) return;
    // 🔴 And a department with NO VAT is worse than one with no name: it looks sellable and is
    // rejected at checkout, in front of the customer. It is said HERE, on the form, and not
    // swallowed — the submit button is disabled too, but a guard that lives only in `?disabled`
    // is a guard that the first path not painting that button walks straight past.
    const taxCategoryKey = this.newTaxCategoryKey.trim();
    if (!taxCategoryKey) {
      this.formError = erplora().t(CATALOG, 'ui.departmentTaxCategoryMissing');
      return;
    }
    this.saving = true;
    this.formError = '';
    try {
      const fields = { name, tax_category_key: taxCategoryKey, sort_order: Number(this.newSortOrder) || 0 };
      if (this.editingId) {
        await erplora().command('sales.departments.update', { department_id: this.editingId, ...fields });
      } else {
        await erplora().command('sales.departments.create', fields);
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainErrorText(CATALOG, erplora().locale, e) || erplora().t(CATALOG, 'ui.departmentSaveFailed');
    } finally {
      this.saving = false;
    }
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget;
    if (!target || !can('sales.manage_settings')) return;
    this.saving = true;
    try {
      await erplora().command('sales.departments.delete', { department_id: target.id });
      this.deleteTarget = null;
      await this.ctrl.load();
    } catch (e) {
      this.formError = domainErrorText(CATALOG, erplora().locale, e) || erplora().t(CATALOG, 'ui.departmentDeleteFailed');
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }

  private renderDeleteConfirm() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    return html`<ion-modal data-testid="pos-departments-delete-modal" .isOpen=${!!this.deleteTarget}
        @ionModalDidDismiss=${() => { this.deleteTarget = null; }}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t('ui.departmentDeleteTitle')}</ion-title></ion-toolbar>
      </ion-header>
      <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
      <ion-content class="ion-padding">
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <b>${this.deleteTarget?.name ?? ''}</b> — ${t('ui.departmentDeleteHint')}
            </ion-label>
          </ion-item>
        </ion-list>
        <ion-button class="ion-margin-top" data-testid="pos-departments-delete-confirm" expand="block" color="danger" ?disabled=${this.saving}
          @click=${() => this.confirmDelete()}>${t('ui.departmentDelete')}</ion-button>
        <ion-button data-testid="pos-departments-delete-cancel" expand="block" fill="outline" ?disabled=${this.saving}
          @click=${() => { this.deleteTarget = null; }}>${t('ui.departmentCancel')}</ion-button>
      </ion-content>
    </ion-modal>`;
  }

  render() {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const editable = can('sales.manage_settings');
    const noTaxCategories = this.taxChoices.length === 0;
    return html`<div class="page">
      <p class="intro">${t('ui.departmentsIntro')}</p>
      ${this.formError
        ? html`<ok-inline-feedback data-testid="pos-departments-form-error" tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>`
        : nothing}
      ${this.ctrl?.error
        ? html`<ok-inline-feedback data-testid="pos-departments-load-error" tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>`
        : nothing}
      <ok-data-table
        data-testid="pos-departments-table"
        .serverSide=${true}
        .fill=${true}
        .views=${true}
        .addable=${editable}
        .cardTitle=${(row: Record<string, unknown>) => String(row.name ?? '')}
        .columns=${this.columns}
        .rows=${this.ctrl?.rows ?? []}
        .total=${this.ctrl?.total ?? 0}
        .page=${this.ctrl?.state.page ?? 0}
        .pageSize=${this.ctrl?.state.pageSize ?? 50}
        .sort=${this.ctrl?.state.sort}
        .sortDir=${this.ctrl?.state.dir ?? 'asc'}
        .searchable=${true}
        .searchPlaceholder=${t('ui.departmentsSearch')}
        .actions=${this.actions}
        .rowClickable=${editable}
        .emptyMessage=${this.ctrl?.loading ? t('ui.departmentsLoading') : t('ui.departmentsEmpty')}
        @rowAction=${(e: CustomEvent<{ actionId: string; row: Record<string, unknown> }>) => this.onRowAction(e)}
        @rowClick=${(e: CustomEvent<{ row: Record<string, unknown> }>) =>
          this.onRowAction({ detail: { actionId: 'edit', row: e.detail.row } } as CustomEvent<{ actionId: string; row: Record<string, unknown> }>)}
        @pageChange=${(e: CustomEvent<number>) => this.ctrl.setPage(e.detail)}
        @pageSizeChange=${(e: CustomEvent<number>) => this.ctrl.setPageSize(e.detail)}
        @sortChange=${(e: CustomEvent<{ sort: string; dir: 'asc' | 'desc' }>) => this.ctrl.setSort(e.detail.sort, e.detail.dir)}
        @searchChange=${(e: CustomEvent<string>) => this.ctrl.setSearch(e.detail)}
        @filterChange=${(e: CustomEvent<{ col: string; value: unknown }>) => this.ctrl.setFilter(e.detail.col, e.detail.value)}>
        <form slot="create" class="form" data-testid="pos-departments-form" @submit=${(e: Event) => this.save(e)}>
          ${this.editingId
            ? html`<ok-inline-feedback tone="info" icon="create-outline">
                <b>${t('ui.departmentEditing')}</b> — ${this.newName}
                <ion-button data-testid="pos-departments-edit-cancel" size="small" fill="clear" @click=${() => this.cancelEdit()}>${t('ui.departmentEditCancel')}</ion-button>
              </ok-inline-feedback>`
            : nothing}
          ${noTaxCategories
            ? html`<ok-inline-feedback data-testid="pos-departments-no-tax-categories" tone="warning" icon="alert-circle-outline">
                ${t('ui.departmentsNoTaxCategories')}
              </ok-inline-feedback>`
            : nothing}
          <!-- mode="md" is not decoration: the shell pins Ionic's ios mode (ADR-0143) and fill
               paints in md only, so without it the box has no border and the person cannot see
               where to type. -->
          <ion-input mode="md" fill="outline" label-placement="floating" maxlength="60"
            data-testid="pos-departments-name"
            label=${t('ui.departmentName')} placeholder=${t('ui.departmentNamePlaceholder')} .value=${this.newName}
            @ionInput=${(e: Event) => { this.newName = (e.target as HTMLInputElement).value; }}></ion-input>
          <ion-select mode="md" fill="outline" label-placement="floating"
            data-testid="pos-departments-tax-category"
            label=${t('ui.departmentTaxCategory')} .value=${this.newTaxCategoryKey || null}
            @ionChange=${(e: Event) => { this.newTaxCategoryKey = String((e.target as HTMLInputElement).value ?? ''); }}>
            ${this.taxChoices.map((c) => html`<ion-select-option value=${c.key}>${c.label}</ion-select-option>`)}
          </ion-select>
          <ion-input mode="md" fill="outline" label-placement="floating" type="number" min="0" step="1"
            data-testid="pos-departments-order"
            label=${t('ui.departmentOrder')} .value=${this.newSortOrder}
            @ionInput=${(e: Event) => { this.newSortOrder = (e.target as HTMLInputElement).value; }}></ion-input>
          <ion-button type="submit" data-testid="pos-departments-submit" ?disabled=${this.saving || !this.newName.trim() || noTaxCategories}>
            ${this.saving ? t('ui.departmentSaving') : this.editingId ? t('ui.departmentSave') : t('ui.departmentAdd')}
          </ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
    </div>`;
  }
}

define('erp-pos-departments', ErpPosDepartments);
