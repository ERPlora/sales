// sales#406 — the «void sale» confirmation must leave the page once it is closed.
//
// The dialog is a GLOBAL Ionic overlay appended to document.body. Ionic's dismiss() emits
// ionAlertDidDismiss and only THEN moves the teleported overlay back to its original parent
// (framework-delegate removeViewFromDom). A synchronous remove() in the listener is undone by that
// move, so every void left a hidden <ion-alert> behind for the rest of the day. Same fix and
// same test shape as appointments#207 (erp-appointments-series).
import { beforeEach, describe, expect, it } from 'vitest';

import esCatalog from '../../../locales/es.json';
import { installErploraDouble } from '../../test/erplora-double';
import './erp-sales-list';

const ROW = { id: 'sale-1', sale_number: 'T-42', status: 'completed', total: 360 };

type Button = { text: string; role?: string; handler?: (data?: Record<string, unknown>) => unknown };
type AlertEl = HTMLElement & { isOpen?: boolean; header?: string; buttons: Button[] };

const commands: { name: string; params?: Record<string, unknown> }[] = [];

function t(_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string {
  const raw = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(params?.[k] ?? `{${k}}`));
}

beforeEach(() => {
  document.body.innerHTML = '';
  commands.length = 0;
  const double = installErploraDouble({
    queries: {
      'sales.list': [ROW], 'sales.stats': [], 'sales.payment_methods': [],
      'sales.get': [], 'sales.lines': [],
      'sales.pos_settings.get': [], 'sales.business.get': [],
      'sales.business_day': [{ today: '2031-01-15' }],
    },
    absent: ['invoice.by_source', 'invoice.lines', 'verifactu.records.by_invoice'],
    locale: 'es',
    t,
  });
  const sdk = double.sdk as Record<string, unknown>;
  sdk.hasPermission = (p: string) => p === 'sales.void_sale';
  sdk.command = async (name: string, params?: Record<string, unknown>) => { commands.push({ name, params }); return {}; };
  sdk.notify = () => undefined;
});

async function openVoidDialog(): Promise<AlertEl> {
  const el = document.createElement('erp-sales-list') as HTMLElement & { updateComplete: Promise<unknown> };
  document.body.appendChild(el);
  await el.updateComplete;
  el.shadowRoot!.querySelector('ok-data-table')!
    .dispatchEvent(new CustomEvent('rowAction', { detail: { actionId: 'void', row: ROW } }));
  for (let i = 0; i < 2; i++) await new Promise((r) => setTimeout(r, 0));
  const alert = document.body.querySelector<AlertEl>('ion-alert');
  expect(alert, 'the void confirmation is a global overlay in document.body').toBeTruthy();
  return alert!;
}

/** Dismisses the dialog the way Ionic does: the event first, then the overlay is moved back. */
async function dismissLikeIonic(alert: AlertEl, role: string): Promise<void> {
  alert.addEventListener('ionAlertDidDismiss', () => {
    void Promise.resolve().then(() => document.body.appendChild(alert));
  });
  alert.dispatchEvent(new CustomEvent('ionAlertDidDismiss', { detail: { role } }));
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('sales list — the void dialog does not linger in the page once closed (sales#406)', () => {
  it('stays in the page while it is open, with Cancel and Void buttons', async () => {
    const alert = await openVoidDialog();
    expect(alert.isOpen).toBe(true);
    expect(alert.header).toBe('Anular la venta T-42');
    expect(alert.buttons.map((b) => [b.role, b.text])).toEqual([
      ['cancel', esCatalog.ui.cancel],
      ['destructive', esCatalog.ui.actionVoid],
    ]);
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    expect(document.body.querySelector('ion-alert'), 'an open dialog is not removed').toBe(alert);
  });

  it('«Cancel» removes it from the page, and nothing is voided', async () => {
    const alert = await openVoidDialog();
    await dismissLikeIonic(alert, 'cancel');
    expect(document.body.querySelector('ion-alert')).toBeNull();
    expect(commands.filter((c) => c.name === 'sales.void')).toEqual([]);
  });

  it('confirming the void removes it from the page too', async () => {
    const alert = await openVoidDialog();
    const confirm = alert.buttons.find((b) => b.role === 'destructive')!;
    expect(confirm.handler!({ reason: 'customer changed their mind' })).toBe(true);
    await dismissLikeIonic(alert, 'destructive');
    expect(document.body.querySelector('ion-alert')).toBeNull();
    expect(commands.find((c) => c.name === 'sales.void')?.params)
      .toEqual({ sale_id: 'sale-1', reason: 'customer changed their mind' });
  });

  it('closing it from the backdrop removes it from the page', async () => {
    const alert = await openVoidDialog();
    await dismissLikeIonic(alert, 'backdrop');
    expect(document.body.querySelector('ion-alert')).toBeNull();
  });

  it('voiding several sales in a row never piles dialogs up', async () => {
    for (let i = 0; i < 3; i++) {
      const alert = await openVoidDialog();
      await dismissLikeIonic(alert, 'cancel');
      document.querySelectorAll('erp-sales-list').forEach((n) => n.remove());
    }
    expect(document.querySelectorAll('ion-alert').length).toBe(0);
  });
});
