// The contract of the paper — the shape the thermal printer actually reads (sales#78 / sales#79).
//
// There are two documents with the same content and different shapes, and mixing them up is the
// whole bug this file pins down:
//
//   - `ReceiptData` (document-mappers.ts) — what `<ok-receipt>` paints on SCREEN and in the HTML
//     fallback: `business.name`, `lines[]`, money already formatted for a human.
//   - `PrintDocument` (this file) — what `escpos::render_document` reads: `business_name`,
//     `items[{name, quantity, total}]`, plain euros. It reads BY KEY, so a document in the other
//     shape does not error: it renders every default and prints «ERPlora», no lines, TOTAL 0.00.
//
// A blank ticket that looks printed is worse than one that never prints, so the shape is pinned
// here, key by key, against the renderer's field names.
import { describe, expect, it } from 'vitest';
import { orderToPrebill } from './document-mappers.js';
import { prebillToPrintDocument, saleToPrintDocument, prebillJobId } from './print-document.js';
import { quantityLabel } from './price-label.js';

const SETTINGS = { receipt_header: 'Bar Manolo\nCalle Mayor 3, Madrid', receipt_footer: 'Gracias' };

/** Two coffees and a beer, in cents, as the cart holds them. */
const CART = [
  { name: 'Café solo', price: 120, qty: 2 },
  { name: 'Caña', price: 250, qty: 1 },
];

describe('prebillToPrintDocument — the bill taken to the table', () => {
  it('uses the field names the ESC/POS renderer reads, not the ones the screen reads', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, { tableLabel: 'Mesa 4' });

    // What the renderer looks up (crates/peripherals/src/escpos.rs, render_prebill).
    expect(doc.business_name, 'first line of receipt_header').toBe('Bar Manolo');
    expect(doc.business_address, 'the rest of receipt_header').toBe('Calle Mayor 3, Madrid');
    expect(doc.customer_name, 'the table goes where the renderer prints «Mesa/Cliente»').toBe('Mesa 4');
    expect(Array.isArray(doc.items), '`items`, not `lines`').toBe(true);

    // And NOT the screen's shape: these keys would make the renderer print all its defaults.
    expect((doc as Record<string, unknown>).lines, 'no `lines`').toBeUndefined();
    expect((doc as Record<string, unknown>).business, 'no nested `business`').toBeUndefined();
  });

  it('money travels in euros as numbers: the renderer formats `{total:.2}` itself', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, {});

    expect(doc.items[0], 'the line, in euros').toMatchObject({ name: 'Café solo', quantity: 2, total: 2.4 });
    expect(doc.total, '2×1,20 + 2,50').toBe(4.9);
    expect(typeof doc.total, 'a number — a string would render as 0.00').toBe('number');
  });

  it('a comped line is named as such and adds nothing to the bill', () => {
    const doc = prebillToPrintDocument([...CART, { name: 'Chupito', price: 200, qty: 1, is_gift: true }], SETTINGS, {});

    expect(doc.items[2].name, 'the customer must read why it is free').toContain('invitación');
    expect(doc.items[2].total, 'a comp is charged at zero').toBe(0);
    expect(doc.total, 'and does not move the total').toBe(4.9);
  });

  it('carries the «this is not an invoice» notice and NO fiscal marks (ADR-0141)', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, { notice: 'Cuenta — no es una factura.' });

    expect(doc.notice, 'the notice is printed, not implied').toBe('Cuenta — no es una factura.');
    // The fiscal number is consumed when CHARGING. A bill that carries one looks like an invoice
    // and is not one, which is a legal problem rather than a cosmetic one.
    expect(doc.receipt_id, 'no series number').toBeUndefined();
    expect(doc.payment_method, 'nothing has been paid yet').toBeUndefined();
    expect((doc as Record<string, unknown>).qr, 'no VeriFactu QR').toBeUndefined();
  });

  // sales#103 — la precuenta no lleva el claim NI EN CAPA DOBLE: aquí no se pinta (no hay
  // registro de facturación al que apuntar, y por tanto no hay factura que pedir); el renderer
  // del hub lo vuelve a garantizar por su lado. Dos capas es a propósito.
  it('carries NO claim block either: a bill has no fiscal record to point at (sales#103)', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, { tableLabel: 'Mesa 4' });
    expect(Object.keys(doc).filter((k) => k.startsWith('claim_'))).toEqual([]);
  });

  it('says on paper exactly what the modal showed on screen', () => {
    // The waiter reads the screen and the customer reads the paper. If these two mappers ever
    // disagree on a name, a quantity or a total, one of the two people is being lied to.
    const screen = orderToPrebill(CART, SETTINGS, { tableLabel: 'Mesa 4' });
    const paper = prebillToPrintDocument(CART, SETTINGS, { tableLabel: 'Mesa 4' });

    expect(paper.items.map((i) => i.name)).toEqual(screen.lines.map((l) => l.name));
    expect(paper.items.map((i) => i.quantity)).toEqual(screen.lines.map((l) => l.qty));
    // The screen carries minor units (ADR-0400); the printer still wants euros — same number, divided once.
    expect(paper.items.map((i) => i.total)).toEqual(screen.lines.map((l) => l.total / 100));
    expect(paper.total).toBe(screen.total / 100);
  });

  it('falls back to a business name instead of printing a nameless bill', () => {
    const doc = prebillToPrintDocument(CART, {}, { fallbackName: 'Mi negocio' });
    expect(doc.business_name).toBe('Mi negocio');
  });
});

