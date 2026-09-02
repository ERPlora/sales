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

// sales#247 — a void must SEE the refunds of the sale before it decides.
//
// This one is load-bearing in a way the others are not, and the reason is worth writing down: the
// handler reads the refunds with `read_rows(...).unwrap_or_default()`, so a read that is not
// declared does not fail — it arrives as an EMPTY list, which the handler reads as «this sale was
// never refunded» and lets the void through. Deleting this line from the manifest would therefore
// reopen sales#247 in silence, with every Rust test still green, because the handler's tests hand
// it the read directly. This is the only place that can catch it.
//
// `required` on purpose: it is the module's own query, so hub#701 aborts the command if it cannot
// be resolved instead of letting the handler decide on a catalogue it never got.
describe('sales.void pre-loads the refunds of the sale (sales#247)', () => {
  it('reads sales.refunds, required, filtered by payload.sale_id', () => {
    const reads = m.commands['sales.void'].reads ?? [];
    const refunds = reads.find((r) => (typeof r === 'string' ? r : r.query) === 'sales.refunds');
    expect(refunds, 'the void must see what already came back').toBeTruthy();
    expect(typeof refunds, 'the string form can never be required').toBe('object');
    const def = refunds as { params?: Record<string, string>; required?: boolean };
    expect(def.required, 'an unresolved read must abort, never void blindly').toBe(true);
    expect(def.params?.sale_id, 'filtered by the sale the payload names').toBe('payload.sale_id');
  });

  it('still pre-loads the sale itself — the refunds read ADDS a guard, it replaces none', () => {
    const reads = (m.commands['sales.void'].reads ?? []).map((r) => (typeof r === 'string' ? r : r.query));
    expect(reads).toContain('sales.get');
  });
});

// sales#25 — `inventory` is an OPTIONAL capability (ADR-0127), not a hard dependency.
//
// It used to be `depends_on: [{ id: "inventory", min_version: "1.2.20" }]`, which is a HARD
// contract: installing `sales` dragged the whole stock app in (ADR-0060) and the ADR-0128
// deactivation cascade tied them together. A restaurant or a salon that only sells services got a
// stock module they never wanted, and that is the complaint this issue was born from (sales#30).
//
// What replaces it: the till reads the catalogue OPTIONALLY, an absent `inventory` is a legitimate
// state (services + free price, ADR-0085) and the checkout still refuses to price a CATALOGUE line
// it cannot verify. `taxes` stays hard on purpose: with no tax rule no sale can close at all.
//
// ⚠️ What this MUST NOT lose is sales#111/hub#960: with an `inventory` older than 1.2.20 the query
// `inventory.products.for_sale` does not exist, the read resolves to nothing and every catalogue
// line is refused — a till that looks healthy and cannot charge. The install-time floor is gone
// with the hard dependency, so the guard moved INTO the till: it preflights that very query and
// paints the incident (`ui/components/erp-pos-touch/erp-pos-catalog-optional.test.ts`). The floor
// protected only the install; the preflight also catches a broken or denied catalogue.
describe('inventory is an OPTIONAL capability, taxes stays hard (sales#25)', () => {
  type WithDeps = { depends_on: (string | { id: string; min_version?: string })[] };
  const md = manifest as unknown as WithDeps;
  const ids = md.depends_on.map((d) => (typeof d === 'string' ? d : d.id));

  it('inventory is NOT in depends_on: a salon does not install a stock app to sell haircuts', () => {
    expect(ids).not.toContain('inventory');
  });

  it('taxes stays a hard dependency: with no tax rule no sale can close', () => {
    expect(md.depends_on).toContain('taxes');
  });

  it('every read of inventory is declared OPTIONAL, so the command is never aborted by its absence', () => {
    const inventoryReads = Object.entries(m.commands)
      .flatMap(([cmd, def]) => (def.reads ?? []).map((r) => [cmd, r] as const))
      .filter(([, r]) => (typeof r === 'string' ? r : r.query).startsWith('inventory.'));
    expect(inventoryReads.length, 'the checkout still reads the catalogue, it just does not require it').toBeGreaterThan(0);
    for (const [cmd, read] of inventoryReads) {
      expect(typeof read, `${cmd}: the string form cannot declare optionality`).toBe('object');
      expect((read as { required?: boolean }).required, `${cmd}: ${(read as { query: string }).query} must be optional`).toBe(false);
    }
  });

  it('the checkout reads inventory.products.for_sale — dropping the dependency does not drop the price authority', () => {
    for (const cmd of ['sales.complete_sale', 'sales.checkout.preview', 'sales.order.add_line']) {
      const reads = (m.commands[cmd].reads ?? []).map((r) => (typeof r === 'string' ? r : r.query));
      expect(reads, `${cmd} must price against the catalogue when it is there`).toContain('inventory.products.for_sale');
    }
  });
});
