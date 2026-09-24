// hub#1935 — a business that files with the tax authority for real does not charge a ticket that
// will never get there.
//
// Ioan's rule of 2026-09-19: every ticket has to REACH the AEAT. With the AEAT down the till keeps
// charging (the road exists; the contingency queue files later). What must not exist is a sale
// nobody will ever file: a live hub on ERPlora's road whose representation grant is not approved,
// or whose secure connection to ERPlora is gone.
//
// The AUTHORITY is the hub: its dispatcher refuses the sale with a stable code
// (`fiscal.no_representation_grant` / `fiscal.gateway_not_enrolled`) before anything is written.
// What this screen owes is saying it BEFORE the cashier charges — a card can be run through a
// separate terminal before «Cobrar» is pressed — and sending the owner to where it is fixed. Both
// facts come from the CORE query `hub.fiscal.transmission`, the same rule the dispatcher uses, so
// `sales` never names the fiscal module and never re-derives the rule.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';
import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];
const FIX_ROUTE = '/m/verifactu/config';

let notices: { type: string; message: string }[] = [];
let refuseWith = '';

class FakeErploraError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}

/** What `hub.fiscal.transmission` answers: `blocked` is the code, `''` = the road exists. */
function installSdk(road: { blocked?: string; fix?: string; expiresAt?: string } | 'fails' | 'absent' = {}) {
  notices = [];
  refuseWith = '';
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    fiscalRoad: road === 'absent'
      ? []
      : () => {
        if (road === 'fails') throw new FakeErploraError('db', 'the read failed');
        return [{
          transmission_route: 'delegated',
          representation_status: road.blocked ? 'absent' : 'vigente',
          representation_at: '',
          filing_blocked: road.blocked ?? '',
          filing_fix_route: road.fix ?? FIX_ROUTE,
          own_certificate_expires_at: road.expiresAt ?? '',
        }];
      },
    notify: (n: { type: string; message: string }) => { notices.push(n); },
    command: async (name: string) => {
      if (name === 'sales.complete_sale' && refuseWith) {
        throw new FakeErploraError(refuseWith, 'the operation could not be completed');
      }
      return { ok: true, new_ids: ['ord-1', 'line-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);

async function withLine(): Promise<Pos> {
  const el = await mount();
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  return el;
}

beforeEach(() => { installSdk(); });

describe('1 · a hub that cannot file says so AT MOUNT, with the cause', () => {
  it('no approved grant → an alert naming the grant', async () => {
    installSdk({ blocked: 'fiscal.no_representation_grant' });
    const el = await mount();

    const notice = $(el, '.fiscal-road-notice');
    expect(notice, 'the till looked healthy until the sale was refused').toBeTruthy();
    expect(notice!.getAttribute('role'), 'it is not decoration: nothing can be charged').toBe('alert');
    expect(notice!.textContent).toContain('ui.fiscalRoadNoGrant');
  });

  it('no secure connection → an alert naming the connection', async () => {
    installSdk({ blocked: 'fiscal.gateway_not_enrolled' });
    const el = await mount();
    expect($(el, '.fiscal-road-notice')!.textContent).toContain('ui.fiscalRoadNoConnection');
  });

  it('a cause this screen does not know yet still blocks, with the generic sentence', async () => {
    installSdk({ blocked: 'fiscal.some_future_cause' });
    const el = await mount();
    expect($(el, '.fiscal-road-notice')!.textContent).toContain('ui.fiscalRoadBlocked');
  });

  it('with the road in place nothing is said', async () => {
    const el = await mount();
    expect($(el, '.fiscal-road-notice')).toBeFalsy();
  });

  it('a hub that does not answer the read sells exactly as before (best-effort, like the limits)', async () => {
    installSdk('fails');
    const el = await mount();
    expect($(el, '.fiscal-road-notice')).toBeFalsy();
    installSdk('absent');
    const again = await mount();
    expect($(again, '.fiscal-road-notice')).toBeFalsy();
  });
});

describe('2 · «Cobrar» is blocked, and the tap ANSWERS (never a native disabled — sales#58)', () => {
  it('Charge is aria-disabled, the sheet does not open, and the cause is told', async () => {
    installSdk({ blocked: 'fiscal.no_representation_grant' });
    const el = await withLine();

    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
    expect(charge.getAttribute('aria-disabled')).toBe('true');

    charge.click();
    await el.updateComplete;

    expect($(el, '.sheet'), 'no payment may be started with no road to the tax authority').toBeFalsy();
    expect(notices.map((n) => n.message)).toContain('ui.fiscalRoadNoGrant');
  });

  it('with the road in place Charge opens the sheet as always', async () => {
    const el = await withLine();
    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.getAttribute('aria-disabled')).toBeNull();
    charge.click();
    await el.updateComplete;
    expect($(el, '.sheet')).toBeTruthy();
  });
});

describe('3 · it sends whoever can fix it to where it is fixed', () => {
  it('the notice carries a link to the route the core answered', async () => {
    installSdk({ blocked: 'fiscal.no_representation_grant', fix: FIX_ROUTE });
    const el = await mount();
    const fix = $(el, '[data-testid="pos-fiscal-road-fix"]');
    expect(fix, 'the owner has to be able to get there from the till').toBeTruthy();

    let popped = false;
    const onPop = () => { popped = true; };
    window.addEventListener('popstate', onPop);
    fix!.click();
    window.removeEventListener('popstate', onPop);

    expect(window.location.pathname).toBe(FIX_ROUTE);
    expect(popped, 'the shell router only moves on popstate').toBe(true);
  });

  it('no fix route → the cause is still said, with no dead link', async () => {
    installSdk({ blocked: 'fiscal.no_representation_grant', fix: '' });
    const el = await mount();
    expect($(el, '.fiscal-road-notice')).toBeTruthy();
    expect($(el, '[data-testid="pos-fiscal-road-fix"]')).toBeFalsy();
  });
});

describe('4 · the road breaks AFTER the till opened: the server refusal is told the same way', () => {
  it('the refused checkout says the cause, and the page notice appears for the next sale', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    refuseWith = 'fiscal.gateway_not_enrolled';

    await tenderExactCash(el);
    await el.confirm();
    await el.updateComplete;

    expect($(el, '.sheet .pay-err')?.textContent).toContain('ui.fiscalRoadNoConnection');
    // The sheet does not invite a retry the hub will refuse again: its Charge is blocked, and says why.
    const sheetCharge = $(el, '.sheet-foot ion-button.charge');
    expect(sheetCharge?.getAttribute('aria-disabled')).toBe('true');
    expect(sheetCharge?.textContent).toContain('ui.fiscalRoadShort');
    $(el, '.sheet .x')!.click();
    await el.updateComplete;
    expect($(el, '.fiscal-road-notice')?.textContent, 'the next sale must not be tried blind')
      .toContain('ui.fiscalRoadNoConnection');
  });
});

describe('5 · every sentence exists in the source language and in Spanish', () => {
  it('en + es', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const key of [
      'fiscalRoadNoGrant', 'fiscalRoadNoConnection', 'fiscalRoadBlocked', 'fiscalRoadShort', 'fiscalRoadFix',
      'fiscalRoadOwnCertificateExpired', 'fiscalCertificateExpiring', 'fiscalCertificateExpiringOneDay',
      'fiscalCertificateExpiringWithinADay', 'fiscalCertificateRenew',
    ]) {
      expect(en[key], `en.${key}`).toBeTruthy();
      expect(es[key], `es.${key}`).toBeTruthy();
      expect(es[key], `es.${key} is translated, not copied`).not.toBe(en[key]);
    }
  });
});

