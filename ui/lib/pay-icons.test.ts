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

import { quickCashAmounts } from './pay-icons';

// Atajos de efectivo (patrón de Toast/Square): el cajero teclea menos y el cambio sale solo.
// Son los billetes con los que la gente paga de verdad, no una progresión matemática.
describe('importes rápidos en efectivo', () => {
  it('ofrece el exacto y luego los redondeos de arriba (patrón Toast: 20,43 → 21, 25, 30)', () => {
    // 12,50 € → exacto · siguiente euro (13) · siguiente 5 (15) · siguiente 10 (20)
    expect(quickCashAmounts(1250)).toEqual([1250, 1300, 1500, 2000]);
  });

  it('nunca ofrece importes por debajo del total (no cubrirían la cuenta)', () => {
    const q = quickCashAmounts(4200); // 42 €
    expect(q.every((c) => c >= 4200)).toBe(true);
    expect(q[0]).toBe(4200);
  });

  it('con cuenta REDONDA no repite ni ofrece "21 €": salta a 25 y 30', () => {
    // 20,00 € justos → nadie entrega 21 €; lo útil es 25 o 30 (o el exacto).
    expect(quickCashAmounts(2000)).toEqual([2000, 2500, 3000]);
  });

  it('no se pasa de 4 opciones: en barra más botones es más lento, no más rápido', () => {
    for (const total of [100, 1250, 4200, 9900, 15000]) {
      expect(quickCashAmounts(total).length).toBeLessThanOrEqual(4);
    }
  });

  it('con total 0 no ofrece nada', () => {
    expect(quickCashAmounts(0)).toEqual([]);
  });
});