describe('prebillJobId — idempotency that still allows a second round', () => {
  it('is stable for the same bill: pressing print twice is one job, not two tickets', () => {
    expect(prebillJobId('order-1', CART)).toBe(prebillJobId('order-1', CART));
  });

  it('CHANGES when the bill changes, or the queue would swallow the reprint as a duplicate', () => {
    const after = [...CART, { name: 'Postre', price: 450, qty: 1 }];
    expect(prebillJobId('order-1', after)).not.toBe(prebillJobId('order-1', CART));
  });

  it('changes when only the quantity changes — same lines, different bill', () => {
    const more = [{ ...CART[0], qty: 3 }, CART[1]];
    expect(prebillJobId('order-1', more)).not.toBe(prebillJobId('order-1', CART));
  });

  it('is scoped to the order: two tables printing the same items are two jobs', () => {
    expect(prebillJobId('order-1', CART)).not.toBe(prebillJobId('order-2', CART));
  });

  it('names itself so a queued job can be recognised', () => {
    expect(prebillJobId('order-1', CART)).toMatch(/^prebill-order-1-/);
  });

  // sales#148 — the fingerprint skipped the supplements, so «+ queso» and «sin cebolla» hashed
  // the same and the queue swallowed the corrected bill as a duplicate. Silent: the waiter takes
  // the OLD paper to the table and nothing errors. Same shape of bug as sales#92.
  it('CHANGES when only a supplement changes: two different bills are two jobs (sales#148)', () => {
    const cheese = [{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 }] }];
    const noOnion = [{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-sin-cebolla', name: 'Sin cebolla' }] }];
    expect(prebillJobId('order-1', cheese)).not.toBe(prebillJobId('order-1', noOnion));
  });

  it('CHANGES when a supplement is ADDED to a line that had none', () => {
    const plain = [{ name: 'Hamburguesa', price: 900, qty: 1 }];
    const withCheese = [{ ...plain[0], modifiers: [{ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 }] }];
    expect(prebillJobId('order-1', withCheese)).not.toBe(prebillJobId('order-1', plain));
  });

  it('CHANGES with the ORDER of the supplements: the paper prints them in the order chosen', () => {
    const a = [{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-a', name: 'A' }, { option_id: 'o-b', name: 'B' }] }];
    const b = [{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-b', name: 'B' }, { option_id: 'o-a', name: 'A' }] }];
    expect(prebillJobId('order-1', a)).not.toBe(prebillJobId('order-1', b));
  });

  it('is STABLE for the same supplements: a retry is still one job, not two papers', () => {
    const l = [{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 }] }];
    expect(prebillJobId('order-1', l)).toBe(prebillJobId('order-1', [{ ...l[0], modifiers: [...l[0].modifiers] }]));
  });

  it('a line with an EMPTY list of supplements hashes like a line with none (no phantom change)', () => {
    const plain = [{ name: 'Hamburguesa', price: 900, qty: 1 }];
    const empty = [{ ...plain[0], modifiers: [] }];
    expect(prebillJobId('order-1', empty)).toBe(prebillJobId('order-1', plain));
  });
});

describe('saleToPrintDocument — the ticket, reprinted', () => {
  const SALE = {
    id: 'sale-1',
    sale_number: 'T-000123',
    subtotal: 405,
    tax_amount: 85,
    total: 490,
    payment_method_name: 'Efectivo',
    amount_tendered: 500,
    change_due: 10,
    customer_name: 'Ana',
  };
  const LINES = [
    { product_name: 'Café solo', quantity: 2, unit_price: 120, line_total: 240 },
    { product_name: 'Caña', quantity: 1, unit_price: 250, line_total: 250 },
  ];

  it('is not empty: the reprint used to send `{}` and the printer rendered every default', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS);

    expect(doc.business_name).toBe('Bar Manolo');
    expect(doc.receipt_id, 'the ticket number the customer holds').toBe('T-000123');
    expect(doc.items, 'the lines that were sold').toHaveLength(2);
    expect(doc.total, 'cents on the row, euros on the paper').toBe(4.9);
  });

  it('carries what a paid ticket carries: totals, tax, payment and change', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS);

    expect(doc.subtotal).toBe(4.05);
    expect(doc.tax_amount).toBe(0.85);
    expect(doc.payment_method).toBe('Efectivo');
    expect(doc.paid).toBe(5);
    expect(doc.change).toBe(0.1);
    expect(doc.receipt_footer).toBe('Gracias');
    expect(doc.customer_name).toBe('Ana');
  });

  it('carries the fiscal marks the screen carries: official number, NIF and the VeriFactu QR', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS, {
      number: 'F2026/0007',
      issuer_nif: 'B12345678',
      qr: 'https://prewww2.aeat.es/...',
    });

    expect(doc.receipt_id, 'the official number is the one the customer must be able to quote').toBe('F2026/0007');
    expect(doc.vat_number).toBe('B12345678');
    // `qr_data` is the field the renderer looks up. Reprinting a fiscal ticket without its QR
    // would hand the customer a paper that cannot be checked against the AEAT.
    expect(doc.qr_data).toBe('https://prewww2.aeat.es/...');
    // The name stays the merchant's ticket branding: `receipt_header` wins over the issuer of
    // record on a receipt (document-mappers, sales#32). Paper and screen must say the same thing.
    expect(doc.business_name).toBe('Bar Manolo');
  });

  it('a comped line is named and charged at zero here too', () => {
    const doc = saleToPrintDocument(SALE, [...LINES, { product_name: 'Chupito', quantity: 1, unit_price: 200, line_total: 0, is_gift: 1 }], SETTINGS);
    expect(doc.items[2].name).toContain('Invitación');
    expect(doc.items[2].total).toBe(0);
  });

  // sales#103 — «pide tu factura»: el SEGUNDO QR. El renderer ESC/POS acepta tres campos
  // SEPARADOS del `qr_data` fiscal: el QR fiscal apunta a la AEAT y su numserie es correlativo y
  // público, así que NO vale como localizador. Sin locator acuñado, ninguno de los tres existe.
  it('carries the claim block when the locator was minted: second QR, legend and locator in text', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS, {
      qr: 'https://prewww2.aeat.es/validar',
      claim_locator: 'ABCD1234ABCD1234',
      claim_qr: 'https://hub.example/p/ABCD1234ABCD1234',
    });

    expect(doc.claim_qr_data, 'la URL del segundo QR, no la de la AEAT').toBe('https://hub.example/p/ABCD1234ABCD1234');
    expect(doc.claim_locator, 'el localizador en TEXTO: la vía cuando la cámara no enfoca').toBe('ABCD1234ABCD1234');
    expect(doc.claim_note, 'sin ella nadie sabe para qué es el segundo código').toBe('Get your invoice');
    expect(doc.qr_data, 'el QR fiscal sigue siendo el de la AEAT — son DOS códigos').toBe('https://prewww2.aeat.es/validar');
  });

  it('the claim legend is translated when the caller brings the catalog translator', () => {
    const t = (k: string) => (k === 'ui.claimNote' ? 'Pide tu factura' : k);
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS, {
      claim_locator: 'ABCD1234ABCD1234',
      claim_qr: 'https://hub.example/p/ABCD1234ABCD1234',
    }, 'es', undefined, t);
    expect(doc.claim_note).toBe('Pide tu factura');
  });

  it('without a minted locator the ticket is IDENTICAL to today: no claim_* field exists', () => {
    const doc = saleToPrintDocument(SALE, LINES, SETTINGS, { qr: 'https://aeat/qr' });
    // La clave ni siquiera existe: el renderer imprime solo los campos presentes (opt-in, ADR-0363).
    expect(Object.keys(doc).filter((k) => k.startsWith('claim_'))).toEqual([]);
  });
  it('the payment method is translated on the paper too (sales#108)', () => {
    const t = (k: string) => (k === 'ui.cash' ? 'Efectivo' : k);
    const doc = saleToPrintDocument({ ...SALE, payment_method_name: 'Cash' }, LINES, SETTINGS, {}, 'es', undefined, t);
    expect(doc.payment_method).toBe('Efectivo');
  });
});

