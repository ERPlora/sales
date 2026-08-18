// Test de contrato del detector de errores de transporte (sales#81).
// La firma que se cubre es la que de verdad llega del navegador: el mensaje del parser JSON de
// V8/JSC/SpiderMonkey sobre una respuesta HTML, y el rechazo de `fetch` cuando el servidor no
// contesta. Los errores de DOMINIO pasan tal cual (null).
import { describe, expect, it } from 'vitest';
import { transportErrorKey, SERVER_UNAVAILABLE_KEY } from './transport-error';

describe('transportErrorKey — detecta lo que viene del transporte, no del dominio (sales#81)', () => {
  it('un SyntaxError de parseo de HTML (502 del proxy) es un error de transporte', () => {
    const e = new SyntaxError("Unexpected token '<', \"<!DOCTYPE \" is not valid JSON");
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('un «Failed to fetch» (servidor caído / DNS) es un error de transporte', () => {
    const e = new TypeError('Failed to fetch');
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('un «Load failed» de Safari es un error de transporte', () => {
    // Safari no dice «Failed to fetch»: su mensaje de red es distinto y debe cubrirse también.
    const e = new Error('Load failed');
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('un error de DOMINIO pasa tal cual (no es de transporte)', () => {
    // La frase del servidor lleva el código de dominio que la UI traduce; no se toca.
    expect(transportErrorKey(new Error('command `sales.complete_sale` failed: sales.empty_sale'))).toBeNull();
    expect(transportErrorKey(new Error('permission denied'))).toBeNull();
  });

  it('un error sin mensaje no se clasifica (null)', () => {
    expect(transportErrorKey(new Error())).toBeNull();
    expect(transportErrorKey(null)).toBeNull();
    expect(transportErrorKey(undefined)).toBeNull();
  });
});

// hub#923 (saas#1460): the message the cashier ACTUALLY saw in production when the hub was
// OOM-killed mid-checkout was none of the ones above — WebKit (Tauri macOS webview / Safari)
// surfaced "The string did not match the expected pattern." and the POS displayed it raw, in
// English, over a Spanish UI. The signature set below is every JSON-parse/transport message the
// three engines can emit that the previous patterns missed.
describe('transportErrorKey — the engine messages that leaked raw in saas#1460 (hub#923)', () => {
  it('WebKit "The string did not match the expected pattern." is transport, not domain', () => {
    const e = new TypeError('The string did not match the expected pattern.');
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('JSC "JSON Parse error: Unrecognized token \'<\'" is transport', () => {
    const e = new SyntaxError("JSON Parse error: Unrecognized token '<'");
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('SpiderMonkey "JSON.parse: unexpected character…" is transport', () => {
    const e = new SyntaxError('JSON.parse: unexpected character at line 1 column 1 of the JSON data');
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('old V8 "Unexpected token < in JSON at position 0" is transport', () => {
    const e = new SyntaxError('Unexpected token < in JSON at position 0');
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('a domain rejection mentioning a pattern in its detail still passes through', () => {
    const e = new Error('sales.invalid_sku: value does not match pattern ^[A-Z]');
    expect(transportErrorKey(e)).toBeNull();
  });
});

// sales#91 — since hub#782 the SDK transport throws a TYPED error (`code === SERVER_UNAVAILABLE`,
// exported by `@erplora/module-sdk`) with its own technical message («request to /api/command
// failed: …», «unexpected response from …: HTTP 502 text/html», «… returned an invalid JSON
// body»). None of those match the browser phrases above: keying on the CODE is what makes the
// detector robust; the text sniffing stays only for a transport that still leaks the raw phrase.
describe('transportErrorKey — keys on the typed SDK code first (sales#91)', () => {
  it('an error carrying code=server_unavailable is transport whatever its message says', () => {
    const e = Object.assign(new Error('request to /api/command failed: TypeError: Load failed'), { code: 'server_unavailable' });
    expect(transportErrorKey(e)).toBe(SERVER_UNAVAILABLE_KEY);
    const proxy = Object.assign(new Error('unexpected response from /api/command: HTTP 502 text/html'), { code: 'server_unavailable' });
    expect(transportErrorKey(proxy)).toBe(SERVER_UNAVAILABLE_KEY);
  });

  it('a typed DOMAIN error is not transport, even if its message mentions fetch', () => {
    const e = Object.assign(new Error('Failed to fetch the customer'), { code: 'sales.customer_required' });
    expect(transportErrorKey(e)).toBeNull();
  });
});
