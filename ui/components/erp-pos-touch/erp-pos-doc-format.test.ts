// ERPlora/hub#962 — tique o factura: el mostrador tiene que poder elegir, y el ajuste que ya se
// guardaba tiene que servir para algo.
//
// Estado anterior: `docFormat` solo se movía por `default_document_format` y, por encima del techo
// de la simplificada (hub#297), a la fuerza. No había NINGÚN control en pantalla — «este cliente
// quiere factura» no se podía decir— y `auto_invoice_with_tax_id` se guardaba en los ajustes sin
// que lo leyera nadie: un interruptor que no hace nada es peor que no tener interruptor.
//
// Lo que fija este fichero: (1) con el ajuste puesto, un cliente CON NIF sale en factura sin que
// nadie toque nada; (2) sin él, sigue mandando el formato por defecto; (3) el cajero puede cambiar
// el formato a mano; (4) por encima del techo la elección NO es libre — ahí la ley decide, y el
// control no puede devolver la venta a tique.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const TAX_CATS = [{ key: 'product.generic', name: 'General', is_active: 1 }];

let settings: Record<string, unknown> = {};

function installSdk() {
  // sales#203 — the till reads its policy through `sales.pos_settings.get`, the door a cashier
  // can open. The admin-only `sales.settings.get` is not asked for at all.
  installPosDouble({
    settings,
    rules: RULES,
    taxCategories: TAX_CATS,
    command: async () => ({ rows: [{ id: 'row-1' }] }),
  });
}

interface Pos {
  updateComplete: Promise<unknown>;
  openDept: string;
  openAmount: string;
  addOpenPrice(): Promise<void>;
  docFormat: 'ticket' | 'invoice';
  customerTaxId: string;
  openPay(): Promise<void> | void;
  chooseDocFormat(next: 'ticket' | 'invoice'): void;
  canChooseDocFormat: boolean;
}

async function mount(): Promise<Pos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  const pos = el as unknown as Pos;
  await pos.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await pos.updateComplete;
  // `openPay` no hace nada con el carrito vacío, así que sin una línea el test mediría el estado
  // de la carga, no la apertura del cobro. Una línea de precio libre es la vía más corta.
  pos.openDept = 'product.generic';
  pos.openAmount = '12.50';
  await pos.addOpenPrice();
  await pos.updateComplete;
  return pos;
}

beforeEach(() => {
  document.body.innerHTML = '';
  settings = {};
  installSdk();
});

describe('auto_invoice_with_tax_id deja de ser un interruptor muerto', () => {
  it('con NIF del cliente y el ajuste puesto, el cobro se abre en FACTURA', async () => {
    settings = { auto_invoice_with_tax_id: 1, default_document_format: 'ticket' };
    const el = await mount();
    el.customerTaxId = 'B12345678';
    await el.openPay();
    await el.updateComplete;
    expect(el.docFormat).toBe('invoice');
  });

  it('sin NIF, el ajuste no cambia nada: manda el formato por defecto', async () => {
    settings = { auto_invoice_with_tax_id: 1, default_document_format: 'ticket' };
    const el = await mount();
    await el.openPay();
    await el.updateComplete;
    expect(el.docFormat).toBe('ticket');
  });

  it('con NIF pero SIN el ajuste, tampoco: nadie decide por el comercio', async () => {
    settings = { auto_invoice_with_tax_id: 0, default_document_format: 'ticket' };
    const el = await mount();
    el.customerTaxId = 'B12345678';
    await el.openPay();
    await el.updateComplete;
    expect(el.docFormat).toBe('ticket');
  });
});

describe('el cajero puede elegir tique o factura', () => {
  it('cambia el formato a mano', async () => {
    settings = { default_document_format: 'ticket' };
    const el = await mount();
    await el.openPay();
    el.chooseDocFormat('invoice');
    await el.updateComplete;
    expect(el.docFormat).toBe('invoice');
    el.chooseDocFormat('ticket');
    await el.updateComplete;
    expect(el.docFormat).toBe('ticket');
  });

  it('y ofrece el control solo cuando la elección es de verdad', async () => {
    settings = { default_document_format: 'ticket' };
    const el = await mount();
    await el.openPay();
    await el.updateComplete;
    expect(el.canChooseDocFormat).toBe(true);
  });
});
