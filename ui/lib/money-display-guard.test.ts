import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkMoneyDisplay, moduleRootFrom, stripComments } from '@erplora/module-toolkit/money-display-guard';

// GUARD (pm#289, shared since pm#505/pm#508): money on screen is never formatted by hand in this
// module, and OutfitKit comes in by entry point, never as a value from the barrel.
//
// The rules live in `@erplora/module-toolkit/money-display-guard` (one piece for every module,
// tested there against its own positives); this test only says what is specific to Ventas:
//
// * witnesses — every amount this module paints goes through a formatter, and each witness counts
//   the CALL, not the name (the screens also declare `formatMoney(…)` in their `erplora()`
//   interface; a scan over empty or over-stripped content must not stay green on it, rv-combos-22):
//   - the sales list: its six direct `erplora().formatMoney(` (total and outstanding columns, the
//     four KPIs);
//   - the till: every `this.money(` call site of its `money()` helper — the helper itself is pinned
//     by the till's own tests, its call sites were not (split remaining, open check totals…);
//   - the refund: its five `erplora().formatMoney(` (the `money` helper of the legs, the block
//     amounts, the total and the confirm button);
//   - the paper (`lib/receipt-html.ts`, `lib/invoice-html.ts`): the `money(` helper and its call
//     sites; the menu supplement of `lib/paper-combos.ts`: its `formatMinor(`.
// * notDisplay — the two triaged in pm#289 (a tax RATE in `taxLabel`, the currency SYMBOL in
//   `currencySymbol`). They are also the witnesses on the detector's OUTPUT: if the scan were fed
//   empty or cut content, or lost `lib/`, they would come back as `stale_exception` (rv-taxes-78).
//   The `Intl` key is the call collapsed to one line (rv-mt-377). Add an entry
//   (`'file: exact code line'` → why) only with the reason it is not a screen amount.
// * outfitkitImporters — every file that imports OutfitKit (entry points + types), so the barrel
//   scan provably read each of them (rv-pricing-53).
it('money on screen goes through the shared formatter and OutfitKit by entry point (pm#289)', () => {
  expect(
    checkMoneyDisplay({
      from: import.meta.url,
      witnesses: {
        'components/erp-sales-list/erp-sales-list.ts': { text: 'erplora().formatMoney(', atLeast: 6 },
        'components/erp-pos-touch/erp-pos-touch.ts': { text: 'this.money(', atLeast: 37 },
        'components/erp-sale-refund/erp-sale-refund.ts': { text: 'erplora().formatMoney(', atLeast: 5 },
        'lib/receipt-html.ts': { text: 'money(', atLeast: 8 },
        'lib/invoice-html.ts': { text: 'money(', atLeast: 7 },
        'lib/paper-combos.ts': 'formatMinor(',
      },
      notDisplay: {
        'lib/document-mappers.ts: const pct = Number.isFinite(r) ? String(Number(r.toFixed(2))) : rate;':
          'a tax RATE (21.00 → "21"), not an amount',
        // sales#380: reads only the currency SYMBOL of the hub's ISO code for a label (the amount
        // mode of the discount sheet); no amount goes through it.
        "lib/currency-symbol.ts: NumberFormat(locale, { style: 'currency', currency: iso })":
          'currency symbol for a label, not an amount',
      },
      outfitkitImporters: [
        'components/erp-pos/erp-pos.ts',
        'components/erp-pos-departments/erp-pos-departments.ts',
        'components/erp-pos-quick-notes/erp-pos-quick-notes.ts',
        'components/erp-pos-touch/erp-pos-touch.ts',
        'components/erp-sale-refund/erp-sale-refund.ts',
        'components/erp-sales-document/erp-sales-document.ts',
        'components/erp-sales-list/erp-sales-list.ts',
        'lib/document-mappers.ts',
        'lib/invoice-html.ts',
        'lib/paper-combos.ts',
        'lib/receipt-html.ts',
      ],
    }),
  ).toEqual([]);
});

// sales#379 — a rule of this module the shared piece does not carry: the SDK's
// `eurosToCents`/`centsToEuros` pin TWO decimals (the SDK keeps them for what is EUR by contract:
// VeriFactu). In this module every typed amount is the hub currency, so they are a hard `/ 100` in
// disguise — in yen the till took 1000 ¥ handed over as 100000.

/** Production sources of the UI: tests and the test doubles in `ui/test/` do not reach a screen. */
function uiSources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'test' || n === 'node_modules' ? [] : uiSources(p);
    return /\.(ts|js|vue)$/.test(n) && !/\.test\.(ts|js)$/.test(n) && !n.endsWith('.d.ts') ? [p] : [];
  });
}

/** Each code line naming the SDK's two-decimal conversions (`eurosToCents`/`centsToEuros`). */
export function fixedTwoDecimalConversions(src: string): string[] {
  return stripComments(src)
    .split('\n')
    .filter((line) => /\b(eurosToCents|centsToEuros)\b/.test(line))
    .map((line) => line.trim());
}

describe('typed amounts go through the hub scale, not the two-decimal SDK conversions (sales#379)', () => {
  it('no two-decimal SDK conversion in ui/', () => {
    const uiRoot = join(moduleRootFrom(import.meta.url), 'ui');
    const read = new Map<string, string>();
    const found: string[] = [];
    for (const f of uiSources(uiRoot)) {
      const rel = f.slice(uiRoot.length + 1);
      const code = stripComments(readFileSync(f, 'utf8'));
      read.set(rel, code);
      for (const h of fixedTwoDecimalConversions(code)) found.push(`${rel}: ${h}`);
    }
    // The control that keeps this from passing vacuously: the scan read the code that does convert
    // typed amounts — the till's `typedToMinor(` calls and their definition in `lib/`.
    expect((read.get('components/erp-pos-touch/erp-pos-touch.ts') ?? '').split('typedToMinor(').length - 1).toBeGreaterThanOrEqual(3);
    expect(read.get('lib/hub-currency.ts') ?? '').toContain('export function typedToMinor(');
    expect(found, 'use typedToMinor/minorToTyped from lib/hub-currency').toEqual([]);
  });

  it('the conversion detector catches the positive', () => {
    expect(fixedTwoDecimalConversions("import { eurosToCents, centsToEuros } from '@erplora/module-sdk';")).toHaveLength(1);
    expect(fixedTwoDecimalConversions('const c = erplora().eurosToCents(x);')).toHaveLength(1);
    expect(fixedTwoDecimalConversions('const s = sdk.centsToEuros(\n  c,\n);')).toHaveLength(1);
    expect(fixedTwoDecimalConversions('// was eurosToCents(x)\nconst c = typedToMinor(x);')).toHaveLength(0);
  });
});
