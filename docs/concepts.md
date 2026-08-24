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

## An open check remembers what was CHOSEN, never what it costs

The row of an open check is a **working row**. It carries everything the checkout cannot re-derive
after a reload — the tax category, the cost, whether it is a service, the product category the
kitchen routes by, the line discount, the frozen unit context, the supplements chosen, and **which
menu the line came from and what was picked inside it, in the order it was picked**. Its
`line_total`, on the other hand, is a *preview*: it is what the screen painted, and it decides
nothing.

That split is the whole point. A set menu is not a line: it is a group of sibling lines, and how
many there are depends on how many tax rates are inside it, not on how many components were chosen.
That is decided **once**, at checkout, against the combo catalogue — so parking a check and
resuming it half an hour later charges exactly the same cents as charging it in one go. If the
order row carried an already-apportioned share, there would be two places computing the same money
and one day they would disagree.

What that costs you if it is missing is not subtle: the till puts the menu id in `product_id`, so a
line that loses its composition is taken for a catalogue line, the menu is looked up in the product
catalogue, it is not there, and **the whole sale is rejected** — the table that ordered the set menu
cannot pay.

## The server decides the price, not the till

What the screen sends is a proposal. At checkout the server re-reads four trusted catalogues and
overrules the payload:

| What | Decided by |
|---|---|
| Price and cost of a catalogue line | `inventory` |
| Tax rate of a line | `taxes` |
| Payment method and the name printed on the receipt | the hub's payment method catalogue |
| Discounts allowed, customer required | the TPV settings |

The rule is: **if a line claims to come from the catalogue, the catalogue wins.** A line with a
`product_id` and not marked as a service is priced from the catalogue, and an id that is not there is
rejected. If the catalogue cannot be read at all, a catalogue sale is **refused** rather than sold at
whatever price was proposed.

Two doors stay open deliberately: a **free line** with no product (selling by department, typing an
amount) and a **service line**, which Sales cannot verify because it does not read the services
module.

## Every line freezes its own tax

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
