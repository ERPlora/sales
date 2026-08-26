// dependency-read — reading another app's catalogue WITHOUT confusing "it is not here" with
// "it did not answer" (sales#25).
//
// The till reads three kinds of app:
//
//   · OPTIONAL (`services`, `combos`, `modifiers`, `appointments`) — not in `depends_on`, so
//     absence is the normal case. That is `optionalRead`/`optionalReadAll` in the POS: `undefined`
//     and the till is exactly the one it always was.
//   · HARD (`inventory`, `taxes`) — declared in `depends_on`, so they SHOULD be here. Absence is
//     still possible (a forced uninstall, hub#1101; the ADR-0128 cascade switching one off) and it
//     degrades; a failure is an INCIDENT and has to be visible.
//   · The module's own reads, which are neither.
//
// Until now the hard ones all ended in `.catch(() => [])`, which answers both facts with an empty
// catalogue: the shift opens with an empty grid, no warning, and nobody knows whether the app was
// uninstalled or its query is broken. The runtime does tell them apart (hub#1074, ADR-0400) — this
// is the classifier that carries that distinction up to the screen.

/** The two codes the runtime answers with to say "that app is not in this hub" (hub#1074,
 *  ADR-0400). Same pair the SDK's `queryOptional` turns into `undefined`, so the two doors cannot
 *  disagree about what absence means. */
export const MODULE_ABSENT_CODES: ReadonlySet<string> = new Set(['module_not_installed', 'module_inactive']);

/** Is this rejection the runtime saying "that app is not here"?
 *
 *  Reads the stable CODE, never the sentence: the prose is translated and rewritten, and branching
 *  on it makes a Spanish hub behave differently from an English one. */
export function isModuleAbsent(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && MODULE_ABSENT_CODES.has(code);
}

/** The outcome of reading a hard dependency's catalogue. `absent` and `broken` are exclusive. */
export interface DependencyRead<T> {
  /** What arrived. Empty on both failures — the till has nothing extra to offer either way. */
  rows: T[];
  /** The app is NOT in this hub. Legitimate: the till degrades and stays quiet. */
  absent: boolean;
  /** The app IS in this hub and the read failed. An incident: it has to reach the user. */
  broken: boolean;
}

/** Rows out of either shape the runtime answers with: a bare array, or the list engine's
 *  `{ rows, total }` envelope. */
function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

/** Runs `read` and classifies its failure. Never throws: the till is the screen that cannot break,
 *  so the caller gets a verdict, not an exception. */
export async function dependencyRead<T>(read: () => Promise<unknown>): Promise<DependencyRead<T>> {
  try {
    return { rows: toRows<T>(await read()), absent: false, broken: false };
  } catch (e) {
    const absent = isModuleAbsent(e);
    return { rows: [], absent, broken: !absent };
  }
}
