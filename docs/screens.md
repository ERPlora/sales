# Sales & POS — Screens

The module contributes two tabs to the hub navigation — **Vender** (the till) and **Sales** (the
history) — plus a **TPV** settings tab the shell generates from the declarative settings block.

## Refunding a sale paid with several methods

From **Sales**, the `…` menu of a completed sale offers **Devolver** (permission `sales.refund_sale`
— manager and admin, never cashier: a refund takes money out of the drawer). It opens a screen with
one card per way the sale was paid.

Each card carries what that tender was charged, what it has already given back, and what is still
refundable. The screen **proposes** the full refund split proportionally, and every amount is
editable — the proposal is a starting point, not a cage.

Two things it does that most tills do not:

* **A tender whose payment method no longer exists is marked with its reason**, not left to blow up
  at confirm. Its money is still refundable: a **Devolver por** selector appears so you send it back
  through a method that does work.
* **No tender can give back more than it took.** If you go over, the screen says *which* one, and
  with which numbers, before you press anything.

The button stays pressable while the refund is blocked — pressing it tells you what is missing. A
sale carrying a full invoice **can** be refunded (unlike voiding it): the refund is the economic
fact, and the credit note is its document, issued from `invoice`.

When the last cent goes back, the sale's status becomes **Devuelta**.

### What was not paid in money goes back too (sales#166 / ADR-0386)

The refund screen hosts a second slot, `sales.refund.tender` — the mirror of the till's
`sales.pos.tender`. Under the split, the lines an **external tender** paid for get a card of their
own with a hole in it: they cost no money, so they are not part of the split, and without that hole
the only way to give a prepaid session back would be for the operator to remember to walk into the
voucher module afterwards.

`sales` cannot do it alone, and that is the whole point. `sales_sale_item.is_covered` is **opaque by
design**: it says another tender already paid the line, never which one. Reading the other module
from here would break exactly the modularity that lets a hub without it keep charging and refunding.

