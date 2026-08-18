# Sales & POS — Limits and troubleshooting

## Errors you will actually see

These are the domain errors the checkout returns. They are refusals, not crashes: nothing is
recorded when one of them fires.

| Error | What happened | What to do |
|---|---|---|
| `sales.empty_sale` | The sale has no lines | Add at least one line |
| `sales.idempotency_key_required` | The checkout arrived without its attempt key | A client bug — the key is generated when the payment screen opens |
| `sales.catalog_unavailable` | The product catalogue could not be read, and the sale contains catalogue lines | Do not retry blindly; the sale is refused on purpose rather than sold at an unverified price |
| `sales.product_not_available` | A line points at a product that is not in the catalogue | The product was deleted or deactivated; remove the line or re-create the product |
| `sales.payment_method_required` | No payment method was given | Pick one |
| `sales.payment_method_not_available` | The payment method is not in this hub's catalogue, is inactive or was deleted | Pick an active one, or re-enable it in settings |
| `sales.customer_required` | The hub is configured to demand a customer and none was assigned | Assign a customer, or turn off **Exigir cliente en cada venta** |
| `sales.discounts_not_allowed` | A discount was applied but discounts are disabled | Turn on **Permitir descuentos**, or drop the discount |
| `sales.discount_out_of_range` | The discount percentage is outside the accepted range | Use a percentage between 0 and 100 |
| `sales.amount_negative` | A computed amount came out negative | Check quantities, prices and the discount |
| `sales.no_tax_rule` | No tax rule matches the line's category for this hub's country and region | Fix the rule in `taxes`, or the product's tax category in `inventory` |
| `sales.tax_rate_out_of_range` | The resolved rate is not a sane percentage | Fix the rule in `taxes` |
| `sales.tax_catalog_unavailable` | The tax catalogue (`taxes.rules.list`, a **required** read since sales#21) was not delivered to the handler — the sale is refused rather than priced with the browser's VAT | Retry; if it persists, `taxes` is down or the runtime is too old to honour `required` reads |
| `sales.nothing_to_fire` | `sales.order.fire` with `round_no` found no pending line on the order — the round was already fired (double tap, sales#80); nothing is emitted | Nothing to do: the kitchen already has it |
| `sales.insufficient_tendered` | A positive `amount_tendered` is below the total (short cash payment, sales#24) | Enter an amount that covers the total, or leave it empty for the exact amount |

## Caps and sizes

| Limit | Value |
|---|---|
| Rows per page in the sales list | 50 |
| Maximum rows a paginated request may ask for | 500 |
| Discount percentage | 0–100 |

A sale's number comes from a per-day counter, so it resets to `0001` every day; the date is part of
the number.

## Permissions per action

| To do this | You need |
|---|---|
| See sales, their lines and open checks | `sales.view_sale` |
| Build a check: open, add, change, remove, label, split, merge | `sales.add_sale` |
| Fire an order to the kitchen | `sales.add_sale` |
| **Charge** a sale | `sales.take_payment` |
| Void a sale, or void an open check | `sales.void_sale` |
| See payment methods | `sales.view_paymentmethod` |
| Create / change / delete a payment method | `sales.add_paymentmethod` / `sales.change_paymentmethod` / `sales.delete_paymentmethod` |
| See reports, today's totals, the per-professional breakdown | `sales.view_reports` |
| Change the TPV settings | `sales.manage_settings` |

By role: **admin** has everything. **manager** has everything except deleting sales, deleting payment
methods and changing a recorded sale. **employee** can see sales, build a check and see payment
methods — an employee **cannot void a sale**, cannot see reports and cannot change settings.

Note that charging is its own permission, separate from building the check.

## Dependencies — what breaks if something is missing

**`inventory` and `taxes` are required** and are installed automatically with Sales. You **cannot
uninstall either while Sales is installed**: without `inventory` there is no authoritative price and
a catalogue sale is refused; without `taxes` no line can resolve its rate.

Everything else is optional and degrades by disappearing:

| Missing | Effect |
|---|---|
| `customers` | No customer controls in the till. Sales still work, anonymously |
| `tables` | No table controls. Checks are parked instead of left on a table |
| `kitchen` | No "Comanda actual" segment, no fire button, no order status |
| `cash_register` | Sales are recorded but nothing reconciles the till |
| `invoice` / `verifactu` | Sales are recorded but no fiscal document is issued or reported |
| `printing` | Nothing prints |

After installing or removing one of these, **leave the till screen and come back** — the POS resolves
its slots when it mounts.

## When something looks wrong

**"The price charged is not the price I typed."** That is by design. The catalogue decides the price
of a catalogue line; the till's figure is a proposal. Change the price in `inventory`.

**"The VAT is not what the cart showed."** The percentage in the cart is a preview. The server
resolves the real rate from the hub's country and region and the line's tax category, and freezes it
on the line.

**"I pressed charge twice and I am afraid there are two sales."** There is one. The attempt key makes
a retry resolve to the sale it already created. Search the sales list by number to confirm.

**"I cannot change a sale."** A completed sale is immutable. Void it and ring the correct one.

**"I voided a sale but the invoice is still there."** Voiding a sale is not rectifying an invoice.
Take the fiscal correction to `invoice`.

**"I cannot park the check."** There are lines fired to the kitchen that are still pending. Finish
that round first.

**"I fired an order and the kitchen never got it."** Check that `kitchen` is installed and active.
Firing with Kitchen inactive currently marks the lines as sent even though no kitchen ticket was
created — do not fire when Kitchen is off.

**"Kitchen is off but the check still shows 'sent' lines."** Those marks are Sales data and are kept
on purpose; the sale is not affected.

**"The two halves of a split bill do not add up."** They do — whole rows move and both totals are
recomputed from their own lines. If a figure looks off, check whether part of the check was already
charged: paid lines do not travel.

**"A sale is missing from the per-professional report."** That report only counts sales that carry a
professional. A sale rung up without attributing it to anyone is not in there.
