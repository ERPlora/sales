// services#158 — which lines of a sale the operator can mark as going back, and what they cost.
//
// A ticket with a haircut and a voucher; the customer returns only the voucher. The refund window
// lists the lines paid in money, the operator marks the voucher, the proposal becomes the voucher's
// price and `sales.refund` carries the line, so `services` voids THAT voucher.
import { describe, expect, it } from 'vitest';
import {
  UNIT, pickedAmount, pickedLines, returnableLines, returnedUnits, unitsLeft, wholeUnitsLeft, type ReturnLine,
} from './refund-lines';

const CUT: ReturnLine = { id: 'li-cut', product_id: 'svc-cut', product_name: 'Corte', line_total: 2000 };
const VOUCHER: ReturnLine = { id: 'li-voucher', product_id: 'pkg-5', product_name: 'Bono 5', line_total: 5000 };
const CHEESE: ReturnLine = {
  id: 'li-cheese', product_id: 'mod-cheese', product_name: '+ queso', line_total: 150, parent_line_ref: 'li-burger',
};
const BURGER: ReturnLine = { id: 'li-burger', product_id: 'p-burger', product_name: 'Burger', line_total: 1000 };
const SHAMPOO: ReturnLine = {
  id: 'li-shampoo', product_id: 'p-shampoo', product_name: 'Champú', line_total: 3000, quantity: 3_000_000,
};
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

// sales#571 — the marked line no longer goes back whole: the operator says HOW MANY units, and
// what is picked is a map line → units (fixed point 10^6, like the line's own quantity). With
// one unit per line (the usual ticket) marking the line still means «the whole line».
const NONE: ReadonlyMap<string, number> = new Map();
const all = (...ls: ReturnLine[]): Map<string, number> => new Map(ls.map((l) => [l.id, Number(l.quantity ?? UNIT)]));

describe('pickedLines', () => {
  it('names the marked lines and the supplements hanging from them, with their units', () => {
    expect(pickedLines([BURGER, CHEESE, VOUCHER], all(BURGER), NONE)).toEqual([
      { line_id: 'li-burger', quantity: UNIT },
      { line_id: 'li-cheese', quantity: UNIT },
    ]);
  });

  it('nothing marked → nothing named', () => {
    expect(pickedLines([CUT, VOUCHER], NONE, NONE)).toEqual([]);
  });

  it('a marked id that is not a returnable line is not named', () => {
    expect(pickedLines([CUT, VOUCHER, COVERED], new Map([['li-covered', UNIT], ['li-x', UNIT]]), NONE)).toEqual([]);
  });

  it('one shampoo of three: only that unit is named', () => {
    expect(pickedLines([SHAMPOO], new Map([['li-shampoo', UNIT]]), NONE)).toEqual([{ line_id: 'li-shampoo', quantity: UNIT }]);
  });

  it('a line marked with 0 units is not named', () => {
    expect(pickedLines([SHAMPOO], new Map([['li-shampoo', 0]]), NONE)).toEqual([]);
  });

  it('the supplements of two burgers of three go back in the same proportion', () => {
    const burgers = { ...BURGER, quantity: 3 * UNIT, line_total: 3000 };
    const cheese = { ...CHEESE, quantity: 3 * UNIT, line_total: 450 };
    expect(pickedLines([burgers, cheese], new Map([['li-burger', 2 * UNIT]]), NONE)).toEqual([
      { line_id: 'li-burger', quantity: 2 * UNIT },
      { line_id: 'li-cheese', quantity: 2 * UNIT },
    ]);
  });

  it('the supplement of the LAST burger takes what is left of it, whatever earlier refunds rounded', () => {
    const burgers = { ...BURGER, quantity: 3 * UNIT };
    const cheese = { ...CHEESE, quantity: 1 * UNIT };
    const returned = new Map([['li-burger', 2 * UNIT], ['li-cheese', 666_667]]);
    expect(pickedLines([burgers, cheese], new Map([['li-burger', UNIT]]), returned)).toEqual([
      { line_id: 'li-burger', quantity: UNIT },
      { line_id: 'li-cheese', quantity: 333_333 },
    ]);
  });
});

describe('pickedAmount', () => {
  it('is what the marked lines cost, supplements included', () => {
    expect(pickedAmount([CUT, VOUCHER, BURGER, CHEESE], all(VOUCHER, BURGER), NONE)).toBe(6150);
  });

  it('reads a line total and a quantity the hub answered as text', () => {
    const v = { ...VOUCHER, line_total: '5000', quantity: String(UNIT) } as unknown as ReturnLine;
    expect(pickedAmount([v], new Map([['li-voucher', UNIT]]), NONE)).toBe(5000);
  });

  it('nothing marked → 0', () => {
    expect(pickedAmount([CUT, VOUCHER], NONE, NONE)).toBe(0);
  });

  it('one shampoo of three costs a third of the line', () => {
    expect(pickedAmount([SHAMPOO], new Map([['li-shampoo', UNIT]]), NONE)).toBe(1000);
  });

  it('three refunds of one unit add up to the line total, never a cent more or less', () => {
    const odd = { ...SHAMPOO, line_total: 1000 }; // 3,33 + 3,34 + 3,33 → 10,00
    const one = new Map([['li-shampoo', UNIT]]);
    const first = pickedAmount([odd], one, NONE);
    const second = pickedAmount([odd], one, new Map([['li-shampoo', UNIT]]));
    const third = pickedAmount([odd], one, new Map([['li-shampoo', 2 * UNIT]]));
    expect([first, second, third]).toEqual([333, 334, 333]);
    expect(first + second + third).toBe(1000);
  });

  it('the supplement is prorated with its line', () => {
    const burgers = { ...BURGER, quantity: 2 * UNIT, line_total: 2000 };
    const cheese = { ...CHEESE, quantity: 2 * UNIT, line_total: 300 };
    expect(pickedAmount([burgers, cheese], new Map([['li-burger', UNIT]]), NONE)).toBe(1150);
  });
});

describe('what is left of each line', () => {
  it('adds up the units every earlier refund took back, per line', () => {
    const rows = [
      { sale_item_id: 'li-shampoo', quantity: UNIT },
      { sale_item_id: 'li-shampoo', quantity: String(UNIT) },
      { sale_item_id: 'li-cut', quantity: UNIT },
    ];
    expect(returnedUnits(rows)).toEqual(new Map([['li-shampoo', 2 * UNIT], ['li-cut', UNIT]]));
  });

  it('a row without quantity (a hub before sales#571) took the whole line back', () => {
    const returned = returnedUnits([{ sale_item_id: 'li-shampoo' }]);
    expect(unitsLeft(SHAMPOO, returned)).toBe(0);
  });

  it('is the line quantity minus what went back, never below 0', () => {
    expect(unitsLeft(SHAMPOO, NONE)).toBe(3 * UNIT);
    expect(unitsLeft(SHAMPOO, new Map([['li-shampoo', UNIT]]))).toBe(2 * UNIT);
    expect(unitsLeft(SHAMPOO, new Map([['li-shampoo', 5 * UNIT]]))).toBe(0);
  });

  it('counts whole units only: a weighed line has none to step through', () => {
    expect(wholeUnitsLeft(SHAMPOO, new Map([['li-shampoo', UNIT]]))).toBe(2);
    expect(wholeUnitsLeft({ ...SHAMPOO, quantity: 1_500_000 }, NONE)).toBe(0);
  });
});
