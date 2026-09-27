// The manager's PIN dialog names only the figures the ticket discount actually has (hub#2186).
//
// `sales.order.set_discount_over_limit` always sends both `discount_percent` and
// `discount_amount` (the handler keeps the stored amount when one is missing), so the single
// `approval_label` read «del 50 % y 0,00 €». The hub shell (hub#2186) tries `approval_labels` in
// order and treats a figure at zero as absent: the list must offer the sentence with both
// figures first, then each figure on its own. `approval_label` stays for shells older than that.
import { describe, expect, it } from 'vitest';

import enCatalog from '../../locales/en.json';
import esCatalog from '../../locales/es.json';

const TICKET = 'sales.order.set_discount_over_limit';
const HOLE = /\{\s*([a-z0-9_]+)\s*(?:,\s*([a-z]+)\s*)?\}/gi;

function holesOf(sentence: string): string[] {
  return [...sentence.matchAll(HOLE)].map((m) => `${m[1]}, ${m[2] ?? ''}`.trim());
}

type Catalog = { commands: Record<string, { label?: string; approval_label?: string; approval_labels?: unknown }> };

describe.each([
  ['en', enCatalog as Catalog],
  ['es', esCatalog as Catalog],
])('%s ticket discount PIN sentence', (_lang, catalog) => {
  const entry = catalog.commands[TICKET];

  it('offers both figures first, then the percentage alone, then the amount alone', () => {
    expect(Array.isArray(entry.approval_labels)).toBe(true);
    const variants = (entry.approval_labels as unknown[]).map((v) => holesOf(String(v)));
    expect(variants).toEqual([
      ['discount_percent, percent', 'discount_amount, money'],
      ['discount_percent, percent'],
      ['discount_amount, money'],
    ]);
  });

  it('keeps approval_label for shells that do not read approval_labels', () => {
    expect(holesOf(entry.approval_label ?? '')).toEqual(['discount_percent, percent', 'discount_amount, money']);
  });
});
