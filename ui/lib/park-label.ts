// park-label — el nombre por defecto de una cuenta al APARCARLA (rediseño TPV 2026-07-19).
//
// La etiqueta es lo que hace RECONOCIBLE un tiquet aparcado en la lista de cuentas abiertas
// (antes salían anónimos: solo total+hora, y «desaparecían» a la vista). La regla, calcada del
// patrón Loyverse: con MESA el nombre es la mesa (una pulsación, sin preguntar); sin mesa, la
// hora HH:MM — «la de las 15:07» — pre-seleccionada para sobreescribirla de un toque.

/** Nombre por defecto al aparcar: la mesa si la hay; si no, la hora local `HH:MM`. */
export function defaultParkLabel(tableLabel: string | undefined, now: Date): string {
  const mesa = (tableLabel ?? '').trim();
  if (mesa) return mesa;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
