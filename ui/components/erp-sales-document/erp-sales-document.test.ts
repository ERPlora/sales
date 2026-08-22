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

// The paper, not the screen (sales#79). `printableHtml()` is what a browser prints; a thermal
// printer reads a STRUCTURED document instead, and reprinting used to send it nothing at all —
// the renderer reads by key, found none, and printed «ERPlora», no lines, TOTAL 0.00.
describe('printableDocument — what the thermal printer reads', () => {
  it('rebuilds the ticket from the sale: number, lines and totals in euros', async () => {
    const el = await montarVisor();
    const doc = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();

    expect(doc.receipt_id, 'the number the customer holds').toBe('TICKET-2026-000004');
    expect(doc.items, 'the key the ESC/POS renderer reads').toHaveLength(1);
    expect(doc.total, 'cents on the row, euros on the paper').toBe(3.6);
    expect(doc.payment_method).toBe('Efectivo');
    expect((doc as { lines?: unknown }).lines, 'not the screen shape').toBeUndefined();
  });

  it('is empty-safe: no sale loaded yet means nothing to print, not a blank ticket', async () => {
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document');
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect((el as unknown as { printableDocument(): unknown }).printableDocument()).toBeUndefined();
  });
});

// sales#120 — el papel del tique impreso sale en el idioma del hub. `printableHtml()` armaba el
// HTML con «Subtotal»/«TOTAL»/«Cambio» hardcoded en español; ahora las lleva traducidas (el
// visor ya tiene el traductor del catálogo). El test mira estructura (t() devuelve la clave),
// como el resto de este fichero.
describe('printableHtml — el papel lleva las labels traducidas (sales#120)', () => {
  it('las palabras del papel salen del catálogo, no de la plantilla', async () => {
    const el = await montarVisor();
    const html = (el as unknown as { printableHtml(): string }).printableHtml();
    // El fixture no lleva pago con cambio, así que la label que siempre está es la del subtotal
    // (y el TOTAL): con ellas basta para probar que la palabra ya no vive en la plantilla.
    expect(html).toContain('ui.docSubtotal');
    expect(html).toContain('ui.docTotal');
    expect(html).not.toContain('Cambio', 'la palabra suelta, hardcoded, ya no existe');
    expect(html).not.toContain('>Subtotal<', 'ni el Subtotal de la plantilla');
  });
});

// sales#28 — la unidad congelada de la línea (sales.lines la devuelve desde ADR-0147 §2.4) tiene
// que llegar HASTA el papel: el visor arma ambos documentos (HTML y térmico) desde el mismo mapper,
// así que aquí se fija el cableado entero — fila con `unit_code` → «1,5 kg» en los dos soportes.
describe('la unidad de la línea llega al papel (sales#28)', () => {
  async function montarVentaConKilo() {
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document');
    (el as unknown as Record<string, unknown>).sale = {
      id: 's-kg', sale_number: 'T-000125', total: 1800, created_at: '2026-08-20T10:00:00Z',
    };
    (el as unknown as Record<string, unknown>).lines = [{
      product_name: 'Tomate rosa',
      quantity: 1_500_000, // µ (ADR-0147) = 1,5 kg
      unit_price: 1200,
      line_total: 1800,
      unit_code: 'kg',
      unit_name: 'Kilogramo',
      pricing_unit_code: 'kg',
    }];
    (el as unknown as Record<string, unknown>).settings = {};
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  it('printableHtml: la línea del papel dice «1,5 kg × 12,00 € / kg»', async () => {
    const el = await montarVentaConKilo();
    const html = (el as unknown as { printableHtml(): string }).printableHtml();
    expect(html).toContain('1,5 kg × 12,00 € / kg');
    expect(html).not.toContain('1.5 ×', 'el punto inglés junto a la coma del dinero era el defecto');
  });

  it('printableDocument: la cantidad del térmico sale compuesta, «1,5 kg »', async () => {
    const el = await montarVentaConKilo();
    const doc = (el as unknown as { printableDocument(): { items: { quantity: number | string }[] } })
      .printableDocument();
    expect(doc.items[0].quantity).toBe('1,5 kg ');
  });
});

