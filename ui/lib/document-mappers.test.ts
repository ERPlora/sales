// Contrato de los mappers de documento (venta → ReceiptData/InvoiceData de OutfitKit).
//
// Tres bugs vistos en el tiquet real del TPV (2026-07-16):
//
// 1. DINERO ×100 — la venta guarda CÉNTIMOS (ADR-0007/0123: dinero = INTEGER), pero el mapper
//    pasaba los importes crudos a ok-receipt, que los pinta como euros: un café de 1,80 € salía
//    como «180.00 €» y el total 3,60 € como «360.00 €». El mapper debe convertir a euros (/100).
// 2. FECHA ISO CRUDA — `created_at` («2026-07-16T19:00:30.884434990+00:00») se mostraba tal cual,
//    con nanosegundos y partida en dos líneas. Debe formatearse legible según el locale.
// 3. IDIOMAS MEZCLADOS — ok-receipt/ok-invoice pintan sus defaults en inglés («Receipt», «Change»)
//    si nadie les pasa `.labels`; junto a «Efectivo» quedaba spanglish. El mapper expone
//    `receiptLabels(t)` / `invoiceLabels(t)` para construirlas desde el catálogo ADR-0055.
import { describe, expect, it } from 'vitest';
import {
  saleToReceipt,
  saleToInvoice,
  receiptLabels,
  invoiceLabels,
  type SaleRow,
  type SaleLineRow,
} from './document-mappers.js';

// Venta real de la captura: 2 cafés de 1,80 € = 3,60 €; pagado 5 €, cambio 1,40 €. En BD: céntimos.
const SALE: SaleRow = {
  id: 's1',
  sale_number: 'TICKET-2026-000004',
  subtotal: 327,
  tax_amount: 33,
  tax_breakdown: '{"10.00": {"base": 327, "tax": 33}}',
  total: 360,
  payment_method_name: 'Efectivo',
  amount_tendered: 500,
  change_due: 140,
  created_at: '2026-07-16T19:00:30.884434990+00:00',
};

const LINES: SaleLineRow[] = [
  { product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 },
];

describe('saleToReceipt — dinero en céntimos → euros', () => {
  it('convierte líneas, subtotal, impuestos, total y pago a euros', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.lines[0].unit_price).toBe(1.8);
    expect(r.lines[0].total).toBe(3.6);
    expect(r.subtotal).toBe(3.27);
    expect(r.taxes?.[0]).toEqual({ label: 'IVA 10%', base: 3.27, amount: 0.33 });
    expect(r.total).toBe(3.6);
    expect(r.payment?.paid).toBe(5);
    expect(r.payment?.change).toBe(1.4);
  });
});

describe('saleToReceipt — fecha legible', () => {
  it('formatea created_at según el locale (nada de ISO con nanosegundos)', () => {
    const r = saleToReceipt(SALE, LINES, {}, {}, 'es');
    expect(r.datetime).not.toContain('T');
    expect(r.datetime).not.toContain('884434990');
    // dd/mm/aaaa + hh:mm (la hora exacta depende de la zona horaria del runner)
    expect(r.datetime).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
    expect(r.datetime).toContain('/2026');
  });

  it('sin created_at no revienta: datetime queda undefined', () => {
    const r = saleToReceipt({ ...SALE, created_at: undefined }, LINES);
    expect(r.datetime).toBeUndefined();
  });

  it('una fecha no parseable se muestra tal cual (no "Invalid Date")', () => {
    const r = saleToReceipt({ ...SALE, created_at: 'ayer' }, LINES);
    expect(r.datetime).toBe('ayer');
  });
});

// sales#108 — the sale persists the CANONICAL method name («Cash»: the seed is English by
// contract, ADR-0055, and the handler is server-authoritative about it). That is data, not a
// label: the ticket must translate it at render time, like every other word on the paper.
describe('the payment method on the document is translated at render time (sales#108)', () => {
  const t = (k: string) => (k === 'ui.cash' ? 'Efectivo' : k === 'ui.card' ? 'Tarjeta' : k);

  it('the receipt shows «Efectivo» for a sale that stored «Cash»', () => {
    const r = saleToReceipt({ ...SALE, payment_method_name: 'Cash' }, LINES, {}, {}, 'es', undefined, t);
    expect(r.payment?.method).toBe('Efectivo');
  });

  it('the invoice too', () => {
    const inv = saleToInvoice({ ...SALE, payment_method_name: 'Card' }, LINES, {}, {}, 'es', undefined, t);
    expect(inv.payment_method).toBe('Tarjeta');
  });

  it('a method the owner renamed («BBVA TPV») is shown as is — only the seed names map', () => {
    const r = saleToReceipt({ ...SALE, payment_method_name: 'BBVA TPV' }, LINES, {}, {}, 'es', undefined, t);
    expect(r.payment?.method).toBe('BBVA TPV');
  });

  it('without a translator (legacy callers) the raw name still comes through', () => {
    const r = saleToReceipt({ ...SALE, payment_method_name: 'Cash' }, LINES);
    expect(r.payment?.method).toBe('Cash');
  });
});

