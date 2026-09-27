// The «Total» range filter of the sales list filters in the unit the column shows (sales#428, pm#498).
//
// `sales_sale.total` is an INTEGER in the minor unit (cents in EUR, ADR-0123) and the dispatcher
// compares the `range` filter against that integer. The column paints it as money of the hub
// («12,10 €»), so the person types «12» meaning twelve euros — and the screen sent `12` as is:
// «Total from 12» let a 0,13 € ticket through and «to 50» hid a 1,00 € one.
//
// What the table types (major unit) is scaled to the minor unit with the hub's currency decimals
// before the list is asked for; the edges of every other column travel untouched.
import { beforeEach, describe, expect, it } from 'vitest';
import { buildListParams } from '@erplora/module-sdk';
import { installErploraDouble } from '../../test/erplora-double';
import './erp-sales-list';

/** The hub's business day: the list opens on «today», so every page carries this `erp_date`. */
const HUB_DAY = '2031-01-15';
const TODAY = { erp_date: { from: HUB_DAY, to: HUB_DAY } };

/** The `filters` of every page the screen asked the hub for, in call order. */
const asked: Array<Record<string, unknown>> = [];

/** The shared double with the reads this view makes, in a hub whose currency has `decimals`. */
function install(decimals: number): void {
  installErploraDouble({
    queries: {
      'sales.list': (params) => {
        asked.push(structuredClone((params?.filters as Record<string, unknown>) ?? {}));
        return [];
      },
      'sales.stats': [],
      'sales.payment_methods': [],
      'sales.business_day': [{ today: HUB_DAY }],
    },
    formatMoney: (minor: number) => `MONEY(${minor})`,
    extra: { currencyDecimals: decimals },
  });
}

beforeEach(() => {
  document.body.replaceChildren();
  asked.length = 0;
  install(2);
});

type Mounted = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };

async function settle(el: Mounted): Promise<void> {
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}

async function mount(): Promise<Mounted> {
  const el = document.createElement('erp-sales-list') as Mounted;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** Fires what `ok-data-table` emits when one edge of a filter is typed. */
async function type(el: Mounted, col: string, value: unknown): Promise<Record<string, unknown>> {
  el.shadowRoot
    .querySelector('ok-data-table')!
    .dispatchEvent(new CustomEvent('filterChange', { detail: { col, value } }));
  await settle(el);
  return asked[asked.length - 1];
}

describe('«Total» range filter compares in the unit the column shows (sales#428)', () => {
  it('«from 12» asks for 12,00 € (1200 cents), not 12 cents', async () => {
    const el = await mount();
    expect(await type(el, 'total', { from: 12 })).toEqual({ ...TODAY, total: { from: 1200 } });
  });

  it('«to 50» keeps the other edge and asks for 5000 cents, so a 1 € ticket is not hidden', async () => {
    const el = await mount();
    await type(el, 'total', { from: 12 });
    expect(await type(el, 'total', { to: 50 })).toEqual({ ...TODAY, total: { from: 1200, to: 5000 } });
  });

  it('a decimal amount is rounded to the minor unit (12.10 → 1210, never 1209)', async () => {
    const el = await mount();
    expect(await type(el, 'total', { from: 12.1 })).toEqual({ ...TODAY, total: { from: 1210 } });
    expect(await type(el, 'total', { to: 0.29 })).toEqual({ ...TODAY, total: { from: 1210, to: 29 } });
  });

  it('the inline control emits text: «12.5» and «12,5» both mean 12,50 €', async () => {
    const el = await mount();
    expect(await type(el, 'total', { from: '12.5' })).toEqual({ ...TODAY, total: { from: 1250 } });
    expect(await type(el, 'total', { from: '12,5' })).toEqual({ ...TODAY, total: { from: 1250 } });
  });

  it('uses the scale of the hub currency: 0 decimals (JPY) sends the amount as is, 3 (KWD) ×1000', async () => {
    install(0);
    const jpy = await mount();
    expect(await type(jpy, 'total', { from: 1999 })).toEqual({ ...TODAY, total: { from: 1999 } });
    jpy.remove();
    install(3);
    const kwd = await mount();
    expect(await type(kwd, 'total', { from: 1.5 })).toEqual({ ...TODAY, total: { from: 1500 } });
  });

  it('clearing an edge drops it instead of filtering «from 0»', async () => {
    const el = await mount();
    await type(el, 'total', { from: 12 });
    await type(el, 'total', { to: 50 });
    expect(await type(el, 'total', { from: '' })).toEqual({ ...TODAY, total: { to: 5000 } });
    expect(await type(el, 'total', { to: '' })).toEqual(TODAY);
  });

  it('text that is not a number is not turned into «from 0»', async () => {
    // Judged on what the hub RECEIVES (`buildListParams`, what the real `queryPage` sends): the
    // edge that is not a number travels as nothing, never as 0, and the day filter stays.
    const el = await mount();
    const onlyToday = { f_erp_date_from: HUB_DAY, f_erp_date_to: HUB_DAY };
    expect(buildListParams({ filters: await type(el, 'total', { from: 'abc' }) })).toEqual(onlyToday);
    expect(buildListParams({ filters: await type(el, 'total', { to: '   ' }) })).toEqual(onlyToday);
  });

  it('a cleared filter (null) clears it, never a crash', async () => {
    const el = await mount();
    await type(el, 'total', { from: 12 });
    expect(await type(el, 'total', null)).toEqual(TODAY);
  });

  it('typed in the real Filters panel: asks for cents and the field still shows what was typed', async () => {
    const el = await mount();
    type Table = HTMLElement & { open(panel: 'filters'): void; shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };
    const table = el.shadowRoot.querySelector('ok-data-table') as Table;
    table.open('filters');
    await table.updateComplete;
    const fromOfTotal = (): HTMLInputElement => {
      const label = [...table.shadowRoot.querySelectorAll('.flabel')].find((l) => l.textContent === 'ui.colTotal');
      return label!.parentElement!.querySelector('ion-input') as unknown as HTMLInputElement;
    };
    fromOfTotal().value = '12';
    fromOfTotal().dispatchEvent(new CustomEvent('ionInput', { bubbles: true, composed: true }));
    await settle(el);
    await table.updateComplete;
    expect(asked[asked.length - 1]).toEqual({ ...TODAY, total: { from: 1200 } });
    // The cents only travel to the hub: the field keeps «12», never «1200».
    expect(String(fromOfTotal().value)).toBe('12');
  });

  it('other columns travel untouched: the date range stays ISO days and the status the value picked', async () => {
    const el = await mount();
    expect(await type(el, 'created_at', { from: '2031-01-01' })).toEqual({ erp_date: { from: '2031-01-01', to: HUB_DAY } });
    expect(await type(el, 'status', 'completed')).toEqual({ erp_date: { from: '2031-01-01', to: HUB_DAY }, status: 'completed' });
  });
});
