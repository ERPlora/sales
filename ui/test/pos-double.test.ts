// sales#233 — the till's read surface, declared once.
//
// `installErploraDouble` fixes the DOORS: an answer is keyed by query NAME, so the day the screen
// moves a read from `queryAll` to `queryAllOptional` no double is left behind — which is exactly
// what sales#231 was. What it cannot fix on its own is the OTHER half of a hand-made double: every
// till suite listing, again, the fifteen queries the POS reads on mount. That list is what
// `installPosDouble` owns, so a read the screen gains is one edit here and not thirty.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_ABSENT_CODES } from '../lib/dependency-read';
import { installPosDouble, POS_READS } from './pos-double';

interface SdkLike {
  query(name: string, params?: Record<string, unknown>): Promise<unknown>;
  queryAll(name: string, params?: Record<string, unknown>): Promise<unknown>;
  queryOptional(name: string, params?: Record<string, unknown>): Promise<unknown>;
  queryAllOptional(name: string, params?: Record<string, unknown>): Promise<unknown>;
  [key: string]: unknown;
}
const sdk = () => (globalThis as { erplora?: SdkLike }).erplora as SdkLike;

describe('1 · every read the till makes is answered, named or not', () => {
  it('answers each declared query without the test having to list it', async () => {
    installPosDouble();

    for (const name of POS_READS) {
      await expect(sdk().queryAllOptional(name), `the till reads \`${name}\` on mount`)
        .resolves.not.toThrow();
    }
  });

  it('a read the till makes and this file does NOT know about still throws', async () => {
    installPosDouble({ allowUnconfiguredReads: true });

    await expect(sdk().queryAll('loyalty.points.list')).rejects.toThrow(/loyalty\.points\.list/);
  });
});

describe('1b · the surface is read off the till itself, so it cannot fall behind it', () => {
  /** The till and the libraries only it uses: every SDK read of the POS lives in these. */
  const SOURCES = [
    join('components', 'erp-pos-touch', 'erp-pos-touch.ts'),
    join('lib', 'pos-cart.ts'),
    join('lib', 'pos-tax.ts'),
    // The sale document the till mounts inside its own modal reads through the same double.
    join('components', 'erp-sales-document', 'erp-sales-document.ts'),
  ];
  /** `…query|queryAll|queryOptional|queryAllOptional<T>('some.query.name'`. The generic is matched
   *  up to the opening paren and not with `<[^>]*>`, because a nested one (`<A<B> | C[]>`) closes
   *  the class early and the read disappears from the scan — which is how `invoice.by_source` hid. */
  const SDK_READ = /\.(?:query|queryAll|queryOptional|queryAllOptional)\s*(?:<[^(]*>)?\(\s*'([a-z][\w.]*\.[\w.]+)'/g;

  it('every query the till reads is in `POS_READS`', () => {
    const read = new Set<string>();
    for (const source of SOURCES) {
      const text = readFileSync(join(import.meta.dirname, '..', source), 'utf8');
      for (const m of text.matchAll(SDK_READ)) read.add(m[1]);
    }

    const missing = [...read].filter((name) => !POS_READS.includes(name) && name !== 'sales.pos_settings.get');

    expect(missing, 'a read the till gained and this double never heard of would starve every POS '
      + 'suite in the same silence as sales#231 — add it to `READS` in `ui/test/pos-double.ts`')
      .toEqual([]);
  });
});

describe('2 · what an app that IS installed answers, and what a missing one answers', () => {
  it('an app of the hub answers `[]` until the test gives it rows: installed, nothing to sell', async () => {
    installPosDouble();

    expect(await sdk().queryAllOptional('inventory.products.list')).toEqual([]);
    expect(await sdk().queryAll('taxes.rules.list')).toEqual([]);
  });

  it('an OPTIONAL app is absent until the test puts it in the hub (ADR-0127)', async () => {
    installPosDouble();

    expect(await sdk().queryAllOptional('services.services.list'),
      'a bar has no `services` module, and `undefined` is how the runtime says so').toBeUndefined();
    expect(await sdk().queryOptional('modifiers.for_target', { target_id: 'p-1' })).toBeUndefined();
  });

  it('naming its rows installs it', async () => {
    installPosDouble({ services: [{ id: 's-1', name: 'Corte' }] });

    expect(await sdk().queryAllOptional('services.services.list')).toEqual([{ id: 's-1', name: 'Corte' }]);
  });

  it('`absentModules` takes an app OUT of the hub, queries and all', async () => {
    installPosDouble({ products: [{ id: 'p-1' }], absentModules: ['inventory'] });

    expect(await sdk().queryAllOptional('inventory.products.list')).toBeUndefined();
    const error = await sdk().queryAll('inventory.products.list').catch((e: unknown) => e as { code?: string });
    expect(MODULE_ABSENT_CODES.has(String(error.code))).toBe(true);
  });

  it('`brokenModules` is the app that IS here and does not answer — an incident, not an absence', async () => {
    installPosDouble({ brokenModules: ['inventory'] });

    const error = await sdk().queryAllOptional('inventory.products.list').catch((e: unknown) => e as { code?: string });

    expect(MODULE_ABSENT_CODES.has(String(error.code)),
      'the cashier has to be told the grid broke, not left wondering (sales#25)').toBe(false);
  });
});

describe('3 · the settings row, which is a row and not a list', () => {
  it('hands back the row the test wrote, wrapped the way `sales.pos_settings.get` answers', async () => {
    installPosDouble({ settings: { require_customer: 1 } });

    expect(await sdk().query('sales.pos_settings.get')).toEqual([{ require_customer: 1 }]);
  });

  it('answers no row at all when the hub never saved one (sales#223)', async () => {
    installPosDouble();

    expect(await sdk().query('sales.pos_settings.get')).toEqual([]);
  });
});
