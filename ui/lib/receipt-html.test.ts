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

// sales#103 — «pide tu factura»: el HTML (el respaldo del navegador y el input del PDF) lleva el
// mismo bloque que el renderer ESC/POS. Aquí no hay QR pintable sin librería — igual que el QR
// fiscal, que en HTML solo estampa su nota — así que el bloque es LEYENDA + LOCALIZADOR EN TEXTO
// (la única vía cuando la cámara no enfoca) + la URL para teclearla.
describe('el bloque «pide tu factura» del papel HTML (sales#103)', () => {
  it('con claim: leyenda, localizador en texto y URL escaneable/tecleable', () => {
    const html = receiptToPrintableHtml({
      ...doc,
      claim_qr_data: 'https://hub.example/p/ABCD1234ABCD1234',
      claim_note: 'Pide tu factura',
      claim_locator: 'ABCD1234ABCD1234',
    });
    expect(html).toContain('Pide tu factura');
    expect(html).toContain('ABCD1234ABCD1234');
    expect(html).toContain('https://hub.example/p/ABCD1234ABCD1234');
  });

  it('sin claim no existe el bloque: el papel es exactamente el de hoy', () => {
    const html = receiptToPrintableHtml(doc);
    // La regla CSS vive SIEMPRE en el stylesheet (como .doc-title); lo que no debe existir es el
    // ELEMENTO del bloque.
    expect(html).not.toContain('class="claim"');
    expect(html).not.toContain('Pide tu factura');
  });

  it('el localizador se escapa como el resto de los datos (es texto tecleado por el hub, pero por si acaso)', () => {
    const html = receiptToPrintableHtml({ ...doc, claim_note: 'X', claim_locator: '<b>LOC</b>' });
    expect(html).not.toContain('<b>LOC</b>');
  });
});

// ── sales#148 · el suplemento se imprime BAJO su línea, sangrado y sin importe ────────────────
//
// Decidido por el mercado (10 referencias, tabla en la issue): sub-línea sangrada bajo su producto
// —Square, Lightspeed «below items», LS Central línea hija, Odoo `ms-4`, Shopify `<li>` anidado,
// Clover, Toast en modo Vertical— y SOLO EL NOMBRE, porque el delta ya está dentro del total de la
// línea que se pinta a la derecha (mismo modelo que Toast documenta y Shopify POS implementa).
describe('los suplementos en el papel HTML (sales#148)', () => {
  const conSuplementos = {
    lines: [{
      name: 'Hamburguesa', qty: 1, unit_price: 10, total: 10,
      modifiers: [{ name: 'Extra queso', price_delta: 100 }, { name: 'Sin cebolla', price_delta: 0 }],
    }],
    total: 10,
  };

  it('imprime cada suplemento, con su nombre', () => {
    const html = receiptToPrintableHtml(conSuplementos);
    expect(html).toContain('Extra queso');
    expect(html).toContain('Sin cebolla');
  });

  it('cada uno en SU renglón, dentro de la celda de su línea — no pegado al nombre del producto', () => {
    const html = receiptToPrintableHtml(conSuplementos);
    const celda = html.slice(html.indexOf('<td class="n">'), html.indexOf('</td>'));
    expect(celda, 'el suplemento vive DENTRO de la celda de su producto').toContain('Extra queso');
    expect(celda).toMatch(/class="mod"[^>]*>\s*Extra queso/);
    expect(celda).toMatch(/class="mod"[^>]*>\s*Sin cebolla/);
    expect(celda, 'y no fundido en el nombre del producto').toMatch(/>Hamburguesa</);
  });

  it('el sangrado es real: la clase `.mod` lleva su indentación en el CSS del papel', () => {
    const html = receiptToPrintableHtml(conSuplementos);
    expect(html).toMatch(/\.mod\s*\{[^}]*padding-left/);
  });

  it('SIN importe: el delta ya está dentro del total de la línea, y esa columna cuadra el TOTAL', () => {
    // Se mira DENTRO de las sub-líneas, no en la celda entera: la celda lleva «1 × 10,00 €», y
    // «10,00» contiene «0,00» — una aserción sobre la celda pasaría por accidente y no probaría nada.
    const mods = [...receiptToPrintableHtml(conSuplementos).matchAll(/<div class="mod">(.*?)<\/div>/g)].map((m) => m[1]);
    expect(mods, 'las dos sub-líneas están ahí (si no, esta comprobación no probaría nada)').toHaveLength(2);
    for (const m of mods) {
      expect(m, 'ni el importe del suplemento, ni un «0,00» para el gratuito').not.toMatch(/\d/);
      expect(m, 'ni la moneda').not.toContain('€');
    }
  });

  it('respeta el ORDEN de elección', () => {
    const html = receiptToPrintableHtml(conSuplementos);
    expect(html.indexOf('Extra queso')).toBeLessThan(html.indexOf('Sin cebolla'));
  });

  it('un suplemento con un nombre malicioso se ESCAPA, como cualquier dato tecleado', () => {
    const html = receiptToPrintableHtml({
      lines: [{ name: 'X', qty: 1, unit_price: 1, total: 1, modifiers: [{ name: '<script>alert(1)</script>' }] }],
      total: 1,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('una línea SIN suplementos sale exactamente como salía antes', () => {
    const sin = { lines: [{ name: 'Hamburguesa', qty: 1, unit_price: 10, total: 10 }], total: 10 };
    expect(receiptToPrintableHtml(sin)).not.toContain('class="mod"');
  });
});

// sales#154 / ADR-0381 — the menu on the HTML paper: the header row carries the name and the closed
// price; the components go INDENTED under it, in their own sub-lines, WITHOUT an amount in the
// amount column (only their supplement, in the label). Why: `paper-combos.ts`.
describe('the menu on the HTML paper (sales#154)', () => {
  const menu = receiptToPrintableHtml({
    ...doc,
    lines: [
      { name: 'Menú del día', qty: 1, unit_price: 16.5, total: 16.5,
        combo: { name: 'Menú del día', components: [{ name: 'Gazpacho' }, { name: 'Solomillo', price_delta: 300 }] },
        modifiers: [{ name: 'Al punto' }] },
    ],
    total: 16.5,
  });

  it('paints the header with the closed price and each component on its own indented sub-line', () => {
    expect(menu).toContain('Menú del día');
    expect(menu).toContain('16,50 €');
    const comps = [...menu.matchAll(/<div class="comp">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(comps).toEqual(['Gazpacho', 'Solomillo (+3,00)']);
  });

  it('the components come BEFORE the supplements of the line, and none of them sits in the amount column', () => {
    expect(menu.indexOf('class="comp">Gazpacho')).toBeLessThan(menu.indexOf('class="mod">Al punto'));
    // Only two AMOUNT CELLS carry 16,50 on this paper: the row total and the TOTAL. (The «1 ×
    // 16,50 €» quantity sub-line is not an amount cell — it is the same text, in the name column.)
    expect(menu.match(/class="a">16,50 €/g)).toHaveLength(2);
  });

  it('a line without a menu paints no component block: the paper of always', () => {
    expect(receiptToPrintableHtml(doc)).not.toContain('class="comp"');
  });
});
