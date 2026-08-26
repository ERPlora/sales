// sales#201 — the OTHER two consumers that read the code out of the sentence.
//
// `checkout-key.ts` was fixed in sales#185; `voidErrorKey` and `refundErrorKey` were not. Both
// still take the MESSAGE and look the code up inside it with `includes`, which only ever worked
// because the handler formatted its refusal as `"<code>: <detail>"` and the runtime carried that
// whole string as the message of a `RuntimeError::Wasm`.
//
// Now that a refusal travels through `Output.error`, the runtime answers `{code, message}` and the
// message is the DETAIL ALONE — no code in it. So every one of these mappings would stop matching
// IN SILENCE and both screens would collapse to their generic "could not void" / "could not
// refund", which is the very failure this issue is about, moved one screen over.
//
// The contract is the CODE field of the envelope, exactly as `checkoutErrorKey` already reads it.
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };
import { voidErrorKey } from '../components/erp-sales-list/erp-sales-list.js';
import { refundErrorKey } from '../components/erp-sale-refund/erp-sale-refund.js';

describe('voidErrorKey', () => {
  it('branches on the CODE the envelope carries', () => {
    expect(voidErrorKey('sales.void_requires_credit_note')).toBe('ui.voidRequiresCreditNote');
    expect(voidErrorKey('sales.already_voided')).toBe('ui.voidAlreadyVoided');
    expect(voidErrorKey('sales.void_reason_required')).toBe('ui.voidReasonRequired');
    expect(voidErrorKey('sales.sale_not_found')).toBe('ui.voidSaleNotFound');
  });

  it('never reads the sentence — that is what stopped matching', () => {
    // What the hub sends today as the message of `sales.already_voided`.
    expect(voidErrorKey('the sale was already voided')).toBe('ui.voidFailed');
    // And the old shape, which must not be recognised either: a code is a field, not a prefix.
    expect(voidErrorKey('sales.already_voided: the sale was already voided')).toBe('ui.voidFailed');
  });

  it('is EXACT: a code is not a substring of another', () => {
    expect(voidErrorKey('sales.already_voided_twice')).toBe('ui.voidFailed');
    expect(voidErrorKey('')).toBe('ui.voidFailed');
  });
});

describe('refundErrorKey', () => {
  it('branches on the CODE the envelope carries', () => {
    expect(refundErrorKey('sales.refund_exceeds_tender')).toBe('ui.refundExceedsTender');
    expect(refundErrorKey('sales.refund_method_unavailable')).toBe('ui.refundMethodUnavailable');
    expect(refundErrorKey('sales.refund_reason_required')).toBe('ui.refundReasonRequired');
    expect(refundErrorKey('sales.refund_nothing_to_return')).toBe('ui.refundNothingToReturn');
    expect(refundErrorKey('sales.refund_requires_completed')).toBe('ui.refundRequiresCompleted');
    expect(refundErrorKey('sales.sale_not_found')).toBe('ui.refundSaleNotFound');
  });

  it('keeps the LONG sentence for a leg that does not take its own method', () => {
    // The screen has room here, so the operator is told which leg and why, not just "not eligible".
    expect(refundErrorKey('sales.refund_tender_not_eligible')).toBe('ui.refundReasonNotEligible');
  });

  it('never reads the sentence', () => {
    expect(refundErrorKey('nothing left to return on this sale')).toBe('ui.refundFailed');
    expect(refundErrorKey('sales.refund_exceeds_tender: Efectivo')).toBe('ui.refundFailed');
    expect(refundErrorKey('')).toBe('ui.refundFailed');
  });
});

describe('i18n (ADR-0055/0199)', () => {
  it('every key both maps point at exists in en AND in es', () => {
    const enUi = (en as { ui: Record<string, string> }).ui;
    const esUi = (es as { ui: Record<string, string> }).ui;
    const keys = [
      'sales.void_requires_credit_note', 'sales.already_voided', 'sales.void_reason_required',
      'sales.sale_not_found',
    ].map(voidErrorKey).concat([
      'sales.refund_exceeds_tender', 'sales.refund_tender_not_eligible', 'sales.refund_method_unavailable',
      'sales.refund_reason_required', 'sales.refund_nothing_to_return', 'sales.refund_requires_completed',
      'sales.sale_not_found',
    ].map(refundErrorKey), ['ui.voidFailed', 'ui.refundFailed']);
    for (const key of new Set(keys)) {
      const bare = key.replace(/^ui\./, '');
      expect(enUi[bare], `en.ui.${bare}`).toBeTruthy();
      expect(esUi[bare], `es.ui.${bare}`).toBeTruthy();
    }
  });
});
