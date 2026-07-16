// Contrato del modal COMPARTIDO del documento de venta (renderDocumentModal).
//
// touch, desktop y lista pintaban el mismo modal triplicado y feo (título «Documento» inútil,
// IMPRIMIR flotando arriba-derecha, tiquet perdido en un modal enorme). El helper único fija:
// sin título, X de cerrar accesible, documento en el content, IMPRIMIR en un ion-footer abajo.
// (El contrato de integración en el TPV vive en erp-pos-touch.test.ts.)
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'lit';
import { renderDocumentModal } from './document-modal.js';

beforeEach(() => {
  document.body.innerHTML = '';
  // erp-sales-document (importado por el helper) llama al SDK al montarse.
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryOptional: async () => undefined,
    locale: 'es',
    t: (_catalog: unknown, key: string) => key,
  };
});

function montar(saleId?: string, onClose: () => void = () => {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(renderDocumentModal({ saleId, onClose, t: (k) => k }), host);
  return host.querySelector('ion-modal.doc-modal')!;
}

describe('renderDocumentModal', () => {
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
    expect(style!.textContent).toContain('@media print');
  });
});
