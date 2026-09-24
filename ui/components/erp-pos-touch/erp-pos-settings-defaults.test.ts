// sales#223 — a hub with NO settings row must behave exactly like one that saved the defaults.
//
// The same freshly installed hub answered two different tills depending on whether anybody had
// ever pressed Save on the settings screen:
//
//   - no row in `sales_settings`  → bank transfer OFFERED at the counter;
//   - row saved with the defaults → bank transfer hidden.
//
// Two defaults that never spoke to each other. The column and the JSON schema agreed (transfer is
// OFF out of the box, and `settings-defaults-contract` already pins those two together); what was
// missing is the third leg — what the SCREEN falls back to when the read brings no row. It filtered
// with `policy.allow_transfer !== 0`, and with no row the field arrives `undefined`, so
// `undefined !== 0` said "allowed".
//
// This file is the shape of the fix, not the symptom: every setting is asserted TWICE — once with
// no row and once with the row the form writes when it saves the declared defaults — and the two
// tills have to be indistinguishable. The defaults row is BUILT FROM `schemas/settings_update.json`
// on purpose: a fixture written by hand would be a fourth default to keep in step.
import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';
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

/** The columns `queries/pos_settings_get.sql` really projects: the till never sees more than this,
 *  so neither does the double. */
function counterReadProjection(): string[] {
  const sql = readFileSync(join(ROOT, 'queries', 'pos_settings_get.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const upper = sql.toUpperCase();
  return sql
    .slice(upper.indexOf('SELECT') + 6, upper.indexOf('FROM'))
    .split(',')
    .map((c) => c.trim().split(/\s+/).pop()!.trim())
    .filter(Boolean);
}

const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'settings_update.json'), 'utf8')) as {
  properties: Record<string, { default?: unknown }>;
};

/** The row the settings form writes when the shop opens it and presses Save without changing a
 *  thing: every declared default, stored the way the portable SQL subset stores it (ADR-0007 —
 *  booleans are 0/1 INTEGER). This is the row the "no row" case has to be indistinguishable from. */
const DEFAULTS_ROW: Record<string, unknown> = Object.fromEntries(
  counterReadProjection()
    .filter((c) => schema.properties[c]?.default !== undefined)
    .map((c) => {
      const v = schema.properties[c].default;
      return [c, typeof v === 'boolean' ? (v ? 1 : 0) : v];
    }),
);

const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];
/** Every payment method a hub can be seeded with, all ACTIVE: what the policy hides has to be the
 *  policy's doing, never the query's. */
