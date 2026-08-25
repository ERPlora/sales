// A line is only added to an order of the SAME hub (pm#146).
//
// Here a crossed row is **money on the wrong ticket**: `order_add_line.sql` bound `:order_id`
// straight from the payload, so a line could hang off another business's order. And the command's
// second statement recomputed THAT order's total, so the neighbour's amount moved too.
//
// The command faces the client (`permission: sales.add_sale` / `sales.sell_open_price`), it is not
// an internal one called by a handler that already validated: the `order_id` comes from whoever
// taps on the till.
//
// 🔴 sales#175 MOVED WHERE THE LOCK LIVES, not whether it exists. The command stopped being
// declarative SQL when the checkout started honouring the row's `unit_price`: a column that decides
// money is resolved against the catalogue in the handler, never bound from the payload. With that
// went `expect_rows`, which only applies to the declarative path. Both halves of the recipe
// (services#7) are still here, in their new place:
//
//   1. the order is resolved against the `:hub_id` the **runtime injects** — now in the
//      `sales.order.get` read, declared `required` and parameterised with `payload.order_id`;
//   2. and if it does not match, it **fails**: the handler refuses with `sales.order_unavailable`,
//      the SAME domain code `expect_rows` produced and the one the UI already translates. Without
//      it the command would answer OK having written zero lines — and on a till that is worse than
//      an error: the waiter sees it "was added" and charges without it. That refusal is proven by
//      the handler (`adding_a_line_to_an_order_that_does_not_exist_is_refused_with_its_code`,
//      handler/src/lib.rs); what this test guards is that the lock STAYS DECLARED in the manifest,
//      which is what a refactor takes away without noticing.
//
// ⚠️ What this test does NOT cover: `product_id` points at `inventory`, another module. The handler
// DOES check it now (it reads `inventory.products.for_sale` to freeze the price, sales#175), but
// that is handler arithmetic and it is proven there.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

type Read = string | { query: string; params?: Record<string, string>; required?: boolean };

const manifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')) as {
  id: string;
  commands: Record<string, { reads?: Read[]; handler?: { function?: string }; sql?: string[] }>;
  queries: Record<string, { sql: string }>;
};

const fileOf = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

/** The read that resolves the order, with its full shape. */
const orderRead = (name: string) => {
  const reads = manifest.commands[name].reads ?? [];
  return reads.find(
    (r): r is Exclude<Read, string> => typeof r !== 'string' && r.query === 'sales.order.get',
  );
};

// Both doors share one handler (`add_order_line`), so the lock covers them both — but `reads` are
// PER command and have to be declared on each.
const COMMANDS = ['sales.order.add_line', 'sales.order.add_open_line'] as const;

describe('a line is only added to an order of the same hub (pm#146)', () => {
  it.each(COMMANDS)('%s resolves the order against the injected hub', (name) => {
    const read = orderRead(name);

    expect(read, `${name} no longer reads the order: it would take any order_id`).toBeTruthy();
    expect(read!.params?.order_id, 'the read has to go by the payload order_id').toBe(
      'payload.order_id',
    );

    const sql = fileOf(manifest.queries['sales.order.get'].sql);
    expect(sql, 'the order has to belong to THIS hub').toMatch(/hub_id\s*=\s*:hub_id/);
    expect(sql, 'and be alive: a deleted order takes no lines').toMatch(/is_deleted\s*=\s*0/);
  });

  it.each(COMMANDS)('%s fails instead of writing nothing and saying it worked', (name) => {
    const read = orderRead(name);

    // `required: true` is what makes a read that does not resolve ABORT the command in the runtime
    // instead of handing `None` over and letting the handler decide blind (hub#701).
    expect(read!.required, 'without `required` the read may be missing and the handler guesses').toBe(
      true,
    );
    // And the door is the handler, not loose SQL: if someone put it back into `sql[]`, the
    // payload's `:unit_price` would decide money again (sales#175).
    expect(manifest.commands[name].sql, 'back to declarative SQL: the payload would set the price').toBeUndefined();
    expect(manifest.commands[name].handler?.function).toBe('add_order_line');
  });
});
