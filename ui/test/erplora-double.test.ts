// sales#233 — the contract of the ONE `globalThis.erplora` double the till's tests share.
//
// It exists because fourteen files each grew their own, and the one that fell behind answered `[]`
// through the door sales#25 had just moved the catalogue onto. The grid painted no products, the
// cart never filled, and the five cases of the «customer required» guard died there — green for a
// whole day while testing nothing (sales#231). A double that answers "there is nothing" to a read
// the screen takes for granted is not a stub: it is a mock that lies.
//
// So the rule this file pins down is the opposite of the old default: an unconfigured read THROWS,
// naming the query. Absence and a broken contract stay sayable — but only ON PURPOSE, by name.
import { describe, expect, it } from 'vitest';
import { MODULE_ABSENT_CODES } from '../lib/dependency-read';
import { drainUnconfiguredReads, installErploraDouble, makeErploraDouble } from './erplora-double';

/** The four read doors of the SDK, and what each answers when the owner module is missing. */
const READ_DOORS = ['query', 'queryAll', 'queryOptional', 'queryAllOptional'] as const;
type ReadDoor = (typeof READ_DOORS)[number];

interface SdkLike {
  query(name: string, params?: Record<string, unknown>): Promise<unknown>;
  queryAll(name: string, params?: Record<string, unknown>): Promise<unknown>;
  queryOptional(name: string, params?: Record<string, unknown>): Promise<unknown>;
  queryAllOptional(name: string, params?: Record<string, unknown>): Promise<unknown>;
  command(name: string, payload?: Record<string, unknown>): Promise<unknown>;
  [key: string]: unknown;
}

const sdk = () => (globalThis as { erplora?: SdkLike }).erplora as SdkLike;

const ROWS = [{ id: 'p-1', name: 'Café' }, { id: 'p-2', name: 'Té' }];

describe('1 · a configured read answers through every door', () => {
  it('hands back exactly what the test declared', async () => {
    installErploraDouble({ queries: { 'inventory.products.list': ROWS } });

    for (const door of READ_DOORS) {
      expect(await sdk()[door]('inventory.products.list'), `\`${door}\` answers the configured rows`)
        .toEqual(ROWS);
    }
  });

  it('accepts an answer that depends on the params', async () => {
    installErploraDouble({
      queries: { 'sales.get': (params) => [{ id: params?.id, total: 100 }] },
    });

    expect(await sdk().query('sales.get', { id: 'sale-7' })).toEqual([{ id: 'sale-7', total: 100 }]);
  });

  it('records every read with its door and params, so a test can assert on HOW it was asked', async () => {
    const double = installErploraDouble({ queries: { 'taxes.rules.list': [] } });

    await sdk().queryAllOptional('taxes.rules.list', { sort: 'name' });

    expect(double.reads).toEqual([
      { door: 'queryAllOptional', name: 'taxes.rules.list', params: { sort: 'name' } },
    ]);
  });
});

describe('2 · a read NOBODY configured fails loudly instead of answering `[]`', () => {
  it('throws through every door, naming the query', async () => {
    installErploraDouble({ queries: { 'taxes.rules.list': [] }, allowUnconfiguredReads: true });

    for (const door of READ_DOORS) {
      await expect(sdk()[door]('inventory.products.list'), `\`${door}\` must not invent an answer`)
        .rejects.toThrow(/inventory\.products\.list/);
    }
  });

  it('the message points at the test file and at the way out', async () => {
    installErploraDouble({ allowUnconfiguredReads: true });

    const error = await sdk().queryAll('services.services.list').catch((e: unknown) => e as Error);

    expect(error.message, 'names the file whose double is short').toContain('erplora-double.test.ts');
    expect(error.message, 'names the option that declares the read').toContain('queries');
    expect(error.message, 'names the option for a module that is not installed').toContain('absent');
    expect(error.message, 'names the option for a broken contract').toContain('broken');
  });

  it('the miss survives a screen that swallows it, so the test still fails', async () => {
    installErploraDouble({ allowUnconfiguredReads: true });

    // Exactly what `optionalRead` in the till does: `catch { return undefined; }`. Without a record
    // kept outside that catch, the omission that cost sales#231 would still be invisible.
    await sdk().queryOptional('combos.options.all').catch(() => undefined);

    expect(drainUnconfiguredReads(), 'the swallowed miss is still on the record')
      .toEqual([{ door: 'queryOptional', name: 'combos.options.all' }]);
    expect(drainUnconfiguredReads(), 'draining clears it for the next test').toEqual([]);
  });
});

