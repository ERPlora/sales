// sales#153 / ADR-0381 — the arithmetic and the rules of the MENU PICKER, with no DOM.
//
// A combo is not a line: it is a GROUP of sibling lines, and the till never decides what it costs.
// What this file pins down is the half the screen owns — which choices are legal, which group is
// still unresolved, and what the running total SHOWS — so that the sheet can propose exactly what
// `sales.complete_sale` will accept and nothing else.
//
// The contract mirrored here is `combos.options.all` (flattened: one row per option, repeating its
// group and combo columns) and `expand_combo` in handler/src/lib.rs. Every rule below has a twin
// there on purpose: `min_choices >= 1` IS "required" (there is no `required` flag), `max_choices = 0`
// means NO CEILING (never "zero choices"), and `price_delta` adds to the CLOSED price and MAY BE
// NEGATIVE. If these two ever disagree, the screen is the one that is wrong: the server is the
// price authority (the lesson of sales#68).
import { describe, expect, it } from 'vitest';
import {
  canConfirmCombo,
  comboBlockReason,
  comboTotalCents,
  groupComboRows,
  type Combo,
} from './combo-picker.js';

/** One row of `combos.options.all`, exactly as the query hands it over. */
const row = (over: Record<string, unknown>): Record<string, unknown> => ({
  combo_id: 'c-menu',
  combo_name: 'Menu of the day',
  combo_kitchen_name: '',
  combo_price: 1250,
  combo_tax_category_key: 'food',
  supply_kind: 'service',
  combo_is_active: 1,
  group_id: 'g-main',
  group_name: 'Main',
  min_choices: 1,
  max_choices: 1,
  allow_repeat: 0,
  group_sort_order: 0,
  source: 'product',
  source_ref: 'p-x',
  price_delta: 0,
  option_sort_order: 0,
  ...over,
});

// Two groups, in catalogue order: Starter (1 of 2) then Main (1 of 2, one with a supplement).
const TWO_GROUPS = [
  row({ group_id: 'g-starter', group_name: 'Starter', group_sort_order: 0, option_id: 'o-soup', source_ref: 'p-soup', option_sort_order: 0 }),
  row({ group_id: 'g-starter', group_name: 'Starter', group_sort_order: 0, option_id: 'o-salad', source_ref: 'p-salad', option_sort_order: 1 }),
  row({ group_id: 'g-main', group_name: 'Main', group_sort_order: 1, option_id: 'o-chicken', source_ref: 'p-chicken', option_sort_order: 0 }),
  row({ group_id: 'g-main', group_name: 'Main', group_sort_order: 1, option_id: 'o-sirloin', source_ref: 'p-sirloin', option_sort_order: 1, price_delta: 300 }),
];

const only = (rows: Record<string, unknown>[]): Combo => {
  const combos = groupComboRows(rows);
  expect(combos, 'the fixture describes exactly one combo').toHaveLength(1);
  return combos[0];
};

describe('groupComboRows — the flattened read becomes groups, in CATALOGUE order', () => {
  it('keeps the order the query already sorted by, and never re-sorts it', () => {
    const combo = only(TWO_GROUPS);
    expect(combo.groups.map((g) => g.name), 'Starter before Main, as `g.sort_order` said').toEqual(['Starter', 'Main']);
    expect(combo.groups[1].options.map((o) => o.option_id)).toEqual(['o-chicken', 'o-sirloin']);
  });

  it('carries the closed price and the supply kind from the head row', () => {
    const combo = only(TWO_GROUPS);
    expect(combo.combo_id).toBe('c-menu');
    expect(combo.name).toBe('Menu of the day');
    expect(combo.price).toBe(1250);
    expect(combo.supply_kind).toBe('service');
  });

  it('carries `source`/`source_ref` untouched — the option has NO name of its own', () => {
    const sirloin = only(TWO_GROUPS).groups[1].options[1];
    expect(sirloin.source).toBe('product');
    expect(sirloin.source_ref, 'the display name is resolved against the till catalogue').toBe('p-sirloin');
    expect(sirloin.price_delta).toBe(300);
  });

  it('splits several combos and never leaks a group from one into the other', () => {
    const combos = groupComboRows([
      ...TWO_GROUPS,
      row({ combo_id: 'c-pack', combo_name: 'Hair pack', combo_price: 4000, group_id: 'g-svc', group_name: 'Service', option_id: 'o-cut', source: 'service', source_ref: 's-cut' }),
    ]);
    expect(combos.map((c) => c.combo_id)).toEqual(['c-menu', 'c-pack']);
    expect(combos[1].groups).toHaveLength(1);
    expect(combos[1].groups[0].options[0].source).toBe('service');
  });

  it('drops a WITHDRAWN combo: the till must not offer what the server will refuse', () => {
    const combos = groupComboRows(TWO_GROUPS.map((r) => ({ ...r, combo_is_active: 0 })));
    expect(combos, '`combo_is_active = 0` travels in the read so it can be refused loudly').toHaveLength(0);
  });

  it('survives junk without throwing: a row with no option or no group is skipped', () => {
    const combos = groupComboRows([...TWO_GROUPS, row({ option_id: '' }), row({ group_id: '', option_id: 'o-ghost' }), 'nonsense', null]);
    const ids = combos[0].groups.flatMap((g) => g.options.map((o) => o.option_id));
    expect(ids).toEqual(['o-soup', 'o-salad', 'o-chicken', 'o-sirloin']);
  });

  it('reads `allow_repeat` and the booleans however the dialect spells them', () => {
    const [a] = groupComboRows([row({ option_id: 'o-1', allow_repeat: true, combo_is_active: true })]);
    expect(a.groups[0].allow_repeat).toBe(true);
    const [b] = groupComboRows([row({ option_id: 'o-1', allow_repeat: 1, combo_is_active: 1 })]);
    expect(b.groups[0].allow_repeat).toBe(true);
    const [c] = groupComboRows([row({ option_id: 'o-1', allow_repeat: 0, combo_is_active: 1 })]);
    expect(c.groups[0].allow_repeat).toBe(false);
  });
});

