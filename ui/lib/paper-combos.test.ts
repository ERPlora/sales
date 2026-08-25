// How a MENU / PACK is printed on the customer's paper (sales#154 / ADR-0381) — decided by the
// market, not by us. The kitchen chit already had its rule (hub#1156 / ADR-0394: hierarchy by
// INDENTATION, and the combo header is the only thing that gives up bold). The customer's ticket is
// a different document, and the 10 references + 3 forum threads (table with URLs in the PR and in
// the issue) say:
//
//  1. ONE HEADER LINE that carries the money. LS Central prints «deal item lines … on the slip
//     under the Deal line»; WooCommerce's default grouping is «a parent line item named after the
//     product bundle itself … bundled items are indented»; Lightspeed K-Series lists the items
//     under the combo and its only switch is «Show only combo name and price on receipt»; Maitre'D
//     shows each component «as a free modifier under the main combo item». The header is what the
//     customer reconciles against the TOTAL, so it is a normal line — NOT de-emphasised like on the
//     kitchen chit, where the components are the work and the header is context. Same indentation
//     rule, opposite emphasis: on the chit the header yields, on the ticket the header IS the item.
//
//  2. COMPONENTS INDENTED UNDERNEATH, WITHOUT AN AMOUNT. Toast: «modifier prices are included in
//     the price of the main item»; Maitre'D: «free modifier under the main combo item». And the
//     counter-examples are exactly the forum complaints: Odoo prints one line per component with a
//     PRORATED price and its own forum asks how to show «only … combo … the total price of the
//     combo, not the sum of the child products»; Square users complain the receipt «shows the cost
//     breakdown rather than a single combo price»; Shopify splits bundle components into separate
//     lines and merchants patch the template with «Part of: {bundle}». A component priced at 0,00
//     reads as a gift (the Odoo #187509 failure ADR-0381 names); a prorated share reads as a price
//     the customer never agreed to. Neither is what they bought: they bought a menu at 13,50.
//
//  3. THE ONLY MONEY ON A COMPONENT IS ITS SUPPLEMENT («Solomillo (+3,00)»): Maitre'D prints the
//     substituted item «as a modifier with a price under the main combo item», Lightspeed and
//     Toast print modifier prices only when they are not rolled up. It is the one number the
//     customer needs to reconcile «why is my menu 16,50 and not 13,50».
//
//  4. FISCALLY NOTHING CHANGES. A `goods` pack split across two rates is still N sibling rows and
//     the tax footer still shows both bases (ADR-0381 rule 2): the presentation GROUPS, it never
//     rewrites the breakdown. That is why the header total is the SUM of the siblings, never a
//     stored parent amount (there is no parent row, by design).
//
//  5. THE BILL (pre-bill) IS PRINTED LIKE THE TICKET — one composer, both papers, same as
//     sales#148 decided for supplements.
import { describe, expect, it } from 'vitest';
import {
  comboIdentity,
  comboNote,
  componentLabel,
  groupComboLines,
  parseComboSnapshot,
} from './paper-combos.js';

/** The snapshot `expand_combo` (handler/src/lib.rs) freezes on EVERY sibling row, verbatim. */
const SNAPSHOT = JSON.stringify({
  combo_id: 'c-menu',
  name: 'Menú del día',
  kitchen_name: 'MENU',
  price: 1350,
  price_charged: 1650,
  supply_kind: 'service',
  components: [
    { option_id: 'o-soup', group_id: 'g1', group_name: 'Primero', source: 'product', source_ref: 'p-soup', name: 'Gazpacho', price_delta: 0, tax_category_key: 'food', catalog_price: 450, share: null },
    { option_id: 'o-sirloin', group_id: 'g2', group_name: 'Segundo', source: 'product', source_ref: 'p-sirloin', name: 'Solomillo', price_delta: 300, tax_category_key: 'food', catalog_price: 1400, share: null },
  ],
});

describe('componentLabel — what the customer reads for one component', () => {
  it('is the commercial name, with NO amount when the component adds nothing', () => {
    expect(componentLabel({ option_id: 'o-soup', name: 'Gazpacho', price_delta: 0 })).toBe('Gazpacho');
    expect(componentLabel({ name: 'Gazpacho' })).toBe('Gazpacho');
  });

  it('shows the SUPPLEMENT — the one number that explains why the menu costs more', () => {
    expect(componentLabel({ name: 'Solomillo', price_delta: 300 })).toBe('Solomillo (+3,00)');
    expect(componentLabel({ name: 'Agua', price_delta: -50 }), 'a negative delta is a rebate').toBe('Agua (-0,50)');
  });

  it('falls back to the option id: an ugly line beats an invisible component', () => {
    expect(componentLabel({ option_id: 'o-orphan' })).toBe('o-orphan');
  });
});

