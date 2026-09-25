import { afterEach, describe, expect, it } from 'vitest';
import { hubDecimals } from './hub-currency';
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
