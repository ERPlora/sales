// sales#233 — the guard that keeps the fifteenth hand-made double from ever being written.
//
// The fix for sales#231 was one file. The DEFECT was a pattern: every suite building its own
// `globalThis.erplora` by hand, each frozen on the SDK doors that existed the day it was written.
// Migrating them all fixes today; only a mechanical rule fixes tomorrow, because the next suite is
// written by someone who never read sales#231 and copies the file next to it.
//
// So: no test file may assign `globalThis.erplora` or spell out the SDK read doors as object keys.
// `installErploraDouble` is the one door in, and a door added to the SDK is one edit there.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI_DIR = join(import.meta.dirname, '..');
/** The helper IS the double, so it is the one place these shapes are allowed to appear. */
const HELPER = join('test', 'erplora-double.ts');
/** …and its own suite, which asserts on what the helper answers. This guard is exempt too: the
 *  shapes it forbids have to be written down somewhere to be forbidden. */
const EXEMPT = new Set([join('test', 'erplora-double.test.ts'), join('test', 'no-ad-hoc-erplora-double.test.ts')]);

/** Installing the double by hand: the assignment that starts every one of the old copies. */
const HAND_INSTALL = /\(\s*globalThis[^)]*\)\s*(?:as[^=]*)?\.erplora\s*=|globalThis\.erplora\s*=/;
/** Spelling out a read door as an object key: the copy that goes stale when the SDK grows one. */
const HAND_DOOR = /^\s*(query|queryAll|queryOptional|queryAllOptional)\s*:/m;
/** The escape hatch of the helper's own suite. Nobody else provokes unanswered reads on purpose. */
const ESCAPE_HATCH = /allowUnconfiguredReads/;

function testFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFiles(full, join(prefix, entry)));
    else if (entry.endsWith('.test.ts')) out.push(join(prefix, entry));
  }
  return out;
}

const OFFENDERS = testFiles(UI_DIR)
  .filter((f) => !EXEMPT.has(f))
  .map((f) => ({ file: f, source: readFileSync(join(UI_DIR, f), 'utf8') }));

describe('the `erplora` double is built in ONE place (sales#233)', () => {
  it('no test file installs its own on `globalThis`', () => {
    const guilty = OFFENDERS.filter((f) => HAND_INSTALL.test(f.source)).map((f) => f.file);

    expect(guilty, 'use `installErploraDouble()` from `ui/test/erplora-double`: a double written by '
      + 'hand freezes on the SDK doors of its writing day, and the one that fell behind left five '
      + 'cases of the «customer required» guard testing nothing (sales#231)').toEqual([]);
  });

  it('no test file spells out a read door of the SDK', () => {
    const guilty = OFFENDERS.filter((f) => HAND_DOOR.test(f.source)).map((f) => f.file);

    expect(guilty, '`query`/`queryAll`/`queryOptional`/`queryAllOptional` live in '
      + '`ui/test/erplora-double.ts` and nowhere else — that is what makes a new door ONE edit')
      .toEqual([]);
  });

  it('only the helper\'s own suite may provoke unanswered reads', () => {
    const guilty = OFFENDERS.filter((f) => ESCAPE_HATCH.test(f.source)).map((f) => f.file);

    expect(guilty, '`allowUnconfiguredReads` switches off the net that caught sales#231: it exists '
      + 'to test the net itself, never to quiet it in a suite that is short a read').toEqual([]);
  });

  it('the helper itself is where the doors are declared', () => {
    const helper = readFileSync(join(UI_DIR, HELPER), 'utf8');

    for (const door of ['query', 'queryAll', 'queryOptional', 'queryAllOptional']) {
      expect(helper, `the helper answers \`${door}\``).toContain(`${door}:`);
    }
  });
});
