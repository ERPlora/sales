import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { define } from '@erplora/outfitkit/define';
import { bindTabbar } from '@erplora/outfitkit/tabbar';
import { hubDecimals, minorToTyped, pushTypedKey, typedToMinor } from '../../lib/hub-currency.js';
import { currencySymbol } from '../../lib/currency-symbol.js';
import { renderDocumentModal } from '../../lib/document-modal.js';
import { orderToPrebill, receiptLabels, type PrebillValuation } from '../../lib/document-mappers.js';
// La CUENTA se imprime con la forma que lee el renderizador ESC/POS, no con la de la pantalla
// (sales#78): son dos documentos con el mismo contenido y distintas claves.
import { prebillToPrintDocument, prebillJobId } from '../../lib/print-document.js';
import type { PrintedModifier } from '../../lib/paper-modifiers.js';
import type { PrintedCombo } from '../../lib/paper-combos.js';
import { receiptToPrintableHtml, printHtmlInIframe } from '../../lib/receipt-html.js';
import { decideOnTableChange } from '../../lib/table-switch.js';
import { defaultParkLabel } from '../../lib/park-label.js';
import { pendingLines, nextRoundNo, isLineLocked } from '../../lib/rounds.js';
import { buildFirePayload } from '../../lib/fire-order.js';
import { createSerialQueue } from '../../lib/serial-queue.js';
import { splitPayload } from '../../lib/split-selection.js';
// hub#297 — el techo de la simplificada. La REGLA vive en lib (probada sin DOM); aquí solo se
// pregunta. El techo NO está escrito en este módulo: llega como dato de `hub.fiscal.limits`.
import { isOverSimplifiedLimit, ticketIsBlocked, recipientIsComplete } from '../../lib/simplified-limit.js';
import { forgetCurrentCheck, rememberCurrentCheck, resolveCurrentCheck } from '../../lib/current-check.js';
import { brandSvgFor } from '../../lib/brand-icons.js';
import {
  HOME_COUNTRY, ID_TYPE_OPTIONS, countryOptions, defaultIdType, recipientCountryPayload, recipientFromDetail,
} from '../../lib/foreign-recipient.js';
import { priceLabel } from '../../lib/price-label.js';
// sales#28 — the OPTIONAL scale contract. `sales` never talks to hardware: whoever CAN weigh
// (`erplora-app` → `crates/peripherals`, ADR-0196/0204) dispatches one `window` event and this
// screen decides which line it belongs to. Nobody dispatching = the POS of today.
import {
  SCALE_WEIGHT_EVENT, parseScaleReading, scaleTargetLine, scaleVerdict,
} from '../../lib/scale-entry.js';
import { hasQuickNote, toggleQuickNote } from '../../lib/quick-note-text.js';
// sales#153 (ADR-0381) — las REGLAS del picker del menú viven en lib, probadas sin DOM: qué
// elecciones son legales, qué grupo queda sin resolver y qué total se MUESTRA. El precio que se
// cobra lo pone el servidor contra `combos.options.all`; esto es la propuesta, no la decisión.
import {
  canConfirmCombo, comboBlockReason, comboTotalCents, groupComboRows,
  type Combo, type ComboGroup, type ComboOption,
} from '../../lib/combo-picker.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { payMethodIcon, needsTendered, enabledPayMethods, defaultPayMethod, payMethodDisplayName } from '../../lib/pay-icons.js';
// sales#223 — the policy is resolved at the door: ONE set of defaults for the whole screen, so a
// hub with no settings row is the same till as one that saved the defaults.
import { withPosSettingsDefaults, type PosSettings } from '../../lib/pos-settings.js';
// sales#269 — the discount whoever is charging may give ALONE, and which checkout the till uses
// above it. The arithmetic mirrors the server's `enforce_discount_cap`, which is the authority.
import {
  CHECKOUT_OVER_LIMIT_COMMAND, approvalDiscountPercent, checkoutCommand, discountCap, needsManagerApproval,
} from '../../lib/discount-cap.js';
// sales#159 (ADR-0386) — una venta, N cobros. La ARITMÉTICA del reparto vive en lib (probada sin
// DOM): el restante, lo que cubre cada pata, el cambio —que sale SOLO del efectivo— y el
// `payments[]` que se le entrega al servidor.
import {
  buildPaymentsPayload, changeDue, chargeBlock, planTender, remainingCents, type Tender,
} from '../../lib/split-tender.js';
import { tenderableLines, coverableLine, uncoveredLines, splitCount, linePart } from '../../lib/line-tender.js';
// The bill is painted by ok-receipt HERE, so it is registered here. It used to arrive only
// transitively (document-modal → erp-sales-document), i.e. by accident: dropping that unrelated
// import would have left `<ok-receipt>` an unknown element and the bill blank again.
import '@erplora/outfitkit/ok-receipt';
import '@erplora/outfitkit/ok-qty-stepper';
import '@erplora/outfitkit/ok-spotlight-search';
import '@erplora/outfitkit/ok-empty-state';
import '@erplora/outfitkit/ok-status-pill';
import {
  mergeCartLines, listOpenChecks, type OpenCheck,
  // ADR-0141: el carrito lo respalda un PEDIDO real (filas), no un blob con debounce.
  openOrderWithLines, addOrderLine, addOpenPriceLine, updateOrderLineQty, updateOrderLineDiscount, updateOrderLineNote, updateOrderLineStaff, persistLineQty, removeOrderLine, loadOrderLines, mergeOrders, splitOrder, splitOrderLine,
  unitContextPayload, lineAmount, cartTotal, unitPriceWithModifiers, type CartLine, type ErploraClientLike,
} from '../../lib/pos-cart.js';
import { loadTaxCatalog, productSellability, resolveLineTax, type TaxCatalog } from '../../lib/pos-tax.js';
// sales#164 — the total being charged is the SERVER's, with the very SAME arithmetic it charges.
import {
  checkoutItems, fetchCheckoutPreview, previewSignature,
  type CheckoutPreview, type CheckoutShape,
} from '../../lib/checkout-preview.js';
import { capabilityRead, dependencyRead, type DependencyRead } from '../../lib/dependency-read.js';
import { buildOpenPriceLine } from '../../lib/pos-open-price.js';
// La frontera de la ESCALA de cantidades (ADR-0147): la UI trabaja en lógico (0,5), el cable en 10⁶.
import { toMicro, fromMicro, onGrid, formatQuantity } from '../../lib/quantity.js';
import { checkoutErrorKey, errorCode, newIdempotencyKey } from '../../lib/checkout-key.js';
import { certificateExpiryDays, fiscalRoadKey, isFiscalRoadRefusal, readFiscalRoad, type FiscalRoad } from '../../lib/fiscal-road.js';
import { printReceiptIntent, readAutoPrint } from '../../lib/print-intent.js';
// sales#81: el transporte del SDK filtra el HTML del 502 del proxy como un SyntaxError crudo
// («<!DOCTYPE … is not valid JSON»). Esta es la frontera del módulo: traducirlo a un mensaje de
// negocio para el cajero (la guarda `res.ok` del SDK se persigue aparte, en el hub).
import { transportErrorKey, SERVER_UNAVAILABLE_KEY } from '../../lib/transport-error.js';
import { recoverCheckout } from '../../lib/checkout-recovery.js';
// ADR-0398: the sentence a DECLARED domain code carries, for the paths this screen has nothing
// better to say about than the catalogue does.
import { domainErrorText } from '../../lib/domain-error-text.js';
import { MediaPhotoCache } from '../../lib/media-photo-cache.js';
// Catálogo i18n del módulo (ADR-0055): esbuild inlinea estos JSON en el `dist` del WC.
import esLocale from '../../../locales/es.json';
import enLocale from '../../../locales/en.json';
const CATALOG: Record<string, unknown> = { es: esLocale, en: enLocale };

// erp-pos-touch — pantalla de venta TÁCTIL. A la izquierda conserva el catálogo del Hub con un
// segmento horizontal de categorías y tarjetas de producto; a la derecha, la cuenta. Los módulos
// externos añaden sus controles por slots (mesa/cliente/cocina), sin imports ni dependencias desde
// sales. En móvil la cuenta se recoge a un drawer. Quitar línea = cantidad a 0. Al cobrar:
// `sales.complete_sale` (channel='pos') → documento.

/** Fila de `services.services.list` (sales#89). Es la superficie vendible del módulo `services`;
 *  `sales` solo lee lo que necesita para cobrar: qué es, cuánto vale y con qué IVA. */
interface ServiceRow {
  id: string; name: string; price?: number; pricing_type?: string;
  category_id?: string; tax_category_key?: string;
}
/** Categoría de servicio (`services.categories.list`) — se muestra como una pestaña más. */
interface ServiceCat { id: string; name: string; }

/** Fila de `appointments.appointments.get` (ADR-0077). `sales` lee SOLO lo que necesita para
 *  armar la línea y atribuir la venta; el resto del dominio de citas no le incumbe. */
interface AppointmentRow {
  id?: string; customer_id?: string; customer_name?: string; staff_id?: string; staff_name?: string;
  service_id?: string; service_name?: string; service_price?: number;
}

/** A person of the hub (`hub.users.list`), the core's RESERVED namespace (ADR-0192).
 *
 *  Personnel belongs to the CORE, not to the `staff` module: asking `staff` would turn into a hard
 *  dependency a till that has to work in a hub where that module is not installed. */
interface HubUser { id: string; name: string; role?: string; is_active?: boolean; }

/** A professional of the business's TEAM as `staff.members.list` answers it (sales#318): the
 *  records the agenda books, whether or not the person ever signs in. `user_id` is the ADR-0192
 *  link to a hub user — optional both ways. */
interface TeamMember {
  id: string; full_name?: string; first_name?: string; last_name?: string;
  user_id?: string | null; status?: string; order?: number | string | null;
}

/** One row of the «who is serving» picker. `userId` = the hub user this row ALSO stands for, so a
 *  check or a line that carries either of the person's two ids ticks the same row. */
interface StaffOption { id: string; name: string; userId?: string; }

/** Team records that are not an option to serve today — the same two `staff.commissions.summary`
 *  leaves out of the day's close. `on_leave` stays: she is still on the team. */
const TEAM_NOT_SERVING = new Set(['terminated', 'inactive']);

function teamMemberName(m: TeamMember): string {
  return (m.full_name || `${m.first_name ?? ''} ${m.last_name ?? ''}`).trim();
}

/** Who the till offers to serve (sales#318): the TEAM first, in the agenda's order, then every
 *  person who signs in and is not already one of them.
 *
 *  A record linked to a hub user is ONE row, under the record's id — the id an appointment already
 *  sends (ADR-0077), so a walk-in and a booked cut by the same professional add up as one. Listing
 *  «Ana» beside «Ana García» would make the receptionist guess which one earns the commission. The
 *  link only folds while the record is offered: a person whose record is no longer active is still
 *  somebody who signs in, and stays offered as herself. */
function composeStaffOptions(people: HubUser[], team: TeamMember[]): StaffOption[] {
  const serving = team
    .filter((m) => !!m.id && !TEAM_NOT_SERVING.has(m.status ?? '') && !!teamMemberName(m))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
      || teamMemberName(a).localeCompare(teamMemberName(b)));
  const members: StaffOption[] = serving.map((m) => ({
    id: m.id, name: teamMemberName(m), ...(m.user_id ? { userId: m.user_id } : {}),
  }));
  const folded = new Set(members.map((o) => o.userId).filter((id): id is string => !!id));
  return [...members, ...people.filter((u) => !folded.has(u.id)).map((u) => ({ id: u.id, name: u.name }))];
}

/** Formas de precio que el TPV sabe cobrar HOY. `from`/`hourly`/`variable` son un precio de
 *  PARTIDA, no el precio: cobrarlos tal cual sería equivocarse en silencio, y aún no hay flujo de
 *  precio abierto. Se pintan bloqueados con su motivo (misma puerta que sales#74). */
const CLOSED_PRICING = new Set(['fixed', 'free', '']);

interface Product {
  id: string; name: string; sku?: string; price: number; cost?: number; is_active?: number;
  product_type?: string; image?: string; tax_category_key?: string;
  /** SERVICIO (sales#89): no sale del catálogo de `inventory`, no descuenta stock. Viaja hasta
   *  `complete_sale` para que el handler no lo mida contra el catálogo de productos. */
  is_service?: boolean;
  /** `pricing_type` del servicio de origen; ausente en un producto de inventario. */
  pricing_type?: string;
  // ADR-0147: unidad base + cantidad de precio del maestro (inventory/006). El POS los CONGELA
  // en la línea al añadirla — el histórico nunca relee el maestro.
  unit_code?: string; price_quantity_value?: number; pricing_unit_code?: string;
}
/** Fila de `inventory.units.list` (registro de unidades, ADR-0147). */
interface UnitRow {
  code: string; name?: string; increment_value?: number; factor_num?: number; factor_den?: number;
  /** `count|mass|volume|time`. `mass` is what makes a line weighable (sales#28): the registry
   *  already knows it, so the till never hard-codes `kg` nor asks the catalogue for a new flag. */
  category?: string;
}
interface PayMethod {
  id: string; name: string; type?: string;
  /** 1 = pide importe entregado y calcula cambio (efectivo); 0 = importe exacto (tarjeta, Bizum…). */
  requires_change?: number;
}
/** sales#206 — a note the business preconfigured for the line-note sheet. */
interface QuickNote { id: string; text: string; sort_order?: number; }

/**
 * The name a numpad key answers to (sales#291). The three keypads of this screen are drawn from
 * `['1'…'9', '.', '0', 'C']`, and the last two would land in the DOM as `-.` and `-C`: a dot is a
 * class selector to anything that parses CSS, and an upper-case letter is the one thing the
 * convention of `architecture/hub/apps/testids.md` does not allow. The digits keep their own name.
 */
const keypadId = (key: string): string => (key === '.' ? 'dot' : key === 'C' ? 'clear' : key);
interface Category { id: string; name: string; icon?: string; color?: string; image?: string; product_count?: number; }
interface ProdCat { product_id: string; category_id: string; }
/** Categoría fiscal (`taxes.categories.list`, ADR-0085) = el "departamento" de la venta por precio
 *  libre: lleva su IVA (el % lo resuelve el servidor; el ratesMap solo es preview).
 *
 * `display_name` es el nombre YA TRADUCIDO al idioma de quien pregunta (taxes#38): el canónico
 * `name` es inglés del seed («Product — generic») y sales no puede traducirlo él — el catálogo
 * i18n de otro módulo no se importa (ADR-0043), la query es la única puerta. Sin `display_name`
 * (un taxes más viejo) se degrada al nombre crudo. */
interface TaxCategory { key: string; name: string; display_name?: string; is_active?: number; }

/** El nombre que se PINTA y se CONGELA de un departamento: el idioma del hub si taxes lo dio. */
function deptDisplayName(c: TaxCategory): string {
  return c.display_name || c.name;
}

/** sales#267 — un departamento que el NEGOCIO definió (`sales.departments.list`). */
interface DepartmentRow { id: string; name: string; tax_category_key: string; sort_order?: number; }

/** Lo que la hoja de precio libre ofrece, venga de donde venga.
 *
 *  `key` es lo que identifica el botón y lo que guarda `openDept`; `taxCategoryKey` es lo que
 *  COBRA. Son dos campos y no uno a propósito: dos departamentos del negocio pueden compartir
 *  categoría fiscal —en España «Refrescos y alcohol» y «Droguería» son ambos 21 %— y con una sola
 *  clave se fundirían en un botón y el tique congelaría el nombre de la familia equivocada.
 *
 *  En el camino de respaldo (sin departamentos propios) `key` ES la categoría fiscal, que es
 *  exactamente lo que guardaba antes de sales#267: el flujo de venta de siempre queda intacto. */
interface PosDepartment { key: string; name: string; taxCategoryKey: string; }

/** Los departamentos del negocio, ordenados por lo que él decidió; a igualdad, por nombre.
 *
 *  Se ordena aquí ADEMÁS de pedirlo en la lectura, por el mismo motivo que las notas rápidas: el
 *  orden es lo único que el negocio configura aparte del nombre, y no puede depender de que una
 *  página de una lista llegue en el orden en que se pidió. */
function toDepartments(own: DepartmentRow[], taxCats: TaxCategory[]): PosDepartment[] {
  if (own.length) {
    return own
      .slice()
      .sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || a.name.localeCompare(b.name))
      .map((d) => ({ key: d.id, name: d.name, taxCategoryKey: d.tax_category_key }));
  }
  return taxCats.map((c) => ({ key: c.key, name: deptDisplayName(c), taxCategoryKey: c.key }));
}

/** The PERCENT discount keypad: 'C' clears, one separator, 9 characters at most. A percentage is
 *  not money, so the hub currency scale does not apply (12.5 % is fine in a hub in yen). */
function pushPercentKey(cur: string, k: string): string {
  if (k === 'C') return '';
  if (k === '.' && cur.includes('.')) return cur;
  return (cur + k).slice(0, 9);
}
interface IonicAlertElement extends HTMLElement {
  header: string;
  message: string;
  buttons: Array<{ text: string; role: string }>;
  isOpen: boolean;
  present?: () => Promise<void>;
  dismiss?: () => Promise<boolean>;
}

/** Lo que contesta la puerta de impresión del shell (`apps/web/src/lib/print.ts`). `bridge` salió
 *  por una impresora, `queue` espera a un host que la drene; el resto NO ha salido papel. */
interface PrintOutcome {
  via?: string;
  error?: string;
}

/** i18n del módulo (ADR-0055): idioma activo + traducción del catálogo `ui`. */
interface I18nClient {
  locale: string;
  t(catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string;
}

function erplora(): ErploraClientLike {
  const c = (globalThis as { erplora?: ErploraClientLike }).erplora;
  if (!c) throw new Error('erplora SDK no inicializado por el shell');
  return c;
}

/** Lectura OPCIONAL a un módulo que puede no estar instalado (ADR-0127): `undefined` = no está,
 *  y el TPV sigue funcionando sin él.
 *
 *  Envuelve `queryOptional` en vez de llamarlo a pelo porque el TPV es la pantalla que NO puede
 *  romperse: un shell antiguo sin ese método haría estallar el `connectedCallback` entero —
 *  sin rejilla, sin carrito y sin slots— por una integración accesoria. Aquí ausencia y fallo se
 *  responden igual: no hay catálogo extra que ofrecer, se cobra lo de siempre. */
async function optionalRead(read: (c: ErploraClientLike) => Promise<unknown>): Promise<unknown | undefined> {
  try {
    const c = erplora() as Partial<ErploraClientLike>;
    if (typeof c.queryOptional !== 'function') return undefined;
    return await read(c as ErploraClientLike);
  } catch {
    return undefined;
  }
}

/** The runtime's per-request ceiling, and what sales#184 used to ask for: see `optionalCatalogRead`. */
const LEGACY_PAGE_LIMIT = 500;

/** Is a catalogue source switched ON? (sales#25)
 *
 *  The flag is the 0/1 INTEGER of the portable SQL subset (ADR-0007). It arrives already resolved
 *  by `withPosSettingsDefaults` (sales#223), so absence is not a case here any more: both sources
 *  default to ON — products always did, and services have shown ever since sales#89 whenever
 *  `services` was installed — and that default is declared ONCE, in `POS_SETTINGS_DEFAULTS`.
 *  Declaring it a second time here is exactly the shape of defect sales#223 was. */
function catalogSourceOn(v: unknown): boolean {
  return v !== 0;
}

/** The apps whose catalogue the till reads and whose FAILURE is an incident, in the order their
 *  notices are painted (sales#25).
 *
 *  `taxes` is the one hard dependency left: with no tax rule no sale can close at all
 *  (`sales.complete_sale` declares `taxes.rules.list` as a `required` read). `inventory` is here
 *  too even though it is now an OPTIONAL capability (ADR-0127) — being optional makes its ABSENCE
 *  legitimate, not its silence: an `inventory` that IS in this hub and does not answer is an
 *  incident exactly as before, and it is the only thing standing between a cashier and a shift
 *  spent wondering where the products went. */
const HARD_DEPENDENCIES = ['inventory', 'taxes'] as const;

/** Every app whose broken catalogue the till reports, in the fixed order the notices are painted.
 *
 *  sales#273 — `services` is here even though it is NOT a dependency at all. Being outside
 *  `depends_on` makes its ABSENCE legitimate (ADR-0127) and that stays silent; it says nothing
 *  about its SILENCE. A salon whose service catalogue read fails used to get exactly the till of a
 *  hub that never installed `services`: 22 shelf products, «no products» when searching «Corte»,
 *  the family tabs counting 0, and not one word about why — which is how a business concludes it
 *  cannot charge a haircut. The two reads are independent, so the tabs can outlive the catalogue.
 *
 *  Order is fixed so the notices do not reshuffle between loads; `services` goes last because the
 *  two above are what a till cannot sell WITHOUT. */
const CATALOG_INCIDENT_APPS = [...HARD_DEPENDENCIES, 'services'] as const;

/** OPTIONAL read (ADR-0127) of a WHOLE catalogue that keeps ABSENCE and INCIDENT apart (sales#25).
 *
 *  Two doors — `queryAllOptional` when the shell has it, one capped page through `queryOptional`
 *  when it does not (sales#186) — and two thunks instead of a name: the contract extractor does
 *  not follow variables, so the query name has to stay LITERAL inside each SDK call or the read
 *  disappears from `.erplora/contracts.json`.
 *
 *  What it does NOT do is swallow the difference between "the app is not here" and "the app
 *  broke". Answering `undefined` to both is right for an accessory integration and wrong for the
 *  grid the cashier sells from. Here absence degrades and a failure is said out loud.
 *
 *  A shell so old that it has NEITHER door is read as absence: it cannot ask optionally at all, so
 *  there is no catalogue to be had and no incident to report — the till sells services and free
 *  price, which is exactly the degraded mode. */
async function optionalCatalogRead<T>(
  whole: (c: ErploraClientLike) => Promise<unknown>,
  page: (c: ErploraClientLike) => Promise<unknown>,
): Promise<DependencyRead<T>> {
  return capabilityRead<T>(async () => {
    const c = erplora() as Partial<ErploraClientLike>;
    if (typeof c.queryAllOptional === 'function') return await whole(c as ErploraClientLike);
    if (typeof c.queryOptional === 'function') return await page(c as ErploraClientLike);
    return undefined;
  });
}

/** Reads ONE app's catalogue and classifies the outcome, registering a failure as an incident.
 *
 *  This is `capabilityCatalogRead` as seen from a `load...` method: the app id, the good door
 *  (`queryAllOptional`) and the capped fallback (`queryOptional`) for a shell whose SDK does not
 *  have the first one yet — modules update themselves and the hub IMAGE does not (sales#186).
 *
 *  Two thunks instead of a query name argument on purpose: the contract extractor (ADR-0127) does
 *  not follow variables, so the name has to stay LITERAL inside each SDK call — both doors
 *  register, and `.erplora/contracts.json` keeps listing the query as an optional consumption
 *  whichever one is taken.
 *
 *  It replaces the `optionalReadAll` the service reads used until sales#273, which answered
 *  `undefined` to BOTH «the app is not here» and «the app is here and its query broke». That is
 *  precisely the `.catch(() => [])` `dependency-read.ts` exists to remove, and it is why a salon
 *  with a broken service catalogue looked exactly like a shop that never sold services. */
type CatalogReader = <T>(
  app: string,
  whole: (c: ErploraClientLike) => Promise<unknown>,
  page: (c: ErploraClientLike) => Promise<unknown>,
) => Promise<T[]>;

/** Un grupo de suplementos con sus opciones, tal como lo entrega `modifiers.for_target`. */
interface ModifierGroup {
  id: string;
  name: string;
  min: number;
  /** 0 = sin techo. */
  max: number;
  options: { id: string; name: string; price_delta: number }[];
}

/** Aplana las filas de `modifiers.for_target` en grupos, conservando el orden que trae el SQL
 *  (`group.sort_order, group.name, option.sort_order, option.name`). Una fila por OPCIÓN: la query
 *  devuelve el producto cartesiano a propósito, para no hacer una llamada por grupo. */
function groupModifierRows(rows: unknown[]): ModifierGroup[] {
  const out: ModifierGroup[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const gid = String(r.group_id ?? '');
    if (!gid) continue;
    let g = out.find((x) => x.id === gid);
    if (!g) {
      g = {
        id: gid,
        name: String(r.group_name ?? ''),
        min: Number(r.min_choices ?? 0),
        max: Number(r.max_choices ?? 0),
        options: [],
      };
      out.push(g);
    }
    const oid = String(r.option_id ?? '');
    // Un grupo sin opciones llega con `option_id` nulo (LEFT JOIN): es un grupo vacío, no una opción.
    if (oid) g.options.push({ id: oid, name: String(r.option_name ?? ''), price_delta: Number(r.price_delta ?? 0) });
  }
  return out;
}

/** Traduce una clave del catálogo `ui` con el idioma activo del shell. */
function t(key: string, params?: Record<string, unknown>): string {
  return (erplora() as unknown as I18nClient).t(CATALOG, key, params);
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()) || '·';
}
/** Gradiente estable derivado del texto, como placeholder de foto (CSP-safe, sin <img> externo). */
function gradient(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  const h2 = (h + 38) % 360;
  return `linear-gradient(135deg, hsl(${h} 42% 38%), hsl(${h2} 44% 26%))`;
}

/** sales#422 — the shell floors a module screen at 480 px (hub#1730) and scrolls it inside its
 *  ion-content below that, so on a low phone (the «You can't invoice yet» strip up, or the phone on
 *  its side) the till is taller than what is on screen. CSS inside a shadow root cannot see that
 *  scroller, so this finds the closest ion-content around `host` (same walk as ok-data-table's
 *  sheet, outfitkit#75) and calls `onChange` with the rect it shows: now, on every scroll of the
 *  shell, on a window resize and when the ion-content itself changes size. Returns the function
 *  that stops following it, or undefined outside a shell (nothing to follow). */
function followShellView(host: HTMLElement, onChange: (shown: DOMRect) => void): (() => void) | undefined {
  let node: Node | null = host;
  let content: HTMLElement | null = null;
  while (node && !content) {
    const parent: Node | null = node.parentNode ?? (node.getRootNode() as ShadowRoot).host ?? null;
    if (parent instanceof HTMLElement && parent.tagName === 'ION-CONTENT') content = parent;
    node = parent === node ? null : parent;
  }
  if (!content) return undefined;
  const shell = content;
  const sync = () => onChange(shell.getBoundingClientRect());
  sync();
  let live = true;
  let scroller: HTMLElement | null = null;
  window.addEventListener('resize', sync);
  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
  resized?.observe(shell);
  const getScrollElement = (shell as HTMLElement & { getScrollElement?: () => Promise<HTMLElement> }).getScrollElement;
  if (typeof getScrollElement === 'function') {
    // A rejected lookup keeps the measure taken now, which stays right until the shell scrolls.
    getScrollElement.call(shell).then((el) => {
      if (!live || !el) return;
      scroller = el;
      scroller.addEventListener('scroll', sync, { passive: true });
      sync();
    }, (err: unknown) => {
      console.warn('[sales] pos: shell scroller unavailable, keeping the measure taken on open', err);
    });
  }
  return () => {
    live = false;
    window.removeEventListener('resize', sync);
    resized?.disconnect();
    scroller?.removeEventListener('scroll', sync);
  };
}

export class ErpPosTouch extends LitElement {
  static styles = css`
    /* El COLOR lo pone el tema de Ionic (claro/oscuro según el hub); el POS solo aporta el LAYOUT.
       Los nombres internos (--bg/--tile/--accent…) se remapean a tokens --ion-* con fallback. */
    :host {
      --bg: var(--ion-background-color, #fff);
      --panel: var(--ion-background-color, #fff);
      --tile: var(--ion-card-background, var(--ion-background-color, #fff));
      --tile-hi: var(--ion-color-light, #f2f1ed);
      --line: var(--ion-border-color, #e6e3db);
      --tx: var(--ion-text-color, #1c1b18);
      --mut: var(--ion-color-medium, #8b897f);
      --accent: var(--ion-color-primary, #0091ce);
      display:block; height:100%; box-sizing:border-box; font-family: system-ui, sans-serif; color:var(--tx);
    }
    *, *::before, *::after { box-sizing:border-box; }

    /* position:relative is load-bearing (sales#314): .card is the box the SHELL laid this module
       out in -- everything between its topbar and its module tab bar -- and it is what every sheet
       is anchored to. Without it the position:absolute of .scrim walks out of the module and lands
       on the viewport again, which is the defect itself.
       overflow:clip, not hidden (sales#418): both clip the rounded corners and the closed cart
       drawer, but hidden also makes .card a scroll container, and then the phone's sticky cart
       button measures against a box that never scrolls instead of the shell's scroller. hidden
       stays first as the fallback for a WebView without clip. */
    .card { position:relative; height:100%; display:flex; flex-direction:column; overflow:hidden; overflow:clip; background:var(--bg);
      border:1px solid var(--ion-border-color); border-radius:16px; }
    /* sales#178 - grid-template-rows is the load-bearing half of the fix. .body holds ONE row and
       an implicit auto row is sized by its CONTENT: its base size is .catalog's min-content, which
       with a full restaurant menu (281 items) is ~6.800px at 1440 and ~13.600px at 834. Letting the
       ITEM shrink (min-height:0) does not stop the TRACK from growing - the item just stretches to
       fill a 6.800px row. minmax(0,1fr) pins the row to .body's own height, and only then does
       .grid ever reach its overflow:auto and the cart's ion-footer stay on screen. */
    .body { position:relative; flex:1; min-height:0; display:grid; grid-template-columns: 1fr 23rem;
      grid-template-rows: minmax(0, 1fr); }

    /* ── Catálogo ── */
    /* sales#178 - min-height:0 is NOT decoration here: .catalog is a grid item, and a grid item's
       default minimum size is its CONTENT. With a full restaurant menu (281 items) the tile grid is
       ~20.000px tall, .catalog refused to shrink under it, and the whole .body row grew to match:
       .grid never reached its own overflow:auto, the cart column stretched with it and its
       ion-footer -- Total, Discount, Pre-bill, CHARGE -- ended up 20.000px below the viewport. And
       .card is overflow:hidden, so there was not even a scrollbar: the content simply did not exist
       for the cashier. Same pair .body and .cart already carry; only min-width:0 was set here. */
    .catalog { display:flex; flex-direction:column; min-width:0; min-height:0; padding:.8rem; }
    .catbar { position:relative; display:flex; align-items:center; gap:.4rem; margin-bottom:.7rem; }

    /* Menú ⋮ de PANTALLA (no de venta): anclado bajo su botón, como cualquier kebab. La capa de
       cierre va fija sobre todo el viewport para que un toque fuera lo cierre venga de donde venga. */
    .more-scrim { position:fixed; inset:0; z-index:30; background:transparent; }
    dialog.more-menu { position:absolute; top:calc(100% + .35rem); right:0; left:auto; z-index:31;
      display:flex; flex-direction:column; gap:.15rem; margin:0; padding:.3rem;
      min-width:13rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px);
      background:var(--panel); color:var(--tx); box-shadow:var(--ok-shadow-modal, 0 18px 50px rgba(0,0,0,.35)); }
    dialog.more-menu button { display:flex; align-items:center; gap:.6rem; width:100%;
      padding:.7rem .7rem; font-size:.92rem; text-align:left; color:inherit; cursor:pointer;
      background:none; border:none; border-radius:var(--ok-radius-sm,10px); }
    dialog.more-menu button:hover { background:var(--tile-hi); }
    dialog.more-menu ion-icon { font-size:1.15rem; color:var(--mut); }
    .arrow { flex:none; width:2.1rem; height:2.1rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
    .arrow:hover { background:var(--tile-hi); color:var(--tx); }
    .arrow ion-icon { font-size:1.1rem; }
    ion-segment.category-segment { flex:1; min-width:0; width:auto; justify-content:flex-start;
      overflow-x:auto; scroll-behavior:smooth;
      overscroll-behavior-x:contain; padding:.15rem; scrollbar-width:none; --background:transparent; }
    ion-segment.category-segment::-webkit-scrollbar { display:none; }
    /* Mismo indicio de overflow que la bottom bar de OutfitKit. bindTabbar() publica qué borde
       esconde opciones y estas máscaras viven aquí porque el CSS global no cruza el Shadow DOM. */
    ion-segment.category-segment.ok-tabbar[data-overflow='end'] {
      -webkit-mask-image:linear-gradient(to right,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to right,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment.category-segment.ok-tabbar[data-overflow='start'] {
      -webkit-mask-image:linear-gradient(to left,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to left,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment.category-segment.ok-tabbar[data-overflow='both'] {
      -webkit-mask-image:linear-gradient(to right,transparent 0,#000 var(--ok-tabbar-fade,36px),
        #000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to right,transparent 0,#000 var(--ok-tabbar-fade,36px),
        #000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment-button.cat-segment-button { flex:0 0 9.5rem; min-width:9.5rem; min-height:4.4rem;
      margin:0 .275rem; border:1px solid transparent; border-radius:var(--ok-radius,12px);
      text-transform:none; --background:var(--tile); --background-checked:var(--tile-hi);
      --color:var(--tx); --color-checked:var(--tx); --indicator-color:transparent;
      --indicator-box-shadow:none; --padding-start:.65rem; --padding-end:.65rem; }
    ion-segment-button.cat-segment-button.segment-button-checked { border-color:var(--accent); }
    .cat-segment-label { display:flex; width:100%; height:100%; flex-direction:column;
      justify-content:center; align-items:flex-start; min-width:0; margin:0; text-align:left; }
    .cat-segment-label .cc-n { width:100%; font-weight:700; font-size:.92rem; line-height:1.1;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cat-segment-label .cc-c { font-size:.72rem; color:var(--mut); margin-top:.1rem; }

    /* Resultados del buscador de productos (proyectados en el slot de ok-spotlight-search). */
    .sp-list { background:transparent; }
    ion-list.sp-list { background:transparent; }
    .sp-list ion-item { --background:transparent; border-radius:var(--ok-radius-sm,10px); }
    .sp-price { font-weight:800; color:var(--accent); }
    .sp-list ion-item[disabled] .sp-warn { color:var(--ion-color-warning-shade,#b26a00); white-space:normal; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap:.7rem; overflow:auto; align-content:start; padding-bottom:.3rem; }
    ion-card.tile { margin:0; border-radius:var(--ok-radius,14px); box-shadow:none; border:1px solid var(--ion-border-color); background:var(--tile);
      overflow:hidden; display:flex; flex-direction:column; transition:border-color .12s, transform .05s; }
    ion-card.tile:hover { border-color:var(--accent); }
    ion-card.tile:active { transform:scale(.98); }
    /* sales#74 + sales#58 - an item checkout would reject: it shows, it takes the tap, and the tap
       SAYS why. Never the native disabled attribute: on Ionic that means pointer-events none, so a
       touchscreen swallows the tap and the reason (title needs a hover, aria-label needs a screen
       reader) reaches nobody - the grid just looks broken. Colour and opacity are not the message
       either (colour blindness, bad screens): the reason travels in WORDS, on the tile itself. */
    ion-card.tile[aria-disabled='true'] { opacity:.72; border-style:dashed; cursor:not-allowed; }
    ion-card.tile[aria-disabled='true']:hover { border-color:var(--ion-color-warning,#ffc409); }
    .thumb { height:5.6rem; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:1.4rem; color:rgba(255,255,255,.85); position:relative; }
    /* La foto TAPA el marcador en vez de sustituirlo: va absoluta sobre el degradado y las
       iniciales, que quedan debajo. Si no carga, no ocupa y asoma lo de abajo. */
    .thumb img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .thumb .warn { z-index:1; position:absolute; top:.28rem; right:.28rem; display:flex; align-items:center; justify-content:center;
      width:1.5rem; height:1.5rem; border-radius:50%; background:var(--ion-color-warning,#ffc409);
      color:var(--ion-color-warning-contrast,#000); font-size:1.05rem; }
    .tinfo { padding:.5rem .6rem .65rem; }
    /* The block label, on the tile and in words (Square and Toast paint "Sold Out" right there).
       The long reason goes to the notice the tap raises; the short label is what fits here. */
    .tile .blocked-badge { margin-top:.3rem; display:inline-block; max-width:100%; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; padding:.08rem .38rem; border-radius:var(--ok-radius-pill,999px);
      background:var(--ion-color-warning,#ffc409); color:var(--ion-color-warning-contrast,#000);
      font-size:.68rem; font-weight:700; letter-spacing:.02em; text-transform:uppercase; }
    /* The notice the tap raises: where the cashier is already looking, not in a corner. */
    .blocked-notice { display:flex; align-items:center; gap:.4rem; margin:0 0 .5rem; padding:.45rem .6rem;
      border-radius:var(--ok-radius,14px); border:1px solid var(--ion-color-warning,#ffc409);
      background:color-mix(in srgb, var(--ion-color-warning,#ffc409) 16%, transparent);
      color:var(--tx); font-size:.82rem; line-height:1.25; }
    .blocked-notice ion-icon { flex:none; font-size:1.05rem; color:var(--ion-color-warning-shade,#e0ac08); }
    /* sales#185 — a full-colour primary button that is NOT going to charge is a promise the
       screen does not keep. It is dimmed, and stays live to the tap: openPay() answers with the
       reason. */
    ion-button.charge.blocked { --background:var(--ion-color-medium,#92949c);
      --background-activated:var(--ion-color-medium-shade,#808289);
      --background-focused:var(--ion-color-medium-shade,#808289); }
    /* sales#149 — the state of the CATALOGUE. Deliberately QUIETER than .blocked-notice: no
       coloured box, because this is not an incident raised by the tap that just happened but a
       condition that has been true since the till opened, and at that height it competes with the
       product. */
    /* A SENTENCE, not a bar of three boxes: in flex, a narrow width (mobile, or the shrunken grid
       of a tablet in portrait) breaks the row and leaves the icon alone on one line and the link on
       another. As running text the icon and the link travel INSIDE the sentence, and the notice
       takes as many lines as it needs without falling apart. */
    .catalog-health { display:block; margin:0 0 .5rem; padding:0 .1rem;
      color:var(--mut); font-size:.8rem; line-height:1.35; }
    .catalog-health ion-icon { display:inline-block; vertical-align:-.15em; margin-right:.3rem;
      font-size:1rem; color:var(--ion-color-warning-shade,#e0ac08); }
    /* An Ionic button comes with toolbar height: here it is a link inside a sentence. */
    .catalog-health .ch-fix { display:inline-block; vertical-align:-.35em;
      --padding-start:.25rem; --padding-end:.25rem; margin:0;
      height:1.5rem; font-size:.8rem; text-transform:none; letter-spacing:0; }
    .tile .n { font-weight:600; font-size:.9rem; line-height:1.2; color:var(--tx); }
    .tile .p { font-weight:800; color:var(--accent); margin-top:.25rem; }

    /* ── Carrito ── */
    .cart { position:relative; display:flex; flex-direction:column; min-height:0; background:var(--panel); border-left:1px solid var(--ion-border-color); }
    .cart ion-header ion-toolbar { --background:var(--panel); --color:var(--tx); --border-color:var(--ion-border-color); }
    .cart ion-title { font-size:1rem; }
    /* Contexto asignado (mesa/cliente) como CHIPS en el título — sustituye al texto "Venta". */
    /* Tamaño ÚNICO de los iconos de la cabecera del carrito. Ahí conviven iconos de tres dueños
       (TPV, mesas, clientes) y cada uno traía el suyo: el chip de mesa a 20px y los botones de al
       lado a 17px. Además el de mesa es de otro set (Material Symbols), con viewBox y grosor
       distintos de Ionicons: con el mismo número se ve MÁS PEQUEÑO, por eso se compensa aquí. Las
       custom properties cruzan el Shadow DOM, así que los módulos del slot heredan este valor. */
    ion-toolbar { --pos-hdr-icon-size: 1.75rem; }
    ion-buttons ion-icon { font-size: var(--pos-hdr-icon-size); }
    .cart-actions-slot { --pos-hdr-icon-size: 1.75rem; }
    .ctx-chips { display:flex; gap:.35rem; flex-wrap:wrap; }
    .ctx-chips .chip { font-size:.8rem; font-weight:700; color:var(--ok-on-accent, #fff); border-radius:var(--ok-radius-pill,999px); padding:.12rem .55rem; background:var(--accent); white-space:nowrap; }
    .ctx-chips .chip.cust { background:var(--ion-color-secondary, #5c7cfa); }
    /* Contenedor donde los módulos montan su botón de asignación (mesa, cliente…) en el header. */
    .cart-actions-slot { display:flex; align-items:center; }
    .cart-actions-slot:empty { display:none; }
    /* El CUERPO. Ionic ya resuelve «header fijo · cuerpo con scroll · pie fijo»: ion-content trae
       su propio scroll, así que aquí solo hay que decirle que ocupe el hueco que queda. Antes esto
       era flex:1 + overflow:auto a mano sobre ion-list.lines, que no aplicaba al div del carrito
       vacío: nada empujaba al pie y COBRAR se movía. */
    .cart ion-content.cart-body { flex:1; min-height:0; --background:var(--panel); --color:var(--tx); }
    ion-list.lines { padding:0; background:transparent; }
    ion-list.lines ion-item { --background:transparent; --color:var(--tx); --border-color:var(--ion-border-color); --padding-start:.7rem; --inner-padding-end:.5rem; }
    ion-list.lines ion-item h3 { font-weight:600; color:var(--tx); }
    ion-list.lines ion-item p { color:var(--mut); }
    .lineend { display:flex; flex-direction:column; align-items:flex-end; gap:.3rem; }
    .lineend .lt { font-weight:700; white-space:nowrap; }
    ok-qty-stepper { --ok-qty-field-width:2.3rem; --ok-surface:var(--tile); --ok-text:var(--tx); --ok-border:var(--ion-border-color); }
    /* sales#25 — el vacío de la REJILLA es una celda del grid, así que sin esto una frase de dos
       líneas se metía en una columna de 9rem y salía en vertical. Ahora ocupa toda la fila: cabe
       tanto «Sin productos.» como el motivo escrito del modo degradado, en los tres viewports. */
    .empty { color:var(--mut); text-align:center; padding:2.5rem 1rem; grid-column:1 / -1; max-width:34rem; margin-inline:auto; line-height:1.45; }
    /* El PIE. ion-footer se queda abajo por su cuenta (es un pie de verdad, no un div con flex). */
    .cart ion-footer { flex:none; }
    .cart ion-footer ion-toolbar { --background:var(--panel); }
    .cart-foot { padding:.75rem; border-top:1px solid var(--ion-border-color); background:var(--panel); }
    .total { display:flex; justify-content:space-between; align-items:baseline; margin:.1rem 0 .65rem; font-size:1rem; color:var(--mut); }
    .total b { font-size:1.7rem; color:var(--tx); }
    .charge { font-size:1.05rem; font-weight:700; }
    /* Dos acciones solo-icono (ADR-0133): la cuenta ocupa lo justo y cobrar se lleva el resto,
       porque es la acción primaria y el dedo la busca sin mirar. */
    /* Cobro: los segments son la elección (método, formato) y abajo las dos salidas. */
    /* El importe manda: grande, centrado y solo. */
    .pay-total { font-size:2.4rem; font-weight:800; text-align:center; letter-spacing:-.02em;
      margin:.2rem 0 1rem; color:var(--tx); }
    /* Etiqueta de sección: dice QUÉ estás eligiendo (antes dos segments iguales sin contexto). */
    .pay-lbl { margin:.9rem 0 .35rem; font-size:.75rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:var(--mut); }
    /* Selector de MÉTODO dentro del sheet (tender): botones grandes con icono + nombre, objetivo
       táctil ≥56px. El elegido se marca por borde/acento Y por aria-pressed (no solo color). */
    .pay-methods { display:grid; grid-template-columns:repeat(2,1fr); gap:.5rem; margin:.1rem 0 .55rem; }
    /* Ticket or invoice: the same two-up buttons as the method (sales#324), not two stacked. */
    .pay-docformat { display:grid; grid-template-columns:repeat(2,1fr); gap:.5rem; }
    .pm-btn { display:flex; align-items:center; justify-content:center; gap:.5rem; min-height:56px;
      border-radius:12px; border:1px solid var(--ion-border-color); background:var(--tile);
      color:var(--tx); font-weight:700; font-size:.95rem; cursor:pointer; }
    .pm-btn ion-icon { font-size:1.3rem; }
    .pm-btn[aria-pressed=true] { border-color:var(--accent); color:var(--accent);
      box-shadow:var(--ok-ring-accent, inset 0 0 0 1px var(--accent)); }
    .pm-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* Logo de marca (Bizum): es un wordmark ANCHO, no un glifo cuadrado como los Ionicons, así que
       se acota a la altura del icono y se deja crecer a lo ancho sin romper el botón. */
    .pay-methods .brand { display:inline-flex; align-items:center; height:1.15rem; }
    .pay-methods .brand svg { height:100%; width:auto; max-width:4.5rem; display:block; }
    /* Tarjeta: nada que teclear — el importe exacto y la pista del datáfono. */
    .pay-hint { margin:.1rem 0 .4rem; color:var(--mut); font-size:.9rem; }
    /* El cambio es lo que el cajero busca con el ojo al devolver. */
    .amt.big-change .v { font-size:1.6rem; font-weight:800; color:var(--accent); }

    /* ── sales#159 · pago mixto (ADR-0386) ────────────────────────────────────────────────── */
    /* EL RESTANTE. Vive en la cabecera del sheet, fuera del scroll, y es el segundo número más
       grande de la pantalla: en un reparto es el que se mira en cada pata. Se tiñe de acento
       mientras queda algo y de éxito en cuanto está cubierto — el color contesta antes que el texto. */
    .pay-remaining { display:flex; justify-content:space-between; align-items:baseline; gap:.75rem;
      margin:-.6rem 0 .9rem; padding:.5rem .7rem; border-radius:.7rem;
      border:1px solid var(--ion-border-color); background:var(--tile); color:var(--mut);
      font-size:.9rem; font-weight:600; }
    .pay-remaining .v { font-size:1.35rem; font-weight:800; color:var(--accent); }
    .pay-remaining[data-covered] { border-color:var(--ion-color-success,#2dd36f);
      background:color-mix(in srgb,var(--ion-color-success,#2dd36f) 10%,transparent); }
    .pay-remaining[data-covered] .v { color:var(--ion-color-success,#2dd36f); }
    /* Las patas ya tomadas. Fila alta (objetivo táctil ≥48px) con el importe a la derecha, donde
       el ojo compara una columna de números. */
    .tender-list { list-style:none; margin:0 0 .2rem; padding:0; display:flex; flex-direction:column; gap:.35rem; }
    .tender-row { display:flex; align-items:stretch; gap:.35rem; }
    .tender-edit { flex:1; display:flex; align-items:center; gap:.5rem; min-height:48px;
      padding:.4rem .65rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--tx); font:inherit; text-align:left; cursor:pointer; }
    .tender-edit ion-icon { font-size:1.2rem; flex:none; color:var(--mut); }
    .tender-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tender-amount { font-weight:800; white-space:nowrap; }
    .tender-change { font-size:.78rem; color:var(--mut); white-space:nowrap; }
    .tender-remove { flex:none; width:48px; min-height:48px; display:flex; align-items:center;
      justify-content:center; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; }
    .tender-remove ion-icon { font-size:1.2rem; }
    /* sales#162 — TENDER POR LÍNEA: un renglón por línea de servicio, con el hueco del slot debajo.
       El importe cubierto se tacha: es la señal de un vistazo de que esa línea ya no se cobra. */
    .tl-list { list-style:none; margin:0 0 .2rem; padding:0; display:flex; flex-direction:column; gap:.45rem; }
    .tender-line { border:1px solid var(--ion-color-step-200,#e2e0dc); border-radius:.6rem; padding:.5rem .6rem; }
    .tl-h { display:flex; align-items:baseline; justify-content:space-between; gap:.5rem; }
    .tl-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tl-amount { font-weight:800; white-space:nowrap; }
    .tl-amount[data-covered] { text-decoration:line-through; color:var(--mut); }
    .tl-slot { margin-top:.45rem; }
    .tl-slot:empty { display:none; }
    .tl-note { margin-top:.35rem; font-size:.8rem; color:var(--mut); }
    /* sales#242 — the label of the split. Two identical rows read as a double charge until
       something numbers them (the Shopify lesson), so it rides next to the name, not below it. */
    .tl-part { margin-left:.35rem; font-size:.78rem; font-weight:700; color:var(--mut); }
    /* The action the till was missing: a 48 px target, because the cashier taps it with a thumb on
       a counter tablet — the same floor every other control of this sheet keeps. */
    .tl-split { margin-top:.45rem; --padding-top:0; --padding-bottom:0; min-height:48px; }
    /* Entrar a repartir es SECUNDARIO (la mayoría de los cobros son de un solo medio); tomar la
       pata, en cambio, es lo que se pulsa una vez por medio, así que lleva el acento. */
    .pay-split-btn, .pay-add { display:flex; align-items:center; justify-content:center; gap:.45rem;
      width:100%; min-height:52px; border-radius:12px; font:inherit; font-weight:700; cursor:pointer; }
    .pay-split-btn { border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); }
    .pay-add { border:1px solid var(--accent); background:color-mix(in srgb,var(--accent) 14%,transparent); color:var(--accent); }
    .pay-split-btn ion-icon, .pay-add ion-icon { font-size:1.25rem; }
    /* EL MOTIVO por el que no se puede cobrar, en palabras y en la pantalla — nunca en un title. */
    .pay-block-reason { margin:0 0 .45rem; padding:.5rem .65rem; border-radius:.6rem;
      border:1px solid var(--ion-color-warning,#e8a33d);
      background:color-mix(in srgb,var(--ion-color-warning,#e8a33d) 12%,transparent);
      color:var(--tx); font-size:.9rem; }
    /* Un cobro bloqueado se ve apagado, pero SIGUE recibiendo el toque (aria-disabled, no disabled). */
    ion-button.charge[aria-disabled='true'] { opacity:.75; }
    .print-row { --background:transparent; --padding-start:0; --inner-padding-end:0; margin:.5rem 0 .2rem; }
    .pay-err { color:var(--ion-color-danger,#d9480f); margin:.4rem 0 0; }
    /* hub#297 — la captura de NIF+domicilio por encima del techo de la simplificada. Va ARRIBA del
       todo en el sheet porque es lo primero que hay que resolver, y cambia de ámbar a neutro en
       cuanto está completa: el color deja de pedir algo cuando ya no hay nada que pedir. */
    .limit-capture { display:flex; flex-direction:column; gap:.35rem; margin:0 0 .8rem;
      padding:.7rem .75rem; border-radius:.7rem;
      border:1px solid var(--ion-color-warning,#e8a33d); background:color-mix(in srgb,var(--ion-color-warning,#e8a33d) 12%,transparent); }
    .limit-capture[data-done] { border-color:var(--ion-color-success,#2dd36f);
      background:color-mix(in srgb,var(--ion-color-success,#2dd36f) 10%,transparent); }
    .limit-head { display:flex; gap:.55rem; align-items:flex-start; margin-bottom:.25rem; }
    .limit-head ion-icon { font-size:1.35rem; flex:0 0 auto; margin-top:.1rem; }
    .limit-head strong { display:block; font-size:.98rem; }
    .limit-head p { margin:.15rem 0 0; font-size:.86rem; color:var(--mut); }
    .limit-capture ion-input { --background:var(--ion-background-color,#fff); --padding-start:.6rem;
      --padding-end:.6rem; border-radius:.5rem; }
    .err { color:var(--ion-color-danger,#d9480f); }
    .pay-actions { display:flex; gap:.5rem; }
    .pay-actions .charge { flex:1; }
    .pay-actions .charge-print { flex:none; width:64px; }
    .foot-actions { display:flex; gap:.5rem; }
    .foot-actions .ticket-discount { flex:none; width:56px; }
    .ticket-discount-row { display:flex; justify-content:space-between; font-size:.9rem; color:var(--ion-color-warning-shade, #b7791f); margin:.1rem 0; }
    .discount-mode { margin:0 0 .4rem; max-width:12rem; }
    .discount-foot { display:flex; gap:.5rem; align-items:center; }
    .discount-foot .charge { flex:1; }
    .line-discount-badge { vertical-align:middle; }
    /* pm#392 — the tones, from the theme token. color= is resolved by a global .ion-color-* rule
       that never reaches this shadow root: solid badges came out with no background, the line and
       course icons never changed colour and the outline/clear buttons fell back to primary blue. */
    ion-badge.tone-success {
      --background: var(--ion-color-success, #2dd55b);
      --color: var(--ion-color-success-contrast, #000);
    }
    ion-badge.tone-warning {
      --background: var(--ion-color-warning, #ffc409);
      --color: var(--ion-color-warning-contrast, #000);
    }
    ion-icon.tone-primary { color: var(--ion-color-primary, #0054e9); }
    ion-icon.tone-medium { color: var(--ion-color-medium, #636469); }
    ion-icon.tone-warning { color: var(--ion-color-warning, #ffc409); }
    ion-icon.tone-success { color: var(--ion-color-success, #2dd55b); }
    ion-button.tone-danger[fill] { --color: var(--ion-color-danger, #c5000f); --border-color: var(--ion-color-danger, #c5000f); }
    ion-button.tone-medium[fill] { --color: var(--ion-color-medium, #636469); --border-color: var(--ion-color-medium, #636469); }
    ion-button.tone-warning[fill] { --color: var(--ion-color-warning, #ffc409); --border-color: var(--ion-color-warning, #ffc409); }
    .foot-actions .prebill { flex:none; width:56px; }
    .foot-actions .charge { flex:1; }

    /* desplegable tickets aparcados */
    .pdrop-back { position:absolute; inset:0; z-index:40; }
    .pdrop { position:absolute; top:2.9rem; right:.5rem; z-index:41; width:min(20rem,90%); background:var(--tile);
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px); box-shadow:var(--ok-shadow-pop, 0 12px 32px rgba(0,0,0,.5)); padding:.5rem; max-height:60%; overflow:auto; }
    .pdrop .hint { color:var(--mut); font-size:.82rem; margin:.3rem .2rem .5rem; }
    .pdrop .hint.hint--center { text-align:center; }
    .pdrop .hint strong { color:var(--tx); }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.3rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-sm,10px); padding:.2rem .3rem .2rem .6rem; margin-bottom:.35rem; }
    /* La FILA entera recupera: botón de verdad (accesible), sin pintas de botón. */
    .prow { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:.1rem;
      background:none; border:none; padding:.3rem 0; text-align:left; cursor:pointer; color:var(--tx); }
    .pn { font-weight:700; font-size:.9rem; }
    .pm { color:var(--mut); font-size:.78rem; }
    .pdel { margin:0; }

    .lqty { color:var(--mut); font-weight:700; }
    /* Secciones POR DATO: PENDIENTE DE ENVIAR arriba (borde de acento — donde trabaja el
       camarero) y ENVIADO debajo. El detalle por comanda es del chip+modal de kitchen, que se
       monta en .sec-slot de la cabecera de ENVIADO. */
    .secs { padding:.4rem .5rem .8rem; display:flex; flex-direction:column; gap:.6rem; }
    .sec { border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px); overflow:hidden; }
    .sec.sec-pending { border-color:var(--accent); }
    .sec-h { display:flex; align-items:center; gap:.4rem; padding:.5rem .7rem;
      font-weight:700; font-size:.82rem; text-transform:uppercase; letter-spacing:.04em;
      background:var(--tile); }
    .sec-h .ccount { color:var(--mut); }
    .sec-h .sec-slot { margin-left:auto; display:inline-flex; align-items:center;
      text-transform:none; letter-spacing:0; }

    /* Diálogos nativos (top layer): aparcar-con-nombre y carrito sucio. En móvil/tablet toman
       ASPECTO de sheet (suben desde abajo, asa, esquinas solo arriba — pregunta de Ioan
       2026-07-19): mismo <dialog> nativo, que ion-action-sheet no aloja contenido rico y los
       overlays de Ionic en shadow Lit se re-parentan al body (ADR-0028). */
    dialog.park-dialog, dialog.dirty-dialog, dialog.staff-dialog { border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,14px);
      background:var(--panel); color:var(--tx); padding:1rem 1.1rem; width:min(94vw,24rem);
      box-shadow:var(--ok-shadow-modal, 0 18px 50px rgba(0,0,0,.35)); }
    dialog.park-dialog::backdrop, dialog.dirty-dialog::backdrop, dialog.staff-dialog::backdrop { background:var(--ok-scrim, rgba(0,0,0,.45)); }
    @media (max-width: 820px) {
      dialog.park-dialog, dialog.dirty-dialog, dialog.staff-dialog { width:100vw; max-width:100vw; margin:auto 0 0;
        border-radius:var(--ok-radius-sheet-top, 18px 18px 0 0); border-bottom:none; padding-bottom:max(1rem, env(safe-area-inset-bottom)); }
      dialog.park-dialog::before, dialog.dirty-dialog::before, dialog.staff-dialog::before { content:''; display:block;
        width:2.4rem; height:.3rem; border-radius:var(--ok-radius-pill,999px); background:var(--ion-border-color);
        margin:0 auto .7rem; }
      .dlg-actions ion-button { flex:1; }
    }
    dialog h3 { margin:0 0 .5rem; font-size:1.05rem; }
    dialog p { margin:0 0 .8rem; color:var(--mut); }
    dialog.park-dialog input { width:100%; box-sizing:border-box; font-size:1rem; padding:.6rem .7rem;
      border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); }
    /* The list of people: rows tall enough for a thumb, and the current one marked — with a BORDER
       as well as colour, so it is distinguishable without relying on seeing the hue. */
    .staff-list { display:flex; flex-direction:column; gap:.35rem; max-height:min(50vh,18rem); overflow-y:auto; }
    .staff-opt { display:block; width:100%; text-align:left; padding:.7rem .8rem; font:inherit;
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-sm,10px);
      background:var(--tile); color:var(--tx); cursor:pointer; }
    .staff-opt:hover { border-color:var(--accent); }
    .staff-opt:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    .staff-opt[data-current] { border-color:var(--accent); color:var(--accent); font-weight:700; }
    .staff-note { margin:.2rem 0 0; color:var(--mut); font-size:.82rem; }
    .dlg-actions { display:flex; justify-content:flex-end; gap:.4rem; margin-top:.9rem; flex-wrap:wrap; }
    .badge-num { font-size:.62rem; min-width:1rem; height:1rem; padding:0 .2rem; border-radius:var(--ok-radius-pill,999px); background:var(--accent); color:var(--ok-on-accent,#fff); display:inline-flex; align-items:center; justify-content:center; position:absolute; top:.2rem; right:.2rem; }

    /* botón flotante de carrito (solo móvil) */
    .fab { display:none; position:absolute; right:1rem; bottom:1rem; z-index:50; width:3.6rem; height:3.6rem; border-radius:50%;
      border:none; background:var(--accent); color:var(--ok-on-accent,#fff); cursor:pointer; box-shadow:var(--ok-shadow-modal, 0 10px 26px rgba(0,0,0,.45)); align-items:center; justify-content:center; }
    .fab ion-icon { font-size:1.6rem; }
    .fab .badge { position:absolute; top:-.2rem; right:-.2rem; min-width:1.3rem; height:1.3rem; padding:0 .25rem; border-radius:var(--ok-radius-pill,999px);
      background:var(--ok-on-accent,#fff); color:var(--accent); font-size:.72rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
    /* sales#412 — with items the circle becomes a pill carrying the running total (same height, so
       the room the grid reserves under its last row still fits it). */
    .fab[data-has-items] { width:auto; padding:0 1.15rem 0 1rem; gap:.5rem; border-radius:var(--ok-radius-pill,999px); }
    .fab-total { font-size:1rem; font-weight:800; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cart-close { display:none; }

    /* cobro / numpad (sheet oscuro) */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:var(--ok-radius-pill,999px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--accent); color:var(--ok-on-accent,#fff); border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:var(--ion-color-success, #2f9e44); }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.35rem; margin-bottom:.2rem; }
    .numpad button { font-size:1.15rem; padding:.6rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .numpad button:disabled { opacity:.35; cursor:default; }
    /* Precio libre: el tile fijo del catálogo + los botones de DEPARTAMENTO dentro del sheet. */
    .tile.open-price .op-thumb { display:flex; align-items:center; justify-content:center; font-size:2rem; color:var(--ion-color-primary,#3880ff); background:var(--ion-color-primary-tint,rgba(56,128,255,.14)); }
    .dept-label { margin:.5rem 0 .3rem; font-size:.8rem; opacity:.7; }
    .dept-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:.4rem; }
    /* ── sales#153 · el picker del menú ──────────────────────────────────────────────────── */
    ion-card.tile.combo { border-color:var(--accent); }
    .tile.combo .combo-badge { position:absolute; top:.3rem; left:.3rem; width:1.5rem; height:1.5rem;
      border-radius:999px; display:flex; align-items:center; justify-content:center;
      background:var(--ion-color-primary,#3880ff); color:#fff; font-size:.85rem; }
    .combo-group { margin-bottom:.35rem; }
    /* El contador lleva glifo ADEMÁS de color: el color solo no pasa contraste, y en un TPV la
       pantalla puede ser mala. */
    .combo-counter { display:inline-flex; align-items:center; gap:.25rem; font-weight:600; }
    .combo-group[data-needs='true'] .combo-counter { color:var(--ion-color-danger,#c5000f); }
    .combo-group[data-needs='false'] .combo-counter { color:var(--ion-color-success,#2dd36f); }
    /* El toque en un botón bloqueado CONTESTA: el grupo que falta se señala. */
    .combo-group[data-flagged='true'] { outline:2px solid var(--ion-color-danger,#c5000f);
      outline-offset:2px; border-radius:var(--ok-radius-sm,10px); }
    /* En el techo, lo no elegido se marca pero sigue LEGIBLE (Square no esconde lo no
       seleccionable). Nada de pointer-events:none — el toque tiene que llegar. */
    .combo-opt[data-barred='true'] { opacity:.6; border-style:dashed; }
    .combo-opt[aria-pressed='true'] { border-color:var(--accent);
      background:color-mix(in srgb,var(--accent) 12%,var(--tile)); }
    .combo-less { min-width:2.1rem; border-radius:var(--ok-radius-sm,10px);
      border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx);
      font-size:1.1rem; cursor:pointer; }
    .combo-total { display:flex; justify-content:space-between; align-items:baseline;
      padding:.35rem .1rem .5rem; color:var(--tx); font-size:1rem; }
    .combo-total strong { font-size:1.15rem; font-weight:800; }
    .combo-confirm { width:100%; min-height:2.9rem; padding:.6rem 1rem; font:inherit;
      font-weight:700; border-radius:var(--ok-radius-sm,10px); border:1px solid transparent;
      background:var(--ion-color-primary,#3880ff); color:#fff; cursor:pointer; }
    /* Bloqueado: se VE que no procede y el motivo va escrito DENTRO del boton -- nunca en title,
       que en tactil no existe. Y sin pointer-events:none, para que el toque conteste. */
    .combo-confirm[data-blocked='true'] { background:var(--tile-hi); color:var(--mut);
      border-color:var(--ion-border-color); cursor:not-allowed; }
    .dept-btn { display:flex; flex-direction:column; align-items:flex-start; gap:.1rem; padding:.55rem .7rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; text-align:left; }
    .dept-btn[aria-pressed='true'] { border-color:var(--ion-color-primary,#3880ff); background:var(--ion-color-primary-tint,rgba(56,128,255,.16)); }
    .dept-btn .dn { font-size:1rem; }
    .dept-btn .dr { font-size:.8rem; opacity:.7; }
    .dept-empty { grid-column:1/-1; opacity:.6; font-size:.85rem; padding:.5rem; }
    /* sales#314 - ABSOLUTE, not fixed. A module does not own the viewport: the shell mounts it
       inside an ion-content (AppPage, fullscreen=false), so its box ends where the module tab bar
       begins. While the scrim was fixed, the sheet was centred over the WHOLE screen and its foot
       -- the CHARGE button -- was laid on top of that tab bar, which ate the tap and switched tab:
       the cashier could not charge. No z-index could win it, because the tab bar is not in this
       shadow tree. Anchored to .card the sheet cannot reach the tab bar on any device, whatever the
       safe-area inset is -- and a px number here would only ever be right on one of them.
       The padding is the breathing room the old 88vh cap used to leave. */
    .scrim { position:absolute; inset:0; padding:1rem; background:var(--ok-scrim, rgba(0,0,0,.6)); display:flex; align-items:center; justify-content:center; z-index:70; }
    /* sales#422: on a low phone the shell shows less than .card (its 480 px floor, hub#1730) and
       scrolls the rest; top/bottom are the parts of the card it hides (see syncSheetViewport), so
       the sheet sits between the header and the tab bar. 0 outside a shell or when it all fits. */
    .scrim { top:var(--pos-sheet-top, 0px); bottom:var(--pos-sheet-bottom, 0px); }
    /* Columna flex: el importe y el botón de cobrar NO se mueven; solo scrollea el centro. Antes
       el sheet entero scrolleaba y el botón principal quedaba fuera de pantalla — la acción más
       importante del TPV no puede exigir scroll. */
    .sheet { background:var(--panel); color:var(--tx); border:1px solid var(--ion-border-color);
      border-radius:var(--ok-radius-lg,16px); width:min(92vw,24rem); max-height:100%; display:flex; flex-direction:column;
      overflow:hidden; box-shadow:var(--ok-shadow-modal, 0 12px 48px rgba(0,0,0,.6)); }
    .sheet-h, .sheet-top, .sheet-foot { flex:none; padding:0 1rem; }
    .sheet-h { padding-top:1rem; }
    .sheet-foot { padding:.75rem 1rem 1rem; border-top:1px solid var(--ion-border-color); }
    .pay { flex:1; min-height:0; overflow:auto; padding:0 1rem; }
    /* sales#422: a phone on its side leaves ~217 px inside the scrim, and the header, figure and
       foot alone took it all: the keypad shrank to 0 px and the button spilled out under the tab
       bar. The middle keeps room for the keypad; what then does not fit scrolls inside the sheet,
       with the foot stuck to its bottom on the sheet's own ground, so the button is always shown.
       Where it all fits (every other screen) nothing changes: the sheet has nothing to scroll. */
    .sheet { overflow-y:auto; }
    .pay { min-height:8rem; }
    .sheet-foot { position:sticky; bottom:0; z-index:1; background:var(--panel); }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--mut); }
    .pay-side, .pay-tender { display:flex; flex-direction:column; gap:.8rem; }
    /* sales#341 — the summary of the folded side group exists on a narrow screen only (below). */
    .pay-side-summary { display:none; }
    /* sales#324 — from 821 px (where the cart stops being a drawer) the tender screen is TWO
       columns, as on Square or Shopify POS: the total, the voucher per line and ticket/invoice on
       the left; the method, the tendered amount and the keypad on the right, from the total down to
       the footer. Each column scrolls on its own, so a long voucher row can only push the left one.
       In one 24rem column a salon check left the keypad below the fold of a 1280×800 tablet while
       the footer already said «type the amount tendered». .pay steps aside (display:contents)
       so its two groups are the grid items.
       Scoped to .pay-sheet: .sheet and .pay are shared by the discount, open-price, line-note,
       modifier and combo sheets, which stay one 24rem column. */
    @media (min-width: 821px) {
      .pay-sheet { width:min(100%, 46rem); display:grid;
        grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows:auto auto minmax(0, 1fr) auto;
        grid-template-areas:"head head" "top tender" "side tender" "foot foot"; }
      .pay-sheet .sheet-h { grid-area:head; }
      .pay-sheet .sheet-top { grid-area:top; }
      .pay-sheet .sheet-foot { grid-area:foot; }
      .pay-sheet .pay { display:contents; }
      .pay-sheet .pay-side { grid-area:side; min-height:0; overflow:auto; padding:0 1rem .75rem; }
      .pay-sheet .pay-tender { grid-area:tender; min-height:0; overflow:auto; padding:0 1rem .75rem;
        border-left:1px solid var(--ion-border-color); }
    }
    /* sales#341 — below 821 px two columns do not fit, so the sheet opens on the TENDER: what the
       sale is (voucher per line, ticket or invoice, its recipient) folds into ONE summary line that
       opens with a tap, as on Square or Shopify POS. Folding is CSS only: the voucher filler stays
       mounted, so a redemption already held keeps its «undo». */
    @media (max-width: 820px) {
      .pay-sheet .pay-side-summary { display:flex; align-items:center; gap:.5rem; width:100%; min-height:2.75rem;
        padding:.5rem .75rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-sm,10px);
        background:var(--tile); color:var(--tx); font:inherit; text-align:left; cursor:pointer; }
      .pay-sheet .pay-side-summary .pss-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pay-sheet .pay-side-summary .pss-text > span + span::before { content:' · '; color:var(--mut); }
      .pay-sheet .pay-side-summary [data-state='applied'] { color:var(--ion-color-success,#2dd36f); }
      .pay-sheet .pay-side[data-folded] > :not(.pay-side-summary) { display:none; }
      .pay-sheet .pay-tender { margin-top:.8rem; }
      /* Folded, the tender still overran a 390×844 phone by 24 px: the scrim's 1rem around a 24rem
         card was what was missing. So the pay sheet is a full-width bottom sheet here, like the
         park/staff dialogs above. */
      .scrim.pay-scrim { padding:0; align-items:flex-end; }
      .pay-sheet { width:100%; border-bottom:0; border-radius:var(--ok-radius-lg,16px) var(--ok-radius-lg,16px) 0 0; }
    }

    @media (max-width: 820px) {
      .body { grid-template-columns: 1fr; }
      /* Sin sombra: aun cerrado (translateX(100%)) su box-shadow se derramaba ~30px hacia dentro
         por el borde derecho de la tarjeta; la separación al abrir la dan el backdrop y el borde. */
      /* Cerrado = INEXISTENTE, no solo «fuera de pantalla» (sales#58). Con únicamente el transform,
         sus botones —asignar mesa, asignar cliente, cobrar, cuentas abiertas— seguían anunciados en
         el árbol accesible y aceptaban clicks sin que ocurriera nada visible: controles fantasma,
         para un lector de pantalla igual que para Playwright. La propiedad visibility se hereda a
         todo el subárbol, así que este único punto cubre TODOS los controles de la cuenta, incluidos
         los que montan otros módulos en el slot. La transición retrasa el ocultado hasta que termina
         el deslizamiento; al abrir es inmediata. */
      .cart { position:absolute; top:0; right:0; bottom:0; width:min(92%,26rem); z-index:60;
        transform:translateX(100%); visibility:hidden;
        transition:transform .25s ease, visibility 0s linear .25s; }
      .cart[data-open] { transform:translateX(0); visibility:visible;
        transition:transform .25s ease, visibility 0s; }
      .cart-close { display:inline-flex; }
      .cart-backdrop[data-open] { display:block; position:absolute; inset:0; background:var(--ok-scrim, rgba(0,0,0,.5)); z-index:55; }
      /* sales#418: the shell floors a module screen at 480px and scrolls it below that, so with the
         «You can't invoice yet» strip up a low phone lays the till out taller than what it shows.
         position:absolute pinned the button to the bottom of that box, under the tab bar; sticky
         keeps it 1rem (the base bottom) above the visible bottom of the shell scroller. It is in
         flow now, so it is placed in the catalogue's cell -- and the catalogue with it, or
         auto-placement would push it to a second row -- at the corner the absolute put it in. */
      .catalog { grid-area:1 / 1; }
      .fab { display:inline-flex; position:sticky; grid-area:1 / 1; align-self:end; justify-self:end; margin:0 1rem 1rem 0; }
    }
    .cart-backdrop { display:none; }

    /* ── Pulido visual 2026-07: conserva la estructura modular y acerca el POS al prototipo. ── */
    .card { border-radius:var(--ok-radius-lg,16px); box-shadow:var(--ok-shadow-card,none); }
    .body { grid-template-columns:minmax(0,1fr) minmax(23rem,24.5rem); }
    .catalog { padding:.72rem; }
    .catbar { gap:.5rem; margin-bottom:.68rem; }
    ion-segment.category-segment { padding:.05rem; }
    ion-segment-button.cat-segment-button { flex-basis:8.7rem; min-width:8.7rem; min-height:3.65rem;
      margin:0 .24rem; border-color:var(--line); --background:var(--tile);
      --background-checked:color-mix(in srgb,var(--accent) 10%,var(--tile)); }
    ion-segment-button.cat-segment-button:hover { --background:var(--tile-hi); }
    ion-segment-button.cat-segment-button.segment-button-checked { border-color:var(--accent);
      box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent); }
    .cat-segment-label .cc-n { font-size:.88rem; }
    .cat-segment-label .cc-c { font-size:.7rem; }
    .arrow.search-trigger { width:3rem; height:3.65rem; border-radius:var(--ok-radius,12px); color:var(--accent); }
    /* El ⋮ crece con su vecina: quedaba en 34px al lado de una lupa de 48×58 —se leía como un
       botón de segunda— y por debajo del área táctil que pide un dedo en el mostrador. Alto igual,
       ancho algo menor porque el icono es estrecho y no debe robarle sitio a las categorías. */
    .arrow.more-trigger { width:2.6rem; height:3.65rem; border-radius:var(--ok-radius,12px); }

    .grid { grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr)); gap:.62rem; }
    ion-card.tile { min-height:8.4rem; border-radius:var(--ok-radius,14px); cursor:pointer; }
    .thumb { height:4.85rem; flex:none; }
    .tinfo { flex:1; display:grid; grid-template-columns:minmax(0,1fr) auto; grid-template-rows:auto auto;
      gap:.15rem .5rem; align-content:center; padding:.52rem .62rem .58rem; }
    .tile .n { grid-column:1 / -1; font-size:.86rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tile .sku { color:var(--mut); font-size:.66rem; align-self:end; }
    /* #277 — el precio («1,50 €») con white-space:nowrap desbordaba la celda auto del grid y la
       tarjeta overflow:hidden recortaba el «€». Se asegura espacio a la derecha del precio. */
    .tile .p { margin:0; padding-right:.15rem; color:var(--tx); font-size:.9rem; align-self:end; white-space:nowrap; }

    .cart { border-left:1px solid var(--line); }
    .cart ion-header { flex:none; border-bottom:1px solid var(--line); }
    .cart ion-toolbar { --min-height:3.6rem; }
    .order-toolbar { min-height:3.6rem; display:flex; align-items:stretch; gap:.12rem; padding:.24rem .35rem; }
    ion-button.header-action { width:3.25rem; height:3.05rem; margin:0; font-size:1.05rem;
      --padding-start:.2rem; --padding-end:.2rem; --border-radius:var(--ok-radius-sm,10px); --color:var(--mut); }
    ion-button.header-action::part(native) { display:flex; flex-direction:column; gap:.08rem; }
    ion-button.header-action ion-icon { font-size:1.2rem; }
    ion-button.header-action small { display:block; max-width:3rem; font-size:.56rem; line-height:1;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* Aparcar y Cuentas abiertas comparten fila con selectores icon-only aportados por otros
       módulos. Sus etiquetas viven en title/aria-label: pintarlas dentro de 52 px producía textos
       truncados y hacía que pareciesen acciones de otro nivel. */
    ion-button.header-action.icon-action { width:2.4rem; height:2.4rem; margin:auto 0;
      --padding-start:0; --padding-end:0; }
    ion-button.header-action.icon-action::part(native) { flex-direction:row; gap:0; }
    ion-button.header-action.icon-action ion-icon { font-size:var(--pos-hdr-icon-size,1.75rem); }
    /* El badge .badge-num (absoluto) se ancla a este botón: necesita un contexto de posicionamiento. */
    .open-checks-action { position:relative; }
    ion-button.header-action.assigned { --color:var(--accent); --background:color-mix(in srgb,var(--accent) 12%,transparent); }
    .cart-actions-slot { display:flex; align-items:center; min-width:0; }
    .actions-spacer { flex:1; min-width:.2rem; }
    .order-heading { padding:.62rem .8rem .58rem; border-bottom:1px solid var(--line); }
    .order-title-row { display:flex; align-items:center; gap:.35rem; }
    .order-title { flex:1; min-width:0; border:0; outline:0; padding:.08rem 0; background:transparent;
      color:var(--tx); font:inherit; font-size:1rem; font-weight:750; }
    .order-title::placeholder { color:var(--mut); }
    .title-edit { flex:none; width:2rem; height:2rem; display:inline-grid; place-items:center; padding:0;
      border:0; border-radius:var(--ok-radius-sm,8px); background:transparent; color:var(--mut); cursor:pointer; }
    .title-edit:hover, .title-edit:focus-visible { color:var(--accent); background:var(--tile-hi); outline:none; }
    .title-edit ion-icon { font-size:1rem; }
    .order-context { display:flex; gap:.3rem; flex-wrap:wrap; min-height:1.55rem; margin-top:.32rem; }
    .order-context ion-chip { height:1.55rem; margin:0; font-size:.68rem; --background:var(--tile); color:var(--mut); }
    .context-empty { color:var(--mut); font-size:.72rem; align-self:center; }
    /* sales#179 — who is serving. It is a BUTTON (tapped to transfer), but it reads like the other
       contexts of the check: same height and same visual weight as the ion-chips next to it, with
       the touch target a finger needs. */
    .ctx-chip { display:inline-flex; align-items:center; gap:.25rem; height:1.55rem; padding:0 .55rem;
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-pill,999px);
      background:var(--tile); color:var(--mut); font:inherit; font-size:.68rem; cursor:pointer; }
    .ctx-chip:hover { color:var(--tx); }
    .ctx-chip:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    .ctx-chip ion-icon { font-size:.95rem; }
    /* sales#222 — the customer this sale still owes. Warning, not danger: nothing has failed,
       something is missing, and it is one tap away. */
    .ctx-chip.needs-customer { border-color:var(--ion-color-warning, #ffc409); font-weight:700;
      color:var(--ion-color-warning-shade, #e0ac08); background:var(--tile); }
    .ctx-chip.needs-customer:hover { color:var(--ion-color-warning-shade, #e0ac08); }

    ion-segment.view-tabs { margin:.62rem .72rem .28rem; width:auto; border:1px solid var(--line);
      border-radius:var(--ok-radius-sm,11px); background:var(--tile); }
    ion-segment.view-tabs ion-segment-button { min-height:2.85rem; --indicator-color:var(--tile-hi);
      --color:var(--mut); --color-checked:var(--tx); font-weight:700; text-transform:none; }
    .view-tab-label { display:inline-flex; align-items:center; justify-content:center; gap:.38rem; }
    .pending-dot { display:inline-grid; place-items:center; min-width:1.18rem; height:1.18rem; padding:0 .25rem;
      border-radius:var(--ok-radius-pill,999px); background:var(--ion-color-warning,#f5a623); color:var(--ion-color-warning-contrast,#241700); font-size:.65rem; font-weight:850; }

    .cart ion-content.cart-body { --padding-top:.15rem; }
    ion-list.lines { padding:.28rem .48rem .45rem; }
    ion-list.lines ion-item { margin:.35rem 0; --background:var(--tile); --border-color:transparent;
      --border-radius:var(--ok-radius,12px); border:1px solid var(--line); border-radius:var(--ok-radius,12px); overflow:hidden; }
    ion-list.lines ion-item.sel { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 7%,var(--tile)); }
    ion-list.lines ion-item h3 { display:flex; align-items:center; gap:.35rem; margin-bottom:.12rem; font-size:.85rem; }
    ion-list.lines ion-item p { font-size:.7rem; }
    ok-status-pill { vertical-align:middle; }
    .lineend .lt { font-size:.84rem; }
    .lineend .lt.is-gift { text-decoration:line-through; opacity:.55; }
    /* sales#156 — the note under its item, with the same visual weight as a sub-line on paper: it
       reads, but it does not compete with the product name or the amount. It wraps anywhere because
       "shellfish and nut allergy" does not fit on one line at 390 px. */
    .line-note-text { display:flex; align-items:flex-start; gap:.3rem; margin:.15rem 0 0;
      font-size:.8rem; color:var(--ion-color-medium); overflow-wrap:anywhere; }
    .line-note-text ion-icon { flex:none; font-size:.9rem; margin-top:.1rem; }
    /* sales#277 — reads as the note's sub-line, not as a fifth control on the row: no border, no
       background, the row's own muted colour. It only looks tappable when it IS. */
    .line-staff { display:flex; align-items:center; gap:.3rem; margin:.15rem 0 0; padding:0;
      border:0; background:none; font:inherit; color:var(--mut); font-size:.85rem;
      cursor:pointer; text-align:left; }
    .line-staff ion-icon { flex:none; font-size:.95rem; }
    .line-staff:disabled { cursor:default; }
    .line-staff:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
    /* The note sheet: the textarea takes the full width and is tall enough to read what was
       written without scrolling inside a field, which on touch is where text gets lost. */
    .note-sheet .note-input { width:100%; box-sizing:border-box; resize:none; font:inherit;
      padding:.6rem .7rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--ion-item-background, var(--panel)); color:var(--tx); }
    .note-sheet .note-input:focus-visible { outline:2px solid var(--ion-color-primary); outline-offset:1px; }
    .note-sheet .note-hint { margin:.5rem 0 0; font-size:.78rem; color:var(--ion-color-medium); }
    /* sales#206 — the chips the business preconfigured, ABOVE the keyboard: on a phone the
       keyboard eats the bottom half of the screen, so anything under the textarea would be the
       first thing to disappear. They wrap because a business with eight notes has eight. */
    .note-sheet .note-chips { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .6rem; }
    .note-sheet .note-chip { font:inherit; font-size:.85rem; line-height:1.2; cursor:pointer;
      min-height:2.25rem; padding:.45rem .75rem; border-radius:999px;
      border:1px solid var(--ion-border-color, var(--line)); color:var(--tx);
      background:var(--ion-item-background, var(--panel)); }
    /* Applied = filled, not merely outlined: at arm's length on a busy pass a thicker border is
       not a state anybody reads. */
    .note-sheet .note-chip[aria-pressed='true'] { border-color:var(--ion-color-primary);
      background:var(--ion-color-primary); color:var(--ion-color-primary-contrast, #fff); }
    .note-sheet .note-chip:focus-visible { outline:2px solid var(--ion-color-primary); outline-offset:2px; }
    .note-sheet .note-chips-state { margin:0 0 .6rem; font-size:.78rem; color:var(--ion-color-medium); }
    .secs { padding:.32rem .48rem .65rem; gap:.52rem; }
    .sec { border-radius:var(--ok-radius,12px); }
    .sec-h { padding:.48rem .58rem; font-size:.7rem; background:transparent; border-bottom:1px solid var(--line); }
    .sec.sec-pending { border-color:color-mix(in srgb,var(--accent) 55%,var(--line)); }
    .sec-slot { min-width:0; }
    .draft-pane { padding:.28rem .48rem .7rem; }
    .draft-hint { margin:.2rem .18rem .52rem; color:var(--mut); font-size:.76rem; line-height:1.35; }
    .draft-actions-slot { display:flex; margin:.65rem 0 0; }
    .draft-actions-slot:empty { display:none; }
    .draft-empty { min-height:10rem; display:grid; place-items:center; }

    .cart-foot { padding:.62rem .72rem .7rem; }
    .total { margin:0 0 .5rem; font-size:.78rem; }
    .total b { font-size:1.55rem; }
    .foot-actions .prebill { width:3.25rem; }
    .foot-actions .charge { min-height:3rem; font-size:.98rem; }
    .pdrop { top:3.5rem; right:.45rem; width:min(22rem,calc(100% - .9rem)); max-height:72%; }
    .pitem { padding:.35rem .35rem .35rem .65rem; }

    @media (min-width:821px) and (max-width:1100px) {
      .body { grid-template-columns:minmax(0,1fr) 22rem; }
      .grid { grid-template-columns:repeat(auto-fill,minmax(8.8rem,1fr)); }
      ion-segment-button.cat-segment-button { flex-basis:8rem; min-width:8rem; }
    }
    @media (max-width:820px) {
      .body { grid-template-columns:1fr; }
      .catalog { padding:.58rem; }
      /* The cart FAB floats over the grid (position:absolute, 3.6rem wide, 1rem off the edge), so
         at 390px it sat on top of the last tile's PRICE. Square and Toast reserve that room at the
         end of the list instead of letting the button cover content: the grid keeps its own scroll
         and simply ends above the FAB. Desktop has no FAB, so this belongs in the mobile block. */
      .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.5rem; padding-bottom:5.2rem; }
      ion-card.tile { min-height:8rem; }
      ion-segment-button.cat-segment-button { flex-basis:7.8rem; min-width:7.8rem; }
      .cart { width:min(100%,27rem); }
      .order-toolbar { padding-left:.2rem; padding-right:.2rem; }
      .memory-only { display:none; }
      /* #277 — en tiles de 2 columnas el precio «1,50 €» se recortaba por la derecha (overflow:hidden
         de la tarjeta + white-space:nowrap). Un font-size algo menor lo hace caber sin recortar el «€». */
      .tile .p { font-size:.82rem; }
    }
    @media (max-width:340px) {
      .catalog { padding:.45rem; }
      .grid { gap:.42rem; }
      ion-segment-button.cat-segment-button { flex-basis:7rem; min-width:7rem; }
      ion-card.tile { min-height:7.7rem; }
      .thumb { height:4.5rem; }
    }
  `;

  /**
   * El shell descarga cada ruta portable con la sesión del Hub y esta caché posee los `blob:` que
   * sí puede pintar un `<img>`. Un shell anterior no expone la capacidad y deja las iniciales.
   */
  private readonly photos = new MediaPhotoCache(
    () => erplora(),
    () => this.requestUpdate(),
  );
  /** Invalida continuaciones asíncronas de montajes anteriores, incluso tras reconectar rápido. */
  private connectionEpoch = 0;

  /**
   * Controles de chrome que el SHELL honra en esta pestaña, separados por espacios (ADR-0048).
   * Los pone el shell a partir de `navigation[].chrome` del manifest; el TPV solo los OFRECE.
   *
   * Vacío o ausente = ningún control → no se pinta el ⋮. Es la comprobación de capacidad, no
   * decorado: los módulos se actualizan solos y la imagen del hub no, así que este `sales` puede
   * caer sobre un shell que no escucha `erp:chrome-request`. Ahí el botón no haría nada, y un
   * botón muerto en el mostrador cuesta más que la función que no se ofrece.
   */
  @property() chrome = '';
  /**
   * ¿El shell está AHORA en pantalla completa? Lo dice él, no lo deduce el TPV de sus propios
   * clics: también se entra y se sale con Esc o con F11, que este componente no ve. Deducirlo
   * dejaría la etiqueta del menú mintiendo en cuanto el cajero tocase Esc.
   */
  @property({ type: Boolean }) fullscreen = false;
  /** ¿Está desplegado el menú ⋮ de la barra de categorías? */
  @state() private moreOpen = false;

  @state() private products: Product[] = [];
  @state() private categories: Category[] = [];
  @state() private taxCategories: TaxCategory[] = [];
  /** sales#267 — los departamentos que el negocio definió. Vacío = todavía no definió ninguno, y
   *  entonces la hoja cae a `taxCategories`, que es como se comportaba el TPV antes. */
  @state() private ownDepartments: DepartmentRow[] = [];
  @state() private activeCat = '';
  @state() private q = '';
  @state() private cart: CartLine[] = [];
  @state() private methods: PayMethod[] = [];
  @state() private settings: PosSettings = {};
  /** sales#180 — the business's LEGAL name (`hub_settings.business_legal_name`, ADR-0061), the one
   *  the fiscal ticket prints. The BILL needs it just the same and has no invoice to read it from,
   *  so it asks for it live (`sales.business.get`, a cashier's permission). */
  @state() private businessName = '';
  @state() private paying = false;
  @state() private tendered = '';
  // Precio libre / venta por departamento (fuera de catálogo): sheet propio con su importe tecleado
  // y el departamento (categoría fiscal) elegido.
  @state() private openPriceOpen = false;
  /** sales#319 — the SERVICE that opened the sheet, if any: its name names the line; the department
   *  only decides the VAT. Empty for the bare «Open price» key, where the department names it. */
  private openServiceName = '';
  /** sales#71 — descuento de TICKET (%) de la cuenta en curso; 0 = ninguno. Se persiste en el
   *  pedido (`sales.order.set_discount`) y vuelve al retomar la cuenta (`OpenCheck.discount`). */
  @state() ticketDiscount = 0;
  /** sales#386 — the manager approved the ticket discount this check carries: set when the
   *  manager's door (`sales.order.set_discount_over_limit`) accepted it, restored with the check
   *  (`OpenCheck.discountApproved`), and wiped as soon as the usual door writes a new discount.
   *  Lets Charge go through the usual `sales.complete_sale` for that same discount, with no second
   *  PIN. */
  @state() ticketDiscountApproved = false;
  /** El sheet de descuento: sobre una LÍNEA o sobre el TICKET. */
  @state() private discountSheet?: { target: 'line' | 'ticket'; lineId?: string };
  /** sales#156 — the sheet for a line's NOTE. `lineId` is the order row being annotated; without
   *  it there is nowhere to write (the line is not materialised yet). */
  @state() noteSheet?: { lineId?: string };
  /** What has been typed in the sheet, not applied yet: closing it without saving touches
   *  nothing. */
  @state() noteInput = '';
  /** sales#206 — the notes the business preconfigured, in the order it gave them. */
  @state() quickNotes: QuickNote[] = [];
  /** Where that read stands. `idle` = never asked; it is asked the FIRST time the sheet opens and
   *  not at boot, because a till that never annotates a line should not pay for a catalogue it
   *  does not use, and not on every open either — the catalogue does not change during a service. */
  @state() quickNotesState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  @state() private discountInput = '';
  /** sales#113 — importe FIJO al ticket (céntimos); el servidor lo reparte por resto mayor. */
  @state() ticketDiscountAmount = 0;
  /** Modo del sheet de descuento del TICKET: porcentaje o importe. */
  @state() private discountMode: 'percent' | 'amount' = 'percent';
  @state() private openAmount = '';
  /** pm#93 — hoja de suplementos abierta: el producto que la disparó y sus grupos ya aplanados.
   *  `undefined` = no hay hoja. Mismo patrón que el precio libre de un servicio sin importe. */
  @state() modifierSheet?: { product: Product; groups: ModifierGroup[] };
  /** Opciones elegidas, EN EL ORDEN de elección — cocina lee la comanda en ese orden. */
  @state() modifierPicks: string[] = [];
  /** sales#153 — los menús que este hub puede vender. Vacío cuando `combos` no está instalado. */
  @state() private comboCatalog: Combo[] = [];
  /** La lectura del catálogo FALLÓ (≠ «no está instalado»). Se pinta: un menú que no se puede
   *  componer no se ofrece, y el motivo se dice en vez de dejar la rejilla misteriosamente corta. */
  @state() private comboCatalogFailed = false;
  /** sales#25 — the HARD dependencies (`inventory`, `taxes`) whose catalogue read FAILED while the
   *  app IS installed. Absence is not in here: an app the hub does not have degrades in silence,
   *  an app that is here and does not answer is an incident and gets said out loud. */
  @state() private brokenCatalogApps: string[] = [];
  /** sales#25 — the catalogue app is not in this hub: the grid says so instead of showing nothing. */
  @state() private catalogAppAbsent = false;
  /** sales#409 — `services` holds sellable services and «Show services in the till» hides them. */
  @state() private servicesHidden = false;
  @state() comboSheet?: { combo: Combo };
  /** Lo elegido, EN EL ORDEN de elección y con repeticiones si el grupo las permite. */
  @state() comboPicks: string[] = [];
  /** El grupo que el último toque bloqueado señaló. Es lo que hace que un botón que NO se puede
   *  pulsar CONTESTE igualmente — sin esto el camarero solo tendría el `title`, que en táctil no
   *  existe. */
  @state() private comboNeedsGroup = '';
  @state() private openDept = '';
  @state() private payMethod?: PayMethod;
  /** sales#159 — ¿se está repartiendo el cobro entre varios medios? Es OPT-IN: hasta que el cajero
   *  lo pide, la pantalla es exactamente la de un solo medio (el rediseño de tender de 2026-07-19,
   *  donde la tarjeta no tiene teclado porque cobra el importe exacto). Repartir cambia eso: cada
   *  pata necesita su importe, así que el teclado pasa a estar siempre. */
  @state() private splitting = false;
  /** Las patas del cobro ya tomadas, EN ORDEN. Vacío = venta de un solo medio (camino escalar). */
  @state() tenders: Tender[] = [];
  @state() private docFormat: 'ticket' | 'invoice' = 'ticket';
  /** sales#341 — the cashier opened the folded «what the sale is» group of the pay sheet. Only a
   *  narrow screen folds it (CSS); each charge starts folded unless something there must be answered. */
  @state() private paySideOpen = false;
  @state() private busy = false;
  @state() private error = '';
  /** sales#58 - why the LAST tapped tile did not reach the check. It lives apart from `error`
   *  (a sale failure, which drags the "check the sales list" link along): this is not a failure,
   *  it is an unconfigured catalogue, and it clears itself as soon as something sellable goes in. */
  @state() private blockedNotice = '';
  @state() private docSaleId?: string;
  /** Clave del INTENTO de cobro en curso (sales#20): se genera al abrir la pantalla de cobro, se
   *  REUTILIZA en cada reintento —por eso un timeout no crea una segunda venta— y se descarta en
   *  cuanto la venta consta. Vacía = no hay cobro en curso. */
  private checkoutKey = '';
  /** hub#923: el cobro falló y NO se pudo averiguar si la venta entró. Enciende el aviso con la
   *  salida a Ventas — es la diferencia entre «cobro dudoso» y volver a cobrar a ciegas. */
  @state() private checkoutUnknown = false;
  @state() private parked: OpenCheck[] = [];
  /** Líneas marcadas para cobrar por separado (ADR-0146). Vacío = se cobra la cuenta entera. */
  @state() private splitSel = new Set<string>();
  /** Líneas que un TENDER EXTERNO ya cubrió (sales#162 / ADR-0386): `line_id` → id del canje.
   *  Salen del importe a cobrar y viajan a `complete_sale` marcadas `covered`, donde el servidor
   *  las vale a 0. El id se guarda porque es lo que identifica el canje que hay que deshacer. */
  @state() private covered = new Map<string, string>();
  @state() private parkedOpen = false;
  @state() private cartOpen = false;
  /** sales#422 — stops following the shell's visible area; set while any sheet (.scrim) is open.
   *  `null` = a sheet is open but there is no shell around the till to follow. */
  private sheetViewportCleanup?: (() => void) | null;
  /** Etiqueta visible de la cuenta. Se persiste en el pedido existente con sales.order.set_label. */
  @state() private orderLabel = '';
  /** Cocina aporta la segunda vista; sin su slot el POS queda en una única cuenta universal. */
  @state() private orderView: 'account' | 'draft' = 'account';
  /** El search del catálogo se despliega desde una lupa (gana alto para la rejilla). */
  @state() private searchOpen = false;
  @state() private tableId?: string;
  /** ADR-0141: pedido MUTABLE que respalda el carrito. Cada artículo se escribe como FILA real al
   *  instante (antes: blob con debounce de 400 ms → un corte de luz perdía el último artículo). */
  @state() private orderId?: string;
  /** Cuenta de sala (sales#61) que espera pedido tras dividir. OPACA: `sales` no la interpreta,
   *  solo la reenvía en `erp:order-linked` para que el segundo pedido cuelgue de ELLA. */
  private pendingSplitSession?: string;
  /** Modal de la CUENTA previa (pre-bill) que se lleva a la mesa antes de cobrar. No es fiscal. */
  @state() private prebillOpen = false;
  /** sales#148 — catálogo de suplementos resuelto (`option_id` → nombre + delta), para poder
   *  IMPRIMIR la cuenta. La fila del pedido guarda solo los ids (migración 023, a propósito: el
   *  precio y el nombre los pone el servidor al cobrar), así que al retomar una mesa el navegador
   *  no sabe cómo se llama «o-queso». Se rellena de `modifiers.options.all`, la misma lectura
   *  autoritativa que usa el cobro. Vacío = aún no se pidió, o el módulo no está. */
  @state() private modifierCatalog = new Map<string, PrintedModifier>();
  /** Diálogo del NOMBRE al aparcar sin mesa (default: la hora, editable de un toque). */
  @state() private parkPromptOpen = false;
  @state() private parkName = '';
  /** Diálogo «¿aparcar o eliminar la cuenta actual?» (solo con carrito sucio SIN mesa). */
  @state() private dirtyOpen = false;
  @state() private dirtyAllowCancel = false;
  private dirtyResolve?: (c: 'park' | 'discard' | 'cancel') => void;
  /** Overlay de Ionic montado en document.body. Los overlays declarados dentro del Shadow DOM
   *  son reubicados por Ionic y pierden el contexto visual del Hub (la «ventana negra»). */
  private pendingSwitchAlert?: IonicAlertElement;
  /** Borrado en DOS toques de una cuenta de la lista: el primero arma, el segundo anula. */
  @state() private armedDelete?: string;
  private armedTimer?: ReturnType<typeof setTimeout>;
  /** sales#283 — the shop's auto-print setting (`printing.settings.get`), which the «Print
   *  receipt» switch starts from on every charge. `undefined` = no `printing` app, or it did not
   *  answer: there is no setting to start from. */
  private autoPrintDefault?: boolean;
  /** sales#283 — what the cashier left on the «Print receipt» switch for THIS charge. `undefined`
   *  = untouched, so the shop's setting applies. It travels with the sale as `print_receipt`
   *  and the shell obeys it over the setting, in both directions (Square/Toast). */
  @state() private printOnCharge?: boolean;
  @state() private tableLabel = '';
  @state() private customerId?: string;
  @state() private customerName = '';
  /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta.
   *  Reactivos desde hub#297: la captura del mostrador los edita a mano cuando la venta pasa del
   *  techo de la simplificada, y el botón de cobrar se enciende con ellos. */
  @state() private customerTaxId = '';
  @state() private customerAddress = '';
  /** sales#332: where the recipient is from (ISO alpha-2) and the kind of document their tax id
   *  is (AEAT IDType). Spain needs no kind; abroad it is pre-set by `defaultIdType`. */
  @state() private customerCountry = HOME_COUNTRY;
  @state() private customerIdType = '';
  /** Techo de la factura simplificada EN CÉNTIMOS, tal y como lo responde el core
   *  (`hub.fiscal.limits`, hub#297). `null` = este país no pone techo, y entonces aquí no pasa
   *  nada nunca. El número NO se escribe en este módulo: un TPV no sabe de derecho fiscal español,
   *  y el día que cambie el importe cambia una fila, no este fichero. */
  @state() private simplifiedMaxCents: number | null = null;
  /** CITA de origen y PROFESIONAL que atendió (ADR-0077). Ids OPACOS: `sales` no los interpreta,
   *  solo los reenvía a `complete_sale`. `appointment_id` dispara
   *  `sales.sale.created_from_appointment`, con el que `appointments` marca la cita convertida;
   *  `staff_id` (≠ `employee_id`, el cajero) es lo que permite el cierre por profesional. */
  private appointmentId?: string;
  /** sales#179 — it is `@state()` because it is now PAINTED (the "who is serving" chip) and can be
   *  changed live; before, only the appointment seeded it and it travelled mute to the checkout. */
  @state() private staffId?: string;
  /** The name to paint, when it is known: the appointment's (`staff_name`) or the chosen person's.
   *  Blank does not mean "nobody" — it means the server resolves it. */
  @state() private staffName = '';
  @state() private staffPickerOpen = false;
  /** sales#277 — the picker is serving ONE LINE, not the whole check: the id of that order row.
   *  Undefined = the chip, which is the gesture sales#179 shipped and the one that seals new
   *  lines. The same dialog does both because a salon with two controls that look alike and mean
   *  different things is the screen this product exists not to be. */
  @state() private staffPickerLine?: string;
  /** Who the picker offers: the team and the people who sign in, folded (sales#318). */
  @state() private staffOptions: StaffOption[] = [];
  /** sales#318 — the `staff` app IS in this hub and its team could not be read. Said in the picker:
   *  a broken team is not a business with no team. Its absence says nothing (ADR-0127). */
  @state() private teamFailed = false;
  /** id → name for whoever a LINE can be attributed to (sales#277).
   *
   *  It is not the same set as `staffOptions`, and the difference is load-bearing twice over. The
   *  picker only OFFERS active people — a leaver cannot take today's work — but a line rung last
   *  month still points at them, and a row that goes nameless is the bug this fixes. And a check
   *  born from an appointment carries a `staff_member` id that is not a person of the hub at all
   *  (ADR-0077), whose name the appointment knows — and so does the team read (sales#318). */
  @state() private staffNames: ReadonlyMap<string, string> = new Map();
  /** State of the list of people: without it the picker would be a blank sheet (and a permission
   *  failure would be mute). It loads when the picker OPENS, not when the till boots. `error` =
   *  the people who sign in could not be read; the team is `teamFailed`. */
  @state() private staffPickerState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  private prodCats = new Map<string, Set<string>>();
  /** Registro de unidades (ADR-0147): code → fila, para congelar el contexto al añadir línea. */
  private units = new Map<string, UnitRow>();
  /** Catálogo fiscal del hub: mapa tax_category_key → rate_pct (preview del IVA) + si LLEGÓ.
   *  Vacío y `available:false` mientras carga o si `taxes` no responde. ADR-0064/0066/0085. */
  private taxCatalog: TaxCatalog = { rates: new Map<string, number>(), available: false, installed: true };
  /** sales#185 — the app the checkout NEEDS is not in this hub (`taxes`, declared a required read
   *  of `sales.complete_sale`). Resolved at mount from the stable code the runtime answers, and it
   *  is what turns "it fails on confirm" into "it is said on entry". */
  @state() private missingChargeApp = '';
  /** hub#1935 — this business files with the tax authority for real and has no way to get its
   *  tickets there: `blocked` is the hub's stable code of what is missing (`''` = the road exists).
   *  Read at mount from the CORE query `hub.fiscal.transmission`, the same rule the dispatcher
   *  refuses the sale with, and updated when the checkout is refused for it. */
  @state() private fiscalRoad: FiscalRoad = { blocked: '', fixRoute: '', expiresAt: '' };
  /** sales#164 — the AUTHORITATIVE valuation of the ticket being charged. `undefined` = it has not
   *  arrived yet, the hub does not have the command, or the network went down: then the screen's
   *  own preview rules, which is what there was before. Never a 0 — a free ticket is not a
   *  degradation. */
  @state() private authoritative?: CheckoutPreview;
  /** Signature of the ticket already priced, so we do not re-ask on every repaint. */
  private valuedSignature = '';
  /** Request counter: an older answer must never overwrite a newer one. */
  private valuationSeq = 0;
  /** Pista de overflow compartida con la bottom bar (fade dinámico + pequeño gesto inicial). */
  private categorySegment?: HTMLElement;
  private categorySegmentCleanup?: () => void;
  private cartRestored = false;
  private saveTimer?: ReturnType<typeof setTimeout>;
  // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
  // (mesa, cliente…) en el header. Botones independientes: cada uno abre su propio modal. El POS no
  // conoce a `tables`/`customers`; solo monta sus WC y escucha `erp:order-context`/`erp:customer-context`.
  private assignFillers: Array<{ component: string; el: HTMLElement }> = [];
  /** Fillers de acciones (`sales.pos.actions`): Cocina aporta «Enviar comanda» dentro del borrador. */
  private actionFillers: Array<{ component: string; el: HTMLElement }> = [];
  /** Fillers del slot de INFO del pedido (`sales.pos.order_info`, cabecera de ENVIADO):
   *  kitchen aporta su chip «Comandas · N» que abre el modal con estados en vivo. */
  private infoFillers: Array<{ component: string; el: HTMLElement }> = [];
  /** Fillers del slot de TENDER POR LÍNEA (`sales.pos.tender`, sales#162 / ADR-0386): `services`
   *  aporta aquí su bono, que cubre UNA línea de servicio entera. El POS no sabe qué es un bono —
   *  monta el slot, le pasa cuatro valores y escucha dos eventos. Sin el módulo dueño, `loadSlot`
   *  devuelve vacío y el cobro es exactamente el de siempre. */
  private tenderFillers: string[] = [];
  /** Una instancia por (filler × línea). Se guardan aquí para que la MISMA sobreviva a cerrar y
   *  reabrir el sheet: el canje ya tomado sigue en pantalla, con su «deshacer». */
  private readonly tenderEls = new Map<string, HTMLElement>();
  // Comanda ATADA a la mesa (puntos 1+2): al cambiar de mesa se GUARDA la comanda de la mesa
  // actual y se RECUPERA la de la nueva (o el carrito suelto si es null). Así tocar una mesa
  // ocupada trae su tiquet a la pantalla de venta, como cualquier POS.
  private readonly onOrderContext = async (e: Event) => {
    const d = (e as CustomEvent<{ table_id: string | null; label?: string; order_id?: string | null }>).detail
      ?? { table_id: null };
    const nextTable = d.table_id ?? undefined;

    // Restauración modular: Tables puede resolver la junction después de que Sales ya haya
    // reabierto el pedido y sus líneas. No es un cambio de cuenta, sino el contexto que faltaba
    // para ESE MISMO pedido; adoptarlo directamente evita el falso diálogo «cuenta a medias».
    if (nextTable && d.order_id && d.order_id === this.orderId) {
      const previousTableLabel = this.tableLabel;
      this.tableId = nextTable;
      this.tableLabel = d.label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      return;
    }
    if (nextTable && nextTable === this.tableId) {
      const previousTableLabel = this.tableLabel;
      this.tableLabel = d.label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      return;
    }

    // Reglas de sala (ADR-0141): lo que hay marcado NUNCA se pierde al tocar una mesa.
    const accion = decideOnTableChange({
      cartHasItems: this.cart.length > 0,
      currentTableId: this.tableId,
      targetTableId: nextTable,
      targetOrderId: d.order_id ?? undefined,
    });

    // La comanda de delante no se mezcla sola con la de la mesa (juntar dos cuentas es FUSIONAR,
    // una acción explícita). `park-then-*` solo ocurre con carrito de BARRA (sin mesa): se
    // PREGUNTA qué hacer — aparcar con nombre o eliminar (decisión Ioan 2026-07-19). Aparcar
    // JAMÁS anula: el `sales.order.void` que vivía aquí hacía «desaparecer» los aparcados.
    const aparcarOEliminar = async () => {
      const eleccion = await this.resolveDirtyCart(false);
      if (eleccion === 'discard') await this.discardCurrent();
      else await this.parkWith(defaultParkLabel('', new Date()));
    };

    if (accion === 'clear' || accion === 'park-then-clear') {
      const habiaMesa = !!this.tableId;
      this.tableId = undefined; this.tableLabel = '';
      if (accion === 'park-then-clear') {
        if (habiaMesa) {
          // La X del chip = QUITAR la mesa (el filler ya aparcó SU sesión): la cuenta pasa a
          // aparcada CON NOMBRE — se pide, para no dejar cuentas «Mesa 4» cuya mesa quedó libre.
          this.parkName = defaultParkLabel('', new Date());
          this.parkedOpen = false;
          this.parkPromptOpen = true;
        } else {
          await aparcarOEliminar();
        }
        return;
      }
      this.orderId = undefined; this.orderLabel = ''; this.cart = [];
      return;
    }

    if (accion === 'start-new-check') {
      // Ya veníamos de una mesa: la comanda de antes SE QUEDA allí, abierta, y aquí se empieza una
      // cuenta nueva. Llevarse la cuenta a otra mesa es TRANSFERIR, un botón aparte (igual que en
      // Toast/Lightspeed). Antes esto arrastraba la comanda y re-enlazaba la junction en cada mesa
      // tocada: ninguna se liberaba y acabábamos con tres mesas ocupadas por el mismo pedido.
      this.tableId = nextTable; this.tableLabel = d.label ?? '';
      this.orderId = undefined; this.orderLabel = this.tableLabel; this.cart = [];
      return;
    }

    if (accion === 'assign-to-target') {
      // La comanda de delante pasa a SER la de esa mesa: se enlaza la junction, no se mueve nada.
      this.tableId = nextTable; this.tableLabel = d.label ?? '';
      if (!this.orderLabel) this.orderLabel = this.tableLabel;
      this.notifyOrderLinked();
      return;
    }

    if (accion === 'park-then-load') await aparcarOEliminar();

    // Abrir la comanda de la mesa (o empezar en blanco si no tiene).
    this.tableId = nextTable; this.tableLabel = d.label ?? '';
    const linked = d.order_id ?? undefined;
    this.orderId = linked;
    this.orderLabel = this.tableLabel;
    if (linked) rememberCurrentCheck(localStorage, linked); else forgetCurrentCheck(localStorage);
    this.cart = linked ? await loadOrderLines(erplora(), linked) : [];
  };

  // Fusionar mesas (punto 3): el filler ya ejecutó tables.sessions.merge; aquí se combinan los
  // tiquets (sumando líneas idénticas) en la mesa destino y se limpia el origen.
  private readonly onOrderMerge = async (e: Event) => {
    const d = (e as CustomEvent<{
      from_table_id: string; to_table_id: string; to_label?: string;
      from_order_id?: string | null; to_order_id?: string | null;
    }>).detail;
    if (!d?.from_table_id || !d?.to_table_id || d.from_table_id === d.to_table_id) return;
    // ADR-0141: FUSIONAR = las líneas del pedido ORIGEN se suman al del DESTINO y el origen se
    // anula → una sola cuenta en una sola mesa. Son filas que se mueven, así que las cantidades y
    // precios se conservan. (Antes esto reescribía dos blobs; con el pedido ya no hay blob.)
    const from = d.from_order_id ?? undefined;
    let to = d.to_order_id ?? undefined;
    if (!from) return; // el origen no tenía comanda: nada que sumar
    if (!to) {
      // La mesa destino aún no tenía pedido: la comanda del origen pasa a ser SU comanda.
      to = from;
    } else {
      await mergeOrders(erplora(), from, to);
    }
    if (this.tableId === d.from_table_id || this.tableId === d.to_table_id) {
      const previousTableLabel = this.tableLabel;
      this.tableId = d.to_table_id;
      this.tableLabel = d.to_label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      this.orderId = to;
      this.cart = await loadOrderLines(erplora(), to);
    }
  };
  // Dividir la cuenta (sales#61): el filler ya ejecutó `tables.sessions.split`, así que la mesa
  // tiene una SEGUNDA cuenta viva — y nace sin pedido a propósito, porque las líneas y los importes
  // son de `sales`. Aquí se materializa ese segundo pedido con lo que el camarero haya MARCADO en
  // el carrito (la misma marca que ya sirve para cobrar por partes: se toca lo de quien se va) y se
  // publica para que la sala lo cuelgue de ESA cuenta, no de "la mesa".
  private readonly onOrderSplit = async (e: Event) => {
    const d = (e as CustomEvent<{
      table_id?: string | null; from_order_id?: string | null;
      session_id?: string | null; label?: string;
    }>).detail;
    if (!d) return;
    // El id de la cuenta nueva es OPACO: se guarda para el `erp:order-linked` y no se interpreta.
    this.pendingSplitSession = d.session_id ?? undefined;

    const source = d.from_order_id ?? this.orderId;
    if (!source) {
      // La mesa aún no había pedido nada: no hay nada que repartir. La cuenta nueva queda esperando
      // y el primer producto abrirá su pedido — que ya se enganchará a ella (`pendingSplitSession`).
      this.orderId = undefined; this.cart = []; this.splitSel = new Set();
      this.orderLabel = d.label ?? this.orderLabel;
      forgetCurrentCheck(localStorage);
      return;
    }

    // Lo marcado solo vale si lo marcado ES de esta cuenta: el ⋮ del plano se abre mires lo que
    // mires, y dividir la mesa 7 con las líneas de la 4 seleccionadas no movería nada.
    const marcadas = source === this.orderId ? this.splitSel : new Set<string>();
    let nuevo = '';
    try {
      nuevo = await splitOrder(erplora(), source, marcadas, d.label ?? '');
    } catch {
      this.error = t('ui.splitFailed');
      return;
    }
    if (!nuevo) { this.error = t('ui.splitFailed'); return; }

    // La pantalla se queda en la SEGUNDA cuenta: dividir se hace para cobrarla, no para mirarla.
    this.splitSel = new Set();
    this.orderId = nuevo;
    this.orderLabel = d.label ?? this.orderLabel;
    if (d.table_id) this.tableId = d.table_id;
    rememberCurrentCheck(localStorage, nuevo);
    this.notifyOrderLinked();
    this.cart = await loadOrderLines(erplora(), nuevo);
    this.parked = await listOpenChecks(erplora(), nuevo);
  };
  // Transferir mesa (punto 4): el filler ya ejecutó tables.sessions.transfer; aquí se mueve la
  // comanda de la mesa origen a la destino (libre → sin comanda previa) y se limpia el origen.
  private readonly onOrderTransfer = async (e: Event) => {
    const d = (e as CustomEvent<{
      from_table_id: string; to_table_id: string; to_label?: string; to_order_id?: string | null;
    }>).detail;
    if (!d?.from_table_id || !d?.to_table_id || d.from_table_id === d.to_table_id) return;
    // ADR-0141: TRANSFERIR no mueve la comanda — es el MISMO pedido, que ahora cuelga de otra mesa
    // (la sesión nueva arrastró el `order_id`). Por eso los productos se conservan sin copiar nada:
    // aquí solo se actualiza el contexto de la pantalla. Antes había que reescribir dos blobs.
    if (this.tableId !== d.from_table_id) return;
    const previousTableLabel = this.tableLabel;
    this.tableId = d.to_table_id;
    this.tableLabel = d.to_label ?? this.tableLabel;
    if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
    const order = d.to_order_id ?? this.orderId;
    if (order && order !== this.orderId) {
      this.orderId = order;
      this.cart = await loadOrderLines(erplora(), order);
    }
  };
  private readonly onCustomerContext = (e: Event) => {
    const d = (e as CustomEvent<{
      customer_id: string | null; customer_name?: string;
      customer_tax_id?: string; customer_address?: string; customer_country?: string;
    }>).detail ?? { customer_id: null };
    this.customerId = d.customer_id ?? undefined;
    this.customerName = d.customer_name ?? '';
    this.customerTaxId = d.customer_tax_id ?? '';
    this.customerAddress = d.customer_address ?? '';
    // sales#336: a territory (GF, GP…) comes in as its parent country with the territory's tax id;
    // sales#360: Kosovo and Western Sahara as the AEAT's «not listed» country (QU).
    const recipient = recipientFromDetail(d.customer_country);
    this.setCustomerCountry(recipient.country, recipient.idType);
    // ADR-0141: el pedido NO guarda el cliente y `sales` NO llama a `customers` (sería depender de
    // él, y una tienda de alimentación vende sin clientes). La junction la escribe SU dueño al
    // recibir `erp:order-linked`, igual que hace `tables`. Aquí solo se guarda el SNAPSHOT FISCAL
    // (nombre/NIF/dirección), que es otra cosa: viaja congelado en la venta al cobrar (ADR-0132).
    this.notifyOrderLinked();
  };
  // hub#1411 — el detalle puede traer la PRIORIDAD que armó el filler de cocina («urgente»). El
  // host la reenvía sin interpretarla, igual que la etiqueta de la mesa: `sales` no sabe qué es
  // una cocina, y el vocabulario (`rush`) es de `kitchen`, que lo valida al crear la ronda.
  private readonly onOrderFire = (e: Event) => {
    const detail = (e as CustomEvent<{ priority?: string } | undefined>).detail;
    void this.fireToKitchen(detail?.priority);
  };

  /** Una línea la cubrió un tender externo: sale del importe a cobrar y el resto del ticket sigue
   *  cobrándose con su propio medio. El id del canje se guarda porque es lo que lo identifica. */
  private readonly onLineTenderHeld = (e: Event) => {
    const d = (e as CustomEvent<{ redemptionId?: string; lineRef?: string }>).detail;
    if (!d?.lineRef) return;
    const next = new Map(this.covered);
    next.set(d.lineRef, String(d.redemptionId ?? ''));
    this.covered = next;
  };

  /** El cajero deshizo el canje antes de cobrar: la línea vuelve a contar. */
  private readonly onLineTenderReleased = (e: Event) => {
    const d = (e as CustomEvent<{ lineRef?: string }>).detail;
    if (!d?.lineRef) return;
    const next = new Map(this.covered);
    next.delete(d.lineRef);
    this.covered = next;
  };
  private readonly onLocaleChange = (): void => this.requestUpdate();

  /**
   * appointments#154 — the agenda knocking with a booking to charge.
   *
   * The shell keeps the screen you walked away from MOUNTED and merely hidden (`ModuleView.vue`:
   * «Ionic no desmonta la página que dejas atrás»), so from the second «Cobrar» of the shift on,
   * `?appointment_id=` lands on a till that is already here and whose boot ran long ago. Reading
   * the link only at boot meant that check opened blank — no customer, no service, no
   * professional — and the salon typed it all in again.
   *
   * Same rule `flows#57` settled: a module deep link is served on EVERY navigation that names it,
   * never «once». `pushState` + `PopStateEvent` is the only channel a Web Component has to the
   * shell, and it is the one `appointments::goToTill()` uses.
   */
  private readonly onPopState = (): void => { void this.serveDeepLink(); };

  /**
   * hub#1906 — the system Back (Android's button, the browser's arrow) closes the TOPMOST layer of
   * the till before it leaves the screen. The shell cannot see these sheets (they live in this
   * shadow DOM), so on every Back it dispatches a cancelable `erplora:back` on `window`;
   * `preventDefault()` answers "I closed something, keep the screen". Checked topmost first, in the
   * reverse of the order the template paints them. Each close is exactly what that layer's own ✕ /
   * Cancel does. The dirty-cart question without a Cancel HOLDS the Back: it must be answered.
   */
  private readonly onSystemBack = (e: Event): void => {
    if (this.closeTopmostLayer()) e.preventDefault();
  };

  private closeTopmostLayer(): boolean {
    if (this.prebillOpen) { this.prebillOpen = false; return true; }
    if (this.docSaleId) { this.docSaleId = undefined; return true; }
    if (this.searchOpen) {
      (this.renderRoot.querySelector('ok-spotlight-search') as { close?: () => void } | null)?.close?.();
      this.searchOpen = false;
      return true;
    }
    if (this.dirtyOpen) {
      if (this.dirtyAllowCancel) this.answerDirty('cancel');
      return true;
    }
    if (this.staffPickerOpen) { this.staffPickerOpen = false; this.staffPickerLine = undefined; return true; }
    if (this.parkPromptOpen) { this.parkPromptOpen = false; return true; }
    if (this.discountSheet) { this.discountSheet = undefined; return true; }
    if (this.noteSheet) { this.noteSheet = undefined; return true; }
    if (this.openPriceOpen) { this.openPriceOpen = false; return true; }
    if (this.comboSheet) { this.comboSheet = undefined; return true; }
    if (this.modifierSheet) { this.modifierSheet = undefined; return true; }
    if (this.paying) { this.paying = false; return true; }
    if (this.parkedOpen) { this.parkedOpen = false; return true; }
    if (this.moreOpen) { this.moreOpen = false; return true; }
    if (this.cartOpen) { this.cartOpen = false; return true; }
    return false;
  }

  /** Resolves when the boot settled. A booking that lands mid-boot waits for the services
   *  catalogue instead of seeding a line whose VAT category nobody could resolve. */
  private resolveBoot: () => void = () => {};
  private readonly booted = new Promise<void>((resolve) => { this.resolveBoot = resolve; });

  /** Serves `?appointment_id=` on a till that is already on screen. The services catalogue comes
   *  from the grid the till already loaded — one source of fiscal truth for both doors. */
  private async serveDeepLink(): Promise<void> {
    await this.booted;
    if (!this.isConnected) return;
    await this.consumeAppointmentDeepLink(this.products.filter((p) => p.is_service));
  }

  // ══ sales#28 · THE SCALE ═════════════════════════════════════════════════════════════════════
  //
  // Decided with the market (9 references + 2 forums; the table is in `lib/scale-entry.ts` and in
  // `architecture/modules/sales.md`). Square, Odoo, Clover, Toast, Lightspeed and Glop all do the
  // same thing: the cashier picks the article, THEN the platter, and the reading becomes that
  // line's quantity. Nothing here creates a line, and nothing here converts a unit.

  /** A weight the hardware measured. Fire-and-forget: the shell never waits for an answer. */
  private readonly onScaleWeight = (e: Event): void => {
    void this.applyScaleWeight((e as CustomEvent).detail);
  };

  /**
   * Turns a measured weight into the quantity of the line it belongs to.
   *
   * 🔴 It goes through `setQtyAbs`, the very door the stepper uses — so `toMicro` and `onGrid`
   * judge a weighed 0,5 exactly as they judge a typed one, and an off-grid weight is refused with
   * `ui.qtyOffGrid` without altering the check. Opening a second path into the cart is the whole
   * mistake this contract exists to avoid.
   *
   * Most refusals are SILENT on purpose: a scale streams while a hand is still on the platter and
   * while nothing is selected, so turning that into a banner would train the cashier to ignore the
   * banner. The one that is said out loud is the unit mismatch — that is a misconfigured shop, and
   * it is the refusal standing between «532 g» and a kilo and a half on a fiscal document.
   */
  async applyScaleWeight(detail: unknown): Promise<void> {
    const reading = parseScaleReading(detail);
    if (!reading) return;
    const target = scaleTargetLine(this.cart, (code) => !!code && this.units.get(code)?.category === 'mass');
    const verdict = scaleVerdict(target, reading);
    if (!verdict.ok) {
      if (verdict.reason === 'unit_mismatch') {
        this.error = t('ui.scaleUnitMismatch', { scale: verdict.got, line: verdict.expected });
      }
      return;
    }
    await this.queue(() => this.setQtyAbs(target!.id, verdict.qty));
  }

  async connectedCallback() {
    const connectionEpoch = ++this.connectionEpoch;
    super.connectedCallback();
    window.addEventListener('erplora:locale-changed', this.onLocaleChange);
    window.addEventListener(SCALE_WEIGHT_EVENT, this.onScaleWeight);
    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('erplora:back', this.onSystemBack);
    // sales#25 — the reads against a HARD dependency (`inventory`, `taxes`). Every one of them used
    // to end in `.catch(() => [])`, which answers "the app is not in this hub" and "the app is here
    // and its query broke" with the SAME empty catalogue: the shift opens with an empty grid and
    // nobody can tell an uninstall from an incident. `dependencyRead` classifies (hub#1074,
    // ADR-0400) and this set carries the incident up to the screen.
    //
    // The query name stays LITERAL inside each SDK call on purpose: the contract extractor
    // (ADR-0127) does not follow variables, and moving the name into a parameter would erase these
    // reads from `.erplora/contracts.json`.
    const brokenApps = new Set<string>();
    const absentApps = new Set<string>();
    const hardRead = async <T>(app: string, read: () => Promise<unknown>): Promise<T[]> => {
      const out = await dependencyRead<T>(read);
      if (out.broken) brokenApps.add(app);
      return out.rows;
    };
    // sales#25 — the same classification for an app read through the OPTIONAL door. `inventory` is
    // no longer in `depends_on`, so a hub without it is a legitimate hub: `undefined` degrades and
    // is written down where the products would be, while a failure still raises the incident.
    const capabilityCatalogRead = async <T>(
      app: string,
      whole: (c: ErploraClientLike) => Promise<unknown>,
      page: (c: ErploraClientLike) => Promise<unknown>,
    ): Promise<T[]> => {
      const out = await optionalCatalogRead<T>(whole, page);
      if (out.broken) brokenApps.add(app);
      if (out.absent) absentApps.add(app);
      return out.rows;
    };
    // sales#25 — the till's OWN policy, started first because it decides which catalogues are
    // worth reading at all. It is ONE narrow read on this module's own table, and only the two
    // catalogue reads wait on it: everything else below still starts at once.
    const policy = this.loadPosSettings();
    const fromSource = async <T>(flag: 'sync_products' | 'sync_services', read: () => Promise<T[]>): Promise<T[]> =>
      (catalogSourceOn((await policy)[flag]) ? read() : []);
    // sales#409 — with the service source OFF the till never asks `services` for its catalogue, and
    // a salon's grid then looks exactly like a shop's that never sold a haircut. ONE cheap question
    // (a single COUNT row, never the catalogue) tells the two apart, so the screen can say why.
    const servicesHidden = this.probeHiddenServices(policy);
    try {
      const [prods, methods, businessRows, savedCart, parked, cats, prodCats, taxCatalog, unitRows,
             svcRows, svcCats, taxCats, ownDepartments, fiscalLimits, fiscalRoadRows, printingRows] = await Promise.all([
        fromSource<Product>('sync_products', () => capabilityCatalogRead<Product>('inventory',
          (c) => c.queryAllOptional<Product>('inventory.products.list'),
          (c) => c.queryOptional<Product>('inventory.products.list', { limit: LEGACY_PAGE_LIMIT }))),
        erplora().query('sales.payment_methods').catch(() => []),
        // sales#180 — the business identity for the BILL's header. Deliberately apart from the
        // settings: it lives in `hub_settings` (single source, ADR-0061), not in this module's
        // table, and it answers on a freshly built hub where nobody has saved the till settings
        // yet — which is exactly where the bill used to come out headed with the generic default.
        erplora().query('sales.business.get').catch(() => []),
        this.restoreOpenOrder(),
        listOpenChecks(erplora()),
        fromSource<Category>('sync_products', () => capabilityCatalogRead<Category>('inventory',
          (c) => c.queryAllOptional<Category>('inventory.categories.list', { sort: 'name', dir: 'asc' }),
          (c) => c.queryOptional<Category>('inventory.categories.list', { sort: 'name', dir: 'asc', limit: LEGACY_PAGE_LIMIT }))),
        fromSource<ProdCat>('sync_products', () => capabilityCatalogRead<ProdCat>('inventory',
          (c) => c.queryAllOptional<ProdCat>('inventory.product_categories'),
          (c) => c.queryOptional<ProdCat>('inventory.product_categories'))),
        loadTaxCatalog(erplora()),
        capabilityCatalogRead<UnitRow>('inventory',
          (c) => c.queryAllOptional<UnitRow>('inventory.units.list'),
          (c) => c.queryOptional<UnitRow>('inventory.units.list')),
        // sales#89 — el catálogo VENDIBLE de servicios. Lectura OPCIONAL (ADR-0127): `services` NO
        // está en `depends_on` a propósito, porque `depends_on` es un contrato DURO que obligaría a
        // todo restaurante a instalar el módulo y ataría `sales` a su cascada de desactivación. Un
        // hub sin `services` recibe `undefined` y el TPV sigue siendo exactamente el de antes.
        fromSource<Product>('sync_services', () => this.loadServices(capabilityCatalogRead)),
        fromSource<Category>('sync_services', () => this.loadServiceCategories(capabilityCatalogRead)),
        // Departments for the free-price sale (ADR-0085). It never breaks the till: with no
        // departments the sheet says so. But a `taxes` that IS installed and does not answer is an
        // incident, not the absence of departments, and sales#25 makes that difference visible.
        hardRead<TaxCategory>('taxes', () => erplora().queryAll<TaxCategory>('taxes.categories.list')),
        // sales#267 — the departments the BUSINESS defined, which win over the tax catalogue above.
        //
        // Best-effort on purpose, the same way `hub.fiscal.limits` below is: an empty answer and a
        // failed one land on the SAME behaviour — the sheet falls back to the active tax
        // categories, which is exactly how the till worked before this table existed. So a `sales`
        // mid-upgrade (image newer than its migrations, or the other way round) keeps selling by
        // department instead of losing the open-price flow over one optional read.
        erplora().queryAll<DepartmentRow>('sales.departments.list', { sort: 'sort_order', dir: 'asc' })
          .catch(() => [] as DepartmentRow[]),
        // hub#297 — qué techo pone el régimen fiscal de ESTE hub. Es una query del CORE
        // (`hub.`), no de `verifactu`: así el TPV no gana una dependencia del módulo fiscal y la
        // respuesta no desaparece el día que alguien lo desinstale.
        //
        // Best-effort a propósito. Si no responde (hub anterior a la query, arranque a medias) se
        // vende exactamente como siempre: un TPV no deja de cobrar porque una lectura falle. Lo
        // que NO queda desprotegido es el cable — §15.8 en el validador para el registro igual, y
        // esa es la mitad que impide que el número se gaste en una factura que la AEAT rechaza.
        erplora().query('hub.fiscal.limits').catch(() => []),
        // hub#1935 — can this business get its tickets to the tax authority at all? Also a CORE
        // query, for the same reason. Best-effort like the limits: a read that fails does not stop
        // the till, because the dispatcher refuses the sale on its own. What this buys is saying it
        // BEFORE the cashier charges — a card can go through a separate terminal first.
        erplora().query('hub.fiscal.transmission').catch(() => []),
        // sales#283 — the auto-print setting the «Print receipt» switch starts from. Optional app,
        // best-effort read: without it the switch sends nothing unless touched and the shell keeps
        // deciding exactly as before.
        optionalRead((c) => c.queryOptional('printing.settings.get')),
        // sales#153 — los MENÚS que este hub vende. Una sola lectura (`combos.options.all`) da a la
        // vez las baldosas y sus grupos, así que es imposible ofrecer un menú cuyos cursos no se
        // hayan cargado: eso sería justo «ofrecer lo que el servidor va a rechazar».
        this.loadCombos(),
        // sales#111 / hub#960 — THE PREFLIGHT OF THE QUERY THE CHECKOUT PRICES AGAINST.
        //
        // `sales.complete_sale` resolves every catalogue line against `inventory.products.for_sale`
        // (sales#68), a query born in inventory 1.2.20. An older `inventory` answers the grid
        // perfectly and does NOT answer this one, so the till looked healthy and refused every
        // product at payment time. Until sales#25 that was bought at install time by the hard
        // dependency's `min_version` floor; with the dependency gone the till asks the question
        // itself — and gets an answer the floor never could give it, because a catalogue that is
        // present, recent and BROKEN (or denied) lands here too.
        //
        // The rows are thrown away on purpose: what is being read is whether the answer EXISTS.
        // It rides the `sync_products` switch because a till that shows no product grid has no
        // catalogue line to price, so there is nothing to preflight and nothing to warn about.
        fromSource<never>('sync_products', () => capabilityCatalogRead<never>('inventory',
          (c) => c.queryAllOptional('inventory.products.for_sale'),
          (c) => c.queryOptional('inventory.products.for_sale'))),
      ]);
      if (connectionEpoch !== this.connectionEpoch || !this.isConnected) return;
      // sales#25 — one notice per broken app, in a fixed order so the screen does not reshuffle
      // between loads. Absence never reaches this list.
      this.brokenCatalogApps = CATALOG_INCIDENT_APPS.filter((app) => brokenApps.has(app));
      // sales#25 — DEGRADED MODE, said where the products would have been. `inventory` is an
      // optional capability now, so a hub without it is a legitimate hub that sells services and
      // free-price lines (ADR-0085) — but that is not the NORMAL mode, and an empty grid with no
      // explanation is how a business concludes the till is broken. Gated on the product source
      // being ON: a shop that switched the product grid off asked for an empty grid.
      this.catalogAppAbsent = absentApps.has('inventory') && catalogSourceOn((await policy).sync_products);
      this.servicesHidden = await servicesHidden;
      this.taxCatalog = taxCatalog;
      // sales#185 — PREFLIGHT. `sales.complete_sale` declares `taxes.rules.list` as a read with
      // `required: true`: with no tax app NO sale can close, and until now the POS looked perfectly
      // healthy until the cashier had already typed the amount, picked a payment method and
      // confirmed. It is known HERE, from the runtime's stable code, so it is said HERE.
      this.missingChargeApp = taxCatalog.installed ? '' : 'taxes';
      this.fiscalRoad = readFiscalRoad(fiscalRoadRows);
      this.autoPrintDefault = readAutoPrint(printingRows);
      // `?? null` y no `?? 0`: el core ya devuelve `null` cuando el país no pone techo, y un 0 que
      // se colara aquí como importe pararía TODAS las ventas del local.
      this.simplifiedMaxCents =
        rows<{ simplified_invoice_max_cents?: number | null }>(fiscalLimits)[0]?.simplified_invoice_max_cents ?? null;
      for (const u of unitRows) if (u.code) this.units.set(u.code, u);
      // sales#89: retail + servicios en la MISMA rejilla. Los servicios van detrás para que una
      // tienda sin `services` vea exactamente el orden de siempre.
      this.products = [...prods.filter((p) => p.is_active !== 0), ...svcRows];
      void this.photos.replace(this.products.map((p) => p.image));
      for (const s of svcRows) {
        if (!s.category_id) continue;
        if (!this.prodCats.has(s.id)) this.prodCats.set(s.id, new Set());
        this.prodCats.get(s.id)!.add(s.category_id);
      }
      this.methods = rows<PayMethod>(methods);
      // sales#203 — ONE read for the whole policy, and it is the narrow one. `sales.settings.get`
      // needs `sales.manage_settings`, so for a cashier it answered nothing at all and EVERY
      // setting it fed fell back to its default without a word: card-only became all methods, no
      // discounts became discounts, the shop's receipt became a blank one. Reading only through
      // `sales.pos_settings.get` makes the screen identical for an admin and for a cashier — which
      // is the property that matters, because a difference between the two is invisible to whoever
      // tests it.
      this.settings = await policy;
      this.businessName = rows<{ name?: string }>(businessRows)[0]?.name || '';
      this.docFormat = this.settings.default_document_format === 'invoice' ? 'invoice' : 'ticket';
      this.payMethod = defaultPayMethod(this.payMethods);
      this.parked = parked;
      this.categories = [...cats.filter((c) => c.name), ...svcCats];
      // Departamentos: los del NEGOCIO si los tiene (sales#267); si no, las categorías fiscales
      // ACTIVAS, que es el camino de siempre (el inactivo no se ofrece para vender).
      this.taxCategories = taxCats.filter((c) => c.key && c.is_active !== 0);
      this.ownDepartments = rows<DepartmentRow>(ownDepartments).filter((d) => d.id && d.name && d.tax_category_key);
      for (const pc of prodCats) {
        if (!this.prodCats.has(pc.product_id)) this.prodCats.set(pc.product_id, new Set());
        this.prodCats.get(pc.product_id)!.add(pc.category_id);
      }
      if (savedCart.length) this.cart = savedCart;
      // ADR-0077: la agenda manda aquí con `?appointment_id=`. Se consume UNA vez y se borra de la
      // URL — si sobreviviera, recargar la pantalla volvería a sembrar la misma cita sobre el
      // carrito. Va después del carrito guardado para no pisar una cuenta ya abierta.
      await this.consumeAppointmentDeepLink(svcRows);
      await this.updateComplete;
      this.addEventListener('erp:order-context', this.onOrderContext);
      this.addEventListener('erp:order-merge', this.onOrderMerge);
      this.addEventListener('erp:order-split', this.onOrderSplit);
      this.addEventListener('erp:order-transfer', this.onOrderTransfer);
      this.addEventListener('erp:customer-context', this.onCustomerContext);
      // Contrato del slot del footer: el filler emite `erp:order-fire` (bubbles+composed) y el
      // HOST ejecuta su comando — el estado del carrito vive aquí, al filler no viaja nada.
      this.addEventListener('erp:order-fire', this.onOrderFire);
      // sales#162 — contrato del slot `sales.pos.tender`: el filler avisa de que UNA línea quedó
      // cubierta (o dejó de estarlo) y el HOST hace la aritmética. Bubbles + composed, así que
      // cruzan el Shadow DOM del filler y llegan aquí sin que el POS lo conozca.
      this.addEventListener('erp:voucher-held', this.onLineTenderHeld);
      this.addEventListener('erp:voucher-released', this.onLineTenderReleased);
      await this.resolveSlots();
      this.ensureSlotsMounted();
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorLoadingPos');
    } finally {
      this.cartRestored = true;
      // From here on a `popstate` may serve a booking on its own: the catalogue is in hand.
      this.resolveBoot();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    ++this.connectionEpoch;
    this.photos.dispose();
    window.removeEventListener('erplora:locale-changed', this.onLocaleChange);
    this.unwatchSheetViewport();
    window.removeEventListener(SCALE_WEIGHT_EVENT, this.onScaleWeight);
    window.removeEventListener('popstate', this.onPopState);
    window.removeEventListener('erplora:back', this.onSystemBack);
    this.removeEventListener('erp:order-context', this.onOrderContext);
    this.removeEventListener('erp:order-merge', this.onOrderMerge);
    this.removeEventListener('erp:order-split', this.onOrderSplit);
    this.removeEventListener('erp:order-transfer', this.onOrderTransfer);
    this.removeEventListener('erp:customer-context', this.onCustomerContext);
    this.removeEventListener('erp:order-fire', this.onOrderFire);
    this.removeEventListener('erp:voucher-held', this.onLineTenderHeld);
    this.removeEventListener('erp:voucher-released', this.onLineTenderReleased);
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    if (this.pendingSwitchAlert) {
      void this.pendingSwitchAlert.dismiss?.();
      this.pendingSwitchAlert.remove();
      this.pendingSwitchAlert = undefined;
    }
    this.categorySegmentCleanup?.();
    this.categorySegmentCleanup = undefined;
    this.categorySegment = undefined;
  }

  private async resolveSlots() {
    const sdk = (globalThis as {
      erplora?: { loadSlot?: (s: string) => Promise<Array<Record<string, unknown> & { component: string }>> };
    }).erplora;
    if (!sdk?.loadSlot) return;
    // Hidratación POR LITERAL (ADR-0127): el nombre del slot va en la propia llamada al SDK.
    let resolved: Array<Record<string, unknown> & { component: string }> = [];
    try { resolved = (await sdk.loadSlot('sales.pos.assign')) ?? []; } catch { resolved = []; }
    this.assignFillers = resolved.map((f) => ({
      component: f.component,
      el: document.createElement(f.component) as HTMLElement,
    }));
    // Acciones de la comanda: kitchen aporta aquí su «Enviar a cocina». El host lo monta dentro
    // de la vista Comanda actual; sin filler no existe esa vista ni queda hueco vacío.
    let acciones: Array<Record<string, unknown> & { component: string }> = [];
    try { acciones = (await sdk.loadSlot('sales.pos.actions')) ?? []; } catch { acciones = []; }
    this.actionFillers = acciones.map((f) => ({
      component: f.component,
      el: document.createElement(f.component) as HTMLElement,
    }));
    // Slot de INFO del pedido: kitchen cuelga aquí su chip de comandas (modal con estados).
    let info: Array<Record<string, unknown> & { component: string }> = [];
    try { info = (await sdk.loadSlot('sales.pos.order_info')) ?? []; } catch { info = []; }
    this.infoFillers = info.map((f) => ({
      component: f.component,
      el: document.createElement(f.component) as HTMLElement,
    }));
    // Slot de TENDER POR LÍNEA: aquí NO se crea el elemento todavía, porque hay uno POR LÍNEA y las
    // líneas aún no existen. Se guarda el nombre y `ensureSlotsMounted` instancia lo que toque.
    let tender: Array<Record<string, unknown> & { component: string }> = [];
    try { tender = (await sdk.loadSlot('sales.pos.tender')) ?? []; } catch { tender = []; }
    this.tenderFillers = tender.map((f) => f.component);
    this.requestUpdate();
  }

  /** (Re)engancha los botones de los fillers en el header; idempotente, sobrevive a re-renders. */
  private ensureSlotsMounted() {
    const host = this.renderRoot.querySelector('.cart-actions-slot') as HTMLElement | null;
    if (host) for (const f of this.assignFillers) {
      if (f.el.parentElement === host) continue;
      host.appendChild(f.el);
      // Al montarse, si ya hay un pedido reanudado, se le pide que recupere LO SUYO. El aviso de
      // `restoreOpenOrder` puede llegar ANTES de que los fillers existan (los resuelve el SDK de
      // forma asíncrona), y entonces no lo recibía nadie: la comanda salía «sin mesa» aunque la
      // mesa siguiera ocupada. Aquí el orden ya da igual.
      if (this.orderId) {
        f.el.dispatchEvent(new CustomEvent('erp:order-restored', { detail: { order_id: this.orderId }, bubbles: false }));
      }
    }
    // Acción de Cocina dentro de «Comanda actual»: las MISMAS instancias se reenganchan cuando
    // el usuario entra en esa vista, sin duplicar ni importar código del módulo proveedor.
    const draftActions = this.renderRoot.querySelector('.draft-actions-slot') as HTMLElement | null;
    if (draftActions) for (const f of this.actionFillers) {
      if (f.el.parentElement === draftActions) continue;
      draftActions.appendChild(f.el);
      this.emitPosState([f]);
    }
    // Info del pedido: el chip de comandas de kitchen vive en la cabecera de ENVIADO (solo se
    // pinta cuando hay líneas enviadas; el montaje resiliente lo re-engancha al reaparecer).
    const infoHost = this.renderRoot.querySelector('.sec-slot') as HTMLElement | null;
    if (infoHost) for (const f of this.infoFillers) {
      if (f.el.parentElement === infoHost) continue;
      infoHost.appendChild(f.el);
      this.emitPosState([f]);
    }
    this.ensureTenderSlotsMounted();
  }

  /** Tender POR LÍNEA (`sales.pos.tender`, sales#162): una instancia del filler por línea de
   *  servicio del cobro. Idempotente como el resto — el sheet se re-renderiza en cada tecla.
   *
   *  🔴 Las cuatro propiedades se ponen ANTES de insertar el elemento: el filler arranca su lectura
   *  en `connectedCallback`, así que un insert primero lo haría preguntar por un cliente vacío y
   *  pintar «este cliente no tiene bonos» encima de una clienta que sí lo tiene.
   *
   *  Las instancias se guardan en `tenderEls` y NO se recrean: cerrar el sheet desmonta el DOM del
   *  cobro, y con un elemento nuevo el canje ya tomado desaparecería de la pantalla junto con su
   *  «deshacer», dejando una sesión gastada que nadie puede devolver desde la caja. */
  private ensureTenderSlotsMounted() {
    const lines = this.tenderLines;
    const alive = new Set<string>();
    for (const l of lines) {
      if (!coverableLine(l)) continue;
      const host = [...this.renderRoot.querySelectorAll<HTMLElement>('.tender-line')]
        .find((n) => n.dataset.line === l.line_id)
        ?.querySelector<HTMLElement>('.tl-slot');
      if (!host) continue;
      for (const component of this.tenderFillers) {
        const key = `${component}::${l.line_id}`;
        alive.add(key);
        let el = this.tenderEls.get(key);
        if (!el) {
          el = document.createElement(component);
          this.tenderEls.set(key, el);
        }
        // Datos TIPADOS por propiedad JS, nunca por atributo (ADR-0043): un atributo obliga al
        // filler a re-parsear cadenas y pierde el tipo.
        const props = el as HTMLElement & {
          customerId?: string; serviceId?: string; checkoutRef?: string; lineRef?: string;
        };
        props.customerId = this.customerId ?? '';
        props.serviceId = l.id;
        props.checkoutRef = this.orderId ?? '';
        props.lineRef = l.line_id as string;
        if (el.parentElement !== host) host.appendChild(el);
      }
    }
    // Una línea que ya no está en el cobro (se quitó del carrito, o el cajero cambió la selección)
    // se lleva su filler: dejarlo colgando sería ofrecer canjear algo que ya nadie cobra.
    for (const [key, el] of [...this.tenderEls]) {
      if (alive.has(key)) continue;
      el.remove();
      this.tenderEls.delete(key);
    }
    // Y su cobertura: el dinero manda: si la línea no se cobra, no puede seguir descontando importe.
    // El canje huérfano vive en el módulo dueño, que es quien sabe deshacerlo.
    if (this.covered.size) {
      const billed = new Set(this.billedLines.map((l) => l.line_id));
      const next = new Map([...this.covered].filter(([lineId]) => billed.has(lineId)));
      if (next.size !== this.covered.size) this.covered = next;
    }
  }

  /** Cuenta a los fillers el estado mínimo del carrito (`erp:pos-state`). No viaja ninguna línea:
   *  `pending_count` permite que Mesas impida cambiar de cuenta antes de enviar la comanda y que
   *  Cocina pinte su acción/badge, sin acoplar esos módulos a los datos de sales. */
  private emitPosState(fillers = [...this.assignFillers, ...this.actionFillers, ...this.infoFillers]): void {
    for (const f of fillers) {
      f.el.dispatchEvent(new CustomEvent('erp:pos-state', {
        detail: {
          order_id: this.orderId,
          items_count: this.cart.length,
          pending_count: pendingLines(this.cart).length,
          kitchen_enabled: this.hasKitchen,
          label: this.tableLabel,
          channel: 'dine_in',
        },
        bubbles: false,
      }));
    }
  }

  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  private resetSlotContexts() {
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-context-reset', { bubbles: false }));
      f.el.dispatchEvent(new CustomEvent('erp:customer-context-reset', { bubbles: false }));
    }
  }

  /** sales#222 — asks the counter for the customer the sale cannot be closed without.
   *
   *  `sales` does NOT know `customers` (ADR-0043): it never opens anybody's picker and never
   *  touches its DOM. It fires `erp:customer-required` at whoever fills `sales.pos.assign` — the
   *  same shape as `erp:customer-context-reset`, which that filler already honours — and brings
   *  the slot into view. With nobody filling the slot there is no customer to choose here at all,
   *  and that is said naming the app, like a missing charge app (sales#185): a block with no fix
   *  on this screen has to name what would fix it. */
  private askForCustomer(): void {
    if (!this.assignFillers.length) {
      this.notifyShell(t('ui.customerRequiredNoApp', { app: this.appName('customers') }));
      return;
    }
    this.notifyShell(t('ui.customerRequiredCharge'));
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:customer-required', { bubbles: false }));
    }
    const host = this.renderRoot.querySelector('.cart-actions-slot') as HTMLElement | null;
    // Guarded: happy-dom has no scroller, and a picker that opened is worth more than a scroll.
    host?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  protected updated(_changed: Map<PropertyKey, unknown>) {
    this.ensureSlotsMounted();
    this.syncChargeState();
    // sales#164 — while the charge or the bill is on screen, the total is the server's.
    if (this.paying || this.prebillOpen) void this.refreshValuation();
    const categorySegment = this.renderRoot.querySelector<HTMLElement>('ion-segment.category-segment') ?? undefined;
    if (categorySegment !== this.categorySegment) {
      this.categorySegmentCleanup?.();
      this.categorySegment = categorySegment;
      this.categorySegmentCleanup = bindTabbar(categorySegment ?? null);
    }
    // Estado del carrito → fillers del footer (contrato `erp:pos-state`). Barato y sin bucles:
    // el filler solo guarda el detail (no re-renderiza al host).
    this.emitPosState();
    // Los <dialog> se abren MODALES (top layer): inmunes al transform del drawer del carrito
    // (gotcha conocido: un overlay fixed dentro de un ancestro con transform queda atrapado).
    // El atributo `open` del markup ya los muestra donde showModal no exista (happy-dom).
    for (const d of this.renderRoot.querySelectorAll<HTMLDialogElement>('dialog.park-dialog, dialog.dirty-dialog, dialog.staff-dialog')) {
      try {
        if (typeof d.showModal === 'function' && !d.matches(':modal')) { d.close(); d.showModal(); }
      } catch { /* sin soporte (happy-dom) o pseudo-clase desconocida: el atributo open basta */ }
    }
    if (this.parkPromptOpen) {
      const campo = this.renderRoot.querySelector<HTMLInputElement>('dialog.park-dialog input');
      // El default (la hora) va PRE-SELECCIONADO: teclear lo sobreescribe de un toque.
      if (campo && document.activeElement !== campo) { campo.focus(); campo.select(); }
    }
    // ADR-0141: YA NO se guarda el carrito aquí. Antes esto era un debounce de 400 ms que escribía
    // un blob JSON: si se iba la luz (o moría la tablet) dentro de esa ventana, el último artículo
    // se perdía. Ahora cada mutación (add/qty/invitación/quitar) escribe su FILA en el pedido de
    // forma transaccional e inmediata, así que aquí no queda nada pendiente que persistir.
    this.syncSheetViewport();
  }

  /** sales#422 — every sheet (discount, charge, open price, note, modifiers, combo) hangs from a
   *  `.scrim` over `.card`, and on a low phone the shell shows less than the card: the sheet was
   *  centred in the whole card and its button sat under the tab bar. While any scrim is on screen
   *  the till measures how much of the card the shell hides above and below and hands both over as
   *  the scrim's insets (`--pos-sheet-top/--pos-sheet-bottom`). Keyed on the scrim itself, so a
   *  new sheet is covered without a list to keep in step. */
  private syncSheetViewport(): void {
    const open = !!this.renderRoot.querySelector('.scrim');
    if (open && this.sheetViewportCleanup === undefined) {
      this.sheetViewportCleanup = followShellView(this, (shown) => {
        const card = this.renderRoot.querySelector('.card');
        if (!card) return;
        const box = card.getBoundingClientRect();
        this.style.setProperty('--pos-sheet-top', `${Math.max(0, Math.round(shown.top - box.top))}px`);
        this.style.setProperty('--pos-sheet-bottom', `${Math.max(0, Math.round(box.bottom - shown.bottom))}px`);
      }) ?? null;
    } else if (!open) {
      this.unwatchSheetViewport();
    }
  }

  private unwatchSheetViewport(): void {
    this.sheetViewportCleanup?.();
    this.sheetViewportCleanup = undefined;
  }


  // Dinero formateado con la MONEDA DEL HUB (ADR-0059): el SDK la resuelve de /api/hub/context
  // (misma fuente que dashboard/billing). Antes hardcodeaba '€' / la moneda por-módulo.
  // FIX QA (2026-06-25): el POS trabaja en CÉNTIMOS → formatMoney (divide /100), NO formatAmount
  // (que mostraba precios ×100).
  private money(n: number) { return erplora().formatMoney(Number(n) || 0); }
  /** The hub currency's symbol for a label (sales#380): the one `formatMoney` paints after the number. */
  private currencyLabel(): string {
    const c = erplora();
    return currencySymbol(c.currency, (c as unknown as I18nClient).locale || 'es');
  }
  /** Formas de pago que se ofrecen: activas (query) y permitidas por Ajustes (allow_*). */
  private get payMethods(): PayMethod[] {
    return enabledPayMethods(this.methods, {
      allow_cash: this.settings.allow_cash, allow_card: this.settings.allow_card,
      allow_transfer: this.settings.allow_transfer,
    });
  }

  /** Total PREVIEW con los descuentos (sales#71); la autoridad sigue siendo el servidor. */
  private get total() { return Math.max(0, cartTotal(this.cart, this.ticketDiscount) - this.ticketDiscountAmount); }
  /** Lo que la cuenta todavía DEBE: el total menos lo que un tender externo ya cubrió (sales#162).
   *  El botón del pie promete un importe, así que tiene que prometer el que se va a pedir — con un
   *  canje tomado, el sheet decía 9,00 € y el pie, detrás, seguía diciendo 27,00 €. El TOTAL del
   *  ticket sigue siendo 27,00 € y se pinta aparte: son dos números distintos y los dos son ciertos. */
  private get owed() {
    const lines = uncoveredLines(this.cart, new Set(this.covered.keys()));
    return Math.max(0, cartTotal(lines, this.ticketDiscount) - this.ticketDiscountAmount);
  }
  /** Lo que el descuento de ticket quita (porcentaje + importe), para pintarlo. */
  private get ticketDiscountTotal() { return cartTotal(this.cart, 0) - this.total; }
  private get discountsAllowed(): boolean { return this.settings.allow_discounts !== 0; }
  /** sales#222 — does this shop demand a customer on EVERY sale?
   *
   *  Read from the same row the server decides with (`sales.pos_settings.get`, sales#203) and with
   *  the same reading as the handler (`hub_setting(..., "require_customer", false)`): absent or 0
   *  is off, anything else is on. A freshly installed hub has no row, so it is off. */
  private get customerRequired(): boolean {
    const v = this.settings.require_customer;
    return v !== undefined && v !== null && v !== 0 && v !== false;
  }
  /** ...and is this checkout missing it? The server's rule is `customer_id`, never the typed name:
   *  the screen asks for exactly what `sales.complete_sale` refuses over. */
  private get missingRequiredCustomer(): boolean {
    return this.customerRequired && !this.customerId;
  }
  private get itemCount() { return this.cart.reduce((s, l) => s + l.qty, 0); }
  private get parkingEnabled() { return this.settings.enable_parked_tickets !== 0; }
  /** La capacidad Cocina existe solo si el registro de slots ha montado alguno de sus fillers. */
  private get hasKitchen() { return this.actionFillers.length > 0 || this.infoFillers.length > 0; }
  private get pendingCount() { return pendingLines(this.cart).length; }
  private get visibleOrderLabel() { return this.orderLabel || this.tableLabel; }

  /** Guarda el título en el pedido abierto. Antes de la primera línea queda preparado en memoria y
   *  `ensureOrder` lo usa al abrir el pedido, sin inventar otra entidad ni almacenamiento local. */
  private async saveOrderLabel(value: string): Promise<void> {
    const label = value.trim();
    this.orderLabel = label;
    if (!this.orderId) return;
    try {
      await erplora().command('sales.order.set_label', { order_id: this.orderId, label });
      this.parked = await listOpenChecks(erplora(), this.orderId);
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorSavingTitle');
    }
  }

  private focusOrderTitle(): void {
    const input = this.renderRoot.querySelector<HTMLInputElement>('.order-title');
    input?.focus();
    input?.select();
  }

  /** Presenta el aviso como overlay GLOBAL de Ionic. Declararlo en el template del WC lo deja
   *  dentro de su Shadow DOM y, al portalizarlo Ionic, puede aparecer como una superficie negra
   *  sin contenido. En body hereda correctamente el modo y los colores claro/oscuro del Hub. */
  private async showPendingSwitchAlert(count: number): Promise<void> {
    if (this.pendingSwitchAlert) return;
    const alert = document.createElement('ion-alert') as IonicAlertElement;
    alert.header = t('ui.pendingSwitchTitle');
    alert.message = t('ui.pendingBeforeSwitch', { count: String(count) });
    alert.buttons = [{ text: t('ui.close'), role: 'cancel' }];
    const cleanup = () => {
      if (this.pendingSwitchAlert === alert) this.pendingSwitchAlert = undefined;
      alert.remove();
    };
    // Ionic moves the teleported overlay back to body right AFTER emitting ionAlertDidDismiss:
    // a synchronous remove() is undone, so it goes on the next task (sales#406).
    alert.addEventListener('ionAlertDidDismiss', () => {
      if (this.pendingSwitchAlert === alert) this.pendingSwitchAlert = undefined;
      setTimeout(() => alert.remove(), 0);
    }, { once: true });
    document.body.appendChild(alert);
    this.pendingSwitchAlert = alert;
    try {
      if (typeof alert.present === 'function') await alert.present();
      else alert.isOpen = true; // happy-dom/test: conserva el contrato aun sin runtime de Ionic.
    } catch {
      cleanup();
    }
  }

  /** En un TPV con Cocina no se cambia de cuenta desde el almacén mientras haya una comanda sin
   *  enviar. Sin Cocina no aplica: retail/peluquería pueden aparcar y recuperar con normalidad. */
  private blockPendingAccountSwitch(): boolean {
    if (!this.hasKitchen || this.pendingCount === 0) return false;
    this.orderView = 'draft';
    this.parkedOpen = false;
    this.cartOpen = true;
    void this.showPendingSwitchAlert(this.pendingCount);
    return true;
  }
  /** La categoría PRIMARIA de un producto (la primera de `prodCats`); `undefined` sin clasificar. */
  private primaryCategory(productId: string): string | undefined {
    return this.prodCats.get(productId)?.values().next().value ?? undefined;
  }
  private catCount(id: string) {
    const c = this.categories.find((x) => x.id === id);
    return c?.product_count ?? this.products.filter((p) => this.prodCats.get(p.id)?.has(id)).length;
  }

  /** Un ratón convencional no tiene gesto horizontal: sobre el segmento, su rueda desplaza las
   *  categorías lateralmente. Trackpad y táctil conservan su scroll nativo. */
  private onCategoryWheel(e: WheelEvent): void {
    const seg = e.currentTarget as HTMLElement;
    if (seg.scrollWidth <= seg.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault();
    seg.scrollLeft += e.deltaY;
  }

  /** Aparcar (ADR-0146): la cuenta se queda ABIERTA y solo se suelta de la pantalla. Ya no se
   *  copia a otra entidad —el pedido ya es la cuenta— y por eso no se pierde nada por el camino.
   *  Si venía de una mesa, su dueño la suelta también: la mesa queda libre para otros. */
  private async park() {
    if (!this.cart.length) return;
    this.notifyPark();
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
    this.orderLabel = '';
    this.cart = [];
    this.tableId = undefined;
    this.tableLabel = '';
    this.parkedOpen = false;
    // appointments#154 — the booking belongs to the CHECK, not to the screen. Releasing the
    // check releases it too: otherwise the guard in `seedFromAppointment` would refuse to arm
    // the till the next time that same booking is charged (the blank check all over again),
    // and a leftover id would close somebody else's booking on the next ticket.
    this.appointmentId = undefined;
    // Ya no hay cuenta delante: la recién aparcada SÍ debe salir en la lista.
    this.parked = await listOpenChecks(erplora());
  }

  /** Punto de entrada del botón del desplegable. Con mesa es «DEJAR EN LA MESA» (la cuenta vive
   *  allí — modelo Toast/Lightspeed, decisión Ioan 2026-07-19): se suelta solo la PANTALLA y la
   *  mesa sigue ocupada con su cuenta. Sin mesa es APARCAR con nombre (default: la hora, patrón
   *  Loyverse), pre-seleccionado para sobreescribirlo de un toque. */
  private async requestPark(): Promise<void> {
    if (!this.cart.length) return;
    if (this.blockPendingAccountSwitch()) return;
    if (this.tableLabel.trim()) { await this.leaveOnTable(); return; }
    this.parkName = defaultParkLabel('', new Date());
    this.parkedOpen = false;
    this.parkPromptOpen = true;
  }

  /** «Dejar en la mesa»: etiqueta la cuenta con su mesa, suelta la PANTALLA y avisa a los
   *  fillers con `erp:order-detached` — que limpian su selección SIN tocar la sesión. La mesa
   *  sigue ocupada; la cuenta se recupera tocándola o desde la lista. JAMÁS aparca ni anula. */
  private async leaveOnTable(): Promise<void> {
    const id = this.orderId;
    const donde = this.tableLabel.trim();
    if (id && donde) await erplora().command('sales.order.set_label', { order_id: id, label: donde }).catch(() => undefined);
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
    this.orderLabel = '';
    this.cart = [];
    this.tableId = undefined;
    this.tableLabel = '';
    this.parkedOpen = false;
    this.appointmentId = undefined; // appointments#154 — see `park()`
    this.notifyOrderDetached();
    erplora().notify?.({ type: 'success', message: t('ui.leftAtTable', { label: donde }) });
    this.parked = await listOpenChecks(erplora());
  }

  /** Avisa a los fillers de que la cuenta se suelta DE PANTALLA: limpian su selección local y
   *  nada más (la sesión de mesa no se toca — soltarla es `erp:order-parked`, otra cosa). */
  private notifyOrderDetached(): void {
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-detached', { detail: {}, bubbles: false }));
    }
  }

  /** Aparca la cuenta actual CON nombre: persiste la etiqueta y luego suelta la pantalla.
   *  Aparcar JAMÁS anula (`sales.order.void` solo sale de una decisión explícita de eliminar) —
   *  el void que vivía aquí era la causa de «los tiquets aparcados desaparecen». */
  private async parkWith(label: string): Promise<void> {
    const id = this.orderId;
    const nombre = label.trim() || defaultParkLabel('', new Date());
    this.orderLabel = nombre;
    if (id) await erplora().command('sales.order.set_label', { order_id: id, label: nombre }).catch(() => undefined);
    await this.park();
    erplora().notify?.({ type: 'success', message: t('ui.parkedToast', { name: nombre }) });
  }

  /** ELIMINAR la cuenta actual (decisión explícita del diálogo de carrito sucio): anula el pedido
   *  y limpia la pantalla. El rastro queda (`voided`), no se borra nada. */
  private async discardCurrent(): Promise<void> {
    const id = this.orderId;
    if (id) await erplora().command('sales.order.void', { order_id: id }).catch(() => undefined);
    forgetCurrentCheck(localStorage);
    this.orderId = undefined;
    this.orderLabel = '';
    this.cart = [];
    this.appointmentId = undefined; // appointments#154 — see `park()`
    this.resetSlotContexts();
  }

  /** Abre el diálogo «¿aparcar o eliminar?» y espera la decisión. `allowCancel` solo al recuperar
   *  desde la lista (al tocar una mesa el filler ya cambió su selección: cancelar dejaría a los
   *  dos descoordinados, así que ahí solo hay aparcar/eliminar y cerrar equivale a aparcar). */
  private resolveDirtyCart(allowCancel: boolean): Promise<'park' | 'discard' | 'cancel'> {
    this.dirtyAllowCancel = allowCancel;
    this.dirtyOpen = true;
    return new Promise((res) => { this.dirtyResolve = res; });
  }

  private answerDirty(c: 'park' | 'discard' | 'cancel'): void {
    this.dirtyOpen = false;
    const res = this.dirtyResolve;
    this.dirtyResolve = undefined;
    res?.(c);
  }

  /** Eliminar una cuenta DE LA LISTA, en dos toques (armar → confirmar). Anula el pedido
   *  (`voided`, con rastro) — nunca de un roce: el primer toque solo cambia el icono. */
  private async deleteCheck(oc: OpenCheck): Promise<void> {
    if (this.armedDelete !== oc.id) {
      this.armedDelete = oc.id;
      if (this.armedTimer) clearTimeout(this.armedTimer);
      this.armedTimer = setTimeout(() => { this.armedDelete = undefined; }, 3000);
      return;
    }
    if (this.armedTimer) { clearTimeout(this.armedTimer); this.armedTimer = undefined; }
    this.armedDelete = undefined;
    await erplora().command('sales.order.void', { order_id: oc.id }).catch(() => undefined);
    this.parked = await listOpenChecks(erplora(), this.orderId);
  }

  /** Recuperar una cuenta abierta = CAMBIAR de cuenta, igual que tocar otra mesa. Qué pasa con lo
   *  de delante (decisión Ioan 2026-07-19): si tiene MESA, se queda EN SU MESA — ni se aparca ni
   *  se suelta la sesión, recuperable tocándola (patrón Toast/Lightspeed) — y se avisa con toast;
   *  sin mesa, se PREGUNTA: aparcar (con la hora de nombre) o eliminar. */
  private async retrieve(c: OpenCheck) {
    try {
      if (this.orderId !== c.id && this.blockPendingAccountSwitch()) return;
      if (this.cart.length && this.orderId !== c.id) {
        if (this.tableId) {
          // La cuenta de delante SE QUEDA EN SU MESA (los fillers sueltan solo la pantalla).
          await this.leaveOnTable();
        } else {
          this.parkedOpen = false;
          const eleccion = await this.resolveDirtyCart(true);
          if (eleccion === 'cancel') return;
          if (eleccion === 'discard') await this.discardCurrent();
          else await this.parkWith(defaultParkLabel('', new Date()));
        }
      }
      this.orderId = c.id;
      this.orderLabel = c.label ?? '';
      this.ticketDiscount = c.discount ?? 0; // sales#71
      this.ticketDiscountAmount = c.discount_amount ?? 0; // sales#113
      this.ticketDiscountApproved = c.discountApproved ?? false; // sales#386
      await this.adoptCheckAppointment(c.appointmentId); // sales#280
      rememberCurrentCheck(localStorage, c.id);
      this.cart = await loadOrderLines(erplora(), c.id);
      this.notifyOrderRestored();
      this.parkedOpen = false;
      this.parked = await listOpenChecks(erplora(), c.id);
    } catch (e) {
      this.error = e instanceof Error ? e.message : t('ui.errorRetrieve');
    }
  }

  /** Avisa a los dueños de que la cuenta se aparca, para que suelten lo suyo (la mesa). */
  private notifyPark(): void {
    if (!this.orderId) return;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-parked', { detail: { order_id: this.orderId }, bubbles: false }));
    }
  }

  /** Avisa a los dueños de que se ha reabierto una cuenta, para que recuperen su contexto. */
  private notifyOrderRestored(): void {
    if (!this.orderId) return;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-restored', { detail: { order_id: this.orderId }, bubbles: false }));
    }
  }

  /** Reanuda LA CUENTA QUE TENÍA ESTE TERMINAL tras recargar (ADR-0141/0146).
   *
   *  Antes se cogía «el primer pedido abierto»: con varias cuentas abiertas eso es aterrizar en la
   *  de otro camarero. La cuenta en curso es estado del DISPOSITIVO, así que se recuerda ahí; si ya
   *  se cobró, se empieza en blanco y el camarero elige — no se cae a otra cualquiera. */
  private async restoreOpenOrder(): Promise<CartLine[]> {
    try {
      const cuentas = await listOpenChecks(erplora());
      const id = resolveCurrentCheck(localStorage, cuentas.map((c) => c.id));
      if (!id) return [];
      this.orderId = id;
      this.orderLabel = cuentas.find((c) => c.id === id)?.label ?? '';
      this.ticketDiscount = cuentas.find((c) => c.id === id)?.discount ?? 0; // sales#71
      this.ticketDiscountAmount = cuentas.find((c) => c.id === id)?.discount_amount ?? 0; // sales#113
      this.ticketDiscountApproved = cuentas.find((c) => c.id === id)?.discountApproved ?? false; // sales#386
      // sales#280: y la cita con la que se armó, si vino de la agenda. Va antes del deep link del
      // arranque a propósito — si la navegación trae una cita nueva, esa es la que manda.
      await this.adoptCheckAppointment(cuentas.find((c) => c.id === id)?.appointmentId);
      // El pedido vuelve, pero su MESA y su CLIENTE los saben sus dueños, no `sales`. Se les avisa
      // para que restauren lo suyo (y el de mesas nos devuelva el contexto por `erp:order-context`).
      // Sin esto, al recargar el TPV la comanda aparecía "sin mesa" aunque la mesa siguiera ocupada.
      for (const f of this.assignFillers) {
        f.el.dispatchEvent(new CustomEvent('erp:order-restored', { detail: { order_id: id }, bubbles: false }));
      }
      return await loadOrderLines(erplora(), id);
    } catch {
      return [];
    }
  }

  /** Avisa a los fillers de que hay pedido abierto para que ENLACEN lo suyo (mesa, cliente…).
   *  `sales` no escribe junctions ajenas ni conoce a esos módulos: solo publica el `order_id`.
   *
   *  Viaja también la CUENTA a la que engancharlo cuando se sabe (`pendingSplitSession`, sales#61).
   *  Una mesa dividida tiene varias cuentas vivas: sin ese id el dueño de la junction resuelve a la
   *  más antigua y el segundo pedido aterriza en la primera cuenta — las dos mitades acabarían
   *  cobrando la misma comanda. El id es OPACO para `sales`: se recibió en el evento y se reenvía. */
  private notifyOrderLinked(): void {
    if (!this.orderId) return;
    const session = this.pendingSplitSession;
    for (const f of this.assignFillers) {
      f.el.dispatchEvent(new CustomEvent('erp:order-linked', {
        detail: session ? { order_id: this.orderId, session_id: session } : { order_id: this.orderId },
        bubbles: false,
      }));
    }
    // De un solo uso: la cuenta ya tiene su pedido, y lo siguiente que se abra no es suyo.
    this.pendingSplitSession = undefined;
  }

  /** Asegura que existe un pedido abierto que respalde el carrito; devuelve su id ('' si falla).
   *  Si hay una MESA seleccionada, avisa a los fillers (`tables`) para que escriban la junction
   *  mesa↔pedido — `sales` no toca `tables`: es un contrato por evento (ADR-0043/0141). */
  /** Manda a cocina lo pedido hasta ahora (ADR-0141). La comanda nace del PEDIDO, no del cobro: el
   *  camarero dispara al tomar nota y el pedido sigue abierto hasta que el cliente pague. Cada
   *  disparo es una RONDA (bebidas primero, comida después), y `kitchen` las numera.
   *
   *  La etiqueta que verá el cocinero es la de la mesa asignada, y viaja OPACA: `sales` no depende
   *  de `tables`, solo reenvía el texto que el slot de mesas le dejó en `tableLabel`. */
  /** sales#80 — un disparo en vuelo. El filler de kitchen puede emitir dos `erp:order-fire` con un
   *  doble toque; el segundo llega antes de que el primero haya releído las líneas y vería las
   *  mismas pendientes. Mientras haya uno en vuelo, los demás se ignoran (defensa en la UI); el
   *  handler además rechaza `sales.nothing_to_fire` si el pedido ya no tiene nada pendiente. */
  private firing = false;

  private async fireToKitchen(priority?: string): Promise<void> {
    if (!this.cart.length || this.firing) return;
    this.firing = true;
    try {
      await this.fireToKitchenNow(priority);
    } finally {
      this.firing = false;
    }
  }

  private async fireToKitchenNow(priority?: string): Promise<void> {
    const orderId = await this.ensureOrder(this.cart[0]);
    // TANDAS (decisión Ioan 2026-07-19): se dispara SOLO lo pendiente, con su ronda local, y el
    // handler lo marca (`fired_at`). Antes cada fire reenviaba el carrito ENTERO: dos disparos =
    // comida duplicada en cocina. Vale para todo el TPV, con o sin modo restaurante — el modo
    // solo cambia lo que se VE (pestaña Tandas), no lo que se envía.
    const pendientes = pendingLines(this.cart);
    const payload = buildFirePayload(
      orderId, this.tableLabel, pendientes, nextRoundNo(this.cart), this.waiterId, priority,
    );
    if (!payload) return;
    try {
      await erplora().command('sales.order.fire', payload as unknown as Record<string, unknown>);
      // Éxito → canal de AVISO del shell (toast verde). El hueco rojo es SOLO para fallos: decía
      // que algo había ido bien con la pinta de algo que había ido mal.
      erplora().notify?.({ type: 'success', message: t('ui.firedToKitchen') });
      // Las líneas recién marcadas (round_no/fired_at) se releen de la BD: es lo que bloquea su
      // edición y lo que pinta la ronda como «enviada» en la pestaña Tandas.
      if (this.orderId) this.cart = await loadOrderLines(erplora(), this.orderId);
    } catch (e) {
      // sales#80: «no había nada pendiente» significa que la tanda YA se envió (doble toque que
      // se coló, u otra caja): no es un fallo para el cajero — se relee el pedido y ya.
      //
      // sales#201: se decide por el CÓDIGO del sobre, nunca buscándolo dentro de la frase. Eso
      // último solo funcionaba mientras el handler formateaba el rechazo como «<code>: <detalle>»;
      // ahora el rechazo viaja por `Output.error` y el mensaje es el detalle solo.
      if (errorCode(e) === 'sales.nothing_to_fire') {
        if (this.orderId) this.cart = await loadOrderLines(erplora(), this.orderId).catch(() => this.cart);
        return;
      }
      // Sin `kitchen` instalado el evento no lo escucha nadie: el comando de `sales` igual pasa.
      // Un fallo aquí NO debe bloquear la venta — la comanda se puede repetir.
      this.error = t('ui.fireFailed');
    }
  }

  /** Abre el pedido, opcionalmente ya con su primera línea.
   *
   *  🔴 sales#63 — `first: null` NO es un detalle: `sales.order.open` va con `sales.add_sale`, que
   *  tiene todo cajero. Si la línea de PRECIO LIBRE viajara dentro del payload que abre la cuenta,
   *  el importe entraría por una puerta que no pide el permiso y el control no ocurriría nunca.
   *  Por eso ese camino abre la cuenta VACÍA y añade su línea por el comando gateado. */
  private async ensureOrder(first: CartLine | null): Promise<string> {
    if (this.orderId) return this.orderId;
    // Si el usuario escribió un título antes de añadir la primera línea, nace ya etiquetado;
    // si no, la mesa sigue siendo el fallback legible del pedido.
    this.orderId = await openOrderWithLines(erplora(), first ? [first] : [], this.visibleOrderLabel);
    rememberCurrentCheck(localStorage, this.orderId);
    // Aviso a TODOS los fillers: cada uno enlaza lo suyo si tiene algo seleccionado (la mesa en
    // `tables`, el cliente en `customers`). `sales` no sabe qué enlazan ni le importa.
    this.notifyOrderLinked();
    return this.orderId;
  }

  /** Empuja una línea NUEVA al carrito (sin fusionar), persistiéndola YA: abre el pedido con ella si
   *  no hay ninguno, o la añade al abierto. La fila queda escrita ANTES de que la UI siga (un corte de
   *  corriente ya no se lleva el artículo). Compartido por `addNow` (producto de catálogo) y la venta
   *  por PRECIO LIBRE, que nunca fusiona: todas sus líneas llevan `id: ''`. */
  /** Empuja una línea de PRECIO LIBRE, siempre por su puerta (sales#63).
   *
   *  Dos reglas, y ninguna es cosmética: la cuenta se abre **vacía** si aún no existe (meter el
   *  importe en `sales.order.open` lo colaría por `sales.add_sale`), y la línea entra por
   *  `sales.order.add_open_line`, que pide `sales.sell_open_price`. Al cajero sin ese permiso el
   *  runtime le contesta `requires_elevation` y el shell levanta el PIN del encargado — no es un
   *  callejón sin salida, es la autorización en el momento sin cerrar su sesión (ADR-0238). */
  private async pushOpenPriceLine(line: CartLine): Promise<void> {
    const orderId = await this.ensureOrder(null);
    line.line_id = await addOpenPriceLine(erplora(), orderId, line);
    this.cart = [...this.cart, line];
  }

  private async pushNewLine(line: CartLine): Promise<void> {
    if (!this.orderId) {
      await this.ensureOrder(line);
      const persisted = this.orderId ? await loadOrderLines(erplora(), this.orderId) : [];
      this.cart = persisted.length ? persisted.map((pl) => ({ ...line, ...pl })) : [...this.cart, line];
      return;
    }
    line.line_id = await addOrderLine(erplora(), this.orderId, line);
    this.cart = [...this.cart, line];
  }

  /** Una sola vía para el trabajo del carrito. Sin esto, cinco toques seguidos abrían cinco
   *  pedidos: cada uno veía «aún no hay pedido» porque el anterior seguía en vuelo (ADR-0144). */
  private readonly queue = createSerialQueue();

  /** Lee `?appointment_id=` de la URL, siembra la cita y BORRA el parámetro.
   *
   *  El shell no pasa props ni la ruta a los Web Components, así que el deep link es el único canal
   *  que tiene la agenda para decir «cobra esta cita». Se limpia con `replaceState` para que la
   *  orden no quede pegada a la barra de direcciones. */
  private async consumeAppointmentDeepLink(services: Product[]): Promise<void> {
    let id: string | null = null;
    try {
      id = new URLSearchParams(window.location.search).get('appointment_id');
    } catch { return; }
    if (!id) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('appointment_id');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* sin History API no pasa nada: la siembra es lo que importa */ }
    await this.seedFromAppointment(id, services);
  }

  /** Siembra el carrito con el servicio de una CITA (ADR-0077, seam cerrado en sales#89).
   *
   *  `sales` no sabe qué es una cita: lee UNA query pública y se queda con dos ids OPACOS
   *  (`appointment_id`, `staff_id`) que reenvía al cobrar. No hay `depends_on`, ni JOIN, ni
   *  conocimiento del dominio de citas — un hub sin el módulo abre el TPV vacío y en paz.
   *
   *  La cita guarda `service_price` pero NO la categoría fiscal, así que el IVA quedaría colgando.
   *  Se resuelve contra el catálogo de servicios que el TPV ya carga para el walk-in: una sola
   *  fuente de verdad fiscal para las dos puertas. */
  private async seedFromAppointment(appointmentId: string, services: Product[]): Promise<void> {
    // Served ONCE per open check. Now that the link is read on every navigation, tapping «Cobrar»
    // twice on the same booking would otherwise put the haircut on the ticket twice. The id is
    // cleared when the sale completes, so the next check starts fresh.
    if (this.appointmentId && this.appointmentId === appointmentId) return;
    // sales#316 — the agenda's SQL binds `:appointment_id`. The runtime drops a param the query does
    // not name, so `{ id }` answered `[]` without an error and «Cobrar» opened an empty ticket.
    const rowsIn = await optionalRead((c) => c.queryOptional<unknown>('appointments.appointments.get', { appointment_id: appointmentId }));
    if (rowsIn === undefined) return; // módulo ausente: TPV vacío, sin ruido
    const ap = rows<AppointmentRow>(rowsIn)[0];
    if (!ap) return;

    // El catálogo manda en lo fiscal; la cita, en el precio pactado con el cliente.
    const svc = services.find((s) => s.id === ap.service_id);
    const price = Number(ap.service_price) || Number(svc?.price) || 0;
    const name = ap.service_name || svc?.name || '';
    if (!name) return;

    this.appointmentId = ap.id || appointmentId;
    this.staffId = ap.staff_id || undefined;
    // sales#277: an appointment's professional is a `staff_member`, not a person of the hub, so
    // `hub.users.list` will never name them. The appointment did, and the cart line will need it.
    this.rememberStaffName(ap.staff_id, ap.staff_name);
    // sales#179: the appointment DOES carry the professional's name
    // (`appointments.appointment_get`); without it the chip could only say "the assigned
    // professional" about a check that knows perfectly well who it is.
    this.staffName = ap.staff_name || '';
    if (ap.customer_id) this.customerId = ap.customer_id;
    if (ap.customer_name) this.customerName = ap.customer_name;

    const tax_category_key = svc?.tax_category_key;
    await this.queue(() => this.addNow({
      id: svc?.id ?? '', name, price, tax_category_key,
      is_service: true, pricing_type: 'fixed', is_active: 1,
    }));
    // sales#280 — y el enlace se queda en la CUENTA. `addNow` acaba de abrir el pedido (o de
    // añadir la línea al que ya había), así que aquí ya hay `orderId` al que atarlo.
    await this.linkCheckToAppointment();
  }

  /** sales#280 — escribe en la cuenta ABIERTA la cita que la armó.
   *
   *  Sin esto el enlace vivía SOLO en memoria de la pantalla, y el shell del hub reconstruye esa
   *  pantalla en cuanto la ruta cambia (`ModuleView.vue`: `outlet.replaceChildren()` + un
   *  `createElement` nuevo) — que es justo lo que hace «Cobrar» al añadir `?appointment_id=`. La
   *  copia nueva recuperaba la cuenta del servidor pero no la cita, cobraba sin ella, y sin
   *  `appointment_id` no se emite `sales.sale.created_from_appointment`: la agenda se quedaba con
   *  el corte cobrado y la cita en pendiente. */
  private async linkCheckToAppointment(): Promise<void> {
    if (!this.orderId || !this.appointmentId) return;
    try {
      await erplora().command('sales.order.set_appointment', {
        order_id: this.orderId, appointment_id: this.appointmentId,
      });
    } catch {
      // La venta NO se rompe por esto: el id sigue en memoria y este mismo cobro cerrará la cita.
      // Lo que se pierde es que sobreviva a un remontaje o a un F5, y eso sí se dice — callarlo es
      // cómo se cobra una cita que la agenda seguirá enseñando como pendiente.
      this.notifyShell(t('ui.appointmentLinkFailed'));
    }
  }

  /** sales#280 — la cita de una cuenta RECUPERADA, de vuelta en la pantalla.
   *
   *  Persistido está solo el id (opaco, ADR-0077); quién es la clienta y quién la atiende se
   *  releen de la propia cita, por la misma query pública que armó la cuenta. El carrito NO se
   *  toca: el servicio ya es una línea de este pedido, y volver a sembrarlo lo cobraría dos veces.
   *
   *  La cuenta MANDA: sin cita, la pantalla se queda sin cita — así cambiar de cuenta no arrastra
   *  la cita de la anterior al ticket de otra clienta. */
  private async adoptCheckAppointment(appointmentId?: string): Promise<void> {
    this.appointmentId = appointmentId;
    if (!appointmentId) return;
    const rowsIn = await optionalRead((c) => c.queryOptional<unknown>('appointments.appointments.get', { appointment_id: appointmentId }));
    if (rowsIn === undefined) return; // sin el módulo: el id viaja igual y no hay nada que repintar
    const ap = rows<AppointmentRow>(rowsIn)[0];
    if (!ap) return;
    if (ap.staff_id) this.staffId = ap.staff_id;
    this.rememberStaffName(ap.staff_id, ap.staff_name);
    if (ap.staff_name) this.staffName = ap.staff_name;
    if (ap.customer_id) this.customerId = ap.customer_id;
    if (ap.customer_name) this.customerName = ap.customer_name;
  }

  /** sales#179 — **who is serving this check**, and how it is transferred.
   *
   *  This screen does not decide the DEFAULT: `complete_sale` attributes the sale to the session
   *  user when the payload names nobody. The till does not know who is signed in (the SDK does not
   *  expose it) and **must not guess**: sending an id made up in the browser would attribute sales
   *  to whoever the caller pleased. What does belong to this screen is the other half of what
   *  Toast, Square for Restaurants and Lightspeed do: the waiter is pinned to the check and can be
   *  TRANSFERRED — whoever takes the table is not always the one at the terminal.
   *
   *  Two lists feed it (sales#318). `hub.users.list`, the core's RESERVED namespace (ADR-0192):
   *  the people who SIGN IN. And the `staff` app's team, read as an OPTIONAL capability (ADR-0127):
   *  the professionals the agenda books, most of whom never sign in — without them a salon could
   *  only ever charge a walk-in to the owner. A bar with no `staff` app keeps the till it had.
   *  Both are asked for when the picker OPENS, not at boot: the till already makes plenty of calls
   *  there, and these are only needed if somebody is about to change who serves. */
  private async openStaffPicker(lineId?: string): Promise<void> {
    this.staffPickerLine = lineId;
    this.staffPickerOpen = true;
    await this.ensureStaffOptions();
  }

  /** The people and the team, asked for ONCE. Idempotent on purpose: it is called from two places —
   *  the picker opening and a cart that needs to NAME the professional of a line (sales#277) — and
   *  a till that re-asked on every render would hammer the core all day. A read that FAILED is
   *  asked again next time; the one that answered is not re-read on its own. */
  private async ensureStaffOptions(): Promise<void> {
    if (this.staffPickerState === 'loading') return;
    if (this.staffPickerState === 'ready' && !this.teamFailed) return;
    this.staffPickerState = 'loading';
    const [people, team] = await Promise.all([
      erplora().query<unknown>('hub.users.list')
        .then((r) => rows<HubUser>(r).filter((u) => !!u.id))
        // A failure here must NOT take the checkout down: it is said out loud and charging carries
        // on with the server's default, which is exactly what there was before anyone could choose.
        .catch(() => undefined),
      optionalCatalogRead<TeamMember>(
        (c) => c.queryAllOptional<unknown>('staff.members.list'),
        (c) => c.queryOptional<unknown>('staff.members.list', { limit: LEGACY_PAGE_LIMIT })),
    ]);
    // Somebody who left cannot serve: they still exist (the audit trail points at their id) but
    // they are not an option to offer today. Their NAME is kept all the same — sales#277:
    // yesterday's line still points at them, and painting an opaque id is the bug, not the fix.
    (people ?? []).forEach((u) => this.rememberStaffName(u.id, u.name));
    team.rows.forEach((m) => this.rememberStaffName(m.id, teamMemberName(m)));
    this.staffOptions = composeStaffOptions((people ?? []).filter((u) => u.is_active !== false), team.rows);
    this.teamFailed = team.broken;
    this.staffPickerState = people ? 'ready' : 'error';
  }

  /** Learns a name for an opaque id, wherever it came from (the team, the picker, the originating
   *  appointment). A new Map because Lit compares by reference: mutating it would paint nothing. */
  private rememberStaffName(id?: string, name?: string): void {
    if (!id || !name || this.staffNames.get(id) === name) return;
    this.staffNames = new Map(this.staffNames).set(id, name);
  }

  /** Choose who is serving. With no argument = **the session user**: the explicit attribution is
   *  cleared and the server decides again.
   *
   *  With a LINE open (sales#277) the very same choice moves that one row instead, and the chip is
   *  left alone: correcting the line the receptionist is looking at must not silently re-aim the
   *  next tap at somebody else. */
  private pickStaff(person?: StaffOption): void {
    this.rememberStaffName(person?.id, person?.name);
    const lineId = this.staffPickerLine;
    this.staffPickerOpen = false;
    this.staffPickerLine = undefined;
    if (lineId) { void this.moveLineStaff(lineId, person?.id); return; }
    this.staffId = person?.id;
    this.staffName = person?.name ?? '';
  }

  /** Charges an EXISTING line to somebody else, keeping the line (sales#277).
   *
   *  Optimistic like the note (`applyLineNote`): the row on screen answers the tap at once and the
   *  order row is written behind it. A failure is not swallowed — with it the screen and the
   *  server would disagree about who earned the money, and the close would be wrong with nothing
   *  said — so the line is put BACK and the reason is painted. */
  private async moveLineStaff(lineId: string, staffId?: string): Promise<void> {
    const line = this.cart.find((l) => l.line_id === lineId);
    if (!line || (line.staff_id ?? undefined) === staffId) return;
    const before = line.staff_id;
    const aim = (l: CartLine, to?: string) => (l.line_id === lineId ? { ...l, staff_id: to } : l);
    this.cart = this.cart.map((l) => aim(l, staffId));
    if (!this.orderId) return;
    try {
      await updateOrderLineStaff(erplora(), this.orderId, line, staffId ?? null);
    } catch (e) {
      this.cart = this.cart.map((l) => aim(l, before));
      this.error = domainErrorText(CATALOG, erplora().locale, e) || t('ui.lineStaffFailed');
    }
  }

  /** Who the line under the picker is charged to right now — so the dialog ticks the option that
   *  is already true instead of the check's. */
  private get pickerLineStaffId(): string | undefined {
    return this.cart.find((l) => l.line_id === this.staffPickerLine)?.staff_id;
  }

  /** Is `id` — what a check or a line is charged to — this row of the picker? Either of the
   *  person's two ids ticks it (sales#318): a line rung under her hub user and one booked to her
   *  record are the same professional. */
  private servesAs(option: StaffOption, id?: string): boolean {
    return !!id && (id === option.id || id === option.userId);
  }

  /** Who the KITCHEN is told is serving the check (sales#318). The sale and its lines go to the
   *  professional's team record; the ticket goes to the hub user behind it whenever there is one,
   *  because the pass names `waiter_id` through `hub.users.list` (kitchen#63) and a team record is
   *  not in it — her name would go blank on every ticket. A record nobody signs in with has no
   *  other id to send. */
  private get waiterId(): string | undefined {
    return this.staffOptions.find((o) => o.id === this.staffId)?.userId ?? this.staffId;
  }

  /** What a cart row says about its professional, or '' when it says nothing.
   *
   *  An id with no name resolves to the same wording the chip uses when it only knows the id: it
   *  is honest about naming nobody, and it still tells two otherwise identical rows apart, because
   *  the row with no attribution at all paints no sub-line. */
  private lineStaffLabel(l: CartLine): string {
    if (!l.staff_id) return '';
    return this.staffNames.get(l.staff_id) || t('ui.staffAssigned');
  }

  /** What the chip reads. With an originating appointment the id is known but the name may not be
   *  (it is a `staff_member`, not a person of the hub): it says "the assigned professional" instead
   *  of showing a UUID or lying with "me". */
  private get staffLabel(): string {
    const name = this.staffName || (this.staffId ? t('ui.staffAssigned') : t('ui.staffMe'));
    return t('ui.servedBy', { name });
  }

  /** The till's own policy row (sales#25, widened by sales#203): which catalogue sources feed the
   *  grid, which payment methods are offered, whether discounts and parked tickets exist, whether
   *  prices carry VAT inside, how the checkout opens and what the receipt says.
   *
   *  Read through `sales.pos_settings.get` and NOT `sales.settings.get`: that one requires
   *  `sales.manage_settings`, which neither `cashier` nor `employee` has, so through it the till
   *  is blind to its own configuration for the two roles that use it all day.
   *
   *  A FAILURE falls back to the defaults — a till that opens with an empty grid because a
   *  settings read hiccuped is worse than one that shows everything — but it is not swallowed:
   *  the shell is told, because a policy nobody could read means the switches on the settings
   *  screen are not being honoured right now.
   *
   *  sales#223 — absence and failure both come out of `withPosSettingsDefaults`, which is the ONE
   *  place the UI declares what the till is out of the box. No reader below sees `undefined` again:
   *  they used to, and `undefined !== 0` turned every switch that ships OFF into an ON. */
  /** sales#409 — are there sellable services this till is hiding on purpose?
   *
   *  Asked only while `sync_services` is OFF, through the optional door (ADR-0127): a hub without
   *  `services` answers `undefined` and hides nothing. A failed read claims nothing either — the
   *  notice is advice, and an advice built on a read that did not answer would be a guess. */
  private async probeHiddenServices(policy: Promise<PosSettings>): Promise<boolean> {
    if (catalogSourceOn((await policy).sync_services)) return false;
    const status = await optionalRead((c) => c.queryOptional('services.catalog.status'));
    return Number(rows<{ sellable_services?: unknown }>(status)[0]?.sellable_services) > 0;
  }

  private async loadPosSettings(): Promise<PosSettings> {
    try {
      return withPosSettingsDefaults(rows<Record<string, unknown>>(await erplora().query('sales.pos_settings.get'))[0]);
    } catch {
      this.notifyShell(t('ui.posSettingsUnavailable'));
      return withPosSettingsDefaults(undefined);
    }
  }

  /** El catálogo VENDIBLE de `services`, mapeado a la forma de la rejilla (sales#89).
   *
   *  Un servicio se cobra por la MISMA puerta que un producto —misma tarjeta, mismo carrito, mismo
   *  cobro— para que no pueda divergir del camino fiscal. Lo único que lo distingue es
   *  `is_service`, que hace que el handler no lo mida contra el catálogo de `inventory` ni le
   *  descuente stock. `services` es la autoridad del precio y de la categoría fiscal. */
  private async loadServices(read: CatalogReader): Promise<Product[]> {
    // sales#186: the WHOLE catalogue, no cap. Neither earlier shape brought it — `page_size` is not
    // a runtime parameter (the engine reads `limit`) and was dropped in silence; the `limit: 500`
    // that replaced it at least told the truth, but it was still an arbitrary ceiling: a business
    // with more than 500 services could not sell them, which is the bug hub#650 fixed for products.
    // `queryAllOptional` closes both halves: the whole set (two round trips at most) and `undefined`
    // when `services` is not installed, which is what ADR-0127 demands because `services` is NOT in
    // the `depends_on` of `sales`.
    //
    // sales#273: read through the CLASSIFIER, not `optionalReadAll`. Absence still answers `[]` and
    // says nothing — that is ADR-0127 and it is the common case. A FAILURE now raises the incident
    // instead of impersonating absence, because a salon whose catalogue broke was getting the till
    // of a shop that never sold services, with no way to tell them apart.
    const svcRows = await read<ServiceRow>('services',
      (c) => c.queryAllOptional<unknown>('services.services.list'),
      (c) => c.queryOptional<unknown>('services.services.list', { limit: LEGACY_PAGE_LIMIT }));
    return svcRows.map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price) || 0,
      // sales#99: without this the service never enters `prodCats` and its tab counts 0.
      category_id: s.category_id,
      tax_category_key: s.tax_category_key,
      pricing_type: s.pricing_type ?? 'fixed',
      is_service: true,
      is_active: 1,
    }));
  }

  /** Las categorías de servicio salen como una pestaña más: 40 servicios en un muro plano no son
   *  usables en una peluquería con cliente delante. */
  private async loadServiceCategories(read: CatalogReader): Promise<Category[]> {
    // sales#186: the whole set, same as the catalogue. This read did not even carry a cap, so it
    // stopped at the first page —50— and a salon with more families lost the ones at the bottom
    // without a single warning.
    // sales#273 — classified like the catalogue above: this read failing on its own is exactly the
    // shape the salon saw, family tabs standing at 0 over a grid with no service in it.
    const catRows = await read<ServiceCat>('services',
      (c) => c.queryAllOptional<unknown>('services.categories.list', { sort: 'name', dir: 'asc' }),
      (c) => c.queryOptional<unknown>('services.categories.list', { sort: 'name', dir: 'asc', limit: LEGACY_PAGE_LIMIT }));
    return catRows.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name }));
  }

  /** Motivo por el que este producto NO se puede cobrar, ya traducido; `undefined` si se puede
   *  (o si no hay catálogo fiscal con el que juzgarlo: eso es un incidente de `taxes`, no del
   *  producto, y cobrar es lo último que puede romperse). sales#74, ampliado en sales#89. */
  /** Best-effort: the shell toast goes ON TOP of our own notice, never instead of it. A shell with
   *  no notifier wired (or an older one) would leave the cashier with no explanation at all. */
  private notifyShell(message: string) {
    const c = erplora() as Partial<{ notify(n: { type: string; message: string }): void }>;
    try { c.notify?.({ type: 'warning', message }); } catch { /* el aviso propio ya está pintado */ }
  }

  private blockedReason(p: Product): string | undefined {
    // services#12: un servicio de precio NO cerrado ya no se bloquea — se PREGUNTA (ver `add`).
    // Cobrar «desde 65 €» como si fuera el precio sigue estando mal; la diferencia es que ahora
    // el TPV sabe pedir la cifra.
    switch (productSellability(this.taxCatalog, p.tax_category_key)) {
      case 'no_tax_category': return t('ui.notSellableNoTaxCategory');
      case 'no_tax_rule': return t('ui.notSellableNoTaxRule');
      default: return undefined;
    }
  }

  /** ¿Este servicio deja el precio SIN decidir? (services#12)
   *
   *  El mercado tiene dos estados, no cinco: un artículo lleva precio o es variable, y el variable
   *  «just asks the cashier how much» (Square; Vagaro lo cambia en el cobro). El «desde X» no es un
   *  motor de precios, es una etiqueta del catálogo — en Square ni siquiera existe. Así que
   *  `from`/`hourly`/`variable` caen todos en la misma pregunta, y `fixed`/`free` son precio final
   *  (gratis es una cifra decidida: preguntar sería preguntar algo que ya tiene respuesta). */
  private needsAmount(p: Product): boolean {
    return !!p.is_service && !CLOSED_PRICING.has(p.pricing_type ?? 'fixed');
  }

  private add(p: Product): Promise<void> {
    // sales#58 - a blocked tile DOES take the tap, and this is the only place that answers it.
    // Staying silent here is what turned "VAT is not configured yet" into "the POS is broken":
    // with no line, no error and no log, a cashier has no way to tell those two apart.
    const blocked = this.blockedReason(p);
    if (blocked) {
      this.blockedNotice = blocked;
      this.notifyShell(blocked);
      return Promise.resolve();
    }
    // Whatever does go in closes the incident: the notice is about the last tap, not a banner.
    this.blockedNotice = '';
    // services#12: si el servicio no trae precio final, esto no añade nada — abre la pregunta con
    // el importe listado como SUGERENCIA y su categoría fiscal ya elegida. Lo que el cajero
    // confirme entra por la puerta gateada (sales#63), que es donde vive el permiso.
    if (this.needsAmount(p)) {
      this.openOpenPrice({ amountCents: Number(p.price) || 0, deptKey: p.tax_category_key, name: p.name });
      return Promise.resolve();
    }
    return this.queue(() => this.addWithModifiers(p));
  }

  /** pm#93 — si lo que se añade tiene grupos de suplementos, se PREGUNTA antes; si no, se añade
   *  igual que siempre.
   *
   *  La lectura es OPCIONAL (ADR-0127): `undefined` = el módulo `modifiers` no está instalado, y el
   *  TPV sigue cobrando sin enterarse. Ese es el 99 % de las pulsaciones de un TPV, y meterles un
   *  paso sería empeorar el producto para casi todo el mundo. */
  private async addWithModifiers(p: Product) {
    const rows = await optionalRead((c) =>
      c.queryOptional<unknown>('modifiers.for_target', {
        target_kind: p.is_service ? 'service' : 'product',
        target_ref: p.id,
        category_ref: this.primaryCategory(p.id) ?? null,
      }),
    );
    const groups = groupModifierRows(Array.isArray(rows) ? rows : []);
    if (!groups.length) return this.addNow(p);
    this.modifierPicks = [];
    this.modifierSheet = { product: p, groups };
  }

  /** ¿Se puede confirmar la hoja? Un grupo con `min >= 1` sin resolver NO deja seguir: es una
   *  PRECONDICIÓN, no un aviso — Toast bloquea el envío a cocina por lo mismo. El techo `max` se
   *  respeta igual (0 = sin techo). */
  canConfirmModifiers(): boolean {
    const sheet = this.modifierSheet;
    if (!sheet) return false;
    return sheet.groups.every((g) => {
      const n = g.options.filter((o) => this.modifierPicks.includes(o.id)).length;
      return n >= g.min && (g.max === 0 || n <= g.max);
    });
  }

  /** Confirma la hoja y añade la línea con sus suplementos, en el ORDEN elegido.
   *
   *  🔴 Solo viaja el `option_id`: el importe que se COBRA lo resuelve el servidor contra
   *  `modifiers.options.all` (sales#68). El `price_delta` se queda EN LA PANTALLA (sales#208) —
   *  es el que la hoja acaba de enseñar y el que hace que la línea del carrito valga lo que se va
   *  a cobrar en vez del precio pelado del producto. */
  async confirmModifiers(): Promise<void> {
    const sheet = this.modifierSheet;
    if (!sheet || !this.canConfirmModifiers()) return;
    const options = new Map(sheet.groups.flatMap((g) => g.options).map((o) => [o.id, o]));
    const picks = this.modifierPicks.map((option_id) => ({
      option_id,
      ...(options.get(option_id)?.price_delta ? { price_delta: options.get(option_id)!.price_delta } : {}),
    }));
    this.modifierSheet = undefined;
    this.modifierPicks = [];
    await this.addNow(sheet.product, picks);
  }

  // ══ sales#153 · EL PICKER DEL MENÚ (ADR-0381) ════════════════════════════════════════════════
  //
  // Decidido con el mercado (12 referencias + foros; la tabla va en el PR). Tres veredictos:
  //  · HOJA ÚNICA con los grupos apilados, no wizard. Odoo lo hace así en 18 y en 19, y Toast
  //    construyó «Open View» para SALIR del wizard: «rather than in a sequential way».
  //  · El TECHO se respeta PARTIDO por el valor de `max` — ver `pickComboOption`.
  //  · El suplemento lleva SIGNO SEPARADO y se oculta si es cero — ver `comboDelta`.

  /** Lee el catálogo de menús. Distingue tres estados que NO son el mismo:
   *
   *  · `undefined` → el módulo `combos` no está instalado. `sales` no gana `depends_on` (ADR-0127)
   *    y el TPV es exactamente el de antes: ni baldosas ni aviso, porque no hay nada que avisar.
   *  · lanza → el módulo está y la lectura FALLÓ. Eso sí se dice: una rejilla misteriosamente
   *    corta es un fallo mudo, y este es el que deja al camarero buscando un menú que no aparece.
   *  · filas → los menús vendibles.
   */
  private async loadCombos(): Promise<void> {
    let raw: unknown;
    try {
      const c = erplora() as unknown as ErploraClientLike & { queryOptional?: (n: string, p?: unknown) => Promise<unknown> };
      if (typeof c.queryOptional !== 'function') return;
      raw = await c.queryOptional('combos.options.all', {});
    } catch {
      this.comboCatalogFailed = true;
      return;
    }
    if (raw === undefined || raw === null) return;
    this.comboCatalog = groupComboRows(rows<unknown>(raw));
  }

  /** El nombre de un componente. `combos` referencia el artículo de forma OPACA (`source`/
   *  `source_ref`, `depends_on: []`), así que quien sabe cómo se llama es el catálogo que el TPV ya
   *  tiene cargado. Sin resolverlo, el camarero elegiría entre «p-sirloin» y «p-chicken». */
  private comboOptionName(o: ComboOption): string {
    return this.products.find((p) => p.id === o.source_ref)?.name ?? o.source_ref;
  }

  /** El suplemento, con el SIGNO SEPARADO del número y vacío cuando es cero.
   *
   *  Es literalmente lo que hace Odoo (`Math.abs()` + `'+ '`/`'- '`, y `''` si es cero) y coincide
   *  con el modo `Relative` de WooCommerce y con el «−$1.00» que Square publica para «No cheese».
   *  El signo carga el significado: el color NO, porque el color solo no pasa contraste — y Odoo
   *  pinta los dos signos del mismo color a propósito. */
  private comboDelta(o: ComboOption): string {
    if (!o.price_delta) return '';
    // U+2212 (menos verdadero), no el guion de teclado.
    return `${o.price_delta > 0 ? '+' : '\u2212'} ${this.money(Math.abs(o.price_delta))}`;
  }

  /** Cuántas veces está elegida una opción (con `allow_repeat` puede ser > 1). */
  private comboCount(id: string): number {
    return this.comboPicks.filter((x) => x === id).length;
  }

  private comboPicksIn(g: ComboGroup): string[] {
    const ids = new Set(g.options.map((o) => o.option_id));
    return this.comboPicks.filter((p) => ids.has(p));
  }

  /** El grupo llegó a su techo. `max = 0` es SIN TECHO: nunca se llena. */
  private comboGroupFull(g: ComboGroup): boolean {
    return g.max > 0 && this.comboPicksIn(g).length >= g.max;
  }

  /** El contador de la cabecera, con la gramática de Toast Open View: `1` exacto · `1-3` rango ·
   *  `1+` mínimo sin techo · `3` opcional con techo · nada = opcional sin límite. Explica la regla
   *  ANTES de que se choque contra ella, que es lo que no hace apagar la opción sin más. */
  private comboGroupCounter(g: ComboGroup): string {
    if (g.min > 0 && g.max === g.min) return `${g.min}`;
    if (g.min > 0 && g.max > g.min) return `${g.min}-${g.max}`;
    if (g.min > 0 && g.max === 0) return `${g.min}+`;
    if (g.min === 0 && g.max > 0) return `${g.max}`;
    return '';
  }

  private openCombo(combo: Combo) {
    this.blockedNotice = '';
    this.comboPicks = [];
    this.comboNeedsGroup = '';
    this.comboSheet = { combo };
  }

  /**
   * Un toque en una opción. El mercado NO da una respuesta única al techo: la da **partida** por el
   * valor de `max`, y así se implementa.
   *
   * · `max === 1` → **AUTO-SWAP** tipo radio. Square se lo prescribe a sus integradores («use radio
   *   buttons when `max_selected_modifiers = 1`») y Odoo 18 lo hace con `<input type="radio">`. La
   *   anterior se RETIRA limpiamente: cuando Square falló en eso, el KDS imprimía «No Not spicy» y
   *   «Spicy Level 1» a la vez y hubo que renunciar a las preselecciones.
   * · `max > 1` (o 0 = sin techo) → acumula. En el techo, el toque no añade pero **CONTESTA**:
   *   marca el grupo. Nunca se apaga la opción entera —Square se niega a esconder lo no
   *   seleccionable— y el motivo vive en el contador de la cabecera, no en un `title` que en una
   *   pantalla táctil nadie puede leer.
   *
   * Y jamás se autoconfirma al llegar al mínimo: en Square eso se percibe como avería.
   */
  private pickComboOption(g: ComboGroup, id: string) {
    this.comboNeedsGroup = '';
    const mine = new Set(g.options.map((o) => o.option_id));
    if (g.max === 1) {
      // Volver a tocar la misma la retira: un grupo de uno no deja la elección atrapada.
      this.comboPicks = this.comboCount(id) > 0
        ? this.comboPicks.filter((x) => !mine.has(x))
        : [...this.comboPicks.filter((x) => !mine.has(x)), id];
      return;
    }
    const already = this.comboCount(id) > 0;
    if (already && !g.allow_repeat) {
      this.comboPicks = this.comboPicks.filter((x) => x !== id);
      return;
    }
    if (this.comboGroupFull(g)) {
      // El toque CONTESTA aunque no añada. Sin esto sería un botón que parece roto.
      this.comboNeedsGroup = g.id;
      return;
    }
    this.comboPicks = [...this.comboPicks, id];
  }

  /** Quita UNA de las repeticiones (solo existe cuando el grupo permite repetir). */
  private dropComboOption(id: string) {
    const i = this.comboPicks.lastIndexOf(id);
    if (i < 0) return;
    this.comboPicks = [...this.comboPicks.slice(0, i), ...this.comboPicks.slice(i + 1)];
  }

  /** Por qué no se puede confirmar, o `undefined`. Sale de la MISMA función que decide el botón,
   *  así que el motivo escrito y el botón no pueden contradecirse. */
  private comboBlocked(): { text: string; group: string } | undefined {
    const sheet = this.comboSheet;
    if (!sheet) return undefined;
    const why = comboBlockReason(sheet.combo, this.comboPicks);
    if (!why) return undefined;
    return { text: t(why.key, { group: why.group, n: why.n ?? 1 }), group: why.group };
  }

  /** Confirma la composición y añade la línea. Solo viajan los `option_id` EN SU ORDEN —el que lee
   *  cocina—, más el nombre y la categoría de cada componente para DISPLAY y para que el KDS
   *  enrute cada uno a SU estación (el fallo de TouchBistro que ADR-0381 nombra).
   *
   *  🔴 El `price` que se manda es un PREVIEW. El servidor lo IGNORA y recalcula contra
   *  `combos.options.all`: quien decide el dinero es él, nunca el navegador (sales#68). */
  async confirmCombo(): Promise<void> {
    const sheet = this.comboSheet;
    if (!sheet) return;
    if (!canConfirmCombo(sheet.combo, this.comboPicks)) {
      // Un botón que no se puede pulsar tiene que CONTESTAR igual: se señala el grupo que falta.
      this.comboNeedsGroup = comboBlockReason(sheet.combo, this.comboPicks)?.group ?? '';
      const g = sheet.combo.groups.find((x) => x.name === this.comboNeedsGroup);
      if (g) this.comboNeedsGroup = g.id;
      return;
    }
    const combo = sheet.combo;
    const picks = this.comboPicks;
    const choices = picks.map((option_id) => {
      const o = combo.groups.flatMap((g) => g.options).find((x) => x.option_id === option_id)!;
      return {
        option_id,
        product_name: this.comboOptionName(o),
        category_id: this.primaryCategory(o.source_ref) ?? null,
      };
    });
    this.comboSheet = undefined;
    this.comboPicks = [];
    this.comboNeedsGroup = '';
    await this.queue(() => this.addComboLine(combo, choices, comboTotalCents(combo, picks)));
  }

  private toggleModifier(id: string) {
    this.modifierPicks = this.modifierPicks.includes(id)
      ? this.modifierPicks.filter((x) => x !== id)
      : [...this.modifierPicks, id];
  }

  private async addNow(p: Product, picks: { option_id: string }[] = []) {
    // pm#93: la fusión mira los suplementos. Sin esto, una hamburguesa «sin cebolla» sube la
    // cantidad de la normal y cocina recibe «2 × Hamburguesa», una de ellas mal. Es la misma regla
    // que `sameCartLine` aplica al fusionar mesas, y este camino tenía su propia búsqueda.
    const fingerprint = (m?: { option_id: string }[]) => (m ?? []).map((x) => x.option_id).join('\u0000');
    const want = fingerprint(picks);
    // sales#273: y mira el PROFESIONAL, por el mismo motivo. En una peluquería el corte de Ana y el
    // de Marta son el mismo servicio, así que sin esto se fundirían en una línea de cantidad 2
    // atribuida a Ana — el dinero de una se iría al cierre de la otra, y sin decirlo.
    const ex = this.cart.find(
      (l) => l.id === p.id && !l.is_gift && fingerprint(l.modifiers) === want
        && (l.staff_id ?? undefined) === this.staffId,
    );
    // tax_category_key = referencia fiscal del producto (autoridad del servidor, ADR-0085).
    // tax_rate = % resuelto en cliente SOLO para el preview del total. cost = para el arqueo de regalos.
    const tax_rate = resolveLineTax(this.taxCatalog.rates, p.tax_category_key);
    try {
      if (ex) {
        // Ya está en la comanda: sube la cantidad y PERSISTE YA (una fila, no todo el carrito).
        const qty = ex.qty + 1;
        this.cart = this.cart.map((l) => (l === ex ? { ...l, qty } : l));
        // Antes esto solo escribía si YA se conocía el `line_id`; si no, la cantidad subía en
        // pantalla y no llegaba a la comanda (5 tortillas a la vista, 1 en la BD). `persistLineQty`
        // recupera el id releyendo el pedido, y si aun así no puede escribir, lo DECIMOS.
        if (this.orderId && !(await persistLineQty(erplora(), this.orderId, ex, qty))) {
          this.cart = this.cart.map((l) => (l.id === ex.id && !l.is_gift ? { ...l, qty: ex.qty } : l));
          this.error = t('ui.lineNotSaved');
        }
        return;
      }
      const line: CartLine = {
        id: p.id, name: p.name, sku: p.sku, price: Number(p.price), qty: 1,
        tax_category_key: p.tax_category_key, tax_rate, cost: Number(p.cost) || 0,
        // sales#12: la categoría se congela en la línea — es lo que enruta la comanda en kitchen y
        // sobrevive a retomar la cuenta (antes solo vivía en `prodCats`, en memoria).
        category_id: this.primaryCategory(p.id),
        // pm#93: solo los ids, en su orden de elección.
        ...(picks.length ? { modifiers: picks } : {}),
        // sales#89: viaja hasta `complete_sale`, que por él no mide la línea contra el catálogo de
        // `inventory` ni le descuenta stock, y hasta `sale.completed`, donde `inventory` la salta.
        ...(p.is_service ? { is_service: true } : {}),
        // sales#273: la línea se SELLA con quien esté en el chip al añadirla — el gesto de Square,
        // Fresha, Vagaro, Booksy y Zenoti. Un tique a dos manos se marca moviendo el chip entre
        // toques, sin un segundo selector por línea en la pantalla más ocupada del producto.
        ...(this.staffId ? { staff_id: this.staffId } : {}),
        ...this.frozenUnitContext(p),
      };
      await this.pushNewLine(line);
    } catch (e) {
      // La comanda es la fuente de verdad: si la escritura falla, NO dejamos la UI mintiendo.
      // sales#81: si el error es del TRANSPORTE (el proxy devolvió HTML 502 porque el contenedor
      // del hub murió, o el fetch no llegó), el mensaje crudo del parser («<!DOCTYPE … is not
      // valid JSON») no le sirve al cajero: lo traducimos a un aviso de negocio. Los errores de
      // dominio pasan tal cual — su frase sí es útil.
      const transportKey = transportErrorKey(e);
      const msg = transportKey ? t(transportKey) : (e instanceof Error ? e.message : String(e));
      this.error = msg;
      // #270 — el banner `this.error` es discreto y en un TPV táctil se pierde → el rechazo del
      // backend parecía "no pasa nada" al tocar un producto. Avisamos además por el canal de toasts
      // del shell (mismo `notify` que los avisos de éxito) para feedback visible e inmediato.
      erplora().notify?.({ type: 'error', message: msg });
    }
  }

  /** Añade la línea del MENÚ. Hermana de `addNow`, con su propia fusión: dos menús con segundo
   *  distinto NO son la misma línea (la composición entra en la identidad, igual que los
   *  suplementos en pm#93), o cocina recibiría «2 × Menú del día» y uno de los dos mal.
   *
   *  `price` es el PREVIEW que se acaba de enseñar; el servidor lo ignora y recalcula. */
  private async addComboLine(
    combo: Combo,
    choices: { option_id: string; product_name: string; category_id: string | null }[],
    previewCents: number,
  ): Promise<void> {
    const want = choices.map((c) => c.option_id).join('\u0000');
    const ex = this.cart.find(
      (l) => l.combo_id === combo.combo_id && !l.is_gift
        && (l.combo_choices ?? []).map((c) => c.option_id).join('\u0000') === want
        // sales#273: y el profesional, igual que la fusión de `addNow`. Dos bonos idénticos
        // vendidos por dos personas son dos líneas, o el cierre de una se come el de la otra.
        && (l.staff_id ?? undefined) === this.staffId,
    );
    const tax_rate = resolveLineTax(this.taxCatalog.rates, combo.tax_category_key);
    try {
      if (ex) {
        const qty = ex.qty + 1;
        this.cart = this.cart.map((l) => (l === ex ? { ...l, qty } : l));
        if (this.orderId && !(await persistLineQty(erplora(), this.orderId, ex, qty))) {
          this.cart = this.cart.map((l) => (l === ex ? { ...l, qty: ex.qty } : l));
        }
        return;
      }
      await this.pushNewLine({
        id: combo.combo_id,
        name: combo.name,
        price: previewCents,
        qty: 1,
        tax_category_key: combo.tax_category_key,
        tax_rate,
        cost: 0,
        combo_id: combo.combo_id,
        combo_choices: choices,
        // sales#273: sellada con el chip, como toda línea que nace en esta pantalla.
        ...(this.staffId ? { staff_id: this.staffId } : {}),
      });
    } catch (e) {
      const transportKey = transportErrorKey(e);
      const msg = transportKey ? t(transportKey) : (e instanceof Error ? e.message : String(e));
      this.error = msg;
      erplora().notify?.({ type: 'error', message: msg });
    }
  }

  /** Invitar/quitar invitación a una línea (comp, ADR-comp): toggle is_gift con un motivo por defecto.
   *  La línea regalo no se cobra (el servidor pone net/tax/total=0) pero descuenta stock. */
  private async toggleGift(id: string) {
    const ex = this.cart.find((l) => l.id === id);
    if (!ex) return;
    const is_gift = !ex.is_gift;
    const gift_reason = is_gift ? (ex.gift_reason || 'Invitación') : undefined;
    this.cart = this.cart.map((l) => (l === ex ? { ...l, is_gift, gift_reason } : l));
    // Cambia el importe de la línea → se persiste YA (ADR-0141).
    if (this.orderId && ex.line_id) {
      await updateOrderLineQty(erplora(), this.orderId, ex.line_id, ex.qty, ex.price, is_gift, gift_reason ?? '', ex.discount ?? 0);
    }
  }
  /** Contexto de unidades CONGELADO desde el maestro (ADR-0147 §2.4): unidad de la línea, su
   *  incremento y la cantidad de precio (KPEIN). Sin registro/unidad → unidad suelta implícita. */
  private frozenUnitContext(p: Product): Partial<CartLine> {
    const u = p.unit_code ? this.units.get(p.unit_code) : undefined;
    if (!u) return {};
    return {
      unit_code: u.code,
      unit_name: u.name || '',
      factor_num: Number(u.factor_num) || 1,
      factor_den: Number(u.factor_den) || 1,
      increment_value: Number(u.increment_value) || undefined,
      price_quantity_value: Number(p.price_quantity_value) || undefined,
      pricing_unit_code: p.pricing_unit_code || u.code,
    };
  }

  /** Paso del stepper de una línea: el incremento congelado de su unidad (1 para `ud`). */
  private stepOf(l: CartLine): number {
    return l.increment_value ? fromMicro(l.increment_value) : 1;
  }

  /** Fija la cantidad de una línea (desde ok-qty-stepper); al llegar a 0 la línea se elimina. */
  private async setQtyAbs(id: string, v: number, stepper?: HTMLElement & { value: number; updateComplete?: Promise<unknown> }) {
    const ex = this.cart.find((l) => l.id === id);
    if (!ex) return;
    // ADR-0147 §2.2: el incremento VALIDA, no redondea. Fuera de rejilla → se RECHAZA y el
    // pedido no se altera.
    const qtyMicro = toMicro(Math.max(0, v));
    if (!onGrid(qtyMicro, ex.increment_value ?? 0)) {
      this.error = `${t('ui.qtyOffGrid')} (${formatQuantity(ex.increment_value ?? 0)} ${ex.unit_code ?? ''})`.trim();
      // Incidencia 4a: el re-render NO repinta el campo del stepper — `.value=${l.qty}` no cambió
      // (0,5 → 0,5) y Lit no toca el input, que se queda con lo tecleado. Y el stepper COMMITEÓ lo
      // tecleado a su `value` antes de emitir `ok-change` (síncrono), así que restaurar en este
      // mismo tick tampoco repinta (valor neto igual → dirty-check). Se deja asentar su render en
      // vuelo y ENTONCES se restaura la propiedad: eso SÍ es un cambio → el input vuelve a la
      // cantidad real.
      if (stepper) {
        await stepper.updateComplete;
        stepper.value = ex.qty;
      }
      return;
    }
    const qty = fromMicro(qtyMicro);
    this.cart = qty > 0
      ? this.cart.map((l) => (l === ex ? { ...l, qty } : l))
      : this.cart.filter((l) => l !== ex);
    // Persistencia INMEDIATA de la fila (0 → se elimina del pedido).
    if (!this.orderId || !ex.line_id) return;
    if (qty > 0) await updateOrderLineQty(erplora(), this.orderId, ex.line_id, qty, ex.price, ex.is_gift, undefined, ex.discount ?? 0);
    else await removeOrderLine(erplora(), this.orderId, ex.line_id);
  }

  /** Imprime la CUENTA que se lleva a la mesa (no fiscal, ADR-0141).
   *
   *  Sale por la puerta GLOBAL del hub (`erplora.print`): impresora del rol `receipt` si la hay,
   *  cola del hub si no, y el diálogo del navegador como último respaldo. NO se imprime el DOM de
   *  la app —el papel vive en un ion-modal reparentado con shadow DOM y salía la app entera— sino
   *  el HTML PLANO en un iframe aislado.
   *
   *  Van DOS documentos con el mismo contenido y distinta forma, y confundirlos era el fallo
   *  (sales#78): el HTML plano es lo que imprime un navegador, y `data` es lo que lee el
   *  renderizador ESC/POS, que busca POR CLAVE (`items`, `business_name`) y con la forma de
   *  pantalla no falla —saca «ERPlora», sin líneas y TOTAL 0,00—. El `jobId` no es opcional: sin él
   *  la puerta ni intenta la cola del hub, y cambia con la cuenta para que una segunda ronda no se
   *  trague como duplicado. */
  /** Trae el catálogo de suplementos si la cuenta lo necesita (sales#148).
   *
   *  Solo cuando alguna línea lleva suplementos: en el 99 % de las cuentas de un TPV no hay
   *  ninguno, y cobrarle una lectura de más a ese 99 % por una integración accesoria es empeorar
   *  el producto para casi todo el mundo — el mismo criterio que `addWithModifiers`.
   *
   *  Lectura OPCIONAL (ADR-0127): si `modifiers` no está instalado no hay nada que resolver y la
   *  cuenta se imprime igual, con el id en lugar del nombre. Un papel feo es preferible a un cobro
   *  que el cliente no puede leer, que es justo el fallo que esta issue arregla. */
  private async loadModifierCatalog(): Promise<void> {
    if (!this.cart.some((l) => l.modifiers?.length)) return;
    const rows = await optionalRead((c) => c.queryOptional<unknown>('modifiers.options.all', {}));
    if (!Array.isArray(rows)) return;
    const map = new Map<string, PrintedModifier>();
    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const option_id = String(r.option_id ?? '');
      if (!option_id) continue;
      const name = String(r.name ?? '');
      const delta = Number(r.price_delta);
      map.set(option_id, {
        option_id,
        ...(name ? { name } : {}),
        ...(Number.isFinite(delta) ? { price_delta: delta } : {}),
      });
    }
    this.modifierCatalog = map;
  }

  /** Los suplementos de una línea, con el nombre que el cliente debe leer. Sin resolver queda el
   *  id: la línea sale fea, pero sale. */
  private resolvedModifiers(l: CartLine): PrintedModifier[] | undefined {
    if (!l.modifiers?.length) return undefined;
    return l.modifiers.map((m) => {
      const named = this.modifierCatalog.get(m.option_id) ?? { option_id: m.option_id };
      // sales#208 — el NOMBRE sale del catálogo vivo; el DINERO, de la línea, que lleva el delta
      // que el servidor congeló al pedir (sales#200). Al revés, la cuenta de una mesa abierta se
      // repreciaría sola en cuanto alguien tocara la carta. Sin delta congelado (fila anterior al
      // snapshot) manda el catálogo, que es con lo que el servidor va a cobrarla.
      return m.price_delta != null ? { ...named, price_delta: m.price_delta } : named;
    });
  }

  /** El carrito en la forma de la CUENTA. Una sola fuente para el papel y para la pantalla del
   *  modal: si cada uno compusiera la suya, el camarero vería algo distinto de lo que imprime. */
  private prebillLines() {
    // La unidad congelada viaja con la línea (sales#28): la cuenta que se lleva a la mesa pinta
    // «1,5 kg», como el tiquet y la factura.
    return this.cart.map((l) => ({
      name: l.name, price: l.price, qty: l.qty, is_gift: l.is_gift,
      unit_code: l.unit_code, unit_name: l.unit_name,
      // sales#180: and its VAT rate (the same PREVIEW the cart line already carries), so the bill
      // breaks the rates down the way Toast and Lightspeed do on a pre-bill. The real rate is
      // resolved by the server on checkout (ADR-0085); that does not change.
      tax_rate: l.tax_rate,
      // sales#148: y sus suplementos, o el cliente paga un «+ queso» que su papel no nombra.
      ...(this.resolvedModifiers(l) ? { modifiers: this.resolvedModifiers(l) } : {}),
      // sales#154: y la composición del menú, o la cuenta dice «Menú del día» sin decir cuál.
      ...(this.prebillCombo(l) ? { combo: this.prebillCombo(l) } : {}),
      // sales#156: and its note, or the bill taken to the table says less than the ticket the
      // kitchen got — the customer reads one thing while the pass cooked another.
      ...(l.note ? { note: l.note } : {}),
    }));
  }

  /** The menu of a cart line as the bill prints it (sales#154): the components with the display
   *  name resolved when they were picked, and the supplement of each one from the combo catalogue
   *  the till already holds — never from the browser's arithmetic. A line that is not a menu yields
   *  nothing, so the bill of always does not change. */
  private prebillCombo(l: CartLine): PrintedCombo | undefined {
    if (!l.combo_id) return undefined;
    const combo = this.comboCatalog.find((c) => c.combo_id === l.combo_id);
    const options = new Map(combo?.groups.flatMap((g) => g.options).map((o) => [o.option_id, o]) ?? []);
    return {
      name: l.name,
      components: (l.combo_choices ?? []).map((c) => {
        const delta = options.get(c.option_id)?.price_delta;
        return {
          option_id: c.option_id,
          ...(c.product_name ? { name: c.product_name } : {}),
          ...(delta ? { price_delta: delta } : {}),
        };
      }),
    };
  }

  /** The settings the BILL is built from: the till's, plus the business's LEGAL name, which heads
   *  the paper when there is no deliberate ticket header (sales#180). The currency scale is not
   *  passed: the mapper reads it from the SDK itself (`hubDecimals`). */
  private get billSettings() {
    return { ...this.settings, issuer_name: this.businessName };
  }

  /** Whose bill this is: the TABLE when the order is a dine-in one, the customer otherwise. It is
   *  what goes in the only labelled meta slot `<ok-receipt>` has, and its label follows from it. */
  private get billWho() {
    return {
      tableLabel: this.tableLabel || undefined,
      customerName: this.customerName || undefined,
      title: t('ui.prebillTitle'),
      notice: t('ui.prebillNotice'),
      fallbackName: t('ui.docDefaultBusiness'),
    };
  }

  /** The BILL on screen. It is composed once -- not twice in the template -- because both the
   *  document and the LABEL of its meta slot come out of it: `<ok-receipt>` labels that slot with
   *  `labels.customer`, and on a dine-in bill what sits there is the TABLE (sales#180). Until the
   *  element has a slot of its own for the table (ERPlora/outfitkit#87), the document decides the
   *  label. */
  /** sales#164 — the hub's valuation, BUT only when it priced the same thing this paper shows.
   *
   *  The bill is for the WHOLE table; the valuation is for the charge in progress, which with a
   *  line selection (ADR-0146) or a per-line redemption (sales#162) is a subset. Putting a total
   *  for something else there would be worse than composing it on screen, so in that case it is
   *  not passed and the paper comes out as it did. */
  private get prebillValuation(): PrebillValuation | undefined {
    if (this.splitSel.size || this.covered.size) return undefined;
    return this.authoritative;
  }

  private renderPrebillDoc() {
    const doc = orderToPrebill(this.prebillLines(), this.billSettings, this.billWho, this.prebillValuation);
    return html`<ok-receipt id="prebill-doc" .receipt=${doc} .labels=${receiptLabels(t, doc)}></ok-receipt>`;
  }

  private async printPrebill() {
    // Every supplement's name comes from the catalogue, not from the browser (sales#148).
    await this.loadModifierCatalog();
    const lines = this.prebillLines();
    const opts = this.billWho;
    const settings = this.billSettings;
    const valuation = this.prebillValuation;
    const doc = orderToPrebill(lines, settings, opts, valuation);
    const html = receiptToPrintableHtml({
      ...(doc as Parameters<typeof receiptToPrintableHtml>[0]),
      // sales#180: and the paper labels that datum for what it is -- "Table: S1", not a bare "S1".
      customer_label: doc.customer ? (doc.customer_is_table ? t('ui.docTable') : t('ui.docCustomer')) : undefined,
      // sales#120: el papel de la cuenta sale en el idioma del hub (labels, no plantilla).
      labels: { subtotal: t('ui.docSubtotal'), total: t('ui.docTotal'), change: t('ui.docChange'), document: t('ui.document') },
    });
    const sdk = (globalThis as { erplora?: { print?: (r: Record<string, unknown>) => Promise<PrintOutcome> } }).erplora;
    if (!sdk?.print) {
      printHtmlInIframe(html);
      return;
    }
    const res = await sdk
      .print({
        role: 'receipt',
        documentType: 'prebill',
        jobId: prebillJobId(this.orderId, lines),
        data: prebillToPrintDocument(lines, settings, opts, valuation),
        html,
      })
      .catch((e: unknown) => ({ via: 'none', error: e instanceof Error ? e.message : String(e) }) as PrintOutcome);
    // Salió por una impresora, o quedó en la cola para que la saque un host: las dos son éxito.
    if (res?.via === 'bridge' || res?.via === 'queue') return;
    // Cualquier otra cosa hay que DECIRLA: en la app instalada el respaldo del navegador no imprime
    // nada, así que un fallo mudo deja al camarero yendo a la mesa con las manos vacías creyendo
    // que la cuenta está en la impresora.
    erplora().notify?.({
      type: 'error',
      message: res?.error ? `${t('ui.prebillPrintFailed')}: ${res.error}` : t('ui.prebillPrintFailed'),
    });
  }

  /** Marca/desmarca una línea para el cobro por partes. Solo tiene sentido con más de una línea:
   *  con una sola, «lo suyo» y «la cuenta» son lo mismo. */
  private toggleSplit(l: CartLine) {
    if (!l.line_id || this.cart.length < 2) return;
    const s = new Set(this.splitSel);
    if (s.has(l.line_id)) s.delete(l.line_id); else s.add(l.line_id);
    this.splitSel = s;
  }

  private openPay() {
    if (!this.cart.length) return;
    // sales#185 — the ENTRY door to the checkout. The button is `aria-disabled` (never `disabled`,
    // which on Ionic is `pointer-events:none` and would swallow the tap — sales#58), so the tap
    // reaches here and here is where it is answered. Opening the sheet only for the checkout to
    // die on confirm is exactly the defect this fixes.
    if (this.missingChargeApp) {
      this.notifyShell(t('ui.missingAppCharge', { app: this.chargeAppName }));
      return;
    }
    // hub#1935 — the same door for a business that cannot file: nothing on this screen fixes it,
    // so no payment is started.
    if (this.fiscalRoad.blocked) {
      this.notifyShell(t(fiscalRoadKey(this.fiscalRoad.blocked)));
      return;
    }
    // sales#222 — with the customer mandatory the charge step STARTS by asking for it. Until
    // now the till let the cashier type the amount, pick a method and confirm, and only the
    // server's `sales.customer_required` said no — with the customer standing there and the
    // checkout to redo. The rule stays the server's: this only stops the screen from hiding it.
    if (this.missingRequiredCustomer) {
      this.askForCustomer();
      return;
    }
    // Una clave por INTENTO de cobro (sales#20): todos los reintentos de ESTA pantalla comparten
    // clave, así que el servidor los resuelve a la misma venta en vez de duplicarla.
    this.checkoutKey = newIdempotencyKey();
    this.tendered = '';
    this.padPrimed = false;
    // sales#159 — cada cobro estrena reparto: arrastrar las patas del ticket anterior sería cobrar
    // esta venta con el dinero de la otra.
    this.splitting = false;
    this.tenders = [];
    // sales#283 — the receipt choice is for ONE sale: each charge starts from the shop's setting.
    this.printOnCharge = undefined;
    this.payMethod = defaultPayMethod(this.payMethods);
    this.docFormat = this.defaultDocFormat;
    // hub#297 — por encima del techo el tique NO es una opción, así que el formato se cambia solo
    // y lo que queda en pantalla es la única pregunta que sí hay que hacerle al cliente: quién es.
    //
    // El cambio de formato es LA conversión: `resolve_invoice_type` solo degrada, nunca asciende,
    // así que sin este `invoice` la venta saldría como F2 por muy completo que esté el cliente.
    if (this.overSimplifiedLimit) this.docFormat = 'invoice';
    // sales#341 — on a phone the sheet opens on the tender; the side opens only when it asks for
    // something (a default invoice with no recipient yet).
    this.paySideOpen = this.chargeBlocked;
    this.paying = true;
    // sales#164 — this charge's ticket is priced on the server. `updated()` asks for it anyway;
    // starting it here saves the most important number on the screen one repaint of delay.
    //
    // The previous one is forgotten FIRST: closing and reopening is what anyone does when a number
    // does not show up, and without this the ticket's signature stayed the same and it never
    // retried — the till kept its own arithmetic until somebody touched the check.
    this.dropValuation();
    void this.refreshValuation();
  }

  /**
   * Con qué formato se ABRE el cobro (hub#962).
   *
   * `auto_invoice_with_tax_id` llevaba desde su alta guardándose sin que lo leyera nadie: un
   * interruptor que no hace nada es peor que no tener interruptor, porque el comercio cree haber
   * pedido algo. Lo que dice es exactamente esto — «si el cliente se ha identificado con su NIF, es
   * que quiere factura» — y es la regla que aplican Odoo, Holded y los TPV españoles: quien da su
   * NIF en el mostrador no lo da por gusto.
   *
   * No decide sobre el techo: por encima, `openPay` fuerza factura igual, porque ahí no es una
   * preferencia del comercio sino la ley.
   */
  private get defaultDocFormat(): 'ticket' | 'invoice' {
    if (this.settings.default_document_format === 'invoice') return 'invoice';
    const auto = this.settings.auto_invoice_with_tax_id;
    if ((auto === 1 || auto === true) && this.customerTaxId.trim()) return 'invoice';
    return 'ticket';
  }

  /**
   * ¿Hay algo que elegir? (hub#962) Por encima del techo de la simplificada, **no**: la venta sale
   * en factura por ley, y ofrecer un botón que devuelve a tique sería ofrecer romperla. Se oculta
   * en vez de deshabilitarse porque un control apagado y sin motivo se lee como una avería.
   */
  private get canChooseDocFormat(): boolean {
    return !this.overSimplifiedLimit;
  }

  /** El cajero elige. Por encima del techo no se admite volver a tique (ver `canChooseDocFormat`). */
  private chooseDocFormat(next: 'ticket' | 'invoice') {
    if (next === 'ticket' && this.overSimplifiedLimit) return;
    this.docFormat = next;
    // sales#341 — «Invoice» asks who it is for right below: folding that away would hide the question.
    if (next === 'invoice') this.paySideOpen = true;
  }

  /** sales#341 — is there anything in the side group worth folding on a phone? The voucher per line
   *  is what grows; an invoice adds its recipient. Two ticket/invoice buttons alone are not folded:
   *  a summary line would take the same room and cost a tap. */
  private get paySideFoldable(): boolean {
    return this.tenderLines.length > 0 || this.docFormat === 'invoice';
  }

  /** Folded unless the cashier opened it. What must be answered opens it: a charge blocked for the
   *  recipient (at `openPay` and at `confirm`) and choosing «Invoice». */
  private get paySideFolded(): boolean {
    return this.paySideFoldable && !this.paySideOpen;
  }

  /** The one line that stands for the folded group: the document, who it is for, the voucher. */
  private renderPaySideSummary() {
    if (!this.paySideFoldable) return nothing;
    const lines = this.tenderLines;
    const held = lines.filter((l) => !!l.line_id && this.covered.has(l.line_id)).length;
    const folded = this.paySideFolded;
    return html`<button data-testid="pos-pay-side-summary" class="pay-side-summary"
        aria-expanded=${folded ? 'false' : 'true'}
        @click=${() => { this.paySideOpen = folded; }}>
      <span class="pss-text">
        <span data-part="doc">${this.docFormat === 'invoice' ? t('ui.docInvoice') : t('ui.docTicket')}</span>
        ${this.docFormat === 'invoice' && this.customerName
          ? html`<span data-part="recipient">${this.customerName}</span>` : nothing}
        ${lines.length
          ? html`<span data-part="voucher" data-state=${held ? 'applied' : 'none'}
              >${held ? t('ui.paySummaryVoucherApplied') : t('ui.paySummaryNoVoucher')}</span>`
          : nothing}
      </span>
      <ion-icon name=${folded ? 'chevron-down-outline' : 'chevron-up-outline'} aria-hidden="true"></ion-icon>
    </button>`;
  }

  /** ¿Este cobro pasa del techo de la simplificada? (independiente de quién sea el cliente). */
  private get overSimplifiedLimit(): boolean {
    return isOverSimplifiedLimit(this.payable, this.simplifiedMaxCents);
  }

  /** Lo que el TPV le puede pedir al mostrador, reunido para no repetirlo en tres sitios. */
  private get limitState() {
    return {
      payableCents: this.payable,
      maxCents: this.simplifiedMaxCents,
      documentFormat: this.docFormat,
      customerName: this.customerName,
      customerTaxId: this.customerTaxId,
      customerAddress: this.customerAddress,
    };
  }

  /** ¿Se puede cerrar este cobro tal y como está? Ver `lib/simplified-limit.ts`. */
  /** sales#283 — this charge's receipt: the switch as the cashier left it, else the setting. */
  private get printReceipt(): boolean | undefined {
    return printReceiptIntent(this.printOnCharge, this.autoPrintDefault);
  }

  private get chargeBlocked(): boolean {
    return ticketIsBlocked(this.limitState);
  }
  /** 🔴 Re-asserts the state of the charge buttons in the DOM AFTER every paint.
   *
   *  Measured in a real browser (`erplora dev` + CDP, sales#185), not deduced: on an `ion-button`
   *  neither `aria-disabled` nor a class set by Lit survives. Ionic (Stencil) takes the host over
   *  on hydration — it steals the `aria-*` and rewrites `className` with its own
   *  (`md button button-solid …`) — and Lit never writes either of them again: its `AttributePart`
   *  caches the last value it emitted, sees it has not changed and skips the write. Measured
   *  result: the block vanished from the DOM and from the colour as soon as the first line was
   *  added. It is the sales#58 hole through another door, and happy-dom cannot show it because
   *  Ionic does not hydrate there.
   *
   *  That is why the state is written HERE and not in the template, and with `classList`
   *  (surgical) instead of `class=` (which would wipe Ionic's own classes). It decides nothing the
   *  screen does not already say: it only stops the DOM from saying something else. It covers the
   *  sheet's button too (sales#159), which carried the same defect. */
  private syncChargeState(): void {
    const blocked: Array<[string, boolean]> = [
      ['.foot-actions ion-button.charge', !!this.missingChargeApp || !!this.fiscalRoad.blocked || this.missingRequiredCustomer],
      ['.sheet-foot ion-button.charge', this.paying && !!this.chargeBlock],
    ];
    for (const [selector, isBlocked] of blocked) {
      const btn = this.renderRoot.querySelector(selector);
      if (!btn) continue;
      if (isBlocked) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
      btn.classList.toggle('blocked', isBlocked);
    }
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    // sales#71: el descuento de ticket pertenece a la CUENTA. Al soltarla (cobrada, aparcada,
    // eliminada, mesa cambiada) no puede arrastrarse a la siguiente.
    if (changed.has('orderId') && !this.orderId) { this.ticketDiscount = 0; this.ticketDiscountAmount = 0; this.ticketDiscountApproved = false; }
    // sales#277 — a cart with an attributed line needs NAMES, and the till may never have opened
    // the picker: the check resumed this morning comes back from `sales_order_item` with opaque
    // ids and nothing else. Asked for HERE and not at boot for the reason `openStaffPicker`
    // already gave — the till makes plenty of calls to the core — and guarded by
    // `ensureStaffOptions`, which answers a second caller without a second read.
    if (changed.has('cart') && this.cart.some((l) => l.staff_id && !this.staffNames.has(l.staff_id))) {
      void this.ensureStaffOptions();
    }
  }
  /** El teclado. Tras traer una pata a editar el importe queda CEBADO: la siguiente tecla lo
   *  sustituye en vez de encadenarse a él (50,00 + «6» daría 50,006, que no es un importe). Es como
   *  se comporta el teclado de cualquier TPV o calculadora tras un resultado. */
  private tap(k: string) {
    const base = this.padPrimed ? '' : this.tendered;
    this.padPrimed = false;
    this.tendered = pushTypedKey(base, k);
  }
  /** ¿Está el importe tecleado a la espera de ser sustituido por la siguiente tecla? */
  @state() private padPrimed = false;

  // ── sales#156 · the LINE NOTE ──────────────────────────────────────────────────────────────
  //
  // Market shape (8 refs + forums, table in the PR): a button on the SELECTED LINE, next to the
  // supplements and the comp — Toast's "Special Request", Square's per-item Notes, Lightspeed's
  // line note, Odoo's "Customer Note", Clover's `lineItem.note`, Revel's special requests. Shopify
  // POS is the odd one out (order-level only, per line needs an app) and it loses: a note on the
  // ORDER does not say which plate it is about, which is the one thing the kitchen needs.

  /** Opens the sheet with the note the line ALREADY has: reopening to CORRECT is half the use,
   *  and a blank sheet would force retyping the whole allergy just to add a word to it. */
  openLineNote(lineId?: string): void {
    this.noteInput = this.cart.find((l) => l.line_id === lineId)?.note ?? '';
    this.noteSheet = { lineId };
    if (this.quickNotesState === 'idle') void this.loadQuickNotes();
  }

  // ── sales#206 · the QUICK NOTES the business preconfigured ─────────────────────────────────
  //
  // Market shape (8 refs + forums, table in the PR): only Lightspeed Restaurant (K-Series) ships
  // this as a feature — notes created in the Back Office (add/edit/delete/reorder), applied with
  // one tap on the POS, printed on the docket and shown on the KDS. Toast, Square, Clover, Revel,
  // Simphony and SumUp give free text only, Odoo needs its configuration/app and Shopify POS needs
  // an app. So we copy Lightspeed, and only the part that survives our contract: the line carries
  // ONE note, so several chips COMPOSE that one string instead of several notes.

  /** Reads the catalogue through the till's own door.
   *
   *  `sales.quick_notes.list` reads with `sales.view_sale` and NOT with `sales.manage_settings`
   *  for the same reason `sales.pos_settings.get` exists (sales#205): the people tapping these
   *  chips are the `cashier` and the `employee`, and neither holds `manage_settings` — behind it
   *  the chips would be painted for whoever configured them and for nobody at the till. */
  async loadQuickNotes(): Promise<void> {
    this.quickNotesState = 'loading';
    try {
      // Sorted here as well as asked for in the read: the order is the ONLY thing the business
      // configures beyond the text (Lightspeed's Back Office reorders them for exactly this), so
      // the chips must not depend on a page of a list arriving in the order it was asked for.
      this.quickNotes = rows<QuickNote>(
        await erplora().queryAll<QuickNote>('sales.quick_notes.list', { sort: 'sort_order', dir: 'asc' }),
      )
        .slice()
        .sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || a.text.localeCompare(b.text));
      this.quickNotesState = 'ready';
    } catch {
      // Not swallowed and not fatal: the sheet says so and the keyboard keeps working, which is
      // the whole sheet as it shipped in sales#156. A failed convenience must never take the
      // feature it decorates down with it.
      this.quickNotes = [];
      this.quickNotesState = 'error';
    }
  }

  /** A chip ADDS its text to what is in the box, and takes it out if it is already there. */
  toggleQuickNoteChip(text: string): void {
    this.noteInput = toggleQuickNote(this.noteInput, text);
  }

  /** Saves the note on the line and on its order row. Empty (or whitespace only) REMOVES it: a
   *  note that cannot be deleted leaves the kitchen cooking to a request that was cancelled. */
  async applyLineNote(note: string): Promise<void> {
    const sheet = this.noteSheet;
    this.noteSheet = undefined;
    if (!sheet) return;
    const line = this.cart.find((l) => l.line_id === sheet.lineId);
    if (!line) return;
    const clean = note.trim();
    this.cart = this.cart.map((l) => (l === line ? { ...l, note: clean || undefined } : l));
    if (this.orderId) {
      try { await updateOrderLineNote(erplora(), this.orderId, line, clean); }
      catch (e) { this.error = e instanceof Error ? e.message : String(e); }
    }
  }

  // ── sales#71 · descuentos manuales ─────────────────────────────────────────────────────────
  openDiscount(target: 'line' | 'ticket', lineId?: string): void {
    // sales#113: si la cuenta ya lleva importe fijo, el sheet abre en € con él; si no, en %.
    this.discountMode = target === 'ticket' && this.ticketDiscountAmount > 0 && this.ticketDiscount === 0 ? 'amount' : 'percent';
    const current = target === 'ticket'
      ? (this.discountMode === 'amount' ? Number(minorToTyped(this.ticketDiscountAmount)) : this.ticketDiscount)
      : (this.cart.find((l) => l.line_id === lineId)?.discount ?? 0);
    this.discountInput = current > 0 ? String(current) : '';
    this.discountSheet = { target, lineId };
  }
  private setDiscountMode(mode: 'percent' | 'amount'): void {
    if (mode === this.discountMode) return;
    this.discountMode = mode;
    this.discountInput = '';
  }
  private tapDiscount(k: string) {
    // A % is not money: only the AMOUNT mode follows the hub currency scale (rv-sales-381).
    const next = this.discountMode === 'amount' ? pushTypedKey(this.discountInput, k) : pushPercentKey(this.discountInput, k);
    // A %: never above 100 (the server refuses it too). An amount: typed in the hub currency.
    if (this.discountMode === 'amount' || Number(next || '0') <= 100) this.discountInput = next;
  }
  /** The typed amount in minor units of the hub currency (amount mode, sales#379). */
  private get discountInputCents(): number { return Math.max(0, typedToMinor(this.discountInput)); }

  /** sales#284 — routes a ticket discount through the same two doors the checkout uses: the usual
   *  `sales.order.set_discount` under the shop's cap, the manager's `sales.order.set_discount_over_limit`
   *  above it. Before this, the till wrote the discount straight onto the order and painted the
   *  reduced total at once — the cap was only enforced at Charge, so a waiter could show a customer
   *  a price nobody had authorised yet. Returns whether the server accepted it; the caller only
   *  paints the new value on success, so a refusal (the manager's PIN cancelled) leaves the check
   *  showing what it showed before.
   *
   *  🔴 The two doors are named LITERALLY at the call sites below, same reason as the checkout's
   *  own doors: `.erplora/contracts.json` is extracted STATICALLY, so a command reached through a
   *  variable vanishes from it. */
  private async persistTicketDiscount(percent: number, amountCents: number): Promise<boolean> {
    const payload = { order_id: this.orderId, discount_percent: percent, discount_amount: amountCents };
    // Only the ticket-wide levers matter here: line discounts go through their own door
    // (`updateOrderLineDiscount`, sales#385), so `linePercents` is empty on purpose.
    const overCap = needsManagerApproval(discountCap(this.settings), {
      ticketPercent: percent,
      ticketAmountCents: amountCents,
      // After the ticket percent, exactly as the checkout weighs it (`checkoutCommand` below).
      grossCents: cartTotal(this.chargedLines, percent),
      linePercents: [],
    });
    try {
      if (overCap) await erplora().command('sales.order.set_discount_over_limit', payload);
      else await erplora().command('sales.order.set_discount', payload);
      // sales#386: mirror what the server just did — the manager's door wrote the approval on the
      // check, the usual door wiped whatever approval was there before.
      this.ticketDiscountApproved = overCap;
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
  /** sales#113 — aplica un importe FIJO (céntimos; 0 = quitar) al ticket, persistiéndolo en el pedido. */
  async applyDiscountAmount(cents: number): Promise<void> {
    const sheet = this.discountSheet;
    this.discountSheet = undefined;
    if (!sheet || sheet.target !== 'ticket') return;
    const value = Math.max(0, Math.round(cents));
    // sales#284: nothing persisted yet — paint locally, like before there was an order to send to.
    if (!this.orderId) { this.ticketDiscountAmount = value; return; }
    if (await this.persistTicketDiscount(this.ticketDiscount, value)) this.ticketDiscountAmount = value;
  }
  private get discountInputPct(): number { return Math.min(100, Math.max(0, Number(this.discountInput || '0'))); }
  /** Aplica el % tecleado (0 = quitar) a la línea o al ticket, persistiéndolo en el pedido. */
  async applyDiscount(pct: number): Promise<void> {
    const sheet = this.discountSheet;
    this.discountSheet = undefined;
    if (!sheet) return;
    const value = Math.min(100, Math.max(0, pct));
    if (sheet.target === 'ticket') {
      // sales#284: nothing persisted yet — paint locally, like before there was an order to send to.
      if (!this.orderId) { this.ticketDiscount = value; return; }
      if (await this.persistTicketDiscount(value, this.ticketDiscountAmount)) this.ticketDiscount = value;
      return;
    }
    const line = this.cart.find((l) => l.line_id === sheet.lineId);
    if (!line) return;
    const discount = value > 0 ? value : undefined;
    // sales#385: nothing to route through — no order yet, or the line is not backed by a real row
    // (still local). Paint it directly, like before there was an order to send to.
    if (!this.orderId || !line.line_id) {
      this.cart = this.cart.map((l) => (l === line ? { ...l, discount } : l));
      return;
    }
    // sales#385 — a LINE discount above the shop's cap is authorised when it is APPLIED, exactly
    // like the ticket one (sales#284): 0 always goes through the usual door (removing a discount
    // needs nobody's permission), and 100 = no cap never routes over it. Keep the line's old
    // discount/approval until the server says yes.
    const overCap = value > discountCap(this.settings);
    try {
      await updateOrderLineDiscount(erplora(), this.orderId, { ...line, discount }, value, overCap);
      this.cart = this.cart.map((l) => (l === line ? { ...l, discount, discountApproved: overCap ? true : undefined } : l));
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
  // The pinpad types the MAJOR unit («20» = 20 €); the sale contract is MINOR units (ADR-0007/0123),
  // like `total`, in the hub scale: «2000» in yen is 2000, not 200000 (sales#379).
  private get tenderedNum() { return typedToMinor(this.tendered); }
  private get change() { return Math.max(0, this.tenderedNum - this.payable); }
  /** sales#24 — cash typed in but SHORT of the payable. The server refuses the same case
   *  (`sales.insufficient_tendered`), this just spares the trip. Nothing typed is `tenderedMissing`. */
  private get tenderedShort(): boolean {
    // Repartiendo, «lo tecleado» es el importe de UNA pata, no el de la cuenta: quedarse corto es
    // lo normal (para eso hay más patas) y lo que bloquea es el RESTANTE, no esto.
    if (this.splitting) return false;
    return needsTendered(this.payMethod) && this.tenderedNum > 0 && this.tenderedNum < this.payable;
  }

  /** sales#309 — CASH selected and nothing typed. It used to mean «exact amount» (sales#24) and the
   *  ticket printed the change of cash nobody had counted; Ioan (2026-09-13): the charge does not go
   *  on until the tendered amount is typed. Only a real cash method (a method that gives change) with
   *  something to pay and no split under way: card, Bizum and legs already taken are untouched. */
  private get tenderedMissing(): boolean {
    if (this.splitting || this.tenders.length > 0) return false;
    return !!this.payMethod && needsTendered(this.payMethod) && this.payable > 0 && this.tenderedNum === 0;
  }

  // ── sales#159 · pagar UNA venta de N formas (ADR-0386) ─────────────────────────────────────
  /** Lo que queda por cubrir, en céntimos. Sin patas es la cuenta entera. */
  private get remaining(): number { return remainingCents(this.payable, this.tenders); }

  /** La pata que se tomaría AHORA con lo elegido y lo tecleado. `undefined` = no hay nada que añadir. */
  private get pendingTender(): { amount: number; tendered: number } | undefined {
    return planTender(this.payMethod, this.tenderedNum, this.remaining);
  }

  /** El cambio del reparto: sale del EFECTIVO y nunca se prorratea (ADR-0386, decisión 2). Incluye
   *  la pata pendiente para que el cajero vea lo que va a devolver ANTES de tomarla. */
  private get splitChange(): number {
    const pending = this.pendingTender;
    const legs = pending && this.payMethod
      ? [...this.tenders, { id: 'pending', method: this.payMethod, ...pending }]
      : this.tenders;
    return changeDue(legs);
  }

  /** Empieza a repartir. No toma ninguna pata: abre la pantalla que las toma. */
  private startSplit(): void {
    if (this.payable <= 0) return;
    this.splitting = true;
    this.error = '';
  }

  /** Toma la pata que hay compuesta (método + importe tecleado) y deja el resto por cubrir.
   *  Sin importe tecleado la pata cubre TODO el restante: es lo que hace que la última sea un solo
   *  toque, y lo que evita el atasco de Shopify con 3+ medios. */
  addTender(): void {
    const plan = this.pendingTender;
    if (!plan || !this.payMethod) return;
    this.tenders = [...this.tenders, { id: `tender-${this.tenderSeq += 1}`, method: this.payMethod, ...plan }];
    this.tendered = '';
    this.padPrimed = false;
    this.error = '';
  }
  private tenderSeq = 0;

  /** Quita una pata: su importe vuelve al restante. */
  removeTender(id: string): void {
    this.tenders = this.tenders.filter((t) => t.id !== id);
    this.error = '';
  }

  /** Edita una pata: vuelve al teclado con su importe y su método, para volver a tomarla. Es la
   *  edición más honesta en una pantalla táctil — un campo de texto dentro de una lista de filas se
   *  falla con el dedo, y aquí ya hay un teclado grande al que devolverla. */
  editTender(id: string): void {
    const leg = this.tenders.find((t) => t.id === id);
    if (!leg) return;
    this.tenders = this.tenders.filter((t) => t.id !== id);
    this.payMethod = leg.method as PayMethod;
    this.tendered = minorToTyped(leg.tendered);
    this.padPrimed = true;
    this.error = '';
  }

  /** The name of the missing app, as the business sees it in the marketplace.
   *
   *  It is translated (`ui.appTaxes`) because the id (`taxes`) is a technical key and the notice is
   *  read by a cashier, not by an integrator. With no translation for an id we do not know it
   *  falls back to the id: saying `taxes` is ugly, but it is true — inventing a name would not
   *  be. */
  private get chargeAppName(): string {
    return this.missingChargeApp ? this.appName(this.missingChargeApp) : '';
  }

  /** The same translation for any app id the till has to name (sales#25). */
  private appName(id: string): string {
    const key = `ui.app${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    const name = t(key);
    return name === key ? id : name;
  }

  /** POR QUÉ no se puede cobrar todavía, en palabras. `undefined` = se puede.
   *
   *  🔴 Esto NO se resuelve con el `disabled` nativo de Ionic. `disabled` es `pointer-events:none`:
   *  en una pantalla táctil el toque no llega a nada, no corre ningún handler, no se registra nada,
   *  y el motivo se queda en `title` — que necesita un hover que una tablet de mostrador no produce
   *  jamás. Es el bug de sales#58 y no vuelve por el botón más importante de la pantalla. */
  private get chargeBlock(): { short: string; reason: string } | undefined {
    // sales#185 — first, because it is the only one with no fix on this screen: with no tax app
    // the runtime aborts `complete_sale` over its required read, so no amount and no customer will
    // help. It goes before the rest so that the written reason is THAT one.
    if (this.missingChargeApp) {
      return {
        short: t('ui.missingAppChargeShort', { app: this.chargeAppName }),
        reason: t('ui.missingAppCharge', { app: this.chargeAppName }),
      };
    }
    // hub#1935 — no fix on this screen either: the road to the tax authority is set up in the
    // fiscal settings, and the notice above sends the owner there.
    if (this.fiscalRoad.blocked) {
      return { short: t('ui.fiscalRoadShort'), reason: t(fiscalRoadKey(this.fiscalRoad.blocked)) };
    }
    // sales#222 — the customer can also go away WITH the sheet open (the picker clears it), and
    // `confirm` is reachable by shortcut without ever crossing `openPay`. A guard that only lives
    // in the entry door is a guard the first other path walks around.
    if (this.missingRequiredCustomer) {
      return { short: t('ui.customerRequiredShort'), reason: t('ui.customerRequiredCharge') };
    }
    if (this.chargeBlocked) {
      // El motivo largo ya está escrito arriba, en el panel de captura del cliente.
      return { short: t('ui.limitChargeBlocked'), reason: '' };
    }
    const split = chargeBlock(this.payable, this.tenders);
    if (split) {
      const amount = this.money(split.remaining);
      return { short: t('ui.tenderRemainingShort', { amount }), reason: t('ui.tenderRemainingBlock', { amount }) };
    }
    // sales#309 — no `short`: the button keeps saying «Charge 121,00 €» (sales#164, the cashier always
    // sees what will be charged) and the missing step is written right above it and said on tap.
    if (this.tenderedMissing) return { short: '', reason: t('ui.tenderedMissing') };
    if (this.tenderedShort) return { short: t('ui.tenderedShort'), reason: t('ui.tenderedShort') };
    return undefined;
  }
  /** Las líneas que entran en ESTE cobro: la selección si la hay, o la cuenta entera (ADR-0146). */
  private get billedLines(): CartLine[] {
    return this.splitSel.size
      ? this.cart.filter((l) => l.line_id && this.splitSel.has(l.line_id))
      : this.cart;
  }

  /** De esas, las que todavía se cobran en DINERO: un tender externo pudo cubrir alguna entera
   *  (sales#162). Es la lista que decide el importe en pantalla y la que el servidor recalcula. */
  private get chargedLines(): CartLine[] {
    return uncoveredLines(this.billedLines, new Set(this.covered.keys()));
  }

  /** Líneas del cobro a las que se les puede OFRECER un tender externo por línea. Vacío cuando
   *  nadie hospeda el slot, cuando no hay cliente asignado (sin cliente no hay bono que ofrecer) o
   *  cuando el pedido aún no existe: `checkout_ref` es lo que deja liquidar el canje por evento. */
  private get tenderLines(): CartLine[] {
    if (!this.tenderFillers.length || !this.customerId || !this.orderId) return [];
    return tenderableLines(this.billedLines);
  }

  /** What is being charged NOW: the selection when there is one, or the whole check (ADR-0146).
   *
   *  🔴 sales#164 — THE SERVER RULES. This number decides the legs of a mixed payment, the change,
   *  the simplified-invoice ceiling and what the button promises, so it has to be the same one
   *  `complete_sale` is going to charge: with prices that do NOT carry the VAT inside, the screen's
   *  arithmetic showed the BASE and the drawer took base + quota (100.00 € → 121.00 €); and with a
   *  fixed-amount discount, a quantity by weight or a goods set menu split across rates the two
   *  drifted by a cent, which is exactly what fires `sales.payments_do_not_match_total`.
   *
   *  With no authoritative answer it falls back to the screen's own preview — what there was
   *  before, which charges the normal case right — and the server's refusal goes back to being a
   *  net, which is its place. */
  private get payable() {
    if (this.authoritative) return this.authoritative.total;
    return this.screenPayable;
  }

  /** What THIS screen works out on its own. Only used while there is no answer from the server,
   *  and it is what the till always used before sales#164. */
  private get screenPayable() {
    // sales#113: el importe fijo se resta del cobro entero (con split, el servidor lo reparte
    // igualmente sobre las líneas que se cobran; el preview resta lo que corresponda a lo cobrado).
    // sales#162: lo que un tender externo cubrió no se cobra dos veces.
    const base = cartTotal(this.chargedLines, this.ticketDiscount);
    return Math.max(0, base - (this.splitSel.size ? 0 : this.ticketDiscountAmount));
  }

  /** The ticket to price: EXACTLY the one that will be charged (`billedLines`, with the lines an
   *  external tender covered flagged so the server prices them at 0). */
  private get checkoutShape(): CheckoutShape {
    return {
      lines: this.billedLines,
      ticketDiscount: this.ticketDiscount,
      ticketDiscountAmount: this.ticketDiscountAmount,
      covered: new Set(this.covered.keys()),
      taxIncluded: this.settings.default_tax_included !== 0,
      partial: this.splitSel.size > 0,
    };
  }

  /** Asks the hub to price the ticket, if needed. Cheap to call on every repaint: it only goes to
   *  the network when something that MOVES the total changes (`previewSignature`).
   *
   *  It is only asked with the charge or the bill on screen: the valuation reads the whole sale
   *  catalogue, and doing it on every tap of the grid would put the till behind the network while
   *  nobody is looking at the number yet. */
  private async refreshValuation(): Promise<void> {
    const shape = this.checkoutShape;
    const signature = previewSignature(shape);
    if (signature === this.valuedSignature) return;
    this.valuedSignature = signature;
    const seq = ++this.valuationSeq;
    try {
      const valued = await fetchCheckoutPreview(erplora(), shape, {
        primaryCategory: (id) => this.primaryCategory(id),
        orderId: this.orderId,
      });
      // An older answer never overwrites a newer one: the cashier changes the ticket faster than
      // the network answers.
      if (seq !== this.valuationSeq) return;
      this.authoritative = valued;
    } catch {
      // The preview is NOT the charge: it failing does not block the till. It falls back to the
      // screen's arithmetic and the server is still the last word when charging.
      if (seq !== this.valuationSeq) return;
      this.authoritative = undefined;
    }
  }

  /** Forgets the valuation: the ticket left the screen, or it has just been charged. */
  private dropValuation(): void {
    this.valuationSeq += 1;
    this.valuedSignature = '';
    this.authoritative = undefined;
  }

  // ── Precio libre / venta por DEPARTAMENTO (fuera de catálogo) ──────────────────────────────
  /** Abre la pregunta del importe. Sin argumentos es la tecla suelta «Precio libre» (en blanco);
   *  con ellos viene de un SERVICIO de precio no cerrado y arranca sugerido (services#12).
   *  `0` no se sugiere: un «desde 0 €» no es una pista, es ruido en la casilla. */
  private openOpenPrice(seed?: { amountCents?: number; deptKey?: string; name?: string }) {
    const cents = seed?.amountCents ?? 0;
    this.openServiceName = seed?.name?.trim() ?? '';
    this.openAmount = cents > 0 ? minorToTyped(cents) : '';
    this.openDept = this.seededDeptKey(seed?.deptKey);
    this.openPriceOpen = true;
  }

  /** Traduce la CATEGORÍA FISCAL con la que llega un servicio (services#12) a la clave del botón.
   *
   *  Sin departamentos propios las dos son la misma cosa y esto no hace nada. Con ellos, `openDept`
   *  guarda el **id del departamento**, así que sembrarlo con la categoría dejaba la hoja con un
   *  valor que no casaba con ningún botón: el añadir salía habilitado y `addOpenPrice` se iba en
   *  silencio, sin línea y sin error. Ni línea ni aviso es justo lo que `addProduct` evita tres
   *  líneas más arriba de donde nace esta semilla.
   *
   *  Si NINGÚN departamento cobra esa categoría se devuelve vacío a propósito: preseleccionar «el
   *  primero» cobraría un IVA que no eligió nadie, que es peor que pedirle al cajero que elija. */
  private seededDeptKey(taxCategoryKey?: string): string {
    if (!taxCategoryKey) return '';
    const depts = this.departments;
    const match = depts.find((d) => d.taxCategoryKey === taxCategoryKey);
    return match ? match.key : '';
  }
  private tapOpen(k: string) { this.openAmount = pushTypedKey(this.openAmount, k); }
  /** The numpad types the major unit; the contract is minor units in the hub scale, as at checkout. */
  private get openAmountCents() { return typedToMinor(this.openAmount); }
  /** Lo que la hoja de precio libre ofrece: los departamentos del negocio, o las categorías
   *  fiscales activas mientras no haya definido ninguno (sales#267). */
  private get departments(): PosDepartment[] {
    return toDepartments(this.ownDepartments, this.taxCategories);
  }
  /** El departamento elegido, ya resuelto. `undefined` = lo que hay en `openDept` no existe, y
   *  entonces no hay venta que añadir: lo miran la guarda del botón y `addOpenPrice`, para que la
   *  respuesta sea la misma se llegue por el dedo o por un atajo. */
  private get resolvedDept(): PosDepartment | undefined {
    return this.departments.find((d) => d.key === this.openDept);
  }
  /** El % del departamento para pintarlo junto a su nombre; vacío si taxes no dio reglas (preview).
   *  Se pregunta por la CATEGORÍA FISCAL, no por la clave del botón: dos departamentos del negocio
   *  pueden compartirla. */
  private deptRateLabel(taxCategoryKey: string): string {
    // sales#74 cambió `ratesMap` suelto por el catálogo con su mapa dentro; el preview es el mismo.
    const rates = this.taxCatalog.rates;
    return rates.has(taxCategoryKey) ? `${rates.get(taxCategoryKey)}%` : '';
  }
  /** Añade la venta libre: nombre = el del SERVICIO que abrió la hoja (sales#319) o, con la tecla
   *  suelta, el del DEPARTAMENTO (estilo frutería, sin teclear); precio
   *  tecleado y su categoría fiscal. Nunca fusiona → siempre línea nueva (`pushNewLine`, serializada
   *  por `queue` como el resto del carrito). `buildOpenPriceLine` valida que no sea línea desnuda.
   *  sales#120: el nombre congelado es el del idioma del HUB (`display_name`, taxes#38) — es el que
   *  persiste como `product_name` y el que el cliente se lleva en el tique impreso; la IDENTIDAD
   *  fiscal sigue siendo `key`. */
  private async addOpenPrice(): Promise<void> {
    const dept = this.resolvedDept;
    if (!dept || this.openAmountCents <= 0) return;
    const line = buildOpenPriceLine({ name: this.openServiceName || dept.name, priceCents: this.openAmountCents, taxCategoryKey: dept.taxCategoryKey });
    line.tax_rate = resolveLineTax(this.taxCatalog.rates, dept.taxCategoryKey); // % SOLO para el preview del total
    // sales#273: el importe lo teclea el cajero, pero el trabajo lo hizo alguien. Un color a medida
    // es la mitad de la caja de una peluquería, así que si esta puerta no sella el profesional el
    // cierre por profesional se queda sin justo lo que más vale.
    if (this.staffId) line.staff_id = this.staffId;
    this.openPriceOpen = false;
    try {
      await this.queue(() => this.pushOpenPriceLine(line));
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Closes the sale. PRINTING is not fired from here: the shell prints on `sale.completed`.
   *  What this sends is the INTENT (`print_receipt`, sales#283): the «Print receipt» switch as the
   *  cashier left it, which the shell obeys over its `auto_print_on_sale` setting. */
  private async confirm() {
    // hub#297 + sales#317 — the LAST door before a number of the chain is spent: above the ceiling
    // a ticket is not allowed, and an invoice needs its recipient at any amount. The sheet already
    // blocks the button, but this is no decorative duplicate: `confirm` is also reached by
    // shortcut, without `openPay`, and a guard that only lives in a button is skipped by the first
    // path that does not paint that button.
    //
    // It stops BEFORE `busy = true`: nothing is in flight, there is only a question to ask. And it
    // is NOT an error — the charge did not fail, it is missing data —, so nothing goes into
    // `this.error`: the recipient capture in the sheet already says what is missing and why.
    if (this.chargeBlocked) {
      this.docFormat = 'invoice';
      this.paySideOpen = true;
      this.paying = true;
      return;
    }
    // sales#159 — el toque en un cobro bloqueado tiene que CONTESTAR. El botón está `aria-disabled`
    // (nunca `disabled`, que se tragaría el toque), así que el handler llega hasta aquí y aquí es
    // donde se le dice al cajero, con un importe, qué le falta. Se para ANTES de `busy`: no hay
    // nada en vuelo, solo una venta que todavía no está cubierta.
    const block = this.chargeBlock;
    if (block) {
      this.paying = true;
      // El motivo YA está escrito en la pantalla (`.pay-block-reason`), así que repetirlo en el
      // hueco del error sería decir dos veces lo mismo en dos colores. Lo que falta cuando el dedo
      // llega al botón es el ACUSE: el aviso del shell, encima del nuestro y nunca en su lugar —
      // el mismo reparto que sales#58 dejó para la baldosa bloqueada.
      this.notifyShell(block.reason || block.short);
      return;
    }
    // El aviso de duda muere al reintentar: si este intento vuelve a fallar, se decide de nuevo con
    // la evidencia de AHORA (hub#923).
    this.busy = true; this.error = ''; this.checkoutUnknown = false;
    // Declarados FUERA del try: el `catch` los necesita para preguntar por la venta (hub#923). La
    // clave se fija aquí — si el intento viene por atajo, sin pasar por `openPay`, se estrena una.
    if (!this.checkoutKey) this.checkoutKey = newIdempotencyKey();
    const checkoutKey = this.checkoutKey;
    const split = splitPayload(this.cart, this.splitSel);
    try {
      // ADR-0069: la AUTORIDAD del IVA es el servidor. Cada línea manda su `tax_category_key`
      // (referencia fiscal del producto) y el handler resuelve `rate_pct` desde el catálogo de
      // confianza (`taxes.rates.list` pre-cargado vía `reads`), expandiendo grupos. Mantenemos
      // `tax_rate` (% resuelto en cliente) SOLO como pista/preview; el handler lo ignora si puede
      // resolver el id (fallback al % solo si no hay catálogo o el id no existe — backward-compat).
      // category_id por línea (aditivo, QA 2026-06-25): el KDS enruta cada comanda a su estación
      // por la categoría del producto. Se toma la categoría PRIMARIA (primera) del producto desde
      // `prodCats` (Map product_id → Set category_id). null si el producto no está clasificado.
      // ADR-0146 — «cada uno paga lo suyo»: si hay líneas marcadas, este cobro cubre SOLO esas y el
      // pedido sigue abierto para los demás. Marcarlas todas equivale a cobrar la cuenta entera.
      const cobradas = this.billedLines;
      // `quantity` viaja en punto fijo 10⁶ y la línea lleva su contexto de unidades congelado
      // (ADR-0147): el servidor valida la rejilla y calcula el importe por el SDK (KPEIN).
      // 🔴 sales#148: y sus SUPLEMENTOS. Sin ellos el servidor no tiene nada que valorar
      // (`authoritative_modifiers` devuelve delta 0 y snapshot vacío), así que la hamburguesa con
      // queso se cobraba a precio de hamburguesa —la línea del carrito lleva el precio BASE, el
      // delta lo pone el catálogo al cobrar— y `sales_sale_item.modifiers` se congelaba VACÍO, de
      // modo que el tique no podía nombrarlos por mucho que el papel supiera leerlos. Va SOLO el
      // `option_id`: un `price_delta` del navegador sería un descuento que se hace el cliente solo.
      // 🔴 sales#175: and THE ID OF ITS ROW in the open check (`order_item_id`). This is what makes
      // the table pay the price it had WHEN IT ORDERED: with it, the server honours the
      // `unit_price` the row froze instead of re-pricing against the catalogue, so raising the
      // burger mid-afternoon no longer moves the checks that are already open. It is conditional
      // because a COUNTER sale has no previous row — there is no "when it was ordered" apart from
      // the payment — and there the catalogue still rules. It is not a price door: the amount comes
      // from the row the SERVER wrote, never from this payload's `price` (sales#68).
      // 🔴 sales#146: y su `is_service`. El carrito ya lo lleva y el PEDIDO ya lo mandaba, pero el
      // cobro se armaba en este `map()` aparte y aquí el campo no estaba: el handler tomaba la
      // línea del servicio por una línea de catálogo (`is_catalog_line`), no encontraba su id en
      // `inventory` y rechazaba la VENTA ENTERA con `sales.product_not_available`. Una peluquería
      // no podía cobrar un corte. Va condicional a propósito: marcarlo en una línea de catálogo le
      // saltaría la autoridad de precio y stock que el servidor sí tiene que aplicarle.
      // 🔴 sales#164 — THE VERY SAME BUILDER THE PREVIEW USES (`lib/checkout-preview.ts`). It used
      // to be written out by hand here, and a preview that priced a ticket slightly different from
      // the one being charged would be worse than no preview: the mismatch would come back in
      // through the door next to it.
      const items = checkoutItems(cobradas, {
        covered: new Set(this.covered.keys()),
        primaryCategory: (id) => this.primaryCategory(id),
      });
      // 🔴 sales#269 — WHICH DOOR the charge goes through. Above the discount the shop lets whoever
      // is charging give alone (`max_discount_percent`, 100 = no cap), the checkout is
      // `sales.complete_sale_over_limit`: the same operation behind `sales.discount.over_limit`, a
      // permission only a `manager` holds. A cashier reaching it is refused as `requires_elevation`
      // and the SHELL paints the PIN dialog on top (hub#363) — this module paints nothing, and on
      // approval the very same payload goes through.
      //
      // Routing here rather than letting the server refuse is the point: the cashier learns the
      // manager is needed while the customer is still deciding, not after pressing Charge. The
      // AUTHORITY is still the server's — `enforce_discount_cap` re-checks the cap from its own
      // `reads`, so a payload that never went through this screen is capped all the same.
      //
      // The gross is `chargedLines` (billed, minus what an external tender already covered, minus
      // gifts): the same set the server's fixed-amount cap weighs, so both round the same 30 cents.
      //
      // sales#386 — a ticket discount the manager already approved ON THE CHECK goes through the
      // usual door instead: `ticketDiscountApproved` only records that the manager's door accepted
      // it once, not that it is safe forever, so it is passed as the approval to weigh, not trusted
      // outright. The SERVER honours the approval it stored on the order, never this payload, and
      // refuses anything charged above it — this only spares the manager a second PIN for the same
      // number they already signed off.
      //
      // sales#385 — the same per-line, one level down: a line's own `discountApproved` means a
      // manager already signed THAT discount off on the open check, so it is judged as 0 here too.
      // The SERVER honours the approval it stored on the row, never this flag — this only spares a
      // second PIN for a discount already authorised.
      const checkoutDiscounts = {
        ticketPercent: this.ticketDiscount,
        ticketAmountCents: this.ticketDiscountAmount > 0 && !split.line_ids ? this.ticketDiscountAmount : 0,
        grossCents: cartTotal(this.chargedLines, this.ticketDiscount),
        linePercents: cobradas.map((l) => (l.discountApproved ? 0 : (l.discount ?? 0))),
      };
      const ticketApproval = this.ticketDiscountApproved
        ? { percent: this.ticketDiscount, amountCents: this.ticketDiscountAmount }
        : null;
      const checkoutDoor = checkoutCommand(discountCap(this.settings), checkoutDiscounts, ticketApproval);
      const checkoutPayload = {
        items,
        // sales#71: descuento de TICKET (%); el servidor lo prorratea por línea antes del IVA.
        discount_percent: this.ticketDiscount,
        // sales#113: importe FIJO (céntimos), repartido por resto mayor en el servidor (ADR-0210).
        // Con split (cobro parcial) no se manda: se aplica al cerrar la cuenta entera.
        ...(this.ticketDiscountAmount > 0 && !split.line_ids ? { discount_amount: this.ticketDiscountAmount } : {}),
        // sales#403 — the figure the manager's PIN dialog shows (`approval_label`). Display only:
        // the handler ignores it, and it travels only on the manager's door.
        ...(checkoutDoor === CHECKOUT_OVER_LIMIT_COMMAND
          ? { approval_discount_percent: approvalDiscountPercent(checkoutDiscounts, ticketApproval) }
          : {}),
        // sales#20: el servidor no cierra una venta sin clave, y con la misma clave dos veces
        // registra UNA. Es lo que hace seguro reintentar cuando el wifi del local parpadea.
        idempotency_key: checkoutKey,
        line_ids: split.line_ids ?? null,
        keep_order_open: split.keep_order_open,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        // El nombre viaja al tiquet: el de fábrica va traducido (seed canónico EN → i18n).
        // sales#108: the CANONICAL name travels (the server persists the catalogue row's name anyway,
        // ADR-0085); the ticket and the list translate it when they paint it.
        payment_method_name: this.payMethod?.name ?? '',
        // Sin entregado tecleado (tarjeta, importe justo) se cobra el PAYABLE: con split, caer al
        // total inflaba lo entregado y el cambio del tiquet.
        // sales#24: viaja SOLO lo que la cajera TECLEA. Sin nada tecleado (o con tarjeta) es importe
        // exacto y lo decide el servidor: el `payable` de pantalla es un preview que puede quedar por
        // debajo del total real (IVA excluido, a peso, descuentos) y haría saltar `insufficient_tendered`.
        ...(needsTendered(this.payMethod) && this.tenderedNum > 0 ? { amount_tendered: this.tenderedNum } : {}),
        // sales#159 (ADR-0386) — PAGO MIXTO. Solo viaja cuando el cajero ha repartido de verdad: con
        // una sola forma de pago manda el camino escalar de arriba, que es lo que hace todo lo demás
        // que llama a `complete_sale` (y lo que el servidor ya sabe convertir en su fila única). Con
        // patas, `payments[]` MANDA y los escalares pasan a derivarse de la pata mayor.
        //
        // ⚠️ Las patas se construyen sobre el PAYABLE de pantalla, que es un preview: el total lo
        // fija el servidor (IVA excluido, cantidades a peso y descuentos redondean allí). Si no
        // cuadran al céntimo la venta se RECHAZA (`sales.payments_do_not_match_total`) — a propósito,
        // porque una venta cuyas patas no suman es un cajón que acaba el día con un número que nadie
        // sabe explicar. El rechazo se pinta con palabras y el reparto se queda en pantalla para
        // corregirlo (`ui.errorPaymentsMismatch`).
        ...(this.tenders.length ? { payments: buildPaymentsPayload(this.tenders) } : {}),
        channel: 'pos',
        source_module: 'pos',
        // ADR-0141: la venta nace de este PEDIDO. El servidor lo marca completado (open→completed)
        // en el cobro final; para split-bill se enviaría `keep_order_open: true`.
        order_id: this.orderId ?? null,
        // ADR-0077 (seam cerrado en sales#89) — ids OPACOS que `sales` reenvía sin interpretar.
        // `appointment_id` hace que el handler emita `sales.sale.created_from_appointment`, con el
        // que `appointments` marca la cita cobrada en SU listener; `staff_id` atribuye la venta a
        // la profesional que atendió (≠ `employee_id`, que es la persona que cobra).
        appointment_id: this.appointmentId ?? null,
        staff_id: this.staffId ?? null,
        customer_id: this.customerId ?? null,
        customer_name: this.customerName,
        // Snapshot fiscal del cliente (ADR-0132): sin esto la factura emitida desde el TPV sale sin
        // NIF ni dirección aunque el cliente los tenga en su ficha.
        customer_tax_id: this.customerTaxId,
        customer_address: this.customerAddress,
        // sales#332: a customer from abroad is declared by country + kind of document (IDOtro).
        ...recipientCountryPayload(this.customerCountry, this.customerIdType),
        // Tipo de documento fiscal (ADR-0140): viaja ATÓMICAMENTE con la venta; `invoice` lo lee del
        // evento para elegir F1 (completa) vs F2 (simplificada). Reemplaza al `set_document_type` retro.
        document_type: this.docFormat,
        // sales#283 — print THIS sale's receipt or not. Omitted when nobody decided (switch
        // untouched and no `printing` setting read): the shell then decides as it always did.
        ...(this.printReceipt === undefined ? {} : { print_receipt: this.printReceipt }),
      };
      // 🔴 The two doors are named LITERALLY, and the same payload goes through either. Calling
      // `command(checkoutDoor, …)` reads better and is wrong: `.erplora/contracts.json` is
      // extracted STATICALLY, so a command reached through a variable vanishes from it — and with
      // it the check that this module's screen still has a door to charge through.
      if (checkoutDoor === CHECKOUT_OVER_LIMIT_COMMAND) {
        await erplora().command('sales.complete_sale_over_limit', checkoutPayload);
      } else {
        await erplora().command('sales.complete_sale', checkoutPayload);
      }
      // complete_sale (WASM) no devuelve el id de la venta creada, así que la re-consultamos POR SU
      // CLAVE de idempotencia (sales#20). Antes se pedía «la última venta» (`sales.list` limit 1),
      // que con dos cajas cobrando a la vez devolvía la del compañero — y en un reintento devolvía
      // una venta que no era esta. El tipo ya quedó fijado dentro de complete_sale (ADR-0140).
      const recorded = rows<{ id: string }>(await erplora().query('sales.by_idempotency_key', { idempotency_key: checkoutKey }));
      const saleId = recorded[0]?.id;
      await this.finishSale(saleId, split);
    } catch (e) {
      await this.handleCheckoutFailure(e, checkoutKey, split);
    } finally {
      this.busy = false;
    }
  }

  /** Cierra la venta EN PANTALLA: limpia la comanda, suelta mesa y cliente, abre el documento.
   *
   *  Vive aparte porque hay DOS caminos que llegan aquí (hub#923): el cobro que responde, y el que
   *  perdió la respuesta pero cuya venta aparece luego por su clave de idempotencia. Duplicar este
   *  cierre era garantizar que un día divergieran. */
  private async finishSale(saleId: string | undefined, split: { keep_order_open?: boolean }) {
      // El intento terminó: la próxima venta estrena clave.
      this.checkoutKey = '';
      this.error = '';
      // Cobrada: limpia la comanda de ESA mesa (o el carrito suelto) antes de soltarla, si no la
      // comanda seguiría recuperándose al volver a tocar la mesa. La sesión la cierra el filler
      // al recibir el reset de abajo.
      if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
      this.paying = false;
      this.splitSel = new Set();
      // sales#164: the valuation was for THIS ticket. Carrying it over would charge the next sale
      // with the previous one's total.
      this.dropValuation();

      // COBRO PARCIAL (ADR-0146): el pedido sigue abierto y en pantalla queda lo que falta por
      // pagar. Las líneas cobradas ya no vuelven —la query solo devuelve lo pendiente—, así que no
      // se pueden cobrar dos veces. La mesa tampoco se suelta: los demás siguen sentados.
      if (split.keep_order_open && this.orderId) {
        this.cart = await loadOrderLines(erplora(), this.orderId);
        if (saleId) this.docSaleId = saleId;
        return;
      }

      // Cobro de la cuenta entera: se limpia y se sueltan mesa y cliente.
      this.cart = [];
      // El pedido quedó `completed` en el servidor dentro de la misma transacción de la venta: se
      // suelta para que el siguiente ticket abra uno nuevo (ADR-0141).
      forgetCurrentCheck(localStorage);
      this.orderId = undefined;
      this.orderLabel = '';
      this.orderView = 'account';
      this.tableId = undefined; this.tableLabel = '';
      this.customerId = undefined; this.customerName = '';
      this.customerTaxId = ''; this.customerAddress = '';
      this.setCustomerCountry(HOME_COUNTRY);
      // sales#179: the next check does not inherit the previous waiter — it goes back to the
      // default (whoever holds the session), which is what a till does when a check closes.
      this.staffId = undefined; this.staffName = '';
      this.appointmentId = undefined;
      this.resetSlotContexts();
      if (saleId) this.docSaleId = saleId;
      // NOTA (impresión): aquí NO se llama a window.print(). El tiquet lo imprime el SHELL por el
      // BRIDGE (ESC/POS, rol `receipt`) escuchando `sale.completed` con el ajuste `auto_print_on_sale`
      // — ya existía (apps/web/src/lib/print-on-sale.ts) y el runtime no toca hardware (§2.7).
      // Abrir el diálogo del navegador por nuestra cuenta duplicaba ese camino y se lo comía.
      // El diálogo del navegador queda SOLO como respaldo manual, desde el botón del documento.
  }

  /** El cobro no terminó. Decide QUÉ se le dice al cajero — y esa decisión vale dinero.
   *
   *  hub#923 (saas#1460): con un fallo de TRANSPORTE no se sabe si la venta entró. En el incidente
   *  entró (200 en el servidor) y el proceso murió antes de que el cliente leyera la respuesta; la
   *  cajera vio la cadena cruda del motor, dedujo «no ha cobrado» y volvió a cobrar. Aquí se le
   *  pregunta al servidor por la CLAVE DE IDEMPOTENCIA, que es lo que convierte la duda en dato:
   *
   *    cobrada     → se cierra como si la respuesta hubiera llegado (el cliente ya pagó).
   *    no cobrada  → el servidor lo dice: reintentar es seguro (misma clave, nunca dos ventas).
   *    no se sabe  → se dice la verdad y se manda a Ventas. NUNCA «no se ha cobrado».
   *
   *  Un rechazo de DOMINIO (`sales.empty_sale`, …) no pasa por aquí: su frase lleva el código que
   *  el encargado necesita y se enseña tal cual. */
  private async handleCheckoutFailure(e: unknown, checkoutKey: string, split: { keep_order_open?: boolean }) {
    // OJO: `this.checkoutKey` NO se limpia en ninguna rama de fallo. Reintentar con la MISMA clave
    // es justo lo que impide que un timeout (la venta pudo entrar) acabe cobrando dos veces.
    if (transportErrorKey(e) !== SERVER_UNAVAILABLE_KEY) {
      // sales#185 — branch on the envelope's CODE, never on the sentence. Looking the code up
      // inside the message worked only while the message carried it: as soon as it is translated
      // (or the SDK replaces it, ADR-0400) the mapping stops matching IN SILENCE and the cashier
      // drops to the generic one with nothing to give it away. With no code — a browser failure,
      // not the hub's — the sentence is all there is.
      const code = errorCode(e);
      const key = checkoutErrorKey(code);
      const raw = e instanceof Error ? e.message : String(e ?? '');
      this.error = key === 'ui.errorCharge' && !code && raw ? raw : t(key);
      // hub#1935 — the road broke after the till opened. The refusal is the hub's authority, so the
      // block is taken from it and the next sale is not tried blind.
      if (isFiscalRoadRefusal(code)) this.fiscalRoad = { ...this.fiscalRoad, blocked: code };
      return;
    }

    const recovery = await recoverCheckout(
      async (key) => rows<{ id: string }>(await erplora().query('sales.by_idempotency_key', { idempotency_key: key })),
      checkoutKey,
      // Dos intentos: un hub tumbado por OOM vuelve en segundos, y preguntar de nuevo es lo que
      // convierte «no sé» en una respuesta la mayoría de las veces.
      { attempts: 2 },
    );

    if (recovery.outcome === 'charged') {
      // La venta SÍ entró. Cerrar en silencio es lo correcto: el cliente pagó y el tique existe.
      await this.finishSale(recovery.saleId, split);
      return;
    }
    // `not_charged`: el servidor habló y no hay venta → el aviso de siempre, reintento seguro.
    // `unknown`: no se pudo preguntar → la duda explícita, con la salida a Ventas al lado.
    this.checkoutUnknown = recovery.outcome === 'unknown';
    this.error = t(this.checkoutUnknown ? 'ui.checkoutUnknown' : SERVER_UNAVAILABLE_KEY);
  }

  /** La salida del cobro dudoso (hub#923): ir a Ventas a comprobar si aquello se cobró.
   *
   *  Solo aparece cuando NO se pudo averiguar. Un Web Component no recibe el router, así que el
   *  canal módulo→shell es empujar la URL y avisar con `popstate` (mismo patrón que `appointments`
   *  al mandar una cita al TPV). */
  private renderCheckSalesLink() {
    if (!this.checkoutUnknown) return nothing;
    return html`<ion-button size="small" fill="outline" class="check-sales" data-testid="pos-check-sales"
      @click=${() => this.goToSales()}>
      <ion-icon slot="start" name="cart-outline"></ion-icon>${t('ui.checkSales')}
    </ion-button>`;
  }

  private goToSales() {
    this.navigateTo('/m/sales/sales');
  }

  /** Module → shell navigation: push the URL and tell the router with `popstate` (a Web Component
   *  does not get the router — same pattern as `appointments` sending a booking to the till). */
  private navigateTo(path: string) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  /** sales#149 — how many catalogue lines CANNOT be charged, over the WHOLE catalogue.
   *
   *  Over `products`, not over `filtered`: the sentence is about the business ("the catalogue still
   *  has VAT to set up"), not about the open tab. Counting what is filtered would make the very same
   *  problem report a different number in every category, and zero in the first one that was fine. */
  private get blockedCount(): number {
    return this.products.reduce((n, p) => (this.blockedReason(p) ? n + 1 : n), 0);
  }

  /** Can THIS session do anything about the notice? A filter, not a wall (same criterion as the
   *  shell's `canOpenManagement`): the real authority is the runtime, this only decides what is
   *  painted.
   *
   *  `inventory.change_product` is the permission that opens the form where the fiscal category is
   *  assigned (`erp-inventory-products` requires it to edit), and `manager`/`admin` carry it — which
   *  is exactly the MANAGER this notice is addressed to; a cashier cannot fix it.
   *
   *  A shell that does NOT expose the permission channel (preview, older shell) is not saying "no":
   *  it is not answering. Failing closed there would silently remove the only place the business
   *  learns about this, and the notice costs a cashier nothing. */
  private canFixCatalog(): boolean {
    const c = erplora() as Partial<{ hasPermission(perm: string): boolean }>;
    if (typeof c.hasPermission !== 'function') return true;
    return c.hasPermission('inventory.change_product');
  }

  private goToProductSetup() {
    // `inventory` is a HARD `depends_on` of `sales`, so this route cannot point at a module that is
    // not installed. Same module→shell channel as `goToSales`.
    //
    // sales#248 / inventory#72 — it carries `?status=unconfigured`, so the manager lands on THE
    // ARTICLES THE COUNT WAS ABOUT and not on the whole catalogue with the status dropdown left for
    // him to remember. `erp-inventory-products` reads the parameter when it mounts and SEEDS its
    // list controller with it (`statusFilterFromSearch`), so the list arrives already narrowed
    // instead of loading whole and shrinking; the screen also says it is filtered, with its way out.
    // A value it does not know is ignored there and opens the normal list, so this cannot break the
    // route on an older `inventory`.
    window.history.pushState({}, '', '/m/inventory/products?status=unconfigured');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  /** The AGGREGATE notice, once and before the shift (sales#149).
   *
   *  Until now a half configured catalogue was only noticeable tile by tile, with the customer
   *  waiting: the cashier's half (sales#74/#58). This is the manager's — the count, and the door it
   *  is fixed through.
   *
   *  DISCREET on purpose: one line, not a modal and not an `alert`. A till that opens with a window
   *  on top is a till people learn to dismiss without reading, and the catalogue goes on selling
   *  whatever does have VAT. Odoo and WooCommerce hide the misconfigured article (the till works,
   *  the manager never finds out); Square and Toast paint it on the tile but do not warn ahead
   *  either. We no longer hide it (sales#74), so what was missing was the sum. */
  private renderCatalogHealth() {
    const n = this.blockedCount;
    if (!n || !this.canFixCatalog()) return nothing;
    return html`<div class="catalog-health" role="status" data-testid="pos-catalog-blocked-summary">
      <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
      <span class="ch-text">${n === 1 ? t('ui.catalogBlockedOne') : t('ui.catalogBlocked', { count: n })}</span>
      <ion-button size="small" fill="clear" class="ch-fix" data-testid="pos-catalog-blocked-fix"
        @click=${() => this.goToProductSetup()}>${t('ui.catalogBlockedFix')}</ion-button>
    </div>`;
  }

  /** The empty grid, WITH ITS REASON (sales#25).
   *
   *  `inventory` is an optional capability (ADR-0127): a hub without it sells services and
   *  free-price lines (ADR-0085) and that is a supported way to run a till — but it is the
   *  DEGRADED mode, not the normal one, and the market says so out loud. The Shopify POS community
   *  has been asking for variable prices per item since 2014 precisely because the free-price
   *  escape "works but you have to type the name every time and it reports nothing per item or
   *  category": the free line is not a substitute for a catalogue, so a till without one has to
   *  say what it is missing and how to get it, not just show a blank rectangle.
   *
   *  `role="status"`, never `alert`: nothing broke. A broken app is the notice above, and mixing
   *  the two is how an alert stops meaning anything. */
  private renderEmptyGrid() {
    if (!this.catalogAppAbsent) return this.servicesHidden ? this.renderServicesHidden() : html`<div class="empty">${t('ui.noProducts')}</div>`;
    return html`${this.servicesHidden ? this.renderServicesHidden() : nothing}<div class="empty catalog-absent" role="status" data-testid="pos-catalog-app-absent">
      ${t('ui.catalogAppAbsent', { app: this.appName('inventory') })}
    </div>`;
  }

  /** sales#409 — the services are not missing, they are HIDDEN by the till's own setting. Said
   *  where they would have been (the empty grid, the search with no results), the way Square says
   *  «hidden from POS» on the item. `role="status"`: nothing broke, the business asked for it — it
   *  may just not remember asking. The way back is offered only to whoever can change the setting
   *  (`sales.manage_settings`, the permission of the settings tab); a cashier gets the reason. */
  private renderServicesHidden() {
    return html`<div class="empty services-hidden" role="status" data-testid="pos-services-hidden">
      <span>${t('ui.servicesHidden')}</span>
      ${this.canManageTillSettings() ? html`<ion-button size="small" fill="clear" data-testid="pos-services-hidden-show"
        @click=${() => this.goToTillSettings()}>${t('ui.servicesHiddenShow')}</ion-button>` : nothing}
    </div>`;
  }

  /** Same filter as `canFixCatalog`: a shell without the permission channel is not saying "no". */
  private canManageTillSettings(): boolean {
    const c = erplora() as Partial<{ hasPermission(perm: string): boolean }>;
    if (typeof c.hasPermission !== 'function') return true;
    return c.hasPermission('sales.manage_settings');
  }

  private goToTillSettings() {
    // The settings tab the shell builds from this module's `settings` block (`/m/:moduleId/settings`),
    // where «Show services in the till» lives. Same module→shell channel as `goToProductSetup`.
    window.history.pushState({}, '', '/m/sales/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  /** The recipient capture: name, tax ID and address of whoever the invoice is made out to.
   *
   *  Two reasons bring it up, and each one says its own: `limit` — the sale reaches the simplified
   *  invoice ceiling, so it cannot be a ticket (hub#297); `invoice` — the cashier picked «Factura»,
   *  and an invoice made out to nobody is a «FACTURA · Cliente» on paper and an F2 at the AEAT
   *  (sales#317). Telling an 11,90 € sale «over 3.000 € the law requires…» would be a lie.
   *
   *  **In the SAME charge sheet**, not a modal on top: whoever fills it is facing the customer with
   *  the amount in view, and sending them to another screen is where these flows get abandoned. The
   *  three fields are always painted (never behind a button) because none is optional: without them
   *  there is no valid document to issue.
   *
   *  They come FILLED IN when a customer is assigned (`sales.pos.assign` → ADR-0132), so the usual
   *  case — a business customer already on file — is read and charge. */
  /** sales#332 — a new country resets the kind of document to the usual one there (none in Spain),
   *  unless the customer file already says which one (sales#336). */
  private setCustomerCountry(country: string, idType = defaultIdType(country)) {
    this.customerCountry = country;
    this.customerIdType = idType;
  }

  /** sales#332 — the recipient's country and, only abroad, what their number is. The country
   *  decides (Odoo `l10n_es_edi_verifactu`): a Spanish customer is never asked a document kind. */
  private renderRecipientCountry() {
    const lang = (erplora() as unknown as I18nClient).locale || 'en';
    return html`
        <ion-select label=${t('ui.limitFieldCountry')} label-placement="stacked" interface="popover"
                    data-testid="pos-limit-country" .value=${this.customerCountry}
                    @ionChange=${(e: CustomEvent<{ value?: string }>) => this.setCustomerCountry(String(e.detail?.value ?? HOME_COUNTRY))}>
          ${countryOptions(lang, t('ui.countryUnlisted')).map((o) => html`<ion-select-option value=${o.code}>${o.name}</ion-select-option>`)}
        </ion-select>
        ${this.customerCountry === HOME_COUNTRY
          ? nothing
          : html`<ion-select label=${t('ui.limitFieldIdType')} label-placement="stacked" interface="popover"
                    data-testid="pos-limit-id-type" .value=${this.customerIdType}
                    @ionChange=${(e: CustomEvent<{ value?: string }>) => { this.customerIdType = String(e.detail?.value ?? ''); }}>
              ${ID_TYPE_OPTIONS.map((c) => html`<ion-select-option value=${c}>${t(`ui.idType${c}`)}</ion-select-option>`)}
            </ion-select>`}`;
  }

  private renderRecipientCapture(reason: 'limit' | 'invoice') {
    const done = recipientIsComplete(this.limitState);
    const pending = reason === 'limit'
      ? { title: t('ui.limitBlockedTitle'), body: t('ui.limitBlockedBody', { max: this.money(this.simplifiedMaxCents ?? 0) }) }
      : { title: t('ui.invoiceRecipientTitle'), body: t('ui.invoiceRecipientBody') };
    const content = html`
        <div class="limit-head">
          <ion-icon name=${done ? 'document-text-outline' : 'alert-circle-outline'}></ion-icon>
          <div>
            <strong>${done ? t('ui.limitReadyTitle') : pending.title}</strong>
            <p>${done ? t('ui.limitReadyBody') : pending.body}</p>
          </div>
        </div>
        <ion-input label=${t('ui.limitFieldName')} label-placement="stacked" .value=${this.customerName}
                   data-testid="pos-limit-name" autocomplete="off"
                   @ionInput=${(e: CustomEvent) => { this.customerName = String((e.target as HTMLInputElement).value ?? ''); }}></ion-input>
        ${this.renderRecipientCountry()}
        <ion-input label=${t('ui.limitFieldTaxId')} label-placement="stacked" .value=${this.customerTaxId}
                   data-testid="pos-limit-tax-id" autocomplete="off"
                   @ionInput=${(e: CustomEvent) => { this.customerTaxId = String((e.target as HTMLInputElement).value ?? ''); }}></ion-input>
        <ion-input label=${t('ui.limitFieldAddress')} label-placement="stacked" .value=${this.customerAddress}
                   data-testid="pos-limit-address" autocomplete="off"
                   @ionInput=${(e: CustomEvent) => { this.customerAddress = String((e.target as HTMLInputElement).value ?? ''); }}></ion-input>`;
    // Two literal hooks, one per reason: the QA addresses each case by name, and the testid guard
    // (`ui/test/testids.test.ts`) only reads literal ones.
    return reason === 'limit'
      ? html`<div class="limit-capture" data-testid="pos-simplified-limit-capture" ?data-done=${done}>${content}</div>`
      : html`<div class="limit-capture" data-testid="pos-invoice-recipient-capture" ?data-done=${done}>${content}</div>`;
  }

  /** La REJILLA del catálogo: filtra por la categoría activa (la búsqueda por texto vive en el
   *  Spotlight, no empuja la rejilla). */
  private get filtered() {
    if (this.activeCat && this.prodCats.size) {
      return this.products.filter((p) => this.prodCats.get(p.id)?.has(this.activeCat));
    }
    return this.products;
  }

  /** Resultados del buscador SPOTLIGHT: `q` sobre TODO el catálogo (nombre o SKU), sin categoría. */
  private get searchResults() {
    const q = this.q.trim().toLowerCase();
    if (!q) return [];
    return this.products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }

  private renderCatBar() {
    const cell = (id: string, name: string, count: number) => html`
      <ion-segment-button data-testid=${`pos-category-${id || "all"}`} class="cat-segment-button" value=${id}>
        <ion-label class="cat-segment-label">
          <span class="cc-n">${name}</span><span class="cc-c">${count} ${t('ui.items')}</span>
        </ion-label>
      </ion-segment-button>`;
    return html`
      <div class="catbar">
        <ion-segment data-testid="pos-category-filter" class="category-segment" scrollable value=${this.activeCat}
          aria-label=${t('ui.categoryFilter')} @wheel=${this.onCategoryWheel}
          @ionChange=${(e: CustomEvent<{ value?: string }>) => { this.activeCat = e.detail.value ?? ''; }}>
          ${cell('', t('ui.all'), this.products.length)}
          ${this.categories.map((c) => cell(c.id, c.name, this.catCount(c.id)))}
        </ion-segment>
        <!-- Lupa: despliega el buscador (gana alto para la rejilla). Hueco natural para el micro
             de búsqueda por voz cuando llegue. -->
        <button data-testid="pos-search" class="arrow search-trigger" title=${t('ui.searchAction')} aria-pressed=${this.searchOpen}
          @click=${() => (this.renderRoot.querySelector('ok-spotlight-search') as { openSearch?: () => void } | null)?.openSearch?.()}>
          <ion-icon name="search-outline"></ion-icon>
        </button>
        ${this.renderMoreMenu()}
      </div>`;
  }

  /** Controles de chrome que el shell dice honrar en esta pestaña (`chrome="fullscreen …"`). */
  private get chromeControls(): string[] {
    return this.chrome.split(/\s+/).filter(Boolean);
  }

  /**
   * Menú ⋮ de la barra de categorías: lo que afecta a la PANTALLA, no a la venta.
   *
   * Va aquí y no en la barra del carrito porque en un móvil el carrito se cierra —y con él se
   * llevaría su cabecera—, mientras que la barra de categorías está en todos los tamaños. Es
   * también el único sitio que sigue en pie DENTRO del modo: la topbar del shell, que es donde
   * ADR-0048 puso este botón, se esconde ella misma al activarlo y se lleva la salida consigo.
   *
   * Hoy lleva un solo control; nace como menú a propósito, porque es la lista la que va a crecer.
   */
  private renderMoreMenu() {
    if (!this.chromeControls.length) return nothing;
    return html`
      <button data-testid="pos-more-menu" class="arrow more-trigger" title=${t('ui.screenMenu')} aria-label=${t('ui.screenMenu')}
        aria-haspopup="menu" aria-expanded=${this.moreOpen}
        @click=${() => { this.moreOpen = !this.moreOpen; }}>
        <ion-icon name="ellipsis-vertical-outline"></ion-icon>
      </button>
      ${this.moreOpen
        ? html`
          <!-- Capa de cierre: un menú que solo se cierra por su propio botón se queda abierto en
               cuanto el cajero toca cualquier otra cosa. Transparente y sin scrim visible: es un
               menú, no un diálogo que exija atención. -->
          <div data-testid="pos-more-scrim" class="more-scrim" @click=${() => { this.moreOpen = false; }}></div>
          <!-- <dialog> nativo como el resto de overlays del TPV: los de Ionic dentro de un shadow
               Lit se re-parentan al body y pierden el CSS (ADR-0028). NO modal a propósito —es un
               menú anclado al ⋮, no un diálogo—, así que la salida con Esc se cablea a mano. -->
          <dialog class="more-menu" open role="menu"
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this.moreOpen = false; }}>
            ${this.chromeControls.includes('fullscreen')
              ? html`
                <button data-testid="pos-more-fullscreen" type="button" role="menuitem" data-action="fullscreen"
                  @click=${() => this.requestChrome('fullscreen')}>
                  <ion-icon name=${this.fullscreen ? 'contract-outline' : 'expand-outline'}></ion-icon>
                  <span>${this.fullscreen ? t('ui.exitFullscreen') : t('ui.fullscreen')}</span>
                </button>`
              : nothing}
          </dialog>`
        : nothing}`;
  }

  /**
   * Pide al SHELL un control de chrome (ADR-0048: el módulo es contenido, el chrome es del shell).
   * `composed` para salir del shadow root y `bubbles` para llegar al host del módulo; sin las dos
   * la petición muere dentro del componente. Quien no la escuche, no la atiende —y por eso el ⋮ no
   * se pinta si el shell no anunció el control.
   */
  private requestChrome(control: string): void {
    this.moreOpen = false;
    this.dispatchEvent(new CustomEvent('erp:chrome-request', {
      detail: { control, action: 'toggle' },
      bubbles: true,
      composed: true,
    }));
  }

  private renderCart() {
    return html`
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <div class="order-toolbar">
            ${this.parkingEnabled
              ? html`<ion-button data-testid="pos-park" class="header-action icon-action park-action" fill="clear" ?disabled=${!this.cart.length}
                    title=${t('ui.parkCurrentSale')} aria-label=${t('ui.parkCurrentSale')}
                    @click=${() => void this.requestPark()}>
                  <ion-icon slot="icon-only" name="pause-circle-outline"></ion-icon>
                </ion-button>`
              : nothing}
            <!-- Cada módulo sigue siendo dueño de su botón y modal. Sales solo ofrece el hueco. -->
            <span class="cart-actions-slot"></span>
            <span class="actions-spacer"></span>
            <ion-button data-testid="pos-parked-toggle" class="header-action icon-action open-checks-action" fill="clear"
                        title=${t('ui.parkedTickets')} aria-label=${t('ui.parkedTickets')}
                        @click=${() => { this.parkedOpen = !this.parkedOpen; }}>
              <ion-icon slot="icon-only" name="receipt-outline"></ion-icon>
              ${this.parked.length ? html`<span class="badge-num">${this.parked.length}</span>` : nothing}
            </ion-button>
            <ion-button data-testid="pos-cart-close" class="header-action cart-close" fill="clear" title=${t('ui.closeAction')}
                        aria-label=${t('ui.closeAction')} @click=${() => { this.cartOpen = false; }}>
              <ion-icon name="chevron-forward-outline"></ion-icon><small>${t('ui.closeAction')}</small>
            </ion-button>
          </div>
        </ion-toolbar>

        <div class="order-heading">
          <div class="order-title-row">
            <input data-testid="pos-order-title" class="order-title" .value=${this.visibleOrderLabel}
                   placeholder=${t('ui.newCheckTitle')} aria-label=${t('ui.checkTitleLabel')}
                   @input=${(e: Event) => { this.orderLabel = (e.target as HTMLInputElement).value; }}
                   @change=${(e: Event) => void this.saveOrderLabel((e.target as HTMLInputElement).value)} />
            <button data-testid="pos-order-title-edit" class="title-edit" type="button" title=${t('ui.editCheckTitle')}
                    aria-label=${t('ui.editCheckTitle')} @click=${() => this.focusOrderTitle()}>
              <ion-icon name="create-outline"></ion-icon>
            </button>
          </div>
          <div class="order-context">
            <!-- Los módulos siguen siendo dueños de la asociación y del selector; sales solo
                 muestra las etiquetas opacas que recibe, iguales para Mesa y Cliente. Sus
                 botones permanecen libres arriba para asignar/cambiar cada contexto. -->
            ${this.tableLabel
              ? html`<ion-chip><ion-icon name="grid-outline"></ion-icon><ion-label>${this.tableLabel}</ion-label></ion-chip>`
              : nothing}
            ${this.customerName
              ? html`<ion-chip><ion-icon name="person-outline"></ion-icon><ion-label>${this.customerName}</ion-label></ion-chip>`
              : nothing}
            <!-- sales#179 — WHO IS SERVING. Always there, even with nobody chosen: if it is not
                 visible, nobody knows the sale is attributed at all, and the waiter cannot be
                 transferred. -->
            <button class="ctx-chip" type="button" data-testid="pos-staff-chip"
                    aria-label=${t('ui.staffPickerTitle')} title=${t('ui.staffPickerTitle')}
                    @click=${() => void this.openStaffPicker()}>
              <ion-icon name="person-circle-outline"></ion-icon>
              <span>${this.staffLabel}</span>
            </button>
            <!-- sales#222 — the shop demands a customer and there is none: it is said HERE, in the
                 slot the customer occupies, and the chip is the shortcut to fill it. A block whose
                 only sign is a toast is a block nobody can act on once the toast is gone. -->
            ${this.missingRequiredCustomer
              ? html`<button class="ctx-chip needs-customer" type="button" data-testid="pos-needs-customer"
                             title=${t('ui.customerRequiredCharge')} aria-label=${t('ui.customerRequiredCharge')}
                             @click=${() => this.askForCustomer()}>
                       <ion-icon name="person-add-outline"></ion-icon>
                       <span>${t('ui.customerRequiredShort')}</span>
                     </button>`
              : nothing}
            ${!this.tableLabel && !this.customerName && !this.missingRequiredCustomer
              ? html`<span class="context-empty">${t('ui.noCheckContext')}</span>` : nothing}
          </div>
        </div>

        ${this.hasKitchen ? html`
          <ion-segment data-testid="pos-view-tabs" class="view-tabs" .value=${this.orderView}
            @ionChange=${(e: CustomEvent) => { this.orderView = (e.detail as { value: 'account' | 'draft' }).value; }}>
            <ion-segment-button data-testid="pos-view-tab-account" value="account"><ion-label>${t('ui.accountTab')}</ion-label></ion-segment-button>
            <ion-segment-button data-testid="pos-view-tab-draft" value="draft"><ion-label><span class="view-tab-label">
              ${t('ui.currentCommandTab')}
              ${this.pendingCount ? html`<span class="pending-dot">${this.pendingCount}</span>` : nothing}
            </span></ion-label></ion-segment-button>
          </ion-segment>` : nothing}
      </ion-header>

      ${this.parkedOpen
        ? html`
          <div data-testid="pos-parked-backdrop" class="pdrop-back" @click=${() => { this.parkedOpen = false; }}></div>
          <div class="pdrop">
            <ion-button data-testid="pos-park-current" size="small" expand="block" fill="outline" ?disabled=${!this.cart.length} @click=${() => void this.requestPark()}>${this.tableLabel.trim() ? t('ui.leaveAtTable') : t('ui.parkCurrentSale')}</ion-button>
            <p class="hint">${this.tableLabel.trim()
              ? t('ui.leaveAtTableHint', { label: this.tableLabel })
              : t('ui.parkForLaterHint')}</p>
            <p class="hint"><strong>${t('ui.parkedTickets')}</strong><br>${t('ui.openChecksHint')}</p>
            ${this.parked.map((oc) => html`<div class="pitem">
              <!-- La FILA entera recupera (objetivo táctil grande); eliminar es el icono aparte,
                   armado en dos toques para no borrar cuentas de un roce. Ya NO se bloquea con
                   algo marcado: lo de delante se aparca o se queda en su mesa (ADR-0146). -->
              <button data-testid=${`pos-parked-${oc.id}`} class="prow" @click=${() => this.retrieve(oc)}>
                <span class="pn">${oc.label || this.money(oc.total)}</span>
                <span class="pm">${(oc.created_at || '').replace('T', ' ').slice(11, 16)}${oc.label ? ' · ' + this.money(oc.total) : ''}</span>
              </button>
              <ion-button data-testid=${`pos-parked-${oc.id}-delete`} size="small" fill="clear" class="pdel tone-danger"
                          title=${this.armedDelete === oc.id ? t('ui.deleteCheckConfirm') : t('ui.deleteCheck')}
                          aria-label=${this.armedDelete === oc.id ? t('ui.deleteCheckConfirm') : t('ui.deleteCheck')}
                          @click=${() => void this.deleteCheck(oc)}>
                <ion-icon slot="icon-only" name=${this.armedDelete === oc.id ? 'alert-circle-outline' : 'trash-outline'}></ion-icon>
              </ion-button>
            </div>`)}
            ${!this.parked.length ? html`<div class="hint hint--center">${t('ui.noParkedTickets')}</div>` : nothing}
          </div>`
        : nothing}

      <!-- El CUERPO. ion-content es quien scrollea: las líneas crecen aquí dentro y ni el header ni
           el pie se mueven. Con divs a pelo, una comanda larga empujaba el botón de COBRAR fuera de
           la pantalla — en un TPV eso es no poder cobrar. -->
      <ion-content class="cart-body">
        ${this.hasKitchen && this.orderView === 'draft'
          ? this.renderDraft()
          : this.hasFired ? this.renderSections() : this.renderOrderList()}
      </ion-content>

      <!-- El PIE. ion-footer es un pie de verdad: se queda abajo pase lo que pase. -->
      <ion-footer class="ion-no-border">
        <div class="cart-foot">
          ${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? html`
          <div class="ticket-discount-row"><span>${t('ui.discountTicket')}${this.ticketDiscount > 0 ? ` −${this.ticketDiscount}%` : ''}</span><span>−${this.money(this.ticketDiscountTotal)}</span></div>` : nothing}
          <div class="total"><span>${t('ui.colTotal')}</span><b>${this.money(this.total)}</b></div>
          <!-- Forma de pago ANTES de cobrar (decisión de Ioan): se elige aquí, con la comanda
               delante, y el modal de cobro queda limpio. Solo-icono porque son 3-4 opciones fijas
               que el camarero reconoce de un vistazo; el nombre va en title/aria. Solo aparecen
               las ACTIVAS (is_active en la query + los allow_* de Ajustes). -->
          <!-- Los iconos de forma de pago se eligen en RUNTIME (payMethodIcon), y el empaquetador
               del módulo solo hornea LITERALES: sin esta lista el icono viaja vacío y el botón sale
               en blanco (le pasó a Bizum). Oculta, solo para que el build los recoja; hay un test
               (pay-icons-baked) que vigila que estén todos. -->
          <span hidden aria-hidden="true">
            <ion-icon name="cash-outline"></ion-icon>
            <ion-icon name="card-outline"></ion-icon>
            <ion-icon name="phone-portrait-outline"></ion-icon>
            <ion-icon name="swap-horizontal-outline"></ion-icon>
            <ion-icon name="ticket-outline"></ion-icon>
            <ion-icon name="gift-outline"></ion-icon>
            <ion-icon name="ellipsis-horizontal-circle-outline"></ion-icon>
            <!-- Borrado en dos toques de la lista de cuentas: el nombre del icono es DINÁMICO
                 (trash → alert al armar), y el empaquetador solo hornea literales. -->
            <ion-icon name="trash-outline"></ion-icon>
            <ion-icon name="alert-circle-outline"></ion-icon>
            <!-- sales#71: el icono del descuento cambia con el estado (outline ↔ relleno). -->
            <ion-icon name="pricetag-outline"></ion-icon>
            <ion-icon name="pricetag"></ion-icon>
          </span>
          <!-- El MÉTODO de pago ya no se elige aquí: vive DENTRO del sheet de cobro, como la
               pantalla de tender de cualquier TPV (rediseño 2026-07-19). El footer solo acciona. -->
          <!-- Acciones SOLO-ICONO (ADR-0133): imprimir la CUENTA para llevarla a la mesa (no es un
               documento fiscal) y COBRAR (que sí emite el tiquet fiscal). El importe ya se ve
               grande arriba, así que el texto sobra; la etiqueta va en aria-label/title. -->
          <!-- El botón de COCINA ya no vive aquí: entra por el slot sales.pos.actions (lo
               aporta kitchen si está instalado/activo) y se monta dentro de Comanda actual. -->
          <div class="foot-actions">
            ${this.discountsAllowed ? html`
            <ion-button data-testid="pos-ticket-discount" fill="outline" ?disabled=${!this.cart.length}
                        class="ticket-discount ${classMap({ 'tone-warning': this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 })}"
                        title=${t('ui.discountTicket')} aria-label=${t('ui.discountTicket')}
                        @click=${() => this.openDiscount('ticket')}>
              <ion-icon slot="icon-only" name=${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? 'pricetag' : 'pricetag-outline'}></ion-icon>
            </ion-button>` : nothing}
            <ion-button data-testid="pos-prebill" class="prebill" fill="outline" ?disabled=${!this.cart.length}
                        title=${t('ui.printPrebill')} aria-label=${t('ui.printPrebill')}
                        @click=${() => { this.prebillOpen = true; void this.loadModifierCatalog(); }}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <!-- sales#185 — with the app missing the button announces itself blocked but STAYS
                 ALIVE: aria-disabled, never the native disabled, which on Ionic is
                 pointer-events:none and would strand the reason in a title that a tablet never
                 shows (sales#58). openPay() takes the tap and answers with the shell's toast.
                 The blocked state itself is written by syncChargeState(), not here: Ionic steals
                 whatever the template puts on this host. -->
            <ion-button data-testid="pos-charge" class="charge" ?disabled=${!this.cart.length}
                        title=${this.missingChargeApp
                          ? t('ui.missingAppCharge', { app: this.chargeAppName })
                          : this.fiscalRoad.blocked ? t(fiscalRoadKey(this.fiscalRoad.blocked))
                          : this.missingRequiredCustomer ? t('ui.customerRequiredCharge') : t('ui.charge')}
                        aria-label=${t('ui.charge')}
                        @click=${() => this.openPay()}>
              <ion-icon slot="start" name="card-outline"></ion-icon>
              ${t('ui.charge')} · ${this.money(this.owed)}
            </ion-button>
          </div>
        </div>
      </ion-footer>`;
  }

  /** Vista temporal que existe únicamente cuando Cocina rellena sales.pos.actions. El botón
   *  sigue siendo propiedad de kitchen: sales solo lo coloca debajo de las líneas pendientes. */
  private renderDraft() {
    const pendientes = pendingLines(this.cart);
    return html`<div class="draft-pane">
      <p class="draft-hint">${t('ui.currentCommandHint')}</p>
      ${pendientes.length
        ? html`<ion-list class="lines" lines="none">${pendientes.map((l) => this.renderLine(l))}</ion-list>`
        : html`<div class="draft-empty"><ok-empty-state icon="checkmark-done-outline"
            heading=${t('ui.noPendingCommand')} message=${t('ui.noPendingCommandHint')}></ok-empty-state></div>`}
      <div class="draft-actions-slot"></div>
    </div>`;
  }

  /** ¿Hay líneas ya ENVIADAS a producción? El carrito se parte en secciones cuando el DATO lo
   *  dice — no hay toggle: la funcionalidad llega instalando módulos (kitchen dispara; una
   *  tienda jamás dispara y jamás ve secciones). Composición de lo básico a lo complejo. */
  private get hasFired(): boolean {
    return this.cart.some((l) => !!l.fired_at);
  }

  /** La pestaña PEDIDO (y el carrito plano sin modo restaurante): la cuenta a cobrar. */
  private renderOrderList() {
    return this.cart.length
      ? html`<ion-list class="lines" lines="full">
          ${this.cart.map((l) => this.renderLine(l))}
        </ion-list>`
      : html`<div class="empty">${t('ui.cartEmptyTouch')}</div>`;
  }

  /** Una línea de la cuenta. BLOQUEADA si ya salió a cocina (`fired_at`): la comida está en
   *  fuego — ni stepper ni invitación (el SQL también lo impone). Tocarla sigue marcándola para
   *  el cobro por partes: enviada ≠ no cobrable. */
  /** TENDER POR LÍNEA (sales#162 / ADR-0386). Un bono cubre una LÍNEA entera, no un importe, así
   *  que la pregunta «¿esto lo paga el bono?» se hace sobre la línea y no sobre el ticket. `sales`
   *  pinta el renglón y el hueco; QUÉ se ofrece ahí lo decide el módulo que hospeda el slot.
   *
   *  Sin fillers (nadie provee el slot) no se pinta NADA: ni cabecera, ni lista, ni hueco vacío. */
  private renderLineTenders() {
    const lines = this.tenderLines;
    if (!lines.length) return nothing;
    return html`
      <div class="pay-lbl">${t('ui.lineTenders')}</div>
      <ul class="tl-list">
        ${lines.map((l) => {
          const isCovered = !!l.line_id && this.covered.has(l.line_id);
          const part = linePart(lines, l);
          const parts = splitCount(l);
          return html`<li class="tender-line" data-line=${l.line_id ?? ''}>
            <div class="tl-h">
              <span class="tl-name">${l.name}${part
                ? html`<span class="tl-part" data-part=${part.part} data-of=${part.of}
                    >${t('ui.tenderLinePart', { i: String(part.part), n: String(part.of) })}</span>`
                : nothing}</span>
              <span class="tl-amount" ?data-covered=${isCovered}>${this.money(lineAmount(l))}</span>
            </div>
            ${coverableLine(l)
              ? html`<div class="tl-slot"></div>`
              : parts
                // ADR-0422 — a redemption spends ONE session on ONE line, so «Corte × 2» is not
                // offered the slot: it is offered the SPLIT. Two lines of one, each with its own
                // gap, is the only shape that says «one session for the mother, full price for the
                // daughter» — and it is what the trade does (Phorest, Boulevard, Zanda, Vagaro).
                // What used to be here was a dead end: the reason written on the line and the
                // cashier left to split it by hand, on a till that had no split.
                ? html`
                  <ion-button data-testid=${`pos-tender-line-${l.id}-split`} class="tl-split" expand="block" fill="outline" size="small"
                      data-parts=${parts} ?disabled=${this.splittingLine === l.line_id}
                      @click=${() => void this.splitTenderLine(l)}>
                    ${t('ui.tenderSplitLine', { n: String(parts) })}
                  </ion-button>
                  <div class="tl-note">${t('ui.tenderSplitReason')}</div>`
                // Weighed, already fired, beyond the ceiling: it cannot become lines of one, and a
                // gap that vanishes with no explanation is the mute failure that reads as «the till
                // is not responding».
                : html`<div class="tl-note">${t('ui.tenderLineNotSplittable')}</div>`}
          </li>`;
        })}
      </ul>`;
  }

  /** The line being split right now, so a second tap cannot ask for the same split twice.
   *  NOT `splitting`, which is the mixed-payment flag of sales#159 and lives on the same class. */
  @state() private splittingLine = '';

  /**
   * SPLITS a line of N services into N lines of one so each can be asked about a voucher
   * (sales#242 / ADR-0422).
   *
   * The server does it in ONE transaction and the till re-reads the check from the rows it left:
   * the source keeps its id (and with it its place in the list), the clones come back with theirs.
   * Rebuilding the cart by hand from the ids would be a second version of the same arithmetic, and
   * the amounts are the server's.
   */
  private async splitTenderLine(l: CartLine): Promise<void> {
    const orderId = this.orderId;
    const lineId = l.line_id;
    if (!orderId || !lineId || !splitCount(l) || this.splittingLine) return;
    this.splittingLine = lineId;
    try {
      await this.queue(async () => {
        const ids = await splitOrderLine(erplora(), orderId, lineId);
        this.cart = await loadOrderLines(erplora(), orderId);
        // A PARTIAL checkout only charges the lines the cashier marked. The clones were never
        // marked — they did not exist — so without this the split would quietly drop N−1 haircuts
        // out of the charge while leaving them on the check.
        if (this.splitSel.has(lineId) && ids.length) {
          this.splitSel = new Set([...this.splitSel, ...ids]);
        }
      });
    } catch (e) {
      // The transaction is all or nothing, so the check is exactly the one that was on screen. The
      // cashier is told, because a button that does nothing in silence is worse than no button —
      // with the declared sentence of the code when the hub sent one (ADR-0398), and with this
      // screen's own when the failure was the browser's and carries no code.
      this.error = domainErrorText(CATALOG, erplora().locale, e) || t('ui.tenderSplitFailed');
    } finally {
      this.splittingLine = '';
    }
  }

  /** pm#392 — an icon's state tone (`on` → `tone`, off → medium) as a classMap: it toggles the two
   *  classes and leaves the ones Ionic stamps on the host alone (`hydrated`; without it Ionic's
   *  global CSS hides the element). A `class=${…}` binding would rewrite the whole attribute. */
  private toneOf(on: boolean, tone: 'primary' | 'warning' | 'success') {
    return classMap({ [`tone-${tone}`]: on, 'tone-medium': !on });
  }

  /** sales#359 — the split mark toggles via classMap too: a `class=${…}` binding would drop the
   *  `ion-activatable`/`ion-focusable` Ionic stamps once, and the line stops answering the tap. */
  private renderLine(l: CartLine) {
    const locked = isLineLocked(l);
    return html`<ion-item data-testid=${`pos-line-${l.id}`} class=${classMap({ sel: !!l.line_id && this.splitSel.has(l.line_id) })}
        button ?detail=${false} @click=${() => this.toggleSplit(l)}>
      ${this.cart.length > 1 && l.line_id
        ? html`<ion-icon slot="start"
                  name=${this.splitSel.has(l.line_id) ? 'checkmark-circle' : 'ellipse-outline'}
                  class="selmark ${this.toneOf(this.splitSel.has(l.line_id), 'primary')}"></ion-icon>`
        : nothing}
      <ion-label>
        <h3>
          ${this.hasKitchen
            ? locked
              ? html`<ok-status-pill tone="success" size="sm" dot>${t('ui.commandRound', { n: String(l.round_no ?? '') })}</ok-status-pill>`
              : html`<ok-status-pill tone="warning" size="sm" dot>${t('ui.pendingStatus')}</ok-status-pill>`
            : nothing}
          <span>${l.name}</span>${l.is_gift
            ? html` <ion-badge class="tone-success">${t('ui.giftBadge')}</ion-badge>` : nothing}</h3>
        <!-- sales#208: el precio unitario que se enseña YA lleva los suplementos, que es el que
             va a salir impreso (el cobro mete el delta por el precio unitario de la línea). Con la
             base a secas, «9,00 €» debajo de un importe de «12,00 €» se lee como un fallo. -->
        <p>${priceLabel(this.money(unitPriceWithModifiers(l)), l.unit_code)}${l.is_gift && l.gift_reason ? html` · ${l.gift_reason}` : nothing}${l.discount
          ? html` <ion-badge class="line-discount-badge tone-warning">−${l.discount}%</ion-badge>` : nothing}</p>
        <!-- sales#156: if the note is not visible the waiter does not know whether it was typed,
             so it gets typed twice or taken for granted. It goes on a sub-line of its own, the way
             the supplements do on paper. -->
        ${l.note ? html`<p class="line-note-text"><ion-icon name="chatbox-ellipses-outline"></ion-icon> ${l.note}</p>` : nothing}
        <!-- sales#277: WHOSE line this is. In a salon Ana cuts and Marta colours on the same
             ticket, so without this the cart paints two «Corte» that cannot be told apart and the
             commission of the day rides on a check nobody can make. Sub-line of its own, the same
             shape as the note, and only when there IS one: a line the ticket attributes says
             nothing extra, exactly as before.
             TAPPING it corrects the row (Fresha, Square Appointments, Vagaro, Booksy all let the
             line be re-assigned from the line): the professional is still SEALED by the chip when
             the line is added — sales#273 decided that and this does not reopen it — but a chip
             moved one tap late no longer costs deleting the line and its note with it. Not offered
             on a line already fired to production, which is not editable at the till at all. -->
        ${this.lineStaffLabel(l) ? html`<button class="line-staff" type="button"
              data-testid="pos-line-staff"
              ?disabled=${locked || !l.line_id}
              title=${t('ui.lineStaffPickerTitle')}
              aria-label=${t('ui.lineStaffPickerTitle')}
              @click=${(e: Event) => { e.stopPropagation(); void this.openStaffPicker(l.line_id); }}>
            <ion-icon name="person-circle-outline"></ion-icon>${this.lineStaffLabel(l)}</button>` : nothing}
      </ion-label>
      <div slot="end" class="lineend">
        <span class="lt ${l.is_gift ? 'is-gift' : ''}">${this.money(lineAmount(l))}</span>
        ${locked
          ? html`<span class="lqty">×${formatQuantity(toMicro(l.qty))}</span>`
          : html`
            ${this.discountsAllowed ? html`
            <ion-button data-testid=${`pos-line-${l.id}-discount`} class="line-discount" fill="clear" size="small" title=${t('ui.discountLine')} aria-label=${t('ui.discountLine')}
                        @click=${() => this.openDiscount('line', l.line_id)}>
              <ion-icon name=${l.discount ? 'pricetag' : 'pricetag-outline'} slot="icon-only" class=${this.toneOf(!!l.discount, 'warning')}></ion-icon>
            </ion-button>` : nothing}
            <ion-button data-testid=${`pos-line-${l.id}-note`} class="line-note" fill="clear" size="small" title=${t('ui.lineNote')} aria-label=${t('ui.lineNote')}
                        @click=${() => this.openLineNote(l.line_id)}>
              <ion-icon name=${l.note ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'} slot="icon-only"
                        class=${this.toneOf(!!l.note, 'primary')}></ion-icon>
            </ion-button>
            <ion-button data-testid=${`pos-line-${l.id}-gift`} fill="clear" size="small" title=${t('ui.giftAction')} @click=${() => this.toggleGift(l.id)}>
              <ion-icon name=${l.is_gift ? 'gift' : 'gift-outline'} slot="icon-only" class=${this.toneOf(!!l.is_gift, 'success')}></ion-icon>
            </ion-button>
            <ok-qty-stepper .value=${l.qty} .min=${0} .step=${this.stepOf(l)}
              @ok-change=${(e: CustomEvent) => this.setQtyAbs(l.id, (e.detail as { value: number }).value,
                e.currentTarget as HTMLElement & { value: number; updateComplete?: Promise<unknown> })}></ok-qty-stepper>`}
      </div>
    </ion-item>`;
  }

  /** Secciones POR DATO (debate Ioan 2026-07-19, 2ª ronda): PENDIENTE DE ENVIAR arriba
   *  (editable — donde trabaja el camarero) y ENVIADO debajo (bloqueado, cobrable). El detalle
   *  por comanda — números, horas, ESTADOS EN VIVO del KDS — no vive aquí: lo aporta kitchen
   *  con su chip+modal por el slot `sales.pos.order_info` (montado en la cabecera de ENVIADO).
   *  El envío es el botón de kitchen dentro de «Comanda actual» (uno solo, con badge). */
  private renderSections() {
    const pendientes = pendingLines(this.cart);
    const enviadas = this.cart.filter((l) => !!l.fired_at);
    return html`<div class="secs">
      ${pendientes.length ? html`<div class="sec sec-pending">
        <div class="sec-h">
          <ion-icon name="create-outline" class="tone-primary"></ion-icon>
          <span>${t('ui.courseInProgress')}</span>
          <span class="ccount">· ${pendientes.length}</span>
        </div>
        <ion-list class="lines" lines="full">${pendientes.map((l) => this.renderLine(l))}</ion-list>
      </div>` : nothing}
      ${enviadas.length ? html`<div class="sec sec-sent">
        <div class="sec-h">
          <ion-icon name="flame" class="tone-warning"></ion-icon>
          <span>${t('ui.sentHeader')}</span>
          <span class="ccount">· ${enviadas.length}</span>
          <span class="sec-slot"></span>
        </div>
        <ion-list class="lines" lines="full">${enviadas.map((l) => this.renderLine(l))}</ion-list>
      </div>` : nothing}
    </div>`;
  }


  /** hub#1940 — the own certificate that signs runs out soon. A status, not an alert: the till
   *  still charges today; the owner learns while there is time to renew, not the morning the hub
   *  starts refusing sales with `fiscal.own_certificate_expired`. */
  private renderCertificateExpiring() {
    const days = certificateExpiryDays(this.fiscalRoad);
    if (days === null) return nothing;
    return html`<div class="blocked-notice fiscal-certificate-notice" role="status" data-testid="pos-fiscal-certificate-expiring">
      <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
      <span>${days === 0 ? t('ui.fiscalCertificateExpiringWithinADay')
        : days === 1 ? t('ui.fiscalCertificateExpiringOneDay')
        : t('ui.fiscalCertificateExpiring', { days })}</span>
      ${this.fiscalRoad.fixRoute
        ? html`<ion-button size="small" fill="outline" class="fiscal-road-fix" data-testid="pos-fiscal-certificate-renew"
            @click=${() => this.navigateTo(this.fiscalRoad.fixRoute)}>${t('ui.fiscalCertificateRenew')}</ion-button>`
        : nothing}
    </div>`;
  }
  render() {
    // sales#159 — por qué el cobro no puede salir todavía (o `undefined`). Se resuelve UNA vez por
    // pintada: lo lee el motivo escrito y lo lee el botón, y tienen que decir lo mismo.
    const blockedWhy = this.paying ? this.chargeBlock : undefined;
    return html`<div class="card">
      <div class="body">
        <div class="catalog">
          ${this.renderCatBar()}
          <!-- sales#185 — the checkout error lives in ONE place at a time. With the sheet open
               this copy sits BEHIND the scrim, across the product grid, and the modal's edge clips
               it to half a sentence: the cashier reads the same thing twice and neither of them
               whole. The sheet's copy is the one in front of them. Closing the sheet hands the
               error back here: it is not lost, it is moved. -->
          ${this.error && !this.paying ? html`<p class="err">${this.error}</p>${this.renderCheckSalesLink()}` : nothing}
          <!-- sales#185 — an app the checkout NEEDS is missing. The role is alert, not status:
               this is not ambient information, it is that this till cannot charge today. -->
          ${this.missingChargeApp
            ? html`<div class="blocked-notice missing-app-notice" role="alert">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
                <span>${t('ui.missingAppCharge', { app: this.chargeAppName })}</span>
              </div>`
            : nothing}
          <!-- hub#1935 — this business files with the tax authority for real and its tickets have no
               way to get there. An alert, like the missing app: this till cannot charge today. The
               link is the fix route the CORE answered, so this module never names the fiscal one. -->
          ${this.fiscalRoad.blocked
            ? html`<div class="blocked-notice fiscal-road-notice" role="alert" data-testid="pos-fiscal-road">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
                <span>${t(fiscalRoadKey(this.fiscalRoad.blocked))}</span>
                ${this.fiscalRoad.fixRoute
                  ? html`<ion-button size="small" fill="outline" class="fiscal-road-fix" data-testid="pos-fiscal-road-fix"
                      @click=${() => this.navigateTo(this.fiscalRoad.fixRoute)}>${t('ui.fiscalRoadFix')}</ion-button>`
                  : nothing}
              </div>`
            : nothing}
          ${this.renderCertificateExpiring()}
          ${this.blockedNotice
            ? html`<div class="blocked-notice" role="status">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon><span>${this.blockedNotice}</span>
              </div>`
            : nothing}
          <!-- sales#153: la lectura del catálogo de menús FALLÓ (≠ «combos no está instalado»).
               Se dice, en vez de dejar la rejilla misteriosamente corta: un menú que no se puede
               componer no se ofrece, porque el servidor lo rechazaría al cobrar. -->
          ${this.comboCatalogFailed
            ? html`<div class="blocked-notice combo-unavailable" role="status">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon><span>${t('ui.comboCatalogUnavailable')}</span>
              </div>`
            : nothing}
          <!-- sales#25: a HARD dependency (inventory, taxes) that IS installed and whose catalogue
               read FAILED. It is an alert, like the missing-app notice: the grid in front of the
               cashier is incomplete and no tap on it will say why. Its ABSENCE is not here — an
               app the hub does not have is a legitimate state that degrades in silence, and
               alarming about it would train the notice away.
               NOTE: no backticks in this comment. Inside an html tagged template a backtick ends
               the template literal and the whole file stops parsing. -->
          ${this.brokenCatalogApps.map((app) => html`
            <div class="blocked-notice catalog-unavailable" role="alert" data-testid="pos-dependency-read-failed">
              <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
              <span>${t('ui.appCatalogUnavailable', { app: this.appName(app) })}</span>
            </div>`)}
          <!-- sales#149: the state of the CATALOGUE, one line and last among the notices. The two
               above belong to the tap that just happened; this one has been true since the till
               opened, so it must not push them down every time they appear. -->
          ${this.renderCatalogHealth()}
          <div class="grid">
            <!-- Los MENÚS van primero: en un local con menú del día es la primera comanda de la
                 hora punta. Solo en la pestaña «todo»: un combo no pertenece a ninguna categoría
                 de producto, así que pintarlo dentro de «Bebidas» sería mentir. -->
            ${!this.activeCat ? this.comboCatalog.map((c) => html`
              <ion-card data-testid=${`pos-combo-${c.combo_id}`} button class="tile combo" data-combo-id=${c.combo_id}
                        aria-label=${`${c.name} · ${this.money(c.price)}`}
                        @click=${() => this.openCombo(c)}>
                <div class="thumb" style=${`background:${gradient(c.name)}`}>
                  ${initials(c.name)}
                  <span class="combo-badge"><ion-icon name="restaurant-outline"></ion-icon></span>
                </div>
                <div class="tinfo">
                  <div class="n">${c.name}</div><div class="sku">${t('ui.comboBadge')}</div>
                  <div class="p">${this.money(c.price)}</div>
                </div>
              </ion-card>`) : nothing}
            ${this.filtered.map((p) => {
              // sales#74 — lo que el cobro va a rechazar (sin categoría fiscal, o con una que no
              // resuelve tipo) se pinta DESHABILITADO, no se esconde: escondiéndolo el negocio
              // nunca se entera de que tiene el catálogo a medio configurar. El motivo viaja en
              // `title`/`aria-label` y con una marca visible — no solo por color.
              const blocked = this.blockedReason(p);
              const photo = this.photos.get(p.image);
              // El degradado y las iniciales son el SUELO de la baldosa, no la alternativa a la
              // foto: se pintan siempre y la foto se superpone. Si la foto no llega —URL caduca,
              // 404, esquema que nadie resuelve, wifi caído al abrir— lo que asoma es el marcador,
              // no un hueco vacío. Antes eran el `else` de `image`, así que un producto CON foto
              // que no cargaba se quedaba sin foto Y sin iniciales: una baldosa en blanco.
              return html`<ion-card data-testid=${`pos-product-${p.id}`} button class="tile" aria-disabled=${blocked ? 'true' : nothing}
                title=${blocked ?? nothing} aria-label=${blocked ? `${p.name} · ${blocked}` : nothing}
                @click=${() => this.add(p)}>
              <div class="thumb" style=${`background:${gradient(p.name)}`}>
                ${initials(p.name)}
                ${p.image && photo
                  ? html`<img src=${photo} alt="" loading="lazy" aria-hidden="true"
                      @error=${() => this.photos.drop(p.image!, photo)}>`
                  : nothing}
                ${blocked ? html`<span class="warn"><ion-icon name="alert-circle"></ion-icon></span>` : nothing}
              </div>
              <!-- sales#57: nombre y precio mandan. El SKU/slug NO se pinta (ruido interno que además
                   entraba en el nombre accesible del botón; Square/Toast/Lightspeed no lo enseñan —
                   vive en la búsqueda). La UNIDAD sí, cuando no es la pieza: «kg», «l». -->
              <div class="tinfo"><div class="n">${p.name}</div><div class="sku">${p.unit_code && p.unit_code !== 'ud' ? p.unit_code : ''}</div><div class="p">${this.money(Number(p.price))}</div>
                ${blocked ? html`<div class="blocked-badge">${t('ui.notSellableBadge')}</div>` : nothing}</div>
            </ion-card>`;
            })}
            <!-- PRECIO LIBRE: vender género suelto que no está fichado (fruta a ojo). Va al FINAL de la
                 rejilla para no interceptar el "primer producto" (que es lo que tocan los tests y el
                 flujo normal); es una acción aparte, no un producto de catálogo. -->
            <ion-card data-testid="pos-open-price-tile" button class="tile open-price" @click=${() => this.openOpenPrice()}>
              <div class="thumb op-thumb"><ion-icon name="pricetag-outline"></ion-icon></div>
              <div class="tinfo"><div class="n">${t('ui.openPrice')}</div><div class="sku"></div><div class="p">+ €</div></div>
            </ion-card>
            ${!this.filtered.length ? this.renderEmptyGrid() : nothing}
          </div>
        </div>

        <div data-testid="pos-cart-backdrop" class="cart-backdrop" ?data-open=${this.cartOpen} @click=${() => { this.cartOpen = false; }}></div>
        <aside class="cart" id="pos-cart-drawer" ?data-open=${this.cartOpen}>${this.renderCart()}</aside>

        <!-- Cart FAB (mobile only). sales#84: accessible name with the count (nobody reads the
             visual badge), and the open/closed state of the drawer it controls. sales#412: with
             items it carries the running total, as Square/Toast/Shopify POS do on their cart
             button, so «how much is it?» does not need the drawer opened. -->
        <button data-testid="pos-cart-fab" class="fab" ?data-has-items=${this.itemCount > 0}
                aria-label=${this.itemCount
                  ? t('ui.openCartWithItems', { count: this.itemCount, total: this.money(this.total) })
                  : t('ui.openCart')}
                aria-expanded=${this.cartOpen ? 'true' : 'false'} aria-controls="pos-cart-drawer"
                @click=${() => { this.cartOpen = true; }}>
          <ion-icon name="cart-outline" aria-hidden="true"></ion-icon>
          ${this.itemCount
            ? html`<span class="fab-total" data-testid="pos-cart-fab-total" aria-hidden="true">${this.money(this.total)}</span>
                <span class="badge">${this.itemCount}</span>`
            : nothing}
        </button>
      </div>

      ${this.paying
        ? html`<div data-testid="pos-pay-scrim" class="scrim pay-scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.paying = false; }}>
            <div class="sheet pay-sheet">
              <div class="sheet-h">
                <span class="t">${t('ui.charge')}</span>
                <button data-testid="pos-pay-close" class="x" @click=${() => { this.paying = false; }}>✕</button>
              </div>
              <!-- El IMPORTE manda en esta pantalla: grande, solo y SIEMPRE visible (fuera del
                   scroll). Antes vivía en letra pequeña del título y el ojo no lo encontraba. -->
              <div class="sheet-top">
                <div class="pay-total">${this.money(this.payable)}</div>
                ${this.splitSel.size
                  ? html`<div class="pay-split">${t('ui.payingPart', { n: String(this.splitSel.size), total: this.money(this.total) })}</div>`
                  : nothing}
                <!-- sales#159 — EL RESTANTE. Vive en la cabecera del sheet, FUERA del scroll: es el
                     número que el cajero mira en cada pata y esconderlo bajo el teclado es lo que
                     convierte un reparto en un «¿cuánto falta ya?» a mano. -->
                ${this.splitting
                  ? html`<div class="pay-remaining" aria-live="polite" ?data-covered=${this.remaining === 0}>
                      <span>${t('ui.remaining')}</span><span class="v">${this.money(this.remaining)}</span>
                    </div>`
                  : nothing}
              </div>
              <div class="pay">
                <!-- sales#324 — TWO groups: what the sale is (voucher per line, ticket or invoice)
                     and how it is paid (method, tendered, keypad). On a phone they stack in this
                     order; from 821 px they become two columns, so what grows on the side can never
                     push the keypad out of sight again. -->
                <div class="pay-side" ?data-folded=${this.paySideFolded}>

                ${this.renderPaySideSummary()}

                ${this.overSimplifiedLimit ? this.renderRecipientCapture('limit') : nothing}

                ${this.renderLineTenders()}

                <!-- TIQUE o FACTURA (hub#962). Dos botones grandes al lado del importe, como el
                     método de pago: es la otra pregunta que el mostrador hace en voz alta
                     («¿necesita factura?») y hasta ahora no tenía dónde contestarse — solo se podía
                     dejar puesto un valor por defecto en Ajustes. Por encima del techo de la
                     simplificada no se pinta: ahí la factura es obligatoria y ofrecer el botón de
                     tique sería ofrecer romper la ley. -->
                ${this.canChooseDocFormat ? html`
                  <div class="pay-docformat" role="group" aria-label=${t('ui.documentFormat')}>
                    ${(['ticket', 'invoice'] as const).map((f) => html`
                      <button data-testid=${`pos-doc-format-${f}`}
                        class="pm-btn"
                        aria-pressed=${this.docFormat === f ? 'true' : 'false'}
                        @click=${() => this.chooseDocFormat(f)}
                      >${f === 'ticket' ? t('ui.docTicket') : t('ui.docInvoice')}</button>`)}
                  </div>` : nothing}

                <!-- sales#317 — «Factura» asks who it is for, right under the button that asked for
                     it. Above the ceiling the capture is already painted at the top (hub#297). -->
                ${!this.overSimplifiedLimit && this.docFormat === 'invoice' ? this.renderRecipientCapture('invoice') : nothing}
                </div>

                <div class="pay-tender">

                <!-- sales#159 — LAS PATAS YA TOMADAS. Cada una se puede editar (vuelve al teclado
                     con su importe) y quitar (su importe vuelve al restante). Sin esto, corregir un
                     «no, eran 40 con tarjeta» obliga a cancelar el cobro entero. -->
                ${this.tenders.length ? html`
                  <div class="pay-lbl">${t('ui.paymentsTaken')}</div>
                  <ul class="tender-list">
                    ${this.tenders.map((leg) => {
                      const name = payMethodDisplayName(leg.method, t);
                      const amount = this.money(leg.amount);
                      const back = leg.tendered - leg.amount;
                      return html`<li class="tender-row">
                        <button data-testid=${`pos-tender-${leg.id}-edit`} class="tender-edit" aria-label=${t('ui.editTender', { name, amount })}
                                @click=${() => this.editTender(leg.id)}>
                          <ion-icon name=${payMethodIcon(leg.method.type, leg.method.name)} aria-hidden="true"></ion-icon>
                          <span class="tender-name">${name}</span>
                          <span class="tender-amount">${amount}</span>
                          ${back > 0 ? html`<span class="tender-change">${t('ui.change')} ${this.money(back)}</span>` : nothing}
                        </button>
                        <button data-testid=${`pos-tender-${leg.id}-remove`} class="tender-remove" aria-label=${t('ui.removeTender', { name, amount })}
                                @click=${() => this.removeTender(leg.id)}>
                          <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
                        </button>
                      </li>`;
                    })}
                  </ul>` : nothing}

                <!-- El MÉTODO se elige AQUÍ, como en la pantalla de tender de cualquier TPV:
                     botones grandes con icono y NOMBRE (el dueño los renombra a su gusto, así que
                     un icono mudo no basta). Solo se pinta con más de un método activo. -->
                ${this.payMethods.length > 1 ? html`
                  <div class="pay-methods" role="group" aria-label=${t('ui.paymentMethod')}>
                    ${this.payMethods.map((m) => {
                      // Marcas que no existen en Iconify (Bizum) van INLINE desde ui/assets; el
                      // resto, su Ionicon. currentColor tiñe igual el SVG al seleccionar.
                      const marca = brandSvgFor(m.type, m.name);
                      const nombre = payMethodDisplayName(m, t);
                      return html`
                      <button data-testid=${`pos-pay-method-${m.id}`} class="pm-btn" aria-pressed=${this.payMethod?.id === m.id ? 'true' : 'false'}
                              title=${nombre}
                              @click=${() => { this.payMethod = m; if (!needsTendered(m) && !this.splitting) this.tendered = ''; }}>
                        ${marca
                          ? html`<span class="brand">${unsafeSVG(marca)}</span>`
                          : html`<ion-icon name=${payMethodIcon(m.type, m.name)}></ion-icon>`}
                        <span class="pm-name">${nombre}</span>
                      </button>`;
                    })}
                  </div>` : nothing}

                <!-- Entregado/cambio/teclado SOLO en efectivo: con tarjeta se cobra el importe
                     exacto y no hay nada que teclear (lo decide requires_change, no un "si es
                     efectivo"). Los ATAJOS son el patrón Toast: el exacto y los redondeos por
                     encima — el cajero toca en vez de teclear y el cambio sale solo. -->
                ${needsTendered(this.payMethod) || this.splitting
                  ? html`
                    <!-- Repartiendo, lo que se teclea es el importe de ESTA pata (en efectivo, lo
                         ENTREGADO, que puede pasarse: la diferencia es el cambio). Decirlo importa:
                         con tarjeta, «Entregado» invitaría a teclear lo que da el cliente. -->
                    <div class="amt pay-amount-label">
                      <span>${this.splitting && !needsTendered(this.payMethod) ? t('ui.legAmount') : t('ui.tendered')}</span>
                      <span class="v">${this.money(this.tenderedNum)}</span>
                    </div>
                    ${(this.splitting ? this.splitChange : this.change) > 0
                      ? html`<div class="amt big-change"><span>${t('ui.change')}</span><span class="v">${this.money(this.splitting ? this.splitChange : this.change)}</span></div>`
                      : nothing}
                    <!-- SIN atajos de importe (73/75/80…): Ioan los eliminó el 2026-07-19 y pidió
                         NO volver a añadirlos. El entregado se teclea en el numpad, punto. -->
                    <div class="numpad">
                      ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button data-testid=${`pos-keypad-${keypadId(k)}`} ?disabled=${k === '.' && hubDecimals() === 0} @click=${() => this.tap(k)}>${k}</button>`)}
                    </div>`
                  : html`
                    <div class="amt pay-exact"><span>${t('ui.payExact')}</span><span class="v">${this.money(this.payable)}</span></div>
                    <p class="pay-hint">${t('ui.payCardHint', { amount: this.money(this.payable) })}</p>`}

                <!-- sales#159 — la puerta al reparto, y luego la tecla que toma cada pata.
                     Repartir es OPT-IN: mientras no se pida, la pantalla es la de un solo medio.
                     🔴 «Añadir» SIN importe tecleado cubre TODO el restante, así que la ÚLTIMA pata
                     es un solo toque. Es justo lo que le falta a Shopify, donde con 3+ medios hay
                     que teclear cada importe a mano y el flujo se atasca («I could not exit the
                     screen other than to mark the order as part paid») — inviable en hora punta. -->
                ${this.payable > 0 && !this.splitting
                  ? html`<button data-testid="pos-pay-split" class="pay-split-btn" @click=${() => this.startSplit()}>
                      <ion-icon name="swap-horizontal-outline" aria-hidden="true"></ion-icon>${t('ui.splitPayment')}
                    </button>`
                  : nothing}
                ${this.splitting && this.remaining > 0
                  ? html`<button data-testid="pos-pay-add-tender" class="pay-add" @click=${() => this.addTender()}>
                      <ion-icon name="add-outline" aria-hidden="true"></ion-icon>${t('ui.addTender')}
                    </button>`
                  : nothing}

                <!-- Imprimir deja de ser un botón gemelo del de cobrar (dos botones azules iguales
                     no dicen cuál hace qué): es una PREFERENCIA del cobro. -->
                <ion-item lines="none" class="print-row">
                  <ion-icon slot="start" name="print-outline"></ion-icon>
                  <ion-label>${t('ui.printReceipt')}</ion-label>
                  <ion-toggle data-testid="pos-print-on-charge" slot="end" .checked=${this.printReceipt ?? true}
                              @ionChange=${(e: CustomEvent) => { this.printOnCharge = !!(e.detail as { checked: boolean }).checked; }}></ion-toggle>
                </ion-item>
                </div>

              </div>
              <div class="sheet-foot">
                ${this.error ? html`<p class="pay-err">${this.error}</p>${this.renderCheckSalesLink()}` : nothing}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla.
                     El importe es el PAYABLE: con split decía «Cobrar 3,60 €» para cobrar 1,80 €. -->
                <!-- sales#159 — EL MOTIVO, ESCRITO EN LA PANTALLA. No dentro del botón y no en un
                     title: el motivo tiene que poder leerse sin tocar nada y sin un ratón. -->
                ${blockedWhy?.reason ? html`<p class="pay-block-reason">${blockedWhy.reason}</p>` : nothing}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla.
                     El importe es el PAYABLE: con split decía «Cobrar 3,60 €» para cobrar 1,80 €.
                     🔴 aria-disabled, JAMAS disabled: en Ionic disabled es pointer-events:none
                     y en una tablet de mostrador el toque muere en silencio (sales#58). Aquí el
                     toque llega, confirm() lo para y CONTESTA con lo que falta. busy sí es
                     disabled de verdad: ahí no hay nada que contestar y un segundo toque cobraría
                     dos veces. -->
                <ion-button data-testid="pos-pay-confirm" class="charge" expand="block" ?disabled=${this.busy}
                            aria-disabled=${blockedWhy ? 'true' : nothing}
                            @click=${() => this.confirm()}>
                  ${this.busy
                    ? t('ui.charging')
                    : blockedWhy?.short
                      // Dice lo que FALTA, no «no puedes».
                      ? blockedWhy.short
                      : this.tenders.length
                        ? `${t('ui.charge')} ${this.money(this.payable)}`
                        : needsTendered(this.payMethod)
                          ? `${t('ui.charge')} ${this.money(this.payable)}`
                          : t('ui.chargeWithCard', { amount: this.money(this.payable) })}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <!-- PRECIO LIBRE: reutiliza el sheet del cobro (.scrim/.sheet/.numpad). Tecleas el importe y
           eliges el DEPARTAMENTO (categoría fiscal, que lleva su IVA); "Añadir" queda deshabilitado
           hasta tener importe > 0 y departamento (nunca una línea desnuda). -->
      ${this.modifierSheet
        ? html`<div data-testid="pos-modifier-scrim" class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) { this.modifierSheet = undefined; } }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${this.modifierSheet.product.name}</span>
                <button data-testid="pos-modifier-close" class="x" @click=${() => { this.modifierSheet = undefined; }}>✕</button>
              </div>
              <div class="pay">
                ${this.modifierSheet.groups.map((g) => html`
                  <div class="dept-label">
                    ${g.name}
                    <!-- La obligatoriedad se LEE de min/max: el cajero ve la misma regla que aplica
                         el servidor, en vez de una etiqueta que puede contradecirla. -->
                    <small>${g.min >= 1
                      ? t('ui.modifierRequired', { n: g.min })
                      : g.max > 0 ? t('ui.modifierUpTo', { n: g.max }) : t('ui.modifierOptional')}</small>
                  </div>
                  <div class="dept-grid" role="group" aria-label=${g.name}>
                    ${g.options.map((o) => html`
                      <button data-testid=${`pos-modifier-option-${o.id}`} class="dept-btn" aria-pressed=${this.modifierPicks.includes(o.id) ? 'true' : 'false'}
                              @click=${() => this.toggleModifier(o.id)}>
                        <span class="dn">${o.name}</span>
                        <span class="dr">${o.price_delta ? this.money(o.price_delta) : ''}</span>
                      </button>`)}
                  </div>`)}
              </div>
              <div class="sheet-foot">
                <ion-button data-testid="pos-modifier-confirm" class="charge" expand="block" ?disabled=${!this.canConfirmModifiers()}
                            @click=${() => this.confirmModifiers()}>
                  ${this.canConfirmModifiers() ? t('ui.add') : t('ui.modifierPickOne')}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}
      <!-- sales#153 · EL PICKER DEL MENÚ. HOJA ÚNICA con los grupos apilados y scroll, no wizard:
           es a lo que ha convergido el mercado táctil (Odoo 18 y 19; Toast construyó «Open View»
           para salir del wizard, «rather than in a sequential way»). -->
      ${this.comboSheet
        ? html`<div data-testid="pos-combo-scrim" class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) { this.comboSheet = undefined; } }}>
            <div class="sheet" data-combo-sheet>
              <div class="sheet-h">
                <span class="t">${this.comboSheet.combo.name}</span>
                <button data-testid="pos-combo-close" class="x" @click=${() => { this.comboSheet = undefined; }}>✕</button>
              </div>
              <div class="pay">
                ${this.comboSheet.combo.groups.map((g) => {
                  const picked = this.comboPicksIn(g);
                  const needs = picked.length < g.min;
                  const full = this.comboGroupFull(g);
                  const counter = this.comboGroupCounter(g);
                  return html`
                  <div class="combo-group" data-group-id=${g.id}
                       data-needs=${needs ? 'true' : 'false'}
                       data-full=${full ? 'true' : 'false'}
                       data-flagged=${this.comboNeedsGroup === g.id ? 'true' : 'false'}>
                    <div class="dept-label">
                      ${g.name}
                      <!-- El contador de Toast Open View: explica la regla ANTES de chocar con
                           ella. La marca de estado NO es solo color (no pasaría contraste). -->
                      ${counter ? html`<small class="combo-counter">
                        <span aria-hidden="true">${needs ? '✕' : '✓'}</span>
                        ${picked.length}/${counter}
                      </small>` : html`<small>${t('ui.modifierOptional')}</small>`}
                    </div>
                    <div class="dept-grid" role="group" aria-label=${g.name}>
                      ${g.options.map((o) => {
                        const n = this.comboCount(o.option_id);
                        const delta = this.comboDelta(o);
                        // En el techo, lo NO elegido se marca pero sigue LEGIBLE: Square se niega
                        // a esconder lo no seleccionable, y el gris sin motivo es la queja de
                        // campo documentada en Toast. El toque CONTESTA igual (pickComboOption).
                        //
                        // 🔴 Nunca en `max = 1`: ahí el toque SÍ hace algo (auto-swap), y marcarlo
                        // como inservible seria mentirle al camarero. Lo cazo el navegador de
                        // verdad, no happy-dom: en pantalla los otros primeros salian con borde
                        // discontinuo aunque cambiar de primero es justo lo que se espera poder.
                        const barred = full && n === 0 && g.max !== 1;
                        return html`
                        <button data-testid=${`pos-combo-option-${o.option_id}`} class="dept-btn combo-opt" data-option-id=${o.option_id}
                                aria-pressed=${n > 0 ? 'true' : 'false'}
                                aria-disabled=${barred ? 'true' : 'false'}
                                data-barred=${barred ? 'true' : 'false'}
                                @click=${() => this.pickComboOption(g, o.option_id)}>
                          <span class="dn">${this.comboOptionName(o)}${n > 1 ? html` <b>×${n}</b>` : nothing}</span>
                          ${delta ? html`<span class="dr" data-delta>${delta}</span>` : nothing}
                        </button>
                        ${g.allow_repeat && n > 0
                          ? html`<button data-testid=${`pos-combo-option-${o.option_id}-less`} class="combo-less" data-drop-option=${o.option_id}
                                         aria-label=${t('ui.comboRemoveOne', { name: this.comboOptionName(o) })}
                                         @click=${() => this.dropComboOption(o.option_id)}>−</button>`
                          : nothing}`;
                      })}
                    </div>
                  </div>`;
                })}
              </div>
              <div class="sheet-foot">
                <!-- El TOTAL EN VIVO. No es opinión: Odoo lo añadió del 18 al 19. -->
                <div class="combo-total" data-combo-total>
                  <span>${t('ui.colTotal')}</span>
                  <strong>${this.money(comboTotalCents(this.comboSheet.combo, this.comboPicks))}</strong>
                </div>
                <!-- 🔴 Botón PLANO a propósito, no ion-button: el disabled de Ionic es
                     pointer-events:none y se TRAGA el toque, dejando el motivo en title —
                     hover, imposible en un TPV. Y en Shadow DOM Ionic mueve los aria-* a su
                     <button> interno, así que un selector sobre el host no casaría nunca. Aquí el
                     aria-disabled y el gancho data-blocked viven en el elemento que controlo. -->
                ${(() => {
                  const blocked = this.comboBlocked();
                  return html`<button data-testid="pos-combo-confirm" class="combo-confirm" data-combo-confirm
                          aria-disabled=${blocked ? 'true' : 'false'}
                          data-blocked=${blocked ? 'true' : 'false'}
                          @click=${() => this.confirmCombo()}>
                    ${blocked ? blocked.text : `${t('ui.add')} · ${this.money(comboTotalCents(this.comboSheet!.combo, this.comboPicks))}`}
                  </button>`;
                })()}
              </div>
            </div>
          </div>`
        : nothing}
      ${this.openPriceOpen
        ? html`<div data-testid="pos-open-price-scrim" class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.openPriceOpen = false; }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${t('ui.openPrice')}</span>
                <button data-testid="pos-open-price-close" class="x" @click=${() => { this.openPriceOpen = false; }}>✕</button>
              </div>
              <div class="sheet-top"><div class="pay-total">${this.money(this.openAmountCents)}</div></div>
              <div class="pay">
                <div class="numpad">
                  ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button data-testid=${`pos-open-price-key-${keypadId(k)}`} ?disabled=${k === '.' && hubDecimals() === 0} @click=${() => this.tapOpen(k)}>${k}</button>`)}
                </div>
                <div class="dept-label">${t('ui.department')}</div>
                <div class="dept-grid" role="group" aria-label=${t('ui.department')}>
                  ${this.departments.map((d) => html`
                    <button data-testid=${`pos-open-price-dept-${d.key}`} class="dept-btn" aria-pressed=${this.openDept === d.key ? 'true' : 'false'}
                            @click=${() => { this.openDept = d.key; }}>
                      <span class="dn">${d.name}</span>
                      <span class="dr">${this.deptRateLabel(d.taxCategoryKey)}</span>
                    </button>`)}
                  ${!this.departments.length ? html`<div class="dept-empty">${t('ui.noDepartments')}</div>` : nothing}
                </div>
              </div>
              <div class="sheet-foot">
                <!-- La guarda pide que el departamento RESUELVA, no solo que openDept tenga algo
                     dentro: con una clave que no casa, el botón salía habilitado y el toque no
                     hacía nada ni decía nada. (Sin acentos graves aquí: dentro de un comentario de
                     lit cierran el template — es una trampa conocida.) -->
                <ion-button class="charge" expand="block" data-testid="pos-open-price-add"
                            ?disabled=${!(this.openAmountCents > 0 && this.resolvedDept)}
                            @click=${() => this.addOpenPrice()}>
                  ${t('ui.add')}${this.openAmountCents > 0 ? ` ${this.money(this.openAmountCents)}` : ''}
                </ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <!-- LINE NOTE (sales#156): the free-text sheet the line's button opens. Same
           <div class="scrim"><div class="sheet"> as the discount — it rises from the bottom with
           its handle — because ion-action-sheet does not host rich content and Ionic overlays
           inside a shadow root get re-parented to the body (ADR-0028). Focus lands on the
           textarea: writing is what one comes here to do. -->
      ${this.noteSheet
        ? html`<div data-testid="pos-note-scrim" class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.noteSheet = undefined; }}>
            <div class="sheet note-sheet">
              <div class="sheet-h">
                <span class="t">${t('ui.lineNoteOf', { name: this.cart.find((l) => l.line_id === this.noteSheet?.lineId)?.name ?? '' })}</span>
                <button data-testid="pos-note-close" class="x" aria-label=${t('ui.closeAction')} @click=${() => { this.noteSheet = undefined; }}>✕</button>
              </div>
              <div class="sheet-top">
                <!-- sales#206 — the chips the business preconfigured. With none configured
                     NOTHING is painted here and the sheet is exactly the one sales#156 shipped:
                     a business that never configures anything pays nothing for this existing. -->
                ${this.quickNotesState === 'loading' || this.quickNotesState === 'error'
                  ? html`<p class="note-chips-state">
                      ${t(this.quickNotesState === 'loading' ? 'ui.lineNoteQuickLoading' : 'ui.lineNoteQuickError')}
                    </p>`
                  : nothing}
                ${this.quickNotes.length
                  ? html`<div class="note-chips">
                      ${this.quickNotes.map((n) => html`
                        <button data-testid=${`pos-note-chip-${n.id}`} type="button" class="note-chip"
                                aria-pressed=${hasQuickNote(this.noteInput, n.text) ? 'true' : 'false'}
                                @click=${() => this.toggleQuickNoteChip(n.text)}>${n.text}</button>`)}
                    </div>`
                  : nothing}
                <textarea data-testid="pos-note-input" class="note-input" rows="3" maxlength="255" autofocus
                          aria-label=${t('ui.lineNote')} placeholder=${t('ui.lineNotePlaceholder')}
                          .value=${this.noteInput}
                          @input=${(e: Event) => { this.noteInput = (e.target as HTMLTextAreaElement).value; }}></textarea>
                <p class="note-hint">${t('ui.lineNoteHint')}</p>
              </div>
              <div class="sheet-foot discount-foot">
                <ion-button data-testid="pos-note-remove" class="tone-medium" fill="clear"
                  @click=${() => this.applyLineNote('')}>${t('ui.lineNoteRemove')}</ion-button>
                <ion-button data-testid="pos-note-save" class="charge note-save" expand="block"
                  @click=${() => this.applyLineNote(this.noteInput)}>${t('ui.lineNoteSave')}</ion-button>
              </div>
            </div>
          </div>`
        : nothing}

      <!-- DESCUENTO (sales#71): mismo sheet/numpad del cobro. Se teclea el %, y Aplicar; 0 = quitar.
           Sobre la LÍNEA elegida o sobre el TICKET entero. El servidor prorratea y revalida
           allow_discounts; aquí solo se recoge la cifra. -->
      ${this.discountSheet
        ? html`<div data-testid="pos-discount-scrim" class="scrim" @click=${(e: Event) => { if ((e.target as HTMLElement).classList.contains('scrim')) this.discountSheet = undefined; }}>
            <div class="sheet discount-sheet">
              <div class="sheet-h">
                <span class="t">${this.discountSheet.target === 'ticket'
                  ? t('ui.discountTicket')
                  : t('ui.discountLineOf', { name: this.cart.find((l) => l.line_id === this.discountSheet?.lineId)?.name ?? '' })}</span>
                <button data-testid="pos-discount-close" class="x" aria-label=${t('ui.closeAction')} @click=${() => { this.discountSheet = undefined; }}>✕</button>
              </div>
              ${this.discountSheet.target === 'ticket' ? html`
              <!-- sales#113: % or a fixed amount («5 € off»), both market standard. sales#380: the amount
                   button names the HUB currency (¥, £, €), never a hard «€». -->
              <ion-segment data-testid="pos-discount-mode" class="discount-mode" value=${this.discountMode}
                @ionChange=${(e: CustomEvent<{ value?: string }>) => this.setDiscountMode(e.detail.value === 'amount' ? 'amount' : 'percent')}>
                <ion-segment-button data-testid="pos-discount-mode-percent" value="percent"><ion-label>%</ion-label></ion-segment-button>
                <ion-segment-button data-testid="pos-discount-mode-amount" value="amount"><ion-label>${this.currencyLabel()}</ion-label></ion-segment-button>
              </ion-segment>` : nothing}
              <div class="sheet-top"><div class="pay-total">${this.discountMode === 'amount'
                ? this.money(this.discountInputCents)
                : `${this.discountInput || '0'} %`}</div></div>
              <div class="pay">
                <div class="numpad">
                  ${['1','2','3','4','5','6','7','8','9','.','0','C'].map((k) => html`<button data-testid=${`pos-discount-key-${keypadId(k)}`} ?disabled=${k === '.' && this.discountMode === 'amount' && hubDecimals() === 0} @click=${() => this.tapDiscount(k)}>${k}</button>`)}
                </div>
              </div>
              <div class="sheet-foot discount-foot">
                <ion-button data-testid="pos-discount-remove" class="tone-medium" fill="outline"
                  @click=${() => (this.discountMode === 'amount' ? this.applyDiscountAmount(0) : this.applyDiscount(0))}>${t('ui.discountRemove')}</ion-button>
                ${this.discountMode === 'amount'
                  ? html`<ion-button data-testid="pos-discount-apply-amount" class="charge" expand="block" ?disabled=${this.discountInputCents > cartTotal(this.cart, this.ticketDiscount)}
                      @click=${() => this.applyDiscountAmount(this.discountInputCents)}>
                      ${t('ui.discountApply')}${this.discountInputCents > 0 ? ` −${this.money(this.discountInputCents)}` : ''}
                    </ion-button>`
                  : html`<ion-button data-testid="pos-discount-apply" class="charge" expand="block" @click=${() => this.applyDiscount(this.discountInputPct)}>
                      ${t('ui.discountApply')}${this.discountInputPct > 0 ? ` −${this.discountInputPct}%` : ''}
                    </ion-button>`}
              </div>
            </div>
          </div>`
        : nothing}

      <!-- APARCAR sin mesa: se pide un NOMBRE (default: la hora, patrón Loyverse) pre-seleccionado
           para sobreescribirlo de un toque. <dialog> nativo: top layer, inmune al transform del
           drawer del carrito (gotcha conocido de overlays en ancestros con transform). -->
      ${this.parkPromptOpen ? html`
        <dialog class="park-dialog" open>
          <h3>${t('ui.parkTitle')}</h3>
          <p>${t('ui.parkNameHint')}</p>
          <input data-testid="pos-park-name" type="text" .value=${this.parkName} placeholder=${t('ui.parkNamePlaceholder')}
                 aria-label=${t('ui.parkNameLabel')}
                 @input=${(e: Event) => { this.parkName = (e.target as HTMLInputElement).value; }}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { this.parkPromptOpen = false; void this.parkWith(this.parkName); } }} />
          <div class="dlg-actions">
            <ion-button data-testid="pos-park-cancel" fill="clear" @click=${() => { this.parkPromptOpen = false; }}>${t('ui.cancel')}</ion-button>
            <ion-button data-testid="pos-park-confirm" class="park-confirm"
                        @click=${() => { this.parkPromptOpen = false; void this.parkWith(this.parkName); }}>
              ${t('ui.parkCurrentSale')}
            </ion-button>
          </div>
        </dialog>` : nothing}

      <!-- sales#179 — TRANSFER the check to somebody else. Same native <dialog> as parking
           (ion-action-sheet does not host rich content and Ionic overlays inside a Lit shadow root
           get re-parented to the body, ADR-0028), so on mobile it rises as a sheet. -->
      ${this.staffPickerOpen ? html`
        <dialog class="staff-dialog" open>
          <!-- sales#277: the same dialog serves the CHECK and one LINE. It says which, because
               «who is serving» and «whose is this line» decide different money in a salon. -->
          <h3>${t(this.staffPickerLine ? 'ui.lineStaffPickerTitle' : 'ui.staffPickerTitle')}</h3>
          <p>${t(this.staffPickerLine ? 'ui.lineStaffPickerHint' : 'ui.staffPickerHint')}</p>
          <div class="staff-list">
            <button class="staff-opt" type="button" data-testid="pos-staff-option-me"
                    ?data-current=${this.staffPickerLine ? !this.pickerLineStaffId : !this.staffId}
                    @click=${() => this.pickStaff()}>
              ${t(this.staffPickerLine ? 'ui.lineStaffTicketOption' : 'ui.staffMeOption')}
            </button>
            ${this.staffPickerState === 'loading'
              ? html`<p class="staff-note" data-testid="pos-staff-loading">${t('ui.staffLoading')}</p>`
              : nothing}
            ${this.staffPickerState === 'error'
              ? html`<p class="staff-note" data-testid="pos-staff-error">${t('ui.staffLoadFailed')}</p>`
              : nothing}
            ${this.teamFailed
              ? html`<p class="staff-note" data-testid="pos-staff-team-error">${t('ui.staffTeamLoadFailed')}</p>`
              : nothing}
            ${this.staffPickerState === 'ready' && !this.teamFailed && !this.staffOptions.length
              ? html`<p class="staff-note" data-testid="pos-staff-empty">${t('ui.staffPickerEmpty')}</p>`
              : nothing}
            ${this.staffOptions.map((u) => html`
              <button class="staff-opt" type="button" data-testid="pos-staff-option"
                      ?data-current=${this.servesAs(u, this.staffPickerLine ? this.pickerLineStaffId : this.staffId)}
                      @click=${() => this.pickStaff(u)}>
                ${u.name}
              </button>`)}
          </div>
          <div class="dlg-actions">
            <ion-button data-testid="pos-staff-cancel" fill="clear" @click=${() => { this.staffPickerOpen = false; this.staffPickerLine = undefined; }}>${t('ui.cancel')}</ion-button>
          </div>
        </dialog>` : nothing}

      <!-- CARRITO SUCIO al recuperar/tocar mesa: ¿qué hacemos con la cuenta actual? Aparcar es la
           salida segura (primario); eliminar anula con rastro (danger). Cancelar solo desde la
           lista — al tocar una mesa el filler ya cambió su selección y cancelar los descoordina. -->
      ${this.dirtyOpen ? html`
        <dialog class="dirty-dialog" open>
          <h3>${t('ui.dirtyCartTitle')}</h3>
          <p>${t('ui.dirtyCartBody')}</p>
          <div class="dlg-actions">
            ${this.dirtyAllowCancel
              ? html`<ion-button data-testid="pos-dirty-cancel" fill="clear" @click=${() => this.answerDirty('cancel')}>${t('ui.cancel')}</ion-button>`
              : nothing}
            <ion-button data-testid="pos-dirty-discard" class="discard-opt tone-danger" fill="outline"
                        @click=${() => this.answerDirty('discard')}>${t('ui.discardAndOpen')}</ion-button>
            <ion-button data-testid="pos-dirty-park" class="park-opt" @click=${() => this.answerDirty('park')}>${t('ui.parkAndOpen')}</ion-button>
          </div>
        </dialog>` : nothing}

      <!-- Buscador de productos = ok-spotlight-search (OutfitKit): overlay translúcido flotante que
           NO empuja la rejilla. La lupa del catbar controla su apertura. Al pulsar un resultado se
           añade al carrito y se cierra. -->
      <ok-spotlight-search placeholder=${t('ui.searchProductPlaceholder')} .value=${this.q}
        @ok-open=${(e: CustomEvent) => { this.searchOpen = e.detail.open; if (!e.detail.open) this.q = ''; }}
        @ok-input=${(e: CustomEvent) => { this.q = e.detail.value; }}>
        <ion-list class="sp-list" lines="none">
          ${this.searchResults.map((p) => {
            // Misma regla que la rejilla: buscar un producto no es otra puerta para colar en la
            // cuenta lo que no se puede cobrar (sales#74).
            const blocked = this.blockedReason(p);
            return html`
            <ion-item data-testid=${`pos-search-result-${p.id}`} button detail="false" aria-disabled=${blocked ? 'true' : nothing} title=${blocked ?? nothing}
              @click=${() => { this.add(p); this.q = ''; (this.renderRoot.querySelector('ok-spotlight-search') as { close?: () => void } | null)?.close?.(); }}>
              <ion-label><h3>${p.name}</h3>${blocked ? html`<p class="sp-warn">${blocked}</p>` : p.sku ? html`<p>${p.sku}</p>` : nothing}</ion-label>
              <span slot="end" class="sp-price">${this.money(Number(p.price))}</span>
            </ion-item>`;
          })}
          ${this.q.trim() && !this.searchResults.length ? html`<div class="empty">${t('ui.noProducts')}</div>${this.servicesHidden ? this.renderServicesHidden() : nothing}` : nothing}
        </ion-list>
      </ok-spotlight-search>

      ${renderDocumentModal({ saleId: this.docSaleId, issuing: true, onClose: () => { this.docSaleId = undefined; }, t })}
      <!-- CUENTA previa (ADR-0141): lo que se lleva a la mesa antes de cobrar. NO es fiscal — sin
           número de serie ni QR VeriFactu; el tiquet fiscal lo emite el cobro. -->
      <ion-modal class="doc-modal" .isOpen=${this.prebillOpen}
                 @ionModalDidDismiss=${() => { this.prebillOpen = false; }}>
        <ion-header><ion-toolbar>
          <ion-title>${t('ui.prebillTitle')}</ion-title>
          <ion-buttons slot="end">
            <ion-button data-testid="pos-prebill-print" title=${t('ui.print')} aria-label=${t('ui.print')} @click=${() => void this.printPrebill()}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button data-testid="pos-prebill-close" title=${t('ui.close')} aria-label=${t('ui.close')}
                        @click=${() => { this.prebillOpen = false; }}>
              <ion-icon slot="icon-only" name="close-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="doc-body ion-padding">
          <!-- .receipt and .labels are the ONLY properties ok-receipt reads. The bill used to be
               handed to it on .data —a property that does not exist— so receipt stayed undefined
               and the document was a white box reading «No receipt data.» in English on a Spanish
               hub (sales#87). Both defects were that one line: no document AND no labels, so the
               component fell back to its own built-in English DEFAULT_LABELS.
               (No backticks in comments inside a Lit template: they close the literal.) -->
          ${this.renderPrebillDoc()}
        </ion-content>
      </ion-modal>
    </div>`;
  }
}

define('erp-pos-touch', ErpPosTouch);

declare global {
  interface HTMLElementTagNameMap {
    'erp-pos-touch': ErpPosTouch;
  }
}
