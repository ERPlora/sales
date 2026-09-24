// El acuñado del claim «pide tu factura» (sales#103, hub#963 / ADR-0363) — el contrato de la
// llamada que hace el mostrador a la puerta pública del hub.
//
// La puerta es REST del CORE (`POST /api/hub/public-claims`), no un command del dispatcher: no
// hay `erplora.command` que la llegue. Este fichero fija el CUERPO que el hub espera (el esquema
// de `invoice.substitute` EXIGE `items` — no se derivan server-side, por eso el payload se sella
// en el mostrador) y la TOLERANCIA: acuñar es best-effort, cualquier fallo deja el tique
// exactamente como hoy (sin claim, sin segundo QR, sin error al cajero).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mintInvoiceRequestClaim, CLAIM_KIND, CLAIM_COMMAND, CLAIM_PUBLIC_FIELDS, CLAIM_FIELD_CHOICES,
} from './public-claim.js';
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };

/** Una F2 real: dos cafés, céntimos, tal cual `invoice.lines` los devuelve. */
const F2_LINES = [
  { id: 'li1', line_number: 1, description: 'Café solo', quantity: 2, unit_price: 120, tax_rate: 10,
    surcharge_rate: 0, tax_category_key: 'product.standard', base_amount: 240, tax_amount: 24,
    total_amount: 264, product_id: 'p-cafe' },
  { id: 'li2', line_number: 2, description: 'Caña', quantity: 1, unit_price: 250, tax_rate: 10,
    surcharge_rate: 0, tax_category_key: 'product.standard', base_amount: 250, tax_amount: 25,
    total_amount: 275, product_id: 'p-cana' },
];

/** fetch que responde como `public_door.rs`: {ok, locator, url} en la raíz. */
function hubFetch(locator = 'ABCD1234ABCD1234'): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, locator, url: `/p/${locator}` }),
  })) as unknown as ReturnType<typeof vi.fn>;
}

