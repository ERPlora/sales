// sales#267 — the open-price sheet offers the BUSINESS'S departments, not the tax catalogue.
//
// The till used to paint one department per ACTIVE TAX CATEGORY, and the tax catalogue is the same
// in every hub there is (the `taxes` seed plants ten `is_system=1` rows in all of them). So a
// grocer typing an amount had to choose between «Restaurant — alcohol», «Restaurant — delivery»
// and «Service — healthcare», and could not find «Fruit and veg», which is the only thing being
// sold. The market never does this: the classic cash register, Toast's open items and the Spanish
// tills' *familias* all let the shop name its own departments and carry the VAT as an ATTRIBUTE.
//
// The department is therefore a row of `sales`, not a curation of `taxes`: the tax catalogue is
// REFERENCE data the module replants at the destination (ADR-0444), so a curation of it could
// never travel inside a sector template — which is the whole point of having departments.
//
// 🔴 The case that decides the shape of the key: TWO departments can share one tax category
// («Soft drinks and alcohol» and «Household» are both 21% in Spain). Keying the sheet by
// `tax_category_key` would collapse them into one button and charge the wrong NAME onto the
// receipt. The sheet is keyed by the department, and the tax category rides along.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import esCatalog from '../../../locales/es.json';
import './erp-pos-touch';

/** The ten `is_system=1` rows the `taxes` seed plants in EVERY hub — the noise being removed. */
const SEEDED_TAX_CATS = [
  { key: 'product.super_reduced', name: 'Product — super-reduced', is_active: 1 },
  { key: 'product.reduced', name: 'Product — reduced', is_active: 1 },
  { key: 'product.generic', name: 'Product — generic', is_active: 1 },
  { key: 'restaurant.food', name: 'Restaurant — food', is_active: 1 },
  { key: 'restaurant.alcohol', name: 'Restaurant — alcohol', is_active: 1 },
  { key: 'service.health', name: 'Service — healthcare', is_active: 1 },
];

const RULES = [
  { id: 'r-4', tax_category_key: 'product.super_reduced', rate_pct: 4, parent_id: null, is_active: 1 },
  { id: 'r-10', tax_category_key: 'product.reduced', rate_pct: 10, parent_id: null, is_active: 1 },
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-f', tax_category_key: 'restaurant.food', rate_pct: 10, parent_id: null, is_active: 1 },
  { id: 'r-a', tax_category_key: 'restaurant.alcohol', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-h', tax_category_key: 'service.health', rate_pct: 0, parent_id: null, is_active: 1 },
];

/** What a grocery template would ship: the shop's own families, cut along the AEAT boundary. */
const GROCERY = [
  { id: 'd-veg', name: 'Frutas y verduras', tax_category_key: 'product.super_reduced', sort_order: 1 },
  { id: 'd-meat', name: 'Carnicería', tax_category_key: 'product.reduced', sort_order: 2 },
  { id: 'd-drink', name: 'Refrescos y alcohol', tax_category_key: 'product.generic', sort_order: 3 },
  { id: 'd-clean', name: 'Droguería', tax_category_key: 'product.generic', sort_order: 4 },
];

let commands: { name: string; params: Record<string, unknown> }[] = [];

function install(departments?: unknown[]) {
  commands = [];
  installPosDouble({
    rules: RULES,
    taxCategories: SEEDED_TAX_CATS,
    ...(departments === undefined ? {} : { departments }),
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: `row-${commands.length}` }] };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  cart: Record<string, unknown>[];
  updateComplete: Promise<unknown>;
  openDept: string;
  openAmount: string;
  addOpenPrice(): Promise<void>;
}

async function mount(): Promise<Pos> {
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as Pos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as Pos).updateComplete;
  return el as unknown as Pos;
}

/** Opens the sheet the way the cashier does, and returns the department buttons in painted order. */
async function openSheet(el: Pos): Promise<HTMLElement[]> {
  (el.shadowRoot.querySelector('.tile.open-price') as HTMLElement).click();
  await el.updateComplete;
  return [...el.shadowRoot.querySelectorAll<HTMLElement>('.dept-btn')];
}

const labels = (btns: HTMLElement[]) => btns.map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());

beforeEach(() => { document.body.innerHTML = ''; });

