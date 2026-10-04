// A list that could not load must not read «No …» + «0 records» (pm#533, hub#2328).
//
// The shell's `<ok-data-table>` (OutfitKit ≥ 0.1.113) paints a failed load itself: «could not
// load», the reason and a Retry button. Each list of this module (sales history, POS departments,
// quick notes) hands it its controller's `error` and reloads on its `retry` event — together with
// whatever the screen reads next to the list (the KPI strip, the payment-method filter, the VAT
// picker), which failed for the same reason. Its own red notice goes, because it would say the same
// thing twice. But a module paints with the SHELL's OutfitKit (ADR-0451): on a hub whose table has
// no `error` property the screen's notice is the only place the reason is shown, so it stays.
import './shell-data-table';
import '../components/erp-pos-departments/erp-pos-departments';
import '../components/erp-pos-quick-notes/erp-pos-quick-notes';
import '../components/erp-sales-list/erp-sales-list';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installErploraDouble } from './erplora-double';
import type { ErploraDouble } from './erplora-double';
import { shellTableKnowsErrors } from './shell-data-table';

/** The code the SDK's transport rejects with when the hub does not answer (hub#782). */
const HUB_DOWN = 'server_unavailable';
const HUB_DAY = '2031-01-15';

const STATS = { count: 7, total_revenue: 4200, avg_ticket: 600, tax_total: 0, discount_total: 0, voided_count: 0 };
const SALE = { id: 's1', sale_number: '20310115-0001', created_at: '2031-01-15T10:00:00Z', status: 'completed', total: 600 };

interface Screen {
  tag: string;
  list: string;
  table: string;
  banner: string;
  row: Record<string, unknown>;
  /** What the screen reads next to its list, with what the hub answers once it is back. */
  alongside: Record<string, unknown[]>;
}

const SCREENS: Screen[] = [
  {
    tag: 'erp-pos-departments',
    list: 'sales.departments.list',
    table: 'pos-departments-table',
    banner: 'pos-departments-load-error',
    row: { id: 'd1', name: 'Bebidas', tax_category_key: 'general', sort_order: 1 },
    alongside: {
      'taxes.categories.list': [{ id: 'c1', key: 'general', name: 'General' }],
      'taxes.rules.list': [{ id: 'r1', tax_category_key: 'general', rate_pct: 21 }],
    },
  },
  {
    tag: 'erp-pos-quick-notes',
    list: 'sales.quick_notes.list',
    table: 'pos-quick-notes-table',
    banner: 'pos-quick-notes-load-error',
    row: { id: 'n1', text: 'Sin hielo', sort_order: 1 },
    alongside: {},
  },
  {
    tag: 'erp-sales-list',
    list: 'sales.list',
    table: 'sales-table',
    banner: 'sales-list-error',
    row: SALE,
    alongside: {
      'sales.stats': [STATS],
      'sales.payment_methods': [{ id: 'm1', key: 'cash', name: 'Cash' }],
      'sales.business_day': [{ today: HUB_DAY }],
    },
  },
];

type Mounted = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };

let double: ErploraDouble;

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

const readsOf = (name: string): number => double.reads.filter((r) => r.name === name).length;

/** Installs a hub that does not answer: the list and everything read with it fail alike. */
function hubDown(screen: Screen, failing: string[] = [screen.list, ...Object.keys(screen.alongside)]): void {
  double = installErploraDouble({
    queries: { [screen.list]: [screen.row], ...screen.alongside },
    failing: Object.fromEntries(failing.map((q) => [q, HUB_DOWN])),
    // The sale document is an optional app of this hub (ADR-0127); nothing opens it here.
    absent: ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'],
  });
}

