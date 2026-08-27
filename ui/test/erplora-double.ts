// erplora-double — the ONE test double of `globalThis.erplora` the module's suites share (sales#233).
//
// Why one, and why it throws:
//
// Fourteen test files each built their own double by hand, each listing the SDK doors that existed
// the day it was written. When sales#25 moved the till's catalogue reads onto the OPTIONAL door
// (`queryAllOptional`, ADR-0127), thirteen were updated and one was not. That one kept answering
// `[]` through the new door, so its grid painted no products, its cart never filled, and the five
// cases of the «customer required» guard died on the empty grid — passing nothing, for a whole day,
// while looking exactly like a suite that works (sales#231).
//
// The defect was not the missing door. It was the DEFAULT: a double that answers "there is nothing"
// to a read the screen takes for granted turns a broken assumption into a green test. So here an
// unconfigured read THROWS, naming the query and the file. Absence and a broken contract are still
// perfectly sayable — but only by name, in `absent` and `broken`, which is the whole point: what a
// test claims about a missing app is now written down instead of inferred from an empty array.
//
// Fidelity to the runtime (`hub/packages/module-sdk`), because a double that lies is worse than
// none:
//   · `query` / `queryOptional`      → ONE page, capped by `limit ?? pageSize` (sales#186)
//   · `queryAll` / `queryAllOptional`→ the WHOLE set
//   · owner module absent  → `undefined` through the optional doors, `module_not_installed`
//                            through the required ones
//   · broken contract      → rejects through ALL FOUR doors with a non-absence code, so the
//                            screen's classifier calls it an incident and not an absence (ADR-0400)
import { afterEach } from 'vitest';

/** What a configured query answers: the rows, or a function of the params it was asked with. */
export type QueryAnswer =
  | unknown[]
  | ((params: Record<string, unknown> | undefined) => unknown[] | Promise<unknown[]>);

/** The four read doors of the SDK. */
export type ReadDoor = 'query' | 'queryAll' | 'queryOptional' | 'queryAllOptional';

/** Any part of the double a screen may find missing on an older hub image (sales#186). */
export type OptionalDoor = ReadDoor | 'loadSlot' | 'hasPermission' | 'notify' | 'on';

export interface Notice { type: string; message: string }

export interface ErploraDoubleSpec {
  /** The reads this screen is allowed to make, by query name. Anything else throws. */
  queries?: Record<string, QueryAnswer>;
  /** Queries whose owner module is NOT installed in this hub (ADR-0127). */
  absent?: string[];
  /** Queries whose contract is broken: renamed query, denied permission, dead handler. */
  broken?: string[];
  /** Answers a command. The default records it and answers `{}`. */
  command?: (name: string, payload: Record<string, unknown>) => unknown | Promise<unknown>;
  /** The fillers the shell mounts in a slot. Defaults to none. */
  loadSlot?: (slot: string) => unknown[] | Promise<unknown[]>;
  /** Receives the notices the screen raises. They are recorded either way. */
  notify?: (n: Notice) => void;
  /** Translation. The default answers the KEY, so a test asserts on the key and not on prose. */
  t?: (catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>) => string;
  locale?: string;
  currency?: string;
  formatMoney?: (cents: number) => string;
  formatAmount?: (units: number) => string;
  hasPermission?: (permission?: string) => boolean;
  on?: (event: string, cb: (payload: unknown) => void) => () => void;
  /** The page the paged doors answer with when no `limit` is asked for (the manifest's default). */
  pageSize?: number;
  /** Doors to LEAVE OUT: an older hub image whose SDK does not have them yet (sales#186). */
  without?: OptionalDoor[];
  /** Anything one screen needs and nobody else does. Kept narrow on purpose. */
  extra?: Record<string, unknown>;
  /**
   * This test provokes unconfigured reads ON PURPOSE. Only this helper's own suite may say so —
   * the contract test in `ui/test/no-ad-hoc-erplora-double.test.ts` enforces that.
   */
  allowUnconfiguredReads?: boolean;
}

