// sales#398 — the manager's PIN dialog says HOW MUCH is being approved, not only what kind of action.
//
// Since hub#2180 the shell fills `commands["<cmd>"].approval_label` holes from the payload the PIN
// signs off: `{field}`, `{field, money}` (minor units, hub currency) or `{field, percent}` (0-100).
// When ANY hole cannot be filled, the shell drops the whole template and falls back to `label` — so
// a hole naming a field the till does not send is not an error on screen, it is a silent return to
// the figure-less sentence this issue exists to remove. That is why every hole is checked here
// against the payload the till REALLY sends (captured from the very functions that send it).
//
// sales#403 — `sales.complete_sale_over_limit` names its figure through a field of its own: at Charge
// the over-limit discount may come from the lines, not the ticket, so `discount_percent` can be 0
// while the PIN is asked, and `discount_amount` is left out when it is 0. The till sends
// `approval_discount_percent` (the biggest discount being approved) on that door only.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import { makeErploraDouble } from '../test/erplora-double';
import { addOpenPriceLine, updateOrderLineDiscount, type CartLine, type ErploraClientLike } from './pos-cart';

type Locale = { commands?: Record<string, { label?: string; approval_label?: string }> };

const HOLE = /\{\s*([a-z0-9_]+)\s*(?:,\s*([a-z]+)\s*)?\}/gi;

/** The holes of a template, as `[field, format]` pairs. */
function holes(template: string): Array<[string, string | undefined]> {
  return [...template.matchAll(HOLE)].map((m) => [m[1], m[2]]);
}

/** Mirror of the shell's renderer (hub `apps/web/src/lib/elevation-label.ts`) for a fixed locale:
 *  `''` when any hole cannot be filled, exactly like the shell. */
function render(template: string, payload: Record<string, unknown>, locale: string): string {
  let ok = true;
  const out = template.replace(HOLE, (whole, field: string, format?: string) => {
    const v = payload[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) { ok = false; return whole; }
    if (format === 'percent') return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(v / 100);
    if (format === 'money') return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(v / 100);
    ok = false;
    return whole;
  });
  return ok && !/[{}]/.test(out) ? out : '';
}

const approval = (locale: unknown, cmd: string) => (locale as Locale).commands?.[cmd]?.approval_label ?? '';
const label = (locale: unknown, cmd: string) => (locale as Locale).commands?.[cmd]?.label ?? '';

/** The till's client, through the module's one shared SDK double; `sent` records every command. */
function capturingClient(): { client: ErploraClientLike; sent: { name: string; payload: Record<string, unknown> }[] } {
  const double = makeErploraDouble({ command: () => ({ new_ids: ['line-1'] }) });
  return { client: double.sdk as unknown as ErploraClientLike, sent: double.commands };
}

const line: CartLine = { id: 'p1', name: 'Open price', price: 1250, qty: 1, line_id: 'line-1' } as CartLine;

async function lineDiscountPayload(): Promise<Record<string, unknown>> {
  const { client, sent } = capturingClient();
  await updateOrderLineDiscount(client, 'order-1', line, 90, true);
  expect(sent[0].name).toBe('sales.order.set_line_discount_over_limit');
  return sent[0].payload;
}

async function openPricePayload(): Promise<Record<string, unknown>> {
  const { client, sent } = capturingClient();
  await addOpenPriceLine(client, 'order-1', line);
  expect(sent[0].name).toBe('sales.order.add_open_line');
  return sent[0].payload;
}

/** The ticket door is called from the touch component; its payload literal is read from source. */
function ticketDiscountPayload(): Record<string, unknown> {
  const src = readFileSync(join(import.meta.dirname, '../components/erp-pos-touch/erp-pos-touch.ts'), 'utf8');
  const literal = /const payload = \{ order_id: this\.orderId, discount_percent: percent, discount_amount: amountCents \};/;
  expect(src).toMatch(literal);
  return { order_id: 'order-1', discount_percent: 15, discount_amount: 500 };
}

/** The checkout is charged from the touch component; the over-limit door carries the figure built
 *  by `approvalDiscountPercent` (pinned in `discount-cap.test.ts`), read here from source. */
function checkoutPayload(): Record<string, unknown> {
  const src = readFileSync(join(import.meta.dirname, '../components/erp-pos-touch/erp-pos-touch.ts'), 'utf8');
  expect(src).toMatch(/approval_discount_percent: approvalDiscountPercent\(/);
  return { items: [], idempotency_key: 'checkout-1', discount_percent: 0, approval_discount_percent: 50 };
}

const cases: Array<{ cmd: string; payload: () => Promise<Record<string, unknown>> | Record<string, unknown>; en: string; es: string }> = [
  {
    cmd: 'sales.order.set_line_discount_over_limit',
    payload: lineDiscountPayload,
    en: 'Apply a 90% discount to a line',
    es: 'Aplicar a una línea un descuento del 90 %',
  },
  {
    cmd: 'sales.order.set_discount_over_limit',
    payload: ticketDiscountPayload,
    en: 'Apply a ticket discount of 15% and €5.00',
    es: 'Aplicar al tique un descuento del 15 % y 5,00 €',
  },
  {
    cmd: 'sales.order.add_open_line',
    payload: openPricePayload,
    en: 'Sell an item at an open price of €12.50',
    es: 'Vender un artículo a precio libre de 12,50 €',
  },
  {
    cmd: 'sales.complete_sale_over_limit',
    payload: checkoutPayload,
    en: 'Charge a sale with a discount of up to 50%',
    es: 'Cobrar una venta con un descuento de hasta el 50 %',
  },
];

describe('manager approval dialog shows the figure being approved (sales#398)', () => {
  it.each(cases)('$cmd: every hole names a numeric field the till really sends', async ({ cmd, payload }) => {
    const sent = await payload();
    for (const locale of [en, es]) {
      const template = approval(locale, cmd);
      expect(template).not.toBe('');
      const hs = holes(template);
      expect(hs.length).toBeGreaterThan(0);
      for (const [field, format] of hs) {
        expect(['money', 'percent']).toContain(format);
        expect(typeof sent[field]).toBe('number');
      }
    }
  });

  it.each(cases)('$cmd: renders the figure in English and Spanish', async ({ cmd, payload, en: wantEn, es: wantEs }) => {
    const sent = { ...(await payload()) };
    if (cmd === 'sales.order.set_discount_over_limit') Object.assign(sent, { discount_percent: 15, discount_amount: 500 });
    expect(render(approval(en, cmd), sent, 'en-GB')).toBe(wantEn);
    expect(render(approval(es, cmd), sent, 'es-ES')).toBe(wantEs);
  });

  it.each(cases)('$cmd: the Spanish template is a translation, and the plain label stays as the fallback', ({ cmd }) => {
    expect(approval(es, cmd)).not.toBe(approval(en, cmd));
    expect(label(en, cmd)).not.toBe('');
    expect(label(es, cmd)).not.toBe('');
  });

  it('the checkout door names its own figure, never the ticket-only discount fields', () => {
    // `discount_percent` is 0 when the over-limit discount sits on a line: a hole on it would lie.
    for (const locale of [en, es]) {
      const fields = holes(approval(locale, 'sales.complete_sale_over_limit')).map(([f]) => f);
      expect(fields).toEqual(['approval_discount_percent']);
    }
  });
});
