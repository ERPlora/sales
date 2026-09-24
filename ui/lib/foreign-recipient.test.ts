// sales#332 — who the invoice is made out to when the customer is from abroad.
//
// The rest of the chain already declares a foreign customer properly (hub#1967): the invoice keeps
// `customer_country` + `customer_id_type` and the engine files an IDOtro. The till only has to ask
// for them. Market shape (Odoo `l10n_es_edi_verifactu`): the COUNTRY of the contact decides the
// block, not the number; the kind of document is only asked outside Spain, with a sensible default.
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_CODES, ID_TYPE_OPTIONS, UNLISTED_COUNTRY, countryFromDetail, countryOptions, defaultIdType,
  recipientCountryPayload, recipientFromDetail,
} from './foreign-recipient';

/** The picker's label for the AEAT's «Otros países o territorios no relacionados» (from the locales). */
const UNLISTED = { en: 'Other countries or territories not listed', es: 'Otros países o territorios no relacionados' };

describe('defaultIdType — do not ask more than needed', () => {
  it('Spain has no document kind: the number is a NIF', () => {
    expect(defaultIdType('ES')).toBe('');
  });
  it('inside the EU the usual number is the EU VAT number (02)', () => {
    for (const c of ['FR', 'DE', 'PT', 'IT', 'GR']) expect(defaultIdType(c), c).toBe('02');
  });
  it('outside the EU it is the tax id of their country (04)', () => {
    for (const c of ['US', 'GB', 'CH', 'MA', 'NO']) expect(defaultIdType(c), c).toBe('04');
  });
});

describe('countryFromDetail — the customer file pre-fills the country', () => {
  it('takes an ISO code from the customer file, in any case and spacing', () => {
    expect(countryFromDetail('us')).toBe('US');
    expect(countryFromDetail(' fr ')).toBe('FR');
  });
  it('anything that is not a known ISO code falls back to Spain, the till’s own country', () => {
    for (const raw of [undefined, null, '', 'España', 'USA', 'ZZ']) expect(countryFromDetail(raw), String(raw)).toBe('ES');
  });
});

describe('recipientFromDetail — a territory in the customer file travels as its parent country (sales#336)', () => {
  // `customers` resolves the file's text to the real ISO code («Guayana Francesa» → GF). The AEAT's
  // CodigoPais (CountryType2) has no GF, GP… : it declares them under the parent country. They are
  // also outside the EU VAT territory (Directive 2006/112/EC art. 6), so their usual number is not
  // an EU VAT number (02) but the tax id of the territory (04).
  const PARENTS: Record<string, string> = {
    GF: 'FR', GP: 'FR', MQ: 'FR', BL: 'FR', MF: 'FR', CP: 'FR',
    AX: 'FI', SJ: 'NO', AC: 'SH', TA: 'SH', DG: 'IO', CQ: 'GG',
  };
  it('🔴 a French overseas customer is invoiced as France, not Spain', () => {
    expect(recipientFromDetail('GF')).toEqual({ country: 'FR', idType: '04' });
    expect(recipientFromDetail(' gp ')).toEqual({ country: 'FR', idType: '04' });
  });
  it('every territory the AEAT does not list maps to an accepted parent, with the tax id (04)', () => {
    for (const [code, parent] of Object.entries(PARENTS)) {
      expect(COUNTRY_CODES, parent).toContain(parent);
      expect(recipientFromDetail(code), code).toEqual({ country: parent, idType: '04' });
      expect(countryFromDetail(code), code).toBe(parent);
    }
  });
  it('a country keeps its own usual document kind', () => {
    expect(recipientFromDetail('fr')).toEqual({ country: 'FR', idType: '02' });
    expect(recipientFromDetail('US')).toEqual({ country: 'US', idType: '04' });
    expect(recipientFromDetail('ES')).toEqual({ country: 'ES', idType: '' });
  });
  it('Canarias and Ceuta y Melilla are Spain', () => {
    for (const code of ['IC', 'EA']) expect(recipientFromDetail(code), code).toEqual({ country: 'ES', idType: '' });
  });
});

