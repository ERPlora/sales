import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '../erp-pos-touch/erp-pos-touch.js';
import '../erp-pos-desktop/erp-pos-desktop.js';

// erp-pos — selector de pantalla de venta. Lee `sales.settings.get` → `pos_layout` y monta la
// pantalla que el negocio ha elegido: 'desktop' → erp-pos-desktop; cualquier otro → erp-pos-touch.
// Una sola entrada de navegación ("Vender"); la elección vive en los ajustes (Fase 1/5).

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
}
function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

export class ErpPos extends LitElement {
  static styles = css`:host { display:block; height:100%; }`;

  @state() private layout = 'touch';
  @state() private ready = false;

  async connectedCallback() {
    super.connectedCallback();
    try {
      const rows = await erplora().query<{ pos_layout?: string }[]>('sales.settings.get');
      const row = Array.isArray(rows) ? rows[0] : (rows as { pos_layout?: string } | undefined);
      this.layout = row?.pos_layout === 'desktop' ? 'desktop' : 'touch';
    } catch {
      this.layout = 'touch';
    } finally {
      this.ready = true;
    }
  }

  render() {
    if (!this.ready) return html``;
    return this.layout === 'desktop'
      ? html`<erp-pos-desktop></erp-pos-desktop>`
      : html`<erp-pos-touch></erp-pos-touch>`;
  }
}

define('erp-pos', ErpPos);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos': ErpPos;
  }
}
