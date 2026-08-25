# Sales & POS — Concepts

The things people get wrong on their first day.

## An order is mutable; a sale is not

These are two different entities and confusing them is the single most common mistake.

| | **Order** (open check) | **Sale** |
|---|---|---|
| Can you edit it? | **Yes** — add, change and remove lines freely | **No. Never.** |
| Its amounts are | provisional | final and frozen |
| Its life | `open` → `completed` or `voided` | append-only; `completed` or `voided` |
| How many | one check | one check can produce **several** sales |

While the check is open you are just taking note. The moment you charge, an **immutable sale** is
born: it gets its number, its tax breakdown is frozen, and nothing about it can be changed again.

**Why you cannot edit a completed sale:** it is a fiscal record. Editing it would mean rewriting a
document that has already been reported. So:

- **To correct a completed sale, void it** with `sales.void`. That sets its status to `voided` — it
  does not delete the row, and it does not delete the history. `sale.voided` is emitted so stock
  comes back and the till is corrected.
- **To cancel a check before anyone paid**, void the *order* instead. Nothing fiscal ever existed.

Note that voiding a sale is not the same as rectifying an invoice. If the sale already became an
invoice, the fiscal correction belongs to `invoice`.

## One check, several sales — "everyone pays their own"

You can charge part of a check: select the lines, charge them, and the check stays open with the
rest. Those lines are marked paid and linked to the sale that charged them, so nothing can be
charged twice. That is how one order legitimately ends up with three sale numbers.

## The check knows nothing about tables or customers

A grocery shop has neither, and it sells perfectly well. So the order carries no table and no
customer link.

- **The table** is remembered by `tables`, in its service session.
- **The customer** is remembered by `customers`.
- **But the customer's fiscal data is copied into the sale** — name, tax id, address — as a frozen
  snapshot. That is a different thing: an invoice needs the buyer as they were at that moment, not as
  they are today.

## The kitchen is fired from the order, not from the payment

A waiter takes the order and sends it to the kitchen immediately; the customer pays an hour later.
So firing is an action on the **open check**, and it emits `order.fired`.

Each press of "send" is a **new round**. Only lines that were never fired are sent, and once fired
they carry the round number and the moment they were sent. This is why a line that has been fired
never returns to "pending" when checks are split or merged — otherwise the same food would be cooked
twice.

## An open check is charged at the price it was OPENED at

A table is charged what the menu said **when it ordered**, not what the catalogue says when it pays.
Raise the burger at six in the evening and the tables already sitting keep the price they were
served; only the checks opened afterwards see the new one.

That is not our invention, it is what the trade does. Square's Orders API takes a snapshot when the
order is created and «even if the price of the item changes before the transaction completes… uses
that original price». Oracle Simphony's price-level change explicitly does not reach «menu items
from a previous service round». Odoo computes the price «at the time the line item is added» and
does not recompute the lines of an order already created. Business Central puts the price on the
line and makes re-pricing an explicit action. Lightspeed lets you change the price of one order item
by hand — and gates it behind a permission. The only sizeable experiment in the other direction,
Shopify's draft-order change of January 2025, ended in a bug thread and a `price lock`. The full
research, with the eight references and the forums, is in ADR-0402.

**Where it is frozen.** The price is stamped on `sales_order_item.unit_price` the moment the line is
materialised — opening the check (`sales.order.open`) or adding a line to it
(`sales.order.add_line`). Both doors resolve it **server-side** against `inventory.products.for_sale`,
and a set menu against `combos.options.all`, with exactly the same rule the checkout has had since
sales#68: if a line claims to come from the catalogue, the catalogue wins; an id that is not there is
rejected; without a catalogue the line is not written at all. **The `price` in the payload is a
proposal at every door**, never a fact — honouring the row is not honouring the till.

**How the checkout honours it.** The line names its row (`order_item_id`), the checkout reads
`sales.order.lines` and takes `unit_price`, `cost` and `tax_category_key` from it. It fails closed:
if that read did not arrive, or the id is not among the check's **live** lines, the sale is
**refused** rather than re-priced — and a line already paid is not live, so charging it twice is a
rejection instead of a second charge. A counter sale carries no `order_item_id` and is priced by the
catalogue, which is right: there is no "when it was ordered" earlier than the payment.

**If the price goes down, or a promotion starts**, the check still charges the frozen price. Freezing
is symmetrical or it is not freezing — Shopify documents that same trade-off word for word. Lowering
it is a **manual** decision with a name on it: the line or ticket discount that already exists, or an
open-price line, both already gated by permission (`sales.sell_open_price`, manager PIN, ADR-0238).
There is deliberately **no "re-price" command**: it would be a third route for money with its own
audit trail to keep.

## An open check remembers what was CHOSEN, not how it is split

