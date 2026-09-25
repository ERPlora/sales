// The hub currency, as the module's UI reads it. Its own file so that `paper-combos` (imported BY
// `document-mappers`) can read the scale without an import cycle.

/** The hub currency's scale (ADR-0123 §7): what the SDK says when the shell injected it (JPY 0,
 *  KWD 3), else 2. Read at call time, not at module load: the SDK arrives after the bundle. */
export function hubDecimals(): number {
  const d = (globalThis as { erplora?: { currencyDecimals?: unknown } }).erplora?.currencyDecimals;
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : 2;
}