// sales#28 — la cantidad con su unidad también en el papel TÉRMICO. El renderer compone la línea
// como `«{}x {name}»` con la cantidad tal cual llega: un número sale «2x Café», y un 1,5 a secas
// saldría «1.5x Tomate» — punto inglés, sin unidad. El contrato del renderer (escpos.rs, fmt_qty)
// acepta la cantidad como STRING y la imprime verbatim: es la costura oficial para mandar «1,5 kg »
// (con el espacio final, para que su «x» literal no se pegue: «1,5 kgx» no lo lee nadie).
describe('la cantidad del papel térmico lleva su unidad (sales#28)', () => {
  const PESO = [
    ...CART,
    { name: 'Tomate rosa', price: 1200, qty: 1.5, unit_code: 'kg' },
  ];

  it('prebill: sin unidad la cantidad sigue siendo el NÚMERO de siempre (papel byte a byte)', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, {});
    expect(doc.items[0].quantity).toBe(2);
    expect(typeof doc.items[0].quantity, 'el renderer imprime el número tal cual').toBe('number');
  });

  it('prebill: con unidad medible la cantidad viaja YA compuesta, «1,5 kg » para su «x» literal', () => {
    const doc = prebillToPrintDocument(PESO, SETTINGS, {});
    expect(doc.items[2].quantity).toBe('1,5 kg ');
    expect(doc.items[2].name, 'el nombre no se toca: la unidad va con la cantidad').toBe('Tomate rosa');
  });

  it('prebill: unidad suelta (`ud`) = sin ruido, la cantidad a secas como número', () => {
    const doc = prebillToPrintDocument([...CART, { name: 'Café', price: 300, qty: 2, unit_code: 'ud' }], SETTINGS, {});
    expect(doc.items[2].quantity).toBe(2);
    expect(typeof doc.items[2].quantity).toBe('number');
  });

  it('sale (reprint): la fila de `sales.lines` llega en punto fijo 10⁶ y sale «1,5 kg »', () => {
    const sale = { id: 'sale-kg', sale_number: 'T-000124', total: 2040 };
    const lines = [
      { product_name: 'Café solo', quantity: 2_000_000, unit_price: 120, line_total: 240 },
      { product_name: 'Tomate rosa', quantity: 1_500_000, unit_price: 1200, line_total: 1800, unit_code: 'kg' },
    ];
    const doc = saleToPrintDocument(sale, lines, SETTINGS);
    expect(doc.items[1].quantity).toBe('1,5 kg ');
    expect(doc.items[0].quantity, 'la línea antigua sin unidad no cambia').toBe(2);
    expect(typeof doc.items[0].quantity).toBe('number');
  });

  it('lo que sale es lo que la pantalla del papel HTML pinta: misma cantidad, misma unidad', () => {
    // Paridad pantalla/papel (el mismo principio del test de arriba): el HTML imprime
    // «1,5 kg × …» y el térmico debe componer su línea con LA MISMA cantidad.
    const screen = orderToPrebill(PESO, SETTINGS, { tableLabel: 'Mesa 4' });
    const paper = prebillToPrintDocument(PESO, SETTINGS, { tableLabel: 'Mesa 4' });
    expect(paper.items[2].quantity).toBe(`${quantityLabel(screen.lines[2].qty, screen.lines[2].unit_code)} `);
  });
});

