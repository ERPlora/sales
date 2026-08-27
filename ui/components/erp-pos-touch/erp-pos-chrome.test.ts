// Contrato del MENÚ DE PANTALLA (⋮) de la barra de categorías del TPV.
//
// Por qué existe: vender pide toda la pantalla. El shell del Hub pinta alrededor del TPV una barra
// lateral, una topbar y el tabbar del módulo — chrome que en una tablet de mostrador se come el
// alto que necesita la rejilla. El shell YA sabe esconderlo (modo inmersivo + Fullscreen API), pero
// el mando tiene que estar donde el cajero mira: en la barra de categorías, junto a la lupa, no en
// una topbar que el propio modo hace desaparecer.
//
// El reparto es el de ADR-0048: el CONTROL es del shell (él oculta su chrome y llama a la
// Fullscreen API), el módulo solo lo PIDE. Tres piezas:
//
//   shell → WC   `chrome="fullscreen"`   qué controles honra el shell en esta pestaña (capacidad)
//   WC   → shell `erp:chrome-request`    la petición, que sube por el shadow DOM (composed)
//   shell → WC   `fullscreen`            el estado, para que el menú ofrezca entrar o salir
//
// La capacidad NO es decorado: los módulos se actualizan solos y la imagen del hub no, así que un
// `sales` nuevo puede caer sobre un shell que no sabe de esto. Sin el atributo no se pinta el ⋮ —
// vale más no ofrecerlo que ofrecer un botón que no hace nada.
//
// happy-dom NO hace layout: aquí se fija el CONTRATO (qué se pinta, qué se emite), no la posición.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const CATEGORIA_IVA = 'product.generic';
const REGLAS_IVA = [{ id: 'r-21', tax_category_key: CATEGORIA_IVA, rate_pct: 21, parent_id: null, is_active: 1 }];

beforeEach(() => {
  installPosDouble({ rules: REGLAS_IVA });
});

/** Monta el TPV con los controles de chrome que el shell dice honrar (`undefined` = shell viejo). */
async function montarTpv(chrome?: string) {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  if (chrome !== undefined) el.setAttribute('chrome', chrome);
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el;
}

const raiz = (el: Element): ShadowRoot => el.shadowRoot as ShadowRoot;

/** Abre el menú ⋮ y devuelve su panel. */
async function abrirMenu(el: Element): Promise<HTMLElement> {
  raiz(el).querySelector<HTMLElement>('.catbar .more-trigger')!.click();
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return raiz(el).querySelector<HTMLElement>('.more-menu')!;
}

describe('menú de pantalla del TPV (⋮)', () => {
  it('lo ofrece junto a la lupa cuando el shell honra algún control', async () => {
    const el = await montarTpv('fullscreen');

    const catbar = raiz(el).querySelector('.catbar')!;
    const mas = catbar.querySelector('.more-trigger');
    expect(mas).not.toBeNull();

    // A la DERECHA de la lupa: el orden lo pidió Ioan y es el que hace que el pulgar encuentre
    // primero la acción frecuente (buscar) y después la ocasional (pantalla).
    const lupa = catbar.querySelector('.search-trigger')!;
    expect(lupa.compareDocumentPosition(mas!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('NO lo pinta contra un shell que no anuncia ningún control', async () => {
    // Un `sales` recién actualizado sobre una imagen del hub anterior: el evento no lo escucharía
    // nadie. Un botón que no hace nada es peor que no tenerlo.
    const el = await montarTpv();
    expect(raiz(el).querySelector('.catbar .more-trigger')).toBeNull();
  });

  it('abre el menú con la pantalla completa dentro', async () => {
    const el = await montarTpv('fullscreen');

    expect(raiz(el).querySelector('.more-menu')).toBeNull(); // cerrado de entrada
    const menu = await abrirMenu(el);

    const accion = menu.querySelector<HTMLElement>('[data-action="fullscreen"]')!;
    expect(accion).not.toBeNull();
    expect(accion.textContent).toContain('ui.fullscreen');
  });

  it('al elegirla PIDE el control al shell y cierra el menú', async () => {
    const el = await montarTpv('fullscreen');
    const menu = await abrirMenu(el);

    // El shell escucha en el documento: el evento tiene que salir del shadow root (composed) y
    // seguir subiendo (bubbles). Sin cualquiera de las dos, la petición muere dentro del WC.
    const recibidos: CustomEvent[] = [];
    document.addEventListener('erp:chrome-request', (e) => recibidos.push(e as CustomEvent));

    menu.querySelector<HTMLElement>('[data-action="fullscreen"]')!.click();
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].detail).toEqual({ control: 'fullscreen', action: 'toggle' });
    expect(recibidos[0].composed).toBe(true);
    expect(recibidos[0].bubbles).toBe(true);
    expect(raiz(el).querySelector('.more-menu')).toBeNull();
  });

  it('ofrece SALIR cuando el shell dice que ya está en pantalla completa', async () => {
    const el = await montarTpv('fullscreen');
    // El estado lo manda el shell, no lo adivina el módulo: también entra por Esc o por F11, que
    // el TPV no ve. Si lo dedujera de sus propios clics, se quedaría mintiendo en la etiqueta.
    el.setAttribute('fullscreen', '');
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const menu = await abrirMenu(el);
    const accion = menu.querySelector<HTMLElement>('[data-action="fullscreen"]')!;
    expect(accion.textContent).toContain('ui.exitFullscreen');
  });
});
