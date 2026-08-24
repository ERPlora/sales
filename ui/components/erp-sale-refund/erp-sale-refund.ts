// La pantalla de DEVOLUCIÓN — sales#160 / ADR-0386 decisión 3.
//
// Devolver una venta cobrada con varios medios es el fallo más repetido del mercado, y las tres
// referencias fallan de tres formas distintas. Esta pantalla existe para no repetir ninguna:
//
//   · SHOPIFY POS prorratea y lo tiene HARDCODED — «there's no setting or permission to change
//     it». Aquí el prorrateo se PROPONE al abrir (acierta casi siempre) y cada importe se edita.
//     Y al editar uno, los demás NO se recalculan solos: el reparto es del operador, no de la
//     pantalla que le corrige la mano.
//   · SQUARE obliga al tender original «even if the gift card does not exist or has been reused».
//     Aquí una pata cuyo método murió sale marcada CON SU MOTIVO y con un selector de destino al
//     lado. El dinero sigue saliendo; lo que cambia es la puerta.
//   · ODOO deja el método al debe y al haber del mismo asiento al devolver por otro sitio. Aquí el
//     origen (la pata) y el destino (el método) viajan como dos campos, y el servidor los guarda
//     como dos campos.
//
// La autoridad es el servidor (`sales.refund`): esto no valida en su lugar, valida ANTES, para que
// el operador vea el problema mientras teclea. Cuando el servidor rechaza, se traduce su CÓDIGO.
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { define } from '@erplora/outfitkit/define';
import '@erplora/outfitkit/ok-inline-feedback';
import {
  proportionalSplit,
  refundableTotal,
  draftTotal,
  refundBlock,
  buildAllocations,
  reasonKey,
  parseAmountToCents,
  formatAmountInput,
  type RefundLeg,
  type RefundDraft,
} from '../../lib/refund-allocation.js';
import { payMethodDisplayName } from '../../lib/pay-icons.js';
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';

const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

/** Códigos de `sales.refund` → clave i18n. La UI se orienta por el CÓDIGO, nunca por la frase. */
const REFUND_MESSAGES: Record<string, string> = {
  'sales.refund_exceeds_tender': 'ui.refundExceedsTender',
  'sales.refund_tender_not_eligible': 'ui.refundNeedsDestinationShort',
  'sales.refund_method_unavailable': 'ui.refundMethodUnavailable',
  'sales.refund_reason_required': 'ui.refundReasonRequired',
  'sales.refund_nothing_to_return': 'ui.refundNothingToReturn',
  'sales.refund_requires_completed': 'ui.refundRequiresCompleted',
  'sales.sale_not_found': 'ui.refundSaleNotFound',
};

export function refundErrorKey(message: string): string {
  for (const [code, key] of Object.entries(REFUND_MESSAGES)) {
    if (message.includes(code)) return key === 'ui.refundNeedsDestinationShort' ? 'ui.refundReasonNotEligible' : key;
  }
  return 'ui.refundFailed';
}

interface Sale { id: string; sale_number: string; status: string; total: number }
interface Method { id: string; name: string; type: string }

interface ErploraClientLike {
  query<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  command<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
  notify?(n: { type: 'success' | 'error' | 'info'; message: string }): void;
  formatMoney(cents: number): string;
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

/** Clave de idempotencia del INTENTO. Estable mientras la pantalla siga abierta sobre la misma
 *  venta: es lo que hace que un reintento recupere el MISMO documento en vez de escribir una
 *  segunda devolución, y lo que `services` necesita como `refund_ref`. */
function newKey(saleId: string): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `refund-${saleId}-${rnd}`;
}

