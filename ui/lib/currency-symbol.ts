// currency-symbol — the text a label paints for the hub currency (sales#380, recipe of invoice#94).
//
// `Intl` only gives the SYMBOL of the ISO-4217 code here, with the same default display that
// `erplora().formatMoney` uses, so the label reads like the amounts around it. It never touches an
// amount: money on screen still goes through `formatMoney` (pm#289).

/** `EUR` → `€`, `JPY` (en) → `¥`. A code `Intl` rejects comes back as written; none → ''. */
export function currencySymbol(code: string | undefined, locale: string): string {
  const iso = (code ?? '').trim();
  if (!iso) return '';
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: iso }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? iso;
  } catch {
    return iso;
  }
}
