// Contrato del VISOR del documento de venta (erp-sales-document).
//
// Del tiquet real del TPV (2026-07-16) salieron dos defectos de este componente:
//
// 1. SPANGLISH — ok-receipt/ok-invoice traen defaults en inglés («Receipt», «Change») y nadie les
//    pasaba `.labels`; junto a «Efectivo» quedaba mezcla de idiomas. El visor debe construirlas
//    desde el catálogo del módulo (ADR-0055) vía receiptLabels()/invoiceLabels().
// 2. BOTÓN IMPRIMIR FLOTANDO — vivía arriba-derecha, suelto sobre el documento. Se mueve al
//    ion-footer del modal anfitrión (document-modal.ts); el visor pinta SOLO el documento.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptData } from '@erplora/outfitkit';
import { installErploraDouble } from '../../test/erplora-double';

/** El doble del visor: sus tres lecturas propias, y la cadena fiscal AUSENTE salvo que un test la
 *  ponga en el hub — `invoice`/`verifactu` son apps opcionales (ADR-0127). */
function installDocDouble(
  queries: Record<string, unknown[] | ((params?: Record<string, unknown>) => unknown[] | Promise<unknown[]>)> = {},
  over: Partial<Parameters<typeof installErploraDouble>[0]> = {},
) {
  const FISCAL = ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'];
  return installErploraDouble({
    queries: { 'sales.get': [], 'sales.lines': [], 'sales.pos_settings.get': [], 'sales.business.get': [], ...queries },
    absent: FISCAL.filter((name) => !(name in queries)),
    locale: 'es',
    ...over,
  });
}

