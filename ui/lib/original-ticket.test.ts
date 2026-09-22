// sales#330 — only one ORIGINAL of each sale's ticket may come out (RD 1619/2012 art. 14). This
// device remembers which sales already had theirs, so every paper after it says «duplicado».
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetOriginalPrints, markOriginalPrinted, originalPrinted } from './original-ticket.js';

beforeEach(() => forgetOriginalPrints());

describe('original ticket registry (sales#330)', () => {
  it('a sale nobody printed has its original still to come', () => {
    expect(originalPrinted('sale-1')).toBe(false);
  });

  it('once its original is out, the sale only gets copies', () => {
    markOriginalPrinted('sale-1');
    expect(originalPrinted('sale-1')).toBe(true);
  });

  it('is per sale: another sale keeps its original', () => {
    markOriginalPrinted('sale-1');
    expect(originalPrinted('sale-2')).toBe(false);
  });

  it('stays bounded on a till open all day: the oldest sales are forgotten, the latest never', () => {
    for (let i = 0; i < 5000; i++) markOriginalPrinted(`sale-${i}`);
    expect(originalPrinted('sale-0'), 'the oldest one fell out').toBe(false);
    expect(originalPrinted('sale-4999'), 'the one just charged is remembered').toBe(true);
  });
});
