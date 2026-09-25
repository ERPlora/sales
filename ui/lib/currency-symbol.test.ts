// sales#380 — the symbol a label paints for the hub currency (the ticket discount's «amount» mode).
// Same recipe as invoice#94: the SYMBOL comes from `Intl`, the amount never does.
import { describe, expect, it } from 'vitest';
import { currencySymbol } from './currency-symbol';

describe('currencySymbol', () => {
  it('EUR is €', () => {
    expect(currencySymbol('EUR', 'es')).toBe('€');
  });

  it('JPY in English is ¥ and GBP is £', () => {
    expect(currencySymbol('JPY', 'en')).toBe('¥');
    expect(currencySymbol('GBP', 'en')).toBe('£');
  });

  it('matches what formatMoney paints after the number (default currencyDisplay)', () => {
    // es-CLDR has no symbol for the yen: formatMoney paints «1500 JPY», so the label says JPY too.
    expect(currencySymbol('JPY', 'es')).toBe('JPY');
  });

  it('a code Intl does not know is painted as it came, trimmed', () => {
    expect(currencySymbol(' XX1 ', 'es')).toBe('XX1');
  });

  it('no code, no symbol', () => {
    expect(currencySymbol('', 'es')).toBe('');
    expect(currencySymbol(undefined, 'es')).toBe('');
  });
});