beforeEach(() => {
  // t() del doble compartido: devuelve la CLAVE — el test mira ESTRUCTURA, no idioma.
  installDocDouble();
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
    expect(receipt.receipt.total, 'céntimos tal cual (ADR-0400): la pantalla los corta, no los divide').toBe(360);
    expect(receipt.receipt.decimals).toBe(2);
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
    installDocDouble({
      'sales.get': [SALE],
      'sales.lines': [{ product_name: 'Cafe', quantity: 1, unit_price: 180, line_total: 180 }],
      'invoice.by_source': async () => (await queryOptional('invoice.by_source')) as unknown[],
      'invoice.lines': async () => (await queryOptional('invoice.lines')) as unknown[],
      'verifactu.records.by_invoice': async () => (await queryOptional('verifactu.records.by_invoice')) as unknown[],
    });
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

  // hub#1931 — the shell's automatic print at checkout calls `printableDocument()` with no
  // argument (hub `apps/web/src/lib/sale-document.ts`): that is the ORIGINAL and carries no mark.
  // Only a caller that says it is printing a copy gets «duplicado», on both papers.
  it('is the original by default and a duplicate only when asked (hub#1931)', async () => {
    const el = (await montarVisor()) as unknown as {
      printableDocument(o?: { duplicate?: boolean }): Record<string, unknown>;
      printableHtml(o?: { duplicate?: boolean }): string;
    };
    expect(el.printableDocument().duplicate, 'the automatic print is the original').toBeUndefined();
    expect(el.printableHtml()).not.toContain('ui.docDuplicate');
    expect(el.printableDocument({ duplicate: true }).duplicate).toBe(true);
    expect(el.printableHtml({ duplicate: true })).toContain('ui.docDuplicate');
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
    document.documentElement.lang = 'es'; // the paper formats with the document language (ADR-0400)
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

// sales#103 — «pide tu factura» (hub#963 / ADR-0363). Al resolver la F2 se ACUÑA el claim contra
// la puerta pública del hub (`POST /api/hub/public-claims`, sesión del cajero) y el papel gana su
// segundo QR. Las líneas del payload sellado salen de `invoice.lines`: el esquema de
// `invoice.substitute` las EXIGE y no se derivan server-side.
//
// Tolerancias no opcionales (ADR-0127): sin módulo invoice → sin claim y sin segundo QR, el tique
// sale exactamente como hoy. Un tique nacido F1 (con NIF) no tiene nada que canjear. Y acuñar es
// idempotente: una reimpresión NO dispara un segundo acuñamiento observable.
describe('claim «pide tu factura» — acuñar al resolver la F2 e imprimir el segundo QR (sales#103)', () => {
  const SALE = {
    id: 's1', sale_number: 'T-1', subtotal: 264, total: 288,
    payment_method_name: 'Efectivo', created_at: '2026-07-16T19:00:30Z',
  };
  const F2_LINES = [
    { id: 'li1', line_number: 1, description: 'Café solo', quantity: 2, unit_price: 120, tax_rate: 10,
      surcharge_rate: 0, tax_category_key: 'product.standard', base_amount: 240, tax_amount: 24,
      total_amount: 264, product_id: 'p-cafe' },
  ];

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = originalFetch;
  });

  /** Monta el visor por sale-id con las queries del SDK stubbeadas y el fetch de la puerta. */
  async function montarConF2(opts: {
    invoice?: Record<string, unknown> | undefined; // fila de invoice.by_source; undefined = módulo ausente
    fetchImpl?: unknown;
  }) {
    const fetchCalls: [string, RequestInit][] = [];
    // El fetch instalado SIEMPRE graba la llamada; `fetchImpl` decide la respuesta (defecto: la
    // puerta del hub contestando bien).
    (globalThis as { fetch?: unknown }).fetch = async (url: string, init: RequestInit) => {
      fetchCalls.push([url, init]);
      if (opts.fetchImpl) return (opts.fetchImpl as (u: string, i: RequestInit) => unknown)(url, init);
      return { ok: true, json: async () => ({ ok: true, locator: 'ABCD1234ABCD1234', url: '/p/ABCD1234ABCD1234' }) };
    };
    installDocDouble({
      'sales.get': [SALE],
      'sales.lines': [{ product_name: 'Cafe', quantity: 2, unit_price: 120, line_total: 240 }],
      // Absence (ADR-0127) is said by name here instead of inferred from an `undefined`.
      ...(opts.invoice ? { 'invoice.by_source': [opts.invoice] } : {}),
      'invoice.lines': F2_LINES,
      'verifactu.records.by_invoice': [{ qr_url: 'https://aeat/qr', aeat_csv: '' }],
    });
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & {
      fiscalRetryDelays: number[]; updateComplete: Promise<unknown>;
    };
    el.fiscalRetryDelays = [10];
    el.setAttribute('sale-id', 's1');
    document.body.appendChild(el);
    await el.updateComplete;
    return { el, fetchCalls };
  }

  it('F2 con invoice presente: acuña contra la puerta pública con el payload sellado correcto', async () => {
    const { el, fetchCalls } = await montarConF2({ invoice: { id: 'inv-42', number: 'F2-1', invoice_type: 'F2' } });

    await new Promise((r) => setTimeout(r, 60));
    await el.updateComplete;
    expect(fetchCalls, 'se llama a la puerta de acuñado').toHaveLength(1);
    const [url, init] = fetchCalls[0];
    expect(url).toBe('/api/hub/public-claims');
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'invoice_request',
      subject_id: 'inv-42',
      command: 'invoice.substitute',
      sealed_payload: {
        original_invoice_id: 'inv-42',
        items: F2_LINES, // las líneas de invoice.lines TAL CUAL, ya en céntimos
      },
      public_fields: ['customer_tax_id', 'customer_name', 'customer_address'],
    });
  });

  it('el papel gana los tres campos: QR absoluto, leyenda traducida y localizador en texto', async () => {
    const { el } = await montarConF2({ invoice: { id: 'inv-42', number: 'F2-1', invoice_type: 'F2' } });

    await new Promise((r) => setTimeout(r, 60));
    await el.updateComplete;
    const doc = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();
    expect(doc.claim_locator).toBe('ABCD1234ABCD1234');
    // La URL relativa del hub (/p/<locator>) se vuelve ABSOLUTA contra el origen del hub.
    expect(doc.claim_qr_data).toBe(`${globalThis.location.origin}/p/ABCD1234ABCD1234`);
    expect(doc.claim_note, 'la leyenda sale del catálogo (t() devuelve la clave aquí)').toBe('ui.claimNote');
    // El QR fiscal NO se toca: son DOS códigos con destinos distintos.
    expect(doc.qr_data).toBe('https://aeat/qr');

    const html = (el as unknown as { printableHtml(): string }).printableHtml();
    expect(html).toContain('ABCD1234ABCD1234');
    expect(html).toContain('ui.claimNote');
  });

  it('SIN módulo invoice: ni fetch ni claim_* — el documento es idéntico al de hoy (ADR-0127)', async () => {
    const { el, fetchCalls } = await montarConF2({ invoice: undefined });

    await new Promise((r) => setTimeout(r, 60));
    await el.updateComplete;
    expect(fetchCalls, 'sin módulo invoice no hay nada que acuñar').toHaveLength(0);
    const doc = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();
    expect(Object.keys(doc).filter((k) => k.startsWith('claim_'))).toEqual([]);
    expect(doc.qr_data).toBeUndefined(); // y sin QR fiscal, como siempre
  });

  it('un tique nacido F1 (con NIF) no tiene nada que canjear: no se acuña', async () => {
    const { el, fetchCalls } = await montarConF2({
      invoice: { id: 'inv-42', number: 'F1-1', invoice_type: 'F1', customer_tax_id: '12345678Z' },
    });

    await new Promise((r) => setTimeout(r, 60));
    await el.updateComplete;
    expect(fetchCalls).toHaveLength(0);
    const doc = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();
    expect(Object.keys(doc).filter((k) => k.startsWith('claim_'))).toEqual([]);
  });

  it('reimpresión idempotente: el claim se acuñó UNA vez y la copia lleva el MISMO localizador', async () => {
    const { el, fetchCalls } = await montarConF2({ invoice: { id: 'inv-42', number: 'F2-1', invoice_type: 'F2' } });

    await new Promise((r) => setTimeout(r, 60));
    const primero = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();
    // El cliente del mostrador vuelve a pedir su copia (reimpresión): mismo papel, mismo locator.
    const segunda = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();
    const tercera = (el as unknown as { printableHtml(): string }).printableHtml();

    expect(fetchCalls, 'un solo acuñamiento observable (el hub además es idempotente por (kind, subject_id))').toHaveLength(1);
    expect(primero.claim_locator).toBe('ABCD1234ABCD1234');
    expect(segunda.claim_locator).toBe(primero.claim_locator);
    expect(tercera).toContain('ABCD1234ABCD1234');
  });

  it('si acuñar falla (puerta caída, sin permiso invoice.add_invoice…) el tique sale como hoy', async () => {
    const { el, fetchCalls } = await montarConF2({
      invoice: { id: 'inv-42', number: 'F2-1', invoice_type: 'F2' },
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    });

    await new Promise((r) => setTimeout(r, 60));
    await el.updateComplete;
    // Se INTENTÓ acuñar (≥1; el reintento best-effort de printableDocument puede sumar otro).
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const doc = (el as unknown as { printableDocument(): Record<string, unknown> }).printableDocument();
    expect(Object.keys(doc).filter((k) => k.startsWith('claim_'))).toEqual([]);
    expect(doc.qr_data).toBe('https://aeat/qr', 'el QR fiscal sigue en su sitio');
  });
});

