// Contrato del modal COMPARTIDO del documento de venta (renderDocumentModal).
//
// touch, desktop y lista pintaban el mismo modal triplicado y feo (título «Documento» inútil,
// IMPRIMIR flotando arriba-derecha, tiquet perdido en un modal enorme). El helper único fija:
// sin título, X de cerrar accesible, documento en el content, IMPRIMIR en un ion-footer abajo.
// (El contrato de integración en el TPV vive en erp-pos-touch.test.ts.)
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'lit';
import { renderDocumentModal } from './document-modal.js';
import { installPosDouble } from '../test/pos-double';

beforeEach(() => {
  document.body.innerHTML = '';
  // erp-sales-document (importado por el helper) llama al SDK al montarse.
  // The modal resolves sale → lines → the fiscal chain; `invoice`/`verifactu` are optional apps
  // and this hub does not have them, which is the `undefined` the screen degrades on (ADR-0127).
  installPosDouble({ locale: 'es' });
});

function montar(saleId?: string, onClose: () => void = () => {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(renderDocumentModal({ saleId, onClose, t: (k) => k }), host);
  return host.querySelector('ion-modal.doc-modal')!;
}

describe('renderDocumentModal', () => {
  // sales#308 — only the till knows the document was JUST charged: it hands that to the viewer, which
  // waits behind a loader until the ticket is complete. A reprint from the sales list must not wait.
  it('recién cobrado, le dice al visor que el documento se está emitiendo (issuing)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(renderDocumentModal({ saleId: 'venta-1', issuing: true, onClose: () => {}, t: (k) => k }), host);
    const doc = host.querySelector('erp-sales-document') as HTMLElement & { issuing?: boolean };
    expect(doc.issuing, 'the viewer knows it was just charged').toBe(true);
  });

  it('sin issuing (reimpresión desde la lista) el visor no espera', () => {
    const modal = montar('venta-1');
    const doc = modal.querySelector('erp-sales-document') as HTMLElement & { issuing?: boolean };
    expect(doc.issuing, 'a reprint is never issuing').toBeFalsy();
  });

  it('sin título: solo la X de cerrar, que dispara onClose', () => {
    let cerrado = false;
    const modal = montar('venta-1', () => { cerrado = true; });
    expect(modal, 'el modal lleva la clase doc-modal').toBeTruthy();
    expect(modal.querySelector('ion-title'), 'sin título «Documento»').toBeNull();

    const x = modal.querySelector<HTMLElement>('ion-button.doc-close')!;
    expect(x, 'la X de cerrar existe').toBeTruthy();
    expect(x.getAttribute('aria-label'), 'la X es accesible').toBe('ui.close');
    x.click();
    expect(cerrado, 'la X cierra el modal').toBe(true);
  });

  it('el documento va dentro del ion-content; imprimir en el ion-footer, lo último', () => {
    const modal = montar('venta-1');
    expect(modal.querySelector('ion-content erp-sales-document'), 'documento en el content').toBeTruthy();

    // ion-content scrollea (tiquet largo) e ion-footer queda SIEMPRE visible: imprimir no se va
    // con el scroll. Es el mismo contrato header/content/footer del carrito (erp-pos-touch.test.ts).
    const pie = modal.querySelector('ion-footer')!;
    expect(pie, 'hay ion-footer').toBeTruthy();
    expect(pie.querySelector('ion-button.print'), 'imprimir vive en el pie').toBeTruthy();
    expect(modal.lastElementChild, 'el pie es lo último del modal').toBe(pie);
  });

  it('imprimir es SOLO-ICONO (regla ADR-0133): sin texto visible, label solo en aria', () => {
    const modal = montar('venta-1');
    const btn = modal.querySelector<HTMLElement>('ion-footer ion-button.print')!;
    expect(btn.textContent?.trim(), 'sin texto visible en el botón').toBe('');
    expect(btn.getAttribute('aria-label'), 'el nombre va en aria-label').toBe('ui.print');
    expect(btn.querySelector('ion-icon[slot="icon-only"]'), 'icono de impresora en slot icon-only').toBeTruthy();
  });

  it('sin venta no monta el documento (modal cerrado)', () => {
    const modal = montar(undefined);
    expect(modal.querySelector('erp-sales-document')).toBeNull();
  });

  it('lleva sus estilos DENTRO del modal (viajan con él cuando Ionic lo reparenta a body)', () => {
    const modal = montar('venta-1');
    const style = modal.querySelector('style');
    expect(style, 'el <style> va dentro del ion-modal').toBeTruthy();
    // Al imprimir, pie y X desaparecen: en papel solo va el documento.
    // Las reglas de impresión YA NO viven aquí: son globales del shell (apps/web/src/print.css),
    // porque un style dentro del modal solo existe mientras ESE modal está abierto. Lo que el
    // módulo debe garantizar es el CONTRATO: el modal lleva la clase que el shell imprime.
    expect(style!.textContent).not.toContain('@media print');
  });
});

