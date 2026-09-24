// sales#332 — who the invoice is made out to when the customer is from abroad.
//
// The country decides (Odoo `l10n_es_edi_verifactu` shape): Spain sends nothing and the tax id's
// VAT prefix keeps deciding downstream; any other country travels with the kind of document its
// number is, so `invoice` + the hub declare an IDOtro (hub#1967). Country names are not written
// here: the runtime's `Intl.DisplayNames` gives them in the user's language.

/** The till's own country: the default, and the one that needs no document kind. */
export const HOME_COUNTRY = 'ES';

/** Region codes CLDR names that are not a `CodigoPais` the AEAT accepts (`CountryType2` in
 *  SuministroInformacion.xsd, vendored in the hub's verifactu crate): groupings and pseudo-locales
 *  (EU, EZ, QO, UN, XA, XB, ZZ); Spanish regions, which are Spain (IC Canarias, EA Ceuta y
 *  Melilla); dead aliases that would list a country twice (AN, BU, CS, DD, DY, FX, HV, NH, RH, SU,
 *  TP, UK, VD, YD, YU, ZR); territories the AEAT declares under their parent country (AC, AX,
 *  BL, CP, CQ, DG, GF, GP, MF, MQ, SJ, TA); and the two it lists nowhere (XK Kosovo, EH Western
 *  Sahara), which go as [`UNLISTED_COUNTRY`]. Offering one spends a chain number and comes back as
 *  a 4102. */
const NOT_A_COUNTRY = new Set(
  'EU EZ QO UN XA XB ZZ IC EA AN BU CS DD DY FX HV NH RH SU TP UK VD YD YU ZR AC AX BL CP CQ DG EH GF GP MF MQ SJ TA XK'
    .split(' '),
);

/** sales#360 — the AEAT's own code for «Otros países o territorios no relacionados» (`CountryType2`
 *  and the AEAT's list of country codes): what a country or territory it does not list travels as.
 *  CLDR has no name for it, so the picker's label comes from the locales. */
export const UNLISTED_COUNTRY = 'QU';

/** Every ISO 3166 alpha-2 code the runtime can name, generated rather than listed by hand, plus
 *  [`UNLISTED_COUNTRY`]. */
export const COUNTRY_CODES: readonly string[] = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const out: string[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code && !NOT_A_COUNTRY.has(code)) out.push(code);
    }
  }
  out.push(UNLISTED_COUNTRY);
  return out;
})();

/** Member states whose usual number is the EU VAT number (AEAT IDType 02). */
const EU_MEMBERS = new Set(
  'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '),
);

/** The document kinds the cashier picks from, most usual first (AEAT IDType codes; their labels
 *  live in the locales as `ui.idType<code>`). */
export const ID_TYPE_OPTIONS: readonly string[] = ['02', '04', '03', '06'];

/** The kind of document to pre-select so the cashier is not asked more than needed. */
export function defaultIdType(country: string): string {
  if (country === HOME_COUNTRY) return '';
  return EU_MEMBERS.has(country) ? '02' : '04';
}

/** sales#336 — territories the AEAT declares under their parent country (not in `CountryType2`),
 *  and that parent. All of them sit outside the EU VAT territory (Directive 2006/112/EC art. 6)
 *  or outside the EU, so their usual number is the territory's tax id, never an EU VAT number.
 *  sales#360 — Kosovo (XK) and Western Sahara (EH) have no parent the AEAT lists: they go as
 *  [`UNLISTED_COUNTRY`], also with their tax id. */
const TERRITORY_PARENT: Readonly<Record<string, string>> = {
  GF: 'FR', GP: 'FR', MQ: 'FR', BL: 'FR', MF: 'FR', CP: 'FR',
  AX: 'FI', SJ: 'NO', AC: 'SH', TA: 'SH', DG: 'IO', CQ: 'GG',
  XK: UNLISTED_COUNTRY, EH: UNLISTED_COUNTRY,
};

/** Who the customer file (`customers_customer.country`, an ISO code) says the recipient is: the
 *  country the AEAT accepts and the kind of document usual there. A territory travels as its
 *  parent country with the territory's tax id (04). Free text, an unknown code or nothing falls
 *  back to the till's own country. */
export function recipientFromDetail(raw: unknown): { country: string; idType: string } {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  const parent = TERRITORY_PARENT[code];
  if (parent) return { country: parent, idType: '04' };
  const country = COUNTRY_CODES.includes(code) ? code : HOME_COUNTRY;
  return { country, idType: defaultIdType(country) };
}

/** The country the customer file brings, as a code the AEAT accepts (see `recipientFromDetail`). */
export function countryFromDetail(raw: unknown): string {
  return recipientFromDetail(raw).country;
}

/** What travels in `sales.complete_sale`. Spain sends '' in both: a forced 'ES' would declare a
 *  typed «FR…» number as a Spanish NIF, and '' is what every sale sent before. */
export function recipientCountryPayload(country: string, idType: string) {
  return country === HOME_COUNTRY
    ? { customer_country: '', customer_id_type: '' }
    : { customer_country: country, customer_id_type: idType };
}

/** The country picker's options in the user's language: Spain first, the rest by name, and
 *  [`UNLISTED_COUNTRY`] last with `unlistedName` (the translated label CLDR does not have). */
export function countryOptions(lang: string, unlistedName: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([lang], { type: 'region' });
  const named = (code: string) => ({ code, name: names.of(code) ?? code });
  const rest = COUNTRY_CODES.filter((c) => c !== HOME_COUNTRY && c !== UNLISTED_COUNTRY).map(named);
  rest.sort((a, b) => a.name.localeCompare(b.name, lang));
  return [named(HOME_COUNTRY), ...rest, { code: UNLISTED_COUNTRY, name: unlistedName }];
}