// sales#92 — the REPRINT key is unique per attempt. A sale is immutable (fiscal record), so a
// content fingerprint (the prebill's answer) would be constant and the queue's
// (hub_id, job_id) dedup would swallow every copy after the first — and the sale's own key
// (`sale-<id>`) was already spent by the shell's auto-print at checkout. Each press of IMPRIMIR
// is an explicit request for another copy: a new job, still correlatable with the sale.
describe('reprintJobId — one key per print attempt (sales#92)', () => {
  it('every call returns a DIFFERENT key, even in the same millisecond', async () => {
    const { reprintJobId } = await import('./print-document.js');
    const first = reprintJobId('venta-1')!;
    const second = reprintJobId('venta-1')!;
    expect(first).not.toBe(second);
    expect(reprintJobId('venta-1')).not.toBe(second);
  });

  it('correlates with the sale (`sale-<id>-…`) and is NEVER the checkout key', async () => {
    const { reprintJobId } = await import('./print-document.js');
    const key = reprintJobId('venta-1')!;
    expect(key.startsWith('sale-venta-1-')).toBe(true);
    expect(key).not.toBe('sale-venta-1', 'that exact key belongs to the auto-print of the checkout');
  });

  it('without a sale there is no job: nothing to correlate, nothing to print', async () => {
    const { reprintJobId } = await import('./print-document.js');
    expect(reprintJobId(undefined)).toBeUndefined();
  });
});

