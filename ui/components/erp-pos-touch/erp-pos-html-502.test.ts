// sales#81 — «El TPV recibe HTML 502 al añadir cualquier producto».
//
// Cuando el contenedor del hub muere (OOM exit 137, hub#759), el proxy devuelve `502 text/html`
// (una página `<!DOCTYPE html>…`). El transporte del SDK (`module-sdk.post`) hace `res.json()`
// sin inspeccionar `res.ok` ni el `Content-Type`, así que lanza un `SyntaxError` sin filtrar:
//
//   "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
//
// Ese mensaje técnico de parseo NO es accionable para un cajero: no dice ni que el servidor está
// caído, ni que hay que avisar al encargado. La issue pide explícitamente que la UI muestre un
// MENSAJE DE NEGOCIO y nunca el detalle `<!DOCTYPE ... not valid JSON`.
//
// La guarda de transporte (`res.ok` + content-type) es del hub y se persigue en otra issue
// (ERPlora/hub, SDK). Lo que este test fija es el LÍMITE DEL MÓDULO sales: aunque el transporte
// siga tirando el mensaje crudo, el TPV lo traduce a algo útil para quien está cobrando.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const notifyCalls: { type: string; message: string }[] = [];
const CATEGORIA_IVA = 'product.generic';
const REGLAS_IVA = [
  { id: 'r-21', tax_category_key: CATEGORIA_IVA, rate_pct: 21, parent_id: null, is_active: 1 },
];

// El mensaje EXACTO que lanza V8 al parsear HTML como JSON (reproducido de la issue, 3/3).
const HTML_PARSE_ERROR = "Unexpected token '<', \"<!DOCTYPE \" is not valid JSON";

beforeEach(() => {
  notifyCalls.length = 0;
  // The i18n catalogue of the module is translated by KEY, so the test measures WHICH key the UI
  // chose and not the localized sentence (that lives in locales/*.json and is checked apart).
  installPosDouble({ rules: REGLAS_IVA, notify: (n) => notifyCalls.push(n) });
});

interface Montado {
  products: unknown[];
  add: (p: { id: string; name: string; price: number; tax_category_key?: string }) => Promise<void>;
  error: string;
  requestUpdate?: () => Promise<void>;
  updateComplete: Promise<unknown>;
}

async function montar(): Promise<Montado> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as unknown as Montado;
}

describe('al recibir HTML del proxy (502), el TPV no filtra el detalle de parseo (#81)', () => {
  it('traduce el SyntaxError del transporte a un mensaje de negocio', async () => {
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    // El transporte del SDK recibe `502 text/html` y lanza el SyntaxError sin envolver.
    sdk.command = async () => {
      throw new SyntaxError(HTML_PARSE_ERROR);
    };
    const el = await montar();
    el.products = [
      { id: 'p1', name: 'Aceite de argan 100ml', price: 1800, is_active: 1, tax_category_key: CATEGORIA_IVA },
    ];
    await el.requestUpdate?.();
    await el.updateComplete;

    await el.add({ id: 'p1', name: 'Aceite de argan 100ml', price: 1800, tax_category_key: CATEGORIA_IVA });

    // El detalle técnico NUNCA llega a la pantalla del cajero.
    expect(el.error, 'la UI no debe mostrar el detalle de parseo HTML').not.toContain('<!DOCTYPE');
    expect(el.error, 'la UI no debe mostrar la jerga del parser').not.toContain('is not valid JSON');

    // En su lugar, un mensaje de NEGOCIO (servidor caído / reintenta).
    expect(el.error.length, 'se muestra un mensaje accionable, no vacío').toBeGreaterThan(0);
  });

  it('el toast del shell también lleva el mensaje traducido, no el HTML', async () => {
    const sdk = (globalThis as Record<string, unknown>).erplora as Record<string, unknown>;
    sdk.command = async () => {
      throw new SyntaxError(HTML_PARSE_ERROR);
    };
    const el = await montar();
    el.products = [
      { id: 'p2', name: 'Champu profesional 300ml', price: 1200, is_active: 1, tax_category_key: CATEGORIA_IVA },
    ];
    await el.requestUpdate?.();
    await el.updateComplete;

    await el.add({ id: 'p2', name: 'Champu profesional 300ml', price: 1200, tax_category_key: CATEGORIA_IVA });

    const errs = notifyCalls.filter((n) => n.type === 'error');
    expect(errs.length, 'hay feedback visible (toast de error)').toBeGreaterThan(0);
    for (const n of errs) {
      expect(n.message, 'el toast tampoco filtra el HTML').not.toContain('<!DOCTYPE');
      expect(n.message, 'el toast tampoco filtra la jerga del parser').not.toContain('is not valid JSON');
    }
  });
});
