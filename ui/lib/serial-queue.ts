// serial-queue — una vía única para el trabajo asíncrono del TPV (ADR-0144).
//
// Un camarero no toca la pantalla de uno en uno esperando a que responda: mete cinco cañas
// seguidas. Cada toque del POS dispara trabajo asíncrono (abrir el pedido, añadir la línea, subir
// la cantidad), y si esos trabajos corren a la vez se pisan:
//
//   toque 1 → «no hay pedido» → abre pedido …………… (en vuelo)
//   toque 2 → «no hay pedido» (el 1 aún no terminó) → abre OTRO pedido
//
// Verificado en el navegador: cinco toques rápidos dejaron CUATRO pedidos abiertos, cada uno con su
// línea suelta, y la pantalla mostrando un artículo. En un bar eso son comandas fantasma.
//
// La cola encadena cada tarea a la anterior: la segunda ve lo que la primera dejó escrito.

/** Función que encola: devuelve lo que devuelva la tarea, cuando le toque el turno. */
export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

/** Crea una cola de una sola vía. Una tarea que falla NO atasca las siguientes. */
export function createSerialQueue(): SerialQueue {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    // El `catch` mantiene viva la cadena aunque la tarea reviente; el error se le entrega igual a
    // quien encoló (abajo), no se traga.
    const run = last.then(task, task);
    last = run.catch(() => undefined);
    return run;
  };
}
