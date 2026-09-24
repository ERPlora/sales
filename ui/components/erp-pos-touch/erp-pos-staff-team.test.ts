// sales#318 — the till can say WHICH PROFESSIONAL did the service, not only who signs in.
//
// sales#179 gave the check a «who is serving» chip and sales#277 let each line be moved to
// somebody else. Both offered one list: `hub.users.list`, the people who SIGN IN (ADR-0192). In a
// salon that list is the owner and little else — Ana, Laura and Lucía cut hair all day, the agenda
// books them, and none of them has a PIN. So the only way a line reached its professional was
// charging from the appointment, every walk-in went to the owner, and the per-professional close
// and the commissions had nothing to stand on.
//
// Fresha, Vagaro, Booksy and Mangomint all do the same thing: every service on the ticket carries
// the team member who did it, chosen ON the ticket. The team is the `staff` app's (the same records
// the agenda books), read as an OPTIONAL capability (ADR-0127): a bar with no `staff` app keeps the
// till it always had, and a `staff` app that breaks is said out loud instead of looking like a
// salon with no team.
//
// The id that travels is the professional's RECORD (`staff_member.id`) — the very id an appointment
// already sends (ADR-0077) — so a walk-in and a booked cut by the same person add up as one in the
// close. A record linked to a person who signs in (`user_id`, ADR-0192) is ONE row, not two: the
// close already unifies both ids (staff#46), and a picker that listed «Ana» and «Ana García» would
// be asking the receptionist to guess which one earns the commission.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

const OWNER = { id: 'u-owner', name: 'Dueña', role: 'admin', is_active: true };

/** The salon's team as `staff.members.list` answers it. `order` is the agenda's order, and it is
 *  deliberately NOT alphabetical so the test can tell «the agenda's order» from «sorted by name». */
const ANA = { id: 'st-ana', first_name: 'Ana', last_name: 'García', full_name: 'Ana García', user_id: null, status: 'active', order: 2 };
const LAURA = { id: 'st-laura', first_name: 'Laura', last_name: 'Martín', full_name: 'Laura Martín', user_id: null, status: 'active', order: 1 };
const LUCIA = { id: 'st-lucia', first_name: 'Lucía', last_name: 'Pérez', full_name: 'Lucía Pérez', user_id: null, status: 'active', order: 3 };

const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed', duration_minutes: 30,
    category_id: 'sc-pelo', tax_category_key: 'service.generic', status: 'active' },
];
const SERVICE_CATS = [{ id: 'sc-pelo', name: 'Cabello' }];
const TAX_CATS = [{ key: 'service.generic', name: 'Servicios', is_active: 1 }];
const RULES = [
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
/** Card only: the charge is not what is under test, and cash would ask for the amount tendered. */
const METHODS = [
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 10 },
];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let orderLines: Record<string, unknown>[] = [];
let pos: ReturnType<typeof installPosDouble>;

interface Spec {
  users?: unknown[];
  /** `undefined` = the hub has no `staff` app at all. */
  team?: unknown[];
  teamBroken?: boolean;
  /** The people who sign in cannot be read (the runtime code it rejects with). */
  usersFail?: string;
  /** Rows of a check that was ALREADY open when the till mounted. */
  resuming?: Record<string, unknown>[];
  /** The bookings of the agenda (`appointments.appointments.get`); `undefined` = no agenda app. */
  bookings?: Record<string, unknown>[];
}

