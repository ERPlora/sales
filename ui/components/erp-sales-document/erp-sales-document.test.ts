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

  it('without profile or header the default business name goes through i18n (#32)', async () => {
    // t() returns the key: proves the viewer passes the TRANSLATED default to the mapper
    // instead of the mapper's hardcoded fallback.
    const el = await montarVisor();
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & {
      receipt: ReceiptData;
    };
    expect(receipt.receipt.business.name).toBe('ui.docDefaultBusiness');
  });
});

// El Outbox es ASÍNCRONO: al cobrar, `invoice`/`verifactu` se crean unos ms DESPUÉS de que el modal
// abra, y resolveFiscal corría UNA vez → tiquet sin QR de VeriFactu (que legalmente debe ir impreso).
// Contrato: si el módulo está instalado pero el registro aún no existe, se REINTENTA con backoff y
// el QR aparece solo; si el módulo NO está instalado (queryOptional → undefined), no se insiste.
describe('QR fiscal: reintento mientras el Outbox termina', () => {
  const SALE = {
    id: 's1', sale_number: 'T-1', subtotal: 327, total: 360,
    payment_method_name: 'Efectivo', created_at: '2026-07-16T19:00:30Z',
  };

  async function montarPorSaleId(queryOptional: (name: string) => Promise<unknown>) {
    (globalThis as Record<string, unknown>).erplora = {
      query: async (name: string) => (name === 'sales.get' ? [SALE]
        : name === 'sales.lines' ? [{ product_name: 'Cafe', quantity: 1, unit_price: 180, line_total: 180 }]
        : []),
      queryOptional: async (name: string) => queryOptional(name),
      locale: 'es',
      t: (_c: unknown, k: string) => k,
    };
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & {
      fiscalRetryDelays: number[]; updateComplete: Promise<unknown>;
    };
    el.fiscalRetryDelays = [10, 10]; // backoff corto para el test
    el.setAttribute('sale-id', 's1');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  it('el QR aparece cuando el registro fiscal llega unos ms tarde', async () => {
    let llamadas = 0;
    const el = await montarPorSaleId(async (name) => {
      if (name === 'invoice.by_source') {
        llamadas += 1;
        return llamadas < 2 ? [] : [{ id: 'inv1', number: 'F2-1' }]; // 1ª vez: aún no existe
      }
      if (name === 'verifactu.records.by_invoice') return [{ qr_url: 'https://aeat/qr', aeat_csv: '' }];
      return undefined;
    });

    await new Promise((r) => setTimeout(r, 80)); // deja correr los reintentos
    await el.updateComplete;
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & { receipt: ReceiptData };
    expect(llamadas, 'debe reintentar (no rendirse a la primera)').toBeGreaterThan(1);
    expect(receipt.receipt.qr, 'el QR aparece al llegar el registro').toBe('https://aeat/qr');
  });

  it('sin módulo invoice instalado NO insiste (queryOptional → undefined)', async () => {
    let llamadas = 0;
    const el = await montarPorSaleId(async (name) => {
      if (name === 'invoice.by_source') llamadas += 1;
      return undefined; // módulo ausente (ADR-0127)
    });

    await new Promise((r) => setTimeout(r, 80));
    await el.updateComplete;
    expect(llamadas, 'módulo ausente = una sola consulta, sin reintentos').toBe(1);
  });

  it('the ticket header shows the legal name from the invoice snapshot (#32)', async () => {
    // The runtime resolves the issuer from hub_settings.business_legal_name (ADR-0061) onto the
    // invoice row; `invoice.by_source` already returns `issuer_name` — the viewer must use it
    // instead of printing the default header.
    const el = await montarPorSaleId(async (name) => {
      if (name === 'invoice.by_source') {
        return [{ id: 'inv1', number: 'F2-1', issuer_name: 'Manolo García SL', issuer_nif: 'B12345678' }];
      }
      if (name === 'verifactu.records.by_invoice') return [{ qr_url: 'https://aeat/qr', aeat_csv: '' }];
      return undefined;
    });

    await new Promise((r) => setTimeout(r, 80));
    await el.updateComplete;
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & { receipt: ReceiptData };
    expect(receipt.receipt.business.name).toBe('Manolo García SL');
    expect(receipt.receipt.business.tax_id).toBe('B12345678');
  });
});
