// The STATUS column of the sales list (hub#923, minor defect reported with saas#1460).
//
// The filter dropdown already offered translated labels ("Completada"/"Anulada"), but the CELL had
// no `format`, so every row printed the raw database value — `completed`, in English, on a Spanish
// UI. It is the same list the cashier is sent to when a charge is in doubt, so the one word that
// tells her "this was charged" cannot be jargon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import esCatalog from '../../../locales/es.json';

interface Column {
  key: string;
  format?: (row: Record<string, unknown>) => unknown;
  options?: { value: string; label: string }[];
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async () => [],
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    // Devuelve la traducción REAL del catálogo español: lo que se mide es que la celda deje de
    // enseñar el valor crudo de la base de datos.
    t: (_catalog: unknown, key: string) =>
      key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog) ?? key,
    on: () => () => {},
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
  };
});

async function column(key: string): Promise<Column> {
  await import('./erp-sales-list');
  const el = document.createElement('erp-sales-list');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  const columns = (el as unknown as { columns: Column[] }).columns;
  return columns.find((c) => c.key === key)!;
}
const statusColumn = () => column('status');

describe('sales list — the status column speaks the user language (hub#923)', () => {
  it('renders `completed` translated, not the raw database value', async () => {
    const column = await statusColumn();
    expect(column.format, 'the status cell needs a formatter').toBeTypeOf('function');
    expect(column.format!({ status: 'completed' })).toBe('Completada');
  });

  it('renders `voided` translated too', async () => {
    const column = await statusColumn();
    expect(column.format!({ status: 'voided' })).toBe('Anulada');
  });

  it('an unknown status still shows something, never an empty cell', async () => {
    // A status this build does not know about (a newer module writing `refunded`) must degrade to
    // the raw value: an empty cell would hide the row's state entirely.
    const column = await statusColumn();
    expect(column.format!({ status: 'refunded' })).toBe('refunded');
  });
});

// sales#108 — same list, next column over: the seed stores «Cash»/«Card» (English canonical,
// ADR-0055) and the handler persists that name as data. The CELL translates it; a name the owner
// typed («BBVA TPV») shows as is.
describe('sales list — the payment column speaks the user language (sales#108)', () => {
  it('renders `Cash` as «Efectivo»', async () => {
    const col = await column('payment_method_name');
    expect(col.format!({ payment_method_name: 'Cash' })).toBe('Efectivo');
  });

  it('renders `Card` as «Tarjeta» and keeps a custom name verbatim', async () => {
    const col = await column('payment_method_name');
    expect(col.format!({ payment_method_name: 'Card' })).toBe('Tarjeta');
    expect(col.format!({ payment_method_name: 'BBVA TPV' })).toBe('BBVA TPV');
  });
});

