import { beforeEach, describe, expect, it } from 'vitest';
import { forgetCurrentCheck, rememberCurrentCheck, resolveCurrentCheck } from './current-check';

const almacen = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  } as unknown as Storage;
};

describe('qué cuenta estaba viendo ESTE terminal (ADR-0146)', () => {
  // Lo guardaba `sales_active_cart` con la clave `u:<empleado>`: «el carrito de mostrador de este
  // empleado». Al retirarlo, el POS pasaba a recuperar EL PRIMER pedido abierto — con varias
  // cuentas abiertas eso es aterrizar en la de otro. No es dato de negocio: es estado del
  // dispositivo, así que vive en el dispositivo y no en la BD ni en `tables`.
  let s: Storage;
  beforeEach(() => { s = almacen(); });

  it('recuerda la cuenta y la devuelve si sigue abierta', () => {
    rememberCurrentCheck(s, 'ord-7');
    expect(resolveCurrentCheck(s, ['ord-3', 'ord-7'])).toBe('ord-7');
  });

  it('si la cuenta recordada ya se cobró, NO se cae a otra cualquiera', () => {
    // Aterrizar en la cuenta de otro camarero es peor que empezar en blanco.
    rememberCurrentCheck(s, 'ord-7');
    expect(resolveCurrentCheck(s, ['ord-3', 'ord-9'])).toBeUndefined();
  });

  it('sin nada recordado se empieza en blanco, aunque haya cuentas abiertas', () => {
    expect(resolveCurrentCheck(s, ['ord-3'])).toBeUndefined();
  });

  it('al cobrar o aparcar se olvida', () => {
    rememberCurrentCheck(s, 'ord-7');
    forgetCurrentCheck(s);
    expect(resolveCurrentCheck(s, ['ord-7'])).toBeUndefined();
  });

  it('un almacén que falla (modo privado) no rompe el TPV', () => {
    const roto = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); },
      removeItem: () => { throw new Error('nope'); } } as unknown as Storage;
    expect(() => rememberCurrentCheck(roto, 'ord-7')).not.toThrow();
    expect(resolveCurrentCheck(roto, ['ord-7'])).toBeUndefined();
  });
});
