// sales#20 — the checkout is SERVER-authoritative: the browser proposes, the server disposes.
//
// This file pins the DECLARATIVE half of that rule, the half a hub enforces before a single line
// of the handler runs: the JSON Schema the runtime validates the payload against, and the trusted
// reads the runtime pre-loads for the handler. Both live in the manifest, so both are testable
// here — and both were the hole: the schema said `additionalProperties: true`, did not require a
// single line, put no ceiling on a discount, and let the caller choose the `status` of the sale.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';
import schema from '../../schemas/complete_sale.json';

type JsonSchema = {
  type: string;
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, JsonSchema & { minItems?: number; minimum?: number; maximum?: number; items?: JsonSchema }>;
};
type Read = string | { query: string; params?: Record<string, string> };
type Manifest = {
  commands: Record<string, { permission: string; reads?: Read[]; schema?: string }>;
  queries: Record<string, { permission: string; sql: string }>;
  migrations: { postgres: string[] };
};

const m = manifest as unknown as Manifest;
const s = schema as unknown as JsonSchema;
const cmd = m.commands['sales.complete_sale'];
const item = s.properties.items.items as JsonSchema;

describe('complete_sale payload contract (sales#20)', () => {
  it('rejects unknown fields — the payload is a closed contract, top level and per line', () => {
    expect(s.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
  });

  it('does NOT accept a status from the caller — the server stamps it', () => {
    expect(s.properties.status).toBeUndefined();
  });

  it('demands at least one line', () => {
    expect(s.properties.items.minItems).toBe(1);
  });

  it('bounds every rate to 0..100', () => {
    for (const rate of [item.properties.discount, item.properties.tax_rate, s.properties.discount_percent]) {
      expect(rate.minimum).toBe(0);
      expect(rate.maximum).toBe(100);
    }
  });

  it('bounds money and quantity below — no negative price, cost or tender', () => {
    expect(item.properties.price.minimum).toBe(0);
    expect(item.properties.cost.minimum).toBe(0);
    expect(s.properties.amount_tendered.minimum).toBe(0);
    expect(item.properties.quantity.minimum).toBe(1);
  });

  it('requires an idempotency key on every checkout', () => {
    expect(s.required).toContain('idempotency_key');
    expect(s.required).toContain('items');
    expect(s.properties.idempotency_key.type).toBe('string');
  });

  it('still accepts the fields the POS really sends (split bill, order link, fiscal snapshot)', () => {
    // `additionalProperties: false` is only safe if the closed list covers today's callers:
    // a forgotten key here is a POS that cannot charge at all.
    for (const key of [
      'items', 'line_ids', 'keep_order_open', 'tax_included', 'discount_percent',
      'payment_method_id', 'payment_method_name', 'amount_tendered', 'channel', 'source_module',
      'order_id', 'order_number', 'customer_id', 'customer_name', 'customer_tax_id',
      'customer_address', 'staff_id', 'staff_name', 'appointment_id', 'notes', 'document_type',
      'idempotency_key',
    ]) {
      expect(s.properties[key], `missing property ${key}`).toBeDefined();
    }
    for (const key of [
      'product_id', 'product_name', 'product_sku', 'price', 'quantity', 'discount', 'cost',
      'tax_category_key', 'tax_rate', 'tax_class_name', 'is_gift', 'gift_reason', 'is_service',
      'category_id', 'unit_code', 'unit_name', 'factor_num', 'factor_den', 'increment_value',
      'price_quantity_value', 'pricing_unit_code', 'pricing_unit_name', 'pricing_factor_num',
      'pricing_factor_den',
    ]) {
      expect(item.properties[key], `missing item property ${key}`).toBeDefined();
    }
  });
});

describe('trusted reads the runtime pre-loads for the handler (ADR-0069, sales#20)', () => {
  const names = (cmd.reads ?? []).map((r) => (typeof r === 'string' ? r : r.query));

  it('keeps the tax catalog (ADR-0085) and adds the sale-authority catalogs', () => {
    expect(names).toContain('taxes.rules.list');
    expect(names).toContain('sales.payment_methods');
    expect(names).toContain('sales.settings.get');
  });

  it('probes the idempotency key against the sales ledger, filtered by the payload key', () => {
    const probe = (cmd.reads ?? []).find(
      (r) => typeof r !== 'string' && r.query === 'sales.by_idempotency_key',
    ) as { query: string; params: Record<string, string> } | undefined;
    expect(probe).toBeDefined();
    expect(probe!.params.idempotency_key).toBe('payload.idempotency_key');
  });

  it('declares the probe query itself, gated by view_sale', () => {
    expect(m.queries['sales.by_idempotency_key'].permission).toBe('sales.view_sale');
    expect(m.queries['sales.by_idempotency_key'].sql).toBe('queries/by_idempotency_key.sql');
  });

  it('ships the migration that makes the key unique per hub', () => {
    expect(m.migrations.postgres).toContain('migrations/postgres/017_idempotency_key.sql');
  });
});

// sales#127 — the money/quantity ENCODING must be readable from the schema ALONE. An API client
// integrating against `sales.complete_sale` gets the per-field docs (that is what generated
// references and error hints surface); the encoding only lived in the payload-level description,
// so `quantity: 2` and `price: 2.2` looked sane and silently meant 0.000002 units at 2 cents.
// Fixed point and minor units are CONTRACT, not folklore: each field that carries them documents
// them (and carries an example) where the field is declared.
describe('complete_sale documents its encodings per field (sales#127)', () => {
  type Field = JsonSchema & { description?: string; examples?: unknown[] };
  const fields: Record<string, Field> = item.properties as Record<string, Field>;
  const top: Record<string, Field> = s.properties as Record<string, Field>;

  it('quantity declares the fixed-point 10⁶ scale, with an example', () => {
    const d = fields.quantity.description ?? '';
    expect(d, 'a description on the field itself').toContain('10⁶');
    expect(d, 'says it is integer fixed point, never a float').toMatch(/punto fijo|fixed/i);
    expect(fields.quantity.examples?.length, 'at least one worked example').toBeGreaterThan(0);
  });

  it('price declares minor units (cents) and what the price is FOR, with an example', () => {
    const d = fields.price.description ?? '';
    expect(d, 'minor units').toMatch(/céntimos|cents/i);
    expect(d, 'the unit the price refers to (pricing unit context)').toMatch(/price_quantity|unidad/i);
    expect(fields.price.examples?.length).toBeGreaterThan(0);
  });

  it('the other money fields say they are cents too (cost, amount_tendered, discount_amount)', () => {
    for (const name of ['cost'] as const) {
      expect((fields[name].description ?? ''), `${name} declares minor units`).toMatch(/céntimos|cents/i);
    }
    expect((top.amount_tendered.description ?? ''), 'amount_tendered declares minor units').toMatch(/céntimos|cents/i);
    expect((top.discount_amount.description ?? ''), 'discount_amount already documented').toMatch(/céntimos|cents/i);
  });
});