// Lo que se manda a IMPRIMIR (sales#79). Van dos documentos: el `html` que imprime un navegador y
// el `data` ESTRUCTURADO que lee la impresora térmica. Solo se mandaba el primero, así que con una
// impresora asignada salía papel con todos los valores por defecto: «ERPlora», sin líneas y TOTAL
// 0,00 — y sin error, porque el renderizador busca por clave y no encuentra nada.
describe('imprimir el documento', () => {
  interface PrintReq { documentType?: string; jobId?: string; data?: Record<string, unknown>; html?: string }
  let enviados: PrintReq[];
  let avisos: { type?: string; message?: string }[];
  let resultado: { via: string; error?: string };

  /** Modal con una venta CARGADA (el visor la trae por SDK; aquí se inyecta) y el SDK doblado. */
  function montarConVenta() {
    const modal = montar('venta-1');
    const visor = modal.querySelector('erp-sales-document') as unknown as Record<string, unknown>;
    visor.sale = { id: 'venta-1', sale_number: 'T-42', subtotal: 327, tax_amount: 33, total: 360, payment_method_name: 'Efectivo' };
    visor.lines = [{ product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 }];
    visor.settings = {};
    return modal;
  }

  beforeEach(() => {
    enviados = [];
    avisos = [];
    resultado = { via: 'bridge' };
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.print = async (req: PrintReq) => { enviados.push(req); return resultado; };
    sdk.notify = (n: { type?: string; message?: string }) => avisos.push(n);
  });

  it('manda el documento ESTRUCTURADO, no solo el HTML', async () => {
    const modal = montarConVenta();
    modal.querySelector<HTMLElement>('ion-footer ion-button.print')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(enviados, 'una petición de impresión').toHaveLength(1);
    expect(enviados[0].documentType).toBe('receipt');
    expect(enviados[0].data, 'sin `data` la impresora saca un tique en blanco').toBeTruthy();
    expect(enviados[0].data!.items, 'las líneas que se vendieron').toHaveLength(1);
    expect(enviados[0].data!.receipt_id).toBe('T-42');
    expect(enviados[0].data!.total, 'céntimos en la fila, euros en el papel').toBe(3.6);
    expect(enviados[0].html, 'y el HTML sigue yendo, para el respaldo del navegador').toBeTruthy();
  });

  it('avisa cuando el tique no salió por ninguna impresora', async () => {
    resultado = { via: 'browser', error: 'sin impresora con rol receipt' };
    const modal = montarConVenta();
    modal.querySelector<HTMLElement>('ion-footer ion-button.print')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(avisos, 'un fallo de impresión no se traga').toHaveLength(1);
    expect(avisos[0].type).toBe('error');
  });

  it('no molesta cuando el papel salió', async () => {
    const modal = montarConVenta();
    modal.querySelector<HTMLElement>('ion-footer ion-button.print')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(avisos).toHaveLength(0);
  });
});

