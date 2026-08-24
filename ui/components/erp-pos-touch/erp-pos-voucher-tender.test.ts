// sales#162 / ADR-0386 — the till HOSTS the `sales.pos.tender` slot, one instance per LINE.
//
// `services` already built, translated and tested its side (services#70/#71, 1.5.35): a read that
// says which vouchers cover THIS line with the preview («4 left · 3 after»), the default voucher
// with its reason written, and the commands to hold, undo and settle. It declares the component in
// `sales.pos.tender` — and nobody sees it, because the POS never asks for that slot.
//
// A voucher covers a LINE, whole or not at all (it is N uses of concrete services, not a wallet),
// so the slot goes on the line and not on the ticket. What the host owes the filler is four values
// and two ears:
//
//   customer-id · service-id · checkout-ref · line-ref
//   `erp:voucher-held` → that line is paid, take it out of the amount to charge
//   `erp:voucher-released` → it counts again
//
// 🔴 THE HOST LEARNS NOTHING ABOUT VOUCHERS. It hosts a slot; the word «voucher» never reaches a
// decision here. A hub without `services` gets zero calls and zero gaps on screen, which is the
// last test of this file and the reason the other seven are allowed to exist.
import { beforeEach, describe, expect, it } from 'vitest';

const PRODUCTS = [
  { id: 'p-champu', name: 'Champú', price: 900, is_active: 1, tax_category_key: 'product.generic' },
];
const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    duration_minutes: 45, category_id: 'sc-pelo', tax_category_key: 'service.generic',
    status: 'active' },
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

/** Every slot the till asked the SDK for, in order. */
let slotsAsked: string[] = [];
let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** A stand-in for `erp-services-voucher-tender`: it only records what the host handed it. */
class FakeVoucherTender extends HTMLElement {
  customerId = '';
  serviceId = '';
  checkoutRef = '';
  lineRef = '';
}
if (!customElements.get('erp-fake-voucher')) {
  customElements.define('erp-fake-voucher', FakeVoucherTender);
}

/** `servicesInstalled: false` reproduces a hub that never installed `services`. */
function installSdk(servicesInstalled = true) {
  slotsAsked = [];
  commands = [];
  const orderLines: Record<string, unknown>[] = [];
  let seq = 0;
  const missing = () => { throw new Error('module_not_installed'); };
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) => {
      if (name === 'sales.payment_methods') return METHODS;
      if (name === 'sales.order.lines') return orderLines;
      if (name === 'sales.by_idempotency_key') return [{ id: 'sale-1' }];
      return [];
    },
    queryAll: async (name: string) => {
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'taxes.rules.list') return RULES;
      if (name === 'services.services.list') return servicesInstalled ? SERVICES : missing();
      if (name === 'services.categories.list') return servicesInstalled ? SERVICE_CATS : missing();
      return [];
    },
    queryOptional: async (name: string) => {
      if (name === 'services.services.list') return servicesInstalled ? SERVICES : undefined;
      if (name === 'services.categories.list') return servicesInstalled ? SERVICE_CATS : undefined;
      return undefined;
    },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open' || name === 'sales.order.add_line') {
        const items = (payload.items as Record<string, unknown>[] | undefined)
          ?? [payload as Record<string, unknown>];
        const ids: string[] = name === 'sales.order.open' ? ['ord-1'] : [];
        for (const it of items) {
          const id = `line-${++seq}`;
          ids.push(id);
          orderLines.push({
            id, product_id: it.product_id, product_name: it.product_name,
            quantity: it.quantity, unit_price: it.price, line_total: it.price,
            tax_category_key: it.tax_category_key, is_service: it.is_service ? 1 : 0,
          });
        }
        return { ok: true, new_ids: ids };
      }
      return { ok: true, new_ids: [`x-${++seq}`] };
    },
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_c: unknown, key: string) => key,
    loadSlot: async (slot: string) => {
      slotsAsked.push(slot);
      if (!servicesInstalled) return [];
      return slot === 'sales.pos.tender' ? [{ component: 'erp-fake-voucher' }] : [];
    },
    notify: () => {},
    hasPermission: () => true,
  };
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const $$ = (el: Pos, sel: string) => [...el.shadowRoot.querySelectorAll<HTMLElement>(sel)];

