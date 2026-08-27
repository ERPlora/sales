// Contrato del VISOR del documento de venta (erp-sales-document).
//
// Del tiquet real del TPV (2026-07-16) salieron dos defectos de este componente:
//
// 1. SPANGLISH — ok-receipt/ok-invoice traen defaults en inglés («Receipt», «Change») y nadie les
//    pasaba `.labels`; junto a «Efectivo» quedaba mezcla de idiomas. El visor debe construirlas
//    desde el catálogo del módulo (ADR-0055) vía receiptLabels()/invoiceLabels().
// 2. BOTÓN IMPRIMIR FLOTANDO — vivía arriba-derecha, suelto sobre el documento. Se mueve al
//    ion-footer del modal anfitrión (document-modal.ts); el visor pinta SOLO el documento.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    queries: { 'sales.get': [], 'sales.lines': [], 'sales.pos_settings.get': [], ...queries },
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
