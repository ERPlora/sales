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
