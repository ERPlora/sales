// sales#207 (ADR-0398) — the module DECLARES the domain error codes it provides.
//
// Until the `errors` block existed, a code was born as a string literal in the Rust handler and
// died where it was born: nothing compared this version's surface with the published one, so
// retiring or renaming one was a silent break for every consumer (that is how `appointments`
// took the hub's pre-push gate down for the whole fleet in under an hour, appointments#70/#71).
//
// This is the module's own copy of the toolkit guard, and it stays here on purpose: `erplora
// validate` runs in the gate, this runs on `vitest` while the handler is being edited, and a
// module that only finds out at publish time finds out too late.
//
// 🔴 Every assertion here is about the SHAPE of the catalogue — which codes, which keys, which
// languages — never about the prose. A test that pinned the sentence would turn rewording a
// message into a red build, and the sentence is exactly the part that is meant to change.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../../module.json' with { type: 'json' };
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };

const MODULE_ID = 'sales';

type Catalog = { errors?: Record<string, string> };
const declared = (manifest as { errors?: Record<string, unknown> }).errors ?? {};

/**
 * The codes the handler names literally, minus the ones that are not codes: an internal
 * sub-command (`sales._insert_sale`, the `_` marker of ADR-0166) and a QUERY or COMMAND the
 * handler reads by name (`sales.get`), which has the very same shape as a code —
 * ERPlora/module-toolkit#107.
 */
function emittedCodes(): string[] {
  const names = new Set([
    ...Object.keys((manifest as { queries?: object }).queries ?? {}),
    ...Object.keys((manifest as { commands?: object }).commands ?? {}),
  ]);
  const src = readFileSync(join(process.cwd(), 'handler', 'src', 'lib.rs'), 'utf8');
  const found = new Set<string>();
  for (const m of src.matchAll(new RegExp(`"(${MODULE_ID}\\.[a-z][a-z0-9_]*)"`, 'g'))) {
    const code = m[1];
    if (code.slice(MODULE_ID.length + 1).startsWith('_')) continue;
    if (names.has(code)) continue;
    found.add(code);
  }
  return [...found].sort();
}

describe('module.json → errors (ADR-0398)', () => {
  // A catalogue that emptied itself would make every loop below pass over nothing, and an empty
  // guard is greener than a working one (the silent-skip trap).
  it('is DECLARED — the block exists and is not empty', () => {
    expect(Object.keys(declared).length).toBeGreaterThan(0);
  });

  it('declares every code the handler raises, and raises every code it declares', () => {
    expect(Object.keys(declared).sort()).toEqual(emittedCodes());
  });

  it('declares every `expect_rows.error` of the manifest — the derived link (ADR-0398 §1)', () => {
    const commands = (manifest as { commands?: Record<string, { expect_rows?: { error?: string } }> }).commands ?? {};
    for (const [name, command] of Object.entries(commands)) {
      const code = command?.expect_rows?.error;
      if (code) expect(Object.keys(declared), `commands.${name}`).toContain(code);
    }
  });

  it('is the ADR-0205 ABI: `<module>.<snake_case>`, always in this module’s namespace', () => {
    for (const code of Object.keys(declared)) {
      expect(code).toMatch(new RegExp(`^${MODULE_ID}\\.[a-z][a-z0-9_]*$`));
      expect(code.length).toBeLessThanOrEqual(128);
    }
  });

  it('carries only a state, never the message: the text lives in locales/ (ADR-0398 §2)', () => {
    for (const [code, value] of Object.entries(declared)) {
      expect(value, code).toBeTypeOf('object');
      expect(Object.keys(value as object).every((k) => k === 'deprecated'), code).toBe(true);
    }
  });

  it('has an `errors.<code>` text in en AND es for every declared code (ADR-0055)', () => {
    for (const code of Object.keys(declared)) {
      for (const [lang, catalog] of [['en', en], ['es', es]] as Array<[string, Catalog]>) {
        const text = catalog.errors?.[code];
        expect(typeof text, `locales/${lang}.json → errors.${code}`).toBe('string');
        expect((text ?? '').trim().length, `locales/${lang}.json → errors.${code}`).toBeGreaterThan(0);
      }
    }
  });

  it('translates the same set of codes in both languages — no leftovers on either side', () => {
    expect(Object.keys((es as Catalog).errors ?? {}).sort()).toEqual(Object.keys((en as Catalog).errors ?? {}).sort());
    expect(Object.keys((en as Catalog).errors ?? {}).sort()).toEqual(Object.keys(declared).sort());
  });
});