// sales#92 — reimprimir un tique NO imprimía. La cola del hub es idempotente por
// (hub_id, job_id) (printing.jobs_create: ON CONFLICT DO NOTHING) y el modal reutilizaba
// `sale-${saleId}` — LA MISMA clave que el shell ya gastó en la impresión automática del cobro
// (apps/web/src/lib/print-on-on-sale.ts): la reimpresión caía en el hueco del dedup y no salía
// papel, sin error. A diferencia de la cuenta previa (prebillJobId: huella del CONTENIDO), una
// venta es INMUTABLE — su huella sería constante y el dedup se tragaría todas las copias. La
// clave de una reimpresión es única por INTENTO: cada pulsación de IMPRIMIR es una petición
// explícita de otra copia.
describe('reimprimir: cada intento es un trabajo nuevo (sales#92)', () => {
  interface PrintReq { jobId?: string }
  let enviados: PrintReq[];

  function montarConVenta() {
    const modal = montar('venta-1');
    const visor = modal.querySelector('erp-sales-document') as unknown as Record<string, unknown>;
    visor.sale = { id: 'venta-1', sale_number: 'T-42', subtotal: 327, tax_amount: 33, total: 360, payment_method_name: 'Efectivo' };
    visor.lines = [{ product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 }];
    visor.settings = {};
    return modal;
  }

  beforeEach(() => {
    enviados = [];
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.print = async (req: PrintReq) => { enviados.push(req); return { via: 'queue' }; };
    sdk.notify = () => {};
  });

  it('dos pulsaciones de IMPRIMIR mandan DOS jobIds distintos — la cola no se traga la segunda', async () => {
    const modal = montarConVenta();
    const btn = () => modal.querySelector<HTMLElement>('ion-footer ion-button.print')!;
    btn().click();
    await new Promise((r) => setTimeout(r, 0));
    btn().click();
    await new Promise((r) => setTimeout(r, 0));

    expect(enviados, 'dos peticiones de impresión').toHaveLength(2);
    expect(enviados[0].jobId, 'la primera lleva jobId').toBeTruthy();
    expect(enviados[1].jobId, 'y distinto de la primera — si no, el dedup la ignora').not.toBe(enviados[0].jobId);
  });

  it('la clave de reimpresión NUNCA es la del cobre (`sale-<id>` ya la gastó el auto-print)', async () => {
    const modal = montarConVenta();
    modal.querySelector<HTMLElement>('ion-footer ion-button.print')!.click();
    await new Promise((r) => setTimeout(r, 0));

    const jobId = enviados[0].jobId!;
    expect(jobId, 'no es la clave exacta del auto-print del checkout').not.toBe('sale-venta-1');
    expect(jobId.startsWith('sale-venta-1'), 'pero se correlaciona con la venta').toBe(true);
  });
});

// hub#1931 — only one original of an invoice may exist (RD 1619/2012 art. 14): a ticket reprinted
// from the sales list is a DUPLICATE and both papers say so — the structured one the thermal
// printer reads (`duplicate: true`) and the HTML of the browser fallback. The ticket screen right
// after charging (`issuing`) prints the original and carries no mark.
describe('reimprimir: la copia dice «duplicado» (hub#1931)', () => {
  interface PrintReq { data?: Record<string, unknown>; html?: string }
  let enviados: PrintReq[];

  function montarConVenta(issuing: boolean) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(renderDocumentModal({ saleId: 'venta-1', issuing, onClose: () => {}, t: (k) => k }), host);
    const modal = host.querySelector('ion-modal.doc-modal')!;
    const visor = modal.querySelector('erp-sales-document') as unknown as Record<string, unknown>;
    visor.sale = { id: 'venta-1', sale_number: 'T-42', subtotal: 327, tax_amount: 33, total: 360, payment_method_name: 'Efectivo' };
    visor.lines = [{ product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 }];
    visor.settings = {};
    return modal;
  }

  async function imprimir(modal: Element) {
    modal.querySelector<HTMLElement>('ion-footer ion-button.print')!.click();
    await new Promise((r) => setTimeout(r, 0));
  }

  beforeEach(() => {
    enviados = [];
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.print = async (req: PrintReq) => { enviados.push(req); return { via: 'queue' }; };
    sdk.notify = () => {};
  });

  it('una reimpresión desde la lista va marcada como duplicado en los dos papeles', async () => {
    await imprimir(montarConVenta(false));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].data!.duplicate, 'the thermal paper says duplicado').toBe(true);
    expect(enviados[0].html, 'and so does the browser fallback').toContain('ui.docDuplicate');
  });

  it('el tique recién cobrado es el original: ninguna marca', async () => {
    await imprimir(montarConVenta(true));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].data!.duplicate, 'the original carries no mark').toBeUndefined();
    expect(enviados[0].html).not.toContain('ui.docDuplicate');
  });
});
