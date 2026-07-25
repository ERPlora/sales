import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PAY_ICON_NAMES, payMethodIcon } from './pay-icons';

// GUARD: `name=${payMethodIcon(...)}` es DINÁMICO y el empaquetador del módulo solo hornea
// literales — el propio extractor lo dice: "un nombre que solo existe en runtime no es horneable".
// Resultado en producción: el botón de Bizum salía VACÍO. Para que viajen, los nombres tienen que
// aparecer además como <ion-icon name="…"> estáticos en el WC. Este test lo vigila.
const salesRoot = basename(process.cwd()) === 'sales'
  ? process.cwd()
  : join(process.cwd(), 'modules', 'sales');
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
