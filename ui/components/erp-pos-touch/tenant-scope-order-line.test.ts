// Una línea solo se añade a un pedido del MISMO hub (pm#146).
//
// Aquí la fila cruzada es **dinero en el ticket equivocado**: `order_add_line.sql` metía
// `:order_id` tal cual del payload, así que una línea podía colgar del pedido de otro negocio. Y la
// segunda sentencia del command recalcula el total de ESE pedido, de modo que el importe del
// vecino cambiaba también.
//
// El comando es de cara al cliente (`permission: sales.add_sale` / `sales.sell_open_price`), no un
// interno llamado por un handler que ya validó: el `order_id` llega de quien pulsa en el TPV.
//
// 🔴 sales#175 CAMBIÓ DÓNDE VIVE LA CERRADURA, no si existe. El command dejó de ser SQL declarativo
// cuando el cobro pasó a honrar el `unit_price` de la fila: una columna que decide dinero se
// resuelve contra el catálogo en el handler, nunca se bindea del payload. Con ello se fue el
// `expect_rows`, que solo aplica al camino declarativo. Las dos mitades de la receta (services#7)
// siguen, en su sitio nuevo:
//
//   1. el pedido se resuelve contra el `:hub_id` que **inyecta el runtime** — ahora en la lectura
//      `sales.order.get`, declarada `required` y parametrizada con `payload.order_id`;
//   2. y si no casa, **falla**: el handler rechaza con `sales.order_unavailable`, el MISMO código de
//      dominio que daba el `expect_rows` y que la UI ya traduce. Sin eso el command devolvería OK
//      habiendo escrito cero líneas — y en un TPV eso es peor que un error: el camarero ve que "se
//      añadió" y cobra sin ella. Ese rechazo lo prueba el handler
//      (`anadir_una_linea_a_un_pedido_que_no_existe_se_rechaza_con_su_codigo`, handler/src/lib.rs);
//      lo que este test guarda es que la cerradura SIGA DECLARADA en el manifiesto, que es lo que
//      un refactor se lleva por delante sin enterarse.
//
// ⚠️ Lo que este test NO cubre: `product_id` apunta a `inventory`, otro módulo. El handler SÍ lo
// contrasta ahora (lee `inventory.products.for_sale` para congelar el precio, sales#175), pero eso
// es aritmética del handler y se prueba allí.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

type Read = string | { query: string; params?: Record<string, string>; required?: boolean };

const manifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')) as {
  id: string;
  commands: Record<string, { reads?: Read[]; handler?: { function?: string }; sql?: string[] }>;
  queries: Record<string, { sql: string }>;
};

const fileOf = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

/** La lectura que resuelve el pedido, con su forma completa. */
const orderRead = (name: string) => {
  const reads = manifest.commands[name].reads ?? [];
  return reads.find(
    (r): r is Exclude<Read, string> => typeof r !== 'string' && r.query === 'sales.order.get',
  );
};

// Las dos puertas comparten handler (`add_order_line`), así que la cerradura vale para ambas — pero
// las `reads` son POR comando y hay que declararlas en las dos.
const COMMANDS = ['sales.order.add_line', 'sales.order.add_open_line'] as const;

describe('una línea solo se añade a un pedido del mismo hub (pm#146)', () => {
  it.each(COMMANDS)('%s resuelve el pedido contra el hub inyectado', (name) => {
    const read = orderRead(name);

    expect(read, `${name} ya no lee el pedido: aceptaría cualquier order_id`).toBeTruthy();
    expect(read!.params?.order_id, 'la lectura tiene que ir por el order_id del payload').toBe(
      'payload.order_id',
    );

    const sql = fileOf(manifest.queries['sales.order.get'].sql);
    expect(sql, 'el pedido tiene que ser de ESTE hub').toMatch(/hub_id\s*=\s*:hub_id/);
    expect(sql, 'y estar vivo: un pedido borrado no admite líneas').toMatch(/is_deleted\s*=\s*0/);
  });

  it.each(COMMANDS)('%s falla en vez de no escribir y decir que sí', (name) => {
    const read = orderRead(name);

    // `required: true` es lo que hace que una lectura que no resuelve ABORTE el command en el
    // runtime en vez de entregar `None` y dejar al handler decidir a ciegas (hub#701).
    expect(read!.required, 'sin `required` la lectura puede faltar y el handler priorizaría el vacío').toBe(
      true,
    );
    // Y la puerta es el handler, no SQL suelto: si alguien la devolviera a `sql[]`, el
    // `:unit_price` del payload volvería a decidir dinero (sales#175).
    expect(manifest.commands[name].sql, 'volvió a ser SQL declarativo: el payload fijaría el precio').toBeUndefined();
    expect(manifest.commands[name].handler?.function).toBe('add_order_line');
  });
});
