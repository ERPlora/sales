// pay-icons — icono de cada forma de pago para el TPV (ADR-0133: las acciones van SOLO-ICONO).
//
// El texto lo teclea el usuario al crear la forma de pago ("Efectivo", "Tarjeta", "Bizum",
// "Ticket restaurante"…), así que el icono se resuelve primero por `type` (dato estructurado) y,
// si no basta, por el NOMBRE. Todo lo que no encaje cae a un icono genérico: un icono sin mapear
// se pinta VACÍO y el botón queda mudo — con formas de pago eso es un cobro a ciegas.

/** Icono cuando no se reconoce ni el tipo ni el nombre. NUNCA se devuelve cadena vacía. */
export const PAY_ICON_FALLBACK = 'ellipsis-horizontal-circle-outline';

const BY_TYPE: Record<string, string> = {
  cash: 'cash-outline',
  card: 'card-outline',
  credit: 'card-outline',
  debit: 'card-outline',
  transfer: 'swap-horizontal-outline',
  bank: 'swap-horizontal-outline',
  mobile: 'phone-portrait-outline',
  wallet: 'phone-portrait-outline',
  voucher: 'ticket-outline',
  gift: 'gift-outline',
};

/** Pistas por nombre, para formas de pago creadas a mano con `type` genérico. */
const BY_NAME: [RegExp, string][] = [
  [/efectiv|cash|met[áa]lico|caja/i, 'cash-outline'],
  [/tarjet|card|visa|mastercard|cr[ée]dito|d[ée]bito/i, 'card-outline'],
  [/bizum|m[óo]vil|mobile|wallet|apple pay|google pay/i, 'phone-portrait-outline'],
  [/transfer|banc|iban/i, 'swap-horizontal-outline'],
  [/vale|ticket|cheque|restaurante/i, 'ticket-outline'],
  [/regalo|gift/i, 'gift-outline'],
];

/**
 * Icono Ionicons para una forma de pago. `type` manda; si no se reconoce, se intenta por `name`;
 * y si tampoco, cae a [`PAY_ICON_FALLBACK`]. **Nunca** devuelve vacío.
 */
export function payMethodIcon(type?: string, name?: string): string {
  const t = (type || '').trim().toLowerCase();
  if (BY_TYPE[t]) return BY_TYPE[t];
  const n = (name || '').trim();
  if (n) {
    for (const [re, icon] of BY_NAME) if (re.test(n)) return icon;
  }
  return PAY_ICON_FALLBACK;
}

/** Forma de pago tal y como la devuelve `sales.payment_methods`. */
export interface PayMethodLike {
  id: string;
  name: string;
  type?: string;
  /** 1 = hay que teclear el importe entregado y calcular cambio (efectivo). 0 = importe exacto. */
  requires_change?: number | boolean;
}

/**
 * ¿Hay que pedir el importe ENTREGADO (y calcular cambio) para esta forma de pago?
 *
 * Con **tarjeta** se cobra el importe exacto: no hay entregado ni cambio, así que el teclado
 * numérico sobra y solo estorba en barra. La regla NO se hardcodea a "efectivo": la manda el dato
 * `requires_change` de la propia forma de pago, para que una creada a mano (Bizum, vale restaurante)
 * se comporte como la definió su dueño. Si el dato falta (filas antiguas), se cae al `type`.
 * Sin forma de pago seleccionada se asume efectivo, que es el caso por defecto del TPV de barra.
 */
export function needsTendered(method?: PayMethodLike): boolean {
  if (!method) return true;
  if (method.requires_change !== undefined && method.requires_change !== null) {
    return method.requires_change === 1 || method.requires_change === true;
  }
  return (method.type || '').trim().toLowerCase() === 'cash';
}

/**
 * Atajos de importe entregado en EFECTIVO: el importe exacto y los REDONDEOS inmediatamente
 * superiores (siguiente euro, siguiente 5, siguiente 10). Es el patrón de los TPV —Toast ofrece
 * 21/25/30 para una cuenta de 20,43—: el cajero pulsa en vez de teclear y el cambio sale solo.
 * No son "billetes": la gente paga 13 € para una cuenta de 12,50 tanto como con un billete de 20.
 * Máximo 4 opciones, porque en barra más botones se leen más lento, no más rápido.
 * Devuelve CÉNTIMOS, con el exacto primero.
 */