// sales#148 — REIMPRIMIR un tique con suplementos. Es el otro extremo del cable: la fila de
// `sales.lines` trae el snapshot que congeló el cobro (`sales_sale_item.modifiers`) y el visor arma
// los DOS papeles desde el mismo mapper, así que aquí se fija que sobrevive a la reimpresión —
// uno de los cuatro casos que la issue exige (dividir, transferir, reabrir, REIMPRIMIR).
describe('los suplementos sobreviven a la REIMPRESIÓN del tique (sales#148)', () => {
  async function montarVentaConSuplementos() {
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document');
    (el as unknown as Record<string, unknown>).sale = {
      id: 's-mod', sale_number: 'T-000126', total: 1000, created_at: '2026-08-20T10:00:00Z',
    };
    (el as unknown as Record<string, unknown>).lines = [{
      product_name: 'Hamburguesa',
      quantity: 1_000_000,
      unit_price: 1000, // el delta del queso YA está dentro (authoritative_modifiers)
      line_total: 1000,
      // Tal cual lo devuelve la columna: TEXT con el snapshot en el orden de elección.
      modifiers: JSON.stringify([
        { option_id: 'o-queso', group_id: 'g1', name: 'Extra queso', kitchen_name: '+QUESO', price_delta: 100 },
        { option_id: 'o-sin-cebolla', group_id: 'g2', name: 'Sin cebolla', kitchen_name: 'SIN CEB.', price_delta: 0 },
      ]),
    }];
    (el as unknown as Record<string, unknown>).settings = {};
    document.body.appendChild(el);
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    return el;
  }

  it('printableHtml: cada suplemento en su renglón sangrado, con el nombre COMERCIAL', async () => {
    const el = await montarVentaConSuplementos();
    const html = (el as unknown as { printableHtml(): string }).printableHtml();
    expect(html).toContain('Extra queso');
    expect(html).toContain('Sin cebolla');
    expect(html).toContain('class="mod"');
    expect(html, 'lo que se grita en el pase no es lo que lee el cliente').not.toContain('+QUESO');
    expect(html.indexOf('Extra queso'), 'en el orden en que se eligieron').toBeLessThan(html.indexOf('Sin cebolla'));
  });

  it('printableDocument: el térmico los lleva en `notes`, la sub-línea que ya indenta', async () => {
    const el = await montarVentaConSuplementos();
    const doc = (el as unknown as { printableDocument(): { items: { notes?: string; total: number }[] } })
      .printableDocument();
    expect(doc.items[0].notes).toBe('Extra queso · Sin cebolla');
    expect(doc.items[0].total, 'el importe es el de la línea, con el suplemento ya dentro').toBe(10);
  });
});

// sales#181 — el PAPEL con el nombre de fábrica. El seed siembra «Cash»/«Card» en inglés canónico
// (ADR-0055) y el handler guarda ESE nombre en la fila de la venta, así que el tiquet y la factura
// del historial arrancan del dato en inglés. Los tests de este visor montaban con
// `payment_method_name: 'Efectivo'` — el caso ya traducido—, de modo que nadie vigilaba que el
// visor siga pasando el traductor al mapper: quitar ese argumento habría dejado «Cash» impreso en
// un tique español sin romper un solo test.
describe('the paper translates the factory payment method (sales#181)', () => {
  const esCatalog = { ui: { cash: 'Efectivo', card: 'Tarjeta' } };

  async function mountWithMethod(name: string, format?: 'ticket' | 'invoice') {
    installDocDouble({}, {
      // El catálogo REAL (no la clave): lo que se mide es el idioma que sale impreso.
      t: (_catalog: Record<string, unknown>, key: string) =>
        key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog) as string ?? key,
    });
    document.body.innerHTML = '';
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & {
      sale: unknown; lines: unknown; settings: unknown; format?: 'ticket' | 'invoice';
      updateComplete: Promise<unknown>;
    };
    el.sale = {
      id: 's1', sale_number: 'T-42', subtotal: 327, tax_amount: 33, total: 360,
      payment_method_name: name, created_at: '2026-08-25T10:00:00Z',
    };
    el.lines = [{ product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 }];
    el.settings = {};
    if (format) el.format = format;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  it('prints «Efectivo» on the receipt for a row that stores «Cash»', async () => {
    const el = await mountWithMethod('Cash');
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & { receipt: ReceiptData };
    expect(receipt.receipt.payment?.method).toBe('Efectivo');
  });

  it('prints «Tarjeta» on the A4 invoice for a row that stores «Card»', async () => {
    const el = await mountWithMethod('Card', 'invoice');
    const invoice = el.shadowRoot!.querySelector('ok-invoice') as HTMLElement & {
      invoice: { payment_method?: string };
    };
    expect(invoice, 'con format=invoice el visor pinta la factura').toBeTruthy();
    expect(invoice.invoice.payment_method).toBe('Tarjeta');
  });

  it('a name the owner typed is printed verbatim, never guessed at', async () => {
    const el = await mountWithMethod('BBVA TPV');
    const receipt = el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & { receipt: ReceiptData };
    expect(receipt.receipt.payment?.method).toBe('BBVA TPV');
  });
});

