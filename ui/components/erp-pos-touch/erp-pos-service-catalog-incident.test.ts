// sales#273 — a `services` that IS installed and whose catalogue read FAILS must be said out loud.
//
// This is the other half of sales#25. That issue took the five reads against `inventory` and
// `taxes` off `.catch(() => [])`, because one line cannot answer two different facts with the same
// empty catalogue. The reads against `services` never got the same treatment: they still go
// through `optionalReadAll`, whose `catch { return undefined }` IS that `.catch(() => [])` — so a
// salon whose service catalogue breaks gets a till that is indistinguishable from a hub that never
// installed `services` at all.
//
// What that looks like on the floor is the whole of sales#273: the grid shows the 22 shelf
// products, searching «Corte» answers «no products», the service family tabs stand there counting
// 0 — and NOT ONE WORD says why, so the business concludes a haircut cannot be charged. The two
// reads are independent (`services.services.list` and `services.categories.list`), so the tabs
// surviving while the catalogue dies is not a hypothetical shape: it is one read failing.
//
// ADR-0127 is the line this file must NOT cross: `services` is not in `depends_on`, so its ABSENCE
// stays legitimate and silent. Absence degrades; a failure is an incident. The controls below pin
// both directions, because a fix that alarms on absence would fire on every hub that simply does
// not sell services — and would be trained away by the first week of noise.
//
// Assertions are on FORM — the i18n key and the app it names — never on prose (ADR-0055).
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const PRODUCTS = [{ id: 'p-1', name: 'Champú', price: 850, is_active: 1, tax_category_key: 'product.generic' }];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];
const SERVICES = [{ id: 's-1', name: 'Corte', price: 1500, category_id: 'c-1', tax_category_key: 'product.generic' }];
/** The salon's service families — the tabs the QA saw standing at 0. */
const SERVICE_CATS = [{ id: 'c-1', name: 'Corte y peinado' }, { id: 'c-2', name: 'Color' }];

/** App NAMES are answered like the real catalogue does; everything else echoes its key, so the
 *  assertions pin form, not prose. */
const APP_NAMES: Record<string, string> = {
  'ui.appInventory': 'Inventory',
  'ui.appTaxes': 'Taxes',
  'ui.appServices': 'Services',
};

function renderKey(key: string, params?: Record<string, unknown>): string {
  if (APP_NAMES[key]) return APP_NAMES[key];
  if (!params || !Object.keys(params).length) return key;
  return `${key}(${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')})`;
}

interface SdkOptions {
  failing?: Record<string, string | undefined>;
  absentModules?: string[];
  settings?: Record<string, unknown> | null;
  /** Omitted = the salon HAS its services; the tests that break a read still declare them, so the
   *  failure is the only reason the grid is empty. */
  services?: unknown;
  serviceCategories?: unknown;
}

function installSdk(opts: SdkOptions = {}) {
  installPosDouble({
    products: PRODUCTS,
    rules: RULES,
    taxCategories: TAX_CATS,
    services: opts.services === undefined ? SERVICES : opts.services,
    serviceCategories: opts.serviceCategories === undefined ? SERVICE_CATS : opts.serviceCategories,
    ...(opts.settings !== undefined ? { settings: opts.settings } : {}),
    ...(opts.absentModules ? { absentModules: opts.absentModules } : {}),
    failing: opts.failing,
    t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => renderKey(key, params),
  });
}

interface MountedPos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  products: { id: string; is_service?: boolean }[];
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

const notices = (el: MountedPos) =>
  [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-dependency-read-failed"]')];
const noticeText = (el: MountedPos) => notices(el).map((n) => n.textContent ?? '').join(' | ');

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState({}, '', '/m/sales/pos');
});

describe('a `services` that BREAKS is an incident, not an absence', () => {
  it('names the app when the service catalogue read fails', async () => {
    installSdk({ failing: { 'services.services.list': 'db_error' } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Services)');
  });

  it('a refusal that is NOT absence (permission, dead handler) is an incident too', async () => {
    installSdk({ failing: { 'services.services.list': 'permission_denied' } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Services)');
  });

  it('a rejection with no code at all is still an incident', async () => {
    installSdk({ failing: { 'services.services.list': undefined } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Services)');
  });

  it('the service FAMILIES read counts as well, and names `services`', async () => {
    installSdk({ failing: { 'services.categories.list': 'db_error' } });
    const el = await mount();
    expect(noticeText(el)).toContain('ui.appCatalogUnavailable(app=Services)');
  });

  it('says the app ONCE even when both of its reads break', async () => {
    installSdk({ failing: { 'services.services.list': 'db_error', 'services.categories.list': 'db_error' } });
    const el = await mount();
    expect(notices(el).length, 'two warnings for one broken app is noise, not information').toBe(1);
  });
});

describe('sales#273 — the salon shape: tabs alive, catalogue dead', () => {
  it('the till says WHY the haircut is missing instead of showing a silent shelf-only grid', async () => {
    // Exactly what the QA hit: the families answered, the catalogue did not.
    installSdk({ failing: { 'services.services.list': 'db_error' } });
    const el = await mount();
    expect(el.products.some((p) => p.is_service), 'the failure is what empties the grid').toBe(false);
    expect(
      noticeText(el),
      'a grid with no service and no explanation is how a salon concludes it cannot charge a haircut',
    ).toContain('ui.appCatalogUnavailable(app=Services)');
  });
});

describe('ADR-0127 — legitimate ABSENCE still degrades in silence', () => {
  it('a hub without `services` gets no notice at all', async () => {
    installSdk({ absentModules: ['services'] });
    const el = await mount();
    expect(
      noticeText(el),
      'alarming on every hub that does not sell services is how a notice gets trained away',
    ).not.toContain('app=Services');
  });

  it('a shop that switched the service source OFF is not alarmed either', async () => {
    // `sync_services: 0` means the reads never happen, so there is no incident to report.
    installSdk({ settings: { sync_products: 1, sync_services: 0 } });
    const el = await mount();
    expect(noticeText(el)).not.toContain('app=Services');
  });

  it('a healthy `services` shows its catalogue and says nothing', async () => {
    installSdk();
    const el = await mount();
    expect(el.products.map((p) => p.id)).toContain('s-1');
    expect(noticeText(el)).not.toContain('app=Services');
  });
});