const PAY_METHODS = [
  { id: 'pm-cash', name: 'Cash', type: 'cash', is_active: 1 },
  { id: 'pm-card', name: 'Card', type: 'card', is_active: 1 },
  { id: 'pm-transfer', name: 'Transfer', type: 'transfer', is_active: 1 },
  { id: 'pm-bizum', name: 'Bizum', type: 'other', is_active: 1 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** The SDK for a hub whose settings read answers `policy` — `null` meaning there is no row. */
function installSdk(policy: Record<string, unknown> | null) {
  commands = [];
  installPosDouble({
    settings: policy,
    paymentMethods: PAY_METHODS,
    business: [{ name: 'Pepe Ltd' }],
    rules: RULES,
    taxCategories: TAX_CATS,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') return { ok: true, new_ids: ['ord-1', 'line-1'] };
      return { rows: [{ id: 'sale-1' }] };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  settings: Record<string, unknown>;
  payMethods: { id: string; type: string }[];
  discountsAllowed: boolean;
  parkingEnabled: boolean;
  billSettings: Record<string, unknown>;
  docFormat: 'ticket' | 'invoice';
  customerTaxId: string;
  openDept: string;
  openAmount: string;
  addOpenPrice(): Promise<void>;
  openPay(): Promise<void> | void;
  confirm(): Promise<void>;
}

/** Mounts the till with one open-price line already on the ticket: without a line the charge
 *  screen never opens and the assertions would be reading the loading state. */
async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  const pos = el as unknown as Pos;
  await pos.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await pos.updateComplete;
  pos.openDept = 'product.generic';
  pos.openAmount = '12.50';
  await pos.addOpenPrice();
  await pos.updateComplete;
  return pos;
}

/** The two hubs the issue puts side by side, in that order: no row, then the saved defaults. */
async function forBothHubs(check: (pos: Pos, hub: string) => Promise<void> | void) {
  for (const [hub, policy] of [
    ['no settings row', null],
    ['defaults saved', DEFAULTS_ROW],
  ] as [string, Record<string, unknown> | null][]) {
    installSdk(policy);
    const pos = await mount();
    await check(pos, hub);
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState({}, '', '/m/sales/pos');
});

describe('a hub with no settings row is the same till as one that saved the defaults (sales#223)', () => {
  it('the defaults row really was built (a fixture that reads nothing proves nothing)', () => {
    expect(DEFAULTS_ROW.allow_cash, 'cash is on out of the box').toBe(1);
    expect(DEFAULTS_ROW.allow_transfer, 'bank transfer is OFF out of the box').toBe(0);
    expect(DEFAULTS_ROW.default_document_format).toBe('ticket');
    expect(Object.keys(DEFAULTS_ROW).length).toBeGreaterThan(10);
  });

  it('offers the same payment methods — bank transfer is off out of the box, row or no row', async () => {
    const seen: string[][] = [];
    await forBothHubs((pos, hub) => {
      const types = pos.payMethods.map((m) => m.type).sort();
      expect(types, `bank transfer is not configured in this hub (${hub})`).not.toContain('transfer');
      seen.push(types);
    });
    expect(seen[0], 'the two hubs must offer the same thing').toEqual(seen[1]);
  });

  it('lands the same effective policy either way', async () => {
    const seen: Record<string, unknown>[] = [];
    await forBothHubs((pos) => { seen.push({ ...pos.settings }); });
    expect(seen[0]).toEqual(seen[1]);
  });

  it('agrees on discounts, parked tickets and the document the charge opens on', async () => {
    const seen: Record<string, unknown>[] = [];
    await forBothHubs(async (pos) => {
      await pos.openPay();
      await pos.updateComplete;
      seen.push({
        discounts: pos.discountsAllowed,
        parking: pos.parkingEnabled,
        docFormat: pos.docFormat,
      });
    });
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0], 'the declared defaults: discounts and parking on, ticket by default')
      .toEqual({ discounts: true, parking: true, docFormat: 'ticket' });
  });

  it('sends the same tax_included to the server on the checkout', async () => {
    const seen: unknown[] = [];
    await forBothHubs(async (pos, hub) => {
      await pos.openPay();
      await pos.updateComplete;
      await tenderExactCash(pos); // sales#309: cash is typed before charging
      await pos.confirm();
      const sale = commands.find((c) => c.name === 'sales.complete_sale');
      expect(sale, `the sale must be sent for the hub with ${hub}`).toBeTruthy();
      seen.push(sale!.payload.tax_included);
    });
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0], 'prices carry VAT inside by default').toBe(true);
  });

  it('a tax id does NOT turn the ticket into an invoice: auto_invoice is off out of the box', async () => {
    await forBothHubs(async (pos, hub) => {
      pos.customerTaxId = 'B12345678';
      await pos.openPay();
      await pos.updateComplete;
      expect(pos.docFormat, `auto invoice is not configured in this hub (${hub})`).toBe('ticket');
    });
  });

  it('prints the same receipt: no header, no footer, no promotional QR', async () => {
    const seen: Record<string, unknown>[] = [];
    await forBothHubs((pos) => {
      const bill = pos.billSettings;
      seen.push({
        header: bill.receipt_header ?? '',
        footer: bill.receipt_footer ?? '',
        image: bill.receipt_footer_image ?? '',
        url: bill.receipt_marketing_url ?? '',
        text: bill.receipt_marketing_text ?? '',
      });
    });
    expect(seen[0]).toEqual(seen[1]);
  });
});
