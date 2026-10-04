# Sales & POS — Limits and troubleshooting

## Errors you will actually see

These are the domain errors the checkout returns. They are refusals, not crashes: nothing is
recorded when one of them fires.

Since sales#207 the **complete** list is declared in `module.json → errors` (ADR-0398) — that block
is the contract, and `erplora validate` fails if the handler raises a code that is not in it. The
sentence each code shows the user lives in `locales/en.json` / `locales/es.json` under
`errors.<code>`. The table below is the subset worth explaining at length, not the catalogue.

| Error | What happened | What to do |
|---|---|---|
| `sales.empty_sale` | The sale has no lines | Add at least one line |
| `sales.idempotency_key_required` | The checkout arrived without its attempt key | A client bug — the key is generated when the payment screen opens |
| `sales.catalog_unavailable` | The product catalogue could not be read, and the sale contains catalogue lines | Do not retry blindly; the sale is refused on purpose rather than sold at an unverified price |
| `sales.product_not_available` | A line points at a product that is not in the catalogue | The product was deleted or deactivated; remove the line or re-create the product |
| `sales.payment_method_required` | No payment method was given | Pick one |
| `sales.payment_method_not_available` | The payment method is not in this hub's catalogue, is inactive or was deleted | Pick an active one, or re-enable it in settings |
| `sales.customer_required` | The hub is configured to demand a customer and none was assigned | Assign a customer, or turn off **Exigir cliente en cada venta** |
| `sales.invoice_recipient_incomplete` | The sale is an `invoice` but the customer's name, tax id or address is missing (sales#317). An invoice made out to nobody would print as a full invoice while the tax record files it as a simplified one | Fill in the three fields, or charge it as a `ticket` |
| `sales.discounts_not_allowed` | A discount was applied but discounts are disabled | Turn on **Permitir descuentos**, or drop the discount |
| `sales.discount_out_of_range` | The discount percentage is outside the accepted range, or the fixed `discount_amount` exceeds what it comes off — the gross with the tax inside the price, the base with net prices (sales#113, sales#295) | Use a percentage between 0 and 100 / an amount up to the total |
| `sales.amount_negative` | A computed amount came out negative | Check quantities, prices and the discount |
| `sales.no_tax_rule` | No tax rule matches the line's category for this hub's country and region | Fix the rule in `taxes`, or the product's tax category in `inventory` |
| `sales.tax_rate_out_of_range` | The resolved rate is not a sane percentage | Fix the rule in `taxes` |
| `sales.tax_catalog_unavailable` | The tax catalogue (`taxes.rules.list`, a **required** read since sales#21) was not delivered to the handler — the sale is refused rather than priced with the browser's VAT | Retry; if it persists, `taxes` is down or the runtime is too old to honour `required` reads |
| `sales.nothing_to_fire` | `sales.order.fire` with `round_no` found no pending line on the order — the round was already fired (double tap, sales#80); nothing is emitted | Nothing to do: the kitchen already has it |
| `sales.void_reason_required` | `sales.void` without a reason (sales#26) | Type why the sale is voided |
| `sales.already_voided` | The sale is not `completed` (already voided/refunded): a void is one-shot and never emits twice | Nothing to do — it is already reversed |
| `sales.void_requires_credit_note` | The sale carries a full invoice; voiding it would leave the invoice orphaned | Issue a credit note (rectificativa) from `invoice` instead |
| `sales.sale_already_refunded` | `sales.void` on a sale that already has refunds (sales#247). Money has already moved, so an «annulment» is no longer one of the two doors — and a partial refund leaves the sale `completed`, which is why `already_voided` does not cover it | Refund what is left with `sales.refund` instead |
| `sales.sale_not_found` | `sales.void` on a sale that is not in this hub | Check the sale id |
| `sales.refund_reason_required` | `sales.refund` without a reason (sales#160) | Type why the money goes back |
| `sales.refund_requires_completed` | The sale is not `completed` — already voided, or already refunded in full | Nothing to do: it has no money left behind it |
| `sales.refund_nothing_to_return` | The refund carries no allocation, or every leg is at zero | Type how much goes back to each tender |
| `sales.refund_tender_unknown` | An allocation names a payment leg that does not belong to this sale | A client bug: the legs come from `sales.refund_options` |
| `sales.refund_tender_duplicated` | The same leg appears twice in one refund | Merge them into a single line: two lines pass the cap one by one and break it together |
| `sales.refund_amount_invalid` | A leg was given something that is not a positive amount of cents | Type an amount; a negative here would be a charge disguised as a refund |
| `sales.refund_exceeds_tender` | A leg is being given back more than it was charged minus what it already returned. **The message names which leg** | Lower that leg, or move the excess to another one |
| `sales.refund_tender_not_eligible` | The leg cannot take its own money back (its payment method is gone) and no other destination was named | Pick another destination for that leg — the money is still refundable, just not through that door |
| `sales.refund_method_unavailable` | The named destination is not an active payment method in this hub | Pick an active one, or re-enable it in settings |
| `sales.insufficient_tendered` | A positive `amount_tendered` is below the total (short cash payment, sales#24) | Enter an amount that covers the total, or leave it empty for the exact amount |
| `sales.cash_limit_exceeded` | The sale is 1.000,00 € or more and some of it is paid in cash, in a hub whose country is Spain (Ley 7/2012 art. 7, sales#498). A **mixed** payment counts too: 999 € in cash plus 1 € by card on a 1.000 € sale is refused, because the law looks at the whole operation, not at each leg. The manager's approval does not lift it — it is the law, not a discount cap | Charge it by card, Bizum or bank transfer. The till already shows the cash button as unavailable and says why before the tap |

## Caps and sizes

| Limit | Value |
|---|---|
| Rows per page in the sales list | 50 |
| Maximum rows a paginated request may ask for | 500 |
| Discount percentage | 0–100 |
| Cash in a single sale (hubs in Spain) | below 1.000,00 € — from 1.000,00 € on, no cash at all, mixed payments included. Hubs in other countries have no limit |

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
| **Read** the TPV settings the counter works by (`sales.pos_settings.get`) | `sales.view_sale` |

By role: **admin** has everything. **manager** has everything except deleting sales, deleting payment
methods and changing a recorded sale. **employee** can see sales, build a check and see payment
methods — an employee **cannot void a sale**, cannot see reports and cannot change settings.

Reading and changing the settings are two different things. Nobody who sells needs
`sales.manage_settings` to be governed by the settings: the till and the receipt read the shop's
operational policy through `sales.pos_settings.get` with plain `sales.view_sale`, so a `cashier`
gets exactly the screen the owner configured (sales#203).

Note that charging is its own permission, separate from building the check.

### When the hub refuses the sale: no way to reach the tax agency (hub#1935)

A business that files with the tax agency **for real** (its fiscal profile went live) does not
charge a ticket that would never get there. These two codes come from the hub itself, not from this
module, and nothing is recorded when they fire:

| Error | What happened | What to do |
|---|---|---|
| `fiscal.no_representation_grant` | ERPlora sends this business's tickets on its behalf, and the signed representation grant is not approved (missing, pending review, rejected or revoked) | Sign and upload the grant in the fiscal settings; the till sells again once it is approved |
| `fiscal.gateway_not_enrolled` | The grant is approved, but this hub's secure connection to ERPlora's fiscal service is not set up | Set up the connection in the fiscal settings |

The till says it **when it opens**, before any payment is taken: «Cobrar» stays pressable but does
not open the payment sheet, and a notice names the cause with a button to the fiscal settings. A
business that files with **its own certificate** is never blocked by either. In test mode nothing is
ever blocked. When the tax agency is simply **down**, the till keeps charging: the tickets queue and
are sent when it comes back.

## Dependencies — what breaks if something is missing

**`inventory` and `taxes` are required** and are installed automatically with Sales. You **cannot
uninstall either while Sales is installed**: without `inventory` there is no authoritative price and
a catalogue sale is refused; without `taxes` no line can resolve its rate.

**A required app that IS installed and does not answer is said out loud.** The till used to swallow
every failure of those two catalogues into an empty grid, so a forced uninstall (which the hub does
allow) and a broken query looked identical to the cashier. Now they do not: absence degrades in
silence (the till sells services and free-price lines), and a failure paints a notice naming the
app. With `taxes` gone the till refuses to charge at all — no sale can close without it.

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
