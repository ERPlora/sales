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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  saleToReceipt,
  saleToInvoice,
  receiptLabels,
  invoiceLabels,
  claimPrintFields,
  type SaleRow,
  type SaleLineRow,
} from './document-mappers.js';

// La raíz del módulo se ancla en SU module.json: se sube desde ESTE fichero (import.meta.url)
// hasta encontrarlo, para que el test no dependa del cwd de vitest.
const salesRoot = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const arriba = dirname(dir);
    if (arriba === dir) throw new Error('no se encontró module.json subiendo desde el test');
    dir = arriba;
  }
  return dir;
})();

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

// ADR-0400 (sales#188): the document keeps the row's MINOR UNITS and says its scale; nothing is
// divided any more — <ok-receipt> paints the integer and would paint a float as «—».
describe('saleToReceipt — dinero en céntimos, tal cual (ADR-0400)', () => {
  it('lleva líneas, subtotal, impuestos, total y pago en céntimos, con su escala', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.decimals).toBe(2);
    expect(r.lines[0].unit_price).toBe(180);
    expect(r.lines[0].total).toBe(360);
    expect(r.subtotal).toBe(327);
    expect(r.taxes?.[0]).toEqual({ label: 'IVA 10%', base: 327, amount: 33 });
    expect(r.total).toBe(360);
    expect(r.payment?.paid).toBe(500);
    expect(r.payment?.change).toBe(140);
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
    expect(inv.decimals).toBe(2);
    expect(inv.lines[0].unit_price).toBe(180);
    expect(inv.lines[0].total).toBe(360);
    expect(inv.subtotal).toBe(327);
    expect(inv.discount_total).toBe(50);
    expect(inv.taxes[0].base).toBe(327);
    expect(inv.taxes[0].amount).toBe(33);
    expect(inv.tax_total).toBe(33);
    expect(inv.total).toBe(360);
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

  it('suma el total del pedido en céntimos, con su escala (ADR-0400)', () => {
    const doc = orderToPrebill(lineas, {});
    // 250*2 + 350 = 850 céntimos; la pantalla los pinta como 8,50 €
    expect(doc.total).toBe(850);
    expect(doc.decimals).toBe(2);
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0]).toMatchObject({ name: 'Cerveza', qty: 2, unit_price: 250, total: 500 });
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

// sales#103 — «pide tu factura» (hub#963 / ADR-0363). El claim acuñado en el mostrador viaja
// con el FISCAL del documento (`FiscalData`), porque su vida es la misma que la del QR de
// VeriFactu: lo resuelve el componente (acuña contra la puerta pública) y los mappers solo lo
// PLASMAN en la forma que cada papel lee. `claimPrintFields` es la ÚNICA fuente de los tres
// campos, para que el papel ESC/POS y el HTML no puedan discrepar.
describe('claimPrintFields — el bloque «pide tu factura» del papel (sales#103)', () => {
  it('con locator acuñado: los tres campos, con las claves del renderer ESC/POS', () => {
    const fields = claimPrintFields({
      claim_locator: 'ABCD1234ABCD1234',
      claim_qr: 'https://hub.example/p/ABCD1234ABCD1234',
    });
    expect(fields).toEqual({
      claim_qr_data: 'https://hub.example/p/ABCD1234ABCD1234',
      claim_locator: 'ABCD1234ABCD1234',
      claim_note: 'Get your invoice', // inglés canónico sin traductor (ADR-0055)
    });
  });

  it('la leyenda sale del catálogo cuando hay traductor', () => {
    const t = (k: string) => (k === 'ui.claimNote' ? 'Pide tu factura' : k);
    expect(claimPrintFields({ claim_locator: 'X' }, t).claim_note).toBe('Pide tu factura');
  });

  it('SIN locator: bloque VACÍO — el tique sale exactamente como hoy (ADR-0127)', () => {
    // Vacío de verdad: ninguna clave `claim_*`, para que el renderer (que imprime solo lo
    // presente) no tenga ni un campo opcional que pintar.
    expect(claimPrintFields({ qr: 'https://aeat/qr' })).toEqual({});
    expect(claimPrintFields({})).toEqual({});
  });

  it('sin URL absoluta no hay segundo QR: queda el localizador en texto, la vía sin cámara', () => {
    const fields = claimPrintFields({ claim_locator: 'ABCD1234ABCD1234' });
    expect(fields.claim_locator).toBe('ABCD1234ABCD1234');
    expect(fields.claim_qr_data).toBeUndefined();
  });
});

// La leyenda es una CADENA VISIBLE → catálogo en Y es (ADR-0055/0199). Se fija aquí para que
// el día que alguien la retoca en un solo idioma el test lo diga antes que el tique mezclado.
describe('la leyenda del claim vive en el catálogo en y es (sales#103)', () => {
  it('ui.claimNote existe en ambos catálogos con el texto acordado', async () => {
    const es = (await import('../../locales/es.json')).default as { ui: Record<string, string> };
    const en = (await import('../../locales/en.json')).default as { ui: Record<string, string> };
    expect(es.ui.claimNote).toBe('Pide tu factura');
    expect(en.ui.claimNote).toBe('Get your invoice');
  });
});

// ── sales#148 · los suplementos llegan al PAPEL ──────────────────────────────────────────────
//
// Criterio de aceptación de ADR-0376: no basta con que el suplemento se GUARDE — el fallo estrella
// del sector es de enrutado. El cliente paga «+ queso 1 €» y el tique decía solo «Hamburguesa»: el
// importe cuadraba (el delta va dentro del `unit_price`) pero el CONCEPTO no aparecía, así que no
// se podía reclamar, comprobar ni justificar. Un tique es un documento fiscal: lo que se cobra
// tiene que estar impreso.
describe('los suplementos viajan al documento (sales#148)', () => {
  it('la línea de venta desempaqueta el snapshot que congeló el servidor al cobrar', () => {
    const lines: SaleLineRow[] = [{
      product_name: 'Hamburguesa', quantity: 1_000_000, unit_price: 1000, line_total: 1000,
      modifiers: JSON.stringify([
        { option_id: 'o-queso', name: 'Extra queso', kitchen_name: 'QUESO', price_delta: 100 },
        { option_id: 'o-sin-cebolla', name: 'Sin cebolla', kitchen_name: 'SIN CEBOLLA', price_delta: 0 },
      ]),
    }];
    const r = saleToReceipt(SALE, lines);
    expect(r.lines[0].printed_modifiers, 'el papel lee el nombre COMERCIAL, no el de cocina').toEqual([
      { option_id: 'o-queso', name: 'Extra queso', price_delta: 100 },
      { option_id: 'o-sin-cebolla', name: 'Sin cebolla', price_delta: 0 },
    ]);
  });

  it('conserva el ORDEN de elección: el cliente los lee como los pidió', () => {
    const snap = (names: string[]) => JSON.stringify(names.map((name, i) => ({ option_id: `o-${i}`, name })));
    const line = (s: string): SaleLineRow => ({ product_name: 'X', quantity: 1_000_000, unit_price: 100, line_total: 100, modifiers: s });
    expect(saleToReceipt(SALE, [line(snap(['B', 'A']))]).lines[0].printed_modifiers?.map((m) => m.name)).toEqual(['B', 'A']);
  });

  it('una línea SIN suplementos no fabrica el campo: el tique de siempre sale igual', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.lines[0].modifiers).toBeUndefined();
  });

  it('un snapshot ROTO no tumba el tique: se pierde el suplemento, nunca el documento', () => {
    const lines: SaleLineRow[] = [{ product_name: 'X', quantity: 1_000_000, unit_price: 100, line_total: 100, modifiers: '{not json' }];
    expect(saleToReceipt(SALE, lines).lines[0].modifiers).toBeUndefined();
  });

  it('sin nombre resoluble queda el id: mejor una línea fea que un cobro invisible', () => {
    const lines: SaleLineRow[] = [{
      product_name: 'X', quantity: 1_000_000, unit_price: 100, line_total: 100,
      modifiers: JSON.stringify([{ option_id: 'o-huerfano', price_delta: 50 }]),
    }];
    expect(saleToReceipt(SALE, lines).lines[0].printed_modifiers).toEqual([{ option_id: 'o-huerfano', price_delta: 50 }]);
  });

  it('la cuenta previa lleva los suyos tal cual se los dan (ya resueltos contra el catálogo vivo)', () => {
    const r = orderToPrebill([
      { name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 }] },
    ]);
    expect(r.lines[0].printed_modifiers).toEqual([{ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 }]);
    // The supplement's delta is NOT printed (sales#148: it is already inside the line total).
    expect(r.lines[0].modifiers, 'and the screen gets the label (sales#183)').toEqual(['Extra queso']);
  });
});

