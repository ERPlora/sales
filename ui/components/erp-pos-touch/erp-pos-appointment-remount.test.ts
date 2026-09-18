// sales#280 — charging a booking when the SHELL rebuilds the till underneath it.
//
// `sales#279` taught the till to serve `?appointment_id=` on every `popstate`, which fixed the
// blank check. It also opened this: the copy the shell keeps mounted-but-hidden wins the race for
// that link, and it CLEARS the query string (`consumeAppointmentDeepLink`, from sales#89) in the
// first microtask after `popstate`. Meanwhile the shell is doing its own thing —
// `hub/apps/web/src/views/ModuleView.vue`:
//
//   onIonViewWillEnter(() => { … if (mountedPath && mountedPath !== route.fullPath) void mount() })
//   async function mount() { … outlet.replaceChildren(); const el = document.createElement(tag) … }
//
// «Cobrar» adds `?appointment_id=` to the path, so `route.fullPath` moved and the till is built
// AGAIN, from scratch. That new copy lands on a URL somebody already cleaned.
//
// The check itself survives — it lives on the server and `restoreOpenOrder()` brings it back with
// its line. What does NOT survive is everything the booking left in the SCREEN's memory:
// `appointmentId`, `customerId`/`customerName`, `staffId`. And `appointmentId` is precisely what
// travels to `complete_sale` to emit `sales.sale.created_from_appointment`, the event with which
// `appointments` writes `converted_sale_id`. Lost, the salon charges the haircut and the agenda
// still shows the booking as unpaid — and the ticket goes out with no customer on it.
//
// So the booking belongs to the CHECK, not to the screen: it is persisted on the order (the same
// place the label, the discount and the line's professional already live) and read back with it.
// That is the only shape that also survives an F5, which a salon tablet does on its own.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const BOOKING = {
  id: 'ap-ana', customer_id: 'c-ana', customer_name: 'Ana Torres',
  staff_id: 'st-lucia', staff_name: 'Lucía Pérez',
  service_id: 's-corte', service_name: 'Corte de caballero', service_price: 1700,
};

const SERVICES = [
  { id: 's-corte', name: 'Corte de caballero', price: 1700, pricing_type: 'fixed',
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];

const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

let commands: { name: string; params?: Record<string, unknown> }[] = [];

/**
 * The orders the hub has, and what it answers about them. Restoring the check is the whole point
 * of this suite, so the double cannot fake it with a frozen row: the order has to be BORN of the
 * command the till sends, and come back through `sales.orders.list` / `sales.order.lines` exactly
 * as the runtime would hand it over.
 */
let orders: Record<string, unknown>[] = [];
let lines: Record<string, unknown>[] = [];
let seq = 0;

function lineRow(orderId: string, item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `line-${++seq}`,
    order_id: orderId,
    product_id: item.product_id ?? '',
    product_name: item.product_name ?? '',
    // `order.open` names the column `price`; `order.add_line` names it `unit_price`. Both doors
    // write the same row.
    unit_price: item.unit_price ?? item.price ?? 0,
    quantity: item.quantity ?? 1_000_000,
    is_service: item.is_service ? 1 : 0,
    tax_category_key: item.tax_category_key || null,
    category_id: item.category_id ?? null,
    staff_id: item.staff_id ?? null,
  };
}

