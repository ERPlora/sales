// pos-double — the till's read surface, in ONE place (sales#233).
//
// `installErploraDouble` owns the DOORS of the SDK. This owns the QUERIES the POS screen reads, and
// which app owns each one. Both halves used to be copied by hand into every suite, and the copy
// that fell behind is what left five cases of the «customer required» guard testing nothing for a
// day (sales#231).
//
// The default of each read is the answer that is TRUE of a hub that has the app but nothing in it:
//   · apps the till depends on (`inventory`, `taxes`, `sales`, the core) → `[]`
//   · OPTIONAL apps (ADR-0127: `services`, `modifiers`, `combos`, `appointments`) → ABSENT, which
//     is `undefined` through the optional doors, because most hubs do not have them and `[]` would
//     claim the opposite
// Naming rows for a read puts that app in the hub; `absentModules` takes one out; `brokenModules`
// leaves it in and breaks it, which is a different thing the screen has to say out loud (sales#25).
import { installErploraDouble } from './erplora-double';
import type { ErploraDouble, ErploraDoubleSpec, QueryAnswer } from './erplora-double';

/** Which app owns each read, and which spec field fills it. */
const READS: { name: string; module: string; field: keyof PosCatalogue }[] = [
  { name: 'inventory.products.list', module: 'inventory', field: 'products' },
  { name: 'inventory.products.for_sale', module: 'inventory', field: 'forSale' },
  { name: 'inventory.categories.list', module: 'inventory', field: 'categories' },
  { name: 'inventory.product_categories', module: 'inventory', field: 'productCategories' },
  { name: 'inventory.units.list', module: 'inventory', field: 'units' },
  { name: 'taxes.rules.list', module: 'taxes', field: 'rules' },
  { name: 'taxes.categories.list', module: 'taxes', field: 'taxCategories' },
  { name: 'sales.payment_methods', module: 'sales', field: 'paymentMethods' },
  { name: 'sales.quick_notes.list', module: 'sales', field: 'quickNotes' },
  { name: 'sales.business.get', module: 'sales', field: 'business' },
  { name: 'sales.orders.list', module: 'sales', field: 'orders' },
  { name: 'sales.order.lines', module: 'sales', field: 'orderLines' },
  { name: 'sales.by_idempotency_key', module: 'sales', field: 'byIdempotencyKey' },
  // Read by `erp-sales-document`, the sale document the till mounts inside its own modal.
  { name: 'sales.get', module: 'sales', field: 'sale' },
  { name: 'sales.lines', module: 'sales', field: 'saleLines' },
  { name: 'hub.users.list', module: 'hub', field: 'users' },
  { name: 'hub.fiscal.limits', module: 'hub', field: 'fiscalLimits' },
  { name: 'services.services.list', module: 'services', field: 'services' },
  { name: 'services.categories.list', module: 'services', field: 'serviceCategories' },
  { name: 'modifiers.for_target', module: 'modifiers', field: 'modifierGroups' },
  { name: 'modifiers.options.all', module: 'modifiers', field: 'modifierOptions' },
  { name: 'combos.options.all', module: 'combos', field: 'comboOptions' },
  { name: 'appointments.appointments.get', module: 'appointments', field: 'appointment' },
  // The fiscal chain the sale document resolves: a hub can charge with no invoicing app at all.
  { name: 'invoice.by_source', module: 'invoice', field: 'invoiceBySource' },
  { name: 'invoice.lines', module: 'invoice', field: 'invoiceLines' },
  { name: 'verifactu.records.by_invoice', module: 'verifactu', field: 'verifactuRecord' },
];

type PosSettingsRow = Record<string, unknown> | null;

/** The apps whose ABSENCE is the normal case, so they are out of the hub until a test says otherwise. */
const OPTIONAL_MODULES = new Set(['services', 'modifiers', 'combos', 'appointments', 'invoice', 'verifactu']);

/** Every query name the till reads. Exported so the suite can prove none of them explodes. */
export const POS_READS: readonly string[] = READS.map((r) => r.name);

