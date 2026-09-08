// sales#267 — the screen where the business writes its own open-price departments.
//
// It is NOT a new kind of screen: it is the CRUD every catalogue of the fleet already uses — an
// `ok-data-table` where «+» opens the create panel, the row action «edit» pre-fills the SAME form
// and «delete» confirms before it runs. Reusing it is what gives loading, empty, search and the
// phone/tablet/desktop layouts for free (the same reasoning as `erp-pos-quick-notes`).
//
// 🔴 THE ONE THING THAT IS ITS OWN: the VAT field is a SELECT fed by the hub's real tax
// categories, never a text box. `tax_category_key` is a canonical fiscal key (`product.reduced`,
// ADR-0085) — typed by hand, one typo produces a department that resolves NO rate, and the till
// only finds out at checkout, with the customer already holding the card. The business picks from
// what its own hub has.
import { beforeEach, describe, expect, it } from 'vitest';
import { installErploraDouble } from '../../test/erplora-double';

const ROWS = [
  { id: 'd-veg', name: 'Frutas y verduras', tax_category_key: 'product.super_reduced', sort_order: 10 },
  { id: 'd-clean', name: 'Droguería', tax_category_key: 'product.generic', sort_order: 20 },
];
const TAX_CATS = [
  { key: 'product.super_reduced', name: 'Product — super-reduced', display_name: 'Producto — superreducido', is_active: 1 },
  { key: 'product.generic', name: 'Product — generic', display_name: 'Producto — general', is_active: 1 },
  { key: 'old.zero', name: 'Retired', is_active: 0 },
];
const RULES = [
  { id: 'r-4', tax_category_key: 'product.super_reduced', rate_pct: 4, parent_id: null, valid_from: '2020-01-01', is_active: 1 },
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, valid_from: '2020-01-01', is_active: 1 },
];

const commands: { name: string; payload: Record<string, unknown> }[] = [];
let pageFails = false;
let taxCats: unknown[] = TAX_CATS;
let double: ReturnType<typeof installErploraDouble>;

beforeEach(() => {
  commands.length = 0;
  pageFails = false;
  taxCats = TAX_CATS;
  double = installErploraDouble({
    queries: {
      'sales.departments.list': () => {
        if (pageFails) throw new Error('boom');
        return ROWS;
      },
      'taxes.categories.list': () => taxCats,
      'taxes.rules.list': RULES,
    },
    pageSize: ROWS.length,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    locale: 'es',
    t: (_c: Record<string, unknown>, key: string, params?: Record<string, unknown>) =>
      (params ? `${key}:${JSON.stringify(params)}` : key),
  });
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  editingId: string | null;
  newName: string;
  newTaxCategoryKey: string;
  newSortOrder: string;
  formError: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  save(ev: Event): Promise<void>;
  confirmDelete(): Promise<void>;
};

async function mount(): Promise<Mounted> {
  document.body.innerHTML = '';
  await import('./erp-pos-departments');
  const el = document.createElement('erp-pos-departments') as unknown as Mounted;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}
const settle = async (el: Mounted) => {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};
const action = (el: Mounted, actionId: string, row: Record<string, unknown> = ROWS[0]) =>
  el.onRowAction(new CustomEvent('rowAction', { detail: { actionId, row } }));
const table = (el: Mounted) =>
  el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & {
    addable: boolean;
    rows: Record<string, unknown>[];
    emptyMessage: string;
  }) | null;
const options = (el: Mounted) => [...el.shadowRoot.querySelectorAll('ion-select-option')];

describe('the list', () => {
  it('shows the departments the business configured', async () => {
    const el = await mount();
    expect(table(el)?.rows).toEqual(ROWS);
  });

  it('is empty-stated, not blank, when nothing is configured yet', async () => {
    double.setQuery('sales.departments.list', []);
    const el = await mount();
    expect(table(el)?.rows).toEqual([]);
    expect(table(el)?.emptyMessage).toBe('ui.departmentsEmpty');
  });

  it('says so when the read fails instead of showing an empty catalogue', async () => {
    pageFails = true;
    const el = await mount();
    await settle(el);
    expect(el.shadowRoot.querySelector('ok-inline-feedback')).toBeTruthy();
  });
});

