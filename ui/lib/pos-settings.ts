// pos-settings — the counter's operational policy, and the ONE place the UI keeps its defaults.
//
// The policy arrives from `sales.pos_settings.get` (sales#25, widened by sales#203): a door a
// `cashier` can open, unlike the admin-only `sales.settings.get`. A brand new hub has NO row in
// `sales_settings` at all, and the read answers an empty set — so every reader on the screen had
// to decide, on its own, what absence meant. They decided it with `field !== 0`, and `undefined
// !== 0` is `true`: absence read as ON for every switch, including the ones that ship OFF.
//
// That is how the same freshly installed hub offered bank transfer until somebody opened Ajustes
// and pressed Save without changing anything (sales#223). Two defaults that never spoke: the
// column and the JSON schema agreed on OFF, the screen's fallback said ON.
//
// So the row is resolved HERE, at the door, and never read raw again:
//
//   - every declared setting is present, so `!== 0` cannot see `undefined`;
//   - flags are the 0/1 INTEGER of the portable SQL subset (ADR-0007) whatever form the driver
//     hands back ('0', false, 0 all land on 0);
//   - the defaults live in `POS_SETTINGS_DEFAULTS` and nowhere else. `settings-defaults-contract`
//     pins that map to `schemas/settings_update.json` and to the migration's column DEFAULTs, so
//     the three cannot drift again.

/** The counter's operational policy, as `sales.pos_settings.get` hands it back (sales#25/#203).
 *  Every field here is read by the screen or printed on the paper, and every one of them arrives
 *  through a door a `cashier` can open — the admin-only `sales.settings.get` is not used by the
 *  till at all. */
export interface PosSettings {
  default_document_format?: string; currency?: string; enable_parked_tickets?: number;
  default_tax_included?: number;
  /** sales#203 — the receipt, as the shop configured it. The paper mappers take them from here
   *  (`billSettings`); through the admin door they were blank for whoever actually prints it. */
  receipt_header?: string; receipt_footer?: string; receipt_footer_image?: string;
  receipt_marketing_url?: string; receipt_marketing_text?: string;
  /** sales#203 — the hub demands a customer on every sale. The RULE is the server's
   *  (`sales.complete_sale` enforces it from its own declared `reads`, which run with system
   *  permissions); the till carries it so screen and server decide from the same row. */
  require_customer?: number;
  /** Payment methods allowed (Ajustes). 0 = switched off. */
  allow_cash?: number; allow_card?: number; allow_transfer?: number;
  /** sales#71: manual discounts allowed (Ajustes). 0 = no button; the server revalidates it. */
  allow_discounts?: number;
  /** sales#25 — which catalogue providers feed the grid. 0 = that provider is not read at all. */
  sync_products?: number; sync_services?: number;
  /** hub#962: a customer who identified themselves with a tax id wants an invoice. */
  auto_invoice_with_tax_id?: number | boolean;
}

/**
 * What the till is out of the box, when nobody has saved the settings yet.
 *
 * 🔴 This is the UI's single source of defaults. It is NOT free to write: `settings-defaults-
 * contract.test.ts` checks every entry against the `default` declared in
 * `schemas/settings_update.json` — which is itself pinned to the `DEFAULT` of the column in
 * `migrations/postgres`. Changing a default means changing all three, in a migration, on purpose.
 *
 * Flags are 0/1 because that is how the portable SQL subset stores booleans (ADR-0007) and how the
 * whole screen reads them.
 */
export const POS_SETTINGS_DEFAULTS: Readonly<Required<Omit<PosSettings, 'currency'>>> = Object.freeze({
  allow_cash: 1,
  allow_card: 1,
  allow_transfer: 0,
  sync_products: 1,
  sync_services: 1,
  require_customer: 0,
  allow_discounts: 1,
  enable_parked_tickets: 1,
  default_tax_included: 1,
  auto_invoice_with_tax_id: 0,
  default_document_format: 'ticket',
  receipt_header: '',
  receipt_footer: '',
  receipt_footer_image: '',
  receipt_marketing_url: '',
  receipt_marketing_text: '',
});

/** Is this value the row actually saying something? `undefined` and `null` are absence — a hub
 *  with no settings row, or a row older than the column. Everything else, empty string included,
 *  is a choice the shop made. */
function saved(v: unknown): boolean {
  return v !== undefined && v !== null;
}

/** A flag as the screen reads it: the 0/1 INTEGER of the portable SQL subset (ADR-0007), whatever
 *  form the driver hands back. `'0'` is OFF — `'0' !== 0` was true, which is the same class of
 *  defect as `undefined !== 0`. */
function asFlag(v: unknown): number {
  if (v === false || v === 0 || v === '0' || v === '') return 0;
  return 1;
}

/**
 * The policy the screen decides with: the saved row completed with the declared defaults, and its
 * flags normalised to 0/1.
 *
 * A hub with no row and a hub that saved the defaults come out of here IDENTICAL, which is the
 * whole property sales#223 asks for. Columns this build does not know about are carried through
 * untouched: modules update themselves and the hub image does not, so a newer query may project
 * more than this version has a default for.
 */
export function withPosSettingsDefaults(row: Record<string, unknown> | PosSettings | null | undefined): PosSettings {
  const raw = (row ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };
  for (const [key, fallback] of Object.entries(POS_SETTINGS_DEFAULTS)) {
    const v = raw[key];
    if (!saved(v)) { out[key] = fallback; continue; }
    out[key] = typeof fallback === 'string' ? String(v) : asFlag(v);
  }
  return out as PosSettings;
}
