import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '../erp-pos-touch/erp-pos-touch.js';

// erp-pos — la pantalla de venta.
//
// Hubo dos disposiciones («touch» y «desktop», elegibles por ajuste). Se retiró la de escritorio
// (ADR-0146): se había quedado sin pedidos, sin cocina, sin split y sin mesa/cliente del modelo
// nuevo —vendía peor— y era lo único que seguía atado al carrito-blob. Mantener dos pantallas
// obligaba además a hacer dos veces cada mejora. La táctil es responsive y sirve en escritorio.

// El contrato de chrome (ADR-0367) lo escribe el shell en el elemento que ÉL monta, que es este —
// el que declara `navigation[]`—, pero quien lo necesita es la pantalla de dentro, que es la que
// pinta la barra de categorías con su ⋮. Un atributo no cruza un shadow root por su cuenta: sin
// reenviarlo aquí, el shell concede la capacidad y la pantalla nunca se entera. Pasó de verdad —
// `<erp-pos chrome="fullscreen">` con un `<erp-pos-touch>` sin un solo atributo dentro— y no lo vio
// ningún test porque todos montaban `erp-pos-touch` suelto, no la composición que usa producción.
export class ErpPos extends LitElement {
  static styles = css`:host { display:block; height:100%; }`;

  /** Controles de chrome que el shell honra en esta pestaña. Se reenvían tal cual. */
  @property() chrome = '';
  /** ¿Está el shell en pantalla completa? Cambia DESPUÉS del montaje (también por Esc o F11). */
  @property({ type: Boolean }) fullscreen = false;

  render() {
    return html`<erp-pos-touch
      chrome=${this.chrome}
      ?fullscreen=${this.fullscreen}
    ></erp-pos-touch>`;
  }
}

define('erp-pos', ErpPos);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos': ErpPos;
  }
}
