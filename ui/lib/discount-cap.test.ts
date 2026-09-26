import { describe, it, expect } from 'vitest';
import { discountCap, needsManagerApproval, checkoutCommand } from './discount-cap';
import { POS_SETTINGS_DEFAULTS } from './pos-settings';

/** A ticket of 3,00 € with nothing discounted yet. */
const plain = { ticketPercent: 0, ticketAmountCents: 0, grossCents: 300, linePercents: [] as number[] };

describe('the discount a cashier may give alone (sales#269)', () => {
  it('reads the cap the shop configured, and treats absence as NO cap', () => {
    expect(discountCap({ max_discount_percent: 10 })).toBe(10);
    expect(discountCap({})).toBe(100);
    expect(discountCap(undefined)).toBe(100);
    // A till that updates before the column exists must not start asking for PINs.
    expect(POS_SETTINGS_DEFAULTS.max_discount_percent).toBe(100);
  });

  it('clamps a stored value that is out of range instead of trusting it', () => {
    expect(discountCap({ max_discount_percent: 140 })).toBe(100);
    expect(discountCap({ max_discount_percent: -5 })).toBe(0);
    expect(discountCap({ max_discount_percent: Number.NaN })).toBe(100);
  });

  it('sends a ticket over the cap through the MANAGER door, and one under it through the usual one', () => {
    expect(checkoutCommand(10, { ...plain, ticketPercent: 90 })).toBe('sales.complete_sale_over_limit');
    expect(checkoutCommand(10, { ...plain, ticketPercent: 10 })).toBe('sales.complete_sale');
    expect(checkoutCommand(10, plain)).toBe('sales.complete_sale');
  });

  it('counts a LINE discount too: capping only the ticket would be one tap away from nothing', () => {
    expect(needsManagerApproval(10, { ...plain, linePercents: [5, 90] })).toBe(true);
    expect(needsManagerApproval(10, { ...plain, linePercents: [5, 10] })).toBe(false);
  });

  it('counts a FIXED amount as the share of the ticket it really is', () => {
    // 2,00 € off 3,00 € is 66 %, well past a 10 % cap.
    expect(needsManagerApproval(10, { ...plain, ticketAmountCents: 200 })).toBe(true);
    // 30 cents of 3,00 € is exactly the 10 % the cashier may give.
    expect(needsManagerApproval(10, { ...plain, ticketAmountCents: 30 })).toBe(false);
    expect(needsManagerApproval(10, { ...plain, ticketAmountCents: 31 })).toBe(true);
  });

  it('judges each discount on its own, not the stacked saving (sales#287, market decision)', () => {
    // 10 % on every line + 10 % on the ticket + 10 % of what is left as a fixed amount: each fits
    // the cap, so the usual door — like Dynamics 365 Commerce, Square, Toast or Lightspeed.
    const stacked = { ticketPercent: 10, ticketAmountCents: 24, grossCents: 243, linePercents: [10, 10, 10] };
    expect(needsManagerApproval(10, stacked)).toBe(false);
    expect(checkoutCommand(10, stacked)).toBe('sales.complete_sale');
  });

  it('asks nobody for anything when the shop set no cap — the day one behaviour', () => {
    expect(needsManagerApproval(100, { ticketPercent: 100, ticketAmountCents: 0, grossCents: 300, linePercents: [100] })).toBe(false);
    expect(checkoutCommand(100, { ...plain, ticketPercent: 100 })).toBe('sales.complete_sale');
  });
});

describe('a ticket discount the manager already approved on the check (sales#386)', () => {
  const approved = { percent: 90, amountCents: 20 };

  it('charges what was approved through the usual door, with no second PIN', () => {
    expect(checkoutCommand(10, { ...plain, ticketPercent: 90, ticketAmountCents: 20 }, approved)).toBe('sales.complete_sale');
    expect(checkoutCommand(10, { ...plain, ticketPercent: 50 }, approved)).toBe('sales.complete_sale');
  });

  it('asks for the manager again for anything above what was approved', () => {
    expect(checkoutCommand(10, { ...plain, ticketPercent: 91 }, approved)).toBe('sales.complete_sale_over_limit');
    expect(checkoutCommand(10, { ...plain, ticketPercent: 90, ticketAmountCents: 21 }, approved)).toBe('sales.complete_sale_over_limit');
  });

  it('covers the ticket discount, never a line discount nobody approved', () => {
    expect(checkoutCommand(10, { ...plain, ticketPercent: 90, linePercents: [90] }, approved)).toBe('sales.complete_sale_over_limit');
  });

  it('without an approval, the cap rules as before', () => {
    expect(checkoutCommand(10, { ...plain, ticketPercent: 90 }, null)).toBe('sales.complete_sale_over_limit');
  });
});
