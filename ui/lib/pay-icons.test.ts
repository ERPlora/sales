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
