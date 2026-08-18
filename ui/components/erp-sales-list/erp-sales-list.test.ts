// The STATUS column of the sales list (hub#923, minor defect reported with saas#1460).
//
// The filter dropdown already offered translated labels ("Completada"/"Anulada"), but the CELL had
// no `format`, so every row printed the raw database value — `completed`, in English, on a Spanish
// UI. It is the same list the cashier is sent to when a charge is in doubt, so the one word that
// tells her "this was charged" cannot be jargon.
import { beforeEach, describe, expect, it } from 'vitest';

import esCatalog from '../../../locales/es.json';

interface Column {
  key: string;
  format?: (row: Record<string, unknown>) => unknown;
  options?: { value: string; label: string }[];
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async () => [],
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    // Devuelve la traducción REAL del catálogo español: lo que se mide es que la celda deje de
    // enseñar el valor crudo de la base de datos.
    t: (_catalog: unknown, key: string) =>
      key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog) ?? key,
    on: () => () => {},
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
  };
});

async function column(key: string): Promise<Column> {
  await import('./erp-sales-list');
  const el = document.createElement('erp-sales-list');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  const columns = (el as unknown as { columns: Column[] }).columns;
  return columns.find((c) => c.key === key)!;
}
const statusColumn = () => column('status');

describe('sales list — the status column speaks the user language (hub#923)', () => {
  it('renders `completed` translated, not the raw database value', async () => {
    const column = await statusColumn();
    expect(column.format, 'the status cell needs a formatter').toBeTypeOf('function');
    expect(column.format!({ status: 'completed' })).toBe('Completada');
  });

  it('renders `voided` translated too', async () => {
    const column = await statusColumn();
    expect(column.format!({ status: 'voided' })).toBe('Anulada');
  });

  it('an unknown status still shows something, never an empty cell', async () => {
    // A status this build does not know about (a newer module writing `refunded`) must degrade to
    // the raw value: an empty cell would hide the row's state entirely.
    const column = await statusColumn();
    expect(column.format!({ status: 'refunded' })).toBe('refunded');
  });
});

// sales#108 — same list, next column over: the seed stores «Cash»/«Card» (English canonical,
// ADR-0055) and the handler persists that name as data. The CELL translates it; a name the owner
// typed («BBVA TPV») shows as is.
describe('sales list — the payment column speaks the user language (sales#108)', () => {
  it('renders `Cash` as «Efectivo»', async () => {
    const col = await column('payment_method_name');
    expect(col.format!({ payment_method_name: 'Cash' })).toBe('Efectivo');
  });

  it('renders `Card` as «Tarjeta» and keeps a custom name verbatim', async () => {
    const col = await column('payment_method_name');
    expect(col.format!({ payment_method_name: 'Card' })).toBe('Tarjeta');
    expect(col.format!({ payment_method_name: 'BBVA TPV' })).toBe('BBVA TPV');
  });
});

// sales#26 — anular desde el historial: con PERMISO, con MOTIVO obligatorio y con resultado claro.
// Mercado (8 refs en la issue): el reverso se pide desde la venta original, gateado por un permiso
// propio, y el motivo se captura siempre. La lista solo ofrece la acción a quien la tiene; el
// servidor la revalida igual (`sales.void_sale`).
describe('sales list — the void action (sales#26)', () => {
  const sdk = () => (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
  const commands: { name: string; params?: Record<string, unknown> }[] = [];
  const notes: { type: string; message: string }[] = [];

  async function mountList(perms: string[]) {
    commands.length = 0; notes.length = 0;
    sdk().hasPermission = (p: string) => perms.includes(p) || perms.includes('*');
    sdk().command = async (name: string, params?: Record<string, unknown>) => { commands.push({ name, params }); return {}; };
    sdk().notify = (n: { type: string; message: string }) => { notes.push(n); };
    document.body.innerHTML = '';
    await import('./erp-sales-list');
    const el = document.createElement('erp-sales-list');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el as unknown as {
      documentActions: { id: string; disabled?: (r: Record<string, unknown>) => boolean }[];
      voidSale(saleId: string, reason: string): Promise<void>;
      updateComplete: Promise<unknown>;
    };
  }

  it('without sales.void_sale the action is not offered at all', async () => {
    const el = await mountList(['sales.view_sale']);
    expect(el.documentActions.map((a) => a.id)).not.toContain('void');
  });

  it('with the permission it is offered, and disabled on a sale that is not completed', async () => {
    const el = await mountList(['sales.void_sale']);
    const act = el.documentActions.find((a) => a.id === 'void');
    expect(act, 'the void action').toBeTruthy();
    expect(act!.disabled!({ status: 'voided' })).toBe(true);
    expect(act!.disabled!({ status: 'completed' })).toBe(false);
  });

  it('runs sales.void with the sale id and the reason, and confirms', async () => {
    const el = await mountList(['sales.void_sale']);
    await el.voidSale('sale-1', 'customer changed their mind');
    expect(commands.find((c) => c.name === 'sales.void')?.params).toEqual({ sale_id: 'sale-1', reason: 'customer changed their mind' });
    expect(notes.some((n) => n.type === 'success')).toBe(true);
  });

  it('a refusal is explained in the user words, by its code', async () => {
    const el = await mountList(['sales.void_sale']);
    sdk().command = async () => { throw new Error('command `sales.void` failed: sales.void_requires_credit_note: …'); };
    await el.voidSale('sale-1', 'x');
    const err = notes.find((n) => n.type === 'error');
    expect(err?.message).toBe('Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla');
  });
});
