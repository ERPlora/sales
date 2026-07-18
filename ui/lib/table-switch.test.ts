import { describe, it, expect } from 'vitest';
import { decideOnTableChange } from './table-switch';

// Reglas de sala (decisión de Ioan). Lo que hay en el carrito NUNCA se pierde al tocar una mesa:
//  · carrito con algo + mesa VACÍA    → esa comanda pasa a SER la de la mesa (se asigna).
//  · carrito con algo + mesa OCUPADA  → la mesa ya tiene su comanda; la del carrito se APARCA.
//  · quitar la mesa con productos     → la comanda se APARCA (la mesa queda libre).
describe('qué hacer con el carrito al cambiar de mesa', () => {
  it('carrito vacío: solo se carga lo que tenga la mesa', () => {
    expect(decideOnTableChange({ cartHasItems: false, targetTableId: 'm1', targetOrderId: 'o1' })).toBe('load-target');
    expect(decideOnTableChange({ cartHasItems: false, targetTableId: 'm1' })).toBe('load-target');
  });

  it('carrito con algo + mesa VACÍA → se asigna a esa mesa (no se aparca nada)', () => {
    expect(decideOnTableChange({ cartHasItems: true, targetTableId: 'm1' })).toBe('assign-to-target');
  });

  it('carrito con algo + mesa OCUPADA → el carrito se APARCA y se abre la comanda de la mesa', () => {
    expect(decideOnTableChange({ cartHasItems: true, targetTableId: 'm1', targetOrderId: 'o9' })).toBe('park-then-load');
  });

  it('quitar la mesa con productos → se APARCA (no se tira la comanda)', () => {
    expect(decideOnTableChange({ cartHasItems: true, targetTableId: undefined })).toBe('park-then-clear');
  });

  it('quitar la mesa sin nada → simplemente se suelta', () => {
    expect(decideOnTableChange({ cartHasItems: false, targetTableId: undefined })).toBe('clear');
  });

  it('venir YA de una mesa y saltar a otra vacía: la comanda viaja con nosotros', () => {
    // Es el mismo caso: lo que hay delante se asigna a la mesa nueva.
    expect(decideOnTableChange({ cartHasItems: true, currentTableId: 'm1', targetTableId: 'm2' })).toBe('assign-to-target');
  });
});