export interface RecordedRead {
  door: ReadDoor;
  name: string;
  params?: Record<string, unknown>;
}

export interface ErploraDouble {
  /** Every read the screen made, in order, with the door it used and the params it passed. */
  reads: RecordedRead[];
  /** Every command the screen dispatched, in order. */
  commands: { name: string; payload: Record<string, unknown> }[];
  /** Every notice the screen raised, in order. */
  notices: Notice[];
  /** Re-answer one read mid-test, without rebuilding the double. */
  setQuery(name: string, answer: QueryAnswer): void;
  /** Declare a read absent mid-test (the module was uninstalled under the screen's feet). */
  setAbsent(name: string): void;
  /** The object installed on `globalThis.erplora`. */
  sdk: Record<string, unknown>;
}

/**
 * The runtime's ceiling for one request. `queryOptional` on a list query never brings more than
 * this, which is the truncation `queryAllOptional` exists to remove (sales#186).
 */
const MAX_LIMIT = 500;
/** The manifest's default page size. */
const DEFAULT_PAGE_SIZE = 50;

/** The code the runtime rejects with when the owner module is not in this hub (hub#1074). */
const MODULE_NOT_INSTALLED = 'module_not_installed';
/** A broken contract: not an absence, so the screen reports an incident (ADR-0400). */
const QUERY_FAILED = 'query_failed';

/** A rejection shaped like the SDK's `ErploraError`: what matters is the stable `code`. */
class DoubleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}

/**
 * Reads nobody configured, kept OUTSIDE the throw.
 *
 * The till swallows failures on accessory reads on purpose (`optionalRead` ends in
 * `catch { return undefined; }`), so a throw alone can still be eaten and the test would go green
 * on a double that answered nothing — which is precisely sales#231 again. The record survives the
 * catch, and the net below turns it into a red test.
 */
let unconfigured: RecordedRead[] = [];
/** Set by `allowUnconfiguredReads`, for the suite that provokes them on purpose. */
let netSuppressed = false;

/** Takes the unconfigured reads seen so far and clears the record. */
export function drainUnconfiguredReads(): RecordedRead[] {
  const seen = unconfigured;
  unconfigured = [];
  return seen;
}

// The net. Registered once per test file (vitest isolates the module graph per file), so no suite
// can opt out of it by forgetting a hook.
afterEach(() => {
  const missed = drainUnconfiguredReads();
  const suppressed = netSuppressed;
  netSuppressed = false;
  if (suppressed || missed.length === 0) return;
  throw new Error(
    `erplora test double: ${missed.length} read(s) went unanswered and the screen swallowed the `
    + 'failure, so this test proved less than it claims:\n'
    + missed.map((r) => `  · \`${r.name}\` (${r.door})`).join('\n')
    + '\nDeclare each one in `installErploraDouble({ queries: … })`, or say what it is with '
    + '`absent` (the owner module is not in this hub) or `broken` (its contract is broken).',
  );
});

/** The test file being run, for an error message that says WHERE the double is short. */
function currentTestFile(): string {
  const line = new Error().stack?.split('\n').find((l) => l.includes('.test.ts')) ?? '';
  const match = line.match(/([\w.-]+\.test\.ts)/);
  return match ? match[1] : 'this test file';
}

function unconfiguredRead(door: ReadDoor, name: string, params?: Record<string, unknown>): never {
  unconfigured.push({ door, name, ...(params === undefined ? {} : { params }) });
  throw new Error(
    `erplora test double: nothing is configured for the query \`${name}\` (asked through `
    + `\`${door}\` from ${currentTestFile()}).\n`
    + 'A double that answers `[]` to a read the screen takes for granted is a mock that lies: it is '
    + 'what left five cases of the «customer required» guard testing nothing for a day (sales#231).\n'
    + `Say what this read is: \`queries: { '${name}': [ … ] }\` if the app answers, `
    + `\`absent: ['${name}']\` if the app is not in this hub, `
    + `or \`broken: ['${name}']\` if its contract is broken.`,
  );
}

