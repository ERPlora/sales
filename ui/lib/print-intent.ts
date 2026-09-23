// sales#283 — the «Print receipt» switch of the charge sheet.
//
// The shell prints the receipt on `sale.completed`; the switch only means something if its value
// travels with the sale (`print_receipt`) and the shell obeys it. The shop's auto-print setting is
// the switch's DEFAULT, and what the cashier leaves on the sheet applies to that sale, in both
// directions — the Square/Toast shape: a switch that can only take away is worse than none.

/** The `auto_print_on_sale` flag of `printing.settings.get`. `undefined` = no readable setting
 *  (no `printing` app, a failed read, a row without the flag). */
export function readAutoPrint(answer: unknown): boolean | undefined {
  const row = Array.isArray(answer) ? (answer[0] as Record<string, unknown> | undefined) : undefined;
  const v = row?.auto_print_on_sale;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === '1' || v === '0') return v === '1';
  return undefined;
}

/** What the sale says about its receipt: the cashier's choice, else the shop's setting.
 *  `undefined` = nobody decided, and the sale carries nothing (the shell keeps its own rule). */
export function printReceiptIntent(choice: boolean | undefined, setting: boolean | undefined): boolean | undefined {
  return choice ?? setting;
}