// ── sales#148 · el suplemento llega al papel TÉRMICO ─────────────────────────────────────────
//
// El renderizador ESC/POS lee POR CLAVE y ya sabe pintar UNA nota indentada bajo cada artículo
// (`  > {notes}`, crates/peripherals/src/escpos.rs, render_receipt y render_prebill). Por ahí van
// los suplementos: es la puerta que TODO hub desplegado hoy imprime ya, sin esperar una imagen
// nueva. Añadir una clave `modifiers` que el renderizador no lee habría impreso exactamente nada
// —el fallo que la cabecera de este fichero lleva avisando desde sales#78—, así que no se añade.
describe('los suplementos en el documento del térmico (sales#148)', () => {
  const MODS = [{ option_id: 'o1', name: 'Extra queso', price_delta: 100 }, { option_id: 'o2', name: 'Sin cebolla', price_delta: 0 }];

  it('la cuenta previa los manda en `notes`, la sub-línea que el renderizador ya indenta', () => {
    const doc = prebillToPrintDocument([{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: MODS }], SETTINGS, {});
    expect(doc.items[0].notes).toBe('Extra queso · Sin cebolla');
  });

  it('el tique reimpreso también, desde el snapshot que congeló el cobro', () => {
    const doc = saleToPrintDocument(
      { id: 's1', sale_number: 'T-1', total: 1000 },
      [{ product_name: 'Hamburguesa', quantity: 1_000_000, unit_price: 1000, line_total: 1000, modifiers: JSON.stringify(MODS) }],
      SETTINGS,
    );
    expect(doc.items[0].notes).toBe('Extra queso · Sin cebolla');
  });

  it('SIN importe en el papel: el delta ya viaja dentro del total de la línea', () => {
    // sales#208 — este caso afirmaba lo que su propio nombre dice y comprobaba lo contrario: el
    // total esperado era 10,00 €, o sea la base PELADA, con lo que el papel no llevaba el delta ni
    // al lado del suplemento ni dentro del importe. El contrato de la cabecera de
    // `paper-modifiers.ts` (y el de Toast y Shopify POS que cita) es que va DENTRO: 10,00 + 1,00.
    const doc = prebillToPrintDocument([{ name: 'Hamburguesa', price: 1000, qty: 1, modifiers: MODS }], SETTINGS, {});
    expect(doc.items[0].notes).not.toMatch(/\d/);
    expect(doc.items[0].total, 'el importe cobrado es el de la línea, con el suplemento dentro').toBe(11);
  });

  it('una línea sin suplementos NO gana la clave: el papel de siempre sale byte a byte igual', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, {});
    expect(doc.items[0].notes).toBeUndefined();
    expect(Object.keys(doc.items[0]).includes('notes'), 'ni la clave presente en `undefined`').toBe(false);
  });
});

