// receipt-html — el tiquet como HTML PLANO y autocontenido, para imprimirlo de verdad.
//
// Por qué existe: imprimir el DOM de la app es indomable. El papel se pinta con `ok-receipt`
// dentro de un `ion-modal` que Ionic reparenta a `ion-app`, con shadow DOM y `contain`/`transform`
// por medio; por muchas reglas `@media print` que se pongan, el navegador acababa sacando la app
// entera (o una hoja en blanco). La solución robusta es no imprimir la app: se escribe el papel
// como un documento HTML independiente y se imprime ESE.
//
// Este HTML es además el input natural para generar el PDF desde Rust (la tercera vía de
// `erplora.print`): mismo documento, distinto destino.

/** Línea del papel (misma forma que `ReceiptData.lines`). */
export interface PrintableLine {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

/** Documento imprimible (subconjunto de `ReceiptData`, todo opcional salvo lo mínimo). */
export interface PrintableReceipt {
  /** Document title, first line of the paper (pre-bill: «Cuenta»). Same job as the hardcoded
   *  «CUENTA» of the ESC/POS renderer: telling this paper from a fiscal ticket at a glance. */
  title?: string;
  business?: { name?: string; address?: string; tax_id?: string };
  number?: string;
  datetime?: string;
  customer?: string;
  lines?: PrintableLine[];
  subtotal?: number;
  taxes?: { label?: string; base?: number; amount?: number }[];
  total?: number;
  payment?: { method?: string; paid?: number; change?: number };
  currency?: string;
  footer?: string;
  qr_note?: string;
  /** Words of the paper (sales#120): the printed ticket speaks the HUB's language, and these
   *  are labels, not data — «Cambio» next to English lines was the mixed-language ticket. The
   *  caller translates them from the module catalog; the Spanish defaults keep every existing
   *  caller (and the tests) printing exactly what they printed. */
  labels?: { subtotal?: string; total?: string; change?: string; document?: string };
}

/** Escapa para HTML: los datos los teclea el usuario (un producto llamado `<script>` no ejecuta). */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Importe en euros con coma decimal y su moneda. Nunca imprime `NaN`. */
function money(v: unknown, currency: string): string {
  const n = Number(v);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} ${currency}`;
}

/**
 * Documento HTML completo del tiquet, listo para imprimir en un iframe aislado.
 * Ancho 80 mm (papel térmico) y tipografía monoespaciada, como el papel real.
 */
export function receiptToPrintableHtml(doc: PrintableReceipt): string {
  const cur = doc.currency || '€';
  // sales#120: las palabras del papel las trae quien lo pide, traducidas al idioma del hub.
  const lbl = { subtotal: 'Subtotal', total: 'TOTAL', change: 'Cambio', document: 'Documento', ...doc.labels };
  const lineas = (doc.lines ?? []).map((l) => `
      <tr>
        <td class="n">${esc(l.name)}<div class="q">${esc(l.qty)} × ${money(l.unit_price, cur)}</div></td>
        <td class="a">${money(l.total, cur)}</td>
      </tr>`).join('');

  const impuestos = (doc.taxes ?? []).map((t) => `
      <tr><td>${esc(t.label)}</td><td class="a">${money(t.amount, cur)}</td></tr>`).join('');

  const pago = doc.payment
    ? `<tr><td>${esc(doc.payment.method)}</td><td class="a">${money(doc.payment.paid ?? doc.total, cur)}</td></tr>` +
      (doc.payment.change != null ? `<tr><td>${esc(lbl.change)}</td><td class="a">${money(doc.payment.change, cur)}</td></tr>` : '')
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(doc.number || doc.business?.name || lbl.document)}</title>
<style>
  /* Papel térmico de 80 mm: sin márgenes de página, el navegador no estampa cabecera ni pie. */
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4mm; width: 80mm; background: #fff; color: #000;
         font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2mm; text-transform: uppercase; }
  .doc-title { font-size: 15px; font-weight: 700; text-align: center; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 1mm; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 2mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: .4mm 0; }
  td.a { text-align: right; white-space: nowrap; padding-left: 2mm; }
  .q { font-size: 10px; color: #333; }
  .tot td { font-size: 15px; font-weight: 700; padding-top: 1mm; }
  .foot { text-align: center; font-size: 10px; margin-top: 3mm; }
</style></head>
<body>
  ${doc.title ? `<div class="doc-title">${esc(doc.title)}</div>` : ''}
  <h1>${esc(doc.business?.name || '')}</h1>
  ${doc.business?.address ? `<div class="meta">${esc(doc.business.address)}</div>` : ''}
  ${doc.business?.tax_id ? `<div class="meta">${esc(doc.business.tax_id)}</div>` : ''}
  ${doc.number || doc.datetime ? `<div class="meta">${esc(doc.number || '')}${doc.number && doc.datetime ? ' · ' : ''}${esc(doc.datetime || '')}</div>` : ''}
  ${doc.customer ? `<div class="meta">${esc(doc.customer)}</div>` : ''}
  <hr>
  <table>${lineas}</table>
  <hr>
  <table>
    ${doc.subtotal != null ? `<tr><td>${esc(lbl.subtotal)}</td><td class="a">${money(doc.subtotal, cur)}</td></tr>` : ''}
    ${impuestos}
    <tr class="tot"><td>${esc(lbl.total)}</td><td class="a">${money(doc.total, cur)}</td></tr>
    ${pago}
  </table>
  ${doc.footer ? `<div class="foot">${esc(doc.footer)}</div>` : ''}
  ${doc.qr_note ? `<div class="foot">${esc(doc.qr_note)}</div>` : ''}
</body></html>`;
}

/**
 * Imprime un HTML autocontenido en un **iframe aislado**. Copia mínima del helper del shell para
 * que el módulo no dependa de él (los módulos no importan código del Hub): si el shell expone
 * `erplora.print` se usa ESA puerta —que además intenta el Bridge primero—; esto es el último
 * recurso cuando el módulo corre sin shell (preview del toolkit, tests).
 */
export function printHtmlInIframe(html: string, doc: Document = document): void {
  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:80mm;height:1px;border:0;visibility:hidden;';
  doc.body.appendChild(frame);
  const w = frame.contentWindow; const d = frame.contentDocument;
  if (!w || !d) { frame.remove(); return; }
  d.open(); d.write(html); d.close();
  const lanzar = () => { try { w.focus(); w.print(); } finally { setTimeout(() => frame.remove(), 1000); } };
  if (d.readyState === 'complete') setTimeout(lanzar, 50);
  else w.addEventListener('load', () => setTimeout(lanzar, 50), { once: true });
}
