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
import { printHtmlInIframe } from './receipt-html.js';
import { reprintJobId } from './print-document.js';
import '../components/erp-sales-document/erp-sales-document.js';

export interface DocumentModalOpts {
  /** Venta a mostrar; el modal está abierto mientras haya id. */
  saleId?: string;
  /** sales#308 — la venta se acaba de cobrar: el visor espera tras la carga hasta tener el tique
   *  completo (número y QR VeriFactu). Solo el TPV lo pone; una reimpresión nunca espera. */
  issuing?: boolean;
  /** Cierra el modal (limpia el id en el componente anfitrión). */
  onClose: () => void;
  /** Traductor del catálogo del módulo (`ui.print`, `ui.close`, `ui.printFailed`). */
  t: (key: string) => string;
}

/** Lo que este modal necesita del SDK del shell: la puerta de impresión y el canal de avisos.
 *  `via` es por dónde salió el papel — `bridge`/`queue` son éxito; el resto, no. */
interface PrintCapableSdk {
  print?: (r: Record<string, unknown>) => Promise<{ via?: string; error?: string } | undefined>;
  notify?: (n: { type: string; message: string }) => void;
}

export function renderDocumentModal({ saleId, issuing = false, onClose, t }: DocumentModalOpts): TemplateResult {
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
      /* Las reglas de IMPRESIÓN viven en el SHELL (apps/web/src/print.css), no aquí: un style
         dentro del modal solo existe mientras ESE modal está abierto, así que imprimir la cuenta
         previa —cuyo modal no lo llevaba— sacaba la app entera. La clase doc-modal es el contrato:
         el shell imprime lo que la lleve.
         (Y NO metas backticks en comentarios dentro de una plantilla Lit: cierran el literal.) */
    </style>
    <ion-content class="doc-body">
      <ion-button class="doc-close" slot="fixed" style="top:0;right:0" fill="clear" color="medium"
        aria-label=${t('ui.close')} @click=${onClose}>
        <ion-icon name="close" slot="icon-only"></ion-icon>
      </ion-button>
      <div class="doc-wrap ion-padding" style="padding-top:44px">
        ${saleId ? html`<erp-sales-document .issuing=${issuing} .saleId=${saleId}></erp-sales-document>` : nothing}
      </div>
    </ion-content>
    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <!-- Solo-icono (ADR-0133): el nombre va en aria-label, nunca texto visible. A ancho
             completo igualmente: en el TPV táctil el objetivo grande manda. -->
        <ion-button class="print" expand="block" aria-label=${t('ui.print')} @click=${() => {
          // Se imprime el DOCUMENTO, no la app: se le piden al <erp-sales-document> sus DOS formas y
          // se mandan por la puerta global. Imprimir el DOM del modal era indomable — ion-modal
          // reparentado + shadow DOM = app entera o hoja blanca.
          //
          // `html` es lo que imprime un navegador; `data` es lo que lee el renderizador ESC/POS, que
          // busca POR CLAVE. Sin `data` la impresora no fallaba: pintaba todos sus valores por
          // defecto y sacaba «ERPlora», sin líneas y TOTAL 0,00 (sales#79).
          const el = document.querySelector('ion-modal.doc-modal')?.querySelector('erp-sales-document') as
            (HTMLElement & {
              printableHtml?: (o: { duplicate: boolean }) => string;
              printableDocument?: (o: { duplicate: boolean }) => Record<string, unknown> | undefined;
            }) | null;
          // hub#1931 — only one original of an invoice may exist (RD 1619/2012 art. 14). The till
          // right after charging prints the original; any other print of this viewer (the sales
          // list, the history) is a copy and both papers say «duplicado».
          const duplicate = !issuing;
          const html = el?.printableHtml?.({ duplicate });
          const data = el?.printableDocument?.({ duplicate });
          const sdk = (globalThis as { erplora?: PrintCapableSdk }).erplora;
          if (!sdk?.print) {
            if (html) printHtmlInIframe(html); else window.print();
            return;
          }
          void sdk
            // sales#92: el jobId es ÚNICO POR INTENTO (reprintJobId) — la cola deduplica por
            // (hub_id, job_id) y la clave del cobro (`sale-<id>`) ya la gastó el auto-print del
            // checkout: reutilizarla tragaba la reimpresión sin error ni papel.
            .print({ role: 'receipt', documentType: 'receipt', html, data, jobId: reprintJobId(saleId) })
            .then((res) => {
              // Salió por impresora o quedó en la cola: éxito. Lo demás hay que decirlo — en la app
              // instalada el respaldo del navegador no imprime nada y el cliente se queda esperando
              // su copia.
              if (res?.via === 'bridge' || res?.via === 'queue') return;
              sdk.notify?.({ type: 'error', message: res?.error ? `${t('ui.printFailed')}: ${res.error}` : t('ui.printFailed') });
            });
        }}>
          <ion-icon slot="icon-only" name="print-outline"></ion-icon>
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>`;
}
