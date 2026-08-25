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
  /** sales#166 — el registro de slots. Ausente en un shell viejo: entonces no hay hueco. */
  loadSlot?(slot: string): Promise<Array<Record<string, unknown> & { component: string }>>;
}

/** Lo que `sales.refund` devuelve; `refund_ref` es el id ESTABLE del documento (sales#160). */
interface RefundResult { refund_id?: string; refund_ref?: string }

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
    /* sales#166 — LO QUE NO SE PAGÓ EN DINERO: una tarjeta por línea cubierta, con el hueco del
       slot debajo. Se separa del reparto de arriba con una regla, porque son dos preguntas
       distintas: cuánto dinero vuelve, y qué vuelve a su tender. */
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

  /** sales#166 — las líneas que pagó un TENDER EXTERNO (`is_covered`), en orden de lectura. */
  @state() private covered: SaleLine[] = [];
  /** Los componentes que rellenan `sales.refund.tender`. Vacío = nadie: no se pinta hueco. */
  @state() private tenderFillers: string[] = [];
  /** El aviso que cada filler quiere que se lea ANTES de confirmar, por línea. El texto es SUYO
   *  (su módulo, su catálogo): el host solo lo reenvía, como ya hace con la etiqueta de mesa. */
  @state() private tenderNotices = new Map<string, string>();
  /** Una instancia por línea cubierta, guardada para no recrearla en cada render. */
  private readonly tenderEls = new Map<string, HTMLElement>();

  /** La clave del intento, congelada: un reintento NO la renueva. */
  private key = '';

  private loadedFor?: string;

  connectedCallback(): void {
    super.connectedCallback();
    // Contrato del slot `sales.refund.tender`: el filler dice si lo que pagó esa línea VUELVE, y
    // con qué aviso. Bubbles + composed, así que cruzan su Shadow DOM y llegan aquí sin que esta
    // pantalla sepa qué es un bono.
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

  /** Esa línea vuelve a su tender externo. El aviso viaja con el evento porque el hueco de la
   *  línea puede quedar fuera de pantalla cuando el pulgar ya está sobre «Devolver». */
  private readonly onTenderRefundArmed = (e: Event): void => {
    const d = (e as CustomEvent<{ lineRef?: string; warning?: string }>).detail;
    if (!d?.lineRef) return;
    const next = new Map(this.tenderNotices);
    next.set(d.lineRef, String(d.warning ?? ''));
    this.tenderNotices = next;
  };

  /** El filler lo deshizo, o dijo que esa línea no vuelve: su aviso deja de anunciarse. */
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
      this.key = newKey(saleId);
      // La PROPUESTA: la devolución entera, a prorrata. Es lo que el operador quiere el 90 % de
      // las veces; el 10 % restante lo edita, que es justo lo que Shopify no deja.
      const split = proportionalSplit(refundableTotal(this.legs), this.legs);
      this.draft = Object.fromEntries(Object.entries(split).map(([id, amount]) => [id, { amount }]));
      await this.loadTenderLines(saleId);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e ?? '');
    } finally {
      this.loading = false;
    }
  }

  /**
   * El lado ACCESORIO de la pantalla: las líneas que pagó otro tender y el hueco donde su dueño
   * decide si vuelven (sales#166 / ADR-0386).
   *
   * 🔴 Nada de aquí puede tumbar la devolución del dinero, que es la autoridad de esta pantalla:
   * un cliente esperando 18,00 € no se queda sin ellos porque un módulo accesorio no responda. Por
   * eso cada paso trae su propio `catch` y el peor caso es una sección que no se pinta.
   *
   * Y no se pregunta por las líneas si nadie rellena el slot: sin dueño del tender no hay nada que
   * ofrecer, así que la lectura sería una llamada que ningún píxel usa.
   */
  private async loadTenderLines(saleId: string): Promise<void> {
    this.covered = [];
    this.tenderNotices = new Map();
    const sdk = erplora();
    if (typeof sdk.loadSlot !== 'function') { this.tenderFillers = []; return; }
    try {
      const rows = (await sdk.loadSlot('sales.refund.tender')) ?? [];
      this.tenderFillers = rows.map((f) => String(f.component));
    } catch {
      this.tenderFillers = [];
    }
    if (!this.tenderFillers.length) return;
    try {
      const lines = await sdk.query<SaleLine[]>('sales.lines', { sale_id: saleId });
      this.covered = coveredLines(lines ?? []);
    } catch {
      this.covered = [];
    }
  }

  /**
   * Una instancia del filler por línea cubierta. Idempotente: la pantalla se re-renderiza con
   * cada tecla del importe.
   *
   * 🔴 Las cuatro propiedades se ponen ANTES de insertar el elemento — misma razón que en el TPV
   * (sales#162): el filler arranca su lectura en `connectedCallback`, así que insertarlo primero
   * le haría preguntar por una venta vacía y pintar «aquí no hay nada que devolver» encima de una
   * sesión que sí vuelve.
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
        // Datos TIPADOS por propiedad JS, nunca por atributo (ADR-0043).
        const props = el as HTMLElement & {
          saleId?: string; lineRef?: string; serviceId?: string; lineIndex?: number;
        };
        props.saleId = this.saleId ?? '';
        props.lineRef = l.id;
        props.serviceId = l.product_id ?? '';
        // El ordinal desempata a los gemelos: dos cortes iguales en el mismo tique son dos
        // sesiones, y sin él los dos huecos reclamarían la primera.
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
      const out = await erplora().command<RefundResult>('sales.refund', {
        sale_id: this.saleId,
        reason: this.reason.trim(),
        // La MISMA clave en cada intento: un reintento recupera el documento ya escrito en vez de
        // devolver el dinero por segunda vez (y `refund_ref` sigue siendo el mismo para services).
        idempotency_key: this.key,
        allocations: buildAllocations(this.draft, this.legs),
      });
      // sales#166 — el documento YA existe: se le pasa su referencia a quien tenga que devolver lo
      // que no era dinero, y se le espera. Cerrar antes desmontaría al filler a mitad de su
      // command, y la sesión se quedaría gastada sin que nadie en la caja pueda devolverla.
      const committed = await this.commitTenderRefunds(out);
      erplora().notify?.({ type: 'success', message: t('ui.refundDone') });
      // El dinero VOLVIÓ: eso no se deshace ni se esconde. Lo que falló se nombra aparte, porque
      // un fallo que no se ve es el que nadie arregla.
      if (!committed) erplora().notify?.({ type: 'error', message: t('ui.refundTenderPending') });
      this.dispatchEvent(new CustomEvent('refunded', { bubbles: true, composed: true, detail: { saleId: this.saleId } }));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e ?? '');
      erplora().notify?.({ type: 'error', message: t(refundErrorKey(raw)) });
    } finally {
      this.busy = false;
    }
  }

  /**
   * Le entrega a cada filler la referencia del documento y ESPERA a lo que se comprometa a hacer.
   *
   * El contrato es el de `respondWith`: el detalle lleva `waitFor(promise)` y quien la use retrasa
   * el cierre de la pantalla hasta que termine. Un filler que no la usa no bloquea nada — el host
   * no puede obligar a nadie a contestar, y una espera indefinida sería peor que no esperar.
   *
   * Devuelve si cuanto se prometió salió bien. Nunca lanza: aquí el dinero ya volvió.
   */
  private async commitTenderRefunds(out: RefundResult | undefined): Promise<boolean> {
    const refundRef = String(out?.refund_ref ?? out?.refund_id ?? '');
    if (!refundRef || !this.tenderEls.size) return true;
    const refundId = String(out?.refund_id ?? refundRef);
    const pending: Promise<unknown>[] = [];
    let dispatched = true;
    for (const el of this.tenderEls.values()) {
      const props = el as HTMLElement & { refundId?: string; refundRef?: string };
      // La referencia queda también como propiedad: un filler que la lee al montarse no necesita
      // haber estado escuchando en el momento exacto del evento.
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
        // Un filler que revienta en su propio listener no puede hacer que esta pantalla declare
        // fallida una devolución que el servidor ya escribió.
        dispatched = false;
      }
    }
    if (!pending.length) return dispatched;
    const settled = await Promise.allSettled(pending);
    return dispatched && settled.every((s) => s.status === 'fulfilled');
  }

  /**
   * Las líneas que pagó un tender externo, con su hueco debajo (sales#166 / ADR-0386).
   *
   * No entran en el reparto de arriba porque no costaron dinero (`is_covered` → base 0, cuota 0),
   * y por eso necesitan sitio propio: sin él, la única forma de devolver la sesión sería que el
   * operador se acordara de ir al módulo del bono, que es exactamente lo que el mercado hace mal.
   *
   * Sin fillers no se pinta NADA: ni cabecera, ni lista, ni hueco vacío.
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
            <li class="refund-tender-line" data-line=${l.id}>
              <div class="rt-name">${l.product_name ?? ''}</div>
              <div class="rt-slot"></div>
            </li>`)}
        </ul>
      </div>`;
  }

  /** Los avisos que los fillers quieren que se lean ANTES de confirmar. Avisan; no bloquean. */
  private renderTenderNotices(): unknown {
    const notices = [...this.tenderNotices.values()].filter((n) => !!n);
    if (!notices.length) return nothing;
    return notices.map((n) => html`
      <ok-inline-feedback class="rt-notice" tone="warning" icon="alert-circle-outline">${n}</ok-inline-feedback>`);
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
      ${this.renderTenderLines()}
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
      <!-- Y los avisos de los tenders externos, junto al botón: el hueco de la línea puede quedar
           fuera de pantalla cuando el pulgar ya está sobre «Devolver» (sales#166). -->
      ${this.renderTenderNotices()}
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