// 🔴 La columna existe y el handler la escribe (`_insert_line.sql`), pero `queries/lines.sql` NO la
// devolvía: el tique y su reimpresión leen la venta por esa puerta, así que el snapshot estaba
// escrito y era ILEGIBLE. Sin esto el mapper de arriba no tiene nada que desempaquetar en un hub
// real, y los tests de TS pasarían mintiendo.
describe('la puerta de lectura del tique devuelve el snapshot (sales#148)', () => {
  it('`queries/lines.sql` SELECCIONA la columna `modifiers`', () => {
    // Los comentarios se quitan ANTES de mirar: un `-- … modifiers …` haría pasar esta
    // comprobación sin que la columna viajara, que es exactamente el fallo que vigila.
    const sinComentarios = readFileSync(join(salesRoot, 'queries/lines.sql'), 'utf8')
      .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
    const select = sinComentarios.slice(
      sinComentarios.toUpperCase().indexOf('SELECT'),
      sinComentarios.toUpperCase().indexOf('FROM'),
    );
    expect(select, 'lo que no se SELECCIONA no llega al papel').toMatch(/\bmodifiers\b/);
    // Y que la comprobación DETECTA el positivo: sobre el SQL de antes de esta issue, falla.
    expect(select.replace(/,\s*modifiers/, '')).not.toMatch(/\bmodifiers\b/);
  });
});

