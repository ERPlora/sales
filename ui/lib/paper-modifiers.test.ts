// Cómo se IMPRIME un suplemento (sales#148) — decidido por el mercado, no por nosotros.
//
// La duda era de negocio: ¿sangrado bajo su línea o pegado al nombre? ¿con importe o sin él? ¿qué
// pasa con «sin cebolla», que no suma? Diez referencias (Toast, Square, Lightspeed, Clover,
// TouchBistro, LS Central, Revel, Shopify POS, Odoo POS, Oracle Simphony) + los foros; la tabla con
// sus URLs va en la PR y en la issue. Lo que salió:
//
//  1. SUB-LÍNEA SANGRADA bajo su producto — 7 de 10 (Square, Lightspeed «below items», LS Central
//     línea hija, Odoo `ms-4`, Shopify `<li>` anidado, Clover, Toast en su modo Vertical). El único
//     que aplana es el modo que Toast llama literalmente «Legacy - Flatten».
//
//  2. SOLO EL NOMBRE, sin importe propio. Aquí manda NUESTRO modelo de datos: el delta del
//     suplemento ya está DENTRO del `unit_price` de la línea (lo suma `authoritative_modifiers` al
//     cobrar), así que el `line_total` impreso a la derecha ya lo incluye. Un segundo número en esa
//     columna no sumaría con los demás — y esa columna es la que el cliente cuadra contra el TOTAL.
//     Es exactamente el modelo que Toast documenta («omit the prices of modifiers — the modifier
//     prices are included in the price of the main item») y el que Shopify POS implementa («modifier
//     prices are included in the line item's total price, not displayed separately»). Y es lo que el
//     mercado está PIDIENDO: la petición abierta más votada de Clover (19 votos, «Under Review») es
//     literalmente «BURGER $10.49 / Extra Patty» en vez de «BURGER $8.99 / Extra Patty $1.50».
//     El contraejemplo confirma el riesgo: Odoo sí pinta importe por sub-línea y arrastra el bug
//     abierto #187509 en 16/17/18 — el reparto padre/hijo se descuadra y CAMBIA EL TOTAL A COBRAR.
//     (Enseñar el importe del suplemento por separado exige que el suplemento sea su propia línea:
//     eso es sales#147, la línea hija del suplemento con tipo fiscal propio.)
//
//  3. UN SUPLEMENTO A 0 € SE IMPRIME IGUAL QUE LOS DEMÁS. Nueve de las diez referencias jamás
//     imprimen «0,00» —cada una tiene su interruptor para el gratuito: *Free Modifiers* (Toast),
//     *Print $0 modifiers* (Lightspeed), *Skip Zero Price* (LS Central), *Show Only Priced
//     Modifiers* (Clover), opción 79 (Simphony)—; la única que lo imprime es Odoo, y es su bug.
//     Como aquí NO se imprime importe ninguno, «sin cebolla» y «+ queso» salen idénticos: los dos
//     son un nombre. Y «sin cebolla» es justo lo que el cliente necesita leer para saber por qué su
//     hamburguesa es así.
//
//  4. EN EL ORDEN EN QUE SE ELIGIERON, no el del catálogo. Lo documentan Toast («Display in order
//     modifiers were added»), Lightspeed (su ajuste «Order ticket modifiers by» viene en «None» =
//     orden de introducción) y LS Central («directly after the trigger line»). El módulo ya lo
//     congela así desde pm#93.
//
//  5. LA CUENTA PREVIA SE PINTA COMO EL TIQUE. Solo Toast lo dice explícitamente («apply to all
//     devices, receipts, kitchen tickets») y ninguna otra referencia documenta una configuración
//     separada para el pre-bill. Un solo compositor, los dos papeles.
import { describe, expect, it } from 'vitest';
import { modifierIdentity, modifierLabel, modifierNote } from './paper-modifiers.js';

describe('modifierLabel — lo que se lee de un suplemento', () => {
  it('es el nombre comercial', () => {
    expect(modifierLabel({ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 })).toBe('Extra queso');
  });

  it('NO lleva importe aunque el suplemento sume: ya está dentro del total de la línea', () => {
    expect(modifierLabel({ name: 'Extra queso', price_delta: 100 })).not.toMatch(/1[,.]00|100/);
  });

  it('un suplemento gratuito se lee exactamente igual: nunca «0,00»', () => {
    expect(modifierLabel({ name: 'Sin cebolla', price_delta: 0 })).toBe('Sin cebolla');
    expect(modifierLabel({ name: 'Sin cebolla' })).toBe('Sin cebolla');
  });

  it('sin nombre resoluble cae al id: una línea fea es mejor que un cobro invisible', () => {
    expect(modifierLabel({ option_id: 'o-huerfano' })).toBe('o-huerfano');
  });

  it('sin nada que decir devuelve vacío, y no un renglón en blanco en el papel', () => {
    expect(modifierLabel({})).toBe('');
  });
});

describe('modifierNote — la sub-línea del papel, en el orden elegido', () => {
  it('encadena los nombres en el ORDEN de elección', () => {
    expect(modifierNote([{ name: 'Extra queso' }, { name: 'Sin cebolla' }])).toBe('Extra queso · Sin cebolla');
    expect(modifierNote([{ name: 'Sin cebolla' }, { name: 'Extra queso' }])).toBe('Sin cebolla · Extra queso');
  });

  it('un solo suplemento va solo, sin separador colgando', () => {
    expect(modifierNote([{ name: 'Extra queso' }])).toBe('Extra queso');
  });

  it('sin suplementos NO hay nota: el tique de siempre sale byte a byte igual', () => {
    expect(modifierNote(undefined)).toBeUndefined();
    expect(modifierNote([])).toBeUndefined();
  });

  it('descarta los que no dicen nada en vez de imprimir separadores huérfanos', () => {
    expect(modifierNote([{ name: 'Extra queso' }, {}, { name: 'Sin cebolla' }])).toBe('Extra queso · Sin cebolla');
    expect(modifierNote([{}, {}])).toBeUndefined();
  });
});

describe('modifierIdentity — la huella, que NO es lo que se imprime', () => {
  it('se toma del id, estable aunque el dueño renombre la opción mañana', () => {
    expect(modifierIdentity({ option_id: 'o-queso', name: 'Extra queso', price_delta: 100 }))
      .toBe(modifierIdentity({ option_id: 'o-queso', name: 'Queso extra', price_delta: 100 }));
  });

  it('CAMBIA con el importe: el mismo suplemento a otro precio es otra cuenta', () => {
    expect(modifierIdentity({ option_id: 'o-queso', price_delta: 100 }))
      .not.toBe(modifierIdentity({ option_id: 'o-queso', price_delta: 150 }));
  });

  it('sin id se agarra al nombre: algo tiene que distinguir dos elecciones distintas', () => {
    expect(modifierIdentity({ name: 'A' })).not.toBe(modifierIdentity({ name: 'B' }));
  });
});