// sales#54 — el recargo de equivalencia lleva su clave propia en el `tax_breakdown` (una clave por
// tasa) y el tique lo llamaba «IVA 5%». Desde sales#54 la entrada viene MARCADA (`kind`, `label`) y
// el tique lo pinta como lo que es. Compat: una venta vieja sin marca sigue saliendo como IVA.
describe('el desglose del tique distingue el recargo de equivalencia (sales#54)', () => {
  const t = (k: string) => (k === 'ui.taxSurcharge' ? 'RE' : k);
  const BD = '{"21.00":{"base":10000,"tax":2100,"kind":"tax","label":"vat"},"5.20":{"base":10000,"tax":520,"kind":"surcharge","label":"surcharge"}}';

  it('el recargo se etiqueta RE con su tasa exacta, no «IVA 5%»', () => {
    const r = saleToReceipt({ ...SALE, tax_breakdown: BD }, LINES, {}, {}, 'es', undefined, t);
    const labels = r.taxes!.map((x) => x.label);
    expect(labels).toContain('IVA 21%');
    expect(labels).toContain('RE 5.2%');
  });

  it('una etiqueta puesta por el dueño en la regla (component_label) manda tal cual', () => {
    const custom = BD.replace('"label":"surcharge"', '"label":"Rec. equiv."');
    const r = saleToReceipt({ ...SALE, tax_breakdown: custom }, LINES, {}, {}, 'es', undefined, t);
    expect(r.taxes!.map((x) => x.label)).toContain('Rec. equiv. 5.2%');
  });

  it('una venta anterior a la marca sigue pintando IVA (compat)', () => {
    const r = saleToReceipt(SALE, LINES, {}, {}, 'es', undefined, t);
    expect(r.taxes![0].label).toBe('IVA 10%');
  });
});

