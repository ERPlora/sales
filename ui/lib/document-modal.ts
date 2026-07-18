// Modal del documento de venta (tiquet/factura) — helper COMPARTIDO.
//
// erp-pos-touch, erp-pos-desktop y erp-sales-list pintaban el MISMO modal triplicado, y feo:
// título «Documento» que no aportaba, IMPRIMIR flotando arriba-derecha y el tiquet perdido en un
// modal enorme. Aquí vive el markup único con el contrato nuevo (document-modal.test.ts):
//
//   · SIN cabecera con título — solo una X de cerrar flotante (slot fixed del ion-content).
//   · Modal a tamaño de papel (~440px, como el tiquet de 80mm) con esquinas redondeadas.
//   · Fondo gris suave para que el papel (con sombra, ver erp-sales-document) parezca papel.
//   · IMPRIMIR en un ion-footer abajo, a ancho completo — donde el pulgar lo espera en el TPV.
//
// El <style> va DENTRO del ion-modal a propósito: Ionic reparenta los overlays al light-DOM
// (fuera del shadow del componente anfitrión), y al viajar con el modal las reglas aplican igual
// en ambos escenarios. También oculta pie y X al imprimir (@media print).
import { html, nothing, type TemplateResult } from 'lit';
import '../components/erp-sales-document/erp-sales-document.js';

export interface DocumentModalOpts {
  /** Venta a mostrar; el modal está abierto mientras haya id. */
  saleId?: string;
  /** Cierra el modal (limpia el id en el componente anfitrión). */
  onClose: () => void;
  /** Traductor del catálogo del módulo (`ui.print`, `ui.close`). */
  t: (key: string) => string;
}

export function renderDocumentModal({ saleId, onClose, t }: DocumentModalOpts): TemplateResult {
  return html`<ion-modal class="doc-modal" .isOpen=${!!saleId} @ionModalDidDismiss=${onClose}>
    <style>
      ion-modal.doc-modal {
        --width: min(440px, 100vw);
        --height: min(720px, 100vh);
        --border-radius: 14px;
      }
      ion-modal.doc-modal ion-content.doc-body {
        --background: var(--ion-color-light, #f4f5f8);
      }
      ion-modal.doc-modal ion-button.doc-close {
        margin: 6px;
      }
      ion-modal.doc-modal ion-footer ion-toolbar {
        --background: var(--ion-background-color, #fff);
        padding: 4px 10px calc(4px + var(--ion-safe-area-bottom, 0px));
      }
      /* Tiquet corto → papel centrado en vertical; largo → scrollea sin recortar arriba
         (margin:auto en el hijo, no justify-content: el clásico bug de flex + overflow). */
      ion-modal.doc-modal .doc-wrap {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        box-sizing: border-box;
      }
      ion-modal.doc-modal .doc-wrap > erp-sales-document { margin: auto 0; }
      @media print {
        /* Sin márgenes de página el navegador deja de estampar su cabecera/pie (fecha, título,
           URL, 1/1) alrededor del tiquet. */
        @page { margin: 0; }
        ion-modal.doc-modal ion-footer,
        ion-modal.doc-modal ion-button.doc-close { display: none; }
        /* Imprimir SOLO el documento.
           Falla anterior: ocultar los hermanos a nivel de body escondía el div raíz de la app…
           que es justo quien CONTIENE el modal (Ionic lo reparenta a ion-app, no a body), así que
           el papel salía EN BLANCO. La técnica correcta no depende de dónde cuelgue el modal: se
           apaga el pintado de todo y se enciende solo el documento — visibility se HEREDA, así que
           los ancestros siguen maquetando pero no se ven, y el contenido del modal (incluido su
           shadow) vuelve a verse.
           (Recordatorio: NADA de backticks en comentarios dentro de una plantilla Lit.) */
        /* Ocultar los HERMANOS del modal dentro de ion-app (ahí lo reparenta Ionic).
           Por qué no valen los intentos obvios:
             · ocultar hermanos de <body> escondía el div raíz… que CONTIENE el modal → hoja en blanco;
             · visibility sobre "body *" no entra en el SHADOW DOM, y la app son web components:
               sus interiores seguían pintando → salía el tiquet Y toda la web.
           display:none sobre el hermano se lleva su shadow entero, que es justo lo que hace falta. */
        ion-app > *:not(ion-modal.doc-modal) { display: none !important; }
        ion-modal.doc-modal {
          position: absolute !important; inset: 0 auto auto 0; width: 100% !important;
          height: auto !important; display: block !important;
          --width: auto; --height: auto; --border-radius: 0; --box-shadow: none; --backdrop-opacity: 0;
        }
        ion-modal.doc-modal::part(content) {
          position: static !important; width: auto !important; height: auto !important;
          max-height: none !important; box-shadow: none !important; border-radius: 0 !important;
          contain: none !important; overflow: visible !important;
        }
        ion-modal.doc-modal ion-content.doc-body {
          --background: #fff; --offset-top: 0; --offset-bottom: 0;
          position: static !important; height: auto !important; overflow: visible !important;
        }
        ion-modal.doc-modal .doc-wrap { min-height: 0 !important; padding-top: 0 !important; }
      }
    </style>
    <ion-content class="doc-body">
      <ion-button class="doc-close" slot="fixed" style="top:0;right:0" fill="clear" color="medium"
        aria-label=${t('ui.close')} @click=${onClose}>
        <ion-icon name="close" slot="icon-only"></ion-icon>
      </ion-button>
      <div class="doc-wrap ion-padding" style="padding-top:44px">
        ${saleId ? html`<erp-sales-document .saleId=${saleId}></erp-sales-document>` : nothing}
      </div>
    </ion-content>
    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <!-- Solo-icono (ADR-0133): el nombre va en aria-label, nunca texto visible. A ancho
             completo igualmente: en el TPV táctil el objetivo grande manda. -->
        <ion-button class="print" expand="block" aria-label=${t('ui.print')} @click=${() => window.print()}>
          <ion-icon slot="icon-only" name="print-outline"></ion-icon>
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>`;
}
