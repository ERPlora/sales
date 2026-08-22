import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAY_ICON_NAMES, payMethodIcon } from './pay-icons';

// GUARD: `name=${payMethodIcon(...)}` es DINÁMICO y el empaquetador del módulo solo hornea
// literales — el propio extractor lo dice: "un nombre que solo existe en runtime no es horneable".
// Resultado en producción: el botón de Bizum salía VACÍO. Para que viajen, los nombres tienen que
// aparecer además como <ion-icon name="…"> estáticos en el WC. Este test lo vigila.
// La raíz del módulo se ancla en SU module.json: se sube desde ESTE fichero (import.meta.url)
// hasta encontrarlo. Adivinarla con basename(cwd) === 'sales' hacía que en cualquier worktree
// con otro nombre la ruta no existiera y este guard reventara con ENOENT sin comprobar nada (#141).
function raizDelModulo(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const arriba = dirname(dir);
    if (arriba === dir) throw new Error('no se encontró module.json subiendo desde el test');
    dir = arriba;
  }
  return dir;
}

const salesRoot = raizDelModulo();
const fuente = readFileSync(join(salesRoot, 'ui/components/erp-pos-touch/erp-pos-touch.ts'), 'utf8');

describe('iconos de formas de pago horneados', () => {
  it('cada icono que puede devolver payMethodIcon aparece como literal en el WC', () => {
    const faltan = PAY_ICON_NAMES.filter((n) => !fuente.includes(`name="${n}"`));
    expect(faltan, 'sin literal no se hornean y el botón sale VACÍO').toEqual([]);
  });

  it('la lista cubre de verdad lo que devuelve la función (no es decorativa)', () => {
    for (const [type, name] of [['cash', ''], ['card', ''], ['transfer', ''], ['other', 'Bizum'], ['loquesea', '']]) {
      expect(PAY_ICON_NAMES).toContain(payMethodIcon(type, name));
    }
  });
});
