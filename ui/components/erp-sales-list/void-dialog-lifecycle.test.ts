// The «void sale» confirmation, opened from the history (sales#26, sales#406, services#157).
//
// It was a GLOBAL ion-alert appended to document.body, and sales#406 was that every void left a
// hidden <ion-alert> behind (Ionic moves the overlay back after ionAlertDidDismiss). services#157
// turned it into a window (`erp-sale-void` in an inline ion-modal, like the refund) because an
// alert cannot host what other modules want read before the sale is undone. What sales#406 asked
// still holds and is checked here: nothing is left in document.body, closing voids nothing, and
// several voids in a row never pile anything up.
import { beforeEach, describe, expect, it } from 'vitest';

import esCatalog from '../../../locales/es.json';
import { installErploraDouble } from '../../test/erplora-double';
import './erp-sales-list';

const ROW = { id: 'sale-1', sale_number: 'T-42', status: 'completed', total: 360 };

type ModalEl = HTMLElement & { isOpen?: boolean };
type VoidEl = HTMLElement & { saleId?: string; saleNumber?: string; busy?: boolean; errorText?: string };
type ListEl = HTMLElement & { updateComplete: Promise<unknown> };

const commands: { name: string; params?: Record<string, unknown> }[] = [];
const notes: { type: string; message: string }[] = [];
let commandAnswer: () => Promise<unknown> = async () => ({});

function t(_catalog: Record<string, unknown>, key: string, params?: Record<string, unknown>): string {
  const raw = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], esCatalog);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(params?.[k] ?? `{${k}}`));
}

beforeEach(() => {
  document.body.innerHTML = '';
  commands.length = 0;
  notes.length = 0;
  commandAnswer = async () => ({});
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
  sdk.command = async (name: string, params?: Record<string, unknown>) => { commands.push({ name, params }); return commandAnswer(); };
  sdk.notify = (n: { type: string; message: string }) => { notes.push(n); };
});

async function settle(el: ListEl): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
}

async function openVoidWindow(): Promise<{ list: ListEl; modal: ModalEl; win: VoidEl }> {
  const list = document.createElement('erp-sales-list') as ListEl;
  document.body.appendChild(list);
  await list.updateComplete;
  list.shadowRoot!.querySelector('ok-data-table')!
    .dispatchEvent(new CustomEvent('rowAction', { detail: { actionId: 'void', row: ROW } }));
  await settle(list);
  const modal = list.shadowRoot!.querySelector<ModalEl>('ion-modal.void-modal');
  expect(modal, 'the void confirmation is a window of the list').toBeTruthy();
  const win = modal!.querySelector<VoidEl>('erp-sale-void');
  expect(win, 'with the void form inside').toBeTruthy();
  return { list, modal: modal!, win: win! };
}

describe('sales list — the void window (sales#26, sales#406, services#157)', () => {
  it('opens on the sale it was asked for, and leaves nothing in document.body', async () => {
    const { modal, win } = await openVoidWindow();
    expect(modal.isOpen).toBe(true);
    expect(win.saleId).toBe('sale-1');
    expect(win.saleNumber).toBe('T-42');
    expect(document.body.querySelector('ion-alert'), 'no global alert any more').toBeNull();
  });

  it('«Cancel» closes it and voids nothing', async () => {
    const { list, modal, win } = await openVoidWindow();
    win.dispatchEvent(new CustomEvent('void-cancel', { bubbles: true, composed: true }));
    await settle(list);
    expect(modal.isOpen).toBe(false);
    expect(commands.filter((c) => c.name === 'sales.void')).toEqual([]);
  });

  it('closing it from the backdrop voids nothing', async () => {
    const { list, modal } = await openVoidWindow();
    modal.dispatchEvent(new CustomEvent('ionModalDidDismiss', { detail: { role: 'backdrop' } }));
    await settle(list);
    expect(modal.isOpen).toBe(false);
    expect(commands.filter((c) => c.name === 'sales.void')).toEqual([]);
  });

  it('confirming runs sales.void with the reason, says so and closes', async () => {
    const { list, modal, win } = await openVoidWindow();
    win.dispatchEvent(new CustomEvent('void-confirm', { detail: { reason: 'customer changed their mind' }, bubbles: true, composed: true }));
    await settle(list);
    expect(commands.find((c) => c.name === 'sales.void')?.params)
      .toEqual({ sale_id: 'sale-1', reason: 'customer changed their mind' });
    expect(notes).toContainEqual({ type: 'success', message: esCatalog.ui.voidDone });
    expect(modal.isOpen).toBe(false);
  });

  it('while the void runs the window is busy, so a second tap cannot void twice', async () => {
    let release!: () => void;
    commandAnswer = () => new Promise((r) => { release = () => r({}); });
    const { list, win } = await openVoidWindow();
    win.dispatchEvent(new CustomEvent('void-confirm', { detail: { reason: 'x' }, bubbles: true, composed: true }));
    await settle(list);
    expect(win.busy).toBe(true);
    release();
    await settle(list);
  });

  it('a refusal stays in the window, in the user words, and the window stays open', async () => {
    commandAnswer = async () => { throw Object.assign(new Error('already voided'), { code: 'sales.already_voided' }); };
    const { list, modal, win } = await openVoidWindow();
    win.dispatchEvent(new CustomEvent('void-confirm', { detail: { reason: 'x' }, bubbles: true, composed: true }));
    await settle(list);
    expect(modal.isOpen).toBe(true);
    expect(win.errorText).toBe(esCatalog.ui.voidAlreadyVoided);
    expect(win.busy).toBe(false);
    expect(notes.filter((n) => n.type === 'success')).toEqual([]);
  });

  it('a refusal does not follow into the next void: reopening starts clean', async () => {
    commandAnswer = async () => { throw Object.assign(new Error('already voided'), { code: 'sales.already_voided' }); };
    const { list, win } = await openVoidWindow();
    win.dispatchEvent(new CustomEvent('void-confirm', { detail: { reason: 'x' }, bubbles: true, composed: true }));
    await settle(list);
    expect(win.errorText).toBe(esCatalog.ui.voidAlreadyVoided);
    win.dispatchEvent(new CustomEvent('void-cancel', { bubbles: true, composed: true }));
    await settle(list);
    list.shadowRoot!.querySelector('ok-data-table')!
      .dispatchEvent(new CustomEvent('rowAction', { detail: { actionId: 'void', row: ROW } }));
    await settle(list);
    const again = list.shadowRoot!.querySelector<VoidEl>('ion-modal.void-modal erp-sale-void');
    expect(again, 'the window opens again').toBeTruthy();
    expect(again!.errorText ?? '').toBe('');
    expect(again!.busy).toBe(false);
  });

  it('voiding several sales in a row never piles anything up', async () => {
    for (let i = 0; i < 3; i++) {
      const { list, win } = await openVoidWindow();
      win.dispatchEvent(new CustomEvent('void-cancel', { bubbles: true, composed: true }));
      await settle(list);
      list.remove();
    }
    expect(document.querySelectorAll('ion-alert').length).toBe(0);
    expect(document.querySelectorAll('erp-sale-void').length).toBe(0);
  });
});
