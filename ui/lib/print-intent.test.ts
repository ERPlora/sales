// sales#283 — the «Print receipt» switch: where it starts and what the sale carries.
import { describe, expect, it } from 'vitest';
import { printReceiptIntent, readAutoPrint } from './print-intent';

describe('readAutoPrint', () => {
  it('reads the 0/1 flag of the printing settings row', () => {
    expect(readAutoPrint([{ auto_print_on_sale: 1 }])).toBe(true);
    expect(readAutoPrint([{ auto_print_on_sale: 0 }])).toBe(false);
  });

  it('accepts the other shapes a portable flag arrives in', () => {
    expect(readAutoPrint([{ auto_print_on_sale: true }])).toBe(true);
    expect(readAutoPrint([{ auto_print_on_sale: '1' }])).toBe(true);
    expect(readAutoPrint([{ auto_print_on_sale: '0' }])).toBe(false);
  });

  it('without an answer there is no setting to start from', () => {
    for (const answer of [undefined, null, [], [{}], [{ auto_print_on_sale: null }], 'x']) {
      expect(readAutoPrint(answer), JSON.stringify(answer)).toBeUndefined();
    }
  });
});

describe('printReceiptIntent', () => {
  it('the cashier\'s choice wins over the setting, both ways', () => {
    expect(printReceiptIntent(false, true)).toBe(false);
    expect(printReceiptIntent(true, false)).toBe(true);
  });

  it('untouched, the setting applies', () => {
    expect(printReceiptIntent(undefined, true)).toBe(true);
    expect(printReceiptIntent(undefined, false)).toBe(false);
  });

  it('untouched and no setting: nobody decided', () => {
    expect(printReceiptIntent(undefined, undefined)).toBeUndefined();
  });
});
