// GUARD (sales#203): the till reads its settings through a door the CASHIER can open.
//
// `sales.settings.get` is gated by `sales.manage_settings`, and neither `cashier` nor `employee`
// has it (`role_permissions` in `module.json`). Every setting the POS reads through that query is
// therefore INERT for the two roles that stand at the till all day: the runtime denies the read
// and the screen silently falls back to the defaults. The business configures "card only, no
// discounts, no parked tickets" and the cashier gets cash, discounts and parking.
//
// sales#25 opened `sales.pos_settings.get` for four of them (the catalogue sources and how the
// checkout opens). sales#203 widens that same door to the WHOLE operational policy of the counter,
// so there is ONE read and its answer is identical for an admin and for a cashier.
//
// What this file pins, mechanically, so the door cannot drift back:
//
//  1. The permission stays `sales.view_sale` — whoever can sell can read the policy they sell by.
//  2. It projects EXACTLY the operational columns, no more and no fewer. `id` is not policy, and
//     an operational column added to `sales.settings.get` without adding it here silently goes
//     back to being admin-only.
//  3. It never becomes a public HTTP surface (`expose_api`), and it never grows a write.
//  4. WRITING stays where it was: `sales.settings.update` keeps `sales.manage_settings`. A cashier
//     reads the policy; they do not get to change it.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../module.json';

function moduleRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('module.json not found walking up from the test');
    dir = up;
  }
  return dir;
}

const ROOT = moduleRoot();

type QueryDef = { permission: string; sql: string; expose_api?: unknown };
type Manifest = {
  queries: Record<string, QueryDef>;
  commands: Record<string, { permission: string }>;
  role_permissions: Record<string, string[]>;
};
const m = manifest as unknown as Manifest;

const COUNTER_READ = 'sales.pos_settings.get';
const ADMIN_READ = 'sales.settings.get';

/** The operational policy of the counter: what the POS screen decides with, plus the receipt text
 *  the cashier prints anyway. Nothing here is sensitive — no secret, no credential, no other
 *  tenant's datum — and every one of them has a reader in the till or on the paper. */
const OPERATIONAL_COLUMNS = [
  'allow_card',
  'allow_cash',
  'allow_discounts',
  'allow_transfer',
  'auto_invoice_with_tax_id',
  'default_document_format',
  'default_tax_included',
  'enable_parked_tickets',
  'receipt_footer',
  'receipt_footer_image',
  'receipt_header',
  'receipt_marketing_text',
  'receipt_marketing_url',
  'require_customer',
  'sync_products',
  'sync_services',
];

/** Columns of `sales_settings` deliberately LEFT OUT of the counter read. `id` is the singleton's
 *  row identity, not policy: a read-only policy read has no business handing out the primary key
 *  of a table the caller cannot write. The rest have no reader anywhere in the UI. */
const WITHHELD_COLUMNS = ['id', 'ticket_expiry_hours', 'restaurant_mode'];

/** The column names a SELECT projects, taken from the SQL between `SELECT` and `FROM`. Comments
 *  are stripped first: this module's SQL carries long `--` blocks that name columns in prose. */
function projectedColumns(sqlPath: string): string[] {
  const sql = readFileSync(join(ROOT, sqlPath), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const select = sql.slice(sql.toUpperCase().indexOf('SELECT') + 6, sql.toUpperCase().indexOf('FROM'));
  return select
    .split(',')
    .map((c) => c.trim().split(/\s+/).pop()!.trim())
    .filter(Boolean)
    .sort();
}

describe('the counter read is a door the cashier can open (sales#203)', () => {
  it('is declared, gated by sales.view_sale', () => {
    expect(m.queries[COUNTER_READ], `${COUNTER_READ} must exist`).toBeTruthy();
    expect(m.queries[COUNTER_READ].permission).toBe('sales.view_sale');
  });

  it('every till role can open it: cashier and employee hold sales.view_sale', () => {
    expect(m.role_permissions.cashier).toContain('sales.view_sale');
    expect(m.role_permissions.employee).toContain('sales.view_sale');
    // And the control that makes the two above mean something: neither of them can open the
    // admin door, which is the whole reason this query exists.
    expect(m.role_permissions.cashier).not.toContain('sales.manage_settings');
    expect(m.role_permissions.employee).not.toContain('sales.manage_settings');
    expect(m.queries[ADMIN_READ].permission).toBe('sales.manage_settings');
  });

  it('projects the operational policy of the counter — exactly, no more and no fewer', () => {
    expect(projectedColumns(m.queries[COUNTER_READ].sql)).toEqual([...OPERATIONAL_COLUMNS].sort());
  });

  it('withholds what is not policy — the row identity above all', () => {
    const projected = projectedColumns(m.queries[COUNTER_READ].sql);
    for (const column of WITHHELD_COLUMNS) {
      expect(projected, `${column} is not the counter's policy`).not.toContain(column);
    }
  });

  it('never becomes a public HTTP surface', () => {
    expect(m.queries[COUNTER_READ].expose_api).toBeUndefined();
  });

  it('WRITING the settings stays behind sales.manage_settings', () => {
    expect(m.commands['sales.settings.update'].permission).toBe('sales.manage_settings');
    expect(m.role_permissions.cashier).not.toContain('sales.manage_settings');
  });

  it('nothing operational is left behind the admin door: the counter read covers it all', () => {
    // The admin read is the superset the settings SCREEN needs (it also carries the row id, which
    // it saves against). Everything else it projects is policy, and policy the till must see.
    const adminOnly = projectedColumns(m.queries[ADMIN_READ].sql).filter(
      (c) => !OPERATIONAL_COLUMNS.includes(c),
    );
    expect(adminOnly, 'an operational column reachable only by an admin is sales#203 all over again')
      .toEqual(['id']);
  });
});