// La PANTALLA del tique y su PAPEL no pueden discrepar (sales#148). `<ok-receipt>` no conoce
// suplementos, pero sí pinta una `note` bajo la línea desde siempre: por ahí entran, compuestos por
// el MISMO `modifierNote` que usan los dos papeles. Si cada superficie compusiera lo suyo, el
// camarero leería en pantalla algo distinto de lo que el cliente lleva en la mano.
describe('la pantalla del tique dice lo mismo que su papel (sales#148)', () => {
  it('la línea lleva su `note` con los suplementos, en el orden elegido', () => {
    const lines: SaleLineRow[] = [{
      product_name: 'Hamburguesa', quantity: 1_000_000, unit_price: 1000, line_total: 1000,
      modifiers: JSON.stringify([{ option_id: 'o1', name: 'Extra queso', price_delta: 100 }, { option_id: 'o2', name: 'Sin cebolla', price_delta: 0 }]),
    }];
    expect(saleToReceipt(SALE, lines).lines[0].note).toBe('Extra queso · Sin cebolla');
  });

  it('la cuenta previa también', () => {
    const r = orderToPrebill([{ name: 'Hamburguesa', price: 900, qty: 1, modifiers: [{ name: 'Extra queso' }] }]);
    expect(r.lines[0].note).toBe('Extra queso');
  });

  it('sin suplementos NO se fabrica nota: la línea de siempre no cambia', () => {
    expect(saleToReceipt(SALE, LINES).lines[0].note).toBeUndefined();
  });
});

// sales#162 / ADR-0386 — a line an EXTERNAL tender already paid comes out of the sale at 0,00 €.
//
// On paper a bare «0,00» is unreadable: it looks like a pricing mistake, or like the salon gave the
// haircut away. It is neither — the money came in when the voucher was SOLD. So the line says so,
// and it says it in the ticket's language: this is the one word `sales` adds to the paper here, and
// `sales` never names the family (it hosts a slot; the word «voucher» is not its to print).
describe('a line covered by an external tender says so on the paper (sales#162)', () => {
  const t = (k: string) => (k === 'ui.linePaidElsewhere' ? 'Ya pagado' : k);
  const COVERED: SaleLineRow[] = [
    { product_name: 'Corte', quantity: 1, unit_price: 1800, line_total: 0, is_covered: 1 },
    { product_name: 'Champú', quantity: 1, unit_price: 900, line_total: 900 },
  ];

  it('marks the covered line and leaves the rest of the ticket alone', () => {
    const r = saleToReceipt(SALE, COVERED, {}, {}, 'es', undefined, t);
    expect(r.lines[0].name).toBe('Corte (Ya pagado)');
    expect(r.lines[0].total).toBe(0);
    expect(r.lines[1].name).toBe('Champú');
  });

  it('the invoice says it too — the same line, the same reason', () => {
    const inv = saleToInvoice(SALE, COVERED, {}, {}, 'es', undefined, t);
    expect(inv.lines[0].description).toContain('Ya pagado');
  });

  it('without a translator the paper still prints something readable, never the key', () => {
    const r = saleToReceipt(SALE, COVERED);
    expect(r.lines[0].name).toBe('Corte (Prepaid)');
  });
});

