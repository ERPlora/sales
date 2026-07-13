// Contrato del COBRO en el TPV de escritorio: la frontera EUROS ↔ CÉNTIMOS.
//
// El dinero es un INTEGER en CÉNTIMOS (ADR-0007): `total` son céntimos. Pero el campo «Entregado»
// es un `<input type="number" step="0.01">` — o sea, un campo de EUROS, que es lo que el cajero
// teclea cuando el cliente le da un billete de 20 €. Los dos lados estaban mezclados:
//
//   · Se prerrellenaba con `String(this.total.toFixed(2))` → una venta de 14,93 € pintaba «1493.00»
//     en un campo de euros. El cajero lee «mil cuatrocientos noventa y tres euros».
//   · `tenderedNum` devolvía el número tal cual y se comparaba contra `total` (céntimos). Teclear
//     `20` (= 20 €) daba `amount_tendered = 20 CÉNTIMOS`, un cambio de 0 € en vez de 5,07 €, y esos
//     20 céntimos se persistían en la venta → arqueo de caja corrupto.
//
// El TPV táctil no tenía el fallo (su numpad ACUMULA céntimos), por eso solo se ve en escritorio.
// La regla que se fija aquí: lo que entra por un input `step="0.01"` son euros y se convierte en la
// frontera; a partir de ahí, todo es céntimos.
import { beforeEach, describe, expect, it } from 'vitest';

const comandos: { name: string; payload: Record<string, unknown> }[] = [];

beforeEach(() => {
  comandos.length = 0;
  (globalThis as Record<string, unknown>).erplora = {
    query: async (name: string) =>
      name === 'inventory.products.list'
        ? { rows: [{ id: 'p1', name: 'Menú del día', sku: 'MEN', price: 1493, is_active: 1 }] }
        : { rows: [] },
    command: async (name: string, payload: Record<string, unknown>) => {
      comandos.push({ name, payload });
      return {};
    },
    currency: 'EUR',
    // Contrato REAL del SDK: formatMoney recibe CÉNTIMOS y divide; formatAmount recibe EUROS.
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    on: () => () => {},
  };
});

/** Monta el TPV con un menú de 14,93 € (1493 céntimos) ya en el carrito, y abre el cobro. */
async function montarConCobroAbierto() {
  await import('./erp-pos-desktop');
  const el = document.createElement('erp-pos-desktop');
  document.body.appendChild(el);
  const wc = el as unknown as {
    updateComplete: Promise<unknown>;
    cart: { id: string; name: string; sku: string; price: number; qty: number }[];
    total: number;
    tendered: string;
    tenderedNum: number;
    change: number;
    openPay: () => void;
    confirm: () => Promise<void>;
  };
  await wc.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await wc.updateComplete;

  wc.cart = [{ id: 'p1', name: 'Menú del día', sku: 'MEN', price: 1493, qty: 1 }];
  wc.openPay();
  await wc.updateComplete;
  return wc;
}

describe('cobro del TPV de escritorio (dinero = céntimos, ADR-0007)', () => {
  it('el total del carrito está en céntimos', async () => {
    const wc = await montarConCobroAbierto();
    expect(wc.total, '1 menú de 1493 céntimos').toBe(1493);
  });

  it('el campo «entregado» se prerrellena en EUROS (14.93), no en céntimos (1493.00)', async () => {
    const wc = await montarConCobroAbierto();
    expect(wc.tendered, 'el input es step="0.01" → euros; prerrellenarlo con céntimos lo hace ×100').toBe('14.93');
  });

  it('teclear 20 (= un billete de 20 €) son 2000 céntimos entregados, no 20', async () => {
    const wc = await montarConCobroAbierto();
    wc.tendered = '20';
    expect(wc.tenderedNum, '20 € entregados = 2000 céntimos').toBe(2000);
  });

  it('el cambio de un billete de 20 € sobre 14,93 € son 5,07 € (507 céntimos)', async () => {
    const wc = await montarConCobroAbierto();
    wc.tendered = '20';
    expect(wc.change, 'el cambio se calcula en céntimos y no puede salir 0').toBe(507);
  });

  it('lo que se PERSISTE en la venta son céntimos: amount_tendered = 2000', async () => {
    const wc = await montarConCobroAbierto();
    wc.tendered = '20';
    await wc.confirm();

    const venta = comandos.find((c) => c.name === 'sales.complete_sale');
    expect(venta, 'no se mandó la venta').toBeTruthy();
    expect(venta!.payload.amount_tendered, 'guardar 20 céntimos corrompe el arqueo de caja').toBe(2000);
  });

  it('sin tocar el campo (importe justo), se entrega el total exacto y el cambio es 0', async () => {
    const wc = await montarConCobroAbierto();
    // El cambio se mira ANTES de confirmar: `confirm()` vacía el carrito (total → 0), así que
    // leerlo después mediría un carrito que ya no existe.
    expect(wc.change).toBe(0);
    await wc.confirm();

    const venta = comandos.find((c) => c.name === 'sales.complete_sale');
    expect(venta!.payload.amount_tendered).toBe(1493);
  });

  it('los céntimos del importe entregado no se pierden por coma flotante (0,29 € → 29)', async () => {
    const wc = await montarConCobroAbierto();
    wc.tendered = '0.29'; // 0.29 * 100 = 28.999… en IEEE-754 → sin Math.round serían 28 céntimos
    expect(wc.tenderedNum).toBe(29);
  });
});
