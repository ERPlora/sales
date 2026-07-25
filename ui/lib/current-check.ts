// current-check — qué cuenta estaba mirando ESTE terminal (ADR-0146).
//
// Antes lo guardaba `sales_active_cart` con la clave `u:<employee_id>`: «el carrito de mostrador de
// este empleado», junto a una copia de sus líneas. Las líneas ya no hacen falta —el pedido ES la
// cuenta—, pero *qué cuenta tenías delante* sí: al retirar aquella tabla, el TPV pasaba a recuperar
// **el primer pedido abierto**, y con varias cuentas abiertas eso significa aterrizar en la de otro
// camarero.
//
// No es dato de negocio ni responsabilidad de `tables`: es estado del **dispositivo**. Por eso vive
// en el dispositivo. Si se pierde (otro navegador, modo privado, cache limpiada), el TPV empieza en
// blanco y el camarero elige — que es lo que hace cualquier TPV de sala.

const CLAVE = 'erplora.pos.currentCheck';

/** Guarda la cuenta que se está atendiendo en este terminal. Nunca lanza. */
export function rememberCurrentCheck(store: Storage, orderId: string): void {
  try { store.setItem(CLAVE, orderId); } catch { /* modo privado o sin cuota: no es crítico */ }
}

/** Olvida la cuenta (al cobrarla o aparcarla). Nunca lanza. */
export function forgetCurrentCheck(store: Storage): void {
  try { store.removeItem(CLAVE); } catch { /* idem */ }
}

/**
 * La cuenta recordada, **solo si sigue abierta**. `undefined` = empezar en blanco.
 *
 * Deliberadamente NO cae a «otra cualquiera»: si la que tenías se cobró, aterrizar en la cuenta de
 * otro camarero es peor que una pantalla vacía.
 */
export function resolveCurrentCheck(store: Storage, abiertas: readonly string[]): string | undefined {
  let recordada: string | null = null;
  try { recordada = store.getItem(CLAVE); } catch { return undefined; }
  return recordada && abiertas.includes(recordada) ? recordada : undefined;
}
