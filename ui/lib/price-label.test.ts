import { describe, it, expect } from 'vitest';
import { priceLabel, quantityLabel } from './price-label';

// Incidencia 4b (ADR-0147): la línea del carrito debe decir EN QUÉ UNIDAD va el precio cuando no
// es la unidad suelta — «12,00 € / kg» deja claro que 0,5 no son 0,5 cafés. El código de unidad
// (kg/g/l/ud) es un CÓDIGO, no texto traducible: se pinta tal cual, sin pasar por i18n.
//
// El helper es presentación pura: recibe el dinero YA formateado (eso es del SDK, ADR-0007/0059)
// y el `unit_code` congelado de la línea (ADR-0147 §2.4), y decide si añade el sufijo.

describe('priceLabel — sufijo de unidad en el precio de la línea (incidencia 4b)', () => {
  it('unidad medible: añade « / <code>» al precio', () => {
    expect(priceLabel('12.00 €', 'kg')).toBe('12.00 € / kg');
    expect(priceLabel('0.90 €', 'g')).toBe('0.90 € / g');
    expect(priceLabel('1.50 €', 'l')).toBe('1.50 € / l');
  });

  it('unidad suelta (`ud`): sin sufijo — «1,80 € / ud» sería ruido en cada café', () => {
    expect(priceLabel('1.80 €', 'ud')).toBe('1.80 €');
  });

  it('sin contexto de unidades (líneas antiguas o producto sin unidad): sin sufijo', () => {
    expect(priceLabel('1.80 €', undefined)).toBe('1.80 €');
    expect(priceLabel('1.80 €', '')).toBe('1.80 €');
  });
});

// sales#28 — la CANTIDAD del papel lleva la misma firma que su precio: unidad congelada cuando es
// medible, silencio cuando es la suelta. El número sale en formato local del papel (coma decimal,
// como pinta `money()`), vía formatQuantity: la aduana oficial de la escala 10⁶ (ADR-0147).
describe('quantityLabel — la cantidad del papel con su unidad (sales#28)', () => {
  it('cantidad decimal con unidad medible: «1,5 kg», coma como el dinero del papel', () => {
    expect(quantityLabel(1.5, 'kg')).toBe('1,5 kg');
    expect(quantityLabel(0.25, 'l')).toBe('0,25 l');
    expect(quantityLabel(2, 'kg')).toBe('2 kg');
  });

  it('unidad suelta (`ud`): la cantidad a secas — «2 ud × 3,00 €» sería el ruido de siempre', () => {
    expect(quantityLabel(2, 'ud')).toBe('2');
  });

  it('sin contexto de unidades (línea antigua): la cantidad a secas', () => {
    expect(quantityLabel(2, undefined)).toBe('2');
    expect(quantityLabel(1.5, '')).toBe('1,5');
  });

  it('formato local vía formatQuantity: sin ceros de adorno y sin ruido f64', () => {
    expect(quantityLabel(0.1 + 0.2, 'kg')).toBe('0,3 kg');
    expect(quantityLabel(1.25, 'kg')).toBe('1,25 kg');
  });
});
