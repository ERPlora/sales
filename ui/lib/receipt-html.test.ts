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

  it('titles the paper when the document carries a title (pre-bill parity with ESC/POS)', () => {
    // The thermal renderer prints «CUENTA» as the first line; the browser fallback must print
    // the same paper. Before the business name, so it reads as the document's title.
    const html = receiptToPrintableHtml({ ...doc, title: 'Cuenta' });
    expect(html).toContain('Cuenta');
    expect(html.indexOf('Cuenta')).toBeLessThan(html.indexOf('Bar Manolo'));
  });

  it('without a title nothing extra is printed (fiscal receipts keep their look)', () => {
    // The CSS rule is always in the stylesheet; what must not exist is the ELEMENT.
    expect(html).not.toContain('<div class="doc-title">');
  });

  it('aguanta un documento mínimo sin reventar (cuenta previa: sin número ni pago)', () => {
    const minimo = receiptToPrintableHtml({ business: { name: 'Bar' }, lines: [{ name: 'X', qty: 1, unit_price: 1, total: 1 }], total: 1, currency: '€' });
    expect(minimo).toContain('Bar');
    expect(minimo).not.toContain('undefined');
    expect(minimo).not.toContain('NaN');
  });
});

// sales#120 — el tique impreso sale en el idioma del HUB. «Subtotal»/«TOTAL»/«Cambio» vivían
// HARDCODEADOS en español dentro de la plantilla: en un hub inglés el papel decía «Cambio» al
// lado de líneas en inglés. Las palabras no son datos — son labels — así que viajan con el
// documento (`labels`), traducidas por quien lo pide, igual que las de `<ok-receipt>`.
describe('el papel habla el idioma del hub (sales#120)', () => {
  it('Subtotal/TOTAL/Cambio salen de las labels del documento, no de la plantilla', () => {
    const html = receiptToPrintableHtml({
      ...doc,
      labels: { subtotal: 'Subtotal', total: 'TOTAL', change: 'Change', document: 'Document' },
    });
    expect(html).toContain('Change');
    expect(html).not.toContain('Cambio');
    expect(html).toMatch(/TOTAL[\s\S]*5,00 €/);
  });

  it('el <title> de respaldo también: «Document» cuando llega traducido', () => {
    // El fallback solo entra sin número NI negocio (el título preferido es el número).
    const html = receiptToPrintableHtml({
      lines: [{ name: 'Beer', qty: 1, unit_price: 5, total: 5 }],
      total: 5,
      currency: '€',
      labels: { subtotal: 'Subtotal', total: 'TOTAL', change: 'Change', document: 'Document' },
    });
    expect(html).toMatch(/<title>Document<\/title>/);
  });

  it('sin labels se mantiene el español de siempre (nadie regresa peor que antes)', () => {
    const html = receiptToPrintableHtml(doc);
    expect(html).toContain('Cambio');
    expect(html).toContain('Subtotal');
    expect(html).toContain('TOTAL');
    const sinReferencia = receiptToPrintableHtml({
      lines: [{ name: 'Café', qty: 1, unit_price: 1, total: 1 }],
      total: 1,
      currency: '€',
    });
    expect(sinReferencia).toMatch(/<title>Documento<\/title>/);
  });
});

// sales#28 — el recibo impreso no llevaba la unidad: 1,5 kg salía como «1.5 × 12,00 €» (punto
// inglés, sin unidad, junto a euros con coma). La línea del papel pinta ahora la CANTIDAD con su
// unidad congelada y el PRECIO con su unidad de precio, con la misma convención del carrito
// (`priceLabel`: sufijo « / kg» salvo unidad suelta). La unidad suelta y las líneas antiguas sin
// contexto siguen exactamente como estaban: «2 × 3,00 €».
describe('la línea del papel lleva su unidad (sales#28)', () => {
  const pesable = {
    business: { name: 'Frutería Ana' },
    lines: [
      { name: 'Tomate rosa', qty: 1.5, unit_price: 12, total: 18, unit_code: 'kg', pricing_unit_code: 'kg' },
    ],
    total: 18,
    currency: '€',
  };

  it('cantidad decimal con unidad: «1,5 kg × 12,00 € / kg», no «1.5 × 12,00 €»', () => {
    const html = receiptToPrintableHtml(pesable);
    expect(html).toContain('1,5 kg × 12,00 € / kg');
    expect(html).not.toContain('1.5', 'el punto inglés junto a la coma del dinero era el papel roto');
  });

  it('cantidad entera con unidad suelta (`ud`): sin ruido, «2 × 3,00 €»', () => {
    const html = receiptToPrintableHtml({
      ...pesable,
      lines: [{ name: 'Café', qty: 2, unit_price: 3, total: 6, unit_code: 'ud', pricing_unit_code: 'ud' }],
    });
    expect(html).toContain('2 × 3,00 €');
    expect(html).not.toContain('/ ud');
    expect(html).not.toContain(' ud ', '«2 ud» en cada café es el ruido que priceLabel ya evita');
  });

  it('línea antigua sin contexto de unidades: el papel de siempre, byte a byte', () => {
    const html = receiptToPrintableHtml({
      ...pesable,
      lines: [{ name: 'Café', qty: 2, unit_price: 3, total: 6 }],
    });
    expect(html).toContain('2 × 3,00 €');
  });

  it('sin unidad de precio explícita, el precio hereda la unidad de la línea', () => {
    const html = receiptToPrintableHtml({
      ...pesable,
      lines: [{ name: 'Tomate rosa', qty: 1.5, unit_price: 12, total: 18, unit_code: 'kg' }],
    });
    expect(html).toContain('1,5 kg × 12,00 € / kg');
  });

  it('unidad de precio distinta de la de venta: cada cual con la suya', () => {
    // Precio por kg, vendido en g: la cantidad dice «250 g» y el precio, a cuánto el kilo.
    const html = receiptToPrintableHtml({
      ...pesable,
      lines: [{ name: 'Gamba blanca', qty: 250, unit_price: 12, total: 3, unit_code: 'g', pricing_unit_code: 'kg' }],
    });
    expect(html).toContain('250 g × 12,00 € / kg');
  });
});
