import { describe, it, expect } from 'vitest';
import { priceLabel } from './price-label';

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
