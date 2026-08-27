// `erp-pos` es el ENVOLTORIO que monta el shell, y `erp-pos-touch` la pantalla de verdad.
//
// Ese detalle importa porque el contrato de chrome (ADR-0367) viaja por ATRIBUTOS: el shell escribe
// `chrome` y `fullscreen` en el elemento que él monta —`erp-pos`, el que declara `navigation[]`— y
// quien tiene que leerlos es el de dentro, que es quien pinta la barra de categorías.
//
// Un atributo NO cruza un shadow root por su cuenta. Sin reenvío explícito, el shell concede la
// capacidad, el envoltorio la recibe… y la pantalla nunca se entera: `erp-pos-touch` ve su `chrome`
// vacío y no pinta el ⋮. Es exactamente lo que pasaba en el navegador — `<erp-pos chrome="fullscreen">`
// con un `<erp-pos-touch>` sin un solo atributo dentro— mientras los tests de `erp-pos-touch`, que lo
// montan suelto, salían verdes. Probar la pieza y no la composición es lo que dejó pasar el fallo.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const REGLAS_IVA = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

beforeEach(() => {
  // `erp-pos` mounts `erp-pos-touch`, so it needs the till's whole read surface (sales#233).
  installPosDouble({ rules: REGLAS_IVA });
});

const asentar = async (el: Element) => {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
};

/** Monta el envoltorio TAL Y COMO lo monta el shell: atributos en el elemento exterior. */
async function montarComoElShell(attrs: Record<string, string> = {}) {
  await import('./erp-pos');
  const el = document.createElement('erp-pos');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await asentar(el);
  const inner = el.shadowRoot!.querySelector('erp-pos-touch')!;
  await asentar(inner);
  return { el, inner };
}

describe('erp-pos reenvía el contrato de chrome a la pantalla', () => {
  it('baja la CAPACIDAD que concede el shell', async () => {
    const { inner } = await montarComoElShell({ chrome: 'fullscreen' });

    expect(inner.getAttribute('chrome')).toBe('fullscreen');
    // Y la pantalla, al recibirla, pinta el ⋮ — que es lo que el usuario no veía.
    expect(inner.shadowRoot!.querySelector('.catbar .more-trigger')).not.toBeNull();
  });

  it('baja el ESTADO, que cambia después del montaje', async () => {
    // El shell pone y quita `fullscreen` sobre la marcha (también por Esc o F11). Reenviarlo solo
    // en el primer render dejaría la etiqueta del menú congelada en «Pantalla completa».
    const { el, inner } = await montarComoElShell({ chrome: 'fullscreen' });
    expect(inner.hasAttribute('fullscreen')).toBe(false);

    el.setAttribute('fullscreen', '');
    await asentar(el);
    await asentar(inner);

    expect(inner.hasAttribute('fullscreen')).toBe(true);
  });

  it('sin capacidad concedida no baja nada, y la pantalla no ofrece el ⋮', async () => {
    const { inner } = await montarComoElShell();

    expect(inner.getAttribute('chrome') ?? '').toBe('');
    expect(inner.shadowRoot!.querySelector('.catbar .more-trigger')).toBeNull();
  });

  it('la petición del ⋮ SALE del envoltorio y llega al shell', async () => {
    // `composed` cruza los DOS shadow roots (el de la pantalla y el del envoltorio). Si alguno los
    // parase, el shell no oiría nada y el botón sería decorativo.
    const { el, inner } = await montarComoElShell({ chrome: 'fullscreen' });
    const recibidos: CustomEvent[] = [];
    document.addEventListener('erp:chrome-request', (e) => recibidos.push(e as CustomEvent));

    inner.shadowRoot!.querySelector<HTMLElement>('.catbar .more-trigger')!.click();
    await asentar(inner);
    inner.shadowRoot!.querySelector<HTMLElement>('[data-action="fullscreen"]')!.click();

    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].detail).toEqual({ control: 'fullscreen', action: 'toggle' });
    expect(el.shadowRoot!.contains(inner)).toBe(true); // salió de dos shadow roots, no de uno
  });
});