describe('the VAT field is a SELECT of the hub\'s own tax categories', () => {
  it('offers one option per ACTIVE category, never a text box', async () => {
    const el = await mount();
    expect(el.shadowRoot.querySelector('ion-select'), 'the VAT is picked, not typed').toBeTruthy();
    expect(options(el)).toHaveLength(2);
  });

  it('names them in the hub\'s language and shows the rate they charge', async () => {
    const el = await mount();
    const txt = options(el).map((o) => (o.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(txt.some((s) => s.includes('Producto — superreducido') && s.includes('4%'))).toBe(true);
    expect(txt.some((s) => s.includes('Producto — general') && s.includes('21%'))).toBe(true);
  });

  it('the RETIRED category is not offered — it could never be charged', async () => {
    const el = await mount();
    expect(options(el).map((o) => o.textContent ?? '').join(' | ')).not.toMatch(/Retired/);
  });

  it('with NO tax categories at all it says what to do, instead of an empty picker', async () => {
    taxCats = [];
    const el = await mount();
    await settle(el);
    const txt = el.shadowRoot.textContent ?? '';
    expect(txt).toContain('ui.departmentsNoTaxCategories');
  });
});

describe('the CRUD lives inside the data-table', () => {
  it('the table is addable and the form is projected in its `create` slot', async () => {
    const el = await mount();
    expect(table(el)?.addable).toBe(true);
    expect(el.shadowRoot.querySelector('form[slot="create"]')?.closest('ok-data-table')).toBeTruthy();
  });

  it('the actions follow the permission — read-only for whoever cannot configure the till', async () => {
    let el = await mount();
    expect(el.actions.map((a) => a.id)).toEqual(['edit', 'delete']);
    el.remove();
    double.sdk.hasPermission = (p: string) => p === 'sales.view_sale';
    el = await mount();
    expect(el.actions).toEqual([]);
    expect(table(el)?.addable, 'no «+» without sales.manage_settings').toBe(false);
  });
});

describe('create · edit · delete', () => {
  it('creates with the name, the VAT it charges and its position', async () => {
    const el = await mount();
    el.newName = 'Carnicería';
    el.newTaxCategoryKey = 'product.reduced';
    el.newSortOrder = '30';
    await el.save(new Event('submit'));

    expect(commands).toEqual([{
      name: 'sales.departments.create',
      payload: { name: 'Carnicería', tax_category_key: 'product.reduced', sort_order: 30 },
    }]);
  });

  it('refuses an EMPTY name — a blank key is a key nobody can read', async () => {
    const el = await mount();
    el.newName = '   ';
    el.newTaxCategoryKey = 'product.generic';
    await el.save(new Event('submit'));
    expect(commands).toEqual([]);
  });

  it('🔴 refuses to save with NO VAT chosen, and says why', async () => {
    // A department with no tax category resolves no rate: it would be sellable on screen and
    // rejected at checkout, with the customer already waiting.
    const el = await mount();
    el.newName = 'Carnicería';
    el.newTaxCategoryKey = '';
    await el.save(new Event('submit'));

    expect(commands, 'nothing is sent').toEqual([]);
    expect(el.formError, 'and the reason is on screen, not swallowed').toBe('ui.departmentTaxCategoryMissing');
  });

  it('edit pre-fills the SAME form and updates by id', async () => {
    const el = await mount();
    await action(el, 'edit');
    expect(el.editingId).toBe('d-veg');
    expect(el.newName).toBe('Frutas y verduras');
    expect(el.newTaxCategoryKey, 'the VAT comes back selected, not blank').toBe('product.super_reduced');

    el.newName = 'Frutería';
    await el.save(new Event('submit'));
    expect(commands).toEqual([{
      name: 'sales.departments.update',
      payload: { department_id: 'd-veg', name: 'Frutería', tax_category_key: 'product.super_reduced', sort_order: 10 },
    }]);
  });

  it('delete never runs on the first tap: it asks first', async () => {
    const el = await mount();
    await action(el, 'delete');
    expect(commands, 'the tap only opens the confirmation').toEqual([]);

    await el.confirmDelete();
    expect(commands).toEqual([{ name: 'sales.departments.delete', payload: { department_id: 'd-veg' } }]);
  });

  it('a failed save leaves the reason on screen', async () => {
    const el = await mount();
    double.sdk.command = async () => { throw new Error('nope'); };
    el.newName = 'Carnicería';
    el.newTaxCategoryKey = 'product.generic';
    await el.save(new Event('submit'));
    expect(el.formError).toBeTruthy();
  });
});