function installSdk(): void {
  commands = [];
  orders = [];
  lines = [];
  seq = 0;
  installPosDouble({
    byIdempotencyKey: [{ id: 'sale-1' }],
    sale: [{ id: 'sale-1', created_at: '2026-09-10T10:00:00Z' }],
    rules: RULES,
    services: SERVICES,
    serviceCategories: [],
    appointment: [BOOKING],
    orders: () => orders,
    orderLines: (params) => lines.filter((l) => l.order_id === params?.order_id),
    command: async (name: string, params?: Record<string, unknown>) => {
      commands.push({ name, params });
      if (name === 'sales.order.open') {
        const id = `ord-${++seq}`;
        // The row `queries/orders_list.sql` really gives back. `schemas/open_order.json` accepts
        // NEITHER `appointment_id` NOR `staff_id` NOR `customer_name`, and the list query returns
        // none of them either: opening a check cannot carry the booking, which is the very reason
        // the link needs its own write. A double that accepted them here would go green on a till
        // that persisted nothing.
        orders.push({
          id, status: 'open', provisional_total: 1700,
          created_at: '2026-09-10T10:00:00Z',
          label: params?.label ?? '',
          appointment_id: null,
        });
        const born: string[] = [];
        for (const it of (params?.items as Record<string, unknown>[] | undefined) ?? []) {
          const row = lineRow(id, it);
          lines.push(row);
          born.push(String(row.id));
        }
        // §5.3: `new_ids[0]` is the main entity — the order — and the lines follow.
        return { ok: true, new_ids: [id, ...born] };
      }
      if (name === 'sales.order.add_line' || name === 'sales.order.add_open_line') {
        const row = lineRow(String(params?.order_id ?? ''), params ?? {});
        lines.push(row);
        return { ok: true, new_ids: [String(row.id)] };
      }
      if (name === 'sales.order.set_appointment') {
        // `commands/order_set_appointment.sql` writes ONE column, and only on an open check.
        // Who the customer is and who served her are NOT persisted here (ADR-0077: the id is
        // opaque and the booking is the authority), so these tests only go green if the till
        // really re-reads the booking when it adopts the check back.
        const order = orders.find((o) => o.id === params?.order_id && o.status === 'open');
        if (order) order.appointment_id = params?.appointment_id ?? null;
        return { ok: true, new_ids: [] };
      }
      return { ok: true, new_ids: [`line-${++seq}`] };
    },
  });
}

interface MountedPos extends HTMLElement {
  cart: { id: string; name: string; price: number; is_service?: boolean }[];
  customerId?: string;
  customerName?: string;
  staffId?: string;
  updateComplete: Promise<unknown>;
  confirm(print?: boolean): Promise<void>;
}

async function settle(el: MountedPos): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
}

