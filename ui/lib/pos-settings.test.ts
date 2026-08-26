// sales#223 — the counter's policy, resolved ONCE, so "there is no row" and "the row holds the
// defaults" cannot mean two different tills.
//
// The screen used to read the raw row and decide with `field !== 0`. On a hub where nobody had
// ever saved the settings the field arrived `undefined`, and `undefined !== 0` is `true`: every
// switch whose default is OFF read as ON. Bank transfer was the one that showed
// (`allow_transfer` defaults to 0), but the shape of the bug belongs to the reader, not to that
// column.
//
// The fix is to resolve the row at the door: what the screen gets is always complete and always
// 0/1, and the DEFAULTS live in one place that `settings-defaults-contract` pins to the JSON
// schema and to the migration.
import { describe, expect, it } from 'vitest';
import { POS_SETTINGS_DEFAULTS, withPosSettingsDefaults } from './pos-settings.js';

describe('the till resolves its policy through one set of defaults (sales#223)', () => {
  it('with NO row, every declared setting arrives at its default', () => {
    expect(withPosSettingsDefaults(undefined)).toEqual(POS_SETTINGS_DEFAULTS);
    expect(withPosSettingsDefaults({})).toEqual(POS_SETTINGS_DEFAULTS);
  });

  it('the defaults really are the ones the business ships with', () => {
    // A guard that only compares the resolver against itself passes whatever the resolver says.
    expect(POS_SETTINGS_DEFAULTS.allow_cash).toBe(1);
    expect(POS_SETTINGS_DEFAULTS.allow_card).toBe(1);
    expect(POS_SETTINGS_DEFAULTS.allow_transfer, 'bank transfer is off out of the box').toBe(0);
    expect(POS_SETTINGS_DEFAULTS.allow_discounts).toBe(1);
    expect(POS_SETTINGS_DEFAULTS.enable_parked_tickets).toBe(1);
    expect(POS_SETTINGS_DEFAULTS.default_tax_included).toBe(1);
    expect(POS_SETTINGS_DEFAULTS.require_customer).toBe(0);
    expect(POS_SETTINGS_DEFAULTS.auto_invoice_with_tax_id).toBe(0);
    expect(POS_SETTINGS_DEFAULTS.default_document_format).toBe('ticket');
    expect(POS_SETTINGS_DEFAULTS.receipt_header).toBe('');
  });

  it('a saved value wins over the default — including one that switches something OFF', () => {
    const resolved = withPosSettingsDefaults({ allow_cash: 0, allow_transfer: 1, default_document_format: 'invoice' });
    expect(resolved.allow_cash).toBe(0);
    expect(resolved.allow_transfer).toBe(1);
    expect(resolved.default_document_format).toBe('invoice');
    expect(resolved.allow_card, 'what the row does not carry keeps its default').toBe(1);
  });

  it('a NULL column is absence, not zero', () => {
    // A row saved before a column existed answers `null` through the read. Treating that as 0
    // would silently switch OFF everything the shop never got asked about.
    expect(withPosSettingsDefaults({ allow_discounts: null }).allow_discounts).toBe(1);
    expect(withPosSettingsDefaults({ default_document_format: null }).default_document_format).toBe('ticket');
  });

  it('the 0/1 of the portable SQL subset is answered as a number, string form included', () => {
    // ADR-0007 keeps booleans as INTEGER, and a driver may hand them back as '0'/'1'. `'0' !== 0`
    // is true, so the string form used to read as ON wherever the number read as OFF.
    const off = withPosSettingsDefaults({ allow_transfer: '0', allow_cash: '0', allow_discounts: false });
    expect(off.allow_transfer).toBe(0);
    expect(off.allow_cash).toBe(0);
    expect(off.allow_discounts).toBe(0);
    const on = withPosSettingsDefaults({ allow_transfer: '1', enable_parked_tickets: true });
    expect(on.allow_transfer).toBe(1);
    expect(on.enable_parked_tickets).toBe(1);
  });

  it('a string setting keeps the text the shop typed', () => {
    const resolved = withPosSettingsDefaults({ receipt_header: 'Pepe Bar\n1 Main Street', receipt_footer: '' });
    expect(resolved.receipt_header).toBe('Pepe Bar\n1 Main Street');
    expect(resolved.receipt_footer, 'an empty footer is a choice, and it is also the default').toBe('');
  });

  it('carries through a column the till does not know yet', () => {
    // The module updates itself and the hub image does not: a newer query may project a column
    // this build has no default for. Dropping it would be worse than passing it along untouched.
    expect(withPosSettingsDefaults({ some_future_flag: 1 } as Record<string, unknown>))
      .toMatchObject({ some_future_flag: 1, allow_transfer: 0 });
  });
});