The row of an open check is a **working row**. Besides its frozen price it carries everything the
checkout cannot re-derive after a reload — the tax category, the cost, whether it is a service, the
product category the kitchen routes by, the line discount, the frozen unit context, the supplements
chosen, and **which menu the line came from and what was picked inside it, in the order it was
picked**. Its `line_total`, on the other hand, is still a *preview*: it is what the screen painted,
and it decides nothing — the cents are recomputed at checkout from the frozen unit price.

That split is the whole point. A set menu is not a line: it is a group of sibling lines, and how
many there are depends on how many tax rates are inside it, not on how many components were chosen.
**How the menu is split is decided once, at checkout**, against the combo catalogue; what the row
freezes is the menu's total closed price. If the order row carried an already-apportioned share,
there would be two places computing the same money and one day they would disagree.

Splitting at checkout is not a leftover, it is the law: the apportionment of art. 79.Dos weighs the
components at their market value **at the time of accrual**, and the accrual is the delivery (art.
75.Uno.1º LIVA), not the moment the waiter takes the order.

What losing the composition costs you is not subtle: the till puts the menu id in `product_id`, so a
line that loses it is taken for a catalogue line, the menu is looked up in the product catalogue, it
is not there, and **the whole sale is rejected** — the table that ordered the set menu cannot pay.

## The server decides the price, not the till

What the screen sends is a proposal. At checkout the server re-reads the trusted catalogues and
overrules the payload:

| What | Decided by |
|---|---|
| Price and cost of a line of an OPEN CHECK | its own row, frozen when the line was added |
| Price and cost of a counter-sale catalogue line | `inventory` |
| Tax rate of a line | `taxes`, resolved at checkout |
| Payment method and the name printed on the receipt | the hub's payment method catalogue |
| Discounts allowed, customer required | the TPV settings |

The rule is: **if a line claims to come from the catalogue, the catalogue wins.** A line with a
`product_id` and not marked as a service is priced from the catalogue, and an id that is not there is
rejected. If the catalogue cannot be read at all, a catalogue sale is **refused** rather than sold at
whatever price was proposed. The same rule now runs one step earlier for an open check — at the door
that writes the row — which is what makes the frozen price trustworthy.

Two doors stay open deliberately: a **free line** with no product (selling by department, typing an
amount) and a **service line**, which Sales cannot verify because it does not read the services
module.

## Every line freezes its own tax

The **base** is frozen when the line is added (see above); the **rate** is resolved at **checkout**,
and that asymmetry is deliberate. The price is what was *agreed* — the taxable base is the agreed
consideration (art. 78 LIVA). The rate is what the law had in force when the goods were *handed over*
or the service *finished*, because that is when VAT accrues (art. 75.Uno LIVA). A VAT change at
midnight moves what is declared for the table that sits down afterwards, not what was agreed with the
one already sitting.

At checkout each line stores a five-field snapshot: the tax category, the rate, the country, the
region and the rule that produced it. The rate is resolved server-side from **the hub's** country and
region — not the customer's — and the percentage the till displayed is only a preview.

Consequence: **changing a tax rate tomorrow does not change a sale from yesterday.** A document
already issued never moves.

## Gross or net is a property of the document

Whether prices include VAT is decided per sale (with a hub default in settings), not stored on the
product. The same product can be sold gross in one document and net in another.

## Retrying a checkout does not create a second sale

Every checkout carries an **idempotency key**. It identifies the *attempt to charge* — it is
generated when the payment screen opens and **reused on every retry** — not the individual HTTP
request. If the network dies after the sale was recorded, pressing charge again resolves to the very
same sale instead of ringing it up twice.

Do not generate a fresh key per retry; that defeats the whole mechanism.

## A gift line is not charged but still consumes stock

A line marked as a gift, with a reason, has zero net, zero tax and zero total, yet the stock still
goes out because the item physically left. The sale header carries the total cost of what was given
away, and the receipt prints the item as an invitation.

## Ticket or invoice is decided at the moment of sale

A sale is either a `ticket` (a simplified invoice) or an `invoice` (a full one). This is set
**atomically when the sale is completed** — there is no command to change it afterwards, on purpose.
The hub can be configured to pick `invoice` automatically when the customer has a tax id.

## Splitting and merging move rows; nothing is prorated

When a check is split, whole lines travel with their amount, their frozen tax category and their
kitchen round intact. Nothing is divided, so the two halves add up to the original **by
construction** — there is no rounding to argue about. Both totals are then recomputed from their own
live lines, never copied.

Merging is the same in reverse: unpaid lines move into the surviving check and the empty one is
voided. Already-paid lines never travel. Repeating a merge does nothing.

Splitting and merging need `sales.add_sale`, not `sales.void_sale` — it is floor service done by a
waiter, and no money disappears.

## Numbers are per-day counters

Sale numbers look like `YYYYMMDD-NNNN` and come from an atomic per-day counter, so two tills
charging at the same second cannot collide.

## Money and quantities

All amounts are **integer cents**; `1250` is 12,50 €. All quantities are **integers scaled by
1 000 000**; `500000` is half a unit. The screen converts at the human boundary and nothing else
does.