// sales#154 / ADR-0381 — the MENU reaches the paper: a combo is N sibling rows in the sale (one per
// tax rate, never a parent row with money) and the customer reads ONE header line with the closed
// price and the components indented under it. The header is painted FROM THE SNAPSHOT frozen on
// every sibling (`sales_sale_item.combo`), and its amount is the SUM of the siblings — the tax
// footer keeps the real breakdown untouched. Why the market decided it this way: `paper-combos.ts`.
describe('the menu reaches the document (sales#154)', () => {
  const snapshot = JSON.stringify({
    combo_id: 'c-menu', name: 'Menú del día', kitchen_name: 'MENU', price: 1350, price_charged: 1350,
    supply_kind: 'goods',
    components: [
      { option_id: 'o-sandwich', name: 'Bocadillo', price_delta: 0, tax_category_key: 'food', catalog_price: 600, share: 810 },
      { option_id: 'o-beer', name: 'Cerveza', price_delta: 0, tax_category_key: 'drink', catalog_price: 400, share: 540 },
    ],
  });
  /** A `goods` pack split in two rates: the server materialised TWO rows, one per component. */
  const PACK: SaleLineRow[] = [
    { product_name: 'Bocadillo', quantity: 1_000_000, unit_price: 810, tax_rate: 10, line_total: 810, combo_group_ref: 'grp-1', combo: snapshot },
    { product_name: 'Cerveza', quantity: 1_000_000, unit_price: 540, tax_rate: 21, line_total: 540, combo_group_ref: 'grp-1', combo: snapshot },
  ];

  it('two sibling rows print as ONE line: the menu name, the closed price, the components', () => {
    const r = saleToReceipt(SALE, [...LINES, ...PACK]);
    expect(r.lines, 'café + ONE menu line, not café + two halves').toHaveLength(2);
    expect(r.lines[1].name).toBe('Menú del día');
    expect(r.lines[1].qty).toBe(1);
    expect(r.lines[1].unit_price, '810 + 540').toBe(1350);
    expect(r.lines[1].total).toBe(1350);
    expect(r.lines[1].combo?.components.map((c) => c.name)).toEqual(['Bocadillo', 'Cerveza']);
  });

  it('the screen reads the components in the `note` <ok-receipt> already paints (parity with the paper)', () => {
    const r = saleToReceipt(SALE, PACK);
    expect(r.lines[0].note).toBe('Bocadillo · Cerveza');
  });

  it('a `service` menu — ONE row with the closed price — still gets its header and components', () => {
    const one: SaleLineRow[] = [{ product_name: 'Menú del día', quantity: 2_000_000, unit_price: 1350, line_total: 2700, combo_group_ref: 'grp-2', combo: snapshot }];
    const r = saleToReceipt(SALE, one);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ name: 'Menú del día', qty: 2, unit_price: 1350, total: 2700 });
    expect(r.lines[0].combo?.components).toHaveLength(2);
  });

  it('a component with its own supplement keeps it under the MENU line, after the components', () => {
    const withMods: SaleLineRow[] = [
      PACK[0],
      { ...PACK[1], modifiers: JSON.stringify([{ option_id: 'o-cold', name: 'Muy fría', price_delta: 0 }]) },
    ];
    const r = saleToReceipt(SALE, withMods);
    expect(r.lines[0].printed_modifiers?.map((m) => m.name)).toEqual(['Muy fría']);
    expect(r.lines[0].note).toBe('Bocadillo · Cerveza · Muy fría');
  });

  it('the tax footer is NOT rewritten by the grouping: it is the sale row, the real breakdown', () => {
    const sale: SaleRow = { ...SALE, tax_breakdown: '{"10.00": {"base": 736, "tax": 74}, "21.00": {"base": 446, "tax": 94}}' };
    const r = saleToReceipt(sale, PACK);
    expect(r.taxes.map((t) => t.label)).toEqual(['IVA 10%', 'IVA 21%']);
  });

  it('a line that is not a combo does not grow a `combo` field: the ticket of always is byte-identical', () => {
    const r = saleToReceipt(SALE, LINES);
    expect(r.lines[0].combo).toBeUndefined();
    expect(r.lines[0].note).toBeUndefined();
  });

  it('the bill carries the menu the cart hands it, already resolved against the live catalogue', () => {
    const r = orderToPrebill([
      { name: 'Menú del día', price: 1650, qty: 1, combo: { name: 'Menú del día', components: [{ option_id: 'o-soup', name: 'Gazpacho' }, { option_id: 'o-sirloin', name: 'Solomillo', price_delta: 300 }] } },
    ]);
    expect(r.lines[0].combo?.components.map((c) => c.name)).toEqual(['Gazpacho', 'Solomillo']);
    expect(r.lines[0].note).toBe('Gazpacho · Solomillo (+3,00)');
    expect(r.lines[0].total, 'the closed price, once').toBe(1650);
  });
});

// The read gates of both papers must RETURN the columns (the `modifiers` lesson of sales#148).
describe('the read gates return the menu columns (sales#154)', () => {
  for (const file of ['queries/lines.sql', 'queries/order_lines.sql']) {
    it(`\`${file}\` SELECTs \`combo_group_ref\` and \`combo\``, () => {
      const noComments = readFileSync(join(salesRoot, file), 'utf8')
        .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
      const select = noComments.slice(noComments.toUpperCase().indexOf('SELECT'), noComments.toUpperCase().indexOf('FROM'));
      expect(select).toMatch(/\bcombo_group_ref\b/);
      expect(select).toMatch(/,\s*combo\b/);
    });
  }
});
