import { describe, it, expect } from 'vitest';
import {
  QUANTITY_SCALE,
  toMicro,
  fromMicro,
  parseQuantity,
  formatQuantity,
  onGrid,
} from './quantity';

// ADR-0147: la cantidad es punto fijo entero con escala GLOBAL 10⁶ en TODO el cable (commands,
// filas, eventos). El exponente solo existe en las DOS fronteras: cuando un humano teclea
// (parseQuantity → µ) y cuando se pinta (formatQuantity ← µ). La UI trabaja en lógico (0,5) y
// estas funciones son la única aduana.

describe('quantity — la frontera de la escala 10⁶ (ADR-0147)', () => {
  it('toMicro/fromMicro: 0,5 kg es 500000, y vuelve exacto', () => {
    expect(QUANTITY_SCALE).toBe(1_000_000);
    expect(toMicro(0.5)).toBe(500_000);
    expect(toMicro(3)).toBe(3_000_000);
    expect(fromMicro(500_000)).toBe(0.5);
    expect(fromMicro(3_000_000)).toBe(3);
  });

  it('toMicro absorbe el ruido de coma flotante del cálculo en UI', () => {
    // 0.1 + 0.2 = 0.30000000000000004 — la aduana redondea al µ entero más cercano.
    expect(toMicro(0.1 + 0.2)).toBe(300_000);
  });

  it('parseQuantity: lo que teclea el humano → µ; coma o punto', () => {
    expect(parseQuantity('0.5')).toBe(500_000);
    expect(parseQuantity('0,5')).toBe(500_000);
    expect(parseQuantity(' 2 ')).toBe(2_000_000);
  });

  it('parseQuantity RECHAZA lo irrepresentable en vez de truncarlo', () => {
    // Aceptar 0.1234567 y quedarse con seis decimales es exactamente cómo empezó todo esto.
    expect(parseQuantity('0.1234567')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
  });

  it('formatQuantity: sin ceros de adorno — 2, no 2.000000', () => {
    expect(formatQuantity(2_000_000)).toBe('2');
    expect(formatQuantity(500_000)).toBe('0.5');
    expect(formatQuantity(1_250_000)).toBe('1.25');
  });

  it('onGrid: el incremento VALIDA, no redondea (§2.2)', () => {
    const gramo = 1_000; // 0,001 kg
    expect(onGrid(500_000, gramo)).toBe(true); // 0,5 kg cae en gramos
    expect(onGrid(500, gramo)).toBe(false); // medio gramo NO
    const pieza = 1_000_000;
    expect(onGrid(3_000_000, pieza)).toBe(true);
    expect(onGrid(500_000, pieza)).toBe(false); // media caña no existe
    expect(onGrid(500_000, 0)).toBe(true); // sin incremento declarado no se bloquea
  });
});
