// **Printing the bill before charging** — the contract of the paper the waiter carries (sales#78).
//
// The bill is the paper a restaurant prints most often: once per table, before every payment. It
// was reaching no printer at all, and the till said nothing — the request named a document type the
// hub does not know, carried no `jobId` (so the hub's queue is skipped by contract), carried the
// SCREEN's document instead of the printer's, and the result was thrown away with `void`.
//
// So what is pinned here is the request itself, and that a failure reaches the person holding the
// order pad.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Registering the POS costs seconds (it is a big component and vitest transforms it on demand).
// Doing it here instead of inside the first test keeps that cost out of the test's own budget.
beforeAll(async () => {
  await import('./erp-pos-touch');
}, 60_000);

interface PrintRequest {
  role?: string;
  documentType?: string;
  jobId?: string;
  data?: Record<string, unknown>;
  html?: string;
}
interface Notice {
  type?: string;
  message?: string;
}

let printed: PrintRequest[];
let notices: Notice[];
/** What the shell's print gate answers. `bridge` = it came out of a printer. */
let printResult: { via: string; error?: string };

beforeEach(() => {
  printed = [];
  notices = [];
  printResult = { via: 'bridge', role: 'receipt' } as { via: string };
  document.body.innerHTML = '';
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async () => [],
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: (n: Notice) => notices.push(n),
    // The global print gate of the shell (`apps/web/src/lib/print.ts`).
    print: async (req: PrintRequest) => {
      printed.push(req);
      return printResult;
    },
  };
});

const CART = [
  { line_id: 'l1', name: 'Café solo', price: 120, qty: 2 },
  { line_id: 'l2', name: 'Caña', price: 250, qty: 1 },
];

/** Mounts the POS with an open table order, and prints its bill. */
async function printBill(cart: unknown[] = CART) {
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  const pos = el as unknown as Record<string, unknown>;
  pos.cart = cart;
  pos.orderId = 'order-1';
  pos.tableLabel = 'Mesa 4';
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

  // Through the UI: the print button of the BILL modal (the one holding `#prebill-doc`), not the
  // sale document modal, which is a different paper.
  const modal = [...el.shadowRoot!.querySelectorAll('ion-modal.doc-modal')]
    .find((m) => m.querySelector('#prebill-doc'))!;
  expect(modal, 'the bill modal is rendered').toBeTruthy();
  const print = modal.querySelector<HTMLElement>('ion-button[aria-label="ui.print"]')!;
  expect(print, 'the bill has a print button').toBeTruthy();
  print.click();
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

describe('printing the bill before charging', () => {
  it('asks for `prebill` on the receipt printer — the document the hub knows', async () => {
    await printBill();

    expect(printed, 'exactly one print request').toHaveLength(1);
    expect(printed[0].role, 'the bill comes out where the tickets come out').toBe('receipt');
    // `receipt` would be a lie (a bill is not a fiscal ticket) and anything the hub does not know
    // is refused at both the queue and the printer.
    expect(printed[0].documentType).toBe('prebill');
  });

  it('carries a `jobId`: without one the hub queue is skipped by contract', async () => {
    await printBill();
    expect(printed[0].jobId, 'no jobId → sdk.print never even tries to queue').toBeTruthy();
    expect(printed[0].jobId).toMatch(/^prebill-order-1-/);
  });

  it('a second round is a NEW job, not a duplicate the queue swallows', async () => {
    await printBill();
    await printBill([...CART, { line_id: 'l3', name: 'Postre', price: 450, qty: 1 }]);

    expect(printed[1].jobId).not.toBe(printed[0].jobId);
  });

  it('sends the PRINTER document, not the one the screen paints', async () => {
    await printBill();
    const doc = printed[0].data!;

    // The renderer reads by key: handed `{business:{…}, lines:[…]}` it finds nothing, renders its
    // defaults and prints «ERPlora», no lines, TOTAL 0.00 — paper that looks printed and is blank.
    expect(doc.items, '`items`, the key the ESC/POS renderer reads').toBeTruthy();
    expect(doc.lines, 'not `lines`, which is the screen shape').toBeUndefined();
    expect(doc.business_name, '`business_name`, not `business.name`').toBeTruthy();
    expect(doc.total, '2×1,20 + 2,50, in euros').toBe(4.9);
    expect(doc.customer_name, 'the table, so the waiter knows whose bill this is').toBe('Mesa 4');
    expect(doc.notice, 'it must say on paper that it is not an invoice').toBeTruthy();
    expect(doc.receipt_id, 'the fiscal series is consumed when charging, not now').toBeUndefined();
  });

  it('still sends the plain HTML, which is what a browser with no printer prints', async () => {
    await printBill();
    expect(printed[0].html, 'the browser fallback needs its own document').toContain('Café solo');
  });

  it('TELLS the waiter when the bill did not reach a printer', async () => {
    // In the installed app the browser fallback prints nothing at all, so «it went to the browser»
    // is a failure the person holding the order pad has to hear about — not a `void`.
    printResult = { via: 'browser', error: 'sin impresora con rol receipt' };
    await printBill();

    expect(notices, 'the waiter is told').toHaveLength(1);
    expect(notices[0].type).toBe('error');
    expect(notices[0].message, 'and told why').toContain('sin impresora con rol receipt');
  });

  it('says nothing when the paper came out', async () => {
    printResult = { via: 'bridge' };
    await printBill();
    expect(notices, 'no toast for a bill that printed').toHaveLength(0);
  });

  it('a queued bill is a success too: it prints late, it is not lost', async () => {
    printResult = { via: 'queue' };
    await printBill();
    expect(notices).toHaveLength(0);
  });
});
