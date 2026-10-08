// services#158 — which lines of a sale the operator can mark as going back, and what they cost.
//
// A ticket with a haircut and a voucher; the customer returns only the voucher. The refund window
// lists the lines paid in money, the operator marks the voucher, the proposal becomes the voucher's
// price and `sales.refund` carries the line, so `services` voids THAT voucher.
import { describe, expect, it } from 'vitest';
import { pickedLineIds, pickedAmount, returnableLines, type ReturnLine } from './refund-lines';

const CUT: ReturnLine = { id: 'li-cut', product_id: 'svc-cut', product_name: 'Corte', line_total: 2000 };
const VOUCHER: ReturnLine = { id: 'li-voucher', product_id: 'pkg-5', product_name: 'Bono 5', line_total: 5000 };
const CHEESE: ReturnLine = {
  id: 'li-cheese', product_id: 'mod-cheese', product_name: '+ queso', line_total: 150, parent_line_ref: 'li-burger',
};
const BURGER: ReturnLine = { id: 'li-burger', product_id: 'p-burger', product_name: 'Burger', line_total: 1000 };
const COVERED: ReturnLine = { id: 'li-covered', product_id: 'svc-cut', product_name: 'Corte', line_total: 0, is_covered: 1 };

describe('returnableLines', () => {
  it('offers the lines paid in money, in ticket order', () => {
    expect(returnableLines([CUT, VOUCHER]).map((l) => l.id)).toEqual(['li-cut', 'li-voucher']);
  });

  it('leaves out a line another tender paid (its own hole gives it back) and a line without id', () => {
    expect(returnableLines([COVERED, { ...CUT, id: '' }, VOUCHER]).map((l) => l.id)).toEqual(['li-voucher']);
  });

  it('a supplement goes with its line: it is not offered on its own', () => {
    expect(returnableLines([BURGER, CHEESE]).map((l) => l.id)).toEqual(['li-burger']);
  });

  it('a Postgres boolean `is_covered` counts as covered too', () => {
    expect(returnableLines([{ ...COVERED, is_covered: true }, CUT]).map((l) => l.id)).toEqual(['li-cut']);
  });
});

describe('pickedLineIds', () => {
  it('names the marked lines and the supplements hanging from them', () => {
    expect(pickedLineIds([BURGER, CHEESE, VOUCHER], new Set(['li-burger']))).toEqual(['li-burger', 'li-cheese']);
  });

  it('nothing marked → nothing named', () => {
    expect(pickedLineIds([CUT, VOUCHER], new Set())).toEqual([]);
  });

  it('a marked id that is not a returnable line is not named', () => {
    expect(pickedLineIds([CUT, VOUCHER, COVERED], new Set(['li-covered', 'li-x']))).toEqual([]);
  });
});

describe('pickedAmount', () => {
  it('is what the marked lines cost, supplements included', () => {
    expect(pickedAmount([CUT, VOUCHER, BURGER, CHEESE], new Set(['li-voucher', 'li-burger']))).toBe(6150);
  });

  it('reads a line total the hub answered as text', () => {
    expect(pickedAmount([{ ...VOUCHER, line_total: '5000' as unknown as number }], new Set(['li-voucher']))).toBe(5000);
  });

  it('nothing marked → 0', () => {
    expect(pickedAmount([CUT, VOUCHER], new Set())).toBe(0);
  });
});
