// pos-open-price — "PRECIO LIBRE" (venta por departamento).
//
// Vender algo que NO está fichado en el catálogo: la fruta que el tendero mira y te cobra a ojo, el
// género suelto de la frutería/tienda de alimentación. Es la "tecla de departamento" de la caja
// registradora de toda la vida: tecleas el importe y eliges el departamento, que lleva su IVA.
//
// En ERPlora ese "departamento con su IVA" YA existe: es la categoría fiscal (`tax_category_key`,
// ADR-0085); el % lo resuelve el servidor por país + categoría. Y la tubería del carrito ya admite
// líneas sin producto de catálogo: `toItemPayload` (pos-cart.ts) hace `product_id: l.id || null`, así
// que una `CartLine` con `id: ''` viaja como línea libre (product_id null → no descuenta stock).
//
// Lo único que aporta este fichero es CONSTRUIR y VALIDAR esa línea. La regla del oficio, que todos
// los TPV aplican y el research confirmó: una venta libre NUNCA es una línea DESNUDA. Sin nombre, sin
// categoría fiscal o sin precio se convierte en un agujero de mermas y un desglose de IVA sucio; por
// eso aquí se rechaza en el origen en vez de dejar pasar basura al pedido.

import type { CartLine } from './pos-cart';

export interface OpenPriceInput {
  /** Descripción tecleada por el cajero ("Fruta", "Género varios"). Obligatoria. */
  name: string;
  /** Importe TECLEADO en CÉNTIMOS (ADR-0007). Entero > 0 (la conversión euros→céntimos es de la UI). */
  priceCents: number;
  /** Departamento = categoría fiscal que decide el IVA (`taxes.categories.list`, ADR-0085). Obligatoria. */
  taxCategoryKey: string;
}

/** Construye la `CartLine` de una venta por precio libre, o LANZA si faltaría un dato que la
 *  dejaría desnuda. `id: ''` es lo que hace que viaje como línea sin producto de catálogo. */
export function buildOpenPriceLine(input: OpenPriceInput): CartLine {
  const name = input.name.trim();
  if (!name) throw new Error('open-price: name is required');

  const taxCategoryKey = input.taxCategoryKey.trim();
  if (!taxCategoryKey) throw new Error('open-price: taxCategoryKey (departamento/IVA) is required');

  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    throw new Error('open-price: priceCents must be a positive integer (céntimos)');
  }

  return {
    id: '', // sin producto de catálogo → toItemPayload lo manda como product_id: null
    name,
    price: input.priceCents,
    qty: 1,
    tax_category_key: taxCategoryKey,
  };
}
