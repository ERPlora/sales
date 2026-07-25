import { describe, expect, it } from 'vitest';
import { defaultParkLabel } from './park-label';

// El nombre por defecto al APARCAR una cuenta. La regla (rediseño 2026-07-19, patrón Loyverse):
// si la cuenta viene de una MESA, el nombre ES la mesa (una pulsación, sin preguntar); sin mesa,
// la HORA — es lo que el cajero reconoce («la de las 15:07») y se sobreescribe de un toque.
describe('nombre por defecto al aparcar', () => {
  const nowAt = (h: number, m: number) => new Date(2026, 6, 19, h, m, 42);

  it('con mesa, el nombre es la mesa tal cual', () => {
    expect(defaultParkLabel('Mesa 4', nowAt(15, 7))).toBe('Mesa 4');
  });

  it('la mesa llega con espacios de más: se limpia, no se pierde', () => {
    expect(defaultParkLabel('  Terraza 2  ', nowAt(15, 7))).toBe('Terraza 2');
  });

  it('sin mesa, la hora HH:MM con cero a la izquierda', () => {
    expect(defaultParkLabel('', nowAt(9, 5))).toBe('09:05');
    expect(defaultParkLabel(undefined, nowAt(15, 7))).toBe('15:07');
  });
});
