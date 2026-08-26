// sales#28 — the OPTIONAL scale contract: how a measured weight becomes the quantity of a line.
//
// The SHAPE is decided by the MARKET, not by us (9 references + 2 forums, table in the PR):
//   · Square — «Select an item from your library», put it on the scale, «the weight and price are
//     automatically calculated on the app screen», then Add to Cart. Tare is a POS gesture.
//   · Odoo 19 — the product carries «To Weigh With Scale» and its unit MUST be kg; selecting it
//     opens a popup that waits for the scale, and the price is computed from the reading.
//   · Clover — the item is «Per Unit»; «put the item on the scale and the Clover device should
//     automatically update the quantity», and «the unit listed on the scale must match the item's».
//   · Toast — «Prompt for Quantity» on the item, and «the POS will automatically read the weight
//     listed on the scale and multiply it by the price per unit when the item is selected».
//   · Lightspeed (S-Series) — «ring up a unit priced item and place the item on the scale to have
//     its weight automatically entered»; the tare is a button ON THE SCALE.
//   · Glop (Spanish food POS) — the article carries «Venta por peso» and «recibirá la cantidad de
//     una balanza»; the price per kg/g lives on the article.
//   · Revel / LS Central (Business Central retail) — the weighed item is flagged on its card and
//     the tare is subtracted before the POS sees the weight.
//   · Shopify POS / WooCommerce (FooSales) — no native scale: the weight is TYPED as a decimal
//     quantity. This is the fallback every one of the others also keeps.
//
// Three verdicts come out of that, and they are what this file pins:
//   1. The weight lands on a line that ALREADY EXISTS and is priced by weight — a reading never
//      creates a line, and never touches a line sold by the unit. Selection first is unanimous.
//   2. The unit is NOT converted: a reading in a unit the line does not use is a REFUSAL the
//      cashier sees, exactly as Clover words it. Silently turning 500 g into 500 kg is the one
//      mistake nobody can afford on a fiscal document.
//   3. Absence of a scale changes nothing. Odoo's forum is full of «the weight screen does not
//      show up» (odoo.com/forum/help-1/…-245444) and the Square community's loudest thread asks
//      for DECIMALS, not for hardware (community.squareup.com/…/td-p/108388): the typed path is
//      the product, the scale is an accelerator on top of it.
//
// What this file does NOT decide: the grid. An off-grid weight is refused by the very same door as
// a typed one (`setQtyAbs` → `onGrid` → `ui.qtyOffGrid`), which is asserted in the component test.
import { describe, expect, it } from 'vitest';

import { parseScaleReading, scaleTargetLine, scaleVerdict, SCALE_WEIGHT_EVENT } from './scale-entry.js';
import type { CartLine } from './pos-cart.js';

const KG = (over: Partial<CartLine> = {}): CartLine => ({
  id: 'p-tomato', name: 'Tomato', price: 1200, qty: 1,
  unit_code: 'kg', increment_value: 1000, ...over,
});
const UNIT = (over: Partial<CartLine> = {}): CartLine => ({
  id: 'p-coffee', name: 'Coffee', price: 180, qty: 1, unit_code: 'ud', ...over,
});

/** The hub's unit registry answers this; the test stands in for it. */
const byMass = (code?: string) => code === 'kg' || code === 'g';

describe('scale contract · the event', () => {
  it('is namespaced like the other shell→module events (`erplora:locale-changed`)', () => {
    expect(SCALE_WEIGHT_EVENT).toBe('erplora:scale-weight');
  });
});

describe('scale contract · parsing a reading', () => {
  it('takes a well formed reading', () => {
    expect(parseScaleReading({ value: 0.5, unit_code: 'kg', stable: true }))
      .toEqual({ value: 0.5, unit_code: 'kg', stable: true });
  });

  it('carries the device that measured it when the shell names one', () => {
    expect(parseScaleReading({ value: 1, unit_code: 'kg', stable: true, device_id: 'dev-7' }))
      .toEqual({ value: 1, unit_code: 'kg', stable: true, device_id: 'dev-7' });
  });

  // The event is a PUBLIC DOOR: anything on the page can dispatch it. Nothing that is not a
  // quantity gets to reach the cart.
  it.each([
    ['no detail at all', undefined],
    ['a string', 'ok'],
    ['no value', { unit_code: 'kg', stable: true }],
    ['a value that is not a number', { value: '0.5', unit_code: 'kg', stable: true }],
    ['a NaN', { value: Number.NaN, unit_code: 'kg', stable: true }],
    ['an infinite value', { value: Number.POSITIVE_INFINITY, unit_code: 'kg', stable: true }],
    ['a negative value', { value: -1, unit_code: 'kg', stable: true }],
    ['no unit', { value: 0.5, stable: true }],
    ['a blank unit', { value: 0.5, unit_code: '   ', stable: true }],
  ])('refuses %s', (_what, detail) => {
    expect(parseScaleReading(detail)).toBeNull();
  });

  it('reads a missing `stable` as NOT stable — a scale that never says so is still settling', () => {
    expect(parseScaleReading({ value: 0.5, unit_code: 'kg' })?.stable).toBe(false);
  });
});

describe('scale contract · which line the weight lands on', () => {
  it('is the last line priced by weight — the one just tapped', () => {
    const target = KG({ id: 'p-cherry' });
    expect(scaleTargetLine([UNIT(), KG(), target], byMass)).toBe(target);
  });

  it('is nothing when the check has no line priced by weight', () => {
    expect(scaleTargetLine([UNIT(), UNIT({ id: 'p-beer' })], byMass)).toBeUndefined();
  });

  it('is nothing on an empty check', () => {
    expect(scaleTargetLine([], byMass)).toBeUndefined();
  });

  it('skips a line already fired to the kitchen — that weight is cooked', () => {
    const open = KG({ id: 'p-cherry' });
    expect(scaleTargetLine([open, KG({ id: 'p-prawn', fired_at: '2026-08-26T10:00:00Z' })], byMass))
      .toBe(open);
  });
});

describe('scale contract · the verdict', () => {
  it('takes the weight as the quantity of the line', () => {
    expect(scaleVerdict(KG(), { value: 0.5, unit_code: 'kg', stable: true }))
      .toEqual({ ok: true, qty: 0.5 });
  });

  it('refuses when there is no line priced by weight — the platter just sits there', () => {
    expect(scaleVerdict(undefined, { value: 0.5, unit_code: 'kg', stable: true }))
      .toEqual({ ok: false, reason: 'no_weighable_line' });
  });

  it('refuses a reading the scale has not settled on', () => {
    expect(scaleVerdict(KG(), { value: 0.5, unit_code: 'kg', stable: false }))
      .toEqual({ ok: false, reason: 'unstable' });
  });

  // Clover: «make sure that the unit listed on the scale matches the item's unit». No conversion
  // here on purpose — 500 g read onto a kg line would be a 1000× error on a fiscal document.
  it('refuses a reading in a unit this line is not priced in, and NEVER converts it', () => {
    expect(scaleVerdict(KG(), { value: 500, unit_code: 'g', stable: true }))
      .toEqual({ ok: false, reason: 'unit_mismatch', expected: 'kg', got: 'g' });
  });

  it('refuses an empty platter — zero is «nothing on it», not «sell me none»', () => {
    expect(scaleVerdict(KG(), { value: 0, unit_code: 'kg', stable: true }))
      .toEqual({ ok: false, reason: 'zero' });
  });
});