describe('mintInvoiceRequestClaim — el cuerpo que la puerta espera', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = originalFetch;
  });

  it('POST a /api/hub/public-claims con kind, subject_id, command, payload sellado y public_fields', async () => {
    const fetchMock = hubFetch();
    const claim = await mintInvoiceRequestClaim('inv-42', F2_LINES, { fetchImpl: fetchMock as unknown as typeof fetch });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/hub/public-claims');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(String(init.body))).toEqual({
      kind: CLAIM_KIND,                       // 'invoice_request'
      subject_id: 'inv-42',                   // = invoice.id de invoice.by_source
      command: CLAIM_COMMAND,                 // 'invoice.substitute'
      sealed_payload: {
        original_invoice_id: 'inv-42',
        items: F2_LINES,                      // las líneas TAL CUAL, ya en céntimos (no se derivan)
      },
      public_fields: CLAIM_PUBLIC_FIELDS,     // lo único que el cliente puede rellenar
      public_field_choices: CLAIM_FIELD_CHOICES, // sales#335: the answers those fields accept
    });
    expect(claim).toEqual({ locator: 'ABCD1234ABCD1234', url: '/p/ABCD1234ABCD1234' });
  });

  // sales#335 — a customer from abroad says where they are from and what their number is, the
  // same two fields the till's charge sheet sends (sales#332); `invoice.substitute` takes both
  // (invoice#82) and the hub's page only shows the pickers when the claim lists them.
  it('lets the customer fill their country and document kind, and nothing sealed', () => {
    expect(CLAIM_PUBLIC_FIELDS).toEqual([
      'customer_tax_id',
      'customer_name',
      'customer_address',
      'customer_country',
      'customer_id_type',
    ]);
    expect(CLAIM_PUBLIC_FIELDS).not.toContain('items');
    expect(CLAIM_PUBLIC_FIELDS).not.toContain('original_invoice_id');
  });

  // sales#335 — the hub's page shows a picker only for choices the MODULE sends: which
  // countries the AEAT accepts is this module's knowledge (foreign-recipient.ts), not the core's.
  it('offers the countries the till offers, Spain first as the default', () => {
    const country = CLAIM_FIELD_CHOICES.customer_country;
    expect(country.names).toBe('region');
    expect(country.label).toEqual({ en: en.ui.claimCountry, es: es.ui.claimCountry });
    const [home, ...rest] = country.options;
    expect(home).toEqual({
      value: '',
      label: {
        en: new Intl.DisplayNames(['en'], { type: 'region' }).of('ES'),
        es: new Intl.DisplayNames(['es'], { type: 'region' }).of('ES'),
      },
    });
    expect(rest).toContain('US');
    expect(rest).toContain('DE');
    // Spain travels as '' only; its regions and the codes the AEAT rejects are not offered.
    for (const code of ['ES', 'IC', 'EA', 'EU', 'XK']) expect(rest).not.toContain(code);
    expect(country.options.length).toBeLessThanOrEqual(400); // the hub's cap per field
  });

  // sales#360 — QU (the AEAT's «not listed», for Kosovo and Western Sahara) has no CLDR name: the
  // hub's page names bare codes with Intl.DisplayNames and would leave the customer a raw «QU».
  it('names the «not listed» country itself, in both languages, once', () => {
    const options = CLAIM_FIELD_CHOICES.customer_country.options;
    expect(options).not.toContain('QU');
    const unlisted = options.filter((o) => typeof o === 'object' && o.value === 'QU');
    expect(unlisted).toEqual([{ value: 'QU', label: { en: en.ui.countryUnlisted, es: es.ui.countryUnlisted } }]);
    expect(en.ui.countryUnlisted).toBeTruthy();
    expect(es.ui.countryUnlisted).toBeTruthy();
  });

  it('asks what the number is: tax or VAT number by default, passport or another document', () => {
    const idType = CLAIM_FIELD_CHOICES.customer_id_type;
    expect(idType.label).toEqual({ en: en.ui.claimIdType, es: es.ui.claimIdType });
    expect(idType.options).toEqual([
      { value: '', label: { en: en.ui.claimIdTypeTax, es: es.ui.claimIdTypeTax } },
      { value: '03', label: { en: en.ui.idType03, es: es.ui.idType03 } },
      { value: '06', label: { en: en.ui.idType06, es: es.ui.idType06 } },
    ]);
    for (const text of [en.ui.claimCountry, es.ui.claimCountry, en.ui.claimIdType, es.ui.claimIdType,
      en.ui.claimIdTypeTax, es.ui.claimIdTypeTax]) {
      expect(text, 'translated in both locales').toBeTruthy();
    }
    expect(es.ui.claimIdTypeTax).not.toBe(en.ui.claimIdTypeTax);
  });

  it('sin líneas no hay acuñamiento: el esquema de invoice.substitute las exige (minItems 1)', async () => {
    const fetchMock = hubFetch();
    expect(await mintInvoiceRequestClaim('inv-42', [], { fetchImpl: fetchMock as unknown as typeof fetch })).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tolera la respuesta envuelta en el sobre {ok, data} de otras puertas del hub', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { locator: 'WRAPPED0000000A', url: '/p/WRAPPED0000000A' } }),
    }));
    const claim = await mintInvoiceRequestClaim('inv-42', F2_LINES, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(claim?.locator).toBe('WRAPPED0000000A');
  });
});

// Acuñar es best-effort por contrato (ADR-0127 en espíritu): el tique NUNCA se queda bloqueado
// por el segundo QR. Cualquier fallo → undefined → el papel sale como siempre.
describe('mintInvoiceRequestClaim — tolerante a todo fallo', () => {
  it('HTTP de error (403 sin permiso invoice.add_invoice, 5xx…) → undefined, sin lanzar', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    expect(await mintInvoiceRequestClaim('inv-42', F2_LINES, { fetchImpl: fetchMock as unknown as typeof fetch })).toBeUndefined();
  });

  it('respuesta sin locator (contrato roto, hub viejo) → undefined', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    expect(await mintInvoiceRequestClaim('inv-42', F2_LINES, { fetchImpl: fetchMock as unknown as typeof fetch })).toBeUndefined();
  });

  it('fallo de red (fetch que revienta) → undefined, sin lanzar', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await mintInvoiceRequestClaim('inv-42', F2_LINES, { fetchImpl: fetchMock as unknown as typeof fetch })).toBeUndefined();
  });

  it('sin fetch disponible (entorno mínimo) → undefined, sin lanzar', async () => {
    (globalThis as { fetch?: unknown }).fetch = undefined;
    expect(await mintInvoiceRequestClaim('inv-42', F2_LINES)).toBeUndefined();
  });
});
