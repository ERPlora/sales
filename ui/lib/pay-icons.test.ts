import { describe, it, expect } from 'vitest';
import { payMethodIcon, PAY_ICON_FALLBACK } from './pay-icons';

// ADR-0133: las acciones van SOLO-ICONO. El riesgo real es que un icono sin mapear se pinte
// VACÍO (ya nos pasó con 37 iconos del hub): por eso todo tipo desconocido cae a un icono válido.
describe('icono de la forma de pago', () => {
  it('mapea los tipos habituales de un TPV', () => {
    expect(payMethodIcon('cash')).toBe('cash-outline');
    expect(payMethodIcon('card')).toBe('card-outline');
    expect(payMethodIcon('transfer')).toBe('swap-horizontal-outline');
    expect(payMethodIcon('mobile')).toBe('phone-portrait-outline');
    expect(payMethodIcon('voucher')).toBe('ticket-outline');
  });

  it('NUNCA devuelve vacío: un tipo desconocido cae al icono genérico', () => {
    for (const t of ['', undefined, 'cripto', 'lo-que-sea']) {
      const icon = payMethodIcon(t as string | undefined);
      expect(icon, `tipo ${JSON.stringify(t)} no puede quedar sin icono`).toBeTruthy();
      expect(icon).toBe(PAY_ICON_FALLBACK);
    }
  });

  it('es indiferente a mayúsculas y espacios (los datos los teclea el usuario)', () => {
    expect(payMethodIcon(' Card ')).toBe('card-outline');
    expect(payMethodIcon('CASH')).toBe('cash-outline');
  });

  it('deduce por el NOMBRE si el tipo no ayuda (efectivo/tarjeta/bizum)', () => {
    expect(payMethodIcon('other', 'Efectivo')).toBe('cash-outline');
    expect(payMethodIcon('other', 'Tarjeta de crédito')).toBe('card-outline');
    expect(payMethodIcon('other', 'Bizum')).toBe('phone-portrait-outline');
  });
});

import { needsTendered } from './pay-icons';

// Con TARJETA se cobra el importe EXACTO: no hay entregado ni cambio, así que el teclado numérico
// sobra. La regla no se hardcodea a "efectivo": la dice el propio dato `requires_change`, para que
// una forma de pago creada a mano (Bizum, vale) se comporte como su dueño la definió.
describe('¿esta forma de pago necesita teclear el importe entregado?', () => {
  it('efectivo sí: hay que teclear lo que entrega el cliente y devolver cambio', () => {
    expect(needsTendered({ id: '1', name: 'Efectivo', type: 'cash', requires_change: 1 })).toBe(true);
  });

  it('tarjeta NO: se cobra el importe exacto', () => {
    expect(needsTendered({ id: '2', name: 'Tarjeta', type: 'card', requires_change: 0 })).toBe(false);
    expect(needsTendered({ id: '3', name: 'Bizum', type: 'other', requires_change: 0 })).toBe(false);
  });

  it('manda el DATO, no el tipo: un efectivo marcado sin cambio no pide teclado', () => {
    expect(needsTendered({ id: '4', name: 'Efectivo', type: 'cash', requires_change: 0 })).toBe(false);
  });

  it('sin el dato, cae al tipo (compatibilidad con filas antiguas)', () => {
    expect(needsTendered({ id: '5', name: 'Efectivo', type: 'cash' })).toBe(true);
    expect(needsTendered({ id: '6', name: 'Tarjeta', type: 'card' })).toBe(false);
  });

  it('sin forma de pago seleccionada asume efectivo (el TPV de barra por defecto)', () => {
    expect(needsTendered(undefined)).toBe(true);
  });
});
