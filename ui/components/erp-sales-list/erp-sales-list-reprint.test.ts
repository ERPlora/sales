// sales#347 — reprint a sale from the SALES LIST, one tap on the row, without opening its document.
//
// Square, Toast and Shopify POS put a printer on every row of their sales history. Here the only
// way was: open the document, press Print. The row action reuses the viewer's own paper (the hidden
// `<erp-sales-document>` the hub shell already uses for the automatic print, hub#1867) and the same
// send as the document's Print button: a copy («duplicado», hub#1931), a fresh job key per attempt
// (sales#92) and the same error notice when no printer took it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import esCatalog from '../../../locales/es.json';
import enCatalog from '../../../locales/en.json';
import { installErploraDouble, type ErploraDouble } from '../../test/erplora-double';

interface PrintReq { role?: string; documentType?: string; jobId?: string; data?: Record<string, unknown>; html?: string }
interface Action { id: string; label: unknown; icon?: string; disabled?: (r: Record<string, unknown>) => boolean; loading?: (r: Record<string, unknown>) => boolean }
type ListEl = HTMLElement & { documentActions: Action[]; docSaleId?: string; updateComplete: Promise<unknown> };

const QR = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T-42&fecha=23-09-2026&importe=3.60';
const ROW = { id: 'venta-1', sale_number: 'T-42', status: 'completed', total: 360 };

function translator(catalog: Record<string, unknown>) {
  return (_c: Record<string, unknown>, key: string) =>
    key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog) as string ?? key;
}

let double: ErploraDouble;
let sent: PrintReq[];
let answer: { via: string; error?: string };
let pending: Array<() => void>;
let holdPrints: boolean;

function install(locale: 'es' | 'en' = 'es', overrides: Record<string, unknown> = {}) {
  double = installErploraDouble({
    queries: {
      'sales.list': [ROW], 'sales.stats': [], 'sales.payment_methods': [],
      'sales.get': [{ id: 'venta-1', sale_number: 'T-42', subtotal: 327, tax_amount: 33, total: 360, payment_method_name: 'Efectivo' }],
      'sales.lines': [{ product_name: 'Cafe solo', quantity: 2, unit_price: 180, line_total: 360 }],
      'sales.pos_settings.get': [], 'sales.business.get': [],
      'invoice.by_source': [{ id: 'inv-1', number: 'TICKET-2026-000042', invoice_type: 'F1' }],
      'verifactu.records.by_invoice': [{ qr_url: QR, aeat_csv: '' }],
      ...overrides,
    } as never,
    absent: ['invoice.lines'],
    locale,
    t: translator(locale === 'es' ? esCatalog : enCatalog),
  });
  const sdk = double.sdk as Record<string, unknown>;
  sdk.print = async (req: PrintReq) => {
    sent.push(req);
    if (holdPrints) await new Promise<void>((r) => pending.push(r));
    return answer;
  };
}

async function mountList(): Promise<ListEl> {
  await import('./erp-sales-list');
  const el = document.createElement('erp-sales-list') as ListEl;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function tapReprint(el: ListEl, row: Record<string, unknown> = ROW) {
  const table = el.shadowRoot!.querySelector('ok-data-table')!;
  table.dispatchEvent(new CustomEvent('rowAction', { detail: { actionId: 'reprint', row } }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  sent = [];
  pending = [];
  holdPrints = false;
  answer = { via: 'queue' };
  install();
});

afterEach(() => { vi.useRealTimers(); });

describe('sales list — reprint from the row (sales#347)', () => {
  it('every row offers «Reimprimir» with a printer icon, to anyone who sees the list', async () => {
    const el = await mountList();
    const reprint = el.documentActions.find((a) => a.id === 'reprint');
    expect(reprint, 'the row carries a reprint action').toBeTruthy();
    expect(reprint!.icon).toBe('print-outline');
    expect(String(reprint!.label)).toBe('Reimprimir');
  });

  it('the name comes from the catalog: «Reprint» on an English hub', async () => {
    install('en');
    const el = await mountList();
    expect(String(el.documentActions.find((a) => a.id === 'reprint')!.label)).toBe('Reprint');
  });

  it('sends the sale\'s ticket to the printer without opening its document', async () => {
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const req = sent[0];
    expect(req.role).toBe('receipt');
    expect(req.documentType).toBe('receipt');
    expect(req.data?.receipt_id, 'the paper of THIS sale').toBe('TICKET-2026-000042');
    expect((req.data?.items as unknown[])?.length, 'with its lines').toBe(1);
    expect(req.html, 'and the HTML for the browser fallback').toBeTruthy();
    expect(el.docSaleId, 'the document viewer does not open').toBeUndefined();
  });

  it('it is a copy: both papers say «duplicado», and the job key is fresh (never the checkout\'s)', async () => {
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].data?.duplicate).toBe(true);
    expect(sent[0].html).toContain(esCatalog.ui.docDuplicate);
    expect(sent[0].jobId).toBeTruthy();
    expect(sent[0].jobId).not.toBe('sale-venta-1');
  });

  it('waits for the fiscal record: the reprint carries the VeriFactu QR', async () => {
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].data?.qr_data).toBe(QR);
  });

  it('leaves nothing behind: the hidden viewer is removed once the paper is sent', async () => {
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await vi.waitFor(() => expect(document.querySelectorAll('erp-sales-document')).toHaveLength(0));
  });

  it('says so when no printer took it, with the same notice as the document\'s Print button', async () => {
    answer = { via: 'browser', error: 'no printer with role receipt' };
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(double.notices).toHaveLength(1));
    expect(double.notices[0].type).toBe('error');
    expect(double.notices[0].message).toBe(`${esCatalog.ui.printFailed}: no printer with role receipt`);
  });

  it('says so when the print door itself fails, instead of losing the error', async () => {
    const el = await mountList();
    (double.sdk as Record<string, unknown>).print = async () => { throw new Error('runtime down'); };
    tapReprint(el);
    await vi.waitFor(() => expect(double.notices).toHaveLength(1));
    expect(double.notices[0]).toEqual({ type: 'error', message: `${esCatalog.ui.printFailed}: runtime down` });
  });

  it('says so when the sale cannot be loaded, and prints nothing', async () => {
    install('es', { 'sales.get': () => { throw new Error('boom'); } });
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(double.notices).toHaveLength(1));
    expect(double.notices[0].type).toBe('error');
    expect(sent).toHaveLength(0);
  });

  // ok-data-table's own busy state (spinner, inert button) — the loading state of the row action.
  it('while it prints, that row\'s action shows it is busy: two taps never make two copies', async () => {
    holdPrints = true;
    const el = await mountList();
    tapReprint(el);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const reprint = () => el.documentActions.find((a) => a.id === 'reprint')!;
    expect(reprint().loading?.(ROW), 'busy row: spinner and inert').toBe(true);
    expect(reprint().loading?.({ ...ROW, id: 'venta-2' }) ?? false, 'the other rows stay free').toBe(false);
    tapReprint(el);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent, 'a second tap while busy does nothing').toHaveLength(1);
    pending.forEach((r) => r());
    await vi.waitFor(() => expect(reprint().loading?.(ROW) ?? false).toBe(false));
  });
});
