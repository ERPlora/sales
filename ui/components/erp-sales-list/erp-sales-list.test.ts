// The STATUS column of the sales list (hub#923, minor defect reported with saas#1460).
//
// The filter dropdown already offered translated labels ("Completada"/"Anulada"), but the CELL had
// no `format`, so every row printed the raw database value — `completed`, in English, on a Spanish
// UI. It is the same list the cashier is sent to when a charge is in doubt, so the one word that
// tells her "this was charged" cannot be jargon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render as litRender } from 'lit';

import esCatalog from '../../../locales/es.json';
import enCatalog from '../../../locales/en.json';
import { installErploraDouble } from '../../test/erplora-double';

interface Column {
  key: string;
  format?: (row: Record<string, unknown>) => unknown;
  filterable?: boolean;
  sortable?: boolean;
  filterType?: string;
  options?: { value: string; label: string }[];
}

/** The shared double, with the reads this view makes. `overrides` names the rows one test needs. */
function installList(overrides: Record<string, unknown[] | (() => unknown[])> = {}) {
  return installErploraDouble({
    queries: {
      'sales.list': [],
      'sales.stats': [],
      'sales.payment_methods': [],
      // The list opens the sale document, which resolves the sale, its lines and its policy.
      'sales.get': [],
      'sales.lines': [],
      'sales.pos_settings.get': [],
      ...overrides,
    },
    // `invoice`/`verifactu` are optional apps (ADR-0127) and this hub does not have them.
    absent: ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'],
    // The shell always carries the active language; without it here the fake would resolve every
    // catalogue against the source language and the Spanish assertions would pass for the wrong
    // reason.
    locale: 'es',
    // Devuelve la traducción REAL del catálogo español: lo que se mide es que la celda deje de
    // enseñar el valor crudo de la base de datos.
    t: (_catalog: Record<string, unknown>, key: string) =>
      key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog) as string ?? key,
  });
}

/** The double the current test is running against (see `installList`). */
let double: ReturnType<typeof installList>;

beforeEach(() => {
  double = installList();
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

  it('renders `refunded` translated too (sales#160)', async () => {
    // It used to be THE example of an unknown status here. Since sales#160 a fully refunded sale
    // really is written as `refunded`, so leaving it as the unknown case would have quietly turned
    // this test into a guard over nothing.
    const column = await statusColumn();
    expect(column.format!({ status: 'refunded' })).toBe('Devuelta');
  });

  it('an unknown status still shows something, never an empty cell', async () => {
    // A status this build does not know about (a newer module writing its own) must degrade to the
    // raw value: an empty cell would hide the row's state entirely.
    const column = await statusColumn();
    expect(column.format!({ status: 'partially_refunded' })).toBe('partially_refunded');
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
    // sales#201 — el sobre del runtime: el código en su CAMPO, y una frase que nadie lee.
    sdk().command = async () => {
      throw Object.assign(new Error('this sale carries a full invoice'), { code: 'sales.void_requires_credit_note' });
    };
    await el.voidSale('sale-1', 'x');
    const err = notes.find((n) => n.type === 'error');
    expect(err?.message).toBe('Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla');
  });

  // ── sales#247 · con dinero ya devuelto, la puerta de anular se cierra ────────────────────
  //
  // Una devolución PARCIAL deja la venta `completed`, así que hasta aquí la fila ofrecía «Anular»
  // sobre un cobro del que ya ha salido dinero — una operación que no existe en el mercado
  // (Lightspeed: «you must refund the sale instead of voiding it»; Dynamics 365 BC BLOQUEA su
  // botón Cancel; Square: «you can't delete a completed transaction»). La puerta que queda es
  // devolver el resto, que es la acción de al lado y sigue viva.
  //
  // El botón es la conveniencia, no la garantía: el handler rechaza igual (`sales.void` lee
  // `sales.refunds`), que es lo que cubre al asistente, la API y una fila recargada tarde.
  it('the void is closed on a sale that already has refunds, and open on a clean one', async () => {
    const el = await mountList(['sales.void_sale']);
    const act = el.documentActions.find((a) => a.id === 'void');
    expect(act, 'the void action').toBeTruthy();
    expect(act!.disabled!({ status: 'completed', refunded_total: 3000 }), 'partially refunded').toBe(true);
    expect(act!.disabled!({ status: 'completed', refunded_total: 0 }), 'nothing returned yet').toBe(false);
    // El control de que el cierre mira lo que dice mirar: sin la columna (una fila vieja en
    // caché) se comporta como antes en vez de bloquear el TPV entero.
    expect(act!.disabled!({ status: 'completed' }), 'no column at all').toBe(false);
  });

  it('refunding stays offered on a sale that has already been partly returned', async () => {
    const el = await mountList(['sales.refund_sale']);
    const act = el.documentActions.find((a) => a.id === 'refund');
    expect(act, 'the refund action').toBeTruthy();
    expect(act!.disabled!({ status: 'completed', refunded_total: 3000 }), 'the way out stays open').toBe(false);
  });

  it('a void refused because the sale was already refunded says what to do instead', async () => {
    const el = await mountList(['sales.void_sale']);
    sdk().command = async () => {
      throw Object.assign(new Error('sale sale-1 already has 1 refund(s)'), { code: 'sales.sale_already_refunded' });
    };
    await el.voidSale('sale-1', 'x');
    const err = notes.find((n) => n.type === 'error');
    expect(err?.message).toBe('Esta venta ya tiene devoluciones: devuelve el importe que queda en vez de anularla');
  });
});