async function addByName(el: Pos, name: string) {
  const tile = $$(el, 'ion-card.tile').find((c) => c.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile named ${name}`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

function assignCustomer(el: Pos, id = 'cust-1') {
  el.dispatchEvent(new CustomEvent('erp:customer-context', {
    detail: { customer_id: id, customer_name: 'Ana' },
  }));
}

/** A haircut (18,00 €) plus a shampoo (9,00 €), a customer assigned, and the pay sheet open. */
async function salonTicket(servicesInstalled = true): Promise<Pos> {
  installSdk(servicesInstalled);
  const el = await mount();
  await addByName(el, 'Corte de señora');
  await addByName(el, 'Champú');
  assignCustomer(el);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const payable = (el: Pos) => $(el, '.sheet .pay-total')?.textContent?.trim();
const fillerOf = (el: Pos, lineRef: string) =>
  $(el, `.tender-line[data-line="${lineRef}"] erp-fake-voucher`) as FakeVoucherTender | null;

function hold(el: Pos, lineRef: string, redemptionId = 'red-1') {
  fillerOf(el, lineRef)!.dispatchEvent(new CustomEvent('erp:voucher-held', {
    bubbles: true, composed: true,
    detail: { redemptionId, packageId: 'pkg-1', lineRef, checkoutRef: 'ord-1' },
  }));
}
function release(el: Pos, lineRef: string, redemptionId = 'red-1') {
  fillerOf(el, lineRef)!.dispatchEvent(new CustomEvent('erp:voucher-released', {
    bubbles: true, composed: true, detail: { redemptionId, lineRef },
  }));
}

beforeEach(() => { installSdk(); });

describe('sales#162 — the POS hosts `sales.pos.tender`', () => {
  it('asks the SDK for the tender slot (control: it already asks for `sales.pos.assign`)', async () => {
    const el = await salonTicket();
    expect(slotsAsked, 'positive control: the assign slot IS asked for today').toContain('sales.pos.assign');
    expect(slotsAsked, 'the till must ask for the tender slot').toContain('sales.pos.tender');
    expect(el).toBeTruthy();
  });

  it('mounts the filler on the SERVICE line and on no other', async () => {
    const el = await salonTicket();
    expect(fillerOf(el, 'line-1'), 'the haircut carries the slot').toBeTruthy();
    expect($$(el, '.tender-line')).toHaveLength(1);
    expect($(el, '.tender-line[data-line="line-2"]'), 'the shampoo is not a service').toBeNull();
  });

  it('hands the filler the four values of the contract, as JS properties', async () => {
    const el = await salonTicket();
    const filler = fillerOf(el, 'line-1')!;
    expect(filler.customerId).toBe('cust-1');
    expect(filler.serviceId, 'the product_id of the service line').toBe('s-corte');
    expect(filler.checkoutRef, 'the same value that travels as order_id in sale.completed').toBe('ord-1');
    expect(filler.lineRef).toBe('line-1');
    // Properties, never attributes: these are typed data, not strings on the DOM.
    expect(filler.getAttribute('customer-id')).toBeNull();
  });

  it('without a customer there is no voucher to offer, so the slot is not mounted', async () => {
    installSdk();
    const el = await mount();
    await addByName(el, 'Corte de señora');
    el.openPay();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect($$(el, '.tender-line')).toHaveLength(0);
  });

  it('a confirmed redemption takes that line out of the amount to charge', async () => {
    const el = await salonTicket();
    expect(payable(el), 'the whole ticket before the redemption').toBe('27.00 €');
    hold(el, 'line-1');
    await el.updateComplete;
    expect(payable(el), 'only the shampoo is left to charge').toBe('9.00 €');
  });

  it('undoing it puts the line back into the amount', async () => {
    const el = await salonTicket();
    hold(el, 'line-1');
    await el.updateComplete;
    release(el, 'line-1');
    await el.updateComplete;
    expect(payable(el)).toBe('27.00 €');
  });

  it('the covered line travels to `complete_sale` marked, and the rest at full price', async () => {
    const el = await salonTicket();
    hold(el, 'line-1');
    await el.updateComplete;
    await el.confirm(false);
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    const items = sale.payload.items as Record<string, unknown>[];
    expect(items, 'the covered line stays in the sale: the customer did get the haircut').toHaveLength(2);
    const corte = items.find((i) => i.product_id === 's-corte')!;
    const champu = items.find((i) => i.product_id === 'p-champu')!;
    expect(corte.covered, 'covered by an external tender — the handler zeroes it').toBe(true);
    expect(corte.price, 'the price is NOT zeroed by the browser: the server decides').toBe(1800);
    expect(champu.covered).toBeUndefined();
  });

  it('without `services` installed the checkout does not change: no gaps, no fillers', async () => {
    // No `services` means no service catalogue either, so this is a shop ticket: one shampoo. The
    // guarantee is that the pay sheet is EXACTLY the one that shipped in 2.16.2 — the slot leaves
    // no empty row behind, and `loadSlot` handing back nothing is the normal case, not a failure.
    installSdk(false);
    const el = await mount();
    await addByName(el, 'Champú');
    assignCustomer(el);
    await el.updateComplete;
    el.openPay();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect($$(el, '.tender-line'), 'no empty row where the slot would go').toHaveLength(0);
    expect($$(el, 'erp-fake-voucher')).toHaveLength(0);
    expect(payable(el)).toBe('9.00 €');
  });
});