// ── sales#229 · the supplements ALSO travel as a LIST ────────────────────────────────────────
//
// `notes` chains them with « · » in ONE sub-line, which is all a deployed renderer can indent
// today. With two or three the line runs past the 32 columns of the thermal paper and the printer
// wraps it at the margin: the continuation loses the indent that is what ties a supplement to its
// item. The fix belongs to the renderer (ERPlora/hub#1138, still open) — one row per supplement —
// and it needs the supplements as a LIST to do it.
//
// So the item carries BOTH keys, exactly as the menu's `components` does since sales#154: the
// renderer that does not know `modifiers` ignores it and prints `notes` as it does today, and the
// one that learns it prints the rows and steps over `notes`. That is why this is safe to ship
// before the renderer: nothing is removed.
//
// Shape: `string[]`, the label already composed — the SAME array `<ok-receipt>` paints, through
// the same `modifierLabel`. Not objects: the only list the renderer reads today (`components`) is
// a list of composed labels, and composing the text on this side is what keeps the four doors
// (screen, HTML paper, thermal paper, jobId fingerprint) from drifting apart.
describe('sales#229 — the supplements ALSO travel as a list, keeping `notes`', () => {
  const MODS = [{ option_id: 'o1', name: 'Extra queso', price_delta: 100 }, { option_id: 'o2', name: 'Sin cebolla', price_delta: 0 }];
  const withMods = [{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: MODS }];

  it('the bill hands the labels in the order they were chosen, and `notes` is byte-identical', () => {
    const doc = prebillToPrintDocument(withMods, SETTINGS, {});
    expect(doc.items[0].modifiers).toEqual(['Extra queso', 'Sin cebolla']);
    expect(doc.items[0].notes, 'the old door is untouched, for a renderer that only knows it').toBe('Extra queso · Sin cebolla');
  });

  it('the reprinted ticket too, from the snapshot the checkout froze', () => {
    const doc = saleToPrintDocument(
      { id: 's1', sale_number: 'T-1', total: 1000 },
      [{ product_name: 'Hamburguesa', quantity: 1_000_000, unit_price: 1000, line_total: 1000, modifiers: JSON.stringify(MODS) }],
      SETTINGS,
    );
    expect(doc.items[0].modifiers).toEqual(['Extra queso', 'Sin cebolla']);
    expect(doc.items[0].notes).toBe('Extra queso · Sin cebolla');
  });

  it('the list carries no amount either: the delta already travels inside the line total', () => {
    const doc = prebillToPrintDocument([{ name: 'Hamburguesa', price: 1000, qty: 1, modifiers: MODS }], SETTINGS, {});
    expect(doc.items[0].modifiers?.join('')).not.toMatch(/\d/);
  });

  it('a nameless supplement falls back to its id, like every other door', () => {
    const doc = prebillToPrintDocument([{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-huerfano' }] }], SETTINGS, {});
    expect(doc.items[0].modifiers).toEqual(['o-huerfano']);
  });

  it('a line without supplements does NOT grow the key', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, {});
    expect(Object.keys(doc.items[0]).includes('modifiers'), 'not even present as `undefined`').toBe(false);
  });

  it('an empty supplement list does not grow the key either', () => {
    const doc = prebillToPrintDocument([{ name: 'Café solo', price: 120, qty: 2, modifiers: [] }], SETTINGS, {});
    expect(Object.keys(doc.items[0]).includes('modifiers')).toBe(false);
  });

  it('the menu keeps its `components`, an axis of its own, alongside the supplements', () => {
    const doc = prebillToPrintDocument(
      [{ name: 'Menú del día', price: 1350, qty: 1, combo: { name: 'Menú del día', components: [{ name: 'Gazpacho' }] }, modifiers: [{ name: 'Sin sal' }] }],
      SETTINGS,
      {},
    );
    expect(doc.items[0].components).toEqual(['Gazpacho']);
    expect(doc.items[0].modifiers).toEqual(['Sin sal']);
    expect(doc.items[0].notes, 'and the single sub-line still says both, for today\'s renderer').toBe('Gazpacho · Sin sal');
  });

  it('the print fingerprint of a bill without supplements does not move: no reprint is swallowed', () => {
    // The `jobId` is the queue's idempotency key. If this change moved it, every open bill would
    // print again on the next round; if it stopped moving with the supplements, a corrected bill
    // would be swallowed as a duplicate and NO paper would come out (sales#148).
    expect(prebillJobId('order-1', CART)).toBe('prebill-order-1-11t19fg');
    expect(prebillJobId('order-1', withMods)).not.toBe(prebillJobId('order-1', [{ name: 'Hamburguesa', price: 900, qty: 1 }]));
  });
});

// sales#154 / ADR-0381 — the menu on the THERMAL paper. The renderer (`escpos::render_receipt` /
// `render_prebill`) reads `name`, `quantity`, `total` and `notes` per item — nothing else, and a key
// it does not know prints NOTHING, silently (the sales#78 lesson). So the menu goes through the keys
// every deployed hub already prints: ONE item with the closed price, and its components in the
// indented `notes` sub-line — the same door sales#148 used for supplements. A structured, one-per-line
// component list needs the renderer to learn it (ERPlora/hub issue in the PR), and this shape is
// forward-compatible with that: the header item stays, the list is an extra optional key.
describe('the menu on the thermal paper (sales#154)', () => {
  const snapshot = JSON.stringify({
    combo_id: 'c-menu', name: 'Menú del día', price: 1350, price_charged: 1350, supply_kind: 'goods',
    components: [
      { option_id: 'o-sandwich', name: 'Bocadillo', price_delta: 0 },
      { option_id: 'o-beer', name: 'Cerveza', price_delta: 0 },
    ],
  });
  const SALE = { id: 's1', sale_number: 'T-1', subtotal: 1182, tax_amount: 168, total: 1350 };
  const PACK = [
    { product_name: 'Bocadillo', quantity: 1_000_000, unit_price: 810, line_total: 810, combo_group_ref: 'grp-1', combo: snapshot },
    { product_name: 'Cerveza', quantity: 1_000_000, unit_price: 540, line_total: 540, combo_group_ref: 'grp-1', combo: snapshot },
  ];

  it('a pack split in two rates prints ONE item: the menu, its closed price, and its components as the sub-line', () => {
    const doc = saleToPrintDocument(SALE, PACK, SETTINGS);
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0]).toMatchObject({ name: 'Menú del día', quantity: 1, total: 13.5, notes: 'Bocadillo · Cerveza' });
    expect(doc.total, 'and the paper total is the sale total, untouched').toBe(13.5);
    expect(doc.tax_amount, 'the tax line is the sale row: the real, two-rate amount').toBe(1.68);
  });

  it('the components are ALSO handed as a list, for a renderer that learns to indent them', () => {
    const doc = saleToPrintDocument(SALE, PACK, SETTINGS);
    expect(doc.items[0].components).toEqual(['Bocadillo', 'Cerveza']);
  });

  it('the bill prints the menu the same way (one composer, both papers)', () => {
    const doc = prebillToPrintDocument([
      { name: 'Menú del día', price: 1650, qty: 1, combo: { name: 'Menú del día', components: [{ name: 'Gazpacho' }, { name: 'Solomillo', price_delta: 300 }] } },
    ], SETTINGS, {});
    expect(doc.items[0]).toMatchObject({ name: 'Menú del día', quantity: 1, total: 16.5, notes: 'Gazpacho · Solomillo (+3,00)' });
  });

  it('a line without a menu does not grow `notes` nor `components`: byte-identical paper', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS, {});
    expect(doc.items[0].notes).toBeUndefined();
    expect(doc.items[0].components).toBeUndefined();
  });

  it('changing a component changes the bill fingerprint: the corrected bill is a NEW job', () => {
    const menu = (second: string) => [
      { name: 'Menú del día', price: 1350, qty: 1, combo: { name: 'Menú del día', components: [{ option_id: 'o-soup' }, { option_id: second }] } },
    ];
    expect(prebillJobId('order-1', menu('o-chicken'))).not.toBe(prebillJobId('order-1', menu('o-sirloin')));
    expect(prebillJobId('order-1', menu('o-chicken')), 'and the same menu is the same job').toBe(prebillJobId('order-1', menu('o-chicken')));
  });
});

