// appointments#154 — charging a booking when the till was ALREADY open.
//
// The appointment→till seam (ADR-0077, sales#89) was built end to end: the agenda pushes
// `/m/sales/pos?appointment_id=<id>` with `history.pushState` + `PopStateEvent`, and the till
// consumes it. What broke was the DELIVERY, not the mechanism.
//
// The till read the URL exactly ONCE, inside its boot, and the hub shell does not tear the
// previous screen down — `hub/apps/web/src/views/ModuleView.vue` says it in as many words: «Ionic
// no desmonta la página que dejas atrás (…) la vista se queda montada y viva, solo escondida». So
// the moment the cashier had opened the till once during the shift, the next «Cobrar» landed on an
// already-mounted copy, nobody looked at the query string again, and the check came up blank: no
// customer, no service, no professional. Everything had to be typed in again.
//
// It is the same trap `flows#57` closed: a module deep link is served on EVERY navigation that
// names it — mount AND `popstate` — never «once».
//
// The guard below dies if anyone goes back to reading the link a single time: the first test
// mounts the till with a plain URL (the cashier's till, already on screen) and only then delivers
// the booking.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import type { ErploraDouble } from '../../test/erplora-double';

const BOOKINGS = [
  {
    id: 'ap-ana', customer_id: 'c-ana', customer_name: 'Ana Torres',
    staff_id: 'st-lucia', staff_name: 'Lucía Pérez',
    service_id: 's-corte', service_name: 'Corte de caballero', service_price: 1700,
  },
  {
    id: 'ap-eva', customer_id: 'c-eva', customer_name: 'Eva Gil',
    staff_id: 'st-marta', staff_name: 'Marta Ruiz',
    service_id: 's-color', service_name: 'Color', service_price: 4500,
  },
];

