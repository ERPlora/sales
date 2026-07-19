import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// GUARD: un backtick dentro de una plantilla Lit (incluidos sus COMENTARIOS) cierra el template
// literal y rompe el build con errores crípticos ("Expected ; but found body"). Me mordió tres
// veces seguidas escribiendo comentarios tipo /* la clase `x` es el contrato */ dentro de html``.
// Este test lo caza en CI en vez de en el build.

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return n.endsWith('.ts') && !n.endsWith('.test.ts') ? [p] : [];
  });
}

/** Backticks dentro de un bloque de comentario que está dentro de una plantilla html`…`. */
function backticksEnComentariosDePlantilla(src: string): string[] {
  const hits: string[] = [];
  const re = /html`([\s\S]*?)`;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const c of m[1].match(/\/\*[\s\S]*?\*\//g) ?? []) {
      if (c.includes('`')) hits.push(c.slice(0, 60).replace(/\s+/g, ' '));
    }
  }
  return hits;
}

describe('plantillas Lit sin backticks en comentarios', () => {
  it('ningún comentario dentro de html`…` usa backticks', () => {
    const malos: string[] = [];
    for (const f of tsFiles(join(process.cwd(), 'ui'))) {
      for (const h of backticksEnComentariosDePlantilla(readFileSync(f, 'utf8'))) {
        malos.push(`${f.split('/ui/')[1]}: ${h}`);
      }
    }
    expect(malos, 'un backtick en un comentario dentro de html`…` cierra el literal y rompe el build').toEqual([]);
  });

  it('el detector funciona (si no, este guard sería decorativo)', () => {
    expect(backticksEnComentariosDePlantilla('const t = html`<div>/* usa `x` aquí */</div>`;')).toHaveLength(1);
    expect(backticksEnComentariosDePlantilla('const t = html`<div>/* limpio */</div>`;')).toHaveLength(0);
  });
});
