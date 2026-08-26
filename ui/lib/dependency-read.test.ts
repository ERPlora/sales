// sales#25 — "the app is not here" and "the app answered badly" are NOT the same fact, and the
// till has to tell them apart before it decides whether to stay quiet.
//
// Until now every read of a HARD dependency (`inventory`, `taxes`) ended in `.catch(() => [])`.
// That single line answers both facts with an empty catalogue: a hub whose `inventory` was force
// uninstalled (hub#1101) and a hub whose `inventory` is installed and whose query is broken look
// EXACTLY the same on screen — an empty grid, no warning, and a shift spent wondering where the
// products went. The runtime already tells them apart (hub#1074, ADR-0400): absence comes back
// with `module_not_installed` / `module_inactive`, anything else is an incident.
//
// The assertions below are on the SHAPE of the outcome (`absent` / `broken` / rows), never on
// prose: the wording of the notice lives in `locales/`.
import { describe, expect, it } from 'vitest';
import { dependencyRead, isModuleAbsent } from './dependency-read.js';

/** A rejection the way the SDK surfaces a runtime refusal: an Error carrying the stable code. */
function runtimeError(code: string): Error & { code: string } {
  return Object.assign(new Error(`runtime says ${code}`), { code });
}

describe('a read of a hard dependency separates absence from a broken contract', () => {
  it('returns the rows when the read answers', async () => {
    const out = await dependencyRead<{ id: string }>(async () => [{ id: 'p-1' }]);
    expect(out.rows).toEqual([{ id: 'p-1' }]);
    expect(out.absent).toBe(false);
    expect(out.broken).toBe(false);
  });

  it('unwraps the paginated envelope the list engine answers with', async () => {
    const out = await dependencyRead<{ id: string }>(async () => ({ rows: [{ id: 'p-1' }], total: 1 }));
    expect(out.rows).toEqual([{ id: 'p-1' }]);
    expect(out.broken).toBe(false);
  });

  it('an UNINSTALLED module is absence: no rows, and nothing to alarm about', async () => {
    const out = await dependencyRead(async () => { throw runtimeError('module_not_installed'); });
    expect(out.absent).toBe(true);
    expect(out.broken).toBe(false);
    expect(out.rows).toEqual([]);
  });

  it('a module switched off by the ADR-0128 cascade is absence too', async () => {
    const out = await dependencyRead(async () => { throw runtimeError('module_inactive'); });
    expect(out.absent).toBe(true);
    expect(out.broken).toBe(false);
  });

  it('ANY other failure is a BROKEN CONTRACT: the app is there and did not answer', async () => {
    const out = await dependencyRead(async () => { throw runtimeError('permission_denied'); });
    expect(out.absent).toBe(false);
    expect(out.broken, 'a broken read swallowed as an empty catalogue is the silent failure').toBe(true);
    expect(out.rows).toEqual([]);
  });

  it('a failure with no code at all is broken, not absent', async () => {
    const out = await dependencyRead(async () => { throw new Error('boom'); });
    expect(out.broken).toBe(true);
    expect(out.absent).toBe(false);
  });

  it('a thrown non-Error does not escape either', async () => {
    const out = await dependencyRead(async () => { throw 'boom'; });
    expect(out.broken).toBe(true);
  });
});

describe('isModuleAbsent reads the CODE, never the sentence', () => {
  it('accepts only the two codes the runtime answers absence with', () => {
    expect(isModuleAbsent(runtimeError('module_not_installed'))).toBe(true);
    expect(isModuleAbsent(runtimeError('module_inactive'))).toBe(true);
    expect(isModuleAbsent(runtimeError('module_broken'))).toBe(false);
  });

  it('a sentence that MENTIONS the module being uninstalled is not absence', () => {
    // The prose is translated and rewritten; branching on it is how a Spanish hub and an English
    // one end up behaving differently (the lesson of the hub e2e that asserted on error prose).
    expect(isModuleAbsent(new Error('module_not_installed'))).toBe(false);
  });

  it('null, undefined and a bare string are not absence', () => {
    expect(isModuleAbsent(null)).toBe(false);
    expect(isModuleAbsent(undefined)).toBe(false);
    expect(isModuleAbsent('module_not_installed')).toBe(false);
  });
});
