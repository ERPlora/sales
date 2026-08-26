// sales#207 (ADR-0398) — the sentence a DECLARED domain code carries.
//
// The manifest declares which codes this module provides; `locales/<lang>.json → errors.<code>`
// carries their text, in English (source) and Spanish (ADR-0055). This is the reader: the
// screen-agnostic sentence for a code, for every path that has no wording of its own. It is what
// replaced painting `e.message` — the server's detail, written for whoever reads the log, in the
// language the handler happened to be written in.
//
// It does NOT replace `checkoutErrorKey` / `voidErrorKey` / `refundErrorKey`: those exist because
// a screen that knows WHERE the operator is can say something better and more actionable than the
// catalogue can ("remove the line and add it again"), and because several codes deliberately
// collapse into one call to action there. The division is: the screen's key when the screen has
// something better to say, the declared catalogue otherwise, and never the raw message.

/** `catalog` is `{ <lang>: { errors: { "<module>.<code>": "…" } } }` — what the WC imports. */
type Catalogs = Record<string, unknown>;

/** The source language of every string (ADR-0055): the fallback when the active one is missing. */
const SOURCE_LANG = 'en';

function textFor(catalog: Catalogs, lang: string, code: string): string {
  const dict = catalog[lang] as { errors?: Record<string, unknown> } | undefined;
  const text = dict?.errors?.[code];
  return typeof text === 'string' && text.trim() ? text : '';
}

/**
 * The declared sentence for the code an error carries, or `''` when there is none.
 *
 * `''` and not the message on purpose: the caller knows which screen it is and picks its own
 * fallback (`ui.errorStats`, `ui.errorLoadSale`…). Handing back `e.message` here would put the
 * server's detail back on screen through the very door that was closed.
 */
export function domainErrorText(catalog: Catalogs, locale: string, e: unknown): string {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== 'string' || !code) return '';
  return textFor(catalog, locale, code) || textFor(catalog, SOURCE_LANG, code);
}
