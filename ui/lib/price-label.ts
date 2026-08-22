// price-label — presentación del precio y la cantidad de una línea (incidencia 4b / sales#28,
// ADR-0147).
//
// Cuando la línea va en una unidad medible (kg/g/l…), el precio a secas engaña: «12,00 €» con
// qty 0,5 parece media docena de algo, no medio kilo. El sufijo « / kg» lo aclara. La unidad
// suelta (`ud`) no lo lleva: «1,80 € / ud» en cada café sería ruido. La CANTIDAD del papel firma
// igual (sales#28): «1,5 kg», y «2» a secas para la suelta.
//
// El `unit_code` es un CÓDIGO (kg/g/l/ud), no texto traducible — se pinta tal cual, sin i18n.
// El `unit_name` congelado no se pinta: llega en el idioma canónico del catálogo («Kilogram») y
// el papel no lo traduce; el código es la convención neutra que el carrito ya usa.
//
// El dinero llega YA formateado por el SDK (`formatMoney`, ADR-0007/0059): este helper solo compone.

import { toMicro, formatQuantity } from './quantity';

/** Unidad suelta: la implícita de todo TPV; no se etiqueta. */
const UNIT_EACH = 'ud';

/** La unidad de una línea tal y como se PINTA: el código congelado, salvo la suelta (nada). */
export function unitTag(unitCode?: string): string {
  return unitCode && unitCode !== UNIT_EACH ? unitCode : '';
}

/** Precio unitario de la línea, con « / <unit_code>» solo cuando la unidad no es la suelta. */
export function priceLabel(money: string, unitCode?: string): string {
  const tag = unitTag(unitCode);
  return tag ? `${money} / ${tag}` : money;
}

/**
 * Cantidad de la línea PARA EL PAPEL (sales#28): número en el formato local del papel (coma
 * decimal, como pinta el dinero del tiquet) seguido de su unidad congelada — «1,5 kg». La unidad
 * suelta sale a secas («2»): el mismo silencio de `priceLabel`.
 *
 * El número lo compone `formatQuantity(toMicro(qty))`: la aduana oficial de la escala 10⁶
 * (ADR-0147) — sin ceros de adorno y sin el ruido f64 de la UI (0,1+0,2 → «0,3»).
 */
export function quantityLabel(qty: number, unitCode?: string): string {
  const n = formatQuantity(toMicro(qty)).replace('.', ',');
  const tag = unitTag(unitCode);
  return tag ? `${n} ${tag}` : n;
}
