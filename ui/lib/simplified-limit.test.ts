import { describe, expect, it } from 'vitest';
import {
  isOverSimplifiedLimit,
  recipientIsComplete,
  ticketIsBlocked,
  type SimplifiedLimitState,
} from './simplified-limit';

const state = (over: Partial<SimplifiedLimitState> = {}): SimplifiedLimitState => ({
  payableCents: 1000,
  maxCents: 300_000,
  documentFormat: 'ticket',
  customerName: '',
  customerTaxId: '',
  customerAddress: '',
  ...over,
});

describe('el techo de la simplificada en el mostrador (hub#297)', () => {
  describe('cuándo la venta pasa del techo', () => {
    it('por debajo del techo no pasa nada: el tique es el camino normal', () => {
      expect(isOverSimplifiedLimit(299_999, 300_000)).toBe(false);
    });

    it('EXACTAMENTE en el techo ya cuenta', () => {
      // Un céntimo más estricto que §15.8 («no superior a 3.000,00»), y a propósito: lo que el TPV
      // suma es el TOTAL, mientras que la AEAT suma Σ(base + cuota) línea a línea. Las dos cifras
      // pueden separarse un céntimo por redondeo, así que quedarse justo en el borde es apostar la
      // validez de la factura a de qué lado cae ese céntimo.
      expect(isOverSimplifiedLimit(300_000, 300_000)).toBe(true);
    });

    it('sin techo declarado NUNCA pasa: un país sin regla no hereda la española', () => {
      expect(isOverSimplifiedLimit(10_000_000, null)).toBe(false);
    });
  });

  describe('cuándo el destinatario está completo', () => {
    it('las tres cosas: nombre, NIF y domicilio', () => {
      expect(
        recipientIsComplete({ customerName: 'ACME SL', customerTaxId: 'B12345678', customerAddress: 'C/ Mayor 1' }),
      ).toBe(true);
    });

    it('sin NIF no está: es lo único que distingue una F1 de un tique', () => {
      expect(
        recipientIsComplete({ customerName: 'ACME SL', customerTaxId: '', customerAddress: 'C/ Mayor 1' }),
      ).toBe(false);
    });

    it('sin domicilio tampoco: lo exige el art. 7.2.a', () => {
      expect(
        recipientIsComplete({ customerName: 'ACME SL', customerTaxId: 'B12345678', customerAddress: '' }),
      ).toBe(false);
    });

    it('sin nombre tampoco: `NombreRazon` es obligatorio y sin él la AEAT rechaza la F1', () => {
      // Dejarlo pasar solo movería el rechazo un paso más allá, que es justo lo que este bloqueo
      // existe para evitar.
      expect(
        recipientIsComplete({ customerName: '', customerTaxId: 'B12345678', customerAddress: 'C/ Mayor 1' }),
      ).toBe(false);
    });

    it('los espacios en blanco no rellenan nada', () => {
      expect(
        recipientIsComplete({ customerName: '  ', customerTaxId: ' ', customerAddress: '\t' }),
      ).toBe(false);
    });
  });

  describe('el bloqueo del TIPO DE DOCUMENTO (no de la venta)', () => {
    it('una venta normal no se bloquea nunca', () => {
      expect(ticketIsBlocked(state({ payableCents: 1_500 }))).toBe(false);
    });

    it('por encima del techo y sin NIF, el tique NO se puede cerrar', () => {
      expect(ticketIsBlocked(state({ payableCents: 350_000 }))).toBe(true);
    });

    it('en un país sin techo se cobra igual que siempre, por alto que sea el importe', () => {
      expect(ticketIsBlocked(state({ payableCents: 5_000_000, maxCents: null }))).toBe(false);
    });

    it('con el destinatario completo Y el documento en «factura», se desbloquea', () => {
      expect(
        ticketIsBlocked(
          state({
            payableCents: 350_000,
            documentFormat: 'invoice',
            customerName: 'ACME SL',
            customerTaxId: 'B12345678',
            customerAddress: 'C/ Mayor 1',
          }),
        ),
      ).toBe(false);
    });

    it('🔴 elegir «factura» SIN NIF no desbloquea', () => {
      // `resolve_invoice_type` solo DEGRADA: una F1 sin destinatario vuelve a F2 y la AEAT la
      // rechaza (1189) con el número ya gastado. El formato por sí solo no salva a nadie.
      expect(
        ticketIsBlocked(state({ payableCents: 350_000, documentFormat: 'invoice' })),
      ).toBe(true);
    });

    it('🔴 tener el NIF pero seguir en «tique» tampoco desbloquea', () => {
      // Y este es el que sorprende: `document_type: 'ticket'` es F2 pase lo que pase, porque
      // `resolve_invoice_type` nunca ASCIENDE. Con el NIF puesto y el formato sin cambiar, la venta
      // saldría como simplificada de 3.500 € — rechazo garantizado (§15.8).
      expect(
        ticketIsBlocked(
          state({
            payableCents: 350_000,
            documentFormat: 'ticket',
            customerName: 'ACME SL',
            customerTaxId: 'B12345678',
            customerAddress: 'C/ Mayor 1',
          }),
        ),
      ).toBe(true);
    });
  });
});

// sales#317 — «Factura» is a promise about the paper, and it has to be kept BELOW the ceiling too.
// Before: the cashier picked «Factura» on a 51,90 € sale with no customer, the till charged without
// asking anything, the screen handed over a «FACTURA» made out to «Cliente» — and VeriFactu filed it
// as an F2, because `resolve_invoice_type` downgrades an F1 with no recipient. Paper and record
// disagreed. The market (Holded, Odoo POS, Square ES) asks for the customer the moment an invoice
// is requested; without the data the only valid document is the ticket.
describe('«Factura» por debajo del techo también pide destinatario (sales#317)', () => {
  it('🔴 elegir «factura» sin cliente bloquea el cobro aunque el importe sea pequeño', () => {
    expect(ticketIsBlocked(state({ payableCents: 5_190, documentFormat: 'invoice' }))).toBe(true);
  });

  it('con NIF pero sin domicilio sigue bloqueado: es el mismo destinatario que pide el techo', () => {
    expect(
      ticketIsBlocked(
        state({ payableCents: 5_190, documentFormat: 'invoice', customerName: 'Ana', customerTaxId: '12345678Z' }),
      ),
    ).toBe(true);
  });

  it('con el destinatario completo se cobra como factura', () => {
    expect(
      ticketIsBlocked(
        state({
          payableCents: 5_190,
          documentFormat: 'invoice',
          customerName: 'Ana López',
          customerTaxId: '12345678Z',
          customerAddress: 'C/ Mayor 1, Madrid',
        }),
      ),
    ).toBe(false);
  });

  it('en un país sin techo, una factura sigue necesitando a quién se hace', () => {
    // The ceiling is Spanish; the recipient of a complete invoice is not (Directive 2006/112/EC
    // art. 226). A country with no ceiling row still cannot issue an invoice to nobody.
    expect(ticketIsBlocked(state({ payableCents: 5_190, maxCents: null, documentFormat: 'invoice' }))).toBe(true);
  });

  it('el tique normal, sin cliente, se cobra como siempre', () => {
    expect(ticketIsBlocked(state({ payableCents: 5_190, documentFormat: 'ticket' }))).toBe(false);
  });
});
