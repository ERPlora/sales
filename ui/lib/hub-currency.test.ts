import { afterEach, describe, expect, it } from 'vitest';
import { hubDecimals, minorToTyped, pushTypedKey, typedToMinor } from './hub-currency';
import { hubDecimals as reexported } from './document-mappers';
import { installErploraDouble } from '../test/erplora-double';

// The hub currency's scale (ADR-0123 §7) is read in ONE place: the paper (`paper-combos`), the
// documents (`document-mappers`) and the refund field (`erp-sale-refund`) all ask here.
afterEach(() => {
  delete (globalThis as { erplora?: unknown }).erplora;
});

describe('hubDecimals — the scale of the hub currency', () => {
  it('is what the SDK says when the shell injected it (JPY 0, KWD 3)', () => {
    installErploraDouble({ extra: { currencyDecimals: 0 } });
    expect(hubDecimals()).toBe(0);
    installErploraDouble({ extra: { currencyDecimals: 3 } });
    expect(hubDecimals()).toBe(3);
  });

  it('falls back to 2 without an SDK or with a value that is not a scale', () => {
    expect(hubDecimals()).toBe(2);
    for (const bad of [-1, 1.5, '0', null]) {
      installErploraDouble({ extra: { currencyDecimals: bad } });
      expect(hubDecimals(), String(bad)).toBe(2);
    }
  });

  it('is still exported by document-mappers, where the existing callers import it', () => {
    expect(reexported).toBe(hubDecimals);
  });
});

// sales#379 — the till's keypads type the MAJOR unit as text ('.' separator, what `pushDigit`
// builds) and the sale contract is the MINOR unit. Both directions follow the hub scale.
describe('typedToMinor / minorToTyped — the keypad text in the hub scale', () => {
  it('reads the typed text with the hub scale: JPY 0, EUR 2, KWD 3', () => {
    installErploraDouble({ extra: { currencyDecimals: 0 } });
    expect(typedToMinor('2000')).toBe(2000);
    installErploraDouble({ extra: { currencyDecimals: 2 } });
    expect(typedToMinor('20')).toBe(2000);
    expect(typedToMinor('0.29')).toBe(29);
    installErploraDouble({ extra: { currencyDecimals: 3 } });
    expect(typedToMinor('1.234')).toBe(1234);
  });

  it('empty or garbage is 0, never NaN', () => {
    installErploraDouble({ extra: { currencyDecimals: 0 } });
    expect(typedToMinor('')).toBe(0);
    expect(typedToMinor('.')).toBe(0);
    expect(typedToMinor('abc')).toBe(0);
  });

  it('writes a minor amount back as keypad text, with exactly the hub decimals', () => {
    installErploraDouble({ extra: { currencyDecimals: 0 } });
    expect(minorToTyped(1000)).toBe('1000');
    installErploraDouble({ extra: { currencyDecimals: 2 } });
    expect(minorToTyped(5000)).toBe('50.00');
    expect(minorToTyped(5)).toBe('0.05');
    installErploraDouble({ extra: { currencyDecimals: 3 } });
    expect(minorToTyped(1250)).toBe('1.250');
    expect(minorToTyped(7)).toBe('0.007');
  });

  it('round-trips: what it writes, typedToMinor reads back to the same amount', () => {
    for (const d of [0, 2, 3]) {
      installErploraDouble({ extra: { currencyDecimals: d } });
      for (const m of [0, 1, 99, 1000, 123456]) expect(typedToMinor(minorToTyped(m)), `${d}:${m}`).toBe(m);
    }
  });
});

describe('pushTypedKey — the keypad accumulator bounded by the hub scale', () => {
  it('in yen the separator is refused: there is no fraction of a yen', () => {
    installErploraDouble({ extra: { currencyDecimals: 0 } });
    expect(pushTypedKey('1', '.')).toBe('1');
    expect(pushTypedKey('1', '5')).toBe('15');
  });

  it('takes at most the hub decimals after the separator', () => {
    installErploraDouble({ extra: { currencyDecimals: 2 } });
    expect(pushTypedKey('12.34', '5')).toBe('12.34');
    expect(pushTypedKey('12.3', '4')).toBe('12.34');
    installErploraDouble({ extra: { currencyDecimals: 3 } });
    expect(pushTypedKey('1.23', '4')).toBe('1.234');
    expect(pushTypedKey('1.234', '5')).toBe('1.234');
  });

  it('keeps the old rules: C clears, one separator, 9 characters at most', () => {
    installErploraDouble({ extra: { currencyDecimals: 2 } });
    expect(pushTypedKey('12.3', 'C')).toBe('');
    expect(pushTypedKey('12.', '.')).toBe('12.');
    expect(pushTypedKey('123456789', '1')).toBe('123456789');
  });
});
