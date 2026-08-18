// sales#21 — the checkout must never close a sale with the browser's VAT because the tax
// catalogue did not arrive.
//
// Until hub#701 the runtime silently dropped a `read` that failed, so the handler could not tell
// «this hub has no rules» from «taxes is down». Since hub#701 a read can be declared `required`
// and the command ABORTS when it does not resolve. This test pins that `sales.complete_sale`
// actually opts in — a plain string read is graceful by design and would reopen the hole.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';

type ReadDef = string | { query: string; params?: Record<string, string>; required?: boolean };
type Manifest = { commands: Record<string, { reads?: ReadDef[] }> };
const m = manifest as unknown as Manifest;

describe('sales.complete_sale declares the tax catalogue as a REQUIRED read (sales#21, hub#701)', () => {
  it('reads taxes.rules.list in the object form with required: true', () => {
    const reads = m.commands['sales.complete_sale'].reads ?? [];
    const tax = reads.find((r) => (typeof r === 'string' ? r : r.query) === 'taxes.rules.list');
    expect(tax, 'the checkout must pre-load the tax catalogue').toBeTruthy();
    expect(typeof tax, 'the string form can never be required').toBe('object');
    expect((tax as { required?: boolean }).required).toBe(true);
  });
});

// sales#80 — the double tap on «Send to kitchen». The handler can only refuse a round with nothing
// pending if it SEES the order's lines before the SQL runs: that is this read, filtered by the
// order the payload names. Without it the second tap re-emits `order.fired` and kitchen opens a
// second round with the same food.
describe('sales.order.fire pre-loads the order lines (sales#80)', () => {
  it('reads sales.order.lines filtered by payload.order_id', () => {
    const reads = m.commands['sales.order.fire'].reads ?? [];
    const lines = reads.find((r) => typeof r === 'object' && r.query === 'sales.order.lines') as
      { query: string; params?: Record<string, string> } | undefined;
    expect(lines, 'the fire must see the order lines').toBeTruthy();
    expect(lines!.params?.order_id).toBe('payload.order_id');
  });
});
