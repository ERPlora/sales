// services#157 — the hole `sales.reversal.notice`: what other modules want read BEFORE a sale is
// voided or refunded (Services: «the voucher sold here is voided with it»). Sales never learns what
// is behind it; it only mounts the fillers with the sale and the door, and never waits for them.
import { describe, expect, it } from 'vitest';

import { REVERSAL_NOTICE_SLOT, loadReversalFillers, mountReversalNotice } from './reversal-notice';

describe('loadReversalFillers', () => {
  it('asks the shell for the fillers of sales.reversal.notice and answers their tags', async () => {
    const asked: string[] = [];
    const tags = await loadReversalFillers({
      loadSlot: async (slot: string) => { asked.push(slot); return [{ component: 'erp-services-sale-reversal' }]; },
    });
    expect(asked).toEqual([REVERSAL_NOTICE_SLOT]);
    expect(REVERSAL_NOTICE_SLOT).toBe('sales.reversal.notice');
    expect(tags).toEqual(['erp-services-sale-reversal']);
  });

  it('an older shell without loadSlot, or a failing one, leaves no hole instead of breaking the window', async () => {
    expect(await loadReversalFillers({})).toEqual([]);
    expect(await loadReversalFillers({ loadSlot: async () => { throw new Error('boom'); } })).toEqual([]);
    expect(await loadReversalFillers({ loadSlot: async () => undefined as unknown as [] })).toEqual([]);
  });
});

describe('mountReversalNotice', () => {
  /** Records the properties the filler had at the moment it was CONNECTED. */
  class Probe extends HTMLElement {
    seen: { saleId?: string; action?: string } | null = null;
    saleId?: string;
    action?: string;
    connectedCallback(): void { this.seen = { saleId: this.saleId, action: this.action }; }
  }
  if (!customElements.get('probe-reversal')) customElements.define('probe-reversal', Probe);

  it('mounts each filler with the sale and the door already set when it connects', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const mounted = new Map<string, HTMLElement>();
    mountReversalNotice(host, ['probe-reversal'], 'sale-7', 'refund', mounted);
    const el = host.querySelector('probe-reversal') as Probe;
    expect(el, 'the filler is in the hole').toBeTruthy();
    expect(el.seen, 'set BEFORE the insert: the filler reads on connect').toEqual({ saleId: 'sale-7', action: 'refund' });
  });

  it('is idempotent: re-rendering keeps one instance and follows a new sale', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const mounted = new Map<string, HTMLElement>();
    mountReversalNotice(host, ['probe-reversal'], 'sale-7', 'void', mounted);
    const first = host.querySelector('probe-reversal');
    mountReversalNotice(host, ['probe-reversal'], 'sale-8', 'void', mounted);
    expect(host.querySelectorAll('probe-reversal').length).toBe(1);
    expect(host.querySelector('probe-reversal')).toBe(first);
    expect((first as Probe).saleId).toBe('sale-8');
  });

  it('a filler that is gone is taken out of the hole', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const mounted = new Map<string, HTMLElement>();
    mountReversalNotice(host, ['probe-reversal'], 'sale-7', 'void', mounted);
    mountReversalNotice(host, [], 'sale-7', 'void', mounted);
    expect(host.querySelector('probe-reversal')).toBeNull();
    expect(mounted.size).toBe(0);
  });

  it('without a host (the branch that paints no hole) it does nothing', () => {
    const mounted = new Map<string, HTMLElement>();
    expect(() => mountReversalNotice(null, ['probe-reversal'], 'sale-7', 'void', mounted)).not.toThrow();
    expect(mounted.size).toBe(0);
  });
});
