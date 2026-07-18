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

  // CORREGIDO (2026-07-18): este test afirmaba que «la comanda viaja con nosotros» al saltar de
  // una mesa a otra vacía. Era el contrato equivocado, y de él salía un bug real: como la comanda
  // se re-enlazaba a cada mesa tocada, ninguna se liberaba y acabamos con tres mesas ocupadas por
  // el mismo pedido. Los TPV de referencia no hacen eso: tocar otra mesa es CAMBIAR de mesa, y
  // llevarse la cuenta es TRANSFERIR (acción explícita). Ver el bloque de abajo.
});

describe('la comanda NO se arrastra de mesa (ADR-0144, cómo lo hacen Toast/Lightspeed)', () => {
  // Regla de sala (Ioan, 2026-07-18): con una mesa ya asignada, tocar otra NO mueve la cuenta.
  // Mover una cuenta es TRANSFERIR, una acción explícita con su botón. Tocar otra mesa es
  // "cambiar de mesa": si está libre, empiezas una cuenta NUEVA ahí; si está ocupada, abres LA
  // SUYA. Verificado en Toast ("Move X Check" es una acción aparte) y en Lightspeed.
  //
  // Antes esto arrastraba la comanda a cada mesa que se tocaba, y como la junction quedaba escrita
  // en todas, ninguna se liberaba nunca: acabamos con TRES mesas ocupadas por el mismo pedido.
  it('con mesa asignada, tocar una mesa LIBRE abre una cuenta nueva ahí', () => {
    expect(decideOnTableChange({
      cartHasItems: true, currentTableId: 'mesa-1', targetTableId: 'mesa-2',
    })).toBe('start-new-check');
  });

  it('con mesa asignada, tocar una mesa OCUPADA abre la cuenta de esa mesa', () => {
    expect(decideOnTableChange({
      cartHasItems: true, currentTableId: 'mesa-1', targetTableId: 'mesa-2', targetOrderId: 'ord-9',
    })).toBe('load-target');
  });

  it('SIN mesa asignada (barra), lo marcado sí se asigna a la mesa que se toca', () => {
    // Este es el caso que sigue siendo «asignar»: se empieza a marcar en barra y luego se decide
    // dónde va. No hay ninguna mesa que pueda quedarse la comanda.
    expect(decideOnTableChange({
      cartHasItems: true, targetTableId: 'mesa-2',
    })).toBe('assign-to-target');
  });

  it('sin mesa asignada y la mesa tocada ya tiene cuenta: se aparca lo de delante', () => {
    expect(decideOnTableChange({
      cartHasItems: true, targetTableId: 'mesa-2', targetOrderId: 'ord-9',
    })).toBe('park-then-load');
  });
});