async function rowsFor(answer: QueryAnswer, params?: Record<string, unknown>): Promise<unknown[]> {
  return typeof answer === 'function' ? await answer(params) : answer;
}

/**
 * Builds the double and installs it on `globalThis.erplora`, the way the shell does.
 *
 * Every test that mounts a Web Component of this module goes through here. Adding a door to the SDK
 * is one edit in this file, and no suite is left behind.
 */
export function installErploraDouble(spec: ErploraDoubleSpec = {}): ErploraDouble {
  const queries = new Map<string, QueryAnswer>(Object.entries(spec.queries ?? {}));
  const absent = new Set(spec.absent ?? []);
  const broken = new Set(spec.broken ?? []);
  const pageSize = spec.pageSize ?? DEFAULT_PAGE_SIZE;
  const without = new Set<OptionalDoor>(spec.without ?? []);
  if (spec.allowUnconfiguredReads) netSuppressed = true;

  const reads: RecordedRead[] = [];
  const commands: { name: string; payload: Record<string, unknown> }[] = [];
  const notices: Notice[] = [];

  /** The shared body of all four doors: record, then answer what the test declared. */
  async function read(
    door: ReadDoor,
    optional: boolean,
    whole: boolean,
    name: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    reads.push({ door, name, ...(params === undefined ? {} : { params }) });
    if (broken.has(name)) {
      throw new DoubleError(QUERY_FAILED, `the contract of \`${name}\` is broken in this test`);
    }
    if (absent.has(name)) {
      if (optional) return undefined;
      throw new DoubleError(MODULE_NOT_INSTALLED, `the app that owns \`${name}\` is not installed`);
    }
    const answer = queries.get(name);
    if (answer === undefined) return unconfiguredRead(door, name, params);
    const rows = await rowsFor(answer, params);
    if (whole) return rows;
    // The paged doors answer ONE page, capped exactly like the runtime caps it.
    const limit = Math.min(Number(params?.limit ?? pageSize), MAX_LIMIT);
    return rows.slice(0, limit);
  }

  const sdk: Record<string, unknown> = {
    query: (name: string, params?: Record<string, unknown>) => read('query', false, false, name, params),
    queryAll: (name: string, params?: Record<string, unknown>) => read('queryAll', false, true, name, params),
    queryOptional: (name: string, params?: Record<string, unknown>) => read('queryOptional', true, false, name, params),
    queryAllOptional: (name: string, params?: Record<string, unknown>) => read('queryAllOptional', true, true, name, params),
    command: async (name: string, payload: Record<string, unknown> = {}) => {
      commands.push({ name, payload });
      return spec.command ? await spec.command(name, payload) : {};
    },
    loadSlot: async (slot: string) => (spec.loadSlot ? await spec.loadSlot(slot) : []),
    notify: (n: Notice) => {
      notices.push(n);
      spec.notify?.(n);
    },
    on: spec.on ?? (() => () => {}),
    hasPermission: spec.hasPermission ?? (() => true),
    locale: spec.locale ?? 'es',
    currency: spec.currency ?? 'EUR',
    formatMoney: spec.formatMoney ?? ((cents: number) => `${((cents || 0) / 100).toFixed(2)} €`),
    formatAmount: spec.formatAmount ?? ((units: number) => `${(units || 0).toFixed(2)} €`),
    t: spec.t ?? ((_catalog: Record<string, unknown>, key: string) => key),
    ...(spec.extra ?? {}),
  };
  for (const door of without) delete sdk[door];

  (globalThis as Record<string, unknown>).erplora = sdk;

  return {
    reads,
    commands,
    notices,
    setQuery: (name: string, answer: QueryAnswer) => {
      absent.delete(name);
      broken.delete(name);
      queries.set(name, answer);
    },
    setAbsent: (name: string) => {
      queries.delete(name);
      broken.delete(name);
      absent.add(name);
    },
    sdk,
  };
}
