// hub#923 (saas#1460) — what the POS must do when the checkout answer never arrives.
//
// The incident: the hub confirmed the sale (200, row in the DB) and was OOM-killed before the
// client could read the next response. The cashier saw a raw WebKit string and concluded "it did
// not charge" — so she charged again. Double charge, duplicate fiscal document.
//
// The sale carries an idempotency key, so the doubt is ANSWERABLE: ask the server whether that key
// already produced a sale. This module is that decision, kept pure so it can be tested without a
// POS: given a probe over the key, say whether the checkout went through, is safe to retry, or is
// genuinely unknown — and never claim more than the evidence supports.
import { describe, expect, it, vi } from 'vitest';

import { recoverCheckout } from './checkout-recovery';

const KEY = 'checkout-abc12345';

describe('recoverCheckout — resolves the doubt when the answer is lost (hub#923)', () => {
  it('the sale DID go through: reports it, with the id, so the POS can show the receipt', async () => {
    const probe = vi.fn(async () => [{ id: 'sale-1' }]);
    expect(await recoverCheckout(probe, KEY)).toEqual({ outcome: 'charged', saleId: 'sale-1' });
    expect(probe).toHaveBeenCalledWith(KEY);
  });

  it('the sale did NOT go through: retrying is safe, and the key must be kept', async () => {
    const probe = vi.fn(async () => []);
    expect(await recoverCheckout(probe, KEY)).toEqual({ outcome: 'not_charged' });
  });

  it('the probe itself fails (server still down): the outcome is UNKNOWN, never "not charged"', async () => {
    // The dangerous branch. Treating an unreachable server as "no sale" is exactly the reasoning
    // that produced the double charge — with the server down we cannot know, and the UI must say so.
    const probe = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await recoverCheckout(probe, KEY)).toEqual({ outcome: 'unknown' });
  });

  it('retries the probe before giving up: the hub comes back in seconds after an OOM restart', async () => {
    const probe = vi
      .fn<(key: string) => Promise<{ id: string }[]>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([{ id: 'sale-2' }]);
    const sleep = vi.fn(async () => {});
    expect(await recoverCheckout(probe, KEY, { attempts: 2, sleep })).toEqual({
      outcome: 'charged',
      saleId: 'sale-2',
    });
    expect(probe).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('an empty answer is NOT retried: the server spoke, and it said "no sale"', async () => {
    const probe = vi.fn(async () => []);
    const sleep = vi.fn(async () => {});
    expect(await recoverCheckout(probe, KEY, { attempts: 3, sleep })).toEqual({ outcome: 'not_charged' });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('without a key there is nothing to ask: unknown, and the probe is never called', async () => {
    const probe = vi.fn(async () => [{ id: 'sale-x' }]);
    expect(await recoverCheckout(probe, '')).toEqual({ outcome: 'unknown' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('a row without an id still counts as charged: the sale exists, the receipt link does not', async () => {
    const probe = vi.fn(async () => [{} as { id: string }]);
    expect(await recoverCheckout(probe, KEY)).toEqual({ outcome: 'charged', saleId: '' });
  });
});