describe('the sheet offers the shop\'s OWN departments when it has them', () => {
  it('paints one button per department, with the shop\'s name', async () => {
    install(GROCERY);
    const btns = await openSheet(await mount());

    expect(btns, 'one button per department the shop defined').toHaveLength(4);
    expect(labels(btns).some((t) => t.includes('Frutas y verduras'))).toBe(true);
  });

  it('and NOT one per seeded tax category: the grocer never sees the restaurant', async () => {
    install(GROCERY);
    const txt = labels(await openSheet(await mount())).join(' | ');

    expect(txt, 'the restaurant categories are noise in a grocery').not.toMatch(/Restaurant/i);
    expect(txt, 'so is healthcare').not.toMatch(/healthcare/i);
    expect(txt, 'and the fiscal wording is not a department name').not.toMatch(/super-reduced/i);
  });

  it('carries the VAT of its tax category as an attribute', async () => {
    install(GROCERY);
    const txt = labels(await openSheet(await mount()));

    expect(txt.find((t) => t.includes('Frutas y verduras')), 'greengrocery is super-reduced').toContain('4%');
    expect(txt.find((t) => t.includes('Carnicería')), 'butchery is reduced').toContain('10%');
    expect(txt.find((t) => t.includes('Droguería')), 'household goods are general').toContain('21%');
  });

  it('paints them in the order the business gave them, not alphabetically', async () => {
    // Shuffled on the way in: the order is `sort_order`, and it is the shop's decision.
    install([GROCERY[2], GROCERY[0], GROCERY[3], GROCERY[1]]);
    const txt = labels(await openSheet(await mount()));

    expect(txt.findIndex((t) => t.includes('Frutas'))).toBeLessThan(txt.findIndex((t) => t.includes('Carnicería')));
    expect(txt.findIndex((t) => t.includes('Carnicería'))).toBeLessThan(txt.findIndex((t) => t.includes('Refrescos')));
    expect(txt.findIndex((t) => t.includes('Refrescos'))).toBeLessThan(txt.findIndex((t) => t.includes('Droguería')));
  });

  it('🔴 keeps TWO departments that share one tax category apart', async () => {
    // «Refrescos y alcohol» and «Droguería» are both 21%. Keyed by `tax_category_key` they would
    // collapse into a single button and the receipt would name the wrong family.
    install(GROCERY);
    const btns = await openSheet(await mount());
    const both = labels(btns).filter((t) => t.includes('Refrescos') || t.includes('Droguería'));

    expect(both, 'both 21% departments survive as their own button').toHaveLength(2);
  });
});

describe('the line it adds', () => {
  async function sell(el: Pos, deptKey: string, euros: string) {
    el.openDept = deptKey;
    el.openAmount = euros;
    await el.addOpenPrice();
    await el.updateComplete;
  }

  it('freezes the DEPARTMENT name and its tax category on the gated command', async () => {
    install(GROCERY);
    const el = await mount();
    await sell(el, 'd-veg', '3.40');

    const [add] = commands.filter((c) => c.name === 'sales.order.add_open_line');
    expect(add, 'it still travels on its own gated command (sales#63)').toBeDefined();
    expect(add.params).toMatchObject({
      unit_price: 340,
      tax_category_key: 'product.super_reduced',
      product_name: 'Frutas y verduras',
    });
    expect(add.params.product_id, 'no catalogue product backs a free line').toBeNull();
  });

  it('tells the two 21% departments apart on the receipt', async () => {
    install(GROCERY);
    const el = await mount();
    await sell(el, 'd-clean', '2.00');

    const [add] = commands.filter((c) => c.name === 'sales.order.add_open_line');
    expect(add.params.product_name, 'the shop sold household goods, not soft drinks').toBe('Droguería');
    expect(add.params.tax_category_key).toBe('product.generic');
  });
});

describe('no regression: a hub that defined no department behaves exactly as before', () => {
  it('falls back to the ACTIVE tax categories', async () => {
    install([]);
    const txt = labels(await openSheet(await mount()));

    expect(txt.length, 'the six seeded categories are still the departments').toBe(6);
    expect(txt.join(' | ')).toMatch(/Restaurant/i);
  });

  it('and the fallback keys stay the tax category, so the old sale path is untouched', async () => {
    install([]);
    const el = await mount();
    el.openDept = 'product.generic';
    el.openAmount = '5';
    await el.addOpenPrice();
    await el.updateComplete;

    const [add] = commands.filter((c) => c.name === 'sales.order.add_open_line');
    expect(add.params.tax_category_key).toBe('product.generic');
  });

  it('an INACTIVE tax category is still not offered', async () => {
    commands = [];
    installPosDouble({
      rules: RULES,
      departments: [],
      taxCategories: [...SEEDED_TAX_CATS, { key: 'old.zero', name: 'Retirada', is_active: 0 }],
      command: async () => ({ rows: [] }),
    });
    const txt = labels(await openSheet(await mount())).join(' | ');

    expect(txt).not.toMatch(/Retirada/);
  });

  it('a hub whose `sales` app predates the table (the read fails) still sells by department', async () => {
    // The till must not lose the open-price flow because one optional read broke: the fallback is
    // the same one an empty list takes.
    commands = [];
    installPosDouble({
      rules: RULES,
      taxCategories: SEEDED_TAX_CATS,
      failing: { 'sales.departments.list': 'unknown_query' },
      command: async () => ({ rows: [] }),
    });
    const btns = await openSheet(await mount());

    expect(btns.length, 'it degrades to the tax catalogue, never to an empty sheet').toBe(6);
  });
});

describe('what the business reads is translated (ADR-0055)', () => {
  it('the Spanish catalogue names the departments screen', () => {
    const ui = (esCatalog as { ui: Record<string, string> }).ui;
    expect(ui.departmentsTitle, 'falta el título de la pantalla de departamentos').toBeTruthy();
    expect(ui.departmentsEmpty, 'falta el vacío de la pantalla de departamentos').toBeTruthy();
    expect(ui.departmentName, 'falta la etiqueta del nombre').toBeTruthy();
    expect(ui.departmentTaxCategory, 'falta la etiqueta de la categoría fiscal').toBeTruthy();
  });
});
