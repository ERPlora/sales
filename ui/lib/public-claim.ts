// public-claim — la mitad de `sales` del autoservicio «pide tu factura» (sales#103, hub#963 /
// ADR-0363).
//
// El core sirve una primitiva genérica: una fila que dice «quien tenga este localizador ejecuta
// ESTE command, sobre ESTE sujeto, UNA vez, hasta ESTA fecha». Acuñarla es un REST del core
// (`POST /api/hub/public-claims`), no un command del dispatcher — `erplora.command` no llega ahí,
// igual que no llega a `/api/hub/flows*` (hub#714). La llamada va same-origin con las credenciales
// de la sesión del cajero: es el mostrador el que acuña, nunca el navegador del cliente.
//
// Dos reglas de este fichero:
//
// 1. **Best-effort, siempre.** Acuñar es un EXTRA sobre un tique que ya es válido: cualquier
//    fallo (red, 403 sin `invoice.add_invoice`, hub viejo sin la puerta) devuelve `undefined` y el
//    papel sale exactamente como hoy — sin claim, sin segundo QR, sin error que el cajero tenga
//    que atender. Nada de este fichero puede tumbar un cobro.
// 2. **El payload se sella AQUÍ.** `invoice.substitute` EXIGE `items` y no los deriva de
//    `original_invoice_id` server-side: las líneas (`invoice.lines`, ya en céntimos) viajan dentro
//    de `sealed_payload`, y `public_fields` es la lista blanca de lo ÚNICO que el visitante puede
//    rellenar — todo lo demás que mande el navegador del cliente se tira en la puerta.

/** El `kind` del claim de autoservicio de facturas. No es el único posible (ADR-0363), sí el primero. */
export const CLAIM_KIND = 'invoice_request';

/** El command que la puerta ejecutará al canjear: la F3 completa que sustituye a la F2 (ADR-0140). */
export const CLAIM_COMMAND = 'invoice.substitute';

/** Lo que el cliente PUEDE rellenar en la página pública: su identificación fiscal, nada más. */
export const CLAIM_PUBLIC_FIELDS: string[] = ['customer_tax_id', 'customer_name', 'customer_address'];

/** Un claim acuñado, tal como lo devuelve la puerta: el localizador y su URL (relativa al hub). */
export interface MintedClaim {
  /** Base32 Crockford, 16 caracteres, 80 bits de HMAC — es TODA la autorización del canje. */
  locator: string;
  /** `/p/<locator>`; el que imprime es el QR (absoluto) y la página del hub la sirve. */
  url: string;
}

export interface MintClaimOptions {
  /** Inyectable para tests (defecto: el `fetch` global, same-origin como el resto de la PWA). */
  fetchImpl?: typeof fetch;
  /** Path de la puerta (defecto: la ruta del core, mismo origen que la app). */
  path?: string;
}

/**
 * Acuña (o recupera — es IDEMPOTENTE por `(kind, subject_id)`) el claim de una F2.
 *
 * Llamar en cada impresión es el uso previsto: una reimpresión devuelve el localizador que la
 * copia del cliente ya lleva (el locator es determinista: `HMAC(clave, kind ‖ subject_id)`), así
 * que aquí no hay estado que llevar. `items` son las líneas de `invoice.lines` TAL CUAL: el
 * esquema de `invoice.substitute` las exige (`minItems: 1`) con sus importes ya en céntimos.
 */
export async function mintInvoiceRequestClaim(
  invoiceId: string,
  items: Record<string, unknown>[],
  opts: MintClaimOptions = {},
): Promise<MintedClaim | undefined> {
  if (!invoiceId || !Array.isArray(items) || items.length === 0) return undefined;
  const doFetch = opts.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch?.bind(globalThis);
  if (!doFetch) return undefined;
  try {
    const res = await doFetch(opts.path ?? '/api/hub/public-claims', {
      method: 'POST',
      // La sesión del cajero va con la llamada: same-origin, como todo lo que el WC pide al hub.
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: CLAIM_KIND,
        subject_id: invoiceId,
        command: CLAIM_COMMAND,
        sealed_payload: { original_invoice_id: invoiceId, items },
        public_fields: [...CLAIM_PUBLIC_FIELDS],
      }),
    });
    if (!res.ok) return undefined;
    // La puerta responde {ok, locator, url} en la raíz (public_door.rs); se tolera también el
    // sobre {ok, data} de otras superficies del core por si la puerta lo adopta.
    const body = (await res.json()) as {
      locator?: string; url?: string; data?: { locator?: string; url?: string };
    };
    const locator = body.locator ?? body.data?.locator;
    if (!locator) return undefined;
    return { locator, url: body.url ?? body.data?.url ?? `/p/${locator}` };
  } catch {
    return undefined; // red caída, JSON roto…: sin claim y en paz (regla 1 de la cabecera)
  }
}
