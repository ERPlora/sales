// cash-tender — the cashier types the cash handed over before charging (sales#309).
//
// Until sales#309 nothing typed in cash meant «exact amount», and most checkout suites charged that
// way because what they test is something else (refusal codes, combos, vouchers, service flags…).
// Now the till does not charge cash nobody counted, so those suites do what a cashier does: type the
// amount. The EXACT payable is typed on purpose — it covers the sale without inventing change, and
// the payload the suites assert on only gains the `amount_tendered` a real cash sale carries.

interface CashTill {
  payable: number;
  tap(key: string): void;
  updateComplete: Promise<unknown>;
}

/** Types the payable amount, in euros, on the till's keypad. */
export async function tenderExactCash(el: unknown): Promise<void> {
  const till = el as CashTill;
  await till.updateComplete;
  for (const key of (till.payable / 100).toFixed(2)) till.tap(key);
  await till.updateComplete;
}
