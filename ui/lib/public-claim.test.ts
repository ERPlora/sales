// El acuñado del claim «pide tu factura» (sales#103, hub#963 / ADR-0363) — el contrato de la
// llamada que hace el mostrador a la puerta pública del hub.
//
// La puerta es REST del CORE (`POST /api/hub/public-claims`), no un command del dispatcher: no
// hay `erplora.command` que la llegue. Este fichero fija el CUERPO que el hub espera (el esquema
// de `invoice.substitute` EXIGE `items` — no se derivan server-side, por eso el payload se sella
// en el mostrador) y la TOLERANCIA: acuñar es best-effort, cualquier fallo deja el tique
// exactamente como hoy (sin claim, sin segundo QR, sin error al cajero).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintInvoiceRequestClaim, CLAIM_KIND, CLAIM_COMMAND, CLAIM_PUBLIC_FIELDS } from './public-claim.js';

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