// sales#180 — `render_prebill` already prints `subtotal` + `tax_amount` under a `tax_label`
// (crates/peripherals/src/escpos.rs): the bill knew how to show its VAT and was not being given it.
describe('the bill carries its provisional VAT to the thermal paper (sales#180)', () => {
  it('one rate: base, quota and a label the paper can name', () => {
    const doc = prebillToPrintDocument([{ name: 'Menú', price: 1100, qty: 1, tax_rate: 10 }], SETTINGS);
    expect(doc.subtotal, '10,00 of base').toBe(10);
    expect(doc.tax_amount, '1,00 of quota').toBe(1);
    expect(doc.tax_label, 'with a single rate the paper can name it').toBe('IVA 10%');
    expect(doc.total).toBe(11);
  });

  it('several rates: the sum is NOT labelled with one of them, it would be lying', () => {
    const doc = prebillToPrintDocument(
      [{ name: 'Menú', price: 1100, qty: 1, tax_rate: 10 }, { name: 'Caña', price: 242, qty: 1, tax_rate: 21 }],
      SETTINGS,
    );
    expect(doc.tax_label).toBeUndefined();
    expect(doc.tax_amount).toBe(1.42);
  });

  it('no tax catalogue: the bill of always, without subtotal or quota', () => {
    const doc = prebillToPrintDocument(CART, SETTINGS);
    expect(doc.subtotal).toBeUndefined();
    expect(doc.tax_amount).toBeUndefined();
    expect(doc.tax_label).toBeUndefined();
  });
});

