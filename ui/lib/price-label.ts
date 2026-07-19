// price-label — presentación del precio unitario de una línea del carrito (incidencia 4b, ADR-0147).
//
// Cuando la línea va en una unidad medible (kg/g/l…), el precio a secas engaña: «12,00 €» con
// qty 0,5 parece media docena de algo, no medio kilo. El sufijo « / kg» lo aclara. La unidad
// suelta (`ud`) no lo lleva: «1,80 € / ud» en cada café sería ruido.
//
// El `unit_code` es un CÓDIGO (kg/g/l/ud), no texto traducible — se pinta tal cual, sin i18n.
// El dinero llega YA formateado por el SDK (`formatMoney`, ADR-0007/0059): este helper solo compone.

/** Unidad suelta: la implícita de todo TPV; no se etiqueta. */
const UNIT_EACH = 'ud';

/** Precio unitario de la línea, con « / <unit_code>» solo cuando la unidad no es la suelta. */
export function priceLabel(money: string, unitCode?: string): string {
  return unitCode && unitCode !== UNIT_EACH ? `${money} / ${unitCode}` : money;
}