// sales#274 — the ticket the cashier turns towards the customer, the instant it is charged.
//
// `complete_sale` answers, the till opens this viewer, and the invoice its number comes from is
// still being written by the Outbox a few milliseconds later. Until it landed, the paper on screen
// headed itself with the GENERIC default name and stamped the sale's own internal number; seconds
// later the same ticket, reopened, said the shop's legal name and the real document number. The
// customer reading over the counter saw a business that does not exist and a number that is not
// theirs.
//
// The datum was never missing: the hub holds it in `hub_settings` (ADR-0061) and `sales.business.get`
// hands it to any cashier (sales#180) — the viewer just never asked. And the number nobody knows
// yet is not painted at all: an empty line the real number drops into beats a wrong one.
describe('la cabecera del tique NO espera a la factura (sales#274)', () => {
  const SALE = {
    id: 's1', sale_number: '20260909-0001', subtotal: 2471, tax_amount: 519, total: 2990,
    payment_method_name: 'Efectivo', created_at: '2026-09-09T18:00:00Z',
  };
  const BUSINESS = [{ name: 'Salon Aurora SL', tax_id: '12345678Z' }];

  // sales#302 — THE TEST HOLDS THE CLOCK, not the machine.
  //
  // What this block watches is a WAIT: the screen leaves the number blank while the Outbox writes
  // the invoice, and falls back to the sale's own number only once the backoff runs out. Measuring
  // that wait against the machine's clock — four `setTimeout(0)` turns racing a 10 ms backoff —
  // made the result depend on how busy the server was: the SAME commit came out `failure` on run
  // 34627541079 and `success` when that very run was re-launched untouched. With the clock faked,
  // the backoff only runs when the test runs it, and a slow runner is exactly as green as a fast
  // one.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The double this test installed: its `reads` are the STATE the waits below wait for. */
  let sdkDouble: ReturnType<typeof installDocDouble>;

  /** How many times the viewer has asked the invoicing module about this sale. It is the observable
   *  state everything in this block depends on: 1 = the opening question (the instant the customer
   *  sees); more than 1 = the backoff has already run. */
  const invoiceLookups = () => sdkDouble.reads.filter((r) => r.name === 'invoice.by_source').length;

  /** Monta el visor por `sale-id` con la cadena fiscal bajo control del test. */
  async function montar(opts: {
    invoiceBySource: (call: number) => unknown[] | undefined;
    business?: unknown[];
    /** sales#303 — the A4 half of this same wait: `format="invoice"` paints `<ok-invoice>`. */
    format?: 'ticket' | 'invoice';
  }) {
    let calls = 0;
    sdkDouble = installDocDouble({
      'sales.get': [SALE],
      'sales.lines': [{ product_name: 'Corte', quantity: 1, unit_price: 2990, line_total: 2990 }],
      'sales.business.get': opts.business ?? BUSINESS,
      'invoice.by_source': () => {
        calls += 1;
        return (opts.invoiceBySource(calls) ?? []) as unknown[];
      },
      'invoice.lines': [],
      'verifactu.records.by_invoice': [],
    });
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & {
      fiscalRetryDelays: number[]; format?: 'ticket' | 'invoice'; updateComplete: Promise<unknown>;
    };
    el.fiscalRetryDelays = [10, 10];
    if (opts.format) el.format = opts.format;
    el.setAttribute('sale-id', 's1');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  /**
   * Lets the load finish (`sales.get` + `sales.lines` + settings + identity) WITHOUT giving the
   * Outbox retries any room: exactly the first paint the customer sees.
   *
   * sales#302 — it waits for a STATE, not for a number of paints. The state is «the invoicing
   * module has been asked, and has not been asked again yet»: everything that does NOT depend on
   * the clock is let through (`advanceTimersByTimeAsync(0)` drains the viewer's promise chain
   * without moving the backoff a single millisecond) and then the state is asserted. This used to
   * be four `setTimeout(0)` turns, which DO hand the turn over to the timer queue: on a busy runner
   * those four turns outlasted the 10 ms backoff, the retries ran out INSIDE the wait and the
   * viewer fell back to its own number — the test went red with nobody having touched the viewer.
   */
  async function firstPaint(el: HTMLElement & { updateComplete: Promise<unknown> }) {
    for (let turn = 0; turn < 50 && invoiceLookups() < 1; turn += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    await el.updateComplete;
    expect(invoiceLookups(), 'the first paint asks about the invoice ONCE: any more and the backoff '
      + 'has already run, so this is not the instant the test claims to be looking at').toBe(1);
  }

  const paper = (el: HTMLElement) =>
    (el.shadowRoot!.querySelector('ok-receipt') as HTMLElement & { receipt: ReceiptData }).receipt;

  it('el PRIMER pintado ya lleva la razón social y el NIF del negocio', async () => {
    // La factura no ha llegado (Outbox en curso): es exactamente el instante que ve la clienta.
    const el = await montar({ invoiceBySource: () => [] });
    await firstPaint(el);
    expect(paper(el).business.name, 'nunca el nombre de relleno').toBe('Salon Aurora SL');
    expect(paper(el).business.tax_id).toBe('12345678Z');
  });

  it('mientras la factura no llega, NO enseña un número provisional', async () => {
    const el = await montar({ invoiceBySource: () => [] });
    await firstPaint(el);
    expect(paper(el).number, 'el número de la venta es interno: no se enseña como el del documento')
      .toBeUndefined();
  });

  it('en cuanto la factura llega, el número que sale es el SUYO', async () => {
    const el = await montar({
      invoiceBySource: (call) => (call < 2 ? [] : [{ id: 'inv1', number: 'TICKET-2026-000001', issuer_name: 'Salon Aurora SL', issuer_nif: '12345678Z' }]),
    });
    // The test winds the backoff forward: the invoice lands on the first retry (10 ms), and no
    // slow machine can either bring that forward or swallow it.
    await vi.advanceTimersByTimeAsync(80);
    await el.updateComplete;
    expect(invoiceLookups(), 'the second lookup is the one that brings the invoice').toBeGreaterThan(1);
    expect(paper(el).number).toBe('TICKET-2026-000001');
  });

  it('si la factura NO llega nunca, el tique cae al número de la venta antes que quedarse mudo', async () => {
    const el = await montar({ invoiceBySource: () => [] });
    await vi.advanceTimersByTimeAsync(120); // burns the retries through: 0 + 10 + 10
    await el.updateComplete;
    expect(invoiceLookups(), 'the whole budget: the opening lookup and the two retries').toBe(3);
    expect(paper(el).number, 'agotado el Outbox, el identificador honesto es el de la venta')
      .toBe('20260909-0001');
  });

  it('sin módulo invoice el número es el de la venta DESDE EL PRIMER PINTADO', async () => {
    // ADR-0127: un hub puede cobrar sin facturación. Ahí `sale_number` ES el número del tique y no
    // hay nada que esperar — no se le puede quitar la línea al que no tiene otra.
    sdkDouble = installDocDouble({
      'sales.get': [SALE],
      'sales.lines': [{ product_name: 'Corte', quantity: 1, unit_price: 2990, line_total: 2990 }],
      'sales.business.get': BUSINESS,
    });
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & { updateComplete: Promise<unknown> };
    el.setAttribute('sale-id', 's1');
    document.body.appendChild(el);
    await firstPaint(el);
    expect(paper(el).number).toBe('20260909-0001');
  });

  it('un `receipt_header` deliberado sigue mandando sobre la razón social', async () => {
    sdkDouble = installDocDouble({
      'sales.get': [SALE],
      'sales.lines': [{ product_name: 'Corte', quantity: 1, unit_price: 2990, line_total: 2990 }],
      'sales.pos_settings.get': [{ receipt_header: 'AURORA\nCalle Mayor 1' }],
      'sales.business.get': BUSINESS,
    });
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & { updateComplete: Promise<unknown> };
    el.setAttribute('sale-id', 's1');
    document.body.appendChild(el);
    await firstPaint(el);
    expect(paper(el).business.name).toBe('AURORA');
    expect(paper(el).business.tax_id, 'el NIF no es branding: sale igual').toBe('12345678Z');
  });

  it('el PAPEL, en cambio, sí se imprime con el número de la venta mientras se espera', async () => {
    // La copia impresa no se actualiza sola: entre un identificador y ninguno, el suyo.
    const el = await montar({ invoiceBySource: () => [] }) as HTMLElement & {
      updateComplete: Promise<unknown>; printableDocument(): { receipt_id?: string; business_name?: string; vat_number?: string } | undefined;
    };
    await firstPaint(el);
    expect(paper(el).number, 'la pantalla sigue esperando').toBeUndefined();
    const doc = el.printableDocument()!;
    expect(doc.receipt_id).toBe('20260909-0001');
    expect(doc.business_name).toBe('Salon Aurora SL');
    expect(doc.vat_number).toBe('12345678Z');
  });

  it('si `sales.business.get` no contesta, el visor sigue pintando el tique', async () => {
    // Un hub sin identidad guardada todavía: el documento no puede depender de ella para existir.
    const el = await montar({ invoiceBySource: () => [], business: [] });
    await firstPaint(el);
    expect(paper(el).business.name).toBe('ui.docDefaultBusiness');
  });

  it('the printable HTML (browser / PDF) does not inherit the blank of the screen either', async () => {
    // `printableHtml()` is the OTHER paper (iframe print, PDF from Rust): same rule as ESC/POS.
    const el = await montar({ invoiceBySource: () => [] }) as HTMLElement & {
      updateComplete: Promise<unknown>; printableHtml(): string;
    };
    await firstPaint(el);
    expect(paper(el).number, 'the screen is still waiting').toBeUndefined();
    expect(el.printableHtml()).toContain('20260909-0001');
  });

  // sales#303 — THE SAME WAIT, SEEN ON THE A4, which is where it was left unwatched.
  //
  // Everything above watches the ticket. The formal invoice comes out of this very viewer — the
  // till hands it `format="invoice"` and `render()` paints `<ok-invoice>` off `saleToInvoice`
  // instead of `<ok-receipt>` — and its far end had no guard at all: the fall could be deleted from
  // the mapper and the module's 116 suites stayed green. The ticket can afford a blank line while
  // it waits; an invoice that ends the wait with NO number is a document nobody can claim, search
  // or match to a payment, and the customer is holding the only copy.
  describe('and the A4 invoice walks that same wait (sales#303)', () => {
    const a4 = (el: HTMLElement) =>
      (el.shadowRoot!.querySelector('ok-invoice') as HTMLElement & { invoice: { number?: string } }).invoice;

    it('while the invoice is still being written, the A4 shows no provisional number either', async () => {
      const el = await montar({ invoiceBySource: () => [], format: 'invoice' });
      await firstPaint(el);
      expect(a4(el).number, 'ok-invoice demands the key: blank while waiting, never the internal number')
        .toBe('');
    });

    it('if the invoice never lands, the A4 falls back to the sale number rather than none', async () => {
      const el = await montar({ invoiceBySource: () => [], format: 'invoice' });
      await vi.advanceTimersByTimeAsync(120); // burns the retries through: 0 + 10 + 10
      await el.updateComplete;
      expect(invoiceLookups(), 'the whole budget: the opening lookup and the two retries').toBe(3);
      expect(a4(el).number, 'the Outbox gave up: the honest identifier is the sale\u2019s own')
        .toBe('20260909-0001');
    });

    it('the moment the invoice lands, the number the A4 carries is its OWN', async () => {
      const el = await montar({
        invoiceBySource: (call) => (call < 2 ? [] : [{ id: 'inv1', number: 'F1-2026-7', issuer_name: 'Salon Aurora SL', issuer_nif: '12345678Z' }]),
        format: 'invoice',
      });
      // The test winds the backoff forward: the invoice lands on the first retry (10 ms).
      await vi.advanceTimersByTimeAsync(80);
      await el.updateComplete;
      expect(invoiceLookups(), 'the second lookup is the one that brings the invoice').toBeGreaterThan(1);
      expect(a4(el).number).toBe('F1-2026-7');
    });
  });
});

// sales#308 — RIGHT AFTER A CHARGE, THE TICKET WAITS UNTIL IT IS COMPLETE.
//
// Measured on banco-pre (PRE, 2026-09-13) with a real own certificate: the ticket popped up at once
// with no number, the number arrived ~3 s later, and the VeriFactu QR never did — although the AEAT
// had accepted the record two seconds after the charge. The record is written by the same command
// that files it with the AEAT, so it becomes visible ~5 s after the charge, and the viewer had given
// up at ~3 s. Ioan's call: while the document is being issued, a LOADER; then the FINAL ticket, with
// its number and its QR, in one go.
//
// Only right after a charge (`issuing`): the same viewer opens old tickets from the sales list, and a
// reprint must never sit behind a loader waiting for a record that may never exist.
describe('recién cobrado, el tique espera a estar completo (sales#308)', () => {
  const SALE = {
    id: 's1', sale_number: '20260913-0001', subtotal: 124, tax_amount: 26, total: 150,
    payment_method_name: 'Efectivo', created_at: '2026-09-13T08:21:18Z',
  };
  const INVOICE = { id: 'inv1', number: 'TICKET-2026-000011', invoice_type: 'F2', issuer_name: 'ERPlora Demo SL', issuer_nif: 'B27593136' };
  const RECORD = { qr_url: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B27593136&numserie=TICKET-2026-000011', aeat_csv: 'A-TK2BTBN826CP83' };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T08:21:18Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  let sdkDouble: ReturnType<typeof installDocDouble>;
  const lookups = (name: string) => sdkDouble.reads.filter((r) => r.name === name).length;

  /** Mounts the viewer the way the till does right after charging. `invoiceAt`/`recordAt` are the ms
   *  after the charge at which each one becomes readable (`Infinity` = never). */
  async function montar(opts: { invoiceAt: number; recordAt: number; issuing?: boolean; format?: 'ticket' | 'invoice'; keepDefaults?: boolean }) {
    const start = Date.now();
    sdkDouble = installDocDouble({
      'sales.get': [SALE],
      'sales.lines': [{ product_name: 'Agua mineral 50cl', quantity: 1, unit_price: 150, line_total: 150 }],
      'sales.business.get': [{ name: 'ERPlora Demo SL', tax_id: 'B27593136' }],
      'invoice.by_source': () => (Date.now() - start >= opts.invoiceAt ? [INVOICE] : []),
      'invoice.lines': [],
      'verifactu.records.by_invoice': () => (Date.now() - start >= opts.recordAt ? [RECORD] : []),
    });
    await import('./erp-sales-document');
    const el = document.createElement('erp-sales-document') as HTMLElement & {
      issuing: boolean; fiscalRetryDelays: number[]; format?: 'ticket' | 'invoice'; updateComplete: Promise<unknown>;
    };
    el.issuing = opts.issuing ?? true;
    if (opts.format) el.format = opts.format;
    el.setAttribute('sale-id', 's1');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  /** Lets every read that does NOT depend on the clock settle, without moving the clock. */
  async function settle(el: HTMLElement & { updateComplete: Promise<unknown> }) {
    for (let turn = 0; turn < 50 && lookups('invoice.by_source') < 1; turn += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    for (let turn = 0; turn < 10; turn += 1) await vi.advanceTimersByTimeAsync(0);
    await el.updateComplete;
  }

  const receipt = (el: HTMLElement) =>
    (el.shadowRoot!.querySelector('ok-receipt') as (HTMLElement & { receipt: ReceiptData }) | null)?.receipt;
  const issuingNotice = (el: HTMLElement) => el.shadowRoot!.querySelector('[data-testid="doc-issuing"]');

  it('mientras la factura o su registro fiscal no han llegado, se ve la carga y NO un tique a medias', async () => {
    const el = await montar({ invoiceAt: 1500, recordAt: 5000 });
    await settle(el);
    expect(issuingNotice(el), 'a loader says the ticket is being issued').toBeTruthy();
    expect(issuingNotice(el)!.textContent, 'in the hub language, through the catalogue').toContain('ui.issuingReceipt');
    expect(receipt(el), 'no half-built ticket on screen').toBeUndefined();

    await vi.advanceTimersByTimeAsync(2500); // the invoice is there, the record is not yet
    await el.updateComplete;
    expect(receipt(el), 'the number alone is still a half-built ticket').toBeUndefined();
  });

  it('el caso de banco-pre: el registro llega a los ~5 s y el tique FINAL sale de una vez, con número y QR', async () => {
    // Default backoff on purpose: the bug lived in the default (~3 s of retries).
    const el = await montar({ invoiceAt: 2800, recordAt: 5200 });
    await settle(el);
    await vi.advanceTimersByTimeAsync(9000);
    await el.updateComplete;
    expect(issuingNotice(el), 'the loader is gone once the document is complete').toBeNull();
    expect(receipt(el)?.number).toBe('TICKET-2026-000011');
    expect(receipt(el)?.qr, 'the VeriFactu QR is on the ticket').toBe(RECORD.qr_url);
  });

  it('si Hacienda tarda más que la espera, el tique sale con su número y el QR se completa solo al llegar', async () => {
    const el = await montar({ invoiceAt: 1000, recordAt: 18000 });
    await settle(el);
    await vi.advanceTimersByTimeAsync(11000); // past the wait
    await el.updateComplete;
    expect(issuingNotice(el), 'a till is never left behind a loader').toBeNull();
    expect(receipt(el)?.number).toBe('TICKET-2026-000011');
    expect(receipt(el)?.qr, 'no QR yet: the AEAT has not answered').toBeUndefined();

    await vi.advanceTimersByTimeAsync(20000); // the record lands, the viewer is still watching
    await el.updateComplete;
    expect(receipt(el)?.qr, 'the QR completes the ticket on its own').toBe(RECORD.qr_url);
  });

  it('si la factura no llega en toda la espera, el tique sale con el número de la venta (sales#274) y la identidad del negocio', async () => {
    const el = await montar({ invoiceAt: Infinity, recordAt: Infinity });
    await settle(el);
    await vi.advanceTimersByTimeAsync(11000);
    await el.updateComplete;
    expect(issuingNotice(el)).toBeNull();
    expect(receipt(el)?.number, 'the honest identifier once the wait is over').toBe('20260913-0001');
    expect(receipt(el)?.business.name, 'never the filler name').toBe('ERPlora Demo SL');
  });

  it('abierto desde la lista de ventas (no recién cobrado) NO hay carga: el tique se pinta como siempre', async () => {
    const el = await montar({ invoiceAt: Infinity, recordAt: Infinity, issuing: false });
    await settle(el);
    expect(issuingNotice(el), 'a reprint never waits behind a loader').toBeNull();
    expect(receipt(el), 'the ticket is painted at once').toBeTruthy();
  });

  it('la factura A4 recién emitida dice que se está emitiendo la FACTURA', async () => {
    const el = await montar({ invoiceAt: 1500, recordAt: 5000, format: 'invoice' });
    await settle(el);
    expect(issuingNotice(el)!.textContent).toContain('ui.issuingInvoice');
    expect(el.shadowRoot!.querySelector('ok-invoice'), 'no half-built invoice either').toBeNull();
  });

  // hub#1867 — the paper printed on its own at checkout is composed by this viewer, mounted hidden by
  // the hub shell. It has no screen to watch, so it needs to be TOLD when the just-charged wait is
  // over: before, it took the first document the viewer answered — the sale's own number and no QR —
  // while the screen was still showing «Issuing the ticket…».
  describe('issued(): when the paper printed at checkout can ask for its document (hub#1867)', () => {
    type Viewer = HTMLElement & {
      updateComplete: Promise<unknown>;
      issued(): Promise<boolean>;
      printableDocument(): Record<string, unknown> | undefined;
    };

    /** Whether `p` has settled, read without moving the clock. */
    async function settledValue<T>(p: Promise<T>): Promise<{ done: boolean; value?: T }> {
      let out: { done: boolean; value?: T } = { done: false };
      void p.then((value) => { out = { done: true, value }; });
      await vi.advanceTimersByTimeAsync(0);
      return out;
    }

    it('banco-pre timing: it waits for the VeriFactu record and the document then carries the invoice number and the QR', async () => {
      const el = (await montar({ invoiceAt: 2800, recordAt: 5200 })) as Viewer;
      const issued = el.issued();
      await settle(el);
      await vi.advanceTimersByTimeAsync(4000); // the invoice is there, its record is not
      expect((await settledValue(issued)).done, 'no paper while the record is still being filed').toBe(false);

      await vi.advanceTimersByTimeAsync(5000);
      expect(await settledValue(issued), 'complete: the QR arrived').toEqual({ done: true, value: true });
      const paper = el.printableDocument()!;
      expect(paper.receipt_id, 'the simplified invoice number, not the sale number').toBe('TICKET-2026-000011');
      expect(paper.qr_data, 'the AEAT QR').toBe(RECORD.qr_url);
    });

    it('a slow AEAT: at the 10 s ceiling it answers false, and the document carries the invoice number without a QR', async () => {
      const el = (await montar({ invoiceAt: 1000, recordAt: 18000 })) as Viewer;
      const issued = el.issued();
      await settle(el);
      await vi.advanceTimersByTimeAsync(9000);
      expect((await settledValue(issued)).done, 'still inside the wait').toBe(false);

      await vi.advanceTimersByTimeAsync(2000);
      expect(await settledValue(issued), 'the ceiling ends the wait, incomplete').toEqual({ done: true, value: false });
      const paper = el.printableDocument()!;
      expect(paper.receipt_id).toBe('TICKET-2026-000011');
      expect(paper.qr_data, 'no QR yet').toBeUndefined();
    });

    it('a record that lands late in the wait (7 s) still reaches the paper: one last look at the ceiling', async () => {
      // The retry cadence looks at 0 / 0.4 / 1.3 / 3.1 / 6.1 / 11.1 s and the ceiling is 10 s: a record
      // readable at 7 s used to be missed for the whole 6.1–10 s stretch and the paper went out without
      // its QR, with the QR sitting there for three seconds (review of hub#1867).
      const el = (await montar({ invoiceAt: 1000, recordAt: 7000 })) as Viewer;
      const issued = el.issued();
      await settle(el);
      await vi.advanceTimersByTimeAsync(10500);
      expect(await settledValue(issued), 'complete, inside the wait').toEqual({ done: true, value: true });
      expect(el.printableDocument()!.qr_data).toBe(RECORD.qr_url);
      await el.updateComplete;
      expect(receipt(el)?.qr, 'and the screen shows the same QR').toBe(RECORD.qr_url);
    });

    it('a last look that hangs at the ceiling does not keep the till waiting', async () => {
      const start = Date.now();
      sdkDouble = installDocDouble({
        'sales.get': [SALE],
        'sales.lines': [{ product_name: 'Agua mineral 50cl', quantity: 1, unit_price: 150, line_total: 150 }],
        'sales.business.get': [{ name: 'ERPlora Demo SL', tax_id: 'B27593136' }],
        'invoice.by_source': [INVOICE],
        'invoice.lines': [],
        // Nothing before the ceiling; from then on the lookup never answers.
        'verifactu.records.by_invoice': () => (Date.now() - start >= 9000 ? new Promise<unknown[]>(() => {}) : []),
      });
      await import('./erp-sales-document');
      const el = document.createElement('erp-sales-document') as Viewer & { issuing: boolean };
      el.issuing = true;
      el.setAttribute('sale-id', 's1');
      document.body.appendChild(el);
      const issued = el.issued();
      await settle(el);
      await vi.advanceTimersByTimeAsync(10000);
      expect((await settledValue(issued)).done, 'the last look is still out').toBe(false);
      await vi.advanceTimersByTimeAsync(1600);
      expect(await settledValue(issued), 'bounded: the wait ends incomplete').toEqual({ done: true, value: false });
      expect(el.printableDocument()!.receipt_id).toBe('TICKET-2026-000011');
    });

    it('with no invoicing app there is nothing to wait for: it answers true at once with the sale number', async () => {
      sdkDouble = installDocDouble({
        'sales.get': [SALE],
        'sales.lines': [{ product_name: 'Agua mineral 50cl', quantity: 1, unit_price: 150, line_total: 150 }],
      });
      await import('./erp-sales-document');
      const el = document.createElement('erp-sales-document') as Viewer & { issuing: boolean };
      el.issuing = true;
      el.setAttribute('sale-id', 's1');
      document.body.appendChild(el);
      const issued = el.issued();
      for (let turn = 0; turn < 20; turn += 1) await vi.advanceTimersByTimeAsync(0);
      expect(await settledValue(issued), 'no wait at all').toEqual({ done: true, value: true });
      expect(el.printableDocument()!.receipt_id).toBe('20260913-0001');
    });

    it('asked before the viewer is even in the document, it still answers once the wait is over', async () => {
      await montar({ invoiceAt: 0, recordAt: 0 }); // warms the element definition and the double
      document.body.innerHTML = '';
      const el = document.createElement('erp-sales-document') as Viewer & { issuing: boolean };
      el.issuing = true;
      const issued = el.issued(); // what the hub does: it may ask before connecting the viewer
      el.setAttribute('sale-id', 's1');
      document.body.appendChild(el);
      for (let turn = 0; turn < 30; turn += 1) await vi.advanceTimersByTimeAsync(0);
      expect(await settledValue(issued)).toEqual({ done: true, value: true });
      expect(el.printableDocument()!.qr_data).toBe(RECORD.qr_url);
    });

    it('a reprint (not just charged) never waits: it answers as soon as the sale is loaded', async () => {
      const el = (await montar({ invoiceAt: Infinity, recordAt: Infinity, issuing: false })) as Viewer;
      const issued = el.issued();
      await settle(el);
      expect(await settledValue(issued)).toEqual({ done: true, value: true });
    });

    it('a sale that fails to load answers false instead of leaving the caller waiting', async () => {
      sdkDouble = installDocDouble({}, { failing: { 'sales.get': 'internal_error' } });
      await import('./erp-sales-document');
      const el = document.createElement('erp-sales-document') as Viewer & { issuing: boolean };
      el.issuing = true;
      el.setAttribute('sale-id', 's1');
      document.body.appendChild(el);
      const issued = el.issued();
      for (let turn = 0; turn < 20; turn += 1) await vi.advanceTimersByTimeAsync(0);
      expect(await settledValue(issued)).toEqual({ done: true, value: false });
      expect(el.printableDocument(), 'nothing to print').toBeUndefined();
    });

    it('a viewer removed before the wait is over answers false instead of hanging', async () => {
      const el = (await montar({ invoiceAt: Infinity, recordAt: Infinity })) as Viewer;
      const issued = el.issued();
      await settle(el);
      el.remove();
      await vi.advanceTimersByTimeAsync(0);
      expect(await settledValue(issued)).toEqual({ done: true, value: false });
    });
  });
});