// sales#26 — anular desde el historial: con PERMISO, con MOTIVO obligatorio y con resultado claro.
// Mercado (8 refs en la issue): el reverso se pide desde la venta original, gateado por un permiso
// propio, y el motivo se captura siempre. La lista solo ofrece la acción a quien la tiene; el
// servidor la revalida igual (`sales.void_sale`).
describe('sales list — the void action (sales#26)', () => {
  const sdk = () => (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
  const commands: { name: string; params?: Record<string, unknown> }[] = [];
  const notes: { type: string; message: string }[] = [];

  async function mountList(perms: string[]) {
    commands.length = 0; notes.length = 0;
    sdk().hasPermission = (p: string) => perms.includes(p) || perms.includes('*');
    sdk().command = async (name: string, params?: Record<string, unknown>) => { commands.push({ name, params }); return {}; };
    sdk().notify = (n: { type: string; message: string }) => { notes.push(n); };
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el as unknown as {
      documentActions: { id: string; disabled?: (r: Record<string, unknown>) => boolean }[];
      voidSale(saleId: string, reason: string): Promise<void>;
      updateComplete: Promise<unknown>;
    };
  }

  it('without sales.void_sale the action is not offered at all', async () => {
    const el = await mountList(['sales.view_sale']);
    expect(el.documentActions.map((a) => a.id)).not.toContain('void');
  });

  it('with the permission it is offered, and disabled on a sale that is not completed', async () => {
    const el = await mountList(['sales.void_sale']);
    const act = el.documentActions.find((a) => a.id === 'void');
    expect(act, 'the void action').toBeTruthy();
    expect(act!.disabled!({ status: 'voided' })).toBe(true);
    expect(act!.disabled!({ status: 'completed' })).toBe(false);
  });

  it('runs sales.void with the sale id and the reason, and confirms', async () => {
    const el = await mountList(['sales.void_sale']);
    await el.voidSale('sale-1', 'customer changed their mind');
    expect(commands.find((c) => c.name === 'sales.void')?.params).toEqual({ sale_id: 'sale-1', reason: 'customer changed their mind' });
    expect(notes.some((n) => n.type === 'success')).toBe(true);
  });

  it('a refusal is explained in the user words, by its code', async () => {
    const el = await mountList(['sales.void_sale']);
    sdk().command = async () => { throw new Error('command `sales.void` failed: sales.void_requires_credit_note: …'); };
    await el.voidSale('sale-1', 'x');
    const err = notes.find((n) => n.type === 'error');
    expect(err?.message).toBe('Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla');
  });
});

// sales#27 — the sales history as an OPERATIONAL tool: what a manager opens at the end of the
// day. Odoo and Square open their transaction lists on TODAY with a date filter, show the date and
// time on every row, and the KPIs answer for the same range as the rows. Here: a range segment
// (today · 7 days · 30 days · all) that drives BOTH the list filter (`created_at` range, already a
// server filter) and `sales.stats` (which now takes an optional `date_from`/`date_to`).
describe('sales list — today by default, date/time on the row, KPIs for the same range (sales#27)', () => {
  const sdk = () => (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
  let queries: { name: string; params?: Record<string, unknown> }[] = [];

  async function mountList() {
    queries = [];
    sdk().query = async (name: string, params?: Record<string, unknown>) => {
      queries.push({ name, params });
      if (name === 'sales.stats') return [{ count: 3, total_revenue: 4500, avg_ticket: 1500, tax_total: 780, discount_total: 200, voided_count: 1 }];
      return [];
    };
    sdk().queryPage = async (name: string, params: Record<string, unknown>) => { queries.push({ name, params }); return { rows: [], total: 0 }; };
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el as unknown as {
      shadowRoot: ShadowRoot; updateComplete: Promise<unknown>;
      columns: Column[]; setRange(r: 'today' | '7d' | '30d' | 'all'): Promise<void>; range: string;
    };
  }
  // sales#133 — the day is NOT recomputed here: this asks the component for its OWN range, the
  // same one the screen uses. This helper used to build the day in UTC
  // (`new Date().toISOString().slice(0, 10)`) while `isoDay()` builds it in local time, so the
  // suite went red on its own every night between 00:00 and 02:00 CEST. Two implementations of
  // "what day is today" is exactly where that bug came from — now there is only one.
  const today = async (): Promise<string> => {
    const { rangeBounds } = await import('./erp-sales-list');
    return rangeBounds('today').from!;
  };

  it('shows the date and time of every sale, formatted, not the raw ISO string', async () => {
    const el = await mountList();
    const col = el.columns.find((c) => c.key === 'created_at');
    expect(col, 'a created_at column').toBeTruthy();
    const out = String(col!.format!({ created_at: '2026-08-18T09:05:00+00:00' }));
    expect(out).not.toContain('T09:05');
    expect(out).toMatch(/2026/);
  });

  it('opens on TODAY: the stats and the list are asked for today only', async () => {
    const el = await mountList();
    expect(el.range).toBe('today');
    const day = await today();
    const stats = queries.find((q) => q.name === 'sales.stats');
    expect(stats?.params).toMatchObject({ date_from: day, date_to: day });
    const list = queries.find((q) => q.name === 'sales.list');
    expect(JSON.stringify(list?.params)).toContain(day);
  });

  it('«all» clears the range from both, and the segment is on screen', async () => {
    const el = await mountList();
    expect(el.shadowRoot.querySelector('.range-segment'), 'range segment').toBeTruthy();
    queries = [];
    await el.setRange('all');
    const stats = queries.find((q) => q.name === 'sales.stats');
    expect(stats?.params?.date_from ?? null).toBeNull();
    const list = queries.find((q) => q.name === 'sales.list');
    expect(JSON.stringify(list?.params ?? {})).not.toContain(await today());
  });

  it('the KPI cards also answer VAT, discounts and voided count for the range', async () => {
    const el = await mountList();
    const text = el.shadowRoot.querySelector('.cards')?.textContent ?? '';
    expect(text).toContain('7.80');   // tax_total 780
    expect(text).toContain('2.00');   // discount_total 200
    expect(text).toContain('1');      // voided
  });
});


// sales#133 — GUARD: «today» is the LOCAL day, never the UTC day.
//
// For a bar that closes at three in the morning, "today" is the day the till has been open, so the
// business day runs in the shop timezone (what Square, Toast and Lightspeed all do). If
// `isoDay()` ever went back to `toISOString().slice(0, 10)`, at 01:00 the history would jump to
// the next day in the middle of the shift, the cashier would not find the ticket she just charged
// and the cash count would not add up.
//
// The clock and the timezone are frozen here so this is deterministic instead of only failing
// between 00:00 and 02:00 CEST, which is how the defect stayed alive.
describe('sales list — «today» is the LOCAL day, never the UTC day (sales#133)', () => {
  // 01:30 in Europe/Madrid (CEST, UTC+2) on the 23rd — still the 22nd in UTC.
  const AT_0130_LOCAL = new Date('2026-08-22T23:30:00Z');
  const LOCAL_DAY = '2026-08-23';
  const UTC_DAY = '2026-08-22';
  let realTz: string | undefined;

  beforeEach(() => {
    realTz = process.env.TZ;
    process.env.TZ = 'Europe/Madrid';
    vi.useFakeTimers();
    vi.setSystemTime(AT_0130_LOCAL);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (realTz === undefined) delete process.env.TZ;
    else process.env.TZ = realTz;
  });

  it('the two days really differ at that instant (otherwise this guard proves nothing)', () => {
    expect(AT_0130_LOCAL.toISOString().slice(0, 10)).toBe(UTC_DAY);
    expect(new Date().getDate()).toBe(23);
    expect(UTC_DAY).not.toBe(LOCAL_DAY);
  });

  it('at 01:30 local, «today» is the local day — the shift that is still open', async () => {
    const { rangeBounds } = await import('./erp-sales-list');
    expect(rangeBounds('today')).toEqual({ from: LOCAL_DAY, to: LOCAL_DAY });
  });

  it('«7 days» and «30 days» count back in local days too, both ends', async () => {
    const { rangeBounds } = await import('./erp-sales-list');
    expect(rangeBounds('7d')).toEqual({ from: '2026-08-17', to: LOCAL_DAY });
    expect(rangeBounds('30d')).toEqual({ from: '2026-07-25', to: LOCAL_DAY });
  });

  it('«all» stays unbounded: no day is computed at all', async () => {
    const { rangeBounds } = await import('./erp-sales-list');
    expect(rangeBounds('all')).toEqual({});
  });
});

// sales#125 — «hoy», «7 días» y «30 días» salían SIEMPRE vacías. The range traveled as a filter
// on `created_at` — a raw ISO TIMESTAMP — and the hub's list engine compares the column as is
// (`sub.created_at <= :f_created_at_to`), so «up to today» meant «up to today at 00:00» and every
// sale charged after midnight was cut. The KPI cards (sales.stats) compare by DATE PART and never
// had the bug: two implementations of «up to today», two answers, on the same screen.
//
// The module now projects the date part of `created_at` as a TEXT column `erp_date` (the same
// `erp_date` helper stats uses) and declares the range filter on THAT column — days compared
// with days, both ends inclusive. The screen must ask for that column.
describe('sales list — the range filter asks for DAYS, not timestamps (sales#125)', () => {
  const sdk = () => (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
  let listQueries: { name: string; params?: Record<string, unknown> }[] = [];

  async function mountList() {
    listQueries = [];
    sdk().query = async () => [];
    sdk().queryPage = async (name: string, params: Record<string, unknown>) => {
      listQueries.push({ name, params });
      return { rows: [], total: 0 };
    };
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el as unknown as {
      setRange(r: 'today' | '7d' | '30d' | 'all'): Promise<void>;
      updateComplete: Promise<unknown>;
    };
  }

  const filtersOf = (q: { name: string; params?: Record<string, unknown> } | undefined):
    Record<string, unknown> =>
    ((q?.params as { filters?: Record<string, unknown> } | undefined)?.filters) ?? {};

  it('the segment range filters on `erp_date` (day granularity), never on the raw `created_at`', async () => {
    await mountList();
    const { rangeBounds } = await import('./erp-sales-list');
    const day = rangeBounds('today').from!;
    const filters = filtersOf(listQueries.find((q) => q.name === 'sales.list'));
    // Day-granularity column with ISO days on both ends: comparing the timestamp with a day
    // is what emptied the screen (the engine reads `<=`, so «today» stopped at 00:00).
    expect(filters.erp_date).toEqual({ from: day, to: day });
    expect(filters.created_at, 'the raw timestamp column must not carry the range').toBeUndefined();
  });

  it('setRange re-points the SAME day column («7 días», «all» clears it)', async () => {
    const el = await mountList();
    const { rangeBounds } = await import('./erp-sales-list');
    listQueries = [];
    await el.setRange('7d');
    let filters = filtersOf(listQueries.find((q) => q.name === 'sales.list'));
    expect(filters.erp_date).toEqual(rangeBounds('7d'));

    listQueries = [];
    await el.setRange('all');
    filters = filtersOf(listQueries.find((q) => q.name === 'sales.list'));
    expect(filters.erp_date, '«all» drops the day filter entirely').toBeUndefined();
  });

  it('the table\'s own date-range picker on the date column feeds the day column too', async () => {
    const el = await mountList();
    const table = (el as unknown as { shadowRoot: ShadowRoot }).shadowRoot.querySelector('ok-data-table');
    table!.dispatchEvent(new CustomEvent('filterChange', { detail: { col: 'created_at', value: { from: '2026-01-01', to: '2026-01-31' } } }));
    await new Promise((r) => setTimeout(r, 0));
    const filters = filtersOf(listQueries.find((q) => q.name === 'sales.list'));
    expect(filters.erp_date, 'a day picked on the date column filters by day').toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(filters.created_at).toBeUndefined();
  });
});

// ── pm#155 (outfitkit#67, second half) ────────────────────────────────────────────────────────
//
// At 1440 px the «Actions» column fell off the screen with nothing hinting the table went on to
// the right, so the only door into a sale was a button nobody could see. OutfitKit 0.1.44 pins
// that column, but the other half of the fix is opt-in: `rowClickable` turns the whole row into a
// door — the first thing a user tries. The list has to ask for it, and wire `rowClick` to the
// same document the «document» action opens.
describe('sales list — clicking the row opens the document (pm#155)', () => {
  async function mountList() {
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.hasPermission = () => true;
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list') as HTMLElement & { shadowRoot: ShadowRoot };
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  it('the table declares `rowClickable` → the whole row is a door, not just the action button', async () => {
    const el = await mountList();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { rowClickable: boolean }) | null;
    expect(
      table?.rowClickable,
      'without `rowClickable` the row is dead: if the actions column is off-screen there is no way in',
    ).toBe(true);
  });

  it('`rowClick` opens the document of the clicked sale, same as the «document» action', async () => {
    const el = await mountList();
    const table = el.shadowRoot.querySelector('ok-data-table') as HTMLElement | null;
    table!.dispatchEvent(new CustomEvent('rowClick', { detail: { row: { id: 'sale-1', sale_number: 'S-1', status: 'completed' } } }));
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const wc = el as unknown as { docSaleId?: string };
    expect(wc.docSaleId, 'the row was clicked and the document did not open').toBe('sale-1');
  });
});

// ── sales#126 — scroll propio y KPIs de una fila en móvil ─────────────────────────────────────
//
// En 390×844 el histórico quedaba inalcanzable: `div.outlet` con `overflow-y: visible` (clientHeight
// 553 · scrollHeight 765 → 212 px fuera) y el `body` del hub con `overflow: hidden` — el contenido
// desbordado se recortaba SIN scrollbar (`outlet.scrollTop` seguía a 0 tras rueda y End). El
// desbordamiento lo aportaba esta vista: los 6 KPI apilados en 2 columnas × 3 filas (~230 px) más
// la barra de filtros, y nada envuelto en un contenedor con scroll propio.
//
// happy-dom NO computa layout (flex/scroll — vitest.config.ts), así que aquí se fija el CONTRATO
// que lo hace posible, no el píxel: la vista LLENA el alto del outlet (`:host` flex con
// `height:100%` + `min-height:0`, el mismo patrón que payments/list y erp-pos) y envuelve TODO su
// contenido en un `.scroll` con `overflow-y:auto` — así la última fila, el estado vacío y el pie
// «N registros» se alcanzan scrollando la propia vista. Por debajo de 768 px los KPI colapsan en
// UNA fila desplazable (Square/Toast) elegida por `matchMedia`. El cálculo real de scrollHeight en
// 390/834/1440 es QA visual en el hub.
describe('sales list — la vista gestiona su scroll y sus KPI en móvil (sales#126)', () => {
  // La media query EXACTA que gobierna la fila de KPI: por debajo de 768 px (767.98 excluye el
  // propio 768, donde el grid multi-columna sigue siendo el layout correcto).
  const KPI_QUERY = '(max-width: 767.98px)';
  type ChangeListener = (e: { matches: boolean }) => void;

  /** matchMedia controlable: la lista decide su fila de KPI por ESTE query; el resto (ok-data-table
   *  pregunta por 640 px en su propio connectedCallback) pasa a la implementación real de happy-dom. */
  function stubMatchMedia(initial: boolean): { mql: { dispatch(matches: boolean): void }; spy: ReturnType<typeof vi.spyOn> } {
    const listeners = new Set<ChangeListener>();
    let matches = initial;
    const mql = {
      matches, media: KPI_QUERY,
      addEventListener: (_t: string, l: ChangeListener) => { listeners.add(l); },
      removeEventListener: (_t: string, l: ChangeListener) => { listeners.delete(l); },
      /** Simula que el viewport cambia de ancho (rotación, mover la ventana). */
      dispatch(next: boolean): void { matches = next; listeners.forEach((l) => l({ matches: next })); },
    };
    const real = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) =>
      q === KPI_QUERY ? mql as unknown as MediaQueryList : real(q));
    return { mql, spy };
  }

  async function mountList(mobile: boolean): Promise<{ el: HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> }; mql: { dispatch(matches: boolean): void } }> {
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.queryPage = async () => ({ rows: [], total: 0 });
    const { mql } = stubMatchMedia(mobile);
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list') as HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };
    document.body.appendChild(el);
    await el.updateComplete;
    return { el, mql };
  }

  const cssOf = (el: HTMLElement): string => {
    const declaradas = (el.constructor as unknown as { styles: { cssText: string } | Array<{ cssText: string }> }).styles;
    return [declaradas].flat().map((s) => s.cssText).join('\n');
  };

  afterEach(() => { vi.restoreAllMocks(); });

  it('la vista LLENA el alto del outlet: :host en flex-column con height 100% y min-height 0', async () => {
    const { el } = await mountList(false);
    const css = cssOf(el);
    // Sin `height:100%` el host no tiene alto propio y el hijo no puede scrollar contra nada;
    // sin `min-height:0` el flex no deja encoger al contenedor de scroll (el fallo de 390 px).
    expect(css).toMatch(/:host\s*\{[^}]*display\s*:\s*flex/);
    expect(css).toMatch(/:host\s*\{[^}]*flex-direction\s*:\s*column/);
    expect(css).toMatch(/:host\s*\{[^}]*height\s*:\s*100%/);
    expect(css).toMatch(/:host\s*\{[^}]*min-height\s*:\s*0/);
  });

  it('existe un contenedor `.scroll` (overflow-y auto + min-height 0) que envuelve título, KPIs Y tabla', async () => {
    const { el } = await mountList(false);
    const scroll = el.shadowRoot.querySelector('.scroll');
    expect(scroll, 'the .scroll wrapper').toBeTruthy();
    // El pie «N registros» y el estado vacío viven DENTRO de la tabla: si la tabla no está dentro
    // del scroller, vuelven a quedar fuera del alcance (lo que pasaba en 390 px).
    expect(scroll!.querySelector('h2'), 'the title scrolls with the view').toBeTruthy();
    expect(scroll!.querySelector('.cards'), 'the KPI strip scrolls with the view').toBeTruthy();
    expect(scroll!.querySelector('ok-data-table'), 'the table (rows, empty state, pager) scrolls with the view').toBeTruthy();
    const css = cssOf(el);
    expect(css).toMatch(/\.scroll\s*\{[^}]*flex\s*:\s*1 1 auto/);
    expect(css).toMatch(/\.scroll\s*\{[^}]*min-height\s*:\s*0/);
    expect(css).toMatch(/\.scroll\s*\{[^}]*overflow-y\s*:\s*auto/);
  });

  it('por debajo de 768 px los KPI llevan la clase de fila horizontal (una sola fila, no 2×3)', async () => {
    const { el } = await mountList(true);
    const cards = el.shadowRoot.querySelector('.cards')!;
    expect(cards.classList.contains('kpi-row'), 'the KPI strip collapses to one row below 768 px').toBe(true);
  });

  it('por encima de 768 px la clase NO está: el grid multi-columna se queda como estaba', async () => {
    const { el } = await mountList(false);
    expect(el.shadowRoot.querySelector('.cards')!.classList.contains('kpi-row')).toBe(false);
  });

  it('la fila de KPI absorbe SU desbordamiento horizontal: overflow-x auto + nowrap en .kpi-row', async () => {
    const { el } = await mountList(false); // el contrato CSS existe en ambas orientaciones
    const css = cssOf(el);
    // Con wrap la tira se apilaba en 2×3 (~230 px); nowrap + overflow-x:auto la dejan en UNA fila
    // y el desbordamiento lo absorbe la tira — nunca la página (scroll horizontal en 390 prohibido).
    expect(css).toMatch(/\.cards\.kpi-row\s*\{[^}]*flex-wrap\s*:\s*nowrap/);
    expect(css).toMatch(/\.cards\.kpi-row\s*\{[^}]*overflow-x\s*:\s*auto/);
    expect(css).toMatch(/\.cards\.kpi-row\s*\.card\s*\{[^}]*flex\s*:\s*0 0 auto/);
    // Y el grid de escritorio (>768) sigue envolviendo igual que antes.
    expect(css).toMatch(/\.cards\s*\{[^}]*flex-wrap\s*:\s*wrap/);
  });

  it('la tira sigue al viewport EN VIVO: al estrechar a móvil la clase aparece; al ensanchar, se va', async () => {
    const { el, mql } = await mountList(false);
    // El usuario rota el móvil o estrecha la ventana POR DEBAJO de 768 px: el listener de
    // matchMedia tiene que conmutar la clase sin remontar la vista.
    mql.dispatch(true);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.cards')!.classList.contains('kpi-row'), 'narrowed below 768 → one-row strip').toBe(true);
    mql.dispatch(false);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.cards')!.classList.contains('kpi-row'), 'widened back → multi-column grid').toBe(false);
  });
});