// ── sales#147 · the child line reaches the THERMAL paper too ────────────────────────────────────
//
// The two papers and the screen have to say the same thing (that is why this file composes through
// `document-mappers.ts` instead of building its own document). A supplement that taxes differently
// is a LINE now, with its own amount: if it reached the customer's ticket but not the till roll,
// the two totals would still add up while the papers disagreed about what was bought.
describe('sales#147 — the supplement billed apart, on the thermal paper', () => {
  const sale = { id: 's-1', sale_number: 'T-1', total: 1_200, subtotal: 1_074, tax_amount: 126 };
  const lines = [
    { id: 'l-menu', product_name: 'Menú del día', quantity: 1_000_000, unit_price: 1_000,
      line_total: 1_000, tax_rate: 10, modifiers: '[]' },
    { id: 'l-drink', product_name: 'Refresco', quantity: 1_000_000, unit_price: 200,
      line_total: 200, tax_rate: 21, parent_line_ref: 'l-menu',
      modifiers: '[{"option_id":"o-refresco","name":"Refresco","price_delta":200}]' },
  ];

  it('prints the child right under its parent, with its own euros', () => {
    const doc = saleToPrintDocument(sale, lines, SETTINGS);
    expect(doc.items.map((i) => i.name)).toEqual(['Menú del día', '+ Refresco']);
    expect(doc.items.map((i) => i.total)).toEqual([10, 2]);
    expect(doc.total).toBe(12);
  });

  it('and does not print the supplement a second time as a note under itself', () => {
    const doc = saleToPrintDocument(sale, [lines[0], lines[1]], SETTINGS);
    expect(doc.items[1].notes).toBeUndefined();
  });

  it('the rows can come back in any order: the paper follows the LINK, not the ordering', () => {
    const doc = saleToPrintDocument(sale, [lines[1], lines[0]], SETTINGS);
    expect(doc.items.map((i) => i.name)).toEqual(['Menú del día', '+ Refresco']);
  });
});

// sales#274 — the PAPER is not the screen. The screen leaves the number blank while the invoice is
// being written because it will fill itself in a moment; a printed copy never updates, so it goes
// out with the best identifier it has. The viewer strips `pending` before composing paper
// (`fiscalForPaper`), and this is the guard that says what happens if it ever reaches here.
describe('el papel nunca sale sin identificador (sales#274)', () => {
  const SALE = {
    id: 's1', sale_number: '20260909-0001', subtotal: 2471, tax_amount: 519, total: 2990,
    payment_method_name: 'Efectivo', created_at: '2026-09-09T18:00:00Z',
  };
  const LINES = [{ product_name: 'Corte', quantity: 1_000_000, unit_price: 2990, line_total: 2990 }];

  it('con la cadena fiscal resuelta imprime el número de la factura', () => {
    const doc = saleToPrintDocument(SALE, LINES, {}, { number: 'TICKET-2026-000001' });
    expect(doc.receipt_id).toBe('TICKET-2026-000001');
  });

  it('sin número de factura imprime el de la venta, no un hueco', () => {
    const doc = saleToPrintDocument(SALE, LINES, {}, {});
    expect(doc.receipt_id).toBe(SALE.sale_number);
  });

  it('el NIF vivo del negocio llega al papel cuando la factura aún no lo ha sellado', () => {
    const doc = saleToPrintDocument(SALE, LINES, { issuer_tax_id: '12345678Z', issuer_name: 'Salon Aurora SL' }, {});
    expect(doc.business_name).toBe('Salon Aurora SL');
    expect(doc.vat_number).toBe('12345678Z');
  });

  it('with the invoice still being written (`pending`) the paper keeps the sale number', () => {
    // The screen leaves the number blank while the Outbox writes the invoice; the ESC/POS document
    // is paper and never inherits that blank — whoever composes it. A printed ticket with no
    // identifier is a ticket that does not exist.
    const doc = saleToPrintDocument(SALE, LINES, {}, { pending: true });
    expect(doc.receipt_id).toBe(SALE.sale_number);
  });
});