describe('Kosovo and Western Sahara travel as the AEAT’s «not listed» country (sales#360)', () => {
  // Neither is in CountryType2 nor in the note of any listed country. The AEAT list has a code for
  // exactly this: QU «Otros países o territorios no relacionados». Before, they fell back to Spain
  // and the customer's number travelled as a Spanish NIF, which the AEAT rejects.
  it('🔴 a customer from Kosovo or Western Sahara is not invoiced as Spain', () => {
    for (const code of ['XK', ' xk ', 'EH', 'eh']) {
      expect(recipientFromDetail(code), code).toEqual({ country: 'QU', idType: '04' });
    }
    expect(UNLISTED_COUNTRY).toBe('QU');
  });
  it('the cashier can pick it by hand too, and it travels as a foreign country with its tax id', () => {
    expect(COUNTRY_CODES).toContain('QU');
    expect(recipientFromDetail('QU')).toEqual({ country: 'QU', idType: '04' });
    expect(defaultIdType('QU')).toBe('04');
    expect(recipientCountryPayload('QU', '04')).toEqual({ customer_country: 'QU', customer_id_type: '04' });
  });
  it('the picker names it with the translated label, after every named country', () => {
    for (const lang of ['es', 'en'] as const) {
      const opts = countryOptions(lang, UNLISTED[lang]);
      expect(opts.at(-1), lang).toEqual({ code: 'QU', name: UNLISTED[lang] });
      expect(opts.filter((o) => o.code === 'QU'), lang).toHaveLength(1);
    }
  });
});

describe('recipientCountryPayload — what travels with the sale', () => {
  it('🔴 Spain sends nothing: the VAT prefix keeps deciding, exactly as before', () => {
    // Sending 'ES' would force a Spanish NIF even for a typed «FR…» number (hub aeat.rs).
    expect(recipientCountryPayload('ES', '02')).toEqual({ customer_country: '', customer_id_type: '' });
  });
  it('a foreign customer sends their country and the kind of document', () => {
    expect(recipientCountryPayload('US', '03')).toEqual({ customer_country: 'US', customer_id_type: '03' });
  });
});

describe('the lists the cashier picks from', () => {
  it('every country is an ISO alpha-2 code, Spain and the usual ones included, no repeats', () => {
    for (const c of COUNTRY_CODES) expect(c).toMatch(/^[A-Z]{2}$/);
    for (const c of ['ES', 'FR', 'US', 'GB', 'MA', 'CN']) expect(COUNTRY_CODES).toContain(c);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });
  it('the document kinds are AEAT IDTypes the invoice accepts', () => {
    expect(ID_TYPE_OPTIONS).toEqual(['02', '04', '03', '06']);
  });
  it('country names come in the user’s language, sorted by that name, Spain first', () => {
    const es = countryOptions('es', UNLISTED.es);
    expect(es[0]).toEqual({ code: 'ES', name: 'España' });
    expect(es.find((o) => o.code === 'DE')?.name).toBe('Alemania');
    const rest = es.slice(1, -1).map((o) => o.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'es')));
    expect(countryOptions('en', UNLISTED.en).find((o) => o.code === 'DE')?.name).toBe('Germany');
  });
});

describe('only countries the AEAT accepts as CodigoPais are offered (CountryType2)', () => {
  // CLDR names 27 regions the AEAT enumeration (SuministroInformacion.xsd, vendored in the hub)
  // does not accept. Picking one spends a chain number and comes back as a 4102.
  it('Canarias and Ceuta y Melilla are Spain, not a foreign country', () => {
    for (const c of ['IC', 'EA']) expect(COUNTRY_CODES, c).not.toContain(c);
  });
  it('territories declared under their parent country or as «not listed», and dead aliases, are not offered', () => {
    const notAccepted = 'AC AN AX BL BU CP CQ CS DD DG DY EH FX GF GP HV MF MQ NH RH SJ SU TA TP UK VD XK YD YU ZR'.split(' ');
    for (const c of notAccepted) expect(COUNTRY_CODES, c).not.toContain(c);
    // Sanity: the filter must not eat real, accepted countries.
    for (const c of ['FR', 'GB', 'US', 'CW', 'RS', 'RU', 'CD', 'TL', 'MM']) expect(COUNTRY_CODES, c).toContain(c);
  });
  it('no two offered countries share a name, in es or en', () => {
    for (const lang of ['es', 'en'] as const) {
      const names = countryOptions(lang, UNLISTED[lang]).map((o) => o.name);
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes, lang).toEqual([]);
    }
  });
});