**The contract of the host** (documented, not validated — a slot is a screen's implicit contract):

| Direction | What travels |
|---|---|
| host → filler, **JS properties set before the element enters the DOM** | `sale-id` · `line-ref` (`sales_sale_item.id`) · `service-id` (the line's `product_id`) · `line-index` |
| filler → host, `CustomEvent` (bubbles + composed) | `erp:tender-refund-armed` `{ lineRef, warning? }` · `erp:tender-refund-disarmed` `{ lineRef }` |
| host → filler, once the refund document exists | `erp:tender-refund-commit` `{ saleId, refundId, refundRef, waitFor(promise) }`, plus `refundId` / `refundRef` as properties |

Four details that are not cosmetic:

* **The properties are set before the insert.** The filler reads in `connectedCallback`; inserting
  first would make it ask about an empty sale and paint «nothing to give back here» over a session
  that does go back.
* **`line-index`** is the 0-based ordinal of the line among the covered lines of the **same
  service**. A mother and her daughter get the same haircut on one ticket: two covered lines, two
  sessions. A settled redemption keeps the **order** line id, and a sale item has no column pointing
  back at it, so without the ordinal both holes would claim the first session.
* **`refundRef` is the refund document's stable id**, which `sales.refund` already returns and
  `idempotency_key` keeps stable across retries — it is the filler's idempotency key.
* **The screen waits.** `waitFor(promise)` works like `respondWith`: whoever calls it delays the
  close until it settles. Closing at confirm would unmount the filler mid-command and leave the
  session spent with nobody at the counter able to give it back. If what was promised fails, the
  money refund **stands** and the screen says the other side did not complete.

A warning the filler sends with `erp:tender-refund-armed` is painted **next to the confirm button**,
because the line's hole can be off-screen when the thumb is already on **Devolver**. It warns; it
never blocks — an expired voucher does not veto undoing a past act.

With nobody filling the slot there is no section, no header, no empty hole, and no extra call: the
refund travels field for field as it did before.

## Vender — the till

The touch point of sale. It opens **full screen**: the shell hides its own chrome and gives a
fullscreen control to the view.

The screen is two zones. **Catalogue** on the left: a horizontal strip of categories (each showing
how many products it holds) and a search box, with products as cards carrying photo, SKU, unit, name
and price. **Check** on the right: the lines of the current order, a quantity stepper on each one,
and a fixed footer with the running total and the **Cobrar** (charge) button.

### Sell something and charge it

1. Pick a category, or search for the product by name.
2. Tap the product. It becomes a line on the check; tap again or use the stepper to raise the
   quantity.
3. **To remove a line, set its quantity to zero.** There is no separate delete.
4. Optionally assign a customer or a table — those controls appear only if `customers` / `tables` are
   installed.
5. Press **Cobrar**. Choose the payment method, and for cash enter the amount tendered; the change is
   computed for you.
6. Confirm. The sale is recorded, the receipt is available, and the check closes.

Requires `sales.add_sale` to build the check and `sales.take_payment` to charge it.

### Who is serving this check (sales#179)

Next to the table and customer chips there is a **«Atiende …»** chip. It is always there, even on a
counter sale: without it nobody knows the sale is attributed to anyone, and the check cannot be
transferred.

- By **default** it reads «Atiende yo» and the till sends **no** `staff_id`. The attribution is a
  SERVER decision: `sales.complete_sale` writes whoever holds the session (`current_user_id`), the
  same id it already writes into `employee_id`. The browser never invents it.
- Tap the chip to **transfer the check** to somebody else. The list is the hub's own people
  (`hub.users.list`, the core namespace — personnel belongs to the hub, not to the `staff` module,
  so this works in a hub without it). Choosing **«Yo (quien tenga la sesión)»** hands it back to the
  default.
- A till opened from an **appointment** shows the booked professional, and that is who the sale is
  attributed to.
- The chosen person travels to the **kitchen ticket** too (`order.fired` carries `waiter_id`), and
  is what makes the per-person report (`sales.by_staff`) come back with data.

Closing the sale returns the chip to the default: the next check does not inherit the previous
waiter.

### An item the sale could not charge (sales#74 / sales#58)

A catalogue line the checkout would reject — it carries no `tax_category_key`, or its category
resolves no rate in the hub's tax catalogue — is **never hidden and never inert**:

- the tile is `aria-disabled="true"`, **not** natively `disabled`. On Ionic `disabled` renders
  `<button disabled>` and applies `pointer-events: none`, so on a POS touchscreen the tap reaches
  nothing at all — no handler, no message, no log — and the whole grid reads as a broken till;
- the tile carries a **badge with words** (`ui.notSellableBadge`), on top of the dashed border and
  the warning mark: colour alone is not a message;
- **tapping it answers.** Nothing is added, and the full reason is painted in a notice above the
  grid (plus a best-effort toast through the shell). The notice clears as soon as a sellable item
  goes in — it is about the last tap, not a permanent banner.

The market settles this: Square and Toast paint the blocked state on the tile itself, Shopify POS
and Dynamics 365 Commerce answer the tap with the reason instead of swallowing it, and NN/g and MDN
both say a native `disabled` is the wrong carrier for a state that still needs explaining. What is
deliberately **not** here: warning the manager up front that the catalogue has unconfigured items
(that belongs to catalogue/cash-open, tracked separately).

A taxes **outage** is a different incident: if the tax catalogue never arrived, a categorised item
is not marked broken — the handler is the net, and charging comes first.

### Park a check and pick it up later

- The action bar has **Aparcar** (park), which becomes **Dejar en la mesa** (leave on the table) when
  a table is assigned.
- A parked check waits in the **open checks** drawer. A table check stays attached to its table and
  can be resumed from the table or from that drawer.
- Give a check an editable title to recognise it later ("Mesa 4", "Ana — terraza", "15:07"). It is
  just a label; nothing interprets it.

### Fire an order to the kitchen

Available only when `kitchen` is installed — a **Cuenta / Comanda actual** segment appears.

1. Add the lines the customer ordered.
2. Switch to **Comanda actual**. It shows only the lines not yet sent.
3. Press **Enviar comanda**. Only those pending lines are fired; each press is a new round.
4. Previously fired rounds and their status stay visible in the order history.

The kitchen ticket is born when the waiter **takes** the order, not when the customer pays. While
there are pending lines you cannot park the check or switch to another one, and the table cannot be
changed.

### Split a check

1. On the floor, open a second check on the table (this is driven by `tables`).
2. Mark the lines that move to the new check — the same marking used to charge part of a bill.
3. The lines **move as whole rows**: their amount, their frozen tax category and their kitchen round
   travel with them. Nothing is prorated, so the two halves add up to the original to the cent.
4. Charge each half separately. A line already fired to the kitchen does not go back to "pending", so
   nothing is cooked twice.

### Charge part of a check

Select the lines this person is paying for and charge them. Those lines are marked as paid and linked
to the sale that charged them; the check **stays open** with the rest. One order can produce several
sales this way. Selection is **per whole line** today.

### A line somebody already paid for (sales#162 / ADR-0386)

The checkout hosts one more slot, `sales.pos.tender`, mounted **per line** rather than per ticket.
A prepaid voucher is N uses of concrete services, not a wallet, so it covers a service **line**
whole or not at all, and whatever it does not cover is charged with its own payment method.

What the till does is host the slot and do the arithmetic. It offers it on the service lines of the
charge when a customer is assigned, hands the filler four values (`customer-id`, `service-id`,
`checkout-ref`, `line-ref`) and listens for two events: the line stops being charged, or it counts
again. What is on offer there — which voucher, how many sessions are left afterwards, why that one
— belongs to the module that provides the slot. **Sales never learns what a voucher is**, and a hub
without that module sees the checkout it always had: no calls, no empty row.

A confirmed redemption leaves the line **on the ticket at 0,00 € with «Ya pagado» next to it**, not
off it: the customer did get the haircut. It is neither a discount (the business gave nothing away
— it was paid when the voucher was sold) nor a comp, and the paper says so. Fiscally the record
came out when the voucher was sold, so redeeming it issues no second document.

A line of more than one is **not** offered: one redemption covers one line and spends one session,
so «Corte × 3» would hand out three sessions for one. The screen says that instead of hiding.

### Merge two checks

When two tables that both ordered are merged, every unpaid line of one check moves into the other and
the empty one is voided. Lines are moved, never re-created. Doing it twice changes nothing.

## Sales — the history

The list of recorded sales (`sales.list`, 50 rows per page). Requires `sales.view_sale`.

- **Search** by sale number, payment method or customer name. The search matches what the row
  STORES, so a factory method is matched by its canonical name (`Cash`, `Card`) — filter by payment
  method instead to search it in your own language.
- **Sort** by number, status, total, tax, payment method, customer, channel, professional or date.
  Default: date, newest first.
- **Filter** by sale number, status, total range, tax range, payment method, customer, channel,
  professional or date range. Status and payment method are **pickers**: they show the label you see
  in the cell and send the value the row stores, so a Spanish hub filters «Efectivo» and gets the
  rows written as `Cash` (sales#181).

Open a sale to see its full detail and its lines. From here you can **void** a sale — see
[concepts.md](concepts.md) for what that means and why you cannot simply edit it. Voiding requires
`sales.void_sale`.

## Reports the module publishes

Backed by real queries, all needing `sales.view_reports`:

| Widget | Shows |
|---|---|
| Today's sales | Amount sold today |
| Today's tickets | Number of completed tickets today |
| Sales, last 7 days | A bar per day for the last seven days |
| Recent activity | The last eight sales |

They refresh by themselves on `sale.completed` and `sale.voided`.

There is also a **per-professional breakdown** (`sales.by_staff`) over a date range: number of sales
and gross, net and tax totals per `staff_id`, in cents. It is the sales half of the per-professional
day close; the commission rate comes from `staff`.

## TPV — settings

Generated by the shell from the settings schema. Requires `sales.manage_settings`.

| Setting | Meaning | Default |
|---|---|---|
| Permitir efectivo / tarjeta / transferencia | Which payment methods the till offers | cash on, card on, transfer off |
| Mostrar productos en el TPV | Show catalogue products | On |
| Mostrar servicios en el TPV | Show services | Off |
| Exigir cliente en cada venta | Refuse a sale with no customer | Off |
| Permitir descuentos | Allow discounts at the till | On |
| Permitir tiques aparcados | Allow parking checks | On |
| Precios con IVA incluido por defecto | Whether prices are gross or net by default | On |
| Emitir factura si el cliente tiene NIF | Auto-issue a full invoice when the customer has a tax id | Off |
| Documento por defecto | `ticket` (simplified invoice) or `invoice` (full invoice) | ticket |
| Cabecera / pie del recibo, imagen de pie | Free text and image printed on the receipt | empty |
| URL y texto del QR promocional | A marketing QR on the receipt — reviews, social, website. Empty = no QR | empty |
