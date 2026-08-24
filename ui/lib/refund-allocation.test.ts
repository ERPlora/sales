import { describe, it, expect } from 'vitest';
import {
  proportionalSplit,
  draftTotal,
  refundableTotal,
  refundBlock,
  buildAllocations,
  reasonKey,
  parseAmountToCents,
  type RefundLeg,
  type RefundDraft,
} from './refund-allocation.js';

/** 70,00 € cobrados con 50,00 € en tarjeta + 20,00 € en efectivo, nada devuelto todavía. */
const legs = (over: Partial<RefundLeg>[] = []): RefundLeg[] =>
  [
    {
      payment_id: 'pay-card', sort_order: 0, payment_method_id: 'pm-card',
      payment_method_name: 'Tarjeta', payment_method_type: 'card',
      charged: 5000, refunded: 0, remaining: 5000, refundable: 1, reason: '',
    },
    {
      payment_id: 'pay-cash', sort_order: 1, payment_method_id: 'pm-cash',
      payment_method_name: 'Efectivo', payment_method_type: 'cash',
      charged: 2000, refunded: 0, remaining: 2000, refundable: 1, reason: '',
    },
  ].map((l, i) => ({ ...l, ...(over[i] ?? {}) }));

const draft = (entries: Record<string, number | { amount: number; to?: string }>): RefundDraft =>
  Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k, typeof v === 'number' ? { amount: v } : v]),
  );

describe('el reparto proporcional es una PROPUESTA, no una jaula (sales#160 / ADR-0386)', () => {
  it('reparte a prorrata de lo que cada pata cobró', () => {
    // 35,00 € sobre 50/20: la tarjeta puso el 5/7 y el efectivo el 2/7.
    expect(proportionalSplit(3500, legs())).toEqual({ 'pay-card': 2500, 'pay-cash': 1000 });
  });

  it('no pierde ni inventa un céntimo: el resto va a la pata mayor', () => {
    // 10,00 € sobre 50/20 son 7,142857… y 2,857142…. Repartir por redondeo independiente daría
    // 714 + 286 = 1000 por suerte, pero 0,01 € sobre 50/20 daría 1 + 0 o 0 + 1 según quién redondee.
    // Aquí manda el resto mayor, como en el handler: la suma es EXACTA siempre.
    for (const amount of [1, 3, 7, 33, 999, 1000, 4999]) {
      const split = proportionalSplit(amount, legs());
      expect(draftTotal(draft(split))).toBe(amount);
    }
    expect(proportionalSplit(1, legs())).toEqual({ 'pay-card': 1, 'pay-cash': 0 });
  });

  it('nunca propone a una pata más de lo que le queda', () => {
    // El efectivo ya devolvió 18,00 €: le quedan 2,00 €. Devolver los 70,00 € restantes… no
    // existen, pero pedir 52,00 € tiene que respetar el tope de cada una.
    const l = legs([{}, { refunded: 1800, remaining: 200 }]);
    const split = proportionalSplit(5200, l);
    expect(split['pay-cash']).toBeLessThanOrEqual(200);
    expect(split['pay-card']).toBeLessThanOrEqual(5000);
    expect(draftTotal(draft(split))).toBe(5200);
  });

  it('nunca propone MÁS de lo que la venta entera puede devolver', () => {
    // Pedir 100,00 € de una venta de la que solo quedan 70,00 €: la propuesta se queda en los
    // 70,00 €, no en un reparto imposible que el servidor tendría que rechazar pata a pata.
    const split = proportionalSplit(10000, legs());
    expect(split).toEqual({ 'pay-card': 5000, 'pay-cash': 2000 });
    expect(draftTotal(draft(split))).toBe(refundableTotal(legs()));
  });

  it('la pata agotada no entra en el reparto', () => {
    const l = legs([{}, { refunded: 2000, remaining: 0, refundable: 0, reason: 'already_refunded' }]);
    expect(proportionalSplit(3500, l)).toEqual({ 'pay-card': 3500, 'pay-cash': 0 });
  });

  it('la pata cuyo método murió SÍ entra: el dinero sigue siendo devolvible', () => {
    // 🔴 Es la diferencia con Square. `refundable = 0` dice «no por su propia puerta», no «no».
    // Dejarla fuera del reparto encerraría los 50,00 € de la tarjeta para siempre.
    const l = legs([{ refundable: 0, reason: 'method_unavailable' }]);
    expect(proportionalSplit(7000, l)).toEqual({ 'pay-card': 5000, 'pay-cash': 2000 });
  });

  it('el total devolvible es la suma de los topes, no de lo cobrado', () => {
    expect(refundableTotal(legs())).toBe(7000);
    expect(refundableTotal(legs([{ refunded: 1500, remaining: 3500 }]))).toBe(5500);
  });
});

