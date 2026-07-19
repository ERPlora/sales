import { describe, it, expect } from 'vitest';
import { receiptToPrintableHtml } from './receipt-html';

// El tiquet como HTML PLANO y autocontenido: sin web components, sin CSS de la app. Es lo que se
// imprime en el iframe aislado (y lo que alimentará el PDF desde Rust). Imprimir el DOM de la app
// resultó indomable: el papel vive en un ion-modal reparentado, con shadow DOM de por medio.
const doc = {
  business: { name: 'Bar Manolo', address: 'C/ Mayor 1', tax_id: 'B12345678' },
  number: 'TICKET-2026-000007',
  datetime: '18/07/2026, 17:50',
  customer: 'Mesa 3',
  lines: [
    { name: 'Cerveza', qty: 2, unit_price: 2.5, total: 5 },
    { name: 'Tapa (invitación)', qty: 1, unit_price: 3, total: 0 },
  ],
  subtotal: 5,
  taxes: [{ label: 'IVA 21%', base: 4.13, amount: 0.87 }],
  total: 5,
  payment: { method: 'Efectivo', paid: 10, change: 5 },
  currency: '€',
  footer: 'Gracias por su visita',
};

describe('tiquet como HTML imprimible', () => {
  const html = receiptToPrintableHtml(doc);

  it('es un documento completo y autocontenido (no un fragmento suelto)', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<style>');
    expect(html).not.toContain('ok-receipt');   // sin web components
    expect(html).not.toContain('ion-');          // sin Ionic
  });

  it('lleva el negocio, el número y la fecha', () => {
    expect(html).toContain('Bar Manolo');
    expect(html).toContain('TICKET-2026-000007');
    expect(html).toContain('18/07/2026, 17:50');
    expect(html).toContain('B12345678');
  });

  it('lleva las líneas con su cantidad e importe, y el total', () => {
    expect(html).toContain('Cerveza');
    expect(html).toContain('2 × 2,50 €');
    expect(html).toContain('5,00 €');
    expect(html).toMatch(/TOTAL[\s\S]*5,00 €/);
  });

  it('lleva el desglose de impuestos y el pago con su cambio', () => {
    expect(html).toContain('IVA 21%');
    expect(html).toContain('Efectivo');
    expect(html).toContain('10,00 €');
    expect(html).toContain('5,00 €');
  });

  it('está pensado para papel de 80 mm', () => {
    expect(html).toContain('80mm');
  });

  it('escapa el HTML de los datos (un producto llamado <script> no ejecuta nada)', () => {
    const malo = receiptToPrintableHtml({ ...doc, business: { name: '<script>alert(1)</script>' }, lines: [] });
    expect(malo).not.toContain('<script>alert(1)</script>');
    expect(malo).toContain('&lt;script&gt;');
  });

  it('aguanta un documento mínimo sin reventar (cuenta previa: sin número ni pago)', () => {
    const minimo = receiptToPrintableHtml({ business: { name: 'Bar' }, lines: [{ name: 'X', qty: 1, unit_price: 1, total: 1 }], total: 1, currency: '€' });
    expect(minimo).toContain('Bar');
    expect(minimo).not.toContain('undefined');
    expect(minimo).not.toContain('NaN');
  });
});
