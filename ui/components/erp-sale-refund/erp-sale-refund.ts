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
import { coveredLines, serviceOrdinals, type SaleLine } from '../../lib/refund-tender.js';
import { payMethodDisplayName } from '../../lib/pay-icons.js';
import { hubDecimals } from '../../lib/hub-currency.js';
import { errorCode } from '../../lib/checkout-key.js';
import { domainErrorText } from '../../lib/domain-error-text.js';
import { transportErrorKey } from '../../lib/transport-error.js';
import { recoverCheckout, type CheckoutRecovery } from '../../lib/checkout-recovery.js';
import {
  forgetPendingRefundKey,
  pendingRefundKey,
  rememberPendingRefundKey,
} from '../../lib/refund-pending-key.js';
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

/**
 * sales#201 — the key for a refused refund, read from the CODE the envelope carries.
 *
 * Same debt as `voidErrorKey` and for the same reason: this used to search the code inside the
 * MESSAGE, which only worked while the handler shipped its refusal as `"<code>: <detail>"`. With
 * the refusal travelling through `Output.error` the message is the detail alone, so the lookup is
 * on the code and it is EXACT.
 */
export function refundErrorKey(code: string): string {
  const key = REFUND_MESSAGES[code];
  if (!key) return 'ui.refundFailed';
  // The short label belongs to the leg row; the toast has room for the whole reason.
  return key === 'ui.refundNeedsDestinationShort' ? 'ui.refundReasonNotEligible' : key;
}

/**
 * sales#451 - a refund the hub never answered: the SDK's `outcomeUnknown` verdict (hub#906, read as
 * a field, never `instanceof`), or - from a shell older than that net - any transport failure
 * (`server_unavailable`, the proxy's HTML page, a cut network). Its outcome is unknown, not refused.
 */
function isUnknownOutcome(e: unknown): boolean {
  if ((e as { outcomeUnknown?: unknown } | null | undefined)?.outcomeUnknown === true) return true;
  return transportErrorKey(e) !== null;
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
  /** sales#166 - the slot registry. Absent in an old shell: then there is no hole. */
  loadSlot?(slot: string): Promise<Array<Record<string, unknown> & { component: string }>>;
}

/** What `sales.refund` returns; `refund_ref` is the STABLE document id (sales#160). */
interface RefundResult { refund_id?: string; refund_ref?: string }

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

