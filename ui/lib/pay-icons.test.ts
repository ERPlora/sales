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

import { enabledPayMethods } from './pay-icons';

// Las formas de pago se ACTIVAN/DESACTIVAN desde Ajustes (allow_cash/allow_card/allow_transfer).
// La query ya filtra las inactivas; esto aplica además la política del hub.
describe('formas de pago habilitadas', () => {
  const todas = [
    { id: '1', name: 'Efectivo', type: 'cash' },
    { id: '2', name: 'Tarjeta', type: 'card' },
    { id: '3', name: 'Transferencia', type: 'transfer' },
    { id: '4', name: 'Bizum', type: 'other' },
  ];

  it('sin ajustes las deja todas (hub recién instalado)', () => {
    expect(enabledPayMethods(todas, {}).map((m) => m.name)).toEqual(['Efectivo','Tarjeta','Transferencia','Bizum']);
  });

  it('respeta cada allow_* de Ajustes', () => {
    const r = enabledPayMethods(todas, { allow_cash: 1, allow_card: 0, allow_transfer: 0 });
    expect(r.map((m) => m.name)).toEqual(['Efectivo','Bizum']); // Bizum no tiene flag propio → se deja
  });

  it('nunca deja al TPV sin ninguna: si se desactiva todo, queda efectivo', () => {
    const r = enabledPayMethods([{ id: '1', name: 'Efectivo', type: 'cash' }], { allow_cash: 0 });
    expect(r).toHaveLength(1);
  });
});

import { defaultPayMethod } from './pay-icons';

describe('forma de pago por defecto', () => {
  it('arranca en EFECTIVO aunque no sea la primera de la lista', () => {
    const m = defaultPayMethod([
      { id: '1', name: 'Bizum', type: 'other' },
      { id: '2', name: 'Efectivo', type: 'cash' },
      { id: '3', name: 'Tarjeta', type: 'card' },
    ]);
    expect(m?.name).toBe('Efectivo');
  });

  it('lo reconoce por el NOMBRE si el tipo no lo dice', () => {
    expect(defaultPayMethod([{ id: '1', name: 'Tarjeta', type: 'card' }, { id: '2', name: 'Efectivo', type: 'other' }])?.name).toBe('Efectivo');
  });

  it('sin efectivo respeta el orden del dueño', () => {
    expect(defaultPayMethod([{ id: '1', name: 'Tarjeta', type: 'card' }, { id: '2', name: 'Bizum', type: 'other' }])?.name).toBe('Tarjeta');
  });
});

import { payMethodDisplayName } from './pay-icons';

// El SEED de fábrica siembra los nombres en inglés canónico ('Cash', 'Card' — ADR-0055, mismo
// patrón que las unidades de inventory). Pero el nombre se VE: en los botones del cobro y en el
// tiquet. El contrato: mientras la fila conserve su nombre de fábrica se muestra TRADUCIDO por
// i18n (`ui.cash`/`ui.card`); en cuanto el dueño la renombra («BBVA TPV»), manda su texto tal cual.
describe('nombre visible de la forma de pago (seed canónico → i18n)', () => {
  const t = (key: string) => ({ 'ui.cash': 'Efectivo', 'ui.card': 'Tarjeta' }[key] ?? key);

  it('las filas de fábrica se muestran traducidas', () => {
    expect(payMethodDisplayName({ id: '1', name: 'Cash', type: 'cash' }, t)).toBe('Efectivo');
    expect(payMethodDisplayName({ id: '2', name: 'Card', type: 'card' }, t)).toBe('Tarjeta');
  });

  it('una fila renombrada por el dueño manda: se muestra tal cual', () => {
    expect(payMethodDisplayName({ id: '1', name: 'BBVA TPV', type: 'card' }, t)).toBe('BBVA TPV');
    expect(payMethodDisplayName({ id: '2', name: 'Efectivo caja 2', type: 'cash' }, t)).toBe('Efectivo caja 2');
  });

  it('sin nombre no inventa: cadena vacía', () => {
    expect(payMethodDisplayName({ id: '1', name: '', type: 'cash' }, t)).toBe('');
  });
});
