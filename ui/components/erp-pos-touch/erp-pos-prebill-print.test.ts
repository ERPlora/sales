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
import { installPosDouble } from '../../test/pos-double';


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
let pos: ReturnType<typeof installPosDouble>;
/** What the shell's print gate answers. `bridge` = it came out of a printer. */
let printResult: { via: string; error?: string };

beforeEach(() => {
  printed = [];
  notices = [];
  printResult = { via: 'bridge', role: 'receipt' } as { via: string };
  document.body.innerHTML = '';
  pos = installPosDouble({
    notify: (n: Notice) => notices.push(n),
    // The global print gate of the shell (`apps/web/src/lib/print.ts`).
    extra: {
      print: async (req: PrintRequest) => {
        printed.push(req);
        return printResult;
      },
    },
  });
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

  // sales#28 — el carrito congela la unidad de la línea (ADR-0147 §2.4) y la cuenta que se lleva
  // a la mesa debe imprimirla: «1,5 kg», en el térmico y en el HTML de respaldo. Sin unidad, la
  // línea de toda la vida («2x Café»).
  it('prints the FROZEN unit of the line: «1,5 kg» on both papers (sales#28)', async () => {
    await printBill([
      ...CART,
      { line_id: 'l3', name: 'Tomate rosa', price: 1200, qty: 1.5, unit_code: 'kg', unit_name: 'Kilogramo' },
    ]);

    const items = printed[0].data!.items as { name: string; quantity: number | string }[];
    expect(items[0].quantity, 'sin unidad la cantidad es el número de siempre').toBe(2);
    expect(items[2].quantity, 'con unidad viaja compuesta para el «x» literal del renderer').toBe('1,5 kg ');
    expect(printed[0].html, 'el papel HTML dice la unidad junto a la cantidad').toContain('1,5 kg');
    expect(printed[0].html).not.toContain('1.5 ×', 'el punto inglés era el defecto');
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

// ── sales#148 · el suplemento llega a la CUENTA que se lleva a la mesa ────────────────────────
//
// La fila del pedido guarda solo los `option_id` (migración 023, a propósito: el nombre y el precio
// los pone el servidor al cobrar, nunca el navegador). Así que para imprimir la cuenta hay que
// RESOLVERLOS contra el catálogo vivo — `modifiers.options.all`, la misma lectura autoritativa que
// usa el cobro. Sin eso, retomar una mesa y pedir la cuenta imprimía una hamburguesa a secas.
describe('los suplementos en la cuenta previa (sales#148)', () => {
  const CATALOG = [
    { option_id: 'o-queso', group_id: 'g1', name: 'Extra queso', kitchen_name: 'QUESO', price_delta: 100 },
    { option_id: 'o-sin-cebolla', group_id: 'g1', name: 'Sin cebolla', kitchen_name: 'SIN CEB.', price_delta: 0 },
  ];

  /** El shell responde al catálogo de suplementos; a todo lo demás, nada. */
  function withCatalog(rows: unknown[] = CATALOG) {
    pos.setQuery('modifiers.options.all', rows);
  }

  const BURGER = [{
    line_id: 'l1', name: 'Hamburguesa', price: 1000, qty: 1,
    modifiers: [{ option_id: 'o-queso' }, { option_id: 'o-sin-cebolla' }],
  }];

  it('el papel térmico los nombra bajo su línea, en el orden elegido', async () => {
    withCatalog();
    await printBill(BURGER);
    const items = printed[0].data!.items as { name: string; notes?: string }[];
    expect(items[0].notes).toBe('Extra queso · Sin cebolla');
  });

  it('el HTML de respaldo también, sangrados y sin importe', async () => {
    withCatalog();
    await printBill(BURGER);
    expect(printed[0].html).toContain('Extra queso');
    expect(printed[0].html).toContain('Sin cebolla');
    expect(printed[0].html).toContain('class="mod"');
  });

  it('🔴 cambiar SOLO un suplemento produce OTRO jobId: la cola no se traga la cuenta corregida', async () => {
    withCatalog();
    await printBill(BURGER);
    await printBill([{ ...BURGER[0], modifiers: [{ option_id: 'o-sin-cebolla' }] }]);
    expect(printed[1].jobId, 'sin esto la cola dedupe en silencio y sale la cuenta VIEJA').not.toBe(printed[0].jobId);
  });

  it('sin el módulo `modifiers` instalado la cuenta sale igual, con el id por delante del silencio', async () => {
    pos.setAbsent('modifiers.options.all'); // the module is not in this hub
    await printBill(BURGER);
    const items = printed[0].data!.items as { name: string; notes?: string }[];
    expect(items[0].notes, 'un cobro invisible es peor que una línea fea').toBe('o-queso · o-sin-cebolla');
    expect(printed[0].data!.total, 'y la cuenta se imprime igual').toBe(10);
  });

  it('una cuenta SIN suplementos no pide el catálogo ni cambia de papel', async () => {
    withCatalog();
    await printBill();
    expect(pos.reads.map((r) => r.name), 'not one extra read on 99 % of the bills')
      .not.toContain('modifiers.options.all');
    const items = printed[0].data!.items as { notes?: string }[];
    expect(items[0].notes).toBeUndefined();
  });
});

// sales#154 / ADR-0381 — the MENU on the bill. The cart line of a menu carries `combo_id` and the
// chosen components (`combo_choices`, with the display name resolved when picked); the bill must
// print the menu as ONE line with the closed price and the components under it, on BOTH papers.
describe('the menu on the bill (sales#154)', () => {
  const MENU_LINE = {
    line_id: 'l9', name: 'Menú del día', price: 1650, qty: 1, combo_id: 'c-menu',
    combo_choices: [
      { option_id: 'o-soup', product_name: 'Gazpacho', category_id: null },
      { option_id: 'o-sirloin', product_name: 'Solomillo', category_id: null },
    ],
  };

  it('prints ONE item with the closed price and the components as its sub-line, on the thermal paper', async () => {
    await printBill([...CART, MENU_LINE]);
    const items = printed[0].data!.items as { name: string; total: number; notes?: string }[];
    expect(items).toHaveLength(3);
    expect(items[2]).toMatchObject({ name: 'Menú del día', total: 16.5, notes: 'Gazpacho · Solomillo' });
    expect(printed[0].data!.total, '2×1,20 + 2,50 + 16,50').toBe(21.4);
  });

  it('and on the HTML paper the components are indented sub-lines of the menu', async () => {
    await printBill([...CART, MENU_LINE]);
    const comps = [...printed[0].html!.matchAll(/<div class="comp">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(comps).toEqual(['Gazpacho', 'Solomillo']);
  });

  it('swapping a component is a NEW job: the corrected bill must come out of the printer', async () => {
    await printBill([...CART, MENU_LINE]);
    await printBill([...CART, { ...MENU_LINE, combo_choices: [MENU_LINE.combo_choices[0], { option_id: 'o-chicken', product_name: 'Pollo', category_id: null }] }]);
    expect(printed[1].jobId).not.toBe(printed[0].jobId);
  });
});
