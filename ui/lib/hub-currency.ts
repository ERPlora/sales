// The hub currency, as the module's UI reads it. Its own file so that `paper-combos` (imported BY
// `document-mappers`) can read the scale without an import cycle.

/** The hub currency's scale (ADR-0123 §7): what the SDK says when the shell injected it (JPY 0,
 *  KWD 3), else 2. Read at call time, not at module load: the SDK arrives after the bundle. */
export function hubDecimals(): number {
  const d = (globalThis as { erplora?: { currencyDecimals?: unknown } }).erplora?.currencyDecimals;
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : 2;
}

// sales#379 — the till's keypads (cash tendered, fixed-amount discount, open price) build the
// amount as TEXT in the major unit, with '.' as separator. The sale contract is the minor unit
// (ADR-0007/0123), and the step between the two is the hub scale — not the SDK's
// `eurosToCents`/`centsToEuros`, which pin two decimals (1000 ¥ handed over became 100000).

/** Keypad text → minor units in the hub scale. Empty or garbage is 0, never NaN. */
export function typedToMinor(text: string): number {
  const n = Number(text || '0');
  return Number.isFinite(n) ? Math.round(n * 10 ** hubDecimals()) : 0;
}

/** Minor units → the keypad text that `typedToMinor` reads back (1250 → '12.50' in EUR, '1.250'
 *  in KWD, '1250' in JPY). Built from the digits, so no float rounding on the way. */
export function minorToTyped(minor: number): string {
  const d = hubDecimals();
  const digits = String(Math.abs(Math.round(minor))).padStart(d + 1, '0');
  const sign = minor < 0 ? '-' : '';
  return d === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -d)}.${digits.slice(-d)}`;
}

/** The keypad accumulator: 'C' clears, one separator, 9 characters at most — and no more digits
 *  after the separator than the hub currency has (none in yen: the separator is refused). */
export function pushTypedKey(cur: string, k: string): string {
  if (k === 'C') return '';
  const d = hubDecimals();
  if (k === '.') return d === 0 || cur.includes('.') ? cur : (cur + k).slice(0, 9);
  const dot = cur.indexOf('.');
  if (dot >= 0 && cur.length - dot - 1 >= d) return cur;
  return (cur + k).slice(0, 9);
}