export function quickCashAmounts(totalCents: number): number[] {
  if (!totalCents || totalCents <= 0) return [];
  const out: number[] = [totalCents];
  // El "siguiente euro" solo tiene sentido si la cuenta lleva céntimos (12,50 → 13). Con una
  // cuenta redonda (20,00) ofrecerlo daría 21 €, que nadie entrega: ahí saltan los redondeos de 5/10.
  const steps = totalCents % 100 === 0 ? [500, 1000] : [100, 500, 1000];
  for (const step of steps) {
    const prev = out[out.length - 1];
    // Múltiplo del paso ESTRICTAMENTE mayor que lo anterior (si no, una cuenta redonda repetiría).
    const v = (Math.floor(prev / step) + 1) * step;
    out.push(v);
    if (out.length >= 4) break;
  }
  return out;
}

/** Ajustes del TPV que gobiernan qué formas de pago se ofrecen. */
export interface PayPolicy { allow_cash?: number; allow_card?: number; allow_transfer?: number }

/**
 * Filtra las formas de pago por la política del hub (Ajustes → `allow_cash`/`allow_card`/
 * `allow_transfer`). La query ya excluye las inactivas; esto aplica encima la decisión del dueño.
 * Las que no tienen flag propio (Bizum, vales…) se dejan: desactivarlas es cosa de `is_active`.
 * Guardarraíl: si el filtro dejara el TPV SIN ninguna forma de pago, se devuelve la lista tal cual
 * — un TPV que no puede cobrar es peor que uno que ofrece de más.
 */
export function enabledPayMethods<T extends PayMethodLike>(methods: T[], policy: PayPolicy = {}): T[] {
  const allowed = (m: T): boolean => {
    const t = (m.type || '').trim().toLowerCase();
    if (t === 'cash') return policy.allow_cash !== 0;
    if (t === 'card' || t === 'credit' || t === 'debit') return policy.allow_card !== 0;
    if (t === 'transfer' || t === 'bank') return policy.allow_transfer !== 0;
    return true;
  };
  const out = methods.filter(allowed);
  return out.length ? out : methods;
}

/** TODOS los iconos que puede devolver `payMethodIcon`. El empaquetador del módulo solo hornea
 *  literales, así que estos nombres deben aparecer TAMBIÉN como `<ion-icon name="…">` estáticos en
 *  el WC (hay un test que lo vigila). Si no, el icono sale VACÍO en producción. */
export const PAY_ICON_NAMES: string[] = [
  ...new Set([...Object.values(BY_TYPE), ...BY_NAME.map(([, i]) => i), PAY_ICON_FALLBACK]),
];

/** Nombres que siembra el SEED de fábrica (ADR-0055: datos en inglés canónico) → su clave i18n. */
const SEED_NAME_TO_KEY: Record<string, string> = {
  Cash: 'ui.cash',
  Card: 'ui.card',
};

/**
 * Nombre VISIBLE de una forma de pago (botones del cobro, tiquet). El seed de fábrica siembra
 * `Cash`/`Card` en inglés canónico (ADR-0055, patrón de las unidades de inventory): mientras la
 * fila conserve ese nombre se muestra traducido por i18n; en cuanto el dueño la renombra
 * («BBVA TPV»), su texto manda tal cual.
 */
export function payMethodDisplayName(method: PayMethodLike, t: (key: string) => string): string {
  const key = SEED_NAME_TO_KEY[(method.name || '').trim()];
  return key ? t(key) : (method.name || '');
}

/**
 * Forma de pago por DEFECTO al abrir el TPV: efectivo si está disponible; si no, la primera según
 * el orden que haya definido el dueño (`sort_order`). Antes se cogía la primera a secas y con
 * varios métodos del mismo `sort_order` mandaba el alfabético — el TPV arrancaba en "Bizum" y no
 * salía el teclado del importe entregado, que es justo lo que se espera en barra.
 */
export function defaultPayMethod<T extends PayMethodLike>(methods: T[]): T | undefined {
  return methods.find((m) => (m.type || '').trim().toLowerCase() === 'cash')
    ?? methods.find((m) => /efectiv|cash|met[\u00e1a]lico/i.test(m.name || ''))
    ?? methods[0];
}
