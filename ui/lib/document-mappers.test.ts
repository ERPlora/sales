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
