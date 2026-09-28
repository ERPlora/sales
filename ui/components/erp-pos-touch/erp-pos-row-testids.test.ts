// sales#448 — every line of the check is addressable on its own, even with the same product twice.
//
// The same product on two lines is ordinary: Ana's cut and Marta's (sales#273), a burger and
// another one «no onion» (pm#93), one of them on the house. The line and its controls (comp, note,
// discount) were named by PRODUCT — `pos-line-${l.id}-gift`, and `l.id` is the `product_id` — so
// both rows carried the same hooks and a spec (or a QA agent) pressing «the comp of Marta's line»
// always got Ana's. A defect on the second line could ship with every spec green.
//
// The row is named by ITS OWN identity, the order row (`line_id`); a line not saved yet has no row
// and keeps the product. The product is still on the row as `data-product-id`, so a spec that only
// knows the tile it tapped can still find its lines.
//
// And the same trap one layer down: a line on screen that lost its row id is matched back by
// re-reading the order by product — which could hand it the row the OTHER line already holds.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-corte', name: 'Corte', sku: 'COR', price: 1500, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const USERS = [
  { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true },
  { id: 'u-marta', name: 'Marta', role: 'employee', is_active: true },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];

const cutRow = (id: string, qty: number, staff?: string) => ({
  id, product_id: 'p-corte', product_name: 'Corte', quantity: qty * 1_000_000,
  unit_price: 1500, line_total: 1500 * qty, tax_category_key: 'product.generic',
  ...(staff ? { staff_id: staff } : {}),
});

function installSdk() {
  commands = [];
  orderLines = [];
  installPosDouble({
    settings: () => ({ allow_discounts: 1 }),
    products: PRODUCTS,
    rules: RULES,
    users: USERS,
    orderLines: () => orderLines,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        orderLines = [cutRow('line-1', 1)];
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      return { ok: true, new_ids: ['x'] };
    },
  });
}

interface Line { id: string; line_id?: string; qty: number; is_gift?: boolean; staff_id?: string; name?: string; price?: number }
interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: Line[];
  error: string;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

async function settle(el: Pos): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

async function tapTile(el: Pos): Promise<void> {
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await settle(el);
}

/** A check with the same service twice: Ana's cut (line-1) and Marta's (line-2). */
async function twoCutsOnOneCheck(): Promise<Pos> {
  const el = await mount();
  await tapTile(el);
  expect(el.cart.map((l) => l.line_id), 'the first cut is a saved row').toEqual(['line-1']);
  el.cart = [
    { ...el.cart[0], staff_id: 'u-ana' },
    { ...el.cart[0], line_id: 'line-2', qty: 2, staff_id: 'u-marta' },
  ];
  orderLines = [cutRow('line-1', 1, 'u-ana'), cutRow('line-2', 2, 'u-marta')];
  await settle(el);
  commands = [];
  return el;
}

const byTestId = (el: Pos, id: string) => [...el.shadowRoot.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const row = (el: Pos, lineId: string) => el.cart.find((l) => l.line_id === lineId)!;

beforeEach(() => { localStorage.clear(); installSdk(); });

describe('sales#448 · each line of the same product carries its own hooks', () => {
  for (const control of ['', '-gift', '-note', '-discount']) {
    it(`«pos-line-<row>${control}» names exactly one element per row`, async () => {
      const el = await twoCutsOnOneCheck();
      expect(byTestId(el, `pos-line-line-1${control}`), 'Ana\'s row').toHaveLength(1);
      expect(byTestId(el, `pos-line-line-2${control}`), 'Marta\'s row').toHaveLength(1);
      expect(byTestId(el, `pos-line-p-corte${control}`), 'no hook is shared by the two rows').toHaveLength(0);
    });
  }

  it('the hooks of a row live inside THAT row', async () => {
    const el = await twoCutsOnOneCheck();
    const second = byTestId(el, 'pos-line-line-2')[0]!;
    for (const control of ['gift', 'note', 'discount']) {
      expect(second.querySelector(`[data-testid="pos-line-line-2-${control}"]`), control).not.toBeNull();
    }
  });

  it('the rows still say which product they are, for a spec that only knows the tile it tapped', async () => {
    const el = await twoCutsOnOneCheck();
    const rows = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-item[data-product-id="p-corte"]')];
    expect(rows.map((r) => r.dataset.testid)).toEqual(['pos-line-line-1', 'pos-line-line-2']);
  });

  it('pressing the comp of the second row by its hook comps THAT row', async () => {
    const el = await twoCutsOnOneCheck();
    byTestId(el, 'pos-line-line-2-gift')[0]!.click();
    await settle(el);

    expect(row(el, 'line-2').is_gift, 'Marta\'s line is on the house').toBe(true);
    expect(row(el, 'line-1').is_gift ?? false, 'Ana\'s line is still charged').toBe(false);
  });

  it('a line not saved yet has no row: it is named by its product', async () => {
    const el = await mount();
    el.cart = [{ id: 'p-corte', qty: 1, name: 'Corte', price: 1500 }];
    await settle(el);
    expect(byTestId(el, 'pos-line-p-corte')).toHaveLength(1);
    expect(byTestId(el, 'pos-line-p-corte-gift')).toHaveLength(1);
  });
});

describe('sales#448 · a line that lost its row id is never matched to the other line\'s row', () => {
  it('tapping the tile again writes the row of THIS line, not the sibling listed first', async () => {
    const el = await twoCutsOnOneCheck();
    // Ana's line (no professional on the chip) lost its row id on screen; the order lists Marta's
    // row of the same product FIRST.
    el.cart = [
      { ...row(el, 'line-1'), line_id: undefined, staff_id: undefined },
      { ...row(el, 'line-2') },
    ];
    orderLines = [cutRow('line-2', 2, 'u-marta'), cutRow('line-1', 1)];
    await settle(el);

    await tapTile(el);

    expect(commands.filter((c) => c.name === 'sales.order.update_line').map((c) => [c.payload.line_id, c.payload.quantity]),
      'the row written is Ana\'s').toEqual([['line-1', 2_000_000]]);
    expect(el.cart.map((l) => [l.line_id, l.qty]), 'each line keeps its own row').toEqual([['line-1', 2], ['line-2', 2]]);
  });
});