/** The idempotency key of the ATTEMPT. Stable while the attempt is open - and, since sales#456,
 *  across closing the screen while its outcome is in doubt: it is what makes a retry recover the
 *  SAME document instead of writing a second refund. */
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
    .refund-checking { display:flex; align-items:center; gap:.6rem; color:var(--ion-color-medium,#8b897f); }
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
    /* The outlined box carries its label on the top border (sales#414): without room above, the
       label runs into the reason line. */
    .refund-destination { margin-top:.75rem; }
    /* sales#166 - WHAT WAS NOT PAID IN MONEY: one card per covered line, with the slot hole
       underneath. A rule separates it from the split above, because they answer two different
       questions: how much money goes back, and what goes back to its tender. */
    .rt-block { border-top:1px solid var(--ion-border-color,#e0ddd4); padding-top:.85rem;
      display:flex; flex-direction:column; gap:.4rem; }
    .rt-lbl { font-weight:700; }
    .rt-list { list-style:none; margin:.2rem 0 0; padding:0; display:flex; flex-direction:column; gap:.5rem; }
    .refund-tender-line { border:1px solid var(--ion-border-color,#e0ddd4);
      border-radius:var(--ok-radius,12px); padding:.6rem .7rem; }
    .rt-name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rt-slot { margin-top:.45rem; }
    .rt-slot:empty { display:none; }
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
  /** sales#451 - the last attempt got no answer from the hub: it may have been recorded. */
  @state() private outcomeUnknown = false;
  /** sales#456 - asking the hub, by the attempt's key, whether that refund was recorded. */
  @state() private checking = false;
  /** sales#456 - the hub answered: no refund under that key. Refunding again is safe. */
  @state() private notRecorded = false;
  /** sales#456 - opened over an attempt left in doubt, and the hub says it WAS recorded. */
  @state() private recoveredOnOpen = false;
  /** sales#462 - that recovered document, until what was not paid in money has been handed it.
   *  The fillers of the closed screen died before learning it; the ones on this screen decide again. */
  @state() private recoveredRef = '';
  /** sales#462 - handing the recovered document to the fillers: a second tap waits. */
  @state() private tenderBusy = false;
  /** sales#462 - what was not paid in money did not go back (or cannot even be read): check it in
   *  its own module. Painted on the screen, which stays open here. */
  @state() private tenderPending = false;
  /** sales#462 - the slot or the covered lines could not be read. */
  private tenderReadFailed = false;

  /** sales#456 - the pause between two questions to a hub that did not answer: an OOM-killed hub
   *  is back in seconds. A property so a test does not wait in real time. */
  recoveryDelayMs = 1500;

  /** sales#166 - the lines an EXTERNAL TENDER paid for (`is_covered`), in read order. */
  @state() private covered: SaleLine[] = [];
  /** The components filling `sales.refund.tender`. Empty = nobody: no hole is painted. */
  @state() private tenderFillers: string[] = [];
  /** The warning each filler wants read BEFORE confirming, per line. The text is THEIRS (their
   *  module, their catalogue): the host only forwards it, as it already does with the table label. */
  @state() private tenderNotices = new Map<string, string>();
  /** One instance per covered line, kept so it is not recreated on every render. */
  private readonly tenderEls = new Map<string, HTMLElement>();

  /** La clave del intento, congelada: un reintento NO la renueva. */
  private key = '';

  private loadedFor?: string;

  connectedCallback(): void {
    super.connectedCallback();
    // Contract of the `sales.refund.tender` slot: the filler says whether what paid that line GOES
    // BACK, and with which warning. Bubbles + composed, so they cross its Shadow DOM and land here
    // without this screen ever learning what a voucher is.
    this.addEventListener('erp:tender-refund-armed', this.onTenderRefundArmed);
    this.addEventListener('erp:tender-refund-disarmed', this.onTenderRefundDisarmed);
    void this.load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('erp:tender-refund-armed', this.onTenderRefundArmed);
    this.removeEventListener('erp:tender-refund-disarmed', this.onTenderRefundDisarmed);
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('saleId')) void this.load();
    this.ensureTenderSlotsMounted();
  }

  /** That line goes back to its external tender. The warning travels with the event because the
   *  line's hole can be off-screen when the thumb is already on the refund button. */
  private readonly onTenderRefundArmed = (e: Event): void => {
    const d = (e as CustomEvent<{ lineRef?: string; warning?: string }>).detail;
    if (!d?.lineRef) return;
    const next = new Map(this.tenderNotices);
    next.set(d.lineRef, String(d.warning ?? ''));
    this.tenderNotices = next;
  };

  /** The filler undid it, or said that line does not go back: its warning stops being announced. */
  private readonly onTenderRefundDisarmed = (e: Event): void => {
    const d = (e as CustomEvent<{ lineRef?: string }>).detail;
    if (!d?.lineRef) return;
    const next = new Map(this.tenderNotices);
    next.delete(d.lineRef);
    this.tenderNotices = next;
  };

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
      await this.resumePendingAttempt(saleId);
      // La PROPUESTA: la devolución entera, a prorrata. Es lo que el operador quiere el 90 % de
      // las veces; el 10 % restante lo edita, que es justo lo que Shopify no deja.
      const split = proportionalSplit(refundableTotal(this.legs), this.legs);
      this.draft = Object.fromEntries(Object.entries(split).map(([id, amount]) => [id, { amount }]));
      await this.loadTenderLines(saleId);
      // sales#462 - the document exists but nobody here can say whether the voucher session went
      // back with it: say where to check, rather than let the session be lost in silence.
      this.tenderPending = !!this.recoveredRef && this.tenderReadFailed;
    } catch (e) {
      // sales#207 (ADR-0398/0055): the CODE decides the sentence, never the server's detail.
      // `e.message` is written for whoever reads a log, in the language the handler was written
      // in, and it used to land here verbatim ("`sale-1` is not in this hub").
      const t = (k: string): string => erplora().t(CATALOG, k);
      const transport = transportErrorKey(e);
      this.error = transport
        ? t(transport)
        : domainErrorText(CATALOG, erplora().locale, e) || t('ui.errorLoadSale');
    } finally {
      this.loading = false;
    }
  }

  /**
   * sales#456 - the screen opens over an attempt whose outcome nobody learnt (closed after «we
   * can't tell», or the tablet died mid-request). Before anything else the hub is asked about THAT
   * key:
   *   recorded      → said on screen; the attempt is closed and a new refund gets a NEW key;
   *   not recorded  → said on screen; the SAME key is kept, so a late write and this retry
   *                   collapse into one document;
   *   cannot ask    → the sales#451 doubt, and the same key kept for the same reason.
   * Without this, refunding a part again from a fresh screen was a second document.
   */
  private async resumePendingAttempt(saleId: string): Promise<void> {
    this.outcomeUnknown = false;
    this.notRecorded = false;
    this.recoveredOnOpen = false;
    this.recoveredRef = '';
    const pending = pendingRefundKey(saleId);
    if (!pending) { this.key = newKey(saleId); return; }
    const recovery = await this.recover(pending);
    if (recovery.outcome === 'charged') {
      forgetPendingRefundKey(saleId);
      this.key = newKey(saleId);
      this.recoveredOnOpen = true;
      // The recovered row IS the document (as in `resolveDoubt`): its id is the reference.
      this.recoveredRef = recovery.saleId;
      return;
    }
    this.key = pending;
    this.notRecorded = recovery.outcome === 'not_charged';
    this.outcomeUnknown = recovery.outcome === 'unknown';
  }

  /** Asks the hub for the refund written under `key` - the same three answers as the till's
   *  checkout recovery (sales#91), where «charged» means the refund document exists. */
  private recover(key: string): Promise<CheckoutRecovery> {
    return recoverCheckout(
      async (k) => (await erplora().query<Array<{ id?: string }>>('sales.refund_by_idempotency_key', { idempotency_key: k })) ?? [],
      key,
      { attempts: 2, delayMs: this.recoveryDelayMs },
    );
  }

  /**
   * The ACCESSORY side of the screen: the lines another tender paid for, and the hole where its
   * owner decides whether they go back (sales#166 / ADR-0386).
   *
   * 🔴 Nothing here may bring down the money refund, which is this screen's authority: a customer
   * waiting for 18,00 € does not go without them because an accessory module did not answer. Hence
   * a `catch` of its own on every step, and the worst case is a section that is not painted.
   *
   * And the lines are not asked for when nobody fills the slot: with no tender owner there is
   * nothing to offer, so the read would be a call no pixel uses.
   */
  private async loadTenderLines(saleId: string): Promise<void> {
    this.covered = [];
    this.tenderNotices = new Map();
    this.tenderReadFailed = false;
    const sdk = erplora();
    if (typeof sdk.loadSlot !== 'function') { this.tenderFillers = []; return; }
    try {
      const rows = (await sdk.loadSlot('sales.refund.tender')) ?? [];
      this.tenderFillers = rows.map((f) => String(f.component));
    } catch {
      this.tenderFillers = [];
      this.tenderReadFailed = true;
    }
    if (!this.tenderFillers.length) return;
    try {
      const lines = await sdk.query<SaleLine[]>('sales.lines', { sale_id: saleId });
      this.covered = coveredLines(lines ?? []);
    } catch {
      this.covered = [];
      this.tenderReadFailed = true;
    }
  }

  /**
   * One filler instance per covered line. Idempotent: the screen re-renders on every keystroke of
   * an amount.
   *
   * 🔴 The four properties are set BEFORE the element is inserted - same reason as in the till
   * (sales#162): the filler starts its read in `connectedCallback`, so inserting it first would
   * make it ask about an empty sale and paint "nothing to give back here" over a session that
   * does go back.
   */
  private ensureTenderSlotsMounted(): void {
    if (!this.tenderFillers.length) return;
    const ordinals = serviceOrdinals(this.covered);
    const alive = new Set<string>();
    for (const l of this.covered) {
      const host = [...this.renderRoot.querySelectorAll<HTMLElement>('.refund-tender-line')]
        .find((n) => n.dataset.line === l.id)
        ?.querySelector<HTMLElement>('.rt-slot');
      if (!host) continue;
      for (const component of this.tenderFillers) {
        const key = `${component}::${l.id}`;
        alive.add(key);
        let el = this.tenderEls.get(key);
        if (!el) {
          el = document.createElement(component);
          this.tenderEls.set(key, el);
        }
        // TYPED data through JS properties, never through attributes (ADR-0043).
        const props = el as HTMLElement & {
          saleId?: string; lineRef?: string; serviceId?: string; lineIndex?: number;
        };
        props.saleId = this.saleId ?? '';
        props.lineRef = l.id;
        props.serviceId = l.product_id ?? '';
        // The ordinal breaks the tie between twins: two identical haircuts on one ticket are two
        // sessions, and without it both holes would claim the first one.
        props.lineIndex = ordinals.get(l.id) ?? 0;
        if (el.parentElement !== host) host.appendChild(el);
      }
    }
    for (const [key, el] of [...this.tenderEls]) {
      if (alive.has(key)) continue;
      el.remove();
      this.tenderEls.delete(key);
    }
  }

  /** The operator types in the hub currency; what is kept is minor units, in its scale (sales#377).
   *  Nothing else is recalculated: the split is theirs. */
  setAmount(paymentId: string, text: string): void {
    this.draft = { ...this.draft, [paymentId]: { ...this.draft[paymentId], amount: parseAmountToCents(text, hubDecimals()) } };
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
    this.outcomeUnknown = false;
    // «Not recorded» answered the LAST attempt; this one gets its own answer. «The earlier refund
    // was recorded» stays: it is still true, and it is why the figures above are what they are.
    this.notRecorded = false;
    const saleId = this.saleId ?? '';
    // sales#456 - written down BEFORE the command leaves: if the answer is lost, or the screen is
    // closed, or the tablet dies, the next screen on this sale starts from this key.
    rememberPendingRefundKey(saleId, this.key);
    try {
      const out = await erplora().command<RefundResult>('sales.refund', {
        sale_id: this.saleId,
        reason: this.reason.trim(),
        // La MISMA clave en cada intento: un reintento recupera el documento ya escrito en vez de
        // devolver el dinero por segunda vez (y `refund_ref` sigue siendo el mismo para services).
        idempotency_key: this.key,
        allocations: buildAllocations(this.draft, this.legs),
      });
      forgetPendingRefundKey(saleId);
      await this.finishRecorded(out);
    } catch (e) {
      // sales#451 - the hub never answered (hub died, proxy 502, network cut): the refund may have
      // been written before the answer was lost, so «could not be recorded» would be a lie. The
      // shell's SDK has already toasted its generic «we can't tell» verdict (hub#906); a second
      // toast here would be a second notice.
      if (isUnknownOutcome(e)) {
        await this.resolveDoubt(saleId);
        return;
      }
      // A refusal is an answer: nothing was written, so nothing is pending.
      forgetPendingRefundKey(saleId);
      erplora().notify?.({ type: 'error', message: t(refundErrorKey(errorCode(e))) });
    } finally {
      this.busy = false;
    }
  }

  /**
   * sales#456 - after «we can't tell», the screen asks the hub itself, by the SAME key, like the
   * till after a checkout without an answer (sales#91). The button stays busy meanwhile: a second
   * tap now would be exactly the double refund this exists to prevent.
   */
  private async resolveDoubt(saleId: string): Promise<void> {
    this.checking = true;
    try {
      const recovery = await this.recover(this.key);
      if (recovery.outcome === 'charged') {
        forgetPendingRefundKey(saleId);
        // The handler answers a retry with `refund_ref` = the document id; the recovered row IS
        // that document, so whoever gives back what was not money gets the same reference.
        await this.finishRecorded({ refund_id: recovery.saleId, refund_ref: recovery.saleId });
        return;
      }
      // Not recorded: the key is KEPT (still pending), so a write that lands late and this retry
      // collapse into one document. Unknown: the sales#451 doubt, with the key kept too.
      this.notRecorded = recovery.outcome === 'not_charged';
      this.outcomeUnknown = recovery.outcome === 'unknown';
    } finally {
      this.checking = false;
    }
  }

  /**
   * sales#462 - the screen opened over a doubt the hub had recorded: the money half is settled, but
   * the fillers that would have given back what was not money died with the closed screen. The
   * operator decides again on the holes of THIS screen, and this hands them the recovered document -
   * the same reference `resolveDoubt` hands them when the check happens without closing. Nothing is
   * refunded in money here, and the screen stays open: what is left of the sale is still below.
   */
  async giveBackRecovered(): Promise<void> {
    const t = (k: string): string => erplora().t(CATALOG, k);
    const ref = this.recoveredRef;
    if (!ref || this.tenderBusy) return;
    this.tenderBusy = true;
    try {
      const committed = await this.commitTenderRefunds({ refund_id: ref, refund_ref: ref });
      // Handed once: a filler commits once per document, so a second offer would do nothing.
      this.recoveredRef = '';
      this.tenderPending = !committed;
      if (committed) erplora().notify?.({ type: 'success', message: t('ui.refundTenderGivenBack') });
    } finally {
      this.tenderBusy = false;
    }
  }

  /** The refund document exists: hand its reference to the tender fillers, say so, and close. */
  private async finishRecorded(out: RefundResult | undefined): Promise<void> {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    // sales#166 - the document EXISTS now: its reference goes to whoever has to give back what
    // was not money, and it is waited for. Closing earlier would unmount the filler mid-command
    // and leave the session spent with nobody at the counter able to give it back.
    const committed = await this.commitTenderRefunds(out);
    erplora().notify?.({ type: 'success', message: t('ui.refundDone') });
    // The money CAME BACK: that is neither undone nor hidden. What failed is named separately,
    // because a failure nobody sees is the one nobody fixes.
    if (!committed) erplora().notify?.({ type: 'error', message: t('ui.refundTenderPending') });
    this.dispatchEvent(new CustomEvent('refunded', { bubbles: true, composed: true, detail: { saleId: this.saleId } }));
  }

  /**
   * Hands every filler the document reference and WAITS for whatever it commits to do.
   *
   * The contract is `respondWith`'s: the detail carries `waitFor(promise)`, and whoever calls it
   * delays the screen's close until it settles. A filler that does not call it blocks nothing - the
   * host cannot force anyone to answer, and waiting forever would be worse than not waiting.
   *
   * Returns whether everything promised went through. It never throws: the money is already back.
   */
  private async commitTenderRefunds(out: RefundResult | undefined): Promise<boolean> {
    const refundRef = String(out?.refund_ref ?? out?.refund_id ?? '');
    if (!refundRef || !this.tenderEls.size) return true;
    const refundId = String(out?.refund_id ?? refundRef);
    const pending: Promise<unknown>[] = [];
    let dispatched = true;
    for (const el of this.tenderEls.values()) {
      const props = el as HTMLElement & { refundId?: string; refundRef?: string };
      // The reference is left as a property too: a filler that reads it on mount does not need to
      // have been listening at the exact moment of the event.
      props.refundId = refundId;
      props.refundRef = refundRef;
      try {
        el.dispatchEvent(new CustomEvent('erp:tender-refund-commit', {
          detail: {
            saleId: this.saleId,
            refundId,
            refundRef,
            waitFor: (p: Promise<unknown>) => { pending.push(Promise.resolve(p)); },
          },
          bubbles: false,
        }));
      } catch {
        // A filler that blows up in its own listener cannot make this screen declare failed a
        // refund the server has already written.
        dispatched = false;
      }
    }
    if (!pending.length) return dispatched;
    const settled = await Promise.allSettled(pending);
    return dispatched && settled.every((s) => s.status === 'fulfilled');
  }

  /**
   * The lines an external tender paid for, with their hole underneath (sales#166 / ADR-0386).
   *
   * They are not part of the split above because they cost no money (`is_covered` -> net 0, tax 0),
   * which is why they need a place of their own: without it, the only way to give a session back
   * would be for the operator to remember to walk into the tender's module, which is exactly what
   * the market gets wrong.
   *
   * With no fillers NOTHING is painted: no header, no list, no empty hole.
   */
  private renderTenderLines(): unknown {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    if (!this.tenderFillers.length || !this.covered.length) return nothing;
    return html`
      <div class="rt-block">
        <div class="rt-lbl">${t('ui.refundLineTenders')}</div>
        <p class="hint">${t('ui.refundLineTendersHint')}</p>
        <ul class="rt-list">
          ${this.covered.map((l) => html`
            <li class="refund-tender-line" data-testid=${`refund-tender-line-${l.id}`} data-line=${l.id}>
              <div class="rt-name">${l.product_name ?? ''}</div>
              <div class="rt-slot"></div>
            </li>`)}
        </ul>
        ${this.renderGiveBackRecovered()}
      </div>`;
  }

  /**
   * sales#462 - offered only over a recovered document and while some hole says its line goes back
   * (an armed filler): with nothing armed there is nothing to hand, and a button that does nothing
   * would claim the opposite.
   */
  private renderGiveBackRecovered(): unknown {
    if (!this.recoveredRef || !this.tenderNotices.size) return nothing;
    return html`<ion-button
      class="refund-tender-commit"
      data-testid="refund-tender-commit"
      expand="block"
      ?disabled=${this.tenderBusy}
      @click=${() => { void this.giveBackRecovered(); }}
    >${erplora().t(CATALOG, 'ui.refundTenderGiveBack')}</ion-button>`;
  }

  /** sales#462 - what was not paid in money did not go back: read on the screen, not in a toast. */
  private renderTenderPending(): unknown {
    if (!this.tenderPending) return nothing;
    return html`<ok-inline-feedback data-testid="refund-tender-pending" tone="warning" icon="alert-circle-outline">${erplora().t(CATALOG, 'ui.refundTenderPending')}</ok-inline-feedback>`;
  }

  /** The warnings the fillers want read BEFORE confirming. They warn; they never block. */
  private renderTenderNotices(): unknown {
    // Keyed by the line the filler armed, not by position: two fillers warning at once would
    // otherwise share one name and getByTestId would pick whichever came first.
    const notices = [...this.tenderNotices.entries()].filter(([, n]) => !!n);
    if (!notices.length) return nothing;
    return notices.map(([ref, n]) => html`
      <ok-inline-feedback class="rt-notice" data-testid=${`refund-tender-notice-${ref}`} tone="warning" icon="alert-circle-outline">${n}</ok-inline-feedback>`);
  }

  private renderLeg(leg: RefundLeg): unknown {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    const money = (c: number): string => erplora().formatMoney(c);
    const entry = this.draft[leg.payment_id];
    const eligible = Number(leg.refundable) === 1;
    return html`<div class="leg" data-testid=${`refund-leg-${leg.payment_id}`} data-leg=${leg.payment_id}>
      <div class="leg-head">
        <span class="leg-name">${this.legName(leg)}</span>
        <ion-input
          class="refund-amount"
          data-testid=${`refund-amount-${leg.payment_id}`}
          type="text"
          inputmode="decimal"
          label=${t('ui.refundLegAmount')}
          fill="outline"
          mode="md"
          label-placement="stacked"
          .value=${formatAmountInput(entry?.amount ?? 0, erplora().locale, hubDecimals())}
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
                  data-testid=${`refund-destination-${leg.payment_id}`}
                  label=${t('ui.refundDestination')}
                  fill="outline"
                  mode="md"
                  label-placement="stacked"
                  .value=${entry?.to ?? ''}
                  @ionChange=${(e: CustomEvent<{ value?: string }>) => this.setDestination(leg.payment_id, e.detail?.value ?? '')}
                >
                  ${this.methods.map((m) => html`<ion-select-option value=${m.id}>${payMethodDisplayName(m, (k: string) => erplora().t(CATALOG, k))}</ion-select-option>`)}
                </ion-select>`
              : nothing}`}
    </div>`;
  }

  /** sales#456 - the attempt left in doubt WAS recorded: read first, above what is left. */
  private renderRecoveredOnOpen(): unknown {
    if (!this.recoveredOnOpen) return nothing;
    return html`<ok-inline-feedback data-testid="refund-recovered" tone="success" icon="checkmark-circle-outline">${erplora().t(CATALOG, 'ui.refundRecoveredOnOpen')}</ok-inline-feedback>`;
  }

  render(): unknown {
    const t = (k: string, p?: Record<string, unknown>): string => erplora().t(CATALOG, k, p);
    if (this.loading) {
      return html`<div class="refund-loading" data-testid="refund-loading">
        <ion-spinner name="crescent"></ion-spinner>
        <span>${t('ui.refundLoading')}</span>
      </div>`;
    }
    if (this.error) {
      return html`<ok-inline-feedback data-testid="refund-error" tone="danger" icon="alert-circle-outline">${this.error}</ok-inline-feedback>`;
    }
    if (!this.legs.length) {
      return html`${this.renderRecoveredOnOpen()}<ok-inline-feedback data-testid="refund-nothing" tone="warning" icon="information-circle-outline">${t('ui.refundNothing')}</ok-inline-feedback>`;
    }

    const total = draftTotal(this.draft);
    const block = this.blockText;
    return html`<div class="refund-body" data-testid="refund-form">
      <h3>${t('ui.refundTitle', { number: this.sale?.sale_number ?? '' })}</h3>
      ${this.renderRecoveredOnOpen()}
      ${this.renderTenderPending()}
      <p class="hint">${t('ui.refundExplain')}</p>
      <div class="legs">${this.legs.map((l) => this.renderLeg(l))}</div>
      ${this.renderTenderLines()}
      <ion-button class="refund-propose" data-testid="refund-propose-all" size="small" fill="clear" @click=${() => this.proposeAll()}>
        ${t('ui.refundProposeAll')}
      </ion-button>
      <ion-textarea
        class="refund-reason"
        data-testid="refund-reason"
        label=${t('ui.refundReasonLabel')}
        fill="outline"
        mode="md"
        label-placement="stacked"
        maxlength="500"
        placeholder=${t('ui.refundReasonPlaceholder')}
        .value=${this.reason}
        @ionInput=${(e: CustomEvent<{ value?: string }>) => { this.reason = e.detail?.value ?? ''; }}
      ></ion-textarea>
      <div class="totals">
        <span>${t('ui.refundTotalLabel')}</span>
        <span class="v" data-testid="refund-total">${erplora().formatMoney(total)}</span>
      </div>
      <!-- EL MOTIVO DEL BLOQUEO, ESCRITO EN LA PANTALLA: se lee sin tocar nada y sin un ratón. -->
      ${block ? html`<p class="block" data-testid="refund-blocked">${block}</p>` : nothing}
      <!-- And the external tenders' warnings, next to the button: the line's hole can be
           off-screen when the thumb is already on the refund button (sales#166). -->
      ${this.renderTenderNotices()}
      ${this.checking
        ? html`<div class="refund-checking" data-testid="refund-checking" role="status">
            <ion-spinner name="crescent"></ion-spinner><span>${t('ui.refundChecking')}</span>
          </div>`
        : nothing}
      ${this.outcomeUnknown
        ? html`<ok-inline-feedback data-testid="refund-unknown" tone="warning" icon="help-circle-outline">${t('ui.refundUnknown')}</ok-inline-feedback>`
        : nothing}
      ${this.notRecorded
        ? html`<ok-inline-feedback data-testid="refund-not-recorded" tone="info" icon="information-circle-outline">${t('ui.refundNotRecorded')}</ok-inline-feedback>`
        : nothing}
      <!-- 🔴 aria-disabled, JAMÁS el disabled de Ionic: en modo ios es pointer-events:none y en
           una tablet de mostrador el toque muere en silencio (sales#58). El estado ocupado sí es
           disabled de verdad: ahí no hay nada que contestar y un segundo toque devolvería dos
           veces. (Y no metas acentos graves en un comentario dentro de una plantilla Lit: cierran
           el literal.) -->
      <ion-button
        class="refund-confirm"
        data-testid="refund-confirm"
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