describe('por qué NO se puede confirmar todavía', () => {
  it('sin nada tecleado no hay devolución', () => {
    expect(refundBlock(draft({}), legs())).toEqual({ reason: 'nothing' });
    expect(refundBlock(draft({ 'pay-card': 0 }), legs())).toEqual({ reason: 'nothing' });
  });

  it('pasarse del tope dice CUÁL se pasó, con sus números', () => {
    // El mismo rechazo que el servidor (`sales.refund_exceeds_tender`), pero antes de tocar el
    // botón: el operador ve el número rojo mientras teclea, no después de confirmar.
    expect(refundBlock(draft({ 'pay-card': 5000, 'pay-cash': 2500 }), legs())).toEqual({
      reason: 'over-cap',
      leg: expect.objectContaining({ payment_id: 'pay-cash', payment_method_name: 'Efectivo' }),
      amount: 2500,
      remaining: 2000,
    });
  });

  it('una pata no elegible pide DESTINO en vez de fallar al confirmar', () => {
    const l = legs([{ refundable: 0, reason: 'method_unavailable' }]);
    expect(refundBlock(draft({ 'pay-card': 3000 }), l)).toEqual({
      reason: 'needs-destination',
      leg: expect.objectContaining({ payment_id: 'pay-card' }),
      why: 'method_unavailable',
    });
  });

  it('con el destino elegido, deja de bloquear', () => {
    const l = legs([{ refundable: 0, reason: 'method_unavailable' }]);
    expect(refundBlock(draft({ 'pay-card': { amount: 3000, to: 'pm-cash' } }), l)).toBeUndefined();
  });

  it('una pata a cero no pide destino aunque no sea elegible', () => {
    // El reparto por defecto puede dejarla a cero; molestar entonces sería ruido.
    const l = legs([{ refundable: 0, reason: 'method_unavailable' }]);
    expect(refundBlock(draft({ 'pay-card': 0, 'pay-cash': 2000 }), l)).toBeUndefined();
  });

  it('el tope manda sobre el destino: primero se dice que te pasaste', () => {
    const l = legs([{ refundable: 0, reason: 'method_unavailable' }]);
    expect(refundBlock(draft({ 'pay-card': 9999 }), l)?.reason).toBe('over-cap');
  });

  it('un reparto correcto no bloquea', () => {
    expect(refundBlock(draft({ 'pay-card': 5000, 'pay-cash': 2000 }), legs())).toBeUndefined();
  });
});

describe('lo que viaja al servidor', () => {
  it('solo las patas con dinero, en el orden del tique', () => {
    const payload = buildAllocations(draft({ 'pay-cash': 2000, 'pay-card': 0 }), legs());
    expect(payload).toEqual([{ payment_id: 'pay-cash', amount: 2000 }]);
  });

  it('el destino solo viaja cuando el operador lo cambió', () => {
    // Mandar `to_payment_method_id` igual al propio método sería ruido: el servidor ya lo resuelve.
    const l = legs([{ refundable: 0, reason: 'method_unavailable' }]);
    expect(buildAllocations(draft({ 'pay-card': { amount: 3000, to: 'pm-cash' } }), l)).toEqual([
      { payment_id: 'pay-card', amount: 3000, to_payment_method_id: 'pm-cash' },
    ]);
    expect(buildAllocations(draft({ 'pay-card': { amount: 3000, to: 'pm-card' } }), legs())).toEqual([
      { payment_id: 'pay-card', amount: 3000 },
    ]);
  });

  it('ordena por la pata, no por el orden en que el operador tecleó', () => {
    const payload = buildAllocations(draft({ 'pay-cash': 2000, 'pay-card': 5000 }), legs());
    expect(payload.map((p) => p.payment_id)).toEqual(['pay-card', 'pay-cash']);
  });
});

describe('los motivos se traducen por CÓDIGO, nunca por la frase', () => {
  it('cada motivo del servidor tiene su clave', () => {
    expect(reasonKey('already_refunded')).toBe('ui.refundReasonAlreadyRefunded');
    expect(reasonKey('method_unavailable')).toBe('ui.refundReasonMethodUnavailable');
  });

  it('un motivo que este build no conoce cae a un texto genérico, no a vacío', () => {
    // Un `services` más nuevo puede mandar un motivo que aquí no existe todavía. Pintar nada
    // dejaría la pata bloqueada SIN explicación, que es el peor de los dos males.
    expect(reasonKey('voucher_burnt_in_2031')).toBe('ui.refundReasonNotEligible');
    expect(reasonKey('')).toBe('ui.refundReasonNotEligible');
  });
});

describe('lo que el operador teclea son EUROS; lo que viaja son CÉNTIMOS', () => {
  it('acepta la coma decimal, que es como se escribe un importe en español', () => {
    // 🔴 En esta misma cadena ya se coló una fixture con precios en euros donde el TPV lee
    // céntimos. Un «25,00» leído como `Number('25,00')` da NaN, y un NaN silencioso en una
    // devolución es dinero que no sale o que sale de más.
    expect(parseAmountToCents('25,00')).toBe(2500);
    expect(parseAmountToCents('25.00')).toBe(2500);
    expect(parseAmountToCents('25')).toBe(2500);
    expect(parseAmountToCents('0,07')).toBe(7);
  });

  it('lo que no es un importe vale cero, nunca NaN', () => {
    for (const bad of ['', '   ', 'abc', '-', null, undefined]) {
      expect(parseAmountToCents(bad as unknown as string)).toBe(0);
    }
  });

  it('redondea al céntimo y no admite negativos', () => {
    expect(parseAmountToCents('1,005')).toBe(101);
    expect(parseAmountToCents('-5')).toBe(0);
  });

  it('ignora el separador de miles y el símbolo de moneda', () => {
    // El operador copia y pega «1.234,56 €» del tique: lo que se lee tiene que ser 123456.
    expect(parseAmountToCents('1.234,56 €')).toBe(123456);
    expect(parseAmountToCents('1,234.56')).toBe(123456);
  });
});
