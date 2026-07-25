import { describe, it, expect } from 'vitest';
import { buildOpenPriceLine } from './pos-open-price';

// buildOpenPriceLine — "PRECIO LIBRE" (venta por departamento): vender algo que NO está fichado
// en el catálogo (la fruta que el tendero mira y te cobra a ojo). Construye una `CartLine` sin
// producto de catálogo con un precio TECLEADO y su categoría fiscal (el "departamento con su IVA",
// ADR-0085). El resto de la tubería ya existe: `toItemPayload` manda `product_id: l.id || null`,
// así que basta con `id: ''` para que viaje como línea libre (no descuenta stock; el servidor
// resuelve el IVA por categoría).
//
// Regla del oficio (todos los TPV la aplican): una venta libre NUNCA es una línea DESNUDA — sin
// nombre, sin categoría o sin precio es un agujero de mermas y un desglose de IVA sucio. Por eso el
// constructor VALIDA y rechaza esos casos en vez de dejar pasar basura.

describe('buildOpenPriceLine', () => {
  it('crea una línea libre: id vacío (→ product_id null), precio en céntimos, qty 1', () => {
    const l = buildOpenPriceLine({ name: 'Género varios', priceCents: 350, taxCategoryKey: 'product.generic' });
    expect(l.id).toBe(''); // toItemPayload hace `l.id || null` → product_id: null → no toca stock
    expect(l.name).toBe('Género varios');
    expect(l.price).toBe(350); // céntimos (ADR-0007), no euros
    expect(l.qty).toBe(1);
    expect(l.tax_category_key).toBe('product.generic'); // el "departamento" que decide el IVA
  });

  it('recorta el nombre', () => {
    expect(buildOpenPriceLine({ name: '  Fruta  ', priceCents: 350, taxCategoryKey: 'product.generic' }).name)
      .toBe('Fruta');
  });

  it('EXIGE nombre (no líneas desnudas)', () => {
    expect(() => buildOpenPriceLine({ name: '   ', priceCents: 350, taxCategoryKey: 'product.generic' }))
      .toThrow();
  });

  it('EXIGE categoría fiscal — el departamento con su IVA (ADR-0085)', () => {
    expect(() => buildOpenPriceLine({ name: 'Fruta', priceCents: 350, taxCategoryKey: '' }))
      .toThrow();
  });

  it('EXIGE precio entero > 0', () => {
    expect(() => buildOpenPriceLine({ name: 'Fruta', priceCents: 0, taxCategoryKey: 'product.generic' }))
      .toThrow();
    expect(() => buildOpenPriceLine({ name: 'Fruta', priceCents: -100, taxCategoryKey: 'product.generic' }))
      .toThrow();
    expect(() => buildOpenPriceLine({ name: 'Fruta', priceCents: 3.5, taxCategoryKey: 'product.generic' }))
      .toThrow();
  });
});