/** Mounts the till the way the shell does, on whatever URL the cashier is standing on. */
async function mount(search = ''): Promise<MountedPos> {
  window.history.replaceState({}, '', `/m/sales/pos${search}`);
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch') as MountedPos;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

/** Exactly what `appointments::goToTill()` does: push the URL and knock with `popstate`. */
async function tapCharge(el: MountedPos, appointmentId: string): Promise<void> {
  window.history.pushState({}, '', `/m/sales/pos?appointment_id=${encodeURIComponent(appointmentId)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await settle(el);
}

/**
 * What `ModuleView.mount()` does when the route it had mounted is no longer the route it is on:
 * empties the outlet — which disconnects the live copy — and creates the element again. The URL is
 * NOT touched here on purpose: the copy that just left already cleaned it, and standing on a clean
 * URL is the whole situation this suite is about.
 */
async function shellRemount(prev: MountedPos): Promise<MountedPos> {
  prev.remove();
  await settle(prev);
  const el = document.createElement('erp-pos-touch') as MountedPos;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

function sentSale(): Record<string, unknown> | undefined {
  return commands.find((c) => c.name === 'sales.complete_sale')?.params;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  installSdk();
});

describe('the shell rebuilds the till right after the agenda knocks (sales#280)', () => {
  it('still closes the booking when the sale is charged', async () => {
    const first = await mount(); // the cashier had the till open earlier in the shift
    await tapCharge(first, 'ap-ana');
    expect(first.cart).toHaveLength(1); // the copy on screen armed the check

    const second = await shellRemount(first);
    await second.confirm();

    // Without this id `sales.sale.created_from_appointment` is never emitted, so
    // `commands/_mark_converted.sql` never writes `converted_sale_id`: the salon charged the
    // haircut and the agenda still shows the booking as pending.
    expect(sentSale()?.appointment_id).toBe('ap-ana');
  });

  it('keeps the customer on the ticket', async () => {
    const first = await mount();
    await tapCharge(first, 'ap-ana');

    const second = await shellRemount(first);
    await second.confirm();

    expect(sentSale()?.customer_id).toBe('c-ana');
    expect(sentSale()?.customer_name).toBe('Ana Torres');
  });

  it('keeps the sale attributed to the professional who did the service', async () => {
    const first = await mount();
    await tapCharge(first, 'ap-ana');

    const second = await shellRemount(first);
    await second.confirm();

    expect(sentSale()?.staff_id).toBe('st-lucia');
  });

  it('brings the booked service back with the check, and only once', async () => {
    const first = await mount();
    await tapCharge(first, 'ap-ana');

    const second = await shellRemount(first);

    expect(second.cart.map((l) => l.name)).toEqual(['Corte de caballero']);
  });

  it('survives a reload the same way: nothing of this lives in the screen', async () => {
    // A salon tablet reloads on its own, and a reload is a remount with no previous copy at all
    // to have kept anything in memory. Same rule, harder case.
    const first = await mount();
    await tapCharge(first, 'ap-ana');
    first.remove();
    await settle(first);

    const reloaded = await mount(); // fresh page, clean URL, the check still open on the server
    await reloaded.confirm();

    expect(sentSale()?.appointment_id).toBe('ap-ana');
    expect(sentSale()?.customer_id).toBe('c-ana');
  });
});

// The control. Every test above would also fail if the seeding, the double or the restore were
// broken for reasons that have nothing to do with the remount — so this proves the positive is
// detectable: with no remount in the middle, the very same flow closes the booking today.
describe('control — the same charge without the shell rebuilding anything', () => {
  it('sends the booking at checkout when the copy that armed the check is the one that charges', async () => {
    const el = await mount();
    await tapCharge(el, 'ap-ana');

    await el.confirm();

    expect(sentSale()?.appointment_id).toBe('ap-ana');
    expect(sentSale()?.customer_id).toBe('c-ana');
    expect(sentSale()?.staff_id).toBe('st-lucia');
  });
});

// The reverse of the fix. A booking that is written on the check must be RELEASED with it, or the
// next customer's ticket closes somebody else's booking — the property `appointments#154` pinned
// for the in-memory field, which now has to hold for the persisted one too.
describe('a released check does not carry its booking anywhere (appointments#154)', () => {
  it('does not close the booking of a check that was parked', async () => {
    const first = await mount();
    await tapCharge(first, 'ap-ana');
    await (first as unknown as { park(): Promise<void> }).park();
    await settle(first);

    // A walk-in on the same screen: nothing to do with Ana's booking.
    first.cart = [{ id: 'p-x', name: 'Champú', price: 900 }] as MountedPos['cart'];
    await first.confirm();

    expect(sentSale()?.appointment_id).toBeNull();
  });
});

// The other door into the same check: the PARKED LIST. The shell rebuilding the screen is not the
// only way the copy that armed the check stops being the copy that charges it — the cashier parks
// Ana's check to ring up somebody at the counter and pulls it back two minutes later, which is the
// everyday shape of this in a salon. It is the same rule, so it gets the same guarantee.
describe('recovering the check from the parked list (sales#280)', () => {
  it('brings its booking back, so charging it still closes the agenda', async () => {
    const el = await mount();
    await tapCharge(el, 'ap-ana');
    await (el as unknown as { park(): Promise<void> }).park();
    await settle(el);

    const parked = (el as unknown as { parked: { id: string; appointmentId?: string }[] }).parked;
    const ana = parked.find((c) => c.appointmentId === 'ap-ana');
    expect(ana, 'the parked check kept its booking on the server').toBeDefined();

    await (el as unknown as { retrieve(c: unknown): Promise<void> }).retrieve(ana);
    await settle(el);
    await el.confirm();

    expect(sentSale()?.appointment_id).toBe('ap-ana');
    expect(sentSale()?.customer_id).toBe('c-ana');
    expect(sentSale()?.staff_id).toBe('st-lucia');
  });

  it('drops the booking of the check it LEFT when the next one has none', async () => {
    // The reverse, and the expensive one: the counter check must not close Ana's booking. The
    // check MANDA — no booking on it means no booking on the screen.
    // A check somebody else left open at the counter, with no booking behind it. It is there
    // BEFORE the till boots, which is how the screen gets to see it on its parked list.
    orders.push({
      id: 'ord-counter', status: 'open', provisional_total: 900,
      created_at: '2026-09-10T09:00:00Z', label: '', appointment_id: null,
    });
    lines.push(lineRow('ord-counter', { product_id: 'p-x', product_name: 'Champú', unit_price: 900 }));

    const el = await mount();
    await tapCharge(el, 'ap-ana'); // Ana's check, linked, on screen
    // The client dropped the haircut and only wants to pay the shampoo, so the line goes: the
    // screen is empty but the check is still the one the booking armed.
    el.cart = [];
    await settle(el);

    const counter = (el as unknown as { parked: { id: string }[] }).parked.find((c) => c.id === 'ord-counter');
    expect(counter, 'the counter check is on the list').toBeDefined();
    await (el as unknown as { retrieve(c: unknown): Promise<void> }).retrieve(counter);
    await settle(el);
    await el.confirm();

    expect(sentSale()?.appointment_id).toBeNull();
  });
});
