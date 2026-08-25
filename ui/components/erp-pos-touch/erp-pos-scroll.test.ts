// Contrato de SCROLL de la rejilla de producto y de anclaje del pie del carrito (sales#178).
//
// Por qué existe: con la carta completa de un restaurante (281 artículos) el TPV se recortaba
// entero — no scrolleaba nada, se veían ~14 baldosas y «Cobrar» quedaba 10.000-20.000 px por
// debajo del viewport. La causa era de CSS puro: `.catalog` es item de grid y sin `min-height:0`
// su min-height efectivo es `auto`, así que no puede encogerse por debajo de su contenido y estira
// la fila entera del grid al alto de la rejilla. `.grid` nunca llegaba a usar su `overflow:auto`
// porque su padre ya había crecido, y `aside.cart` —misma fila— se estiraba con él, llevándose el
// `ion-footer` al final de esos 20.000 px. `.card` es `overflow:hidden`, así que ni barra de scroll.
//
// El mismo patrón ya estaba corregido en `.body` y en `.cart`; a `.catalog` se le puso `min-width:0`
// pero no `min-height:0`. Estas tres reglas son UNA sola cadena: si falta un eslabón, el alto se
// escapa otra vez. Por eso se fijan juntas.
//
// happy-dom NO hace layout ni evalúa media queries: aquí se fija el CONTRATO CSS declarado, como en
// los demás contratos de estilo de este componente. Que la rejilla scrollee de verdad y que
// «Cobrar» caiga dentro del viewport se verifica en un navegador real.
import { describe, expect, it } from 'vitest';

/** CSS declarado por el componente (el `static styles` de Lit). */
async function cssDelPos(): Promise<string> {
  await import('./erp-pos-touch');
  const clase = customElements.get('erp-pos-touch') as unknown as {
    styles: { cssText: string } | Array<{ cssText: string }>;
  };
  return [clase.styles].flat().map((s) => s.cssText).join('\n');
}

/** Todas las declaraciones de un selector, concatenadas (el componente lo redeclara por capas). */
function reglas(css: string, selector: string): string {
  const escapado = selector.replace(/[.[\]()]/g, '\\$&');
  return (css.match(new RegExp(`${escapado}\\s*\\{[^}]*\\}`, 'g')) ?? []).join('\n');
}

/**
 * Los bloques `@media (max-width: 820px)` — donde el carrito se vuelve cajón y aparece el FAB.
 * Se recortan contando llaves: quedarse con «todo lo que sigue al @media» dejaría pasar una regla
 * escrita fuera de la media query, que es justo lo contrario de lo que aquí se quiere probar.
 */
function bloqueMovil(css: string): string {
  const bloques: string[] = [];
  const apertura = /@media[^{]*\(max-width:\s*820px\)[^{]*\{/g;
  for (let m = apertura.exec(css); m; m = apertura.exec(css)) {
    let profundidad = 1;
    let i = m.index + m[0].length;
    const inicio = i;
    for (; i < css.length && profundidad > 0; i += 1) {
      if (css[i] === '{') profundidad += 1;
      else if (css[i] === '}') profundidad -= 1;
    }
    bloques.push(css.slice(inicio, i - 1));
  }
  return bloques.join('\n');
}

describe('la rejilla de producto scrollea dentro de su columna (sales#178)', () => {
  it('la cadena de contenedores puede encogerse: .body, .catalog y .cart declaran min-height:0', async () => {
    const css = await cssDelPos();

    expect(reglas(css, '.body'), '.body es el grid de dos columnas y ya puede encoger')
      .toMatch(/min-height\s*:\s*0/);
    expect(
      reglas(css, '.catalog'),
      '.catalog es item de grid: sin min-height:0 su mínimo es su contenido y estira la fila a los ~20.000 px de la rejilla',
    ).toMatch(/min-height\s*:\s*0/);
    expect(reglas(css, '.cart'), '.cart ya lo tenía: su ion-footer se ancla porque la columna no crece')
      .toMatch(/min-height\s*:\s*0/);
  });

  // Medido en Chrome 151 sobre el montaje real del shell (ion-content > .outlet{height:100%} > WC)
  // con 281 artículos: `min-height:0` en `.catalog` NO basta. `.body` es un grid con UNA fila
  // implícita `auto`, y una pista `auto` se dimensiona por el CONTENIDO: su base es el min-content
  // de `.catalog` (~6.800 px a 1440, ~13.600 a 834). Que el ITEM pueda encoger no impide que la
  // PISTA crezca — el item simplemente se estira a una fila de 6.800 px. La fila tiene que ser
  // acotada explícitamente: `minmax(0,1fr)` la ata al alto de `.body`, y ahí sí `.grid` alcanza su
  // `overflow:auto` y el `ion-footer` del carrito se queda dentro de la pantalla.
  it('la fila del grid está ACOTADA: no se dimensiona por el contenido de la rejilla', async () => {
    const css = await cssDelPos();
    const cuerpo = reglas(css, '.body');
    const filas = cuerpo.match(/grid-template-rows\s*:\s*([^;}]+)/);

    expect(filas, '.body declara su fila en vez de dejarla implícita (auto = alto del contenido)').toBeTruthy();
    expect(
      filas![1].replace(/\s+/g, ''),
      'minmax(0,1fr): mínimo 0 (la fila no crece con la rejilla) y máximo el alto de .body',
    ).toBe('minmax(0,1fr)');
  });

  it('.grid es quien scrollea: overflow:auto', async () => {
    expect(reglas(await cssDelPos(), '.grid'), 'la rejilla se queda con el scroll del catálogo')
      .toMatch(/overflow\s*:\s*auto/);
  });

  it('la tarjeta sigue recortando: el scroll vive dentro, no en la página', async () => {
    expect(reglas(await cssDelPos(), '.card')).toMatch(/overflow\s*:\s*hidden/);
  });
});

// El FAB del carrito flota sobre la rejilla (`position:absolute; bottom:1rem`, 3.6rem de lado) y en
// 390 px tapaba el precio de la baldosa de debajo — el último producto de la carta no se puede leer.
// Square y Toast reservan ese hueco al final de la rejilla en vez de dejar que el botón pise el
// contenido. Solo aplica donde el FAB existe: el bloque móvil.
describe('el FAB del carrito no tapa la última fila de baldosas (sales#178)', () => {
  it('en móvil la rejilla reserva bajo su contenido el hueco del FAB', async () => {
    const movil = bloqueMovil(await cssDelPos());
    const rejilla = reglas(movil, '.grid');
    const relleno = rejilla.match(/padding-bottom\s*:\s*([\d.]+)rem/);

    expect(relleno, 'el bloque móvil declara el padding-bottom de la rejilla').toBeTruthy();
    expect(
      Number(relleno![1]),
      'al menos el alto del FAB (3.6rem) más su separación al borde (1rem)',
    ).toBeGreaterThanOrEqual(4.6);
  });

  it('el FAB solo se pinta en ese bloque: en escritorio no hay nada que esquivar', async () => {
    const css = await cssDelPos();
    expect(reglas(css, '.fab'), 'oculto por defecto').toMatch(/display\s*:\s*none/);
    expect(reglas(bloqueMovil(css), '.fab'), 'y solo el bloque móvil lo muestra')
      .toMatch(/display\s*:\s*inline-flex/);
  });
});
