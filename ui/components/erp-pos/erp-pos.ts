import { LitElement, html, css } from 'lit';
import { define } from '@erplora/outfitkit/define';
import '../erp-pos-touch/erp-pos-touch.js';

// erp-pos — la pantalla de venta.
//
// Hubo dos disposiciones («touch» y «desktop», elegibles por ajuste). Se retiró la de escritorio
// (ADR-0146): se había quedado sin pedidos, sin cocina, sin split y sin mesa/cliente del modelo
// nuevo —vendía peor— y era lo único que seguía atado al carrito-blob. Mantener dos pantallas
// obligaba además a hacer dos veces cada mejora. La táctil es responsive y sirve en escritorio.

export class ErpPos extends LitElement {
  static styles = css`:host { display:block; height:100%; }`;

  render() {
    return html`<erp-pos-touch></erp-pos-touch>`;
  }
}

define('erp-pos', ErpPos);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos': ErpPos;
  }
}
