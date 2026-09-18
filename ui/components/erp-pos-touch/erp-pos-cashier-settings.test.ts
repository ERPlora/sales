// sales#203 — the till's settings were INERT for the two roles that use it all day.
//
// `sales.settings.get` is gated by `sales.manage_settings`, which neither `cashier` nor
// `employee` holds. The runtime denied the read flat, the POS swallowed it with `.catch(() => [])`
// and `this.settings` stayed `{}` — so a shop that had switched card-only, no discounts, no parked
// tickets, VAT-excluded prices and a receipt with its own header handed its cashier a till with
// every one of those back at the factory default. The manager who configured it saw the
// configuration; nobody standing at the counter did.
//
// The fix is the door, not the reader: `sales.pos_settings.get` (sales#25, permission
// `sales.view_sale`, same shape as `sales.business.get` from sales#180) carries the WHOLE
// operational policy, and the till reads its settings through it and only it.
//
// So this file is written as a pair. Every scenario runs TWICE over the same policy row — once as
// an admin (the old admin read also answers) and once as a cashier (it refuses, 403, exactly as
// the runtime does) — and asserts the SAME screen. A regression here is silent by nature: the
// admin who tests it never sees it.
import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPosDouble } from '../../test/pos-double';

function moduleRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('module.json not found walking up from the test');
    dir = up;
  }
  return dir;
}

/** The columns `queries/pos_settings_get.sql` really projects.
 *
 *  The double answers THROUGH this list instead of handing back the whole row, and that is
 *  deliberate: a double more generous than the query is how a screen test goes green over a read
 *  that, in a real hub, never carries the field. Widening the door has to happen in the SQL for
 *  this file to pass, not in the fixture. */
function counterReadProjection(): string[] {
  const sql = readFileSync(join(moduleRoot(), 'queries', 'pos_settings_get.sql'), 'utf8')
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

const COUNTER_PROJECTION = counterReadProjection();

/** The row the counter read would really hand back for a given policy. */
function asCounterRow(policy: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    COUNTER_PROJECTION.filter((c) => c in policy).map((c) => [c, policy[c]]),
  );
}

const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];
const PAY_METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', is_active: 1 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', is_active: 1 },
  { id: 'pm-transfer', name: 'Transferencia', type: 'transfer', is_active: 1 },
];

/** A shop that has configured its counter: card only, no discounts, no parked tickets, prices
 *  WITHOUT VAT inside, invoice by default and its own receipt. Nothing here is a default. */
const CONFIGURED = {
  allow_cash: 0,
  allow_card: 1,
  allow_transfer: 0,
  sync_products: 1,
  sync_services: 1,
  require_customer: 1,
  allow_discounts: 0,
  enable_parked_tickets: 0,
  default_tax_included: 0,
  receipt_header: 'Pepe Bar\n1 Main Street',
  receipt_footer: 'Thanks for your visit',
  receipt_footer_image: 'data:image/png;base64,AAAA',
  receipt_marketing_url: 'https://g.page/r/review',
  receipt_marketing_text: 'Leave us a review',
  default_document_format: 'invoice',
  auto_invoice_with_tax_id: 1,
};

type Role = 'admin' | 'cashier';

let pos: ReturnType<typeof installPosDouble>;
/** Every query name the till asked for, in order. */
const asked = (): string[] => pos.reads.map((r) => r.name);
let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** The SDK as each role sees it. For a `cashier`, `sales.settings.get` REJECTS the way the runtime
 *  refuses a missing permission — the whole point of the issue. For an `admin` it answers the same
 *  row, so any difference between the two runs is the defect and nothing else. */