interface PosCatalogue {
  /** `inventory.products.list` — the retail grid. */
  products?: QueryAnswer;
  /** `inventory.products.for_sale` — the sellable subset (sales#177). */
  forSale?: QueryAnswer;
  categories?: QueryAnswer;
  productCategories?: QueryAnswer;
  units?: QueryAnswer;
  rules?: QueryAnswer;
  taxCategories?: QueryAnswer;
  paymentMethods?: QueryAnswer;
  quickNotes?: QueryAnswer;
  business?: QueryAnswer;
  orders?: QueryAnswer;
  orderLines?: QueryAnswer;
  byIdempotencyKey?: QueryAnswer;
  sale?: QueryAnswer;
  saleLines?: QueryAnswer;
  users?: QueryAnswer;
  fiscalLimits?: QueryAnswer;
  services?: QueryAnswer;
  serviceCategories?: QueryAnswer;
  modifierGroups?: QueryAnswer;
  modifierOptions?: QueryAnswer;
  comboOptions?: QueryAnswer;
  appointment?: QueryAnswer;
  invoiceBySource?: QueryAnswer;
  invoiceLines?: QueryAnswer;
  verifactuRecord?: QueryAnswer;
}

export interface PosDoubleSpec extends PosCatalogue, Omit<ErploraDoubleSpec, 'queries' | 'absent' | 'broken'> {
  /**
   * The settings row `sales.pos_settings.get` answers. `null`/absent = the hub never saved one.
   * Pass a THUNK when the test rewrites the row after installing the double — the till reads it on
   * mount, and a value captured here would freeze the policy the screen was supposed to react to.
   */
  settings?: PosSettingsRow | (() => PosSettingsRow);
  /** Apps that are NOT in this hub: every read they own answers absence. */
  absentModules?: string[];
  /** Apps that ARE in this hub and whose reads fail: an incident, never an absence (ADR-0400). */
  brokenModules?: string[];
  /** Reads only this screen makes, on top of the till's surface. */
  queries?: Record<string, QueryAnswer>;
  /** The runtime code a named read rejects with — see `ErploraDoubleSpec.failing`. */
  failing?: Record<string, string | undefined>;
}

/**
 * Installs the double a POS suite needs: the till's whole read surface plus whatever this screen
 * alone asks for. Everything `installErploraDouble` gives — the loud throw on a read nobody
 * declared, the recorded reads/commands/notices — still applies.
 */
export function installPosDouble(spec: PosDoubleSpec = {}): ErploraDouble {
  const {
    settings, absentModules = [], brokenModules = [], queries: extraQueries = {}, failing = {},
    products, forSale, categories, productCategories, units, rules, taxCategories,
    paymentMethods, quickNotes, business, orders, orderLines, byIdempotencyKey, sale, saleLines,
    users, fiscalLimits,
    services, serviceCategories, modifierGroups, modifierOptions, comboOptions, appointment,
    invoiceBySource, invoiceLines, verifactuRecord,
    ...rest
  } = spec;
  const catalogue: PosCatalogue = {
    products, forSale, categories, productCategories, units, rules, taxCategories,
    paymentMethods, quickNotes, business, orders, orderLines, byIdempotencyKey, sale, saleLines,
    users, fiscalLimits,
    services, serviceCategories, modifierGroups, modifierOptions, comboOptions, appointment,
    invoiceBySource, invoiceLines, verifactuRecord,
  };

  const absentSet = new Set(absentModules);
  const brokenSet = new Set(brokenModules);
  const queries: Record<string, QueryAnswer> = {};
  const absent: string[] = [];
  const broken: string[] = [];

  for (const read of READS) {
    if (brokenSet.has(read.module)) { broken.push(read.name); continue; }
    const declared = catalogue[read.field];
    if (absentSet.has(read.module)) { absent.push(read.name); continue; }
    if (declared !== undefined) { queries[read.name] = declared; continue; }
    // Nothing said about it: an optional app is simply not here; a hard one is here and empty.
    if (OPTIONAL_MODULES.has(read.module)) absent.push(read.name);
    else queries[read.name] = [];
  }

  // The settings row is the one read that is a ROW and not a list: `[]` means "no row saved", which
  // is a hub the till has to work on exactly as if it had saved the defaults (sales#223).
  queries['sales.pos_settings.get'] = () => {
    const row = typeof settings === 'function' ? settings() : settings;
    return row ? [row] : [];
  };

  return installErploraDouble({ ...rest, queries: { ...queries, ...extraQueries }, absent, broken, failing });
}