const SERVICES = [
  { id: 's-corte', name: 'Corte de caballero', price: 1700, pricing_type: 'fixed',
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
  { id: 's-color', name: 'Color', price: 4500, pricing_type: 'fixed',
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];

const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

let double: ErploraDouble;

function installSdk(): void {
  double = installPosDouble({
    byIdempotencyKey: [{ id: 'sale-1' }],
    sale: [{ id: 'sale-1', created_at: '2026-09-09T10:00:00Z' }],
    rules: RULES,
    services: SERVICES,
    serviceCategories: [],
    // A POINT read: the double answers the booking the params ask for, the way the runtime does.
    appointment: (params) => BOOKINGS.filter((b) => b.id === params?.id),
    command: async () => ({ rows: [{ id: 'line-1' }] }),
  });
}

interface MountedPos extends HTMLElement {
  cart: { id: string; name: string; price: number; qty?: number; is_service?: boolean;
    tax_category_key?: string }[];
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  updateComplete: Promise<unknown>;
}

/** Lets the boot, the serial cart queue and the repaint all land. */
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

/**
 * Exactly what `appointments::goToTill()` does — nothing more. The agenda has no router: pushing
 * the URL and knocking with `popstate` is its only channel to the shell, and ADR-0077 forbids it
 * from building the sale itself.
 */
async function tapCharge(el: MountedPos, appointmentId: string): Promise<void> {
  window.history.pushState({}, '', `/m/sales/pos?appointment_id=${encodeURIComponent(appointmentId)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await settle(el);
}

beforeEach(() => { document.body.innerHTML = ''; installSdk(); });

describe('the till the cashier already had open (appointments#154)', () => {
  it('seeds the booking that arrives while it is on screen', async () => {
    const el = await mount(); // the cashier opened the till earlier in the shift

    await tapCharge(el, 'ap-ana');

    expect(el.cart).toHaveLength(1);
    expect(el.cart[0]).toMatchObject({
      name: 'Corte de caballero', price: 1700, is_service: true,
      tax_category_key: 'service.generic',
    });
  });

  it('brings the customer and the professional with it, not just the line', async () => {
    const el = await mount();

    await tapCharge(el, 'ap-ana');

    expect(el.customerId).toBe('c-ana');
    expect(el.customerName).toBe('Ana Torres');
    expect(el.staffId).toBe('st-lucia');
    expect(el.staffName).toBe('Lucía Pérez');
  });

  it('serves EVERY booking of the shift, not only the first', async () => {
    const el = await mount();

    await tapCharge(el, 'ap-ana');
    await tapCharge(el, 'ap-eva');

    expect(el.cart.map((l) => l.name)).toEqual(['Corte de caballero', 'Color']);
  });

  it('clears the id from the URL each time, so a reload never re-seeds', async () => {
    const el = await mount();

    await tapCharge(el, 'ap-ana');

    expect(window.location.search).not.toContain('appointment_id');
  });

  it('does not put the same booking on the check twice', async () => {
    const el = await mount();

    await tapCharge(el, 'ap-ana');
    await tapCharge(el, 'ap-ana');

    expect(el.cart).toHaveLength(1);
    expect(el.cart[0].qty ?? 1).toBe(1);
  });

  it('leaves the open check alone on a navigation that names no booking', async () => {
    const el = await mount();
    await tapCharge(el, 'ap-ana');

    window.history.pushState({}, '', '/m/sales/pos');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await settle(el);

    expect(el.cart).toHaveLength(1);
    expect(double.reads.filter((r) => r.name === 'appointments.appointments.get')).toHaveLength(1);
  });

  it('waits for the catalogue when the booking lands mid-boot, so the VAT still resolves', async () => {
    // The appointment carries `service_price` but NOT the tax category, so the VAT hangs off the
    // services catalogue. Serving the link before the boot brought that catalogue in would put a
    // line on the ticket with no fiscal category at all — priced, but unpriceable.
    window.history.replaceState({}, '', '/m/sales/pos');
    await import('./erp-pos-touch');
    const el = document.createElement('erp-pos-touch') as MountedPos;
    document.body.appendChild(el); // boot starts here and is still in flight

    window.history.pushState({}, '', '/m/sales/pos?appointment_id=ap-ana');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await settle(el);

    expect(el.cart).toHaveLength(1);
    expect(el.cart[0].tax_category_key).toBe('service.generic');
  });

  it('serves nothing once the till leaves the DOM', async () => {
    const el = await mount();
    el.remove();
    await settle(el);
    const before = double.reads.filter((r) => r.name === 'appointments.appointments.get').length;

    window.history.pushState({}, '', '/m/sales/pos?appointment_id=ap-ana');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 0));

    expect(double.reads.filter((r) => r.name === 'appointments.appointments.get'))
      .toHaveLength(before);
  });

  it('leaves no popstate listener behind on window', async () => {
    // Not the same property as the one above, and the difference is what hub#1099 cost: a till
    // that answers nothing because it is disconnected STILL keeps its listener on `window` if
    // nobody unregisters it. Eight navigations, eight dead listeners, one `popstate` waking them
    // all. The count has to come back to where it started.
    const live = new Set<EventListenerOrEventListenerObject>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
      if (type === 'popstate') live.add(fn);
      return add(type as keyof WindowEventMap, fn as EventListener, o as AddEventListenerOptions);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
      if (type === 'popstate') live.delete(fn);
      return remove(type as keyof WindowEventMap, fn as EventListener, o as EventListenerOptions);
    }) as typeof window.removeEventListener;

    try {
      const el = await mount();
      expect(live.size).toBe(1); // the till is listening while it is on screen

      el.remove();
      await settle(el);

      expect(live.size).toBe(0);
    } finally {
      window.addEventListener = add as typeof window.addEventListener;
      window.removeEventListener = remove as typeof window.removeEventListener;
    }
  });
});

// The control. If the double, the catalogue or the seeding itself were broken, EVERY test above
// would fail for a reason that has nothing to do with the delivery — so this one proves the
// positive is detectable: with the id already in the URL at mount time, the check is armed.
describe('control — the door that already worked', () => {
  it('seeds when the link is in the URL at mount time', async () => {
    const el = await mount('?appointment_id=ap-ana');

    expect(el.cart).toHaveLength(1);
    expect(el.cart[0]).toMatchObject({ name: 'Corte de caballero', price: 1700 });
  });
});

// The reverse of the same bug. Reading the link on every navigation means the till has to say NO
// to the booking it already put on the check — otherwise «Cobrar» twice writes the haircut twice.
// But that «no» is only true WHILE that check is open: the moment the check is released —parked
// because the client wants a shampoo too, or discarded because it was a mistake— the booking has
// nowhere to be, and charging it again has to arm the till exactly like the first time. Keyed to
// the component instead of to the check, the guard brought the blank till of appointments#154
// straight back, on the busiest path a salon has.
describe('a booking belongs to ITS check, not to the screen (appointments#154)', () => {
  it('arms the till again for a booking whose check was parked', async () => {
    const el = await mount();
    await tapCharge(el, 'ap-ana');
    expect(el.cart).toHaveLength(1);

    await (el as unknown as { park(): Promise<void> }).park();
    await settle(el);
    expect(el.cart).toHaveLength(0);

    await tapCharge(el, 'ap-ana');

    expect(el.cart.map((l) => l.name)).toEqual(['Corte de caballero']);
  });

  it('arms the till again for a booking whose check was discarded', async () => {
    const el = await mount();
    await tapCharge(el, 'ap-ana');

    await (el as unknown as { discardCurrent(): Promise<void> }).discardCurrent();
    await settle(el);

    await tapCharge(el, 'ap-ana');

    expect(el.cart.map((l) => l.name)).toEqual(['Corte de caballero']);
  });

  it('does not carry the released booking into the NEXT check', async () => {
    // `appointmentId` is what travels to `complete_sale` and marks the booking as charged. Left
    // over from a check that never became a sale, the next customer's ticket would close Ana's
    // booking for her — paid by somebody else.
    const el = await mount();
    await tapCharge(el, 'ap-ana');

    await (el as unknown as { park(): Promise<void> }).park();
    await settle(el);

    expect((el as unknown as { appointmentId?: string }).appointmentId).toBeUndefined();
  });
});