export class ErpSaleRefund extends LitElement {
  static styles = css`
    :host { display:block; }
    /* 🔴 El padding es PROPIO, no la clase ion-padding: esa clase vive en el stylesheet GLOBAL de Ionic y
       NO atraviesa el shadow DOM, así que dentro de un módulo no aplica jamás. Medido en un
       Chromium real contra el preview: el cuerpo salia con padding 0 y el boton pegado al borde en
       los tres viewports. (Y no metas acentos graves en un comentario dentro de una plantilla css:
       cierran el literal.) */
    .refund-body, .refund-loading { padding:1rem; }
    /* A 1440 px la ficha se estiraba a 1.404 px de ancho: un formulario de importes con el nombre
       del medio a la izquierda y el campo a un metro a la derecha no se lee de un vistazo. Se
       centra con un ancho de lectura, y por debajo de eso ocupa lo que haya. */
    .refund-body { display:flex; flex-direction:column; gap:.85rem; max-width:46rem; margin:0 auto; }
    .refund-loading { display:flex; align-items:center; gap:.6rem; }
    h3 { margin:0; font-size:1.1rem; }
    .hint { margin:0; color:var(--ion-color-medium,#8b897f); font-size:.85rem; }
    .legs { display:flex; flex-direction:column; gap:.7rem; }
    .leg { border:1px solid var(--ion-border-color,#e0ddd4); border-radius:var(--ok-radius,12px); padding:.7rem .8rem; }
    .leg-head { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; }
    /* El dinero se lee en columna y a la derecha, como en cualquier ERP: alineado a la izquierda
       pegado al nombre del medio, la vista no tiene donde apoyarse para comparar dos importes. */
    .leg-head ion-input { margin-left:auto; max-width:12rem; --padding-end:0; text-align:right; }
    .leg-name { font-weight:700; }
    .leg-figures { display:flex; gap:.9rem; flex-wrap:wrap; color:var(--ion-color-medium,#8b897f); font-size:.78rem; margin:.25rem 0 .1rem; }
    /* El motivo se LEE sin tocar nada y sin ratón: nunca en un title ni dentro del botón. */
    .leg-reason { margin:.35rem 0 0; color:var(--ion-color-warning-shade,#b26a00); font-size:.82rem; }
    .totals { display:flex; justify-content:space-between; align-items:baseline; font-size:1.05rem; }
    .totals .v { font-weight:800; }
    .block { margin:0; color:var(--ion-color-danger,#d9480f); font-size:.85rem; }
    /* El color de un ion-button dentro de shadow DOM NO puede venir del atributo color="danger":
       esa via pasa por las reglas globales .ion-color-*, que tampoco atraviesan el shadow. Medido: el
       boton salia con fondo transparente y texto blanco, o sea INVISIBLE sobre fondo claro. Las
       custom properties de Ionic si entran, asi que el color se pone por ahi. */
    ion-button.refund-confirm { --background:var(--ion-color-danger,#eb445a);
      --background-activated:var(--ion-color-danger-shade,#cf3c4f);
      --color:var(--ion-color-danger-contrast,#fff); --border-radius:12px; min-height:48px; }
    /* Bloqueado se ve apagado, pero SIGUE recibiendo el toque (aria-disabled, no disabled).
       🔴 El selector va sobre data-blocked, NO sobre [aria-disabled]: medido en un Chromium de
       verdad contra el preview, Ionic MUEVE los aria-* del host al <button> nativo de su shadow
       (el host se queda con class/expand/color y el interior recibe aria-disabled="true"). Es
       decir: el contrato de accesibilidad se cumple, pero un CSS colgado de [aria-disabled] en el
       host no casa NUNCA y el botón se ve encendido estando bloqueado.
       (Y no metas acentos graves en un comentario dentro de una plantilla css: cierran el
       literal.) */
    ion-button.refund-confirm[data-blocked='true'] { opacity:.75; }
    /* Tres viewports: por debajo de 560 px la ficha de la pata apila cifras e importe, que en una
       tablet de mostrador en vertical se salían de la caja. */
    @media (max-width: 559.98px) {
      .leg-head { flex-direction:column; align-items:stretch; }
      .leg-head ion-input { max-width:none; margin-left:0; }
      .leg-figures { gap:.5rem; }
    }
  `;

  /** Venta a devolver. La pantalla está abierta mientras haya id. */
  @property({ attribute: 'sale-id' }) saleId?: string;

  @state() private sale?: Sale;
  @state() private legs: RefundLeg[] = [];
  @state() private methods: Method[] = [];
  @state() draft: RefundDraft = {};
  @state() reason = '';
  @state() private loading = false;
  @state() private error = '';
  @state() private busy = false;

  /** La clave del intento, congelada: un reintento NO la renueva. */
  private key = '';