describe('comboNote — the components in ONE sub-line, for the surfaces that print one', () => {
  it('joins the components in the order they were chosen with the paper separator', () => {
    const combo = { name: 'Menú del día', components: [{ name: 'Gazpacho' }, { name: 'Solomillo', price_delta: 300 }] };
    expect(comboNote(combo)).toBe('Gazpacho · Solomillo (+3,00)');
  });

  it('is `undefined` — not an empty string — when there is nothing to say', () => {
    expect(comboNote(undefined)).toBeUndefined();
    expect(comboNote({ name: 'Menú', components: [] })).toBeUndefined();
  });
});

describe('parseComboSnapshot — the frozen row → what the paper prints', () => {
  it('reads name and components from the snapshot the server froze at checkout', () => {
    expect(parseComboSnapshot(SNAPSHOT)).toEqual({
      name: 'Menú del día',
      components: [
        { option_id: 'o-soup', name: 'Gazpacho', price_delta: 0 },
        { option_id: 'o-sirloin', name: 'Solomillo', price_delta: 300 },
      ],
    });
  });

  it('a row that never was a combo (`{}`, empty, null) yields nothing', () => {
    expect(parseComboSnapshot('{}')).toBeUndefined();
    expect(parseComboSnapshot('')).toBeUndefined();
    expect(parseComboSnapshot(undefined)).toBeUndefined();
  });

  it('a broken snapshot loses the header, never the ticket', () => {
    expect(parseComboSnapshot('{not json')).toBeUndefined();
    expect(parseComboSnapshot(JSON.stringify({ components: [] })), 'no name = nothing to head').toBeUndefined();
  });
});

describe('groupComboLines — sibling rows become ONE paper line', () => {
  const plain = (name: string) => ({ product_name: name, combo_group_ref: null, combo: '{}' });
  const sibling = (name: string, ref = 'grp-1') => ({ product_name: name, combo_group_ref: ref, combo: SNAPSHOT });

  it('a line that is not a combo passes through untouched, in its place', () => {
    const groups = groupComboLines([plain('Café'), plain('Caña')]);
    expect(groups.map((g) => g.head.product_name)).toEqual(['Café', 'Caña']);
    expect(groups.every((g) => g.combo === undefined && g.siblings.length === 1)).toBe(true);
  });

  it('a `goods` pack split in two rates (two siblings) is ONE group with both rows inside', () => {
    const groups = groupComboLines([plain('Café'), sibling('Gazpacho'), sibling('Solomillo'), plain('Caña')]);
    expect(groups.map((g) => g.head.product_name)).toEqual(['Café', 'Gazpacho', 'Caña']);
    expect(groups[1].siblings.map((s) => s.product_name)).toEqual(['Gazpacho', 'Solomillo']);
    expect(groups[1].combo?.name).toBe('Menú del día');
  });

  it('siblings SURVIVE being separated by another line (split, transfer, reopen reorder rows)', () => {
    const groups = groupComboLines([sibling('Gazpacho'), plain('Café'), sibling('Solomillo')]);
    expect(groups.map((g) => g.head.product_name), 'grouped at the FIRST sibling').toEqual(['Gazpacho', 'Café']);
    expect(groups[0].siblings).toHaveLength(2);
  });

  it('two DIFFERENT menus on the same ticket are two groups, not one', () => {
    const groups = groupComboLines([sibling('Gazpacho', 'grp-1'), sibling('Gazpacho', 'grp-2')]);
    expect(groups).toHaveLength(2);
  });

  it('a `service` menu (ONE row with the closed price) is a group of one with its components', () => {
    const groups = groupComboLines([sibling('Menú del día')]);
    expect(groups[0].combo?.components.map((c) => c.name)).toEqual(['Gazpacho', 'Solomillo']);
  });
});

describe('comboIdentity — what puts the menu into the bill fingerprint', () => {
  it('changes when a component changes: a corrected bill must not hash like the old one', () => {
    const a = comboIdentity({ name: 'Menú', components: [{ option_id: 'o-soup' }, { option_id: 'o-chicken' }] });
    const b = comboIdentity({ name: 'Menú', components: [{ option_id: 'o-soup' }, { option_id: 'o-sirloin', price_delta: 300 }] });
    expect(a).not.toBe(b);
  });

  it('is empty for a line that is not a combo, so an unchanged bill keeps its key', () => {
    expect(comboIdentity(undefined)).toBe('');
  });
});
