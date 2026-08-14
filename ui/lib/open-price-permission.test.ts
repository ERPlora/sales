// sales#63 — who may sell at an open price, decided by the market.
//
// A free-price line is the one nobody can check: the cashier types the amount and no catalogue
// contradicts them. Its documented failure mode is undercharging fraud — charge for the premium
// cut, ring up the cheap one, pocket the difference — and it is invisible on the ticket.
//
// Researched across Toast, Shopify POS, Vagaro, Odoo, Square, Lightspeed, Business Central and
// WooCommerce. The three that sell to shops with a counter converge on the SAME default:
//
//   * Toast   — permission `3.25 Open Items`; without it, «employees need manager approval».
//   * Shopify — permission is tri-state: Allowed / Denied / **Approval required** (manager PIN).
//   * Vagaro  — «Cannot Modify»: cannot change price «without manager approval».
//
// Odoo gates by role alone, which means swapping user mid-checkout with the client waiting; Square
// has no permission at all and its own forum carries «Security Flaw in POS Permissions Allowing
// Cash Theft». So: a permission of its own, with the manager approving on the spot.
//
// We do NOT build that. The runtime already has step-up authorisation (ADR-0238): when a HUMAN
// lacks a permission that the owning module grants to `manager`, the dispatcher answers
// `requires_elevation` instead of denying, the shell raises the PIN dialog at TRANSPORT level, and
// the approval is spent by that one action and written to `_elevation_audit`.
//
// `is_elevable` derives all of it from the manifest — there is no `requires_elevation` flag to
// set. So the whole behaviour is decided by these two facts: `manager` holds the permission
// VERBATIM, and `employee` does not.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';

type ManifestPermissions = {
  permissions: string[];
  role_permissions: Record<string, string[]>;
  commands: Record<string, { permission: string }>;
};
const m = manifest as unknown as ManifestPermissions;

const OPEN_PRICE = 'sales.sell_open_price';

describe('selling at an open price is its own permission (sales#63)', () => {
  it('declares it as a module permission', () => {
    expect(m.permissions).toContain(OPEN_PRICE);
  });

  it('does NOT grant it to employee: the cashier is who the control is for', () => {
    expect(m.role_permissions.employee).not.toContain(OPEN_PRICE);
    expect(m.role_permissions.employee).not.toContain('*');
  });

  // This is the line that turns a refusal into a manager PIN prompt. `is_elevable` matches the
  // permission VERBATIM in the owning module's `role_permissions.manager`; `admin: ["*"]` does not
  // count, on purpose. Drop this grant and the cashier just gets a dead end.
  it('DOES grant it to manager verbatim — that is what makes it elevable by PIN', () => {
    expect(m.role_permissions.manager).toContain(OPEN_PRICE);
  });

  it('keeps building an order and charging on their own permissions', () => {
    // The open price is an extra key, not a re-shuffle: `add_sale`/`take_payment` are a published
    // contract and do not move.
    expect(m.role_permissions.employee).toContain('sales.add_sale');
    expect(m.commands['sales.order.add_line'].permission).toBe('sales.add_sale');
    expect(m.commands['sales.complete_sale'].permission).toBe('sales.take_payment');
  });
});

describe('the open-price line has a command of its own', () => {
  it('gates sales.order.add_open_line with the open-price permission', () => {
    expect(m.commands['sales.order.add_open_line']).toBeDefined();
    expect(m.commands['sales.order.add_open_line'].permission).toBe(OPEN_PRICE);
  });

  // A permission the runtime can enforce needs a COMMAND of its own: the dispatcher checks
  // permissions per command, and the WASM handler never receives the user's permissions at all
  // (that is exactly why sales#63 could not be solved inside the handler).
  it('is a sibling of add_line, not a replacement: ordinary lines keep their own door', () => {
    expect(m.commands['sales.order.add_line'].permission).toBe('sales.add_sale');
    expect(m.commands['sales.order.add_open_line'].permission).not.toBe('sales.add_sale');
  });
});
