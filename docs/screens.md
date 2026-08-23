# Sales & POS — Screens

The module contributes two tabs to the hub navigation — **Vender** (the till) and **Sales** (the
history) — plus a **TPV** settings tab the shell generates from the declarative settings block.

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

### Merge two checks

When two tables that both ordered are merged, every unpaid line of one check moves into the other and
the empty one is voided. Lines are moved, never re-created. Doing it twice changes nothing.

## Sales — the history

The list of recorded sales (`sales.list`, 50 rows per page). Requires `sales.view_sale`.

- **Search** by sale number, payment method or customer name.
- **Sort** by number, status, total, tax, payment method, customer, channel, professional or date.
  Default: date, newest first.
- **Filter** by sale number, status, total range, tax range, payment method, customer, channel,
  professional or date range.

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
