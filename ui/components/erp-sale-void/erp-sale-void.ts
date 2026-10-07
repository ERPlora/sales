// The «void sale» confirmation (sales#26, services#157).
//
// It used to be an ion-alert, which takes a plain message and nothing else: it could not host what
// other modules want read before the sale is undone — voiding the sale of a voucher voids the
// voucher, sessions already used included (Services fills `sales.reversal.notice`). Square,
// Lightspeed and MyTime say it on the confirmation itself. So it is a window: the title with the
// number, the explanation, that hole, the reason (required: Toast, Lightspeed and the Spanish
// fiscal software ask for it) and Cancel / Void.
//
// It does not run `sales.void`: it hands the reason to the host (`void-confirm`), which owns the
// command, the busy state and the refusal it passes back in `errorText`.
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import { loadReversalFillers, mountReversalNotice } from '../../lib/reversal-notice.js';
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

interface ErploraClientLike {
  loadSlot?(slot: string): Promise<Array<Record<string, unknown> & { component: string }>>;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK not initialised by the shell');
  return c;
}

export class ErpSaleVoid extends LitElement {
  static styles = css`
    :host { display:block; }
    /* Own padding: the global ion-padding class does not cross the shadow DOM. */
    .void-body { display:flex; flex-direction:column; gap:.85rem; max-width:40rem; margin:0 auto; padding:1rem; }
    h3 { margin:0; font-size:1.1rem; overflow-wrap:anywhere; }
    .hint { margin:0; color:var(--ion-color-medium,#8b897f); font-size:.85rem; }
    .reversal-notice { display:flex; flex-direction:column; gap:.5rem; }
    .actions { display:flex; justify-content:flex-end; gap:.5rem; flex-wrap:wrap; }
  `;

  @property({ type: String }) saleId = '';
  @property({ type: String }) saleNumber = '';
  /** The host is running the void: Void is really disabled, a second tap would void twice. */
  @property({ type: Boolean }) busy = false;
  /** The host's refusal, already in the user's words. */
  @property({ type: String }) errorText = '';

  @state() reason = '';
  @state() private reasonMissing = false;
  @state() private reversalFillers: string[] = [];
  private readonly reversalEls = new Map<string, HTMLElement>();

  connectedCallback(): void {
    super.connectedCallback();
    void loadReversalFillers(erplora()).then((tags) => { this.reversalFillers = tags; });
  }

  updated(): void {
    mountReversalNotice(
      this.renderRoot.querySelector('[data-testid="void-reversal-notice"]'),
      this.reversalFillers, this.saleId, 'void', this.reversalEls,
    );
  }

  private confirm(): void {
    if (this.busy) return;
    const reason = this.reason.trim();
    if (!reason) { this.reasonMissing = true; return; }
    this.reasonMissing = false;
    this.dispatchEvent(new CustomEvent('void-confirm', { detail: { reason }, bubbles: true, composed: true }));
  }

  private cancel(): void {
    this.dispatchEvent(new CustomEvent('void-cancel', { bubbles: true, composed: true }));
  }

  render(): unknown {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const error = this.reasonMissing ? t('ui.voidReasonRequired') : this.errorText;
    return html`<div class="void-body" data-testid="void-form">
      <h3 data-testid="void-title">${t('ui.voidTitle', { number: this.saleNumber })}</h3>
      <p class="hint" data-testid="void-explain">${t('ui.voidExplain')}</p>
      <ion-textarea
        data-testid="void-reason"
        label=${t('ui.voidReasonPlaceholder')}
        fill="outline"
        mode="md"
        label-placement="stacked"
        maxlength="500"
        auto-grow
        .value=${this.reason}
        @ionInput=${(e: CustomEvent<{ value?: string }>) => { this.reason = e.detail?.value ?? ''; this.reasonMissing = false; }}
      ></ion-textarea>
      ${this.reversalFillers.length
        ? html`<div class="reversal-notice" data-testid="void-reversal-notice"></div>`
        : nothing}
      ${error
        ? html`<ok-inline-feedback data-testid="void-error" tone="danger" icon="alert-circle-outline">${error}</ok-inline-feedback>`
        : nothing}
      <div class="actions">
        <ion-button data-testid="void-cancel" fill="clear" @click=${() => this.cancel()}>${t('ui.cancel')}</ion-button>
        <ion-button data-testid="void-confirm" color="danger" ?disabled=${this.busy} @click=${() => this.confirm()}
          >${t('ui.actionVoid')}</ion-button>
      </div>
    </div>`;
  }
}

define('erp-sale-void', ErpSaleVoid);
