// sales#63 — the open-price line must go through its OWN door, always.
//
// The permission (`sales.sell_open_price`) is only worth what the client honours: the runtime gates
// per COMMAND, so a free-price line that travels on `sales.order.add_line` is charged on
// `sales.add_sale` — which every cashier holds — and the control never happens.
//
// There is a second, quieter way through: the till opens the check WITH its first line
// (`sales.order.open`, also `sales.add_sale`). Tap «Precio libre» as the first action of an empty
// till and the amount would ride inside the order-opening payload, past the gate. So the open-price
// path opens an EMPTY order first and then adds its line through the gated command.
//
// A cashier without the permission does not get a dead end: the dispatcher answers
// `requires_elevation` and the shell raises the manager-PIN dialog at transport level (ADR-0238),
// exactly the default Toast, Shopify and Vagaro ship.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];

let commands: { name: string; params: Record<string, unknown> }[] = [];

function installSdk() {
  commands = [];
  installPosDouble({
    rules: RULES,
    taxCategories: TAX_CATS,
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: `row-${commands.length}` }] };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  cart: unknown[];
  updateComplete: Promise<unknown>;
  openDept: string;
  openAmount: string;
  addOpenPrice(): Promise<void>;
}

async function mount(): Promise<Pos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as Pos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as Pos).updateComplete;
  return el as unknown as Pos;
}

/** Drives the sheet the way the cashier does: pick a department, type an amount, add. */
async function sellOpenPrice(el: Pos, cents = 1250) {
  el.openDept = 'product.generic';
  el.openAmount = String(cents / 100);
  await el.addOpenPrice();
  await el.updateComplete;
}

const named = (n: string) => commands.filter((c) => c.name === n);

beforeEach(() => { document.body.innerHTML = ''; installSdk(); });

describe('the open-price line travels on its own command (sales#63)', () => {
  it('adds it with sales.order.add_open_line', async () => {
    const el = await mount();
    await sellOpenPrice(el);
    expect(named('sales.order.add_open_line')).toHaveLength(1);
  });

  it('never adds it with the ungated sales.order.add_line', async () => {
    const el = await mount();
    await sellOpenPrice(el);
    expect(named('sales.order.add_line')).toHaveLength(0);
  });

  it('carries the typed amount and the chosen department to the gated command', async () => {
    const el = await mount();
    await sellOpenPrice(el, 1250);
    const [add] = named('sales.order.add_open_line');
    expect(add.params).toMatchObject({ unit_price: 1250, tax_category_key: 'product.generic' });
    // No catalogue product backs it: that is what makes it a free line.
    expect(add.params.product_id).toBeNull();
  });
});

describe('the back door: opening the check with the free line inside', () => {
  it('opens an EMPTY order instead of smuggling the amount into order.open', async () => {
    const el = await mount();
    await sellOpenPrice(el, 9900);

    const [open] = named('sales.order.open');
    expect(open, 'the till had no order yet, so it must open one').toBeDefined();
    expect(open.params.items, 'the free line must NOT ride inside order.open').toEqual([]);
  });

  it('and then adds the line through the gated command', async () => {
    const el = await mount();
    await sellOpenPrice(el, 9900);

    const order = commands.findIndex((c) => c.name === 'sales.order.open');
    const gated = commands.findIndex((c) => c.name === 'sales.order.add_open_line');
    expect(gated).toBeGreaterThan(order);
  });
});
