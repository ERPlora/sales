import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIZUM_SVG, brandSvgFor } from './brand-icons';

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

// Bizum NO existe en Iconify (comprobado contra su API: not_found), así que su logo viaja como SVG
// propio en ui/assets. Va INLINE, no por <ion-icon>: el registro de iconos del módulo solo hornea
// Ionicons, y un `src`/`data:` dependería de red o de la CSP.
describe('logo de marca (Bizum)', () => {
  it('el SVG inline y el fichero de assets son el MISMO (no se pueden desincronizar)', () => {
    const fichero = readFileSync(join(salesRoot, 'ui/assets/bizum.svg'), 'utf8').trim();
    expect(BIZUM_SVG.trim()).toBe(fichero);
  });

  it('está en formato Iconify: viewBox, sin width/height y con currentColor', () => {
    expect(BIZUM_SVG).toContain('viewBox=');
    expect(BIZUM_SVG).not.toMatch(/\swidth="/);
    expect(BIZUM_SVG).not.toMatch(/\sheight="/);
    expect(BIZUM_SVG).toContain('currentColor');
    expect(BIZUM_SVG).not.toContain('#05C0C7'); // el color lo pone el contexto, como el resto
  });

  it('se elige por tipo o por nombre, y solo para Bizum', () => {
    expect(brandSvgFor('other', 'Bizum')).toBe(BIZUM_SVG);
    expect(brandSvgFor('other', 'bizum')).toBe(BIZUM_SVG);
    expect(brandSvgFor('bizum', '')).toBe(BIZUM_SVG);
    expect(brandSvgFor('cash', 'Efectivo')).toBeUndefined();
    expect(brandSvgFor('card', 'Tarjeta')).toBeUndefined();
    expect(brandSvgFor(undefined, undefined)).toBeUndefined();
  });
});