describe('3 · `absent` says "that app is not in this hub", the way the runtime says it', () => {
  it('the OPTIONAL doors answer `undefined` — not `[]`, which means "installed, nothing to offer"', async () => {
    installErploraDouble({ absent: ['services.services.list'] });

    expect(await sdk().queryOptional('services.services.list')).toBeUndefined();
    expect(await sdk().queryAllOptional('services.services.list')).toBeUndefined();
  });

  it('the REQUIRED doors reject with an absence code the classifier knows', async () => {
    installErploraDouble({ absent: ['services.services.list'] });

    for (const door of ['query', 'queryAll'] as ReadDoor[]) {
      const error = await sdk()[door]('services.services.list').catch((e: unknown) => e as { code?: string });
      expect(MODULE_ABSENT_CODES.has(String(error.code)), `\`${door}\` rejects as absence`).toBe(true);
    }
  });

  it('an absent read is NOT an unconfigured one: nothing lands on the record', async () => {
    installErploraDouble({ absent: ['services.services.list'] });

    await sdk().queryAllOptional('services.services.list');

    expect(drainUnconfiguredReads()).toEqual([]);
  });
});

describe('4 · `broken` is a broken CONTRACT, and never degrades into absence', () => {
  it('every door rejects, including the optional ones', async () => {
    installErploraDouble({ broken: ['inventory.products.list'] });

    for (const door of READ_DOORS) {
      await expect(sdk()[door]('inventory.products.list'), `\`${door}\` explodes on a broken contract`)
        .rejects.toThrow();
    }
  });

  it('its code is NOT an absence code, so the screen reports an incident', async () => {
    installErploraDouble({ broken: ['inventory.products.list'] });

    const error = await sdk().queryAllOptional('inventory.products.list').catch((e: unknown) => e as { code?: string });

    expect(MODULE_ABSENT_CODES.has(String(error.code)),
      'a renamed query or a dead handler is an incident, not an absence (ADR-0400)').toBe(false);
  });
});

