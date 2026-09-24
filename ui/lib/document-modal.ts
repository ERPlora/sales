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
import { originalPrinted } from './original-ticket.js';
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

/** What the list reprint reads of the viewer: its public printing surface (as the hub shell does). */
interface SalesDocumentViewer extends HTMLElement {
  saleId?: string;
  issuing?: boolean;
  issued?: () => Promise<boolean>;
  printableHtml?: (o: { duplicate: boolean }) => string;
  printableDocument?: (o: { duplicate: boolean }) => Record<string, unknown> | undefined;
  printKind?: () => PrintKind;
}

/** sales#306 — which document goes through the door: a thermal `receipt` or an A4 `invoice`. */
export interface PrintKind {
  documentType: 'receipt' | 'invoice';
  format: 'receipt' | 'a4';
}

const RECEIPT: PrintKind = { documentType: 'receipt', format: 'receipt' };

/**
 * Sends one sale's document through the shell's print door — the ONE send the document's Print
 * button and the sales list's reprint share, so both succeed and fail the same way.
 *
 * html is what a browser prints; data is what the ESC/POS renderer reads BY KEY. Without data
 * the printer did not fail: it printed every default and came out «ERPlora», no lines, TOTAL 0,00
 * (sales#79). A printer or the queue took it → silence (the paper is the answer); anything else is
 * said: in the installed app the browser fallback prints nothing and the customer is left waiting.
 *
 * sales#306 — `kind` says which document it is. An invoice goes as an A4 `invoice`: the hub door
 * sends A4 to the print dialog (the laser printer, or «Save as PDF»), which is how Odoo, Lightspeed
 * or Square hand over a full invoice — so there the dialog opening IS the paper coming out.
 */
export async function sendReceipt(
  { html, data, saleId, t, kind = RECEIPT }:
  { html?: string; data?: Record<string, unknown>; saleId?: string; t: (key: string) => string; kind?: PrintKind },
): Promise<void> {
  const sdk = (globalThis as { erplora?: PrintCapableSdk }).erplora;
  if (!sdk?.print) {
    if (html) printHtmlInIframe(html, document, kind.format); else window.print();
    return;
  }
  let res: { via?: string; error?: string } | undefined;
  try {
    // sales#92: el jobId es ÚNICO POR INTENTO (reprintJobId) — la cola deduplica por
    // (hub_id, job_id) y la clave del cobro (sale-<id>) ya la gastó el auto-print del
    // checkout: reutilizarla tragaba la reimpresión sin error ni papel.
    res = await sdk.print({
      role: 'receipt', documentType: kind.documentType, format: kind.format, html, data, jobId: reprintJobId(saleId),
    });
  } catch (e) {
    res = { error: e instanceof Error ? e.message : String(e) };
  }
  if (res?.via === 'bridge' || res?.via === 'queue') return;
  if (res?.via === 'browser' && kind.format === 'a4') return;
  sdk.notify?.({ type: 'error', message: res?.error ? `${t('ui.printFailed')}: ${res.error}` : t('ui.printFailed') });
}

/**
 * sales#347 — reprints a sale from outside its document (the sales list's row action).
 *
 * The paper is the viewer's own: a hidden <erp-sales-document> loads the sale, told it is issuing
 * so that it waits for the invoice number and the VeriFactu QR (issued(), hub#1867 — the same way
 * the hub shell composes the automatic print). It is always a copy («duplicado», hub#1931). The
 * viewer is removed afterwards, which also ends its fiscal watch. A sale that does not load prints
 * nothing and says so.
 */
export async function reprintSale(saleId: string, t: (key: string) => string, timeoutMs = 15000): Promise<void> {
  const viewer = document.createElement('erp-sales-document') as SalesDocumentViewer;
  const host = document.createElement('div');
  host.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  // Before it is connected: the viewer decides whether to wait when it loads its sale.
  viewer.issuing = true;
  viewer.saleId = saleId;
  host.appendChild(viewer);
  document.body.appendChild(host);
  let html: string | undefined;
  let data: Record<string, unknown> | undefined;
  let kind: PrintKind | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ceiling = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
    await Promise.race([viewer.issued?.().catch(() => false), ceiling]);
    data = viewer.printableDocument?.({ duplicate: true });
    html = data ? viewer.printableHtml?.({ duplicate: true }) : undefined;
    kind = viewer.printKind?.();
  } finally {
    clearTimeout(timer);
    host.remove();
  }
  if (!data) {
    (globalThis as { erplora?: PrintCapableSdk }).erplora?.notify?.({ type: 'error', message: t('ui.printFailed') });
    return;
  }
  await sendReceipt({ html, data, saleId, t, kind });
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
      /* The colour of the close button: color= would not paint here (pm#392), this style travels
         with the modal to <body>. */
      ion-modal.doc-modal ion-button.doc-close {
        margin: 6px;
        --color: var(--ion-color-medium, #636469);
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
      <ion-button class="doc-close" slot="fixed" style="top:0;right:0" fill="clear"
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
            SalesDocumentViewer | null;
          // hub#1931 — only one original of an invoice may exist (RD 1619/2012 art. 14). Any print
          // of this viewer outside the till (the sales list, the history) is a copy and both papers
          // say «duplicado». Right after charging, the original goes out only if none of this sale
          // did yet — the automatic print at checkout or an earlier press of this button (sales#330).
          const duplicate = !issuing || (!!saleId && originalPrinted(saleId));
          void sendReceipt({
            html: el?.printableHtml?.({ duplicate }),
            data: el?.printableDocument?.({ duplicate }),
            saleId,
            t,
            kind: el?.printKind?.(),
          });
        }}>
          <ion-icon slot="icon-only" name="print-outline"></ion-icon>
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>`;
}
