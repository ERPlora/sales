// sales#89 — charging a booked appointment, without re-typing it.
//
// ADR-0077 decided this shape and then left it as a documented SEAM: the till arms the items by
// reading the appointment through its PUBLIC query (`appointments.appointments.get`), and sends
// `appointment_id` + `staff_id` to `complete_sale`, which emits `sales.sale.created_from_appointment`
// so `appointments` can mark the booking converted in its OWN listener. Everything on the server
// was built. Nobody ever filled the two ids in, so the trace never closed.
//
// Two things are load-bearing here:
//
//  * `sales` must NOT learn about appointments. It reads one public query and forwards two OPAQUE
//    ids — no `depends_on`, no JOIN, no knowledge of what a booking is. A hub without the module
//    just opens an empty till.
//  * The appointment carries `service_price` but NOT the tax category, so the VAT would hang. The
//    till resolves it from the services catalogue it already loads for walk-ins — one source of
//    fiscal truth for both doors.
import { beforeEach, describe, expect, it } from 'vitest';

const APPOINTMENT = {
  id: 'ap-1', customer_id: 'c-ana', customer_name: 'Ana Ruiz',
  staff_id: 'st-lucia', staff_name: 'Lucía',
  service_id: 's-corte', service_name: 'Corte de señora', service_price: 1800,
};

const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];

const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

let commands: { name: string; params?: Record<string, unknown> }[] = [];

function installSdk(opts: { appointmentsInstalled?: boolean } = {}) {
  const hasAppointments = opts.appointmentsInstalled !== false;
  commands = [];
  (globalThis as Record<string, unknown>).erplora = {
    // Filas planas, como las entrega el SDK real: el documento que se pinta tras cobrar mapea
    // `sales.lines` directamente, y un `{rows: []}` aquí le estallaba en un rechazo suelto.
    query: async (name: string) => {
      if (name === 'sales.by_idempotency_key') return [{ id: 'sale-1' }];
      if (name === 'sales.get') return [{ id: 'sale-1', created_at: '2026-08-14T10:00:00Z' }];
      return [];
    },
    queryAll: async (name: string) => (name === 'taxes.rules.list' ? RULES : []),
    queryAllOptional: async (name: string) => {
      // sales#186 — the till reads its catalogue whole; `appointments.appointments.get` is a POINT
      // read and stays on `queryOptional`.
      if (name === 'services.services.list') return SERVICES;
      if (name === 'services.categories.list') return [];
      return undefined;
    },
    queryOptional: async (name: string) => {
      if (name === 'services.services.list') return SERVICES;
      if (name === 'services.categories.list') return [];
      if (name === 'appointments.appointments.get') {
        return hasAppointments ? { rows: [APPOINTMENT] } : undefined;
      }
      return undefined;
    },
    command: async (name: string, params?: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: 'line-1' }] };
    },
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => {},
  };
}

interface MountedPos {
  shadowRoot: ShadowRoot;
  cart: { id: string; name: string; price: number; is_service?: boolean;
    tax_category_key?: string }[];
  updateComplete: Promise<unknown>;
  confirm(print?: boolean): Promise<void>;
}

/** Mounts the till as the shell would after a deep link carrying `search`. */
async function mount(search = ''): Promise<MountedPos> {
  window.history.replaceState({}, '', `/m/sales/pos${search}`);
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as MountedPos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as MountedPos).updateComplete;
  return el as unknown as MountedPos;
}

beforeEach(() => { document.body.innerHTML = ''; installSdk(); });

describe('the till opened from an appointment (ADR-0077)', () => {
  it('seeds the cart with the booked service, so nothing is re-typed', async () => {
    const el = await mount('?appointment_id=ap-1');

    expect(el.cart).toHaveLength(1);
    expect(el.cart[0]).toMatchObject({
      name: 'Corte de señora', price: 1800, is_service: true,
    });
  });

  it('resolves the VAT category from the services catalogue: the appointment has none', async () => {
    const el = await mount('?appointment_id=ap-1');
    expect(el.cart[0].tax_category_key).toBe('service.generic');
  });

  it('sends appointment_id and staff_id at checkout, which is what closes the trace', async () => {
    const el = await mount('?appointment_id=ap-1');
    await el.confirm();

    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.params?.appointment_id).toBe('ap-1');
    expect(sale?.params?.staff_id).toBe('st-lucia');
  });

  it('clears the id from the URL, so a reload does not re-seed the same booking', async () => {
    await mount('?appointment_id=ap-1');
    expect(window.location.search).not.toContain('appointment_id');
  });
});

describe('an ordinary sale is untouched', () => {
  it('sends appointment_id and staff_id as null when nothing was booked', async () => {
    const el = await mount();
    el.cart = [{ id: 'p-x', name: 'Champú', price: 900 }] as MountedPos['cart'];
    await el.confirm();

    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.params?.appointment_id).toBeNull();
    expect(sale?.params?.staff_id).toBeNull();
  });
});

describe('a hub without the appointments module', () => {
  beforeEach(() => installSdk({ appointmentsInstalled: false }));

  it('opens an empty till instead of failing: the read is optional (ADR-0127)', async () => {
    const el = await mount('?appointment_id=ap-1');
    expect(el.cart).toHaveLength(0);
    expect(el.shadowRoot.querySelector('.error-banner')).toBeNull();
  });
});