// sales#27 — the sales history as an OPERATIONAL tool: what a manager opens at the end of the
// day. Odoo and Square open their transaction lists on TODAY with a date filter, show the date and
// time on every row, and the KPIs answer for the same range as the rows. Here: a range segment
// (today · 7 days · 30 days · all) that drives BOTH the list filter (`created_at` range, already a
// server filter) and `sales.stats` (which now takes an optional `date_from`/`date_to`).
describe('sales list — today by default, date/time on the row, KPIs for the same range (sales#27)', () => {
  let listSdk: ReturnType<typeof installList>;
  /** What the view asked for, as the shared double records it. */
  const queries = () => listSdk.reads;

  async function mountList() {
    listSdk = installList({
      'sales.stats': [{ count: 3, total_revenue: 4500, avg_ticket: 1500, tax_total: 780, discount_total: 200, voided_count: 1 }],
    });
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
    const stats = queries().find((q) => q.name === 'sales.stats');
    expect(stats?.params).toMatchObject({ date_from: day, date_to: day });
    const list = queries().find((q) => q.name === 'sales.list');
    expect(JSON.stringify(list?.params)).toContain(day);
  });

  it('«all» clears the range from both, and the segment is on screen', async () => {
    const el = await mountList();
    expect(el.shadowRoot.querySelector('.range-segment'), 'range segment').toBeTruthy();
    listSdk.reads.splice(0);
    await el.setRange('all');
    const stats = queries().find((q) => q.name === 'sales.stats');
    expect(stats?.params?.date_from ?? null).toBeNull();
    const list = queries().find((q) => q.name === 'sales.list');
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
  let listSdk: ReturnType<typeof installList>;
  const listQueries = () => listSdk.reads;

  async function mountList() {
    listSdk = installList();
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
    const filters = filtersOf(listQueries().find((q) => q.name === 'sales.list'));
    // Day-granularity column with ISO days on both ends: comparing the timestamp with a day
    // is what emptied the screen (the engine reads `<=`, so «today» stopped at 00:00).
    expect(filters.erp_date).toEqual({ from: day, to: day });
    expect(filters.created_at, 'the raw timestamp column must not carry the range').toBeUndefined();
  });

  it('setRange re-points the SAME day column («7 días», «all» clears it)', async () => {
    const el = await mountList();
    const { rangeBounds } = await import('./erp-sales-list');
    listSdk.reads.splice(0);
    await el.setRange('7d');
    let filters = filtersOf(listQueries().find((q) => q.name === 'sales.list'));
    expect(filters.erp_date).toEqual(rangeBounds('7d'));

    listSdk.reads.splice(0);
    await el.setRange('all');
    filters = filtersOf(listQueries().find((q) => q.name === 'sales.list'));
    expect(filters.erp_date, '«all» drops the day filter entirely').toBeUndefined();
  });

  it('the table\'s own date-range picker on the date column feeds the day column too', async () => {
    const el = await mountList();
    const table = (el as unknown as { shadowRoot: ShadowRoot }).shadowRoot.querySelector('ok-data-table');
    table!.dispatchEvent(new CustomEvent('filterChange', { detail: { col: 'created_at', value: { from: '2026-01-01', to: '2026-01-31' } } }));
    await new Promise((r) => setTimeout(r, 0));
    const filters = filtersOf(listQueries().find((q) => q.name === 'sales.list'));
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
    installList();
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

// sales#181 — the SAME column, the other half of it. The cell says «Efectivo», but the filter was
// free text sent verbatim to the server, which matches the CANONICAL name the row stores («Cash»):
// typing what you can read on screen returned ZERO sales, silently. Payment method is an
// ENUMERATED dimension — Square, Toast, Lightspeed, Odoo, Shopify and Business Central all offer it
// as a picker, never as a text box — so the filter offers the hub's methods by their visible name
// and sends the value the row actually stores. Same shape the `status` column already uses.
describe('sales list — filtering by payment method (sales#181)', () => {
  const SEEDED = [
    { id: 'h|paymethod|cash', name: 'Cash', type: 'cash' },
    { id: 'h|paymethod|card', name: 'Card', type: 'card' },
    { id: 'h|paymethod|bbva', name: 'BBVA TPV', type: 'card' },
  ];

  async function paymentColumn(methods: unknown[]): Promise<Column> {
    installList({ 'sales.payment_methods': methods });
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    const view = el as unknown as { updateComplete: Promise<unknown> };
    await view.updateComplete;
    await new Promise((r) => setTimeout(r, 0)); // the methods land after the first paint
    await view.updateComplete;
    return (el as unknown as { columns: Column[] }).columns.find((c) => c.key === 'payment_method_name')!;
  }

  it('offers the methods as a picker, labelled the way the cell shows them', async () => {
    const col = await paymentColumn(SEEDED);
    expect(col.filterable, 'the picker is the only control this column can be filtered by').toBe(true);
    expect(col.filterType, 'free text cannot match a name the user never sees').toBe('select');
    expect(col.options).toEqual([
      { value: 'Cash', label: 'Efectivo' },
      { value: 'Card', label: 'Tarjeta' },
      { value: 'BBVA TPV', label: 'BBVA TPV' },
    ]);
  });

  // sales#260 — the fallback sales#181 left behind was the very bug it closed, in miniature.
  //
  // `op: "eq"` serves the picker (a closed domain is chosen, so the match is exact), and the text
  // box inherited it: free text compared WHOLE against the name the row stores. On a seeded hub the
  // row stores `Cash` and the screen reads «Efectivo», so typing what is on the screen answered
  // zero — and an empty table says nothing, so the day looks like a day without cash. One `op`
  // cannot serve both branches either: `like` would let the picker's «Card» also match «Card BBVA».
  //
  // The market never offers this dimension as free text — Square, Lightspeed, Clover, Odoo,
  // WooCommerce and Business Central all pick from the list of methods, and Toast's payment
  // terminal simply does not offer the filter rather than offer one it cannot serve. So when the
  // list cannot be built, neither is the box.
  it('offers NO box at all when the methods cannot be loaded, never a text box that can never hit', async () => {
    const col = await paymentColumn([]);
    expect(col.filterable, 'a filter that cannot hit is worse than none: the user trusts it').toBeFalsy();
    expect(col.filterType, 'no control at all, not a text box against the stored name').toBeUndefined();
    expect(col.options).toBeUndefined();
  });

  it('keeps naming the method in every row when the picker cannot be built', async () => {
    // Losing the filter must not lose the COLUMN: the history still reads «Efectivo», and the
    // header still sorts. Only the box that could not answer is gone.
    const col = await paymentColumn([]);
    expect(col.sortable).toBe(true);
    expect(col.format?.({ payment_method_name: 'Cash' })).toBe('Efectivo');
  });
});

// sales#260, the other half — a filter that goes missing has to SAY so.
//
// With no methods the column offers no box (above), which is right when the hub simply has none.
// But the same empty list also came out of a FAILED read (`loadPayMethods` swallowed the rejection),
// and then the cashier saw a history with one filter fewer and no idea why: a silent failure is a
// failure nobody fixes (the KPI strip learnt this in sales#207). So a failed read is told on screen,
// through the same door as the metrics — the declared sentence of the code, the screen's own line
// otherwise, the server's message never — and an EMPTY answer is not a failure and shows nothing.
describe('the payment filter goes missing with a WORD, never in silence (sales#260)', () => {
  async function mountMethods(methods: unknown[] | (() => unknown[])): Promise<{ shown: string; painted: string[]; col: Column }> {
    installList({ 'sales.payment_methods': methods });
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    const view = el as unknown as { updateComplete: Promise<unknown>; payMethodsError: string; columns: Column[]; shadowRoot: ShadowRoot };
    await view.updateComplete;
    await new Promise((r) => setTimeout(r, 0)); // the methods land after the first paint
    await view.updateComplete;
    const painted = Array.from(view.shadowRoot.querySelectorAll('ok-inline-feedback')).map((n) => (n.textContent ?? '').trim());
    return { shown: view.payMethodsError, painted, col: view.columns.find((c) => c.key === 'payment_method_name')! };
  }

  it('tells the cashier the methods could not be loaded, on the screen and in her language', async () => {
    const { shown, painted, col } = await mountMethods(() => { throw new Error('relation "sales_paymentmethod" does not exist'); });
    expect(shown, 'the screen owns a sentence for this').toBe(esCatalog.ui.errorPayMethods);
    expect(shown, 'an empty notice is silence with extra steps').toBeTruthy();
    expect(shown, 'the raw message never reaches a pixel (ADR-0055)').not.toContain('relation');
    expect(painted, 'a field nobody paints is still silence').toContain(shown);
    expect(col.filterable, 'and the box that cannot hit is still not offered').toBeFalsy();
  });

  it('the server being down is told as the server being down (sales#81)', async () => {
    const { shown, painted } = await mountMethods(() => { throw new TypeError('Failed to fetch'); });
    expect(shown).toBe(esCatalog.ui.serverUnavailable);
    expect(painted).toContain(shown);
  });

  it('a hub with no methods is not a failure: no notice', async () => {
    const { shown, painted } = await mountMethods([]);
    expect(shown).toBe('');
    expect(painted.some((text) => text === esCatalog.ui.errorPayMethods)).toBe(false);
  });
});

// sales#207 (ADR-0398) — the KPI strip failed with the server's own sentence.
//
// `loadStats` painted `e.message`, so a refusal reached the screen as whatever detail the handler
// wrote — English prose on a Spanish UI, and sometimes an id nobody outside a log can use. With
// the catalogue declared, a domain code has a sentence of its own; anything else falls back to the
// screen's own line, and the raw message never reaches a pixel.
describe('las métricas fallan con el CATÁLOGO, nunca con el mensaje del servidor (sales#207)', () => {
  async function mountFailing(thrown: unknown): Promise<string> {
    installList({ 'sales.stats': () => { throw thrown; } });
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    const view = el as unknown as { updateComplete: Promise<unknown>; statsError: string };
    await view.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await view.updateComplete;
    return view.statsError;
  }

  it('cuenta el código DECLARADO cuando el rechazo trae uno', async () => {
    const shown = await mountFailing(Object.assign(new Error('sale sale-9 is not in this hub'), { code: 'sales.sale_not_found' }));
    expect(shown).toBe(esCatalog.errors['sales.sale_not_found']);
    expect(shown).not.toContain('sale-9');
  });

  it('sin código de dominio, la línea de la pantalla — y NUNCA el mensaje crudo', async () => {
    const shown = await mountFailing(new Error('relation "sales" does not exist'));
    expect(shown).toBe(esCatalog.ui.errorStats);
    expect(shown).not.toContain('relation');
  });

  it('el servidor caído se cuenta como servidor caído (sales#81)', async () => {
    const shown = await mountFailing(new TypeError('Failed to fetch'));
    expect(shown).toBe(esCatalog.ui.serverUnavailable);
  });
});

// sales#243 — the «Nº» header sorts by the NUMBER, not by the text of the number.
//
// `sale_number` is TEXT shaped `YYYYMMDD-<sequence>` and the pad is a MINIMUM, never a ceiling
// (hub#1393, after the outage of sales#241): past the 9.999th sale of a day the sequence grows a
// digit and text order stops agreeing with numeric order — `20260901-10000` lands between `-1000`
// and `-2000`. `sales.list` now projects `sale_seq`, a synthetic key that exists only to be
// ordered by, and this screen is what puts the header on it.
//
// It is the SAME shape as the date column, which has painted `created_at` and filtered `erp_date`
// since sales#125: what the cell shows and what the server sorts by are two different columns, and
// the mapping lives here, at the one boundary that knows both. The fiscal number is never
// rewritten — not on screen, not in the query, not in the row.
describe('sales list — sorting by «Nº» is numeric, not lexicographic (sales#243)', () => {
  interface ListView {
    updateComplete: Promise<unknown>;
    shadowRoot: ShadowRoot;
  }

  async function mount(): Promise<ListView> {
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    const view = el as unknown as ListView;
    await view.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await view.updateComplete;
    return view;
  }

  const table = (el: ListView): HTMLElement =>
    el.shadowRoot.querySelector<HTMLElement>('ok-data-table')!;

  /** Clicking a header is this event; the table emits the column's `key`, which is what it paints. */
  async function sortBy(el: ListView, key: string, dir: 'asc' | 'desc' = 'asc'): Promise<void> {
    table(el).dispatchEvent(new CustomEvent('sortChange', { detail: { sort: key, dir } }));
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
  }

  /** The `sort` the LAST read of the history carried to the server. */
  const sortAsked = (): unknown =>
    double.reads.filter((r) => r.name === 'sales.list').at(-1)?.params?.sort;

  it('asks the server for the synthetic order key, never for the fiscal number', async () => {
    const el = await mount();
    await sortBy(el, 'sale_number');

    expect(
      sortAsked(),
      'ordering by the fiscal number is text ordering: the 10.000th sale would land before the 2.000th',
    ).toBe('sale_seq');
  });

  it('keeps the header the cashier clicked marked as the active one', async () => {
    // The table paints the sort arrow on the column whose `key` matches `.sort`. Handing it
    // `sale_seq` — a column it does not have — would clear the arrow off «Nº» and the screen would
    // look unsorted while the rows were, in fact, sorted.
    const el = await mount();
    await sortBy(el, 'sale_number', 'desc');

    expect((table(el) as unknown as { sort?: string }).sort).toBe('sale_number');
    expect((table(el) as unknown as { sortDir?: string }).sortDir).toBe('desc');
  });

  it('leaves every other column sorting by itself', async () => {
    // The mapping is one column wide on purpose. A blanket rewrite here is how the date column
    // would silently start asking for a key that does not exist.
    const el = await mount();
    await sortBy(el, 'total');
    expect(sortAsked()).toBe('total');

    await sortBy(el, 'created_at');
    expect(sortAsked()).toBe('created_at');
  });

  it('still PAINTS the fiscal number, exactly as minted', async () => {
    // The key orders; it never replaces. `sale_seq` is length-prefixed (`20260901-0510000`) and a
    // cell showing that instead of `20260901-10000` would be a rewritten fiscal number on screen.
    const el = await mount();
    await sortBy(el, 'sale_number');

    const columns = (el as unknown as { columns: Column[] }).columns;
    const number = columns.find((c) => c.key === 'sale_number');
    expect(number, 'the «Nº» column is the one that paints the fiscal number').toBeDefined();
    expect(columns.some((c) => c.key === 'sale_seq'), 'the order key is not a column of the table').toBe(false);
  });
});

// ── sales#255 · «Devolver el resto (X €)»: el importe, en el punto de elección ─────────────────
//
// El historial ya sabía, por fila, si la venta admite devolución (`disabled`), pero no CUÁNTO
// queda: la acción decía «Devolver» a secas y el importe solo aparecía dentro del modal, un clic
// más tarde. Quien atiende un mostrador decide ahí, en la lista, y hasta ahora tenía que abrir
// para saber si esa era la venta.
//
// El mercado pone el número donde se elige: Square y Lightspeed etiquetan la acción con lo que
// queda por devolver, y Business Central hace lo mismo con sus acciones por línea. `refunded_total`
// ya viaja en `sales.list` desde sales#247, así que el dato está en la fila.
//
// Y esto es también ACCESIBILIDAD, que es la parte que más pesa: el guard cross-módulo (ADR-0133)
// hace `icon` obligatorio en las acciones de fila, así que el botón NO tiene texto y `label` es su
// único nombre accesible. Una etiqueta que no se resolviera ahí dejaría la tabla sin nombre por
// fila — peor que el hueco que cierra.
describe('sales list — the refund action carries what is left to refund (sales#255)', () => {
  /** Dos filas A PROPÓSITO, con restos distintos: con una sola, una etiqueta fija pasaría igual. */
  const ROWS = [
    { id: 'sale-1', sale_number: 'V-1000', status: 'completed', total: 10000, refunded_total: 3000 },
    { id: 'sale-2', sale_number: 'V-1001', status: 'completed', total: 5000, refunded_total: 0 },
  ];

  /** El catálogo español REAL, con los `{marcadores}` resueltos como los resuelve el shell. */
  function translate(key: string, params?: Record<string, unknown>): string {
    const raw = key.split('.').reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog,
    ) as string ?? key;
    return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? `{${name}}`));
  }

  /** Formato con COMA decimal: si la etiqueta se formatease por su cuenta (`toFixed`, un `€`
   *  concatenado) saldría con punto y estas aserciones caerían. Es el control de que el importe
   *  pasa por `erplora().formatMoney`, que es la única puerta que sabe la moneda del hub. */
  const formatMoney = (cents: number): string => `${((cents || 0) / 100).toFixed(2).replace('.', ',')} €`;

  async function mountList() {
    installErploraDouble({
      queries: {
        'sales.list': ROWS,
        'sales.stats': [],
        'sales.payment_methods': [],
        'sales.get': [],
        'sales.lines': [],
        'sales.pos_settings.get': [],
      },
      absent: ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'],
      locale: 'es',
      formatMoney,
      t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) =>
        translate(key, params),
      hasPermission: (p?: string) => p === 'sales.refund_sale',
    });
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list') as HTMLElement & { shadowRoot: ShadowRoot };
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  const refundAction = (el: HTMLElement) =>
    (el as unknown as { documentActions: { id: string; label: unknown; icon?: string }[] })
      .documentActions.find((a) => a.id === 'refund')!;

  it('labels each row with ITS OWN remainder, not one text for the whole table', async () => {
    const el = await mountList();
    const action = refundAction(el);
    expect(action, 'the refund action').toBeTruthy();
    expect(
      action.label,
      'the label is still a fixed string: it cannot carry a value from the row',
    ).toBeTypeOf('function');

    const label = action.label as (row: Record<string, unknown>) => string;
    expect(label(ROWS[0]), 'a partly refunded sale does not offer what is LEFT').toBe('Devolver el resto (70,00 €)');
    expect(label(ROWS[1]), 'an untouched sale does not offer its amount').toBe('Devolver (50,00 €)');
    expect(label(ROWS[0]), 'both rows say the same: the label is evaluated once for the whole table')
      .not.toBe(label(ROWS[1]));
  });

  it('reads the remainder from the row, and survives a row served by an older hub', async () => {
    const el = await mountList();
    const label = refundAction(el).label as (row: Record<string, unknown>) => string;
    // sales#247 added `refunded_total`; a row cached from a hub before it has no such column. It
    // must fall back to the whole total, never to `NaN €` on the button.
    expect(label({ status: 'completed', total: 5000 })).toBe('Devolver (50,00 €)');
    // Fully returned down to the last cent: the sale is `refunded` and the button is off, but the
    // text still has to be readable — a `-0,00 €` or a `NaN` here would be the visible bug.
    expect(label({ status: 'refunded', total: 5000, refunded_total: 5000 })).toBe('Devolver el resto (0,00 €)');
  });

  it('is the ACCESSIBLE NAME of each row button, resolved per row by the table', async () => {
    // The end of the chain, through the real `ok-data-table`: the action is icon-only (ADR-0133),
    // so `label` is all the button is called. A function that the table did not resolve there
    // would leave every row with the same name, or none.
    const el = await mountList();
    const table = el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & { shadowRoot: ShadowRoot }) | null;
    expect(table, 'the list paints an ok-data-table').toBeTruthy();

    for (let tick = 0; tick < 20; tick += 1) {
      if (table!.shadowRoot.querySelectorAll('.grow-data').length >= ROWS.length) break;
      await new Promise((r) => setTimeout(r, 0));
      await (table as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    }

    // The buttons of a row follow the declared order of `documentActions`; asking the component
    // for the index keeps this honest if another action is ever added before this one.
    const order = (el as unknown as { documentActions: { id: string }[] }).documentActions;
    const at = order.findIndex((a) => a.id === 'refund');
    const names = [...table!.shadowRoot.querySelectorAll('.grow-data')].map(
      (row) => row.querySelectorAll('.gcell.actions-col ion-button')[at]?.getAttribute('aria-label'),
    );
    expect(names, 'each row has to be named with its own remainder').toEqual([
      'Devolver el resto (70,00 €)',
      'Devolver (50,00 €)',
    ]);
  });
});

// ── sales#256 · lo que queda por devolver se LEE en la fila, no se «hoverea» ────────────────────
//
// sales#255 puso el resto en la acción, pero la acción de fila es icon-only (ADR-0133): el importe
// solo llegaba a `aria-label`/`title`. En el ordenador del despacho el ratón lo enseña; en la
// tablet del mostrador —que es donde se atiende a quien viene a que le devuelvan— no hay ratón y
// no aparece nunca, así que había que abrir la venta igual: justo el paso que sales#255 quitaba.
//
// Decisión de mercado (8 referencias + foros): la marca del reembolso parcial se lee EN LA FILA y
// el importe va PEGADO al dinero que corrige, sin columna nueva.
//   · Shopify marca la fila con «Partially refunded» y su guía pide insignias de 1-2 palabras
//     (shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/badge):
//     una columna nueva SOLO para un importe no es lo que hace nadie.
//   · Lightspeed Retail (R-Series) usa insignias en el historial y la de descuento lleva DENTRO
//     «the total amount that was discounted» — el importe viaja con la marca, no en otra columna.
//   · Toast pone el importe en una columna «Refund»; WooCommerce pinta la línea devuelta en rojo
//     dentro de los totales del pedido: en los dos, el número vive junto al dinero.
//   · Odoo enseña «Return Status» (parcial/completa) en la lista de pedidos, sin importe.
//   · Square lista el tipo «Partially Refunded» y solo el NÚMERO de reembolsos; en su foro los
//     comerciantes cuentan que acaban abriendo transacción por transacción para cuadrarlo — el
//     fallo que copiaríamos si nos quedásemos en la marca sin importe.
//   · Stripe lo esconde detrás de un hover («Partial refund ⓘ», el importe al pasar el ratón):
//     es LITERALMENTE este bug, en un producto grande.
//   · Business Central sí tiene columna propia («Remaining Amount»), pero es un ERP de escritorio
//     con esa columna poblada en cada fila; aquí estaría vacía en casi todas y en móvil añadiría
//     una línea muerta a CADA tarjeta (sales#126 ya peleó ese espacio).
describe('sales list — what is left to refund is READ on the row (sales#256)', () => {
  /** Tres filas: una devuelta a medias (la que tiene que hablar), una intacta y una devuelta
   *  ENTERA (donde el resto es 0 y una línea más sería ruido). */
  const ROWS = [
    { id: 'sale-1', sale_number: 'V-1000', status: 'completed', total: 10000, refunded_total: 3000 },
    { id: 'sale-2', sale_number: 'V-1001', status: 'completed', total: 5000, refunded_total: 0 },
    { id: 'sale-3', sale_number: 'V-1002', status: 'refunded', total: 8000, refunded_total: 8000 },
  ];

  /** El catálogo español REAL con sus `{marcadores}` resueltos, como los resuelve el shell. */
  function translate(key: string, params?: Record<string, unknown>): string {
    const raw = key.split('.').reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog,
    ) as string ?? key;
    return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? `{${name}}`));
  }

  /** Coma decimal: si la celda formatease por su cuenta (`toFixed`, un `€` concatenado) saldría
   *  con punto y estas aserciones caerían. Es el control de que pasa por `formatMoney`. */
  const formatMoney = (cents: number): string => `${((cents || 0) / 100).toFixed(2).replace('.', ',')} €`;

  /** matchMedia gobernado: `mobile` decide si la consulta de ok-data-table (max-width: 640px)
   *  encaja, que es lo que arranca la tabla en TARJETAS (el viewport del móvil). */
  function stubMatchMedia(mobile: boolean): void {
    const real = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) =>
      /max-width:\s*640px/.test(q)
        ? ({ matches: mobile, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList)
        : real(q));
  }

  async function mountList(mobile = false) {
    installErploraDouble({
      queries: {
        'sales.list': ROWS,
        'sales.stats': [],
        'sales.payment_methods': [],
        'sales.get': [],
        'sales.lines': [],
        'sales.pos_settings.get': [],
      },
      absent: ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'],
      locale: 'es',
      formatMoney,
      t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) =>
        translate(key, params),
      hasPermission: (p?: string) => p === 'sales.refund_sale',
    });
    stubMatchMedia(mobile);
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list') as HTMLElement & { shadowRoot: ShadowRoot };
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const table = el.shadowRoot.querySelector('ok-data-table') as HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };
    for (let tick = 0; tick < 30; tick += 1) {
      if (table.shadowRoot.querySelectorAll(mobile ? 'ion-card.rcard' : '.grow-data').length >= ROWS.length) break;
      await new Promise((r) => setTimeout(r, 0));
      await table.updateComplete;
    }
    return { el, table };
  }

  /** El texto que de verdad se PINTA en la celda de esa columna, fila a fila (vista lista). */
  function cellTexts(el: HTMLElement, table: HTMLElement & { shadowRoot: ShadowRoot }, key: string): string[] {
    const cols = (el as unknown as { columns: { key: string }[] }).columns;
    const at = cols.findIndex((c) => c.key === key);
    expect(at, `la columna ${key} sigue existiendo`).toBeGreaterThanOrEqual(0);
    return [...table.shadowRoot.querySelectorAll('.grow-data')].map((row) =>
      (row.querySelectorAll('.gcell')[at]?.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  afterEach(() => { vi.restoreAllMocks(); });

  it('la fila devuelta a medias enseña el resto EN PANTALLA, no solo en el aria-label', async () => {
    const { el, table } = await mountList();
    const texts = cellTexts(el, table, 'status');
    expect(texts.length, 'las tres filas se pintan').toBe(3);
    // El estado sigue estando: la celda no se sustituye, se completa.
    expect(texts[0]).toContain('Completada');
    // Y el resto se LEE, sin ratón y sin abrir la venta.
    expect(texts[0], 'la venta devuelta a medias dice cuánto queda').toContain('Por devolver 70,00 €');
  });

  // 🔴 La razón por la que la marca vive en ESTADO y no en TOTAL, medida sobre el `ok-data-table`
  // del shell (0.1.61) en tablet vertical (834×1112, iPad Pro 11"): la tabla del historial tiene
  // más columnas de las que caben, así que se desplaza en horizontal con la columna de ACCIONES
  // ANCLADA a la derecha (x=678..834). El total cae DEBAJO de ese ancla (x=696..824,
  // `elementFromPoint` devuelve las acciones, no el total) y en inglés se sale de la pantalla
  // entera. La celda de estado (x=560..688) sí se lee. Poner el importe junto al total lo dejaba
  // invisible EXACTAMENTE en la tablet del mostrador, que es el aparato del que sale esta issue.
  it('la celda del TOTAL no hereda la frase: es la que la tablet esconde bajo las acciones', async () => {
    const { el, table } = await mountList();
    const totals = cellTexts(el, table, 'total');
    expect(totals[0], 'el total sigue siendo el total y nada más').toBe('100,00 €');
    expect(totals.join(' '), 'nada de la marca se cuela en la columna del dinero').not.toContain('Por devolver');
  });

  it('la venta intacta y la devuelta ENTERA no ganan ruido', async () => {
    const { el, table } = await mountList();
    const texts = cellTexts(el, table, 'status');
    // Intacta: el estado y nada más — no hay nada devuelto que contar.
    expect(texts[1], 'una venta sin devoluciones').toBe('Completada');
    // Devuelta entera: el resto es 0. Un «Por devolver 0,00 €» sería ruido en la fila, y la propia
    // palabra del estado ya dice «Devuelta».
    expect(texts[2], 'una venta devuelta entera').toBe('Devuelta');
  });

  it('en MÓVIL (tarjetas) el resto también se lee, y en la línea del ESTADO', async () => {
    const { table } = await mountList(true);
    const cards = [...table.shadowRoot.querySelectorAll('ion-card.rcard')];
    expect(cards.length, 'la tabla arranca en tarjetas por debajo de 640 px').toBe(3);
    /** El valor pintado en la línea de la tarjeta que lleva esa etiqueta. */
    const line = (card: Element, label: string): string => {
      const row = [...card.querySelectorAll('.rrow')]
        .find((r) => (r.querySelector('.rk')?.textContent ?? '').trim() === label);
      return (row?.querySelector('.rv')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    expect(line(cards[0], 'Estado'), 'la tarjeta de la venta devuelta a medias').toContain('Por devolver 70,00 €');
    // Y la línea del dinero se queda limpia también aquí: una tarjeta es la misma columna en
    // vertical, así que el sitio de la marca tiene que ser el mismo en las dos vistas.
    expect(line(cards[0], 'Total'), 'la línea del total no la repite').toBe('100,00 €');
    const texts = cards.map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(texts[1], 'la tarjeta de la venta intacta no lo menciona').not.toContain('Por devolver');
    expect(texts[2], 'la tarjeta de la venta devuelta entera tampoco').not.toContain('Por devolver');
  });

  it('la frase sale del CATÁLOGO: en inglés la fila la dice en inglés (ADR-0055)', async () => {
    // Sin esto, un literal español clavado en el componente pasaría todo lo de arriba: el resto de
    // las aserciones montan en `es` y no distinguen una traducción de una cadena escrita a mano.
    installErploraDouble({
      queries: {
        'sales.list': ROWS, 'sales.stats': [], 'sales.payment_methods': [],
        'sales.get': [], 'sales.lines': [], 'sales.pos_settings.get': [],
      },
      absent: ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'],
      locale: 'en',
      formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
      t: (_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => {
        const raw = key.split('.').reduce<unknown>(
          (acc, part) => (acc as Record<string, unknown>)?.[part], enCatalog,
        ) as string ?? key;
        return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? `{${name}}`));
      },
      hasPermission: (p?: string) => p === 'sales.refund_sale',
    });
    stubMatchMedia(false);
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list') as HTMLElement & { shadowRoot: ShadowRoot };
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const table = el.shadowRoot.querySelector('ok-data-table') as HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> };
    for (let tick = 0; tick < 30; tick += 1) {
      if (table.shadowRoot.querySelectorAll('.grow-data').length >= ROWS.length) break;
      await new Promise((r) => setTimeout(r, 0));
      await table.updateComplete;
    }
    const texts = cellTexts(el, table, 'status');
    expect(texts[0], 'the English catalogue speaks English').toContain('70.00 € left to refund');
    expect(texts[0], 'and nothing of the Spanish one leaks through').not.toContain('Por devolver');
  });

  it('el valor CRUDO de la columna sigue siendo el estado: ordenar y FILTRAR no heredan la frase', async () => {
    // `format` es lo que ok-data-table usa para ordenar/filtrar y para el valor plano (`rawValue`).
    // El filtro de esta columna es un `select` con las tres palabras: si la frase se colase en
    // `format`, elegir «Completada» dejaría de encontrar la venta devuelta a medias.
    const { el } = await mountList();
    const col = (el as unknown as { columns: { key: string; format?: (r: Record<string, unknown>) => string }[] })
      .columns.find((c) => c.key === 'status')!;
    expect(col.format!({ status: 'completed', total: 10000, refunded_total: 3000 })).toBe('Completada');
    expect(col.format!({ status: 'refunded', total: 8000, refunded_total: 8000 })).toBe('Devuelta');
  });

  it('una fila sin `refunded_total` (hub viejo) se pinta como siempre', async () => {
    const { el } = await mountList();
    const col = (el as unknown as { columns: { key: string; render?: (r: Record<string, unknown>) => unknown }[] })
      .columns.find((c) => c.key === 'status')!;
    const host = document.createElement('div');
    document.body.appendChild(host);
    litRender(col.render!({ id: 'x', status: 'completed', total: 5000 }), host);
    expect(host.textContent!.replace(/\s+/g, ' ').trim()).toBe('Completada');
  });

  it('un estado DESCONOCIDO sigue cayendo a su valor crudo, con marca o sin ella (hub#923)', async () => {
    // Un módulo más nuevo escribiendo un estado que este catálogo no conoce: peor que la palabra
    // cruda sería una celda vacía, que esconde el estado de la fila. La marca no puede comerse eso.
    const { el } = await mountList();
    const col = (el as unknown as { columns: { key: string; render?: (r: Record<string, unknown>) => unknown }[] })
      .columns.find((c) => c.key === 'status')!;
    const host = document.createElement('div');
    document.body.appendChild(host);
    litRender(col.render!({ id: 'x', status: 'partially_settled', total: 10000, refunded_total: 3000 }), host);
    const painted = host.textContent!.replace(/\s+/g, ' ').trim();
    expect(painted).toContain('partially_settled');
    expect(painted).toContain('Por devolver 70,00 €');
  });
});
