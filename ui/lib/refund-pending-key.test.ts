// sales#456 — the idempotency key of a refund whose outcome is in doubt has to outlive the screen.
//
// sales#451 kept the key while the refund screen stayed open. Close it after «we can't tell» and
// open it again, and the screen minted a NEW key: a partial refund repeated from there was a
// second document, and the money went out twice. So the key of an attempt in flight is remembered
// per sale until the outcome is known, and the next screen on that sale starts from it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetPendingRefundKey,
  pendingRefundKey,
  rememberPendingRefundKey,
} from './refund-pending-key';

afterEach(() => {
  forgetPendingRefundKey('sale-1');
  forgetPendingRefundKey('sale-2');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the pending refund key (sales#456)', () => {
  it('is empty for a sale nobody left in doubt', () => {
    expect(pendingRefundKey('sale-1')).toBeUndefined();
  });

  it('gives back the key remembered for that sale', () => {
    rememberPendingRefundKey('sale-1', 'refund-sale-1-a');
    expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-a');
  });

  it('is per sale: another sale never inherits it', () => {
    rememberPendingRefundKey('sale-1', 'refund-sale-1-a');
    expect(pendingRefundKey('sale-2')).toBeUndefined();
  });

  it('forgetting it leaves nothing behind', () => {
    rememberPendingRefundKey('sale-1', 'refund-sale-1-a');
    forgetPendingRefundKey('sale-1');
    expect(pendingRefundKey('sale-1')).toBeUndefined();
  });

  it('survives a reload of the page: it is read back from the device storage', () => {
    rememberPendingRefundKey('sale-1', 'refund-sale-1-a');
    const stored = Object.keys(globalThis.localStorage)
      .map((k) => globalThis.localStorage.getItem(k));
    expect(stored).toContain('refund-sale-1-a');
  });

  it('a key written by an earlier page load is found', () => {
    rememberPendingRefundKey('sale-1', 'refund-sale-1-a');
    const storageKey = Object.keys(globalThis.localStorage)
      .find((k) => globalThis.localStorage.getItem(k) === 'refund-sale-1-a') as string;
    forgetPendingRefundKey('sale-1');
    // Only the device storage has it now, as after a reload.
    globalThis.localStorage.setItem(storageKey, 'refund-sale-1-b');
    expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-b');
  });

  it('a device storage that refuses (private mode, sandbox) still keeps it for this page', () => {
    // The storage object itself is swapped: spying on `Storage.prototype` does not reach the
    // environment's `localStorage`, and the test then passed with the storage working.
    const refusing = {
      getItem: vi.fn(() => { throw new Error('SecurityError'); }),
      setItem: vi.fn(() => { throw new Error('QuotaExceededError'); }),
      removeItem: vi.fn(() => { throw new Error('SecurityError'); }),
    };
    vi.stubGlobal('localStorage', refusing);
    expect(() => rememberPendingRefundKey('sale-1', 'refund-sale-1-a')).not.toThrow();
    expect(refusing.setItem).toHaveBeenCalled();
    expect(pendingRefundKey('sale-1')).toBe('refund-sale-1-a');
    expect(refusing.getItem).toHaveBeenCalled();
    expect(() => forgetPendingRefundKey('sale-1')).not.toThrow();
    expect(pendingRefundKey('sale-1')).toBeUndefined();
  });
});
