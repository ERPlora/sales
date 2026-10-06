// checkout-preview — the till asks the SERVER what the ticket adds up to (sales#164 / #172).
import { describe, it, expect, vi } from 'vitest';
import {
  checkoutItems, fetchCheckoutPreview, previewSignature, type CheckoutPreview,
} from './checkout-preview';
import type { CartLine } from './pos-cart';

const line = (o: Partial<CartLine> = {}): CartLine => ({
  id: 'p-cafe', name: 'Café', price: 150, qty: 1, line_id: 'l-1', ...o,
});

const answer: CheckoutPreview = {
  total: 150, subtotal: 136, tax_total: 14, discount_amount: 0, gift_total: 0,
  tax_included: true, lines: [], tax_breakdown: {},
};

describe('checkoutItems', () => {
  it('is the SAME payload the charge sends, so the preview values what will be charged', () => {
    const items = checkoutItems([line({ qty: 2, discount: 10, tax_category_key: 'shop.food', tax_rate: 10 })], {
      covered: new Set<string>(),
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      product_id: 'p-cafe', product_name: 'Café', price: 150, quantity: 2_000_000,
      tax_category_key: 'shop.food', tax_rate: 10, discount: 10, order_item_id: 'l-1',
    });
  });

  it('a line with NO tax category declares no rate, so the server refuses it instead of charging 0 % (sales#519)', () => {
    // An appointment whose service is gone seeds a line with no id and no category. Its `tax_rate`
    // is the 0 the preview fell back to, not a rate anybody declared: sent as 0, the server took it
    // as declared and the ticket went out at 0 % VAT. The key is left OUT (the schema types it as a
    // number), which is what the server reads as "declares no rate": `sales.tax_category_missing`.
    const items = checkoutItems([line({ id: '', name: 'Peinado', tax_category_key: undefined, tax_rate: 0 })], {
      covered: new Set<string>(),
    });
    expect(items[0]).not.toHaveProperty('tax_rate');
    expect(items[0].tax_category_key).toBeNull();
  });

  it('a line WITH a tax category keeps sending its preview rate', () => {
    const items = checkoutItems([line({ tax_category_key: 'service.generic', tax_rate: 21 })], {
      covered: new Set<string>(),
    });
    expect(items[0].tax_rate).toBe(21);
  });

  it('marks a line an external tender already covered', () => {
    const items = checkoutItems([line()], { covered: new Set(['l-1']) });
    expect(items[0].covered).toBe(true);
  });

  it('carries the combo choices, because the SERVER prices the set menu', () => {
    const items = checkoutItems(
      [line({ combo_id: 'c-1', combo_choices: [{ option_id: 'o-1', product_name: 'Ensalada' }] })],
      { covered: new Set<string>() },
    );
    expect(items[0]).toMatchObject({ combo_id: 'c-1' });
    expect(items[0].combo_choices).toEqual([{ option_id: 'o-1', product_name: 'Ensalada', category_id: null }]);
  });

  it('never sends a price_delta of its own for a modifier: only the option id', () => {
    const items = checkoutItems([line({ modifiers: [{ option_id: 'm-1' }] })], { covered: new Set<string>() });
    expect(items[0].modifiers).toEqual([{ option_id: 'm-1' }]);
  });
});

describe('fetchCheckoutPreview', () => {
  it('asks sales.checkout.preview and unwraps the handler result channel', async () => {
    const command = vi.fn().mockResolvedValue({ ok: true, operations: 0, result: answer });
    const got = await fetchCheckoutPreview({ command } as never, {
      lines: [line()], ticketDiscount: 0, ticketDiscountAmount: 0, covered: new Set<string>(),
      taxIncluded: true,
    });
    expect(command).toHaveBeenCalledWith('sales.checkout.preview', expect.objectContaining({
      discount_percent: 0, tax_included: true,
    }));
    expect(got).toEqual(answer);
  });

  it('sends the fixed discount only when the WHOLE check is being charged', async () => {
    const command = vi.fn().mockResolvedValue({ result: answer });
    await fetchCheckoutPreview({ command } as never, {
      lines: [line()], ticketDiscount: 0, ticketDiscountAmount: 300, covered: new Set<string>(),
      taxIncluded: true, partial: true,
    });
    expect(command.mock.calls[0][1]).not.toHaveProperty('discount_amount');
    await fetchCheckoutPreview({ command } as never, {
      lines: [line()], ticketDiscount: 0, ticketDiscountAmount: 300, covered: new Set<string>(),
      taxIncluded: true,
    });
    expect(command.mock.calls[1][1]).toMatchObject({ discount_amount: 300 });
  });

  it('answers undefined on an EMPTY check instead of asking the server to value nothing', async () => {
    const command = vi.fn();
    const got = await fetchCheckoutPreview({ command } as never, {
      lines: [], ticketDiscount: 0, ticketDiscountAmount: 0, covered: new Set<string>(), taxIncluded: true,
    });
    expect(got).toBeUndefined();
    expect(command).not.toHaveBeenCalled();
  });

  it('a handler that answers nothing is a MISSING preview, never a total of zero', async () => {
    const command = vi.fn().mockResolvedValue({ ok: true, operations: 0 });
    const got = await fetchCheckoutPreview({ command } as never, {
      lines: [line()], ticketDiscount: 0, ticketDiscountAmount: 0, covered: new Set<string>(), taxIncluded: true,
    });
    expect(got, 'a hub without the command must fall back, not charge 0').toBeUndefined();
  });
});

describe('previewSignature', () => {
  it('changes when anything that moves the total moves', () => {
    const base = {
      lines: [line()], ticketDiscount: 0, ticketDiscountAmount: 0, covered: new Set<string>(),
      taxIncluded: true,
    };
    const sig = previewSignature(base);
    expect(previewSignature({ ...base, ticketDiscount: 10 })).not.toBe(sig);
    expect(previewSignature({ ...base, ticketDiscountAmount: 50 })).not.toBe(sig);
    expect(previewSignature({ ...base, taxIncluded: false })).not.toBe(sig);
    expect(previewSignature({ ...base, covered: new Set(['l-1']) })).not.toBe(sig);
    expect(previewSignature({ ...base, lines: [line({ qty: 2 })] })).not.toBe(sig);
    expect(previewSignature({ ...base, lines: [line({ discount: 5 })] })).not.toBe(sig);
  });

  it('does NOT change for what cannot move the total', () => {
    const base = {
      lines: [line()], ticketDiscount: 0, ticketDiscountAmount: 0, covered: new Set<string>(),
      taxIncluded: true,
    };
    expect(previewSignature({ ...base, lines: [line({ name: 'Café con leche' })] }))
      .toBe(previewSignature(base));
  });
});
