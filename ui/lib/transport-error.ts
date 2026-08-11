// sales#81 — el límite del módulo frente a un transporte que filtra HTML.
//
// El hub, cuando su contenedor muere (OOM exit 137, hub#759), cae detrás del proxy y este
// devuelve `502 text/html` — una página `<!DOCTYPE html>…`. El transporte del SDK
// (`module-sdk.post`) hace `res.json()` sin inspeccionar `res.ok` ni el `Content-Type`, así que
// lanza un `SyntaxError` sin envolver:
//
//   "Unexpected token '<', \"<!DOCTYPE \" is not valid JSON"
//
// Ese mensaje de parseo NO es accionable para un cajero: no dice ni que el servidor está caído,
// ni que hay que avisar al encargado. La guarda de transporte (`res.ok` + content-type) es del
// hub (issue aparte, ERPlora/hub). Lo que VIVE aquí es la traducción en el límite del módulo:
// aunque el transporte siga tirando el mensaje crudo, sales lo convierte a algo útil para quien
// está cobrando. La misma puerta cubre un `Failed to fetch` de un servidor que no responde (DNS,
// red, reinicio) — otro síntoma de «el hub no está ahí», mismo mensaje de negocio.
//
// Los errores de DOMINIO reales (sales.empty_sale, permission denied, …) pasan TAL CUAL: la UI
// se orienta por su código y su frase sí le sirve al cajero. Solo se traduce lo que no es de
// negocio.

/** Clave del catálogo i18n del módulo para «el servidor no responde». */
export const SERVER_UNAVAILABLE_KEY = 'ui.serverUnavailable';

/**
 * Detecta un error que viene del TRANSPORTE (no del dominio) y devuelve la clave i18n de un
 * mensaje de negocio; `null` si el error es de dominio y su mensaje debe mostrarse tal cual.
 *
 * Firma cubierta:
 *  - parseo de una respuesta NO-JSON (el 502 HTML del proxy): todos los motores JS terminan el
 *    `SyntaxError` con `… is not valid JSON` (V8, JSC y SpiderMonkey coinciden en esa cola).
 *  - el `fetch` que no llega al servidor (contenedor abajo, DNS, red cortada): Chrome/Firefox
 *    dicen `Failed to fetch`, Safari `Load failed`.
 */
export function transportErrorKey(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (!msg) return null;
  // El 502 HTML del proxy: el parser JSON revienta sobre el `<!DOCTYPE`. Cadena común a los
  // tres motores; el `instanceof SyntaxError` no basta (happy-dom y motores viejos lo pierden).
  if (msg.includes('is not valid JSON')) return SERVER_UNAVAILABLE_KEY;
  // El servidor no contesta (caído/reiniciándose): `fetch` rechaza ANTES de tocar el body, así
  // que no hay `res.json()` que rompa — el navegador entrega su mensaje de red propio.
  if (/^(Failed to fetch|Load failed|NetworkError)/i.test(msg)) return SERVER_UNAVAILABLE_KEY;
  return null;
}
