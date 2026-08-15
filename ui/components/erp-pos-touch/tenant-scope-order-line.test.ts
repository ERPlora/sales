// Una línea solo se añade a un pedido del MISMO hub (pm#146).
//
// Aquí la fila cruzada es **dinero en el ticket equivocado**: `order_add_line.sql` metía
// `:order_id` tal cual del payload, así que una línea podía colgar del pedido de otro negocio. Y la
// segunda sentencia del command recalcula el total de ESE pedido, de modo que el importe del
// vecino cambiaba también.
//
// El command es de cara al cliente (`permission: sales.add_sale`), no un interno llamado por un
// handler que ya validó: el `order_id` llega de quien pulsa en el TPV.
//
// Las dos mitades de la receta (services#7):
//
//   1. el pedido se resuelve contra el `:hub_id` que **inyecta el runtime**;
//   2. y si no casa, **falla**. Sin `expect_rows` el command devuelve OK habiendo escrito cero
//      líneas — y en un TPV eso es peor que un error: el camarero ve que "se añadió" y cobra sin
//      ella.
//
// ⚠️ Lo que este test NO cubre: `product_id` apunta a `inventory`, otro módulo. Un `EXISTS` contra
// `inventory_product` rompería el aislamiento de ADR-0263 y ataría `sales` a que `inventory` esté
// instalado. Esa mitad no se arregla en SQL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')) as {
  id: string;
  commands: Record<
    string,
    { sql?: string[]; expect_rows?: { op: string; n: number; error: string; message?: string } }
  >;
};

const fileOf = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

/**
 * SOLO la sentencia que inserta la línea, no todo el SQL del command.
 *
 * ⚠️ Concatenar las dos sentencias hacía que este test PASARA en falso: la segunda
 * (`order_recompute_total.sql`) ya acota el pedido por `hub_id`, así que la aserción se cumplía
 * mientras el INSERT seguía tomando cualquier `order_id`. Un guard que se conforma con encontrar la
 * cadena en cualquier parte no guarda la parte que importa.
 */
const insertOf = (name: string) => {
  const rel = (manifest.commands[name].sql ?? []).find((f) => /add_line/.test(f));
  expect(rel, `${name} ya no declara la sentencia que inserta la línea`).toBeTruthy();
  return fileOf(rel!);
};

// Las dos comparten `order_add_line.sql`, así que el arreglo del SQL vale para ambas — pero
// `expect_rows` es por command y hay que ponerlo en las dos.
const COMMANDS = ['sales.order.add_line', 'sales.order.add_open_line'] as const;

describe('una línea solo se añade a un pedido del mismo hub (pm#146)', () => {
  it.each(COMMANDS)('%s resuelve el pedido contra el hub inyectado', (name) => {
    const sql = insertOf(name);

    expect(sql, 'toma cualquier order_id: también el de otro negocio').toMatch(/sales_order\b/);
    expect(sql, 'el pedido tiene que ser de ESTE hub').toMatch(/hub_id\s*=\s*:hub_id/);
  });

  it.each(COMMANDS)('%s falla en vez de no escribir y decir que sí', (name) => {
    const gate = manifest.commands[name].expect_rows;

    expect(gate, 'sin `expect_rows` el TPV cree que añadió la línea y cobra sin ella').toBeTruthy();
    expect(gate!.op).toBe('min');
    expect(gate!.n).toBeGreaterThanOrEqual(1);
    expect(gate!.error.split('.')[0], 'el instalador exige el namespace del módulo').toBe(
      manifest.id,
    );
    expect(gate!.message, 'ningún shell traduce estos códigos todavía: hace falta el texto').toBeTruthy();
  });
});