// hub#1940 — the business's own certificate expires. The hub refuses the sale once it has
// (`fiscal.own_certificate_expired`); the till says it with its own sentence, and warns BEFORE.
describe('6 · the own certificate: blocked once expired, warned before', () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  it('expired → the alert names the certificate, and Charge is blocked', async () => {
    installSdk({ blocked: 'fiscal.own_certificate_expired' });
    const el = await withLine();

    expect($(el, '.fiscal-road-notice')!.textContent).toContain('ui.fiscalRoadOwnCertificateExpired');
    expect($(el, '.foot-actions ion-button.charge')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('the refused checkout names it too, and blocks the next sale', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    refuseWith = 'fiscal.own_certificate_expired';

    await tenderExactCash(el);
    await el.confirm();
    await el.updateComplete;

    expect($(el, '.sheet .pay-err')?.textContent).toContain('ui.fiscalRoadOwnCertificateExpired');
    expect($(el, '.sheet-foot ion-button.charge')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('about to expire → a warning with the days left, and the till still charges', async () => {
    installSdk({ expiresAt: inDays(5) });
    const el = await withLine();

    const warning = $(el, '[data-testid="pos-fiscal-certificate-expiring"]');
    expect(warning, 'the owner learns before the morning it stops charging').toBeTruthy();
    expect(warning!.getAttribute('role'), 'a warning, not an alert: nothing is blocked yet').toBe('status');
    expect(warning!.textContent).toContain('ui.fiscalCertificateExpiring');
    expect($(el, '[data-testid="pos-fiscal-certificate-renew"]'), 'it links to where it is renewed').toBeTruthy();
    expect($(el, '.foot-actions ion-button.charge')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('one day left, or less, says so without a broken plural', async () => {
    installSdk({ expiresAt: inDays(1.5) });
    const one = await mount();
    expect($(one, '[data-testid="pos-fiscal-certificate-expiring"]')!.textContent).toContain('ui.fiscalCertificateExpiringOneDay');

    installSdk({ expiresAt: inDays(0.5) });
    const hours = await mount();
    expect($(hours, '[data-testid="pos-fiscal-certificate-expiring"]')!.textContent).toContain('ui.fiscalCertificateExpiringWithinADay');
  });

  it('far from expiring, or on ERPlora\'s road (no date) → nothing is said', async () => {
    installSdk({ expiresAt: inDays(90) });
    const far = await mount();
    expect($(far, '[data-testid="pos-fiscal-certificate-expiring"]')).toBeFalsy();

    installSdk({ expiresAt: '' });
    const none = await mount();
    expect($(none, '[data-testid="pos-fiscal-certificate-expiring"]')).toBeFalsy();
  });
});
