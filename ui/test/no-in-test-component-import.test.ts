// sales#363 — a Web Component is loaded ONCE per file, at the top, never inside a test's clock.
//
// Loading `erp-pos-touch` (Lit + outfitkit + ~60 helpers) costs ~1 s on a quiet machine. When a
// suite did it with `await import('./erp-pos-touch')` inside its `mount()`, that second was charged
// to the 5 s budget of the FIRST test; with the machine loaded it took longer than 5 s, and the
// damage did not stop there:
//
//   - every following test awaited the SAME pending import, so the whole file timed out in a row
//     (83-142 timeouts per loaded run, and three on the GitHub gate of sales#365);
//   - when the import finally resolved, the `mount()` of the test vitest had already given up on
//     carried on and appended a SECOND till to the DOM of the test that was running — the «expected
//     length 1 but got 2» and the foreign totals that looked like bugs of the till.
//
// A static `import './erp-pos-touch'` at the top of the file is resolved while vitest COLLECTS the
// file, before any test clock starts, and it is resolved once. The same goes for the hand patches
// that moved it to a `beforeAll` with a 30-60 s timeout: they only moved the race to a bigger
// number. `vi.resetModules()` next to a component defeats the point too — it throws the graph away
// so the next test pays the load again (and the custom-element registry keeps the first class
// anyway, so it never isolated anything).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI_DIR = join(import.meta.dirname, '..');
/** This guard spells out the shapes it forbids. */
const SELF = join('test', 'no-in-test-component-import.test.ts');

function testFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFiles(full, join(prefix, entry)));
    else if (entry.endsWith('.test.ts')) out.push(join(prefix, entry));
  }
  return out;
}

const SOURCES = testFiles(UI_DIR)
  .filter((f) => f !== SELF)
  .map((f) => ({ file: f, source: readFileSync(join(UI_DIR, f), 'utf8') }));

/** A dynamic import of a path ending in `/erp-<name>`: the module of a Web Component
 *  (`ui/components/erp-*`). Worded without a literal call on purpose: the gate reads import
 *  specifiers out of every `ui/` file, comments included. */
const DYNAMIC_COMPONENT_IMPORT = /\bimport\(\s*['"][^'"]*\/erp-[a-z-]+(?:\.js)?['"]\s*\)/;

describe('a component is loaded at the top of its test file, not inside a test (sales#363)', () => {
  it('no test file loads a Web Component with a dynamic import()', () => {
    const guilty = SOURCES.filter((f) => DYNAMIC_COMPONENT_IMPORT.test(f.source)).map((f) => f.file);

    expect(guilty, 'write `import \'./erp-…\';` at the top of the file: an import inside a test or a '
      + 'hook is paid on that test\'s clock, and on a loaded machine it times out the whole file and '
      + 'mounts a stray component into the next test (sales#363)').toEqual([]);
  });

  it('no test file that mounts a component throws the module graph away between tests', () => {
    const guilty = SOURCES
      .filter((f) => /\bvi\.resetModules\(\)/.test(f.source) && /['"][^'"]*\/erp-[a-z-]+(?:\.js)?['"]/.test(f.source))
      .map((f) => f.file);

    expect(guilty, '`vi.resetModules()` makes the next test load the component again, on its own clock; '
      + 'the custom-element registry keeps the first definition anyway').toEqual([]);
  });

  it('the rule sees the shape it forbids (control)', () => {
    expect(DYNAMIC_COMPONENT_IMPORT.test("  await import('./erp-pos-touch');")).toBe(true);
    expect(DYNAMIC_COMPONENT_IMPORT.test("mount('x', () => import('./components/erp-pos-quick-notes/erp-pos-quick-notes'))")).toBe(true);
    expect(DYNAMIC_COMPONENT_IMPORT.test("import './erp-pos-touch';"), 'the static import is the fix').toBe(false);
    expect(DYNAMIC_COMPONENT_IMPORT.test("await import('../../lib/checkout-key.js')"), 'a plain helper is not a component').toBe(false);
  });
});
