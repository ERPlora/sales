// Contrato del VISOR del documento de venta (erp-sales-document).
//
// Del tiquet real del TPV (2026-07-16) salieron dos defectos de este componente:
//
// 1. SPANGLISH — ok-receipt/ok-invoice traen defaults en inglés («Receipt», «Change») y nadie les
//    pasaba `.labels`; junto a «Efectivo» quedaba mezcla de idiomas. El visor debe construirlas
//    desde el catálogo del módulo (ADR-0055) vía receiptLabels()/invoiceLabels().
// 2. BOTÓN IMPRIMIR FLOTANDO — vivía arriba-derecha, suelto sobre el documento. Se mueve al
//    ion-footer del modal anfitrión (document-modal.ts); el visor pinta SOLO el documento.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReceiptData } from '@erplora/outfitkit';

beforeEach(() => {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryOptional: async () => undefined,
    locale: 'es',
    // t() doble: devuelve la clave — el test mira ESTRUCTURA, no idioma.
    t: (_catalog: unknown, key: string) => key,
  };
});

async function montarVisor() {
  await import('./erp-sales-document');
  const el = document.createElement('erp-sales-document');
  // Inyección directa (la vía de test que el componente ya expone): sin SDK ni saleId.
  (el as unknown as Record<string, unknown>).sale = {
    id: 's1',
    sale_number: 'TICKET-2026-000004',
    subtotal: 327,
    tax_amount: 33,
    total: 360,
    payment_method_name: 'Efectivo',
    created_at: '2026-07-16T19:00:30.884434990+00:00',
  };
  (el as unknown as Record<string, unknown>).lines = [
    { product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 },
  ];
  (el as unknown as Record<string, unknown>).settings = {};
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

describe('visor del documento de venta', () => {
  it('pasa las labels del catálogo a ok-receipt (nada de defaults en inglés)', async () => {
    const el = await montarVisor();
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & {
      labels: Record<string, string>;
    };
    expect(receipt, 'debe pintar el tiquet').toBeTruthy();
    expect(receipt.labels?.receipt, 'las labels salen del catálogo del módulo').toBe('ui.docReceipt');
    expect(receipt.labels?.change).toBe('ui.docChange');
  });

  it('el documento lleva la fecha formateada y el dinero en euros (vía mapper con locale)', async () => {
    const el = await montarVisor();
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & {
      receipt: ReceiptData;
    };
    expect(receipt.receipt.datetime, 'fecha legible, no ISO con nanosegundos').not.toContain('T');
    expect(receipt.receipt.total, 'céntimos → euros').toBe(3.6);
  });

  it('NO pinta botón de imprimir: imprimir vive en el pie del modal anfitrión', async () => {
    const el = await montarVisor();
    expect(el.shadowRoot!.querySelector('ion-button'), 'el visor pinta solo el documento').toBeNull();
  });
});
