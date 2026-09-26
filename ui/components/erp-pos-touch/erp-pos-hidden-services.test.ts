// sales#409 — «Sync services» OFF in a salon: the till has to SAY that the services are hidden.
//
// `sync_services = 0` makes the till skip the service catalogue on purpose (sales#25). But from the
// counter that screen is indistinguishable from the till of a shop that never sold services: no
// haircut in the grid, «No products.» when the receptionist searches «Corte», and not a word about
// a switch. That is what the salon of sales#273 saw and could not get out of.
//
// Square («Item is hidden from POS») and Lightspeed («Display in POS») both say it where the item
// is missing. So the till asks ONE cheap question when the switch is off — does `services` hold a
// sellable catalogue here? (`services.catalog.status`, a single COUNT row) — and, if it does, the
// empty grid and the empty search say the services are hidden, with the way back to the setting
// for whoever can change it.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const SERVICES = [{ id: 's-1', name: 'Corte', price: 1500, tax_category_key: 'product.generic' }];

interface Setup {
  syncServices?: number;
  /** `services.catalog.status`; omitted = `services` is not in this hub. */
  sellable?: number;
  brokenStatus?: boolean;
  canManageSettings?: boolean;
}

let pos: ReturnType<typeof installPosDouble>;

function install({ syncServices = 0, sellable, brokenStatus, canManageSettings = true }: Setup = {}) {
  pos = installPosDouble({
    settings: { sync_products: 1, sync_services: syncServices },
    // `inventory` is here and empty: the salon of sales#273 sells services only.
    products: [],
    forSale: [],
    rules: RULES,
    ...(sellable === undefined && !brokenStatus ? {} : { services: SERVICES, serviceCatalogStatus: [{ sellable_services: sellable ?? 0 }] }),
    ...(brokenStatus ? { failing: { 'services.catalog.status': 'boom' } } : {}),
    hasPermission: (perm?: string) => perm !== 'sales.manage_settings' || canManageSettings,
  });
}

interface MountedPos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  q: string;
}

async function mount(): Promise<MountedPos> {
  const el = document.createElement('erp-pos-touch') as MountedPos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const $ = (el: MountedPos, id: string) => el.shadowRoot.querySelector(`[data-testid="${id}"]`);
/** The notice OUTSIDE the search overlay, i.e. where the grid is. */
const inGrid = (el: MountedPos, id: string) =>
  [...el.shadowRoot.querySelectorAll(`[data-testid="${id}"]`)].find((n) => !n.closest('ok-spotlight-search')) ?? null;
const inSearch = (el: MountedPos, id: string) => el.shadowRoot.querySelector(`ok-spotlight-search [data-testid="${id}"]`);

async function search(el: MountedPos, q: string) {
  el.q = q;
  await el.updateComplete;
}

beforeEach(() => {
  document.body.innerHTML = '';
  pos?.reads.splice(0);
  history.replaceState({}, '', '/m/sales/pos');
});

describe('services installed and hidden by «Sync services» OFF', () => {
  it('the empty grid says the services are hidden, as a status', async () => {
    install({ sellable: 3 });
    const el = await mount();
    const notice = inGrid(el, 'pos-services-hidden');
    expect(notice, 'the grid must say WHY there is no haircut in it').not.toBeNull();
    expect(notice!.getAttribute('role')).toBe('status');
    expect(notice!.textContent).toContain('ui.servicesHidden');
  });

  it('the search with no results says it too', async () => {
    install({ sellable: 3 });
    const el = await mount();
    await search(el, 'Corte');
    expect(inSearch(el, 'pos-services-hidden'), '«No products.» alone is what left the salon stuck').not.toBeNull();
  });

  it('«Show them» takes a manager to the till settings, where the switch lives', async () => {
    install({ sellable: 3 });
    const el = await mount();
    let path = '';
    const onPop = () => { path = location.pathname; };
    window.addEventListener('popstate', onPop);
    try {
      (inGrid(el, 'pos-services-hidden')!.querySelector('[data-testid="pos-services-hidden-show"]') as HTMLElement).click();
    } finally {
      window.removeEventListener('popstate', onPop);
    }
    expect(path).toBe('/m/sales/settings');
  });

  it('a cashier who cannot change the setting gets the reason without a button that would bounce', async () => {
    install({ sellable: 3, canManageSettings: false });
    const el = await mount();
    const notice = inGrid(el, 'pos-services-hidden');
    expect(notice).not.toBeNull();
    expect(notice!.querySelector('[data-testid="pos-services-hidden-show"]')).toBeNull();
  });

  it('asks the cheap status, never the whole service catalogue nobody will see', async () => {
    install({ sellable: 3 });
    await mount();
    const asked = pos.reads.map((r) => r.name);
    expect(asked).toContain('services.catalog.status');
    expect(asked).not.toContain('services.services.list');
  });
});

describe('no notice where nothing is hidden', () => {
  it('without `services` in the hub the till is the plain one', async () => {
    install();
    const el = await mount();
    expect($(el, 'pos-services-hidden')).toBeNull();
    await search(el, 'Corte');
    expect(inSearch(el, 'pos-services-hidden')).toBeNull();
  });

  it('with `services` installed but no sellable service there is nothing hidden', async () => {
    install({ sellable: 0 });
    const el = await mount();
    expect($(el, 'pos-services-hidden')).toBeNull();
  });

  it('with the switch ON the status is not even asked', async () => {
    install({ syncServices: 1, sellable: 3 });
    const el = await mount();
    expect(pos.reads.map((r) => r.name)).not.toContain('services.catalog.status');
    expect($(el, 'pos-services-hidden')).toBeNull();
  });

  it('a status read that fails claims nothing and does not break the till', async () => {
    install({ brokenStatus: true });
    const el = await mount();
    expect($(el, 'pos-services-hidden')).toBeNull();
    expect(el.shadowRoot.querySelector('.grid, .empty'), 'the till still opens').not.toBeNull();
  });
});