function installSdk(spec: Spec = {}): void {
  commands = [];
  orderLines = [...(spec.resuming ?? [])];
  const persist = (item: Record<string, unknown>, id: string) => {
    orderLines.push({
      id, product_id: item.product_id, product_name: item.product_name,
      quantity: item.quantity, unit_price: item.price ?? item.unit_price,
      line_total: item.price ?? item.unit_price,
      tax_category_key: item.tax_category_key, is_service: item.is_service ? 1 : 0,
      staff_id: item.staff_id ?? null,
    });
  };
  pos = installPosDouble({
    paymentMethods: METHODS,
    orders: spec.resuming?.length ? [{ id: 'ord-1', status: 'open', label: 'Salón' }] : [],
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: [],
    rules: RULES,
    services: SERVICES,
    serviceCategories: SERVICE_CATS,
    taxCategories: TAX_CATS,
    users: spec.users ?? [OWNER],
    ...(spec.team !== undefined ? { team: spec.team } : {}),
    ...(spec.bookings ? { appointment: spec.bookings } : {}),
    ...(spec.teamBroken ? { brokenModules: ['staff'] } : {}),
    ...(spec.usersFail ? { failing: { 'hub.users.list': spec.usersFail } } : {}),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        (payload.items as Record<string, unknown>[]).forEach((i, n) => persist(i, `line-${n + 1}`));
        return { ok: true, new_ids: ['ord-1', 'line-1'] };
      }
      if (name === 'sales.order.add_line') {
        const id = `line-${orderLines.length + 1}`;
        persist(payload, id);
        return { ok: true, new_ids: [id] };
      }
      if (name === 'sales.order.set_line_staff') {
        const row = orderLines.find((l) => l.id === payload.line_id);
        if (row) row.staff_id = payload.staff_id ?? null;
        return { ok: true, new_ids: [] };
      }
      return { ok: true, new_ids: ['sale-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  cart: { id: string; line_id?: string; staff_id?: string }[];
  confirm(print?: boolean): Promise<void>;
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
  for (let i = 0; i < 3; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
  }
}

async function tap(el: Pos, name: string) {
  const tile = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

async function openChip(el: Pos): Promise<void> {
  el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-staff-chip"]')?.click();
  await settle(el);
}

const offered = (el: Pos) => [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-staff-option"]')]
  .map((o) => o.textContent?.trim() ?? '');

async function choose(el: Pos, name: string): Promise<void> {
  const opt = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-staff-option"]')]
    .find((o) => o.textContent?.trim() === name);
  if (!opt) throw new Error(`no staff option for "${name}" — offered: ${offered(el).join(', ')}`);
  opt.click();
  await settle(el);
}

const painted = (el: Pos) => [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-line-staff"]')]
  .map((n) => n.textContent?.trim() ?? '');

const has = (el: Pos, testid: string) => el.shadowRoot.querySelector(`[data-testid="${testid}"]`) !== null;

/** A check that was left open with one «Corte» already charged to `staffId`. */
const resumedCut = (staffId: string) => [{
  id: 'line-9', product_id: 's-corte', product_name: 'Corte de señora', quantity: 1_000_000,
  unit_price: 1800, line_total: 1800, tax_category_key: 'service.generic', is_service: 1, staff_id: staffId,
}];


beforeEach(() => { localStorage.clear(); installSdk(); });

describe('the till offers the salon team, not only who signs in (sales#318)', () => {
  it('lists the professionals the agenda books, in the agenda order, and then the people who sign in', async () => {
    installSdk({ team: [ANA, LAURA, LUCIA] });
    const el = await mount();
    await openChip(el);

    expect(offered(el)).toEqual(['Laura Martín', 'Ana García', 'Lucía Pérez', 'Dueña']);
  });

  it('charges the line and the sale to the chosen professional\'s record — the id an appointment sends', async () => {
    installSdk({ team: [ANA, LAURA, LUCIA] });
    const el = await mount();
    await openChip(el);
    await choose(el, 'Ana García');
    await tap(el, 'Corte de señora');
    await settle(el);

    const opened = commands.find((c) => c.name === 'sales.order.open');
    const line = (opened?.payload.items as Record<string, unknown>[] | undefined)?.[0];
    expect(line?.staff_id, 'the line is sealed with Ana\'s record').toBe('st-ana');
    expect(painted(el), 'and the cart says so').toEqual(['Ana García']);

    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.payload.staff_id, 'the sale is hers, not the owner\'s').toBe('st-ana');
  });

  // sales#316 — «Cobrar» on a booking. The agenda books a team RECORD, which is the id the picker
  // offers since sales#318: the till opened from the booking has to agree with it, or the
  // receptionist sees one professional on the line and another ticked in «Atiende».
  it('opened from a booking, the line, «Atiende» and the sale are the booked professional', async () => {
    installSdk({
      team: [ANA, LAURA, LUCIA],
      bookings: [{
        id: 'ap-1', customer_id: 'c-carmen', customer_name: 'Carmen Ortega',
        staff_id: 'st-lucia', staff_name: 'Lucía Pérez',
        service_id: 's-corte', service_name: 'Corte de señora', service_price: 1800,
      }],
    });
    window.history.replaceState({}, '', '/m/sales/pos?appointment_id=ap-1');
    const el = await mount();
    await settle(el);

    expect(painted(el), 'the cut is Lucía\'s on the ticket').toEqual(['Lucía Pérez']);
    await openChip(el);
    const current = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-staff-option"][data-current]')]
      .map((o) => o.textContent?.trim());
    expect(current, '«Atiende» ticks her team record').toEqual(['Lucía Pérez']);
    // Closed WITHOUT choosing: what the sale carries has to come from the booking, not from a tap.
    el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-staff-cancel"]')?.click();
    await settle(el);

    await el.confirm();
    const sale = commands.find((c) => c.name === 'sales.complete_sale');
    expect(sale?.payload.appointment_id, 'the agenda can mark the booking charged').toBe('ap-1');
    expect(sale?.payload.staff_id).toBe('st-lucia');
    expect(sale?.payload.customer_id).toBe('c-carmen');
    expect((sale?.payload.items as { staff_id?: string }[]).map((i) => i.staff_id)).toEqual(['st-lucia']);
  });

  it('moves a line already on the check to a professional of the team', async () => {
    installSdk({ team: [ANA, LAURA, LUCIA], resuming: resumedCut('u-owner') });
    localStorage.setItem('erplora.pos.currentCheck', 'ord-1');
    const el = await mount();
    await settle(el);

    el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-line-staff"]')?.click();
    await settle(el);
    await choose(el, 'Laura Martín');

    const moved = commands.find((c) => c.name === 'sales.order.set_line_staff');
    expect(moved?.payload.staff_id).toBe('st-laura');
    expect(painted(el)).toEqual(['Laura Martín']);
  });

  it('lists a professional who also signs in ONCE, as her record', async () => {
    installSdk({
      users: [OWNER, { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true }],
      team: [{ ...ANA, user_id: 'u-ana' }],
    });
    const el = await mount();
    await openChip(el);

    expect(offered(el)).toEqual(['Ana García', 'Dueña']);
    await choose(el, 'Ana García');
    await el.confirm();
    expect(commands.find((c) => c.name === 'sales.complete_sale')?.payload.staff_id).toBe('st-ana');
  });

  it('ticks the professional already serving the check, whichever of her two ids it carries', async () => {
    installSdk({
      users: [OWNER, { id: 'u-ana', name: 'Ana', role: 'employee', is_active: true }],
      team: [{ ...ANA, user_id: 'u-ana' }],
      resuming: resumedCut('u-ana'),
    });
    localStorage.setItem('erplora.pos.currentCheck', 'ord-1');
    const el = await mount();
    await settle(el);

    el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-line-staff"]')?.click();
    await settle(el);
    const current = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid="pos-staff-option"][data-current]')]
      .map((o) => o.textContent?.trim());
    expect(current).toEqual(['Ana García']);
  });

  it('does not offer a professional who left or is inactive, but still names the lines she rang', async () => {
    const gone = { id: 'st-marta', first_name: 'Marta', last_name: 'Gil', full_name: 'Marta Gil', user_id: null, status: 'terminated', order: 4 };
    const off = { id: 'st-sara', first_name: 'Sara', last_name: 'Ruiz', full_name: 'Sara Ruiz', user_id: null, status: 'inactive', order: 5 };
    installSdk({ team: [ANA, gone, off], resuming: resumedCut('st-marta') });
    localStorage.setItem('erplora.pos.currentCheck', 'ord-1');
    const el = await mount();
    await settle(el);

    expect(painted(el), 'yesterday\'s line keeps its professional\'s name').toEqual(['Marta Gil']);
    await openChip(el);
    expect(offered(el)).toEqual(['Ana García', 'Dueña']);
  });

  it('keeps offering, as herself, the person whose team record is no longer active', async () => {
    installSdk({
      users: [OWNER, { id: 'u-ana', name: 'Ana', role: 'manager', is_active: true }],
      team: [{ ...ANA, user_id: 'u-ana', status: 'inactive' }],
    });
    const el = await mount();
    await openChip(el);

    expect(offered(el)).toEqual(['Dueña', 'Ana']);
  });

  it('names a resumed line booked to a team professional, where the row only carries her record id', async () => {
    installSdk({ team: [ANA, LAURA, LUCIA], resuming: resumedCut('st-lucia') });
    localStorage.setItem('erplora.pos.currentCheck', 'ord-1');
    const el = await mount();
    await settle(el);

    expect(painted(el)).toEqual(['Lucía Pérez']);
  });

  it('asks for the team only when the picker opens, like the people', async () => {
    installSdk({ team: [ANA] });
    const el = await mount();
    const reads = () => pos.reads.map((r) => r.name);
    expect(reads()).not.toContain('staff.members.list');
    await openChip(el);
    expect(reads()).toContain('staff.members.list');
  });
});

describe('a hub without a working team', () => {
  it('without the staff app, the till offers who signs in and says nothing more — the bar it always was', async () => {
    const el = await mount();
    await openChip(el);

    expect(offered(el)).toEqual(['Dueña']);
    expect(has(el, 'pos-staff-team-error')).toBe(false);
    expect(has(el, 'pos-staff-error')).toBe(false);
  });

  it('says so when the team cannot be read, and still offers who signs in', async () => {
    installSdk({ teamBroken: true });
    const el = await mount();
    await openChip(el);

    expect(has(el, 'pos-staff-team-error'), 'a broken team is not a salon with no team').toBe(true);
    expect(offered(el)).toEqual(['Dueña']);
    expect(has(el, 'pos-staff-empty')).toBe(false);
  });

  it('asks for the team again the next time the picker opens, once it has come back', async () => {
    installSdk({ teamBroken: true });
    const el = await mount();
    await openChip(el);
    el.shadowRoot.querySelector<HTMLElement>('[data-testid="pos-staff-cancel"]')?.click();
    await settle(el);

    pos.setQuery('staff.members.list', [ANA]);
    await openChip(el);
    expect(offered(el)).toEqual(['Ana García', 'Dueña']);
    expect(has(el, 'pos-staff-team-error')).toBe(false);
  });

  it('still offers the team when the people who sign in cannot be read', async () => {
    installSdk({ team: [ANA], usersFail: 'permission_denied' });
    const el = await mount();
    await openChip(el);

    expect(has(el, 'pos-staff-error')).toBe(true);
    expect(offered(el)).toEqual(['Ana García']);
  });
});
