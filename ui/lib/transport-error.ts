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

import { SERVER_UNAVAILABLE } from '@erplora/module-sdk';

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
  // sales#91 — desde hub#782 el transporte del SDK lanza un error TIPADO (`code === SERVER_UNAVAILABLE`,
  // exportado por `@erplora/module-sdk`) con un mensaje técnico propio que ninguna firma de texto de
  // abajo reconoce («request to /api/command failed: …», «unexpected response …: HTTP 502 text/html»).
  // El código manda: si viene, decide él. Y un error de DOMINIO tipado (`sales.customer_required`)
  // nunca es de transporte, diga lo que diga su frase — no se olfatea.
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && code) return code === SERVER_UNAVAILABLE ? SERVER_UNAVAILABLE_KEY : null;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (!msg) return null;
  // El 502 HTML del proxy: el parser JSON revienta sobre el `<!DOCTYPE`. Cadena común a los
  // tres motores; el `instanceof SyntaxError` no basta (happy-dom y motores viejos lo pierden).
  if (msg.includes('is not valid JSON')) return SERVER_UNAVAILABLE_KEY;
  // El servidor no contesta (caído/reiniciándose): `fetch` rechaza ANTES de tocar el body, así
  // que no hay `res.json()` que rompa — el navegador entrega su mensaje de red propio.
  if (/^(Failed to fetch|Load failed|NetworkError)/i.test(msg)) return SERVER_UNAVAILABLE_KEY;
  // hub#923 — la firma que SÍ vio la cajera cuando el hub murió por OOM a mitad del cobro
  // (saas#1460) y que ninguna de las de arriba cubría. Cada motor tiene su frase para «no pude
  // parsear esto»; WebKit (webview de Tauri en macOS, Safari) ni siquiera nombra el JSON:
  //   WebKit/JSC : "The string did not match the expected pattern."
  //                "JSON Parse error: Unrecognized token '<'"
  //   V8 viejo   : "Unexpected token < in JSON at position 0"
  //   SpiderMonkey: "JSON.parse: unexpected character at line 1 column 1…"
  // La de WebKit es la más traicionera: suena a validación de negocio, así que se colaba entera
  // en pantalla. Se ancla la frase COMPLETA (no la palabra «pattern» suelta) para no tragarse un
  // rechazo de dominio que hable de patrones en su detalle.
  if (msg.includes('The string did not match the expected pattern')) return SERVER_UNAVAILABLE_KEY;
  if (msg.startsWith('JSON Parse error')) return SERVER_UNAVAILABLE_KEY;
  if (msg.startsWith('JSON.parse:')) return SERVER_UNAVAILABLE_KEY;
  if (/^Unexpected token .* in JSON/.test(msg)) return SERVER_UNAVAILABLE_KEY;
  return null;
}
