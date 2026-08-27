// sales#149 — the MANAGER has to learn that the catalogue is half configured BEFORE the shift,
// not when a cashier taps a tile with a customer waiting.
//
// sales#74/#58 fixed the cashier's half: a product the sale cannot charge is painted blocked and
// answers the tap with the reason. That is tile by tile, on demand, and by construction nobody
// sees the whole picture — a blueprint (or a CSV import) that leaves 40 services without
// `tax_category_key` opens the till looking perfectly normal.
//
// So the sale view states the AGGREGATE once, when it loads: how many catalogue lines are blocked,
// and the way to the screen that fixes them (`inventory` products, which is a hard `depends_on` of
// this module, so the link can never point at something that is not installed).
//
// Three things this must NOT be:
//   - a per-tile alarm (that is already there, and repeating it is noise);
//   - a modal (it interrupts a till that is about to serve, and the market does not do it either:
//     Odoo and WooCommerce simply hide the broken article, Square and Toast paint it on the tile);
//   - an alarm for someone who cannot act on it — a cashier has no `inventory.change_product`.
//
// The assertions below are on FORM (the i18n key and the count that travels with it), never on
// prose: the wording lives in `locales/` and changing it must not turn this file red.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

/** Two sellable, three blocked: one without a tax category and two whose category resolves no rule. */
const PRODUCTS = [
  { id: 'p-ok', name: 'Café', price: 150, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-ok2', name: 'Té', price: 130, is_active: 1, tax_category_key: 'product.generic' },
  { id: 'p-nocat', name: 'Croissant', price: 120, is_active: 1 },
  { id: 'p-norule', name: 'Vino', price: 900, is_active: 1, tax_category_key: 'restaurant.drink' },
  { id: 'p-norule2', name: 'Cava', price: 1200, is_active: 1, tax_category_key: 'restaurant.drink' },
];

const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

interface SdkOptions {
  /** Rows served as `inventory.products.list`. */
  products?: unknown[];
  /** `undefined` = a shell that exposes no permission channel at all (preview, older shell). */
  can?: (perm: string) => boolean;
}

/** `t` renders `key(count=N)`: the assertions can pin the key AND the number without the prose. */
function renderKey(key: string, params?: Record<string, unknown>): string {
  if (!params || !Object.keys(params).length) return key;
  const args = Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',');
  return `${key}(${args})`;
}

function installSdk(opts: SdkOptions = {}) {
  const products = opts.products ?? PRODUCTS;
  installPosDouble({
    products,
    rules: RULES,
    t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => renderKey(key, params),
    // `undefined` = a shell that exposes no permission channel at all (preview, older shell).
    ...(opts.can ? { hasPermission: opts.can } : { without: ['hasPermission' as const] }),
  });
}

interface MountedPos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
}

async function mount(): Promise<MountedPos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as MountedPos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as MountedPos).updateComplete;
  return el as unknown as MountedPos;
}

const summaryOf = (el: MountedPos) =>
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="catalog-blocked-summary"]');

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState({}, '', '/m/sales/pos');
});

describe('the sale view states, ONCE, how much of the catalogue cannot be charged (sales#149)', () => {
  it('counts every blocked line of the catalogue and says the number', async () => {
    installSdk({ can: () => true });
    const el = await mount();

    const summary = summaryOf(el);
    expect(summary, 'no aggregate warning painted with a half configured catalogue').not.toBeNull();
    // Three blocked: no category (1) + category with no rule (2). The count is the whole
    // catalogue, NOT the active category tab: the claim is about the business, not about a tab.
    expect(summary!.textContent).toContain('ui.catalogBlocked(count=3)');
  });

  it('says it in the singular when only one line is blocked', async () => {
    installSdk({
      can: () => true,
      products: [PRODUCTS[0], PRODUCTS[2]],
    });
    const el = await mount();

    const text = summaryOf(el)!.textContent ?? '';
    expect(text).toContain('ui.catalogBlockedOne');
    expect(text).not.toContain('ui.catalogBlocked(');
  });

  it('paints NOTHING when the whole catalogue can be charged', async () => {
    installSdk({ can: () => true, products: [PRODUCTS[0], PRODUCTS[1]] });
    const el = await mount();

    expect(summaryOf(el), 'a warning with nothing to warn about trains people to ignore it').toBeNull();
  });

  it('offers the way to the screen that fixes it, and going there does not reload the app', async () => {
    installSdk({ can: () => true });
    const el = await mount();

    const fix = summaryOf(el)!.querySelector<HTMLElement>('[data-testid="catalog-blocked-fix"]');
    expect(fix, 'a count with no way to act on it is a complaint, not a warning').not.toBeNull();

    let popped = false;
    const onPop = () => { popped = true; };
    window.addEventListener('popstate', onPop);
    fix!.click();
    await new Promise((r) => setTimeout(r, 0));
    window.removeEventListener('popstate', onPop);

    // `inventory` is a hard `depends_on` of `sales`, so this route always exists.
    expect(window.location.pathname).toBe('/m/inventory/products');
    expect(popped, 'the shell router listens to popstate; without it the screen never changes').toBe(true);
  });

  it('stays quiet for a session that cannot fix it (a cashier has no inventory.change_product)', async () => {
    installSdk({ can: (perm: string) => perm !== 'inventory.change_product' });
    const el = await mount();

    expect(summaryOf(el)).toBeNull();
  });

  it('still warns when the shell exposes NO permission channel: unknown is not "no"', async () => {
    // A preview or an older shell answers nothing. Failing closed there would silently remove the
    // only place the business learns about this — and the notice costs a cashier nothing.
    installSdk();
    const el = await mount();

    expect(summaryOf(el)).not.toBeNull();
  });
});
