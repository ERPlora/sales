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
