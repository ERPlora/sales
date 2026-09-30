// sales#476 — the module's tabs speak the hub's language.
//
// The runtime resolves each tab name from `locales/<lang>.json#navigation.<id>.label` (ADR-0055)
// and falls back to the manifest `navigation[].label`, which is therefore the ENGLISH source. The
// till tab shipped as «Vender» in the manifest AND in `en.json`, so a hub in English showed the
// only Spanish tab of the module. Nothing caught it: the catalogues were complete, just wrong.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json' with { type: 'json' };
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };

type Nav = Array<{ id: string; label: string }>;
type Catalog = { navigation?: Record<string, { label?: string }> };

const nav = (manifest as unknown as { navigation: Nav }).navigation;
const label = (catalog: unknown, id: string) => (catalog as Catalog).navigation?.[id]?.label ?? '';

describe('navigation labels (sales#476)', () => {
  it('the till tab is «Sell» in English and «Vender» in Spanish', () => {
    expect(nav.find((n) => n.id === 'pos')?.label).toBe('Sell');
    expect(label(en, 'pos')).toBe('Sell');
    expect(label(es, 'pos')).toBe('Vender');
  });

  it.each(nav.map((n) => [n.id, n.label] as const))(
    '%s: the manifest label is the English source and Spanish translates it',
    (id, source) => {
      expect(label(en, id)).toBe(source);
      expect(label(es, id)).not.toBe('');
      // No tab of this module is a word both languages share: equal en/es = one side untranslated.
      expect(label(es, id)).not.toBe(label(en, id));
    },
  );
});