describe('comboTotalCents — the CLOSED price plus what was substituted', () => {
  it('with nothing chosen it is already the closed price, not zero', () => {
    expect(comboTotalCents(only(TWO_GROUPS), []), 'a menu costs 12,50 € before you pick anything').toBe(1250);
  });

  it('a supplement ADDS to the closed price, never to the component', () => {
    expect(comboTotalCents(only(TWO_GROUPS), ['o-soup', 'o-sirloin'])).toBe(1550);
  });

  it('a NEGATIVE price_delta makes the menu cheaper — the contract allows it', () => {
    const combo = only([...TWO_GROUPS, row({ group_id: 'g-main', group_name: 'Main', group_sort_order: 1, option_id: 'o-veg', source_ref: 'p-veg', option_sort_order: 2, price_delta: -200 })]);
    expect(comboTotalCents(combo, ['o-soup', 'o-veg'])).toBe(1050);
  });

  it('counts a repeated option ONCE PER PICK, not once per option', () => {
    const combo = only(TWO_GROUPS.map((r) => (r.group_id === 'g-main' ? { ...r, allow_repeat: 1, max_choices: 2 } : r)));
    expect(comboTotalCents(combo, ['o-soup', 'o-sirloin', 'o-sirloin'])).toBe(1850);
  });

  it('ignores an option that is not in this combo instead of guessing a price', () => {
    expect(comboTotalCents(only(TWO_GROUPS), ['o-soup', 'o-from-another-menu'])).toBe(1250);
  });
});

describe('canConfirmCombo — the same precondition the server applies, applied EARLY', () => {
  it('a group with `min_choices >= 1` unresolved does not let you confirm', () => {
    const combo = only(TWO_GROUPS);
    expect(canConfirmCombo(combo, []), 'neither group resolved').toBe(false);
    expect(canConfirmCombo(combo, ['o-soup']), 'Main is still missing').toBe(false);
    expect(canConfirmCombo(combo, ['o-soup', 'o-chicken'])).toBe(true);
  });

  it('`max_choices = 0` means NO CEILING, never "zero choices"', () => {
    const combo = only(TWO_GROUPS.map((r) => (r.group_id === 'g-main' ? { ...r, min_choices: 0, max_choices: 0, allow_repeat: 1 } : r)));
    expect(canConfirmCombo(combo, ['o-soup']), 'an optional group with no ceiling is satisfied empty').toBe(true);
    expect(canConfirmCombo(combo, ['o-soup', 'o-chicken', 'o-sirloin', 'o-sirloin']), 'and it never fills up').toBe(true);
  });

  it('refuses over the ceiling', () => {
    const combo = only(TWO_GROUPS.map((r) => (r.group_id === 'g-main' ? { ...r, allow_repeat: 1 } : r)));
    expect(canConfirmCombo(combo, ['o-soup', 'o-chicken', 'o-sirloin']), 'Main allows 1').toBe(false);
  });

  it('refuses a repeat when the group forbids it', () => {
    const combo = only(TWO_GROUPS.map((r) => (r.group_id === 'g-main' ? { ...r, max_choices: 2 } : r)));
    expect(canConfirmCombo(combo, ['o-soup', 'o-chicken', 'o-chicken']), '`allow_repeat = 0`').toBe(false);
    expect(canConfirmCombo(combo, ['o-soup', 'o-chicken', 'o-sirloin'])).toBe(true);
  });

  it('a combo with no group at all cannot be confirmed — the server rejects an empty choice', () => {
    expect(canConfirmCombo({ combo_id: 'c-x', name: 'X', kitchen_name: '', price: 100, tax_category_key: 'food', supply_kind: 'service', groups: [] }, [])).toBe(false);
  });
});

describe('comboBlockReason — WHY it cannot be confirmed, in words and naming the group', () => {
  it('names the FIRST unresolved group, in catalogue order', () => {
    const combo = only(TWO_GROUPS);
    expect(comboBlockReason(combo, [])).toEqual({ key: 'ui.comboGroupUnresolved', group: 'Starter', n: 1 });
    expect(comboBlockReason(combo, ['o-soup'])).toEqual({ key: 'ui.comboGroupUnresolved', group: 'Main', n: 1 });
  });

  it('says it is over the ceiling when it is over the ceiling', () => {
    const combo = only(TWO_GROUPS.map((r) => (r.group_id === 'g-main' ? { ...r, allow_repeat: 1 } : r)));
    expect(comboBlockReason(combo, ['o-soup', 'o-chicken', 'o-sirloin'])).toEqual({ key: 'ui.comboGroupOverMax', group: 'Main', n: 1 });
  });

  it('says it is a repeat when the group forbids repeating', () => {
    const combo = only(TWO_GROUPS.map((r) => (r.group_id === 'g-main' ? { ...r, max_choices: 2 } : r)));
    expect(comboBlockReason(combo, ['o-soup', 'o-chicken', 'o-chicken']), 'no number to quote: the rule is "not twice"').toEqual({ key: 'ui.comboOptionRepeated', group: 'Main' });
  });

  it('is undefined exactly when it CAN be confirmed — the button and the reason never disagree', () => {
    const combo = only(TWO_GROUPS);
    expect(comboBlockReason(combo, ['o-soup', 'o-chicken'])).toBeUndefined();
    expect(canConfirmCombo(combo, ['o-soup', 'o-chicken'])).toBe(true);
  });
});
