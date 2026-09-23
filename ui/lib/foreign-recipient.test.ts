// sales#332 — who the invoice is made out to when the customer is from abroad.
//
// The rest of the chain already declares a foreign customer properly (hub#1967): the invoice keeps
// `customer_country` + `customer_id_type` and the engine files an IDOtro. The till only has to ask
// for them. Market shape (Odoo `l10n_es_edi_verifactu`): the COUNTRY of the contact decides the
// block, not the number; the kind of document is only asked outside Spain, with a sensible default.
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_CODES, ID_TYPE_OPTIONS, countryFromDetail, countryOptions, defaultIdType, recipientCountryPayload,
} from './foreign-recipient';

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
    const es = countryOptions('es');
    expect(es[0]).toEqual({ code: 'ES', name: 'España' });
    expect(es.find((o) => o.code === 'DE')?.name).toBe('Alemania');
    const rest = es.slice(1).map((o) => o.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'es')));
    expect(countryOptions('en').find((o) => o.code === 'DE')?.name).toBe('Germany');
  });
});
