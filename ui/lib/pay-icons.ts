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
