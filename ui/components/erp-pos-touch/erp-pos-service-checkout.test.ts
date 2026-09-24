// sales#146 — a salon must be able to CHARGE the haircut, not just put it in the cart.
//
// `is_service` is the one bit that tells the handler this line has no `inventory` row behind it:
// `is_catalog_line()` (handler/src/lib.rs) treats any line WITH `product_id` and WITHOUT
// `is_service` as a catalogue line, looks its id up in the pre-loaded product catalogue and, not
// finding the service there, refuses the WHOLE sale with `sales.product_not_available`. So a
// dropped flag is not a cosmetic loss: it is a till that cannot take money for a haircut.
//
// The flag was already put on the cart line when the tile was tapped, and `sales.order.open`
// already carried it to the order — which is exactly what made the hole invisible: everything up
// to the last step looked right. The payload of `sales.complete_sale` was built by its OWN
// `items.map()`, and that one never listed the field.
//
// 🔴 Why this file exists at all, next to `checkout-contract.test.ts`: that one asserts the
// SCHEMA declares `is_service`. A schema that ACCEPTS a field says nothing about whether the till
// SENDS it — the schema was complete the whole time the POS was broken. What has to be pinned is
// the payload the component really builds, so these tests drive the real screen (tap the tile,
// open the sheet, pick a method, confirm) and read what left through `erplora().command`.
import { beforeEach, describe, expect, it } from 'vitest';
import schema from '../../../schemas/complete_sale.json';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';
// ⚠️ Every sellable carries its `tax_category_key`: without it the tile is BLOCKED (sales#74/#58)
// and the grid is dead by data, which looks exactly like "the POS does not respond".
const PRODUCTS = [
  { id: 'p-champu', name: 'Champú', sku: 'CHA', price: 900, is_active: 1, tax_category_key: 'product.generic' },
];

/** `services.services.list` rows, shaped as that query really projects them. */
const SERVICES = [
  { id: 's-corte', name: 'Corte y barba', price: 1800, pricing_type: 'fixed', duration_minutes: 45,
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];
const SERVICE_CATS = [{ id: 'sc-pelo', name: 'Cabello' }];

const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];

function installSdk() {
  commands = [];
  const orderLines: Record<string, unknown>[] = [];
  installPosDouble({
    paymentMethods: METHODS,
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    services: SERVICES,
    serviceCategories: SERVICE_CATS,
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        const line = (payload.items as Record<string, unknown>[])[0];
        // `sales.order.lines` projects the persisted row, `is_service` included (sales#89): a
        // RESUMED check has to keep knowing it is charging a haircut. The column is an integer, so
        // the fixture answers with one — anything friendlier here would hide the real mapping.
        orderLines.push({ id: 'line-1', product_id: line.product_id, product_name: line.product_name,
          product_sku: line.product_sku, quantity: line.quantity, unit_price: line.price,
          line_total: line.price, tax_category_key: line.tax_category_key,
          is_service: line.is_service ? 1 : 0 });
      }
      return { ok: true, new_ids: ['ord-1', 'line-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
  cart: { id: string; is_service?: boolean }[];
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

/** Taps the tile whose name is painted on it — the salon's actual gesture. */
async function tap(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

/** Opens the pay sheet and picks the payment method by its printed name. */
async function pay(el: Pos, method: string) {
  el.openPay();
  await el.updateComplete;
  const btn = [...el.shadowRoot.querySelectorAll<HTMLElement>('.sheet button.pm-btn')]
    .find((b) => b.textContent?.trim() === method);
  if (!btn) throw new Error(`no payment button for "${method}"`);
  btn.click();
  await el.updateComplete;
}

const checkout = () => commands.find((c) => c.name === 'sales.complete_sale');
const itemsOf = (c: { payload: Record<string, unknown> }) =>
  c.payload.items as Record<string, unknown>[];

beforeEach(installSdk);

describe('charging a SERVICE from the till (sales#146)', () => {
  it('sends the service line flagged `is_service`, so the handler does not measure it against inventory', async () => {
    const el = await mount();
    await tap(el, 'Corte y barba');
    await pay(el, 'Tarjeta');
    await el.confirm();

    const sale = checkout();
    expect(sale, 'the till reached `sales.complete_sale`').toBeDefined();
    const [line] = itemsOf(sale!);
    expect(line.product_id).toBe('s-corte');
    // Without this the handler calls it a catalogue line, cannot find the id in `inventory` and
    // refuses the whole sale with `sales.product_not_available`.
    expect(line.is_service, 'the service line must declare itself a service').toBe(true);
  });

  it('keeps the flag when the service is charged alongside a retail product — and only there', async () => {
    const el = await mount();
    await tap(el, 'Corte y barba');
    await tap(el, 'Champú');
    await pay(el, 'Efectivo');
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();

    const items = itemsOf(checkout()!);
    expect(items).toHaveLength(2);
    const service = items.find((i) => i.product_id === 's-corte');
    const product = items.find((i) => i.product_id === 'p-champu');
    expect(service!.is_service, 'the haircut is a service').toBe(true);
    // The shampoo IS a catalogue row: flagging it would skip the price/stock authority the
    // handler applies to everything `inventory` owns.
    expect(product!.is_service ?? false, 'the shampoo is not a service').toBe(false);
  });

  it('a till with only retail sends no service flag at all', async () => {
    const el = await mount();
    await tap(el, 'Champú');
    await pay(el, 'Efectivo');
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();

    const [line] = itemsOf(checkout()!);
    expect(line.is_service ?? false).toBe(false);
  });

  // The order already carried the flag (`pos-cart.ts`) while the checkout dropped it. Pinning both
  // ends here is what keeps the two payload builders from drifting apart again.
  it('the ORDER that backs the cart carries it too, so a resumed check still charges', async () => {
    const el = await mount();
    await tap(el, 'Corte y barba');

    const order = commands.find((c) => c.name === 'sales.order.open');
    expect(order, 'the cart is backed by a real order (ADR-0141)').toBeDefined();
    expect(itemsOf(order!)[0].is_service).toBe(true);
  });
});

// The other direction of the same seam. `complete_sale.json` closes the payload
// (`additionalProperties: false`), so a key the till invents is a 400 before the handler runs —
// and `checkout-contract.test.ts` can only check the schema against a hand-written list of names.
// Here the list is not hand-written: it is whatever the component actually put on the wire.
describe('every field the till really sends is declared by the schema', () => {
  type JsonSchema = { properties: Record<string, JsonSchema>; items?: JsonSchema };
  const s = schema as unknown as JsonSchema;
  const itemSchema = s.properties.items.items as JsonSchema;

  it('holds for a mixed basket — service plus retail, the salon default', async () => {
    const el = await mount();
    await tap(el, 'Corte y barba');
    await tap(el, 'Champú');
    await pay(el, 'Efectivo');
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();

    const sale = checkout()!;
    for (const key of Object.keys(sale.payload)) {
      expect(s.properties[key], `top-level \`${key}\` is not declared in complete_sale.json`).toBeDefined();
    }
    for (const line of itemsOf(sale)) {
      for (const key of Object.keys(line)) {
        expect(itemSchema.properties[key], `line field \`${key}\` is not declared in complete_sale.json`).toBeDefined();
      }
    }
  });
});