describe('4b · `failing` names the runtime CODE, for the tests that assert on the classification', () => {
  it('the ADR-0128 cascade (`module_inactive`) is an absence, like an uninstall', async () => {
    installErploraDouble({ failing: { 'inventory.products.list': 'module_inactive' } });

    expect(await sdk().queryAllOptional('inventory.products.list')).toBeUndefined();
  });

  it('any other code explodes through the optional doors too', async () => {
    installErploraDouble({ failing: { 'inventory.products.for_sale': 'query_not_found' } });

    const error = await sdk().queryAllOptional('inventory.products.for_sale').catch((e: unknown) => e as { code?: string });

    expect(error.code).toBe('query_not_found');
  });

  it('a failure with NO code is a broken contract too, not an absence', async () => {
    installErploraDouble({ failing: { 'inventory.products.list': undefined } });

    const error = await sdk().queryAllOptional('inventory.products.list').catch((e: unknown) => e as { code?: string });

    expect(error.code).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('5 · the paged door and the whole-set door differ, as they do in the SDK (sales#186)', () => {
  const MANY = Array.from({ length: 120 }, (_, i) => ({ id: `s-${i}`, name: `Servicio ${i}` }));

  it('`queryAll`/`queryAllOptional` bring the WHOLE set', async () => {
    installErploraDouble({ queries: { 'services.services.list': MANY }, pageSize: 50 });

    expect(await sdk().queryAllOptional('services.services.list')).toHaveLength(120);
  });

  it('`query`/`queryOptional` bring ONE page — the truncation sales#186 was about', async () => {
    installErploraDouble({ queries: { 'services.services.list': MANY }, pageSize: 50 });

    expect(await sdk().queryOptional('services.services.list')).toHaveLength(50);
    expect(await sdk().queryOptional('services.services.list', { limit: 500 })).toHaveLength(120);
  });
});

describe('5b · `queryPage` hands over the ENVELOPE the list engine answers with', () => {
  const MANY = Array.from({ length: 7 }, (_, i) => ({ id: `n-${i}` }));

  it('answers `{rows,total,limit,offset}` and honours the offset', async () => {
    installErploraDouble({ queries: { 'sales.quick_notes.list': MANY }, pageSize: 3 });

    expect(await sdk().queryPage('sales.quick_notes.list', { offset: 3 }))
      .toEqual({ rows: [{ id: 'n-3' }, { id: 'n-4' }, { id: 'n-5' }], total: 7, limit: 3, offset: 3 });
  });

  it('it is a REQUIRED door: an absent app rejects instead of answering an empty page', async () => {
    installErploraDouble({ absent: ['sales.quick_notes.list'] });

    await expect(sdk().queryPage('sales.quick_notes.list')).rejects.toThrow();
  });
});

describe('6 · `without` models an older shell that lacks a door', () => {
  it('the door is not on the object at all, so `typeof … === "function"` is false', async () => {
    installErploraDouble({ queries: { 'services.services.list': [] }, without: ['queryAllOptional'] });

    expect('queryAllOptional' in sdk(), 'the hub image lags behind the modules it serves').toBe(false);
    expect(typeof sdk().queryOptional, 'the fallback door is still there').toBe('function');
  });
});

describe('7 · commands and notices are recorded, so the test asserts on WHAT was dispatched', () => {
  it('keeps every command in order and answers `{}` by default', async () => {
    const double = installErploraDouble();

    const answer = await sdk().command('sales.order.open', { hub: 'h-1' });

    expect(double.commands).toEqual([{ name: 'sales.order.open', payload: { hub: 'h-1' } }]);
    expect(answer).toEqual({});
  });

  it('lets the test answer the command itself', async () => {
    const double = installErploraDouble({
      command: async (name) => (name === 'sales.order.open' ? { ok: true, new_ids: ['ord-1'] } : {}),
    });

    expect(await sdk().command('sales.order.open', {})).toEqual({ ok: true, new_ids: ['ord-1'] });
    expect(double.commands, 'answering it does not stop it being recorded').toHaveLength(1);
  });

  it('collects the notices the screen raises', async () => {
    const double = installErploraDouble();

    (sdk().notify as (n: { type: string; message: string }) => void)({ type: 'warning', message: 'ui.x' });

    expect(double.notices).toEqual([{ type: 'warning', message: 'ui.x' }]);
  });
});

describe('8 · the rest of the shell surface the till needs is there by default', () => {
  it('brings currency, formatting, translation, slots and permissions', () => {
    installErploraDouble();

    expect(sdk().currency).toBe('EUR');
    expect((sdk().formatMoney as (c: number) => string)(150)).toContain('1.50');
    expect((sdk().formatAmount as (u: number) => string)(2)).toContain('2.00');
    expect((sdk().t as (c: unknown, k: string) => string)({}, 'ui.charge'), 'the key IS the answer, so a test asserts on the key')
      .toBe('ui.charge');
    expect(typeof sdk().loadSlot).toBe('function');
    expect((sdk().hasPermission as () => boolean)()).toBe(true);
  });

  it('carries the scale of the hub currency, as the real client always does (pm#501)', () => {
    // The SDK client answers `currencyDecimals` with a number in every shell (a getter with its own
    // fallback), and a list that declares `moneyFilters` refuses to be built without it. A double
    // without it would fail every screen with a money filter for a reason the hub never has.
    installErploraDouble();
    expect(sdk().currencyDecimals).toBe(2);

    installErploraDouble({ extra: { currencyDecimals: 0 } });
    expect(sdk().currencyDecimals, 'a yen hub still says so through `extra`').toBe(0);
  });

  it('a spec value wins over the default, and `extra` adds what only one screen needs', () => {
    installErploraDouble({
      locale: 'en',
      hasPermission: (perm?: string) => perm !== 'sales.discount',
      extra: { deviceId: 'dev-1' },
    });

    expect(sdk().locale).toBe('en');
    expect((sdk().hasPermission as (p: string) => boolean)('sales.discount')).toBe(false);
    expect(sdk().deviceId).toBe('dev-1');
  });

  it('`setQuery` re-answers a read mid-test, without rebuilding the double', async () => {
    const double = installErploraDouble({ queries: { 'sales.payment_methods': [] } });
    expect(await sdk().query('sales.payment_methods')).toEqual([]);

    double.setQuery('sales.payment_methods', [{ id: 'pm-cash' }]);

    expect(await sdk().query('sales.payment_methods')).toEqual([{ id: 'pm-cash' }]);
  });

  it('`setAbsent` uninstalls an app under the screen\'s feet', async () => {
    const double = installErploraDouble({ queries: { 'services.services.list': [{ id: 's-1' }] } });

    double.setAbsent('services.services.list');

    expect(await sdk().queryAllOptional('services.services.list')).toBeUndefined();
  });
});

// ── sales#234 · the same double, handed over as an ARGUMENT ──────────────────────────────────
//
// The pure functions of `ui/lib/` never read the shell: they take the client as a parameter
// (`ErploraClientLike`). Their suites therefore built a client by hand — the exact fifteenth copy
// sales#233 set out to stop, and the one the guard had to exempt file by file. What they were
// missing was not a rule but a door: a way to get this double WITHOUT installing it on the shell.
describe('9 · `makeErploraDouble` builds the double without touching the shell (sales#234)', () => {
  it('answers through `sdk` and leaves `globalThis.erplora` alone', async () => {
    (globalThis as { erplora?: unknown }).erplora = undefined;

    const double = makeErploraDouble({ queries: { 'sales.order.lines': [{ id: 'l-1' }] } });

    expect(await (double.sdk as SdkLike).query('sales.order.lines')).toEqual([{ id: 'l-1' }]);
    expect((globalThis as { erplora?: unknown }).erplora, 'a lib test has no shell to install into')
      .toBeUndefined();
  });

  it('keeps the net: an unconfigured read is recorded even when the caller swallows it', async () => {
    const double = makeErploraDouble({ allowUnconfiguredReads: true });

    // `loadTaxCatalog` and the till's `optionalRead` both end in a bare `catch`, so the throw alone
    // proves nothing. What fails the test is the RECORD surviving that catch.
    await (double.sdk as SdkLike).queryAll('taxes.rules.list').catch(() => undefined);

    expect(drainUnconfiguredReads().map((r) => r.name)).toEqual(['taxes.rules.list']);
  });

  it('`installErploraDouble` is the same double, plus the shell assignment', () => {
    const double = installErploraDouble({ queries: {} });

    expect((globalThis as { erplora?: unknown }).erplora, 'the shell gets the very same object')
      .toBe(double.sdk);
  });
});
