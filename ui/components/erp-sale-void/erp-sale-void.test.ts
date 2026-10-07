// services#157 — the «void sale» confirmation is a window, not an ion-alert.
//
// An ion-alert takes a plain message and nothing else, so it could not host what OTHER modules want
// read before a sale is undone: voiding the sale of a voucher voids the voucher, sessions already
// used included (Services fills `sales.reversal.notice` to say so). Square, Lightspeed and MyTime
// say it on the confirmation itself. The window keeps what the alert had — the title with the
// number, the explanation, the reason (required), Cancel and Void — and adds the hole above the
// button. It does not run the void: it hands the reason to the list, which owns the command.
import { afterEach, describe, expect, it } from 'vitest';
import { installErploraDouble } from '../../test/erplora-double';
import './erp-sale-void';

class FakeReversalNotice extends HTMLElement {
  saleId?: string;
  action?: string;
  seenOnConnect?: Record<string, unknown>;
  connectedCallback(): void { this.seenOnConnect = { saleId: this.saleId, action: this.action }; }
}
if (!customElements.get('erp-fake-void-notice')) customElements.define('erp-fake-void-notice', FakeReversalNotice);

type VoidWindow = HTMLElement & {
  updateComplete: Promise<unknown>;
  saleId: string; saleNumber: string; busy: boolean; errorText: string; reason: string;
};

async function mount(opts: { fillers?: string[]; slotFail?: boolean; props?: Partial<VoidWindow> } = {}): Promise<VoidWindow> {
  installErploraDouble({
    loadSlot: (slot: string) => {
      if (opts.slotFail) throw new Error('boom');
      return slot === 'sales.reversal.notice' ? (opts.fillers ?? []).map((component) => ({ component })) : [];
    },
    locale: 'es',
  });
  const el = document.createElement('erp-sale-void') as VoidWindow;
  el.saleId = 'sale-1';
  el.saleNumber = '20261007-0003';
  Object.assign(el, opts.props ?? {});
  document.body.appendChild(el);
  for (let i = 0; i < 3; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
  await el.updateComplete;
  return el;
}

const q = (el: VoidWindow, id: string): HTMLElement | null =>
  el.shadowRoot!.querySelector(`[data-testid="${id}"]`);

function click(el: VoidWindow, id: string): void {
  q(el, id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

afterEach(() => { document.body.innerHTML = ''; });

describe('void window — what the alert had', () => {
  it('title with the number, the explanation, a boxed reason, Cancel and Void', async () => {
    const el = await mount();
    expect(q(el, 'void-title')?.textContent).toContain('ui.voidTitle');
    expect(q(el, 'void-explain')?.textContent).toContain('ui.voidExplain');
    const reason = q(el, 'void-reason')!;
    expect(reason.tagName).toBe('ION-TEXTAREA');
    // ios mode paints no box without both (hub#760, sales#414).
    expect(reason.getAttribute('fill')).toBe('outline');
    expect(reason.getAttribute('mode')).toBe('md');
    expect(reason.getAttribute('maxlength')).toBe('500');
    expect(q(el, 'void-cancel')).toBeTruthy();
    expect(q(el, 'void-confirm')).toBeTruthy();
  });

  it('Void without a reason does not confirm and says why, on screen', async () => {
    const el = await mount();
    const confirms: unknown[] = [];
    el.addEventListener('void-confirm', (e) => confirms.push((e as CustomEvent).detail));
    el.reason = '   ';
    await el.updateComplete;
    click(el, 'void-confirm');
    await el.updateComplete;
    expect(confirms).toEqual([]);
    expect(q(el, 'void-error')?.textContent).toContain('ui.voidReasonRequired');
  });

  it('Void with a reason hands the trimmed reason to the host', async () => {
    const el = await mount();
    const confirms: unknown[] = [];
    el.addEventListener('void-confirm', (e) => confirms.push((e as CustomEvent).detail));
    el.reason = '  customer changed their mind ';
    await el.updateComplete;
    click(el, 'void-confirm');
    expect(confirms).toEqual([{ reason: 'customer changed their mind' }]);
  });

  it('Cancel tells the host and confirms nothing', async () => {
    const el = await mount();
    const events: string[] = [];
    el.addEventListener('void-cancel', () => events.push('cancel'));
    el.addEventListener('void-confirm', () => events.push('confirm'));
    click(el, 'void-cancel');
    expect(events).toEqual(['cancel']);
  });

  it('while voiding, the button is really disabled: a second tap would not void twice', async () => {
    const el = await mount({ props: { busy: true } });
    expect(q(el, 'void-confirm')!.hasAttribute('disabled')).toBe(true);
    const confirms: unknown[] = [];
    el.addEventListener('void-confirm', (e) => confirms.push(e));
    el.reason = 'x';
    await el.updateComplete;
    click(el, 'void-confirm');
    expect(confirms).toEqual([]);
  });

  it('a refusal from the server is read in the window', async () => {
    const el = await mount({ props: { errorText: 'Esta venta ya está anulada' } });
    expect(q(el, 'void-error')?.textContent).toContain('Esta venta ya está anulada');
  });
});

describe('void window — what else is undone is read before confirming (services#157)', () => {
  it('mounts the filler with the sale and the door already set when it connects', async () => {
    const el = await mount({ fillers: ['erp-fake-void-notice'] });
    const filler = q(el, 'void-reversal-notice')?.querySelector('erp-fake-void-notice') as FakeReversalNotice | null;
    expect(filler, 'the filler is in the hole').toBeTruthy();
    expect(filler!.seenOnConnect).toEqual({ saleId: 'sale-1', action: 'void' });
  });

  it('the hole sits above the Void button', async () => {
    const el = await mount({ fillers: ['erp-fake-void-notice'] });
    const confirm = q(el, 'void-confirm')!;
    expect(q(el, 'void-reversal-notice')!.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('typing the reason keeps a single instance', async () => {
    const el = await mount({ fillers: ['erp-fake-void-notice'] });
    el.reason = 'a';
    await el.updateComplete;
    el.reason = 'ab';
    await el.updateComplete;
    expect(el.shadowRoot!.querySelectorAll('erp-fake-void-notice').length).toBe(1);
  });

  it('with nobody filling it, or a failing registry, there is no hole and Void still works', async () => {
    for (const opts of [{}, { fillers: ['erp-fake-void-notice'], slotFail: true }]) {
      const el = await mount(opts);
      expect(q(el, 'void-reversal-notice')).toBeNull();
      expect(q(el, 'void-confirm')).toBeTruthy();
      el.remove();
    }
  });
});