function installSdk(role: Role, policy: Record<string, unknown> | null = CONFIGURED) {
  pos?.reads.splice(0);
  commands = [];
  pos = installPosDouble({
    settings: policy ? asCounterRow(policy) : null,
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
  dispatchEvent(e: Event): boolean;
  openPay(): Promise<void> | void;
  confirm(): Promise<void>;
}

/** Mounts the till with one open-price line on the ticket: without a line the charge screen does
 *  not open and the test would be measuring the loading state, not the policy. */
async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
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

/** Picks the customer the way the counter really does: the `sales.pos.assign` filler emits its
 *  context (ADR-0043). `CONFIGURED` requires one, and since sales#222 the charge does not even
 *  open without it — so every scenario that reaches the pay sheet has to choose one. */
async function chooseCustomer(pos: Pos, fiscal = { customer_tax_id: '', customer_address: '' }) {
  pos.dispatchEvent(new CustomEvent('erp:customer-context', {
    detail: { customer_id: 'cus-1', customer_name: 'Ana', ...fiscal },
    bubbles: false,
  }));
  await pos.updateComplete;
}

/** Mounts the same policy as each role and hands both tills to the assertion. */
async function forBothRoles(check: (pos: Pos, role: Role) => Promise<void> | void) {
  for (const role of ['admin', 'cashier'] as Role[]) {
    installSdk(role);
    const pos = await mount();
    await check(pos, role);
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState({}, '', '/m/sales/pos');
});

describe('the counter honours the shop policy for a CASHIER, not only for an admin (sales#203)', () => {
  it('reads the policy through ONE door — never the admin-only query', async () => {
    installSdk('cashier');
    await mount();
    expect(asked()).toContain('sales.pos_settings.get');
    expect(asked(), 'one read for the whole policy: the admin door has no business here')
      .not.toContain('sales.settings.get');
  });

  it('lands the SAME policy row for both roles', async () => {
    const seen: Record<string, unknown>[] = [];
    await forBothRoles((pos) => { seen.push({ ...pos.settings }); });
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[1].allow_cash, 'the cashier reads the shop configuration, not the defaults').toBe(0);
  });

  it('allow_cash/allow_card/allow_transfer filter the payment methods offered', async () => {
    await forBothRoles((pos, role) => {
      expect(pos.payMethods.map((m) => m.type), `card only, for ${role}`).toEqual(['card']);
    });
  });

  it('allow_discounts = 0 takes the discount button off the screen', async () => {
    await forBothRoles((pos, role) => {
      expect(pos.discountsAllowed, role).toBe(false);
      expect(pos.shadowRoot.querySelector('.ticket-discount'), `no discount button for ${role}`).toBeNull();
    });
  });

  it('enable_parked_tickets = 0 takes the park button off the screen', async () => {
    await forBothRoles((pos, role) => {
      expect(pos.parkingEnabled, role).toBe(false);
      expect(pos.shadowRoot.querySelector('.park-action'), `no park button for ${role}`).toBeNull();
    });
  });

  it('default_tax_included = 0 travels to the server on the checkout', async () => {
    await forBothRoles(async (pos, role) => {
      // The policy opens the charge on an INVOICE, and an invoice needs its recipient (sales#317):
      // the customer carries a complete fiscal file, as a shop that invoices by default has.
      await chooseCustomer(pos, { customer_tax_id: '12345678Z', customer_address: 'C/ Mayor 1' });
      await pos.openPay();
      await pos.updateComplete;
      await pos.confirm();
      const sale = commands.find((c) => c.name === 'sales.complete_sale');
      expect(sale, `the sale must be sent for ${role}`).toBeTruthy();
      expect(sale!.payload.tax_included, `net prices for ${role}`).toBe(false);
    });
  });

  it('default_document_format = invoice opens the charge on an INVOICE', async () => {
    await forBothRoles(async (pos, role) => {
      await chooseCustomer(pos);
      await pos.openPay();
      await pos.updateComplete;
      expect(pos.docFormat, role).toBe('invoice');
    });
  });

  it('auto_invoice_with_tax_id turns a customer with a tax id into an invoice', async () => {
    for (const role of ['admin', 'cashier'] as Role[]) {
      installSdk(role, { ...CONFIGURED, default_document_format: 'ticket' });
      const pos = await mount();
      await chooseCustomer(pos);
      pos.customerTaxId = 'B12345678';
      await pos.openPay();
      await pos.updateComplete;
      expect(pos.docFormat, role).toBe('invoice');
    }
  });

  it('the receipt keeps the header, the footer and the promotional QR the shop configured', async () => {
    await forBothRoles((pos, role) => {
      const bill = pos.billSettings;
      expect(bill.receipt_header, role).toBe(CONFIGURED.receipt_header);
      expect(bill.receipt_footer, role).toBe(CONFIGURED.receipt_footer);
      expect(bill.receipt_footer_image, role).toBe(CONFIGURED.receipt_footer_image);
      expect(bill.receipt_marketing_url, role).toBe(CONFIGURED.receipt_marketing_url);
      expect(bill.receipt_marketing_text, role).toBe(CONFIGURED.receipt_marketing_text);
    });
  });

  it('carries require_customer, the rule the SERVER enforces, so screen and server read one row', async () => {
    // The handler already refuses a sale with no customer when this is on: its declared `reads`
    // run with system permissions, so the cashier was never able to skip it. What was missing is
    // the screen SEEING the same row the server decides with — without it the till cannot tell the
    // cashier anything until the charge comes back rejected.
    await forBothRoles((pos, role) => {
      expect(pos.settings.require_customer, role).toBe(1);
    });
  });

  it('with no settings row saved, both roles get the same factory till', async () => {
    const seen: Record<string, unknown>[] = [];
    for (const role of ['admin', 'cashier'] as Role[]) {
      installSdk(role, null);
      const pos = await mount();
      seen.push({ ...pos.settings });
      expect(pos.discountsAllowed, `discounts are on by default for ${role}`).toBe(true);
      expect(pos.parkingEnabled, `parking is on by default for ${role}`).toBe(true);
      expect(pos.payMethods.map((m) => m.type), `nothing is filtered out by default for ${role}`)
        .toContain('cash');
    }
    expect(seen[0]).toEqual(seen[1]);
  });
});