describe('saleToInvoice — mismos contratos', () => {
  it('convierte céntimos → euros en líneas y totales', () => {
    const inv = saleToInvoice({ ...SALE, discount_amount: 50 }, LINES);
    expect(inv.lines[0].unit_price).toBe(1.8);
    expect(inv.lines[0].total).toBe(3.6);
    expect(inv.subtotal).toBe(3.27);
    expect(inv.discount_total).toBe(0.5);
    expect(inv.taxes[0].base).toBe(3.27);
    expect(inv.taxes[0].amount).toBe(0.33);
    expect(inv.tax_total).toBe(0.33);
    expect(inv.total).toBe(3.6);
  });

  it('formatea issue_date legible', () => {
    const inv = saleToInvoice(SALE, LINES, {}, {}, 'es');
    expect(inv.issue_date).not.toContain('T');
    expect(inv.issue_date).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

// QR promocional del tiquet (reseñas Google, redes…): el negocio configura URL + texto en los
// Ajustes TPV y el mapper los vuelca al contrato `promo_qr`/`promo_note` de ok-receipt. Solo en
// el TIQUET (la factura A4 es un documento formal, sin marketing).
describe('saleToReceipt — QR promocional desde ajustes', () => {
  it('con URL configurada rellena promo_qr y promo_note', () => {
    const r = saleToReceipt(SALE, LINES, {
      receipt_marketing_url: 'https://g.page/r/mi-negocio/review',
      receipt_marketing_text: 'Escanea y déjanos una reseña',
    });
    expect(r.promo_qr).toBe('https://g.page/r/mi-negocio/review');
    expect(r.promo_note).toBe('Escanea y déjanos una reseña');
  });

  it('sin URL no hay rastro promocional (aunque haya texto)', () => {
    const r = saleToReceipt(SALE, LINES, { receipt_marketing_text: 'huérfano' });
    expect(r.promo_qr).toBeUndefined();
    expect(r.promo_note).toBeUndefined();
  });
});

// Business header on sale documents (#32): the QA hub had its business profile configured
// (hub_settings.business_legal_name, single source ADR-0061) and the printed ticket still said
// the hardcoded default «Mi negocio» — the mappers ignored the issuer the runtime had already
// resolved onto the invoice snapshot (invoice.by_source → issuer_name). Contract:
// - TICKET: an explicit `receipt_header` wins (deliberate branding, first line = name); empty →
//   the fiscal issuer name fills in; last resort = the translated default passed by the UI.
// - A4 INVOICE: formal fiscal document → the legal name from the fiscal snapshot wins.
describe('business header from the business profile (#32)', () => {
  it('receipt: empty receipt_header falls back to the fiscal issuer name', () => {
    const r = saleToReceipt(SALE, LINES, {}, { issuer_name: 'Manolo García SL', issuer_nif: 'B12345678' });
    expect(r.business.name).toBe('Manolo García SL');
    expect(r.business.tax_id).toBe('B12345678');
  });

  it('receipt: an explicit receipt_header wins over the profile (deliberate branding)', () => {
    const r = saleToReceipt(
      SALE, LINES,
      { receipt_header: 'Bar Manolo\nCalle Mayor 1' },
      { issuer_name: 'Manolo García SL' },
    );
    expect(r.business.name).toBe('Bar Manolo');
    expect(r.business.address).toBe('Calle Mayor 1');
  });

  it('invoice: the legal name from the fiscal snapshot wins (formal document)', () => {
    const inv = saleToInvoice(SALE, LINES, { receipt_header: 'Bar Manolo' }, { issuer_name: 'Manolo García SL' });
    expect(inv.issuer.name).toBe('Manolo García SL');
  });

  it('invoice: without fiscal data the receipt_header still names the issuer', () => {
    const inv = saleToInvoice(SALE, LINES, { receipt_header: 'Bar Manolo' }, {});
    expect(inv.issuer.name).toBe('Bar Manolo');
  });

  it('last resort is the translated default passed by the UI (English canonical in the mapper)', () => {
    // English canonical fallback (ADR-0055), same pattern as the pre-bill notice: the UI passes
    // the translated text; the bare mapper keeps a canonical English default.
    expect(saleToReceipt(SALE, LINES).business.name).toBe('My business');
    expect(saleToReceipt(SALE, LINES, {}, {}, 'es', 'Mi negocio').business.name).toBe('Mi negocio');
    expect(saleToInvoice(SALE, LINES, {}, {}, 'es', 'Mi negocio').issuer.name).toBe('Mi negocio');
  });
});

describe('labels i18n para ok-receipt / ok-invoice (ADR-0055)', () => {
  // t() doble: devuelve la clave — el test fija QUÉ claves del catálogo alimentan cada label.
  const t = (key: string): string => key;

  it('receiptLabels cubre todas las etiquetas visibles del tiquet', () => {
    expect(receiptLabels(t)).toEqual({
      empty: 'ui.docEmpty',
      phone: 'ui.docPhone',
      receipt: 'ui.docReceipt',
      servedBy: 'ui.docServedBy',
      customer: 'ui.docCustomer',
      item: 'ui.docItem',
      amount: 'ui.docAmount',
      noLines: 'ui.docNoLines',
      subtotal: 'ui.docSubtotal',
      total: 'ui.docTotal',
      change: 'ui.docChange',
    });
  });

  it('invoiceLabels cubre todas las etiquetas visibles de la factura', () => {
    expect(invoiceLabels(t)).toEqual({
      empty: 'ui.docEmptyInvoice',
      invoice: 'ui.docInvoice',
      number: 'ui.docNumber',
      date: 'ui.docDate',
      dueDate: 'ui.docDueDate',
      billTo: 'ui.docBillTo',
      description: 'ui.docDescription',
      qty: 'ui.docQty',
      price: 'ui.docPrice',
      discount: 'ui.docDiscount',
      tax: 'ui.docTax',
      amount: 'ui.docAmount',
      noLines: 'ui.docNoLines',
      taxBase: 'ui.docTaxBase',
      discountTotal: 'ui.docDiscountTotal',
      total: 'ui.docTotal',
      paymentMethod: 'ui.docPaymentMethod',
    });
  });
});

// ── ADR-0141: la CUENTA previa (pre-bill) que se lleva a la mesa antes de cobrar ──────────────
// Es un documento OPERATIVO, no fiscal: el tiquet fiscal nace al COBRAR. Por eso NO puede llevar
// número de serie fiscal ni QR VeriFactu — un papel que parezca factura sin serlo es un problema
// legal, no un detalle estético.
import { orderToPrebill } from './document-mappers';

describe('cuenta previa (pre-bill) — NO es un documento fiscal', () => {
  const lineas = [
    { id: 'p1', name: 'Cerveza', price: 250, qty: 2 },
    { id: 'p2', name: 'Tapa', price: 350, qty: 1 },
  ];

  it('no lleva número fiscal ni QR VeriFactu', () => {
    const doc = orderToPrebill(lineas, { receipt_header: 'Bar Manolo' });
    expect(doc.number, 'la cuenta NO tiene número de serie fiscal').toBeUndefined();
    expect(doc.qr, 'la cuenta NO lleva QR VeriFactu').toBeUndefined();
    expect(doc.payment, 'aún no se ha cobrado: sin datos de pago').toBeUndefined();
  });

  it('titles the paper like the printed one does (screen/paper parity)', () => {
    // The ESC/POS renderer prints «CUENTA» as the first line so a bill cannot pass for a fiscal
    // ticket at a glance. The preview must show the same paper: the UI passes the translated
    // title (ui.prebillTitle); the mapper's fallback is canonical English (ADR-0055).
    expect(orderToPrebill(lineas, {}, { title: 'Cuenta' }).title).toBe('Cuenta');
    expect(orderToPrebill(lineas, {}).title).toBe('Bill');
  });

  it('avisa por escrito de que no es una factura (inglés canónico, ADR-0055)', () => {
    const doc = orderToPrebill(lineas, {});
    // El respaldo del mapper va en INGLÉS canónico (ADR-0055); la UI pasa el texto traducido.
    expect((doc.footer || '').toLowerCase()).toContain('not an invoice');
  });

  it('suma el total del pedido en euros (el TPV trabaja en céntimos)', () => {
    const doc = orderToPrebill(lineas, {});
    // 250*2 + 350 = 850 céntimos = 8,50 €
    expect(doc.total).toBe(8.5);
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0]).toMatchObject({ name: 'Cerveza', qty: 2, unit_price: 2.5, total: 5 });
  });

  it('las invitaciones no se cobran: van a 0', () => {
    const doc = orderToPrebill([{ id: 'p1', name: 'Cerveza', price: 250, qty: 1, is_gift: true }], {});
    expect(doc.total).toBe(0);
  });

  it('identifica la mesa cuando la comanda es de sala', () => {
    const doc = orderToPrebill(lineas, {}, { tableLabel: 'Mesa 4' });
    expect(doc.customer).toBe('Mesa 4');
  });

  it('accepts the translated fallback business name (English canonical default)', () => {
    // Same #32 contract as the ticket: the UI passes the translated default; without it the
    // mapper keeps the canonical English fallback (ADR-0055).
    expect(orderToPrebill(lineas, {}).business.name).toBe('My business');
    expect(orderToPrebill(lineas, {}, { fallbackName: 'Mi negocio' }).business.name).toBe('Mi negocio');
  });
});

// sales#28 — la unidad congelada en la línea (ADR-0147 §2.4) tiene que llegar al PAPEL: el tiquet
// imprimía «1.5 × 12,00 €» para 1,5 kg. Los mappers la hacen viajar con la línea del documento
// (`<ok-receipt>` de outfitkit no la conoce: son campos extra que consumen receipt-html/ESC-POS) y
// la factura A4 la pinta donde su contrato lo permite: junto a la descripción, «Tomate rosa (kg)».
describe('la unidad congelada viaja al documento (sales#28)', () => {
  const KG: SaleLineRow = {
    product_name: 'Tomate rosa',
    quantity: 1_500_000, // µ (ADR-0147): 1,5 kg
    unit_price: 1200,
    line_total: 1800,
    unit_code: 'kg',
    unit_name: 'Kilogramo',
    pricing_unit_code: 'kg',
    pricing_unit_name: 'Kilogramo',
  };

  it('saleToReceipt: la línea lleva unit_code/unit_name/pricing_unit_code para el papel', () => {
    const r = saleToReceipt(SALE, [KG]);
    expect(r.lines[0].qty).toBe(1.5);
    expect(r.lines[0]).toMatchObject({ unit_code: 'kg', unit_name: 'Kilogramo', pricing_unit_code: 'kg' });
  });

  it('saleToReceipt: una línea antigua sin contexto no fabrica unidades', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.lines[0]).not.toHaveProperty('unit_code');
  });

  it('orderToPrebill: la unidad congelada del carrito llega a la cuenta que se imprime', () => {
    const doc = orderToPrebill([{ name: 'Tomate rosa', price: 1200, qty: 1.5, unit_code: 'kg', unit_name: 'Kilogramo' }], {});
    expect(doc.lines[0].qty).toBe(1.5);
    expect(doc.lines[0]).toMatchObject({ unit_code: 'kg', unit_name: 'Kilogramo' });
  });

  it('saleToInvoice: la factura A4 dice la unidad junto a la descripción, «Tomate rosa (kg)»', () => {
    // `InvoiceLine` (outfitkit) no tiene campo de unidad: el hueco honesto es la descripción,
    // como «Vino (botella)» — la columna de cantidad sigue siendo el número.
    const inv = saleToInvoice(SALE, [KG]);
    expect(inv.lines[0].description).toBe('Tomate rosa (kg)');
    expect(inv.lines[0].qty).toBe(1.5);
  });

  it('saleToInvoice: sin unidad o con la suelta (`ud`) la descripción queda como estaba', () => {
    const ud: SaleLineRow = { ...KG, unit_code: 'ud', unit_name: 'Unidad', pricing_unit_code: 'ud' };
    expect(saleToInvoice(SALE, [LINES[0], ud]).lines.map((l) => l.description))
      .toEqual(['Cafe solo', 'Tomate rosa']);
  });
});
