import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// GUARD (pm#289): money on screen is never formatted by hand in this module.
//
// Money travels as an integer in the currency's minor unit (ADR-0123). The screen gets it through
// the shell's single formatter — `erplora().formatMoney(minor)` (currency and scale of the hub,
// JPY 0 decimals, KWD 3) — or `<ok-money>` / `formatMinor` from OutfitKit (by string, no float).
// A `(cents / 100).toFixed(2)` or a hand-built `Intl.NumberFormat({ currency })` brings back what
// that contract removed: its own separators, its own rounding, and a hard `/100` that is wrong the
// day the hub is not in euros.
//
// The only hand formatting left is NOT display, and each one is listed below with the reason.
// A new occurrence (or an allowed one that moves to another file) turns this test red.

function moduleRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('module.json not found walking up from the test');
    dir = up;
  }
  return dir;
}

/** Production sources of the UI: tests and the test doubles in `ui/test/` do not reach a screen. */
function uiSources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'test' || n === 'node_modules' ? [] : uiSources(p);
    return /\.(ts|js|vue)$/.test(n) && !/\.test\.(ts|js)$/.test(n) && !n.endsWith('.d.ts') ? [p] : [];
  });
}

/** Comments may talk about `toFixed(2)`; only code counts. Crude but enough: strings never
 *  contain these patterns in this module, and a false positive fails loud, not silent. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/** Each hand-formatted number in the code: `.toFixed(2)` or `Intl.NumberFormat(…currency…)`. */
export function handFormattedMoney(src: string): string[] {
  const code = stripComments(src);
  const hits: string[] = [];
  for (const line of code.split('\n')) {
    if (/\.toFixed\(\s*2\s*\)/.test(line) || /NumberFormat\([^)]*currency/.test(line)) {
      hits.push(line.trim());
    }
  }
  return hits;
}

/** Triaged pm#289: formatting that is not a screen amount. `file: exact code line → why`. */
const NOT_DISPLAY: Record<string, string> = {
  // Thermal paper: the ESC/POS renderer prints the string verbatim; a Web Component cannot go there.
  'lib/paper-combos.ts: return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace(\'.\', \',\')}`;':
    'ticket text (paper), not screen',
  // The value of an EDITABLE input: it must re-parse to the same cents, so no grouping and no symbol.
  'lib/refund-allocation.ts: const fixed = (Math.max(0, Math.round(Number(amount) || 0)) / 100).toFixed(2);':
    'editable input value, not display',
  // A tax RATE (21.00 → "21"), not an amount.
  'lib/document-mappers.ts: const pct = Number.isFinite(r) ? String(Number(r.toFixed(2))) : rate;':
    'percentage, not money',
};

describe('money display goes through the shared formatter (pm#289)', () => {
  it('no hand-formatted amount in ui/ outside the triaged non-display cases', () => {
    const uiRoot = join(moduleRoot(), 'ui');
    const found: string[] = [];
    for (const f of uiSources(uiRoot)) {
      const rel = f.slice(uiRoot.length + 1);
      for (const h of handFormattedMoney(readFileSync(f, 'utf8'))) found.push(`${rel}: ${h}`);
    }
    const unexpected = found.filter((k) => !(k in NOT_DISPLAY));
    expect(
      unexpected,
      'amount formatted by hand: use erplora().formatMoney(minor) or <ok-money>/formatMinor',
    ).toEqual([]);
  });

  it('every triaged exception still exists (a stale entry would hide the next one)', () => {
    const uiRoot = join(moduleRoot(), 'ui');
    const found = new Set<string>();
    for (const f of uiSources(uiRoot)) {
      const rel = f.slice(uiRoot.length + 1);
      for (const h of handFormattedMoney(readFileSync(f, 'utf8'))) found.add(`${rel}: ${h}`);
    }
    expect(Object.keys(NOT_DISPLAY).filter((k) => !found.has(k))).toEqual([]);
  });

  it('the detector catches the positive (otherwise this guard is decorative)', () => {
    expect(handFormattedMoney('const s = `${(total / 100).toFixed(2)} €`;')).toHaveLength(1);
    expect(handFormattedMoney("const f = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });")).toHaveLength(1);
    expect(handFormattedMoney('const s = erplora().formatMoney(total);')).toHaveLength(0);
    expect(handFormattedMoney('// was (x / 100).toFixed(2)\nconst s = erplora().formatMoney(x);')).toHaveLength(0);
    expect(handFormattedMoney("new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })")).toHaveLength(0);
  });
});