async function mount(screen: Screen): Promise<{ el: Mounted; table: HTMLElement }> {
  const el = document.createElement(screen.tag) as Mounted;
  document.body.appendChild(el);
  await vi.waitFor(() => {
    if (readsOf(screen.list) === 0) throw new Error('the list has not asked for its page yet');
  });
  for (let i = 0; i < 3; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
  const table = el.shadowRoot.querySelector<HTMLElement>(`ok-data-table[testid="${screen.table}"]`);
  expect(table, `${screen.tag} paints its table`).toBeTruthy();
  return { el, table: table! };
}

const tableError = (table: HTMLElement): unknown => (table as unknown as { error?: unknown }).error;

/** The reason the screen's list controller holds. Its WORDING is the SDK's (ADR-0055): under a
 *  table that paints its own heading, a hub that did not answer reads a short sentence that does
 *  not repeat the heading (hub#2443) and names no query, so the test pins where the reason goes,
 *  not what it says (sales#497). */
const controllerError = (el: Mounted): unknown => (el as unknown as { ctrl?: { error?: unknown } }).ctrl?.error;

/** Every notice on the PAGE — a notice inside the closed «new» panel is not seen (rv-appointments-227). */
function pageNotices(el: Mounted): Element[] {
  return [...el.shadowRoot.querySelectorAll('ok-inline-feedback')].filter((n) => !n.closest('[slot="create"]'));
}

/** What a person has already typed in the «new» form when they press Retry. A Retry that went
 *  through the screen's own save would send it; with the form EMPTY the save's own validation stops
 *  it before any command, and `commands == []` would pass anyway (rv-verifactu-159). */
const ARMED: Record<string, Record<string, unknown>> = {
  'erp-pos-departments': { newName: 'Bebidas', newTaxCategoryKey: 'general' },
  'erp-pos-quick-notes': { newText: 'Sin hielo' },
};

/** Presses the table's Retry with the hub back, and waits for the list to be read and painted. */
async function retry(screen: Screen, el: Mounted, table: HTMLElement): Promise<void> {
  Object.assign(el, ARMED[screen.tag] ?? {});
  await el.updateComplete;
  const before = readsOf(screen.list);
  double.setQuery(screen.list, [screen.row]);
  for (const [q, rows] of Object.entries(screen.alongside)) double.setQuery(q, rows);
  table.dispatchEvent(new CustomEvent('retry', { detail: {} }));
  await vi.waitFor(() => {
    if (readsOf(screen.list) === before) throw new Error('Retry did not ask the hub again');
  });
  await vi.waitFor(async () => {
    await el.updateComplete;
    if (tableError(table) !== '') throw new Error('the error is still on the table');
    if ((table as unknown as { rows?: unknown[] }).rows?.length !== 1) throw new Error('the rows are not painted');
  });
  // Retry only reads: it must never repeat a write the person did not ask for (rv-schedules-61).
  expect(double.commands, 'Retry sent a command').toEqual([]);
}

describe.each(SCREENS)('$tag — a list that could not load (pm#533)', (screen) => {
  it('hands the reason to the shell table and paints no notice of its own', async () => {
    shellTableKnowsErrors(true);
    hubDown(screen);
    const { el, table } = await mount(screen);
    const reason = tableError(table);
    expect(typeof reason === 'string' && reason !== '', 'the table got a reason').toBe(true);
    expect(reason, 'the table got the list controller’s reason').toBe(controllerError(el));
    // ANY notice counts, not only the one with the list's testid (rv-schedules-61).
    expect(pageNotices(el).map((n) => n.getAttribute('data-testid')), 'the failure is said twice').toEqual([]);
    expect(el.shadowRoot.textContent, 'another notice repeats the reason').not.toContain(String(reason));
  });

  it('Retry on the table asks the hub again, paints the rows and leaves no notice behind', async () => {
    shellTableKnowsErrors(true);
    hubDown(screen);
    const { el, table } = await mount(screen);
    await retry(screen, el, table);
    await el.updateComplete;
    expect(pageNotices(el).map((n) => n.getAttribute('data-testid'))).toEqual([]);
  });

  it('on a shell whose table cannot paint the error, keeps its own notice with the reason, once', async () => {
    shellTableKnowsErrors(false);
    hubDown(screen);
    const { el } = await mount(screen);
    const node = el.shadowRoot.querySelector(`[data-testid="${screen.banner}"]`);
    expect(node, 'an older hub would show the failure nowhere').toBeTruthy();
    expect(node!.textContent).toContain(screen.list);
    expect(node!.closest('[slot="create"]'), 'the notice sits in the «new» panel').toBeNull();
    expect(pageNotices(el), 'the failure is said more than once').toHaveLength(1);
  });

  it.each(Object.keys(screen.alongside).filter((q) => q !== 'sales.business_day'))(
    'Retry also asks again for %s, read with the list',
    async (query) => {
      shellTableKnowsErrors(true);
      hubDown(screen);
      const { el, table } = await mount(screen);
      expect(readsOf(query), `${query} is read once with the list`).toBe(1);
      await retry(screen, el, table);
      await vi.waitFor(() => {
        if (readsOf(query) < 2) throw new Error(`${query} was not asked again`);
      });
    },
  );
});

describe('departments: the VAT picker comes back with Retry (pm#533)', () => {
  it('after a failed start, Retry fills the picker of the «new department» form', async () => {
    const screen = SCREENS[0];
    shellTableKnowsErrors(true);
    hubDown(screen);
    const { el, table } = await mount(screen);
    const options = () => el.shadowRoot.querySelectorAll('[data-testid="pos-departments-tax-category"] ion-select-option');
    expect(options()).toHaveLength(0);
    await retry(screen, el, table);
    await vi.waitFor(async () => {
      await el.updateComplete;
      if (options().length !== 1) throw new Error('the VAT picker is still empty');
    });
  });
});

describe('sales history: the KPI strip and the payment filter fail with the list (pm#533)', () => {
  const screen = SCREENS[2];
  const kpi = (el: Mounted) => el.shadowRoot.querySelector('[data-testid="sales-kpi-tickets"]')?.textContent?.trim();
  const KPIS = ['tickets', 'revenue', 'avg-ticket', 'tax', 'discounts', 'voided'];
  /** Every figure of the strip, by testid: none of them may read as a real zero when unread. */
  const kpis = (el: Mounted) => KPIS.map((k) => el.shadowRoot.querySelector(`[data-testid="sales-kpi-${k}"]`)?.textContent?.trim());

  it.each([true, false])('the figures say «—», not «0 tickets», when they could not be read (shell table paints errors: %s)', async (knows) => {
    shellTableKnowsErrors(knows);
    hubDown(screen);
    const { el } = await mount(screen);
    expect(kpis(el)).toEqual(KPIS.map(() => '—'));
    expect(el.shadowRoot.querySelector('[data-testid="sales-stats-error"]'), 'the figures repeat the failure').toBeNull();
    expect(el.shadowRoot.querySelector('[data-testid="sales-pay-methods-error"]'), 'the filter repeats the failure').toBeNull();
  });

  it('after Retry the figures are painted and neither of their notices is left', async () => {
    shellTableKnowsErrors(true);
    hubDown(screen);
    const { el, table } = await mount(screen);
    await retry(screen, el, table);
    await vi.waitFor(async () => {
      await el.updateComplete;
      if (kpi(el) !== String(STATS.count)) throw new Error(`the figures are not painted: ${kpi(el)}`);
    });
    expect(el.shadowRoot.querySelector('[data-testid="sales-stats-error"]')).toBeNull();
    expect(el.shadowRoot.querySelector('[data-testid="sales-pay-methods-error"]')).toBeNull();
  });

  it('when only the figures fail, their own notice still says so and they read «—»', async () => {
    shellTableKnowsErrors(true);
    hubDown(screen, ['sales.stats']);
    const { el } = await mount(screen);
    await vi.waitFor(async () => {
      await el.updateComplete;
      if (!el.shadowRoot.querySelector('[data-testid="sales-stats-error"]')) throw new Error('the failed figures say nothing');
    });
    expect(kpis(el)).toEqual(KPIS.map(() => '—'));
  });

  it('when only the payment methods fail, their own notice still says so', async () => {
    shellTableKnowsErrors(true);
    hubDown(screen, ['sales.payment_methods']);
    const { el } = await mount(screen);
    await vi.waitFor(async () => {
      await el.updateComplete;
      if (!el.shadowRoot.querySelector('[data-testid="sales-pay-methods-error"]')) throw new Error('the failed filter says nothing');
    });
  });
});
