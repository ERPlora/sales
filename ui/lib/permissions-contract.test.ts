// sales#55 — finish ADR-0141 at the permission layer: taking the money is a
// separate permission from building the order. `sales.complete_sale` (mutable
// order → immutable sale + payment) must be gated by `sales.take_payment`, not
// by `sales.add_sale`: a role that can only build the order (today's
// `employee`) must NOT be able to charge. `sales.add_sale`/`sales.change_sale`
// keep gating the `sales.order.*` flow — those keys are a published contract
// and do not move (`take_payment` is ADDED, nothing is renamed).
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';

type ManifestPermissions = {
  permissions: string[];
  role_permissions: Record<string, string[]>;
  commands: Record<string, { permission: string }>;
};
const m = manifest as unknown as ManifestPermissions;

describe('permission layer: sales.take_payment separated from add_sale (sales#55)', () => {
  it('declares sales.take_payment as a module permission', () => {
    expect(m.permissions).toContain('sales.take_payment');
  });

  it('gates sales.complete_sale with sales.take_payment', () => {
    expect(m.commands['sales.complete_sale'].permission).toBe('sales.take_payment');
  });

  it('does NOT grant take_payment to employee — add_sale alone cannot charge', () => {
    expect(m.role_permissions.employee).not.toContain('sales.take_payment');
    // And the employee has no wildcard that would re-grant it implicitly.
    expect(m.role_permissions.employee).not.toContain('*');
  });

  it('grants take_payment to manager (admin already has *)', () => {
    expect(m.role_permissions.manager).toContain('sales.take_payment');
    expect(m.role_permissions.admin).toContain('*');
  });

  it('keeps the order-building flow on sales.add_sale (published contract, unchanged)', () => {
    // The employee keeps today's order flow: these commands stay behind add_sale.
    for (const cmd of [
      'sales.order.open',
      'sales.order.add_line',
      'sales.order.update_line',
      'sales.order.remove_line',
      'sales.order.set_label',
      'sales.order.fire',
    ]) {
      expect(m.commands[cmd].permission).toBe('sales.add_sale');
    }
    expect(m.permissions).toContain('sales.add_sale');
    expect(m.role_permissions.employee).toContain('sales.add_sale');
  });
});

// sales#100 — «cashier» is a set of permissions, never an identity (a job in Toast, a permission
// set in Square, a permission group in Mindbody — decided in ERPlora/pm#9). The base catalogue is
// frozen at admin/manager/employee (ADR-0192), so the role is DECLARED by the till module: it can
// charge, build and park checks, and can NOT read business reports, touch the payment-method
// catalogue or the till settings. It hangs from `employee` (never administers the hub) and lands
// opt-in: the vertical blueprint switches it on (ADR-0242).
describe('the cashier role is declared by sales, not by the core (sales#100)', () => {
  type WithRoles = ManifestPermissions & { roles?: { key: string; label: string; extends: string }[] };
  const mr = manifest as unknown as WithRoles;

  it('declares `cashier` extending `employee`, with an English label', () => {
    const cashier = (mr.roles ?? []).find((r) => r.key === 'cashier');
    expect(cashier, 'sales declares the cashier role').toBeTruthy();
    expect(cashier!.extends).toBe('employee');
    expect(cashier!.label).toBe('Cashier');
  });

  it('a cashier can charge and run the till', () => {
    const grants = mr.role_permissions.cashier ?? [];
    for (const p of ['sales.view_sale', 'sales.add_sale', 'sales.change_sale', 'sales.take_payment', 'sales.view_paymentmethod']) {
      expect(grants, `cashier needs ${p}`).toContain(p);
    }
  });

  it('a cashier can NOT read reports, void, edit the payment methods or the till settings', () => {
    const grants = mr.role_permissions.cashier ?? [];
    for (const p of ['sales.view_reports', 'sales.manage_settings', 'sales.void_sale', 'sales.delete_sale',
                     'sales.add_paymentmethod', 'sales.change_paymentmethod', 'sales.delete_paymentmethod']) {
      expect(grants, `cashier must not get ${p}`).not.toContain(p);
    }
    expect(grants).not.toContain('*');
  });

  it('every permission granted to cashier is one the module declares', () => {
    for (const p of mr.role_permissions.cashier ?? []) expect(mr.permissions).toContain(p);
  });
});

// sales#521 — voiding a line already sent to the kitchen is a manager's call, like voiding the
// whole check (Toast, TouchBistro, LS Central: «manager required» to void a sent item). It reuses
// `sales.void_sale`, so an employee or a cashier who taps it gets the manager's PIN from the hub.
describe('voiding a sent line needs the manager (sales#521)', () => {
  it('gates sales.order.void_line with sales.void_sale', () => {
    expect(m.commands['sales.order.void_line']?.permission).toBe('sales.void_sale');
  });

  it('neither the employee nor the cashier holds it, so the hub asks for the PIN', () => {
    expect(m.role_permissions.employee).not.toContain('sales.void_sale');
    expect(m.role_permissions.cashier ?? []).not.toContain('sales.void_sale');
    expect(m.role_permissions.manager).toContain('sales.void_sale');
  });
});
