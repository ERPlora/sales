import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial-queue';

describe('createSerialQueue (ADR-0144)', () => {
  // Encontrado en el navegador: cinco toques seguidos a la tortilla crearon CUATRO pedidos
  // abiertos, cada uno con su línea suelta, y la pantalla mostraba una tortilla. El POS abría el
  // pedido de forma asíncrona y, mientras esa llamada estaba en vuelo, los toques siguientes veían
  // que «aún no hay pedido» y abrían otro. En un bar eso son comandas fantasma.
  it('ejecuta las tareas EN ORDEN, nunca solapadas', async () => {
    const q = createSerialQueue();
    const traza: string[] = [];
    const tarea = (n: number) => async () => {
      traza.push(`inicio-${n}`);
      await new Promise((r) => setTimeout(r, 20 - n * 3)); // la 1ª tarda MÁS que las siguientes
      traza.push(`fin-${n}`);
      return n;
    };
    const res = await Promise.all([q(tarea(1)), q(tarea(2)), q(tarea(3))]);
    expect(res).toEqual([1, 2, 3]);
    // Sin cola, la traza sería inicio-1, inicio-2, inicio-3, fin-3… (solapadas).
    expect(traza).toEqual(['inicio-1', 'fin-1', 'inicio-2', 'fin-2', 'inicio-3', 'fin-3']);
  });

  it('lo que la primera tarea deja escrito lo ve la segunda', async () => {
    // Es exactamente el caso del pedido: el 2º toque tiene que ver el `orderId` que abrió el 1º.
    const q = createSerialQueue();
    let pedido: string | undefined;
    const abrirSiHaceFalta = async () => {
      if (!pedido) {
        await new Promise((r) => setTimeout(r, 10));
        pedido = 'ord-' + Math.random().toString(36).slice(2, 6);
      }
      return pedido;
    };
    const ids = await Promise.all([q(abrirSiHaceFalta), q(abrirSiHaceFalta), q(abrirSiHaceFalta)]);
    expect(new Set(ids).size).toBe(1);
  });

  it('una tarea que falla no atasca la cola', async () => {
    const q = createSerialQueue();
    await expect(q(async () => { throw new Error('falló'); })).rejects.toThrow('falló');
    await expect(q(async () => 'sigo viva')).resolves.toBe('sigo viva');
  });
});