  private loadedFor?: string;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('saleId')) void this.load();
  }

  private async load(): Promise<void> {
    const saleId = this.saleId;
    if (!saleId || this.loadedFor === saleId) return;
    this.loadedFor = saleId;
    this.loading = true;
    this.error = '';
    try {
      const [sales, legs, methods] = await Promise.all([
        erplora().query<Sale[]>('sales.get', { sale_id: saleId }),
        erplora().query<RefundLeg[]>('sales.refund_options', { sale_id: saleId }),
        erplora().query<Method[]>('sales.payment_methods'),
      ]);
      this.sale = sales?.[0];
      this.legs = (legs ?? []).filter((l) => Number(l.remaining) > 0 || Number(l.charged) > 0);
      this.methods = methods ?? [];
      this.key = newKey(saleId);
      // La PROPUESTA: la devolución entera, a prorrata. Es lo que el operador quiere el 90 % de
      // las veces; el 10 % restante lo edita, que es justo lo que Shopify no deja.
      const split = proportionalSplit(refundableTotal(this.legs), this.legs);
      this.draft = Object.fromEntries(Object.entries(split).map(([id, amount]) => [id, { amount }]));
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e ?? '');
    } finally {
      this.loading = false;
    }
  }

  /** El operador teclea EUROS; lo que se guarda son céntimos. Nada más se recalcula: su reparto. */
  setAmount(paymentId: string, text: string): void {
    this.draft = { ...this.draft, [paymentId]: { ...this.draft[paymentId], amount: parseAmountToCents(text) } };
  }

  private setDestination(paymentId: string, methodId: string): void {
    this.draft = { ...this.draft, [paymentId]: { ...this.draft[paymentId], to: methodId || undefined } };
  }

  private proposeAll(): void {
    const split = proportionalSplit(refundableTotal(this.legs), this.legs);
    this.draft = Object.fromEntries(
      Object.entries(split).map(([id, amount]) => [id, { ...this.draft[id], amount }]),
    );
  }

  /** Por qué no se puede confirmar, ya escrito. `undefined` = adelante. */
  private get blockText(): string | undefined {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const block = refundBlock(this.draft, this.legs);
    if (block?.reason === 'nothing') return t('ui.refundNothingToReturn');
    if (block?.reason === 'over-cap') {
      return t('ui.refundOverCap', {
        method: this.legName(block.leg),
        amount: erplora().formatMoney(block.amount),
        remaining: erplora().formatMoney(block.remaining),
      });
    }
    if (block?.reason === 'needs-destination') {
      return t('ui.refundNeedsDestination', { method: this.legName(block.leg) });
    }
    if (!this.reason.trim()) return t('ui.refundReasonRequired');
    return undefined;
  }

  /** El nombre del método en el idioma del usuario: la fila guarda el nombre canónico del seed. */
  private legName(leg: RefundLeg): string {
    return payMethodDisplayName(
      { id: leg.payment_method_id ?? '', name: leg.payment_method_name },
      (k: string) => erplora().t(CATALOG, k),
    );
  }

  async confirm(): Promise<void> {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    // 🔴 El botón está `aria-disabled`, así que el toque LLEGA aquí. Y aquí se CONTESTA: decir por
    // qué no se puede es el trabajo, no tragarse el toque como haría el `disabled` de Ionic.
    const why = this.blockText;
    if (why) { erplora().notify?.({ type: 'error', message: why }); return; }
    if (this.busy) return;
    this.busy = true;
    try {
      await erplora().command('sales.refund', {
        sale_id: this.saleId,
        reason: this.reason.trim(),
        // La MISMA clave en cada intento: un reintento recupera el documento ya escrito en vez de
        // devolver el dinero por segunda vez (y `refund_ref` sigue siendo el mismo para services).
        idempotency_key: this.key,
        allocations: buildAllocations(this.draft, this.legs),
      });
      erplora().notify?.({ type: 'success', message: t('ui.refundDone') });
      this.dispatchEvent(new CustomEvent('refunded', { bubbles: true, composed: true, detail: { saleId: this.saleId } }));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e ?? '');
      erplora().notify?.({ type: 'error', message: t(refundErrorKey(raw)) });
    } finally {
      this.busy = false;
    }
  }

  private renderLeg(leg: RefundLeg): unknown {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const money = (c: number): string => erplora().formatMoney(c);
    const entry = this.draft[leg.payment_id];
    const eligible = Number(leg.refundable) === 1;
    return html`<div class="leg" data-leg=${leg.payment_id}>
      <div class="leg-head">
        <span class="leg-name">${this.legName(leg)}</span>
        <ion-input
          class="refund-amount"
          type="text"
          inputmode="decimal"
          label=${t('ui.refundLegAmount')}
          label-placement="stacked"
          .value=${formatAmountInput(entry?.amount ?? 0, erplora().locale)}
          @ionInput=${(e: CustomEvent<{ value?: string }>) => this.setAmount(leg.payment_id, e.detail?.value ?? '')}
        ></ion-input>
      </div>
      <div class="leg-figures">
        <span>${t('ui.refundLegCharged')}: ${money(leg.charged)}</span>
        ${leg.refunded > 0 ? html`<span>${t('ui.refundLegRefunded')}: ${money(leg.refunded)}</span>` : nothing}
        <span>${t('ui.refundLegRemaining')}: ${money(leg.remaining)}</span>
      </div>
      ${eligible
        ? nothing
        : html`<p class="leg-reason">${t(reasonKey(leg.reason))}</p>
            ${leg.remaining > 0
              ? html`<ion-select
                  class="refund-destination"
                  label=${t('ui.refundDestination')}
                  label-placement="stacked"
                  .value=${entry?.to ?? ''}
                  @ionChange=${(e: CustomEvent<{ value?: string }>) => this.setDestination(leg.payment_id, e.detail?.value ?? '')}
                >
                  ${this.methods.map((m) => html`<ion-select-option value=${m.id}>${payMethodDisplayName(m, (k: string) => erplora().t(CATALOG, k))}</ion-select-option>`)}
                </ion-select>`
              : nothing}`}
    </div>`;
  }

  render(): unknown {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    if (this.loading) {
      return html`<div class="refund-loading">
        <ion-spinner name="crescent"></ion-spinner>
        <span>${t('ui.refundLoading')}</span>
      </div>`;
    }
    if (this.error) {
      return html`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.error}</ok-inline-feedback>`;
    }
    if (!this.legs.length) {
      return html`<ok-inline-feedback tone="warning" icon="information-circle-outline">${t('ui.refundNothing')}</ok-inline-feedback>`;
    }

    const total = draftTotal(this.draft);
    const block = this.blockText;
    return html`<div class="refund-body">
      <h3>${t('ui.refundTitle', { number: this.sale?.sale_number ?? '' })}</h3>
      <p class="hint">${t('ui.refundExplain')}</p>
      <div class="legs">${this.legs.map((l) => this.renderLeg(l))}</div>
      <ion-button class="refund-propose" size="small" fill="clear" @click=${() => this.proposeAll()}>
        ${t('ui.refundProposeAll')}
      </ion-button>
      <ion-textarea
        class="refund-reason"
        label=${t('ui.refundReasonLabel')}
        label-placement="stacked"
        maxlength="500"
        placeholder=${t('ui.refundReasonPlaceholder')}
        .value=${this.reason}
        @ionInput=${(e: CustomEvent<{ value?: string }>) => { this.reason = e.detail?.value ?? ''; }}
      ></ion-textarea>
      <div class="totals">
        <span>${t('ui.refundTotalLabel')}</span>
        <span class="v">${erplora().formatMoney(total)}</span>
      </div>
      <!-- EL MOTIVO DEL BLOQUEO, ESCRITO EN LA PANTALLA: se lee sin tocar nada y sin un ratón. -->
      ${block ? html`<p class="block">${block}</p>` : nothing}
      <!-- 🔴 aria-disabled, JAMÁS el disabled de Ionic: en modo ios es pointer-events:none y en
           una tablet de mostrador el toque muere en silencio (sales#58). El estado ocupado sí es
           disabled de verdad: ahí no hay nada que contestar y un segundo toque devolvería dos
           veces. (Y no metas acentos graves en un comentario dentro de una plantilla Lit: cierran
           el literal.) -->
      <ion-button
        class="refund-confirm"
        expand="block"
        ?disabled=${this.busy}
        aria-disabled=${block ? 'true' : nothing}
        data-blocked=${block ? 'true' : nothing}
        @click=${() => { void this.confirm(); }}
      >${t('ui.refundConfirm', { amount: erplora().formatMoney(total) })}</ion-button>
    </div>`;
  }
}

define('erp-sale-refund', ErpSaleRefund);
