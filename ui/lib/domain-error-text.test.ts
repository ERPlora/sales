// sales#207 (ADR-0398 §2) — the declared catalogue is what a screen says when it has nothing
// better to say.
//
// A refusal that reaches a screen with no hand-written wording used to be painted as `e.message`:
// the server's DETAIL, in whatever language the handler wrote it, straight onto a cashier's
// screen ("`pay-cash` is not a tender of sale sale-1"). ADR-0055 is the opposite contract — the
// UI translates by CODE — and ADR-0398 is what finally gives every code a sentence of its own,
// in `en` and in `es`.
//
// 🔴 The SDK's `t()` cannot reach these: it splits the key on `.` and walks the object, so
// `t('errors.sales.empty_sale')` looks for `errors → sales → empty_sale` and finds nothing,
// while the catalogue holds ONE key literally called `sales.empty_sale`. Hence a lookup of its
// own instead of one more `t()` call.
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };
import { domainErrorText } from './domain-error-text.js';

const CATALOG: Record<string, unknown> = { en, es };
const refusal = (code: string, message = 'server detail nobody should read') =>
  Object.assign(new Error(message), { code });

describe('domainErrorText', () => {
  it('gives the declared sentence of the code, in the active language', () => {
    const text = domainErrorText(CATALOG, 'es', refusal('sales.empty_sale'));
    expect(text).toBe((es as { errors: Record<string, string> }).errors['sales.empty_sale']);
    expect(domainErrorText(CATALOG, 'en', refusal('sales.empty_sale'))).toBe(
      (en as { errors: Record<string, string> }).errors['sales.empty_sale'],
    );
  });

  it('falls back to the SOURCE language when the active one has no catalogue', () => {
    expect(domainErrorText(CATALOG, 'fr', refusal('sales.sale_not_found'))).toBe(
      (en as { errors: Record<string, string> }).errors['sales.sale_not_found'],
    );
  });

  it('says NOTHING when the code is not declared — the caller decides the fallback', () => {
    expect(domainErrorText(CATALOG, 'es', refusal('sales.not_a_declared_code'))).toBe('');
    expect(domainErrorText(CATALOG, 'es', refusal('permission_denied'))).toBe('');
    expect(domainErrorText(CATALOG, 'es', new Error('boom'))).toBe('');
    expect(domainErrorText(CATALOG, 'es', undefined)).toBe('');
  });

  it('NEVER hands back the server message', () => {
    const text = domainErrorText(CATALOG, 'es', refusal('sales.sale_not_found', 'sale sale-9 is not in this hub'));
    expect(text).not.toContain('sale-9');
    expect(domainErrorText(CATALOG, 'es', refusal('sales.nope', 'raw detail'))).not.toContain('raw detail');
  });
});
