# Sales & POS — Screens

The module contributes three tabs to the hub navigation — **Sell** (the till), **Sales** (the
history) and **Notas rápidas** (the quick-note catalogue, only for who can configure the till) —
plus a **TPV** settings tab the shell generates from the declarative settings block.

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

If the hub does not answer when you confirm (sales#451), nobody can tell yet whether the refund was
recorded, so the screen never says it failed. The hub's own «we can't tell» toast is the only toast;
the screen adds none. Instead it **finds out by itself** (sales#456): it shows «Checking whether the
refund was recorded…», keeps the button busy, and asks the hub — twice, a restarting hub is back in
seconds — whether a refund exists under the attempt's idempotency key
(`sales.refund_by_idempotency_key`):

- **recorded** → it closes exactly as a refund that answered: «Refund recorded», the reference goes
  to whoever gives back what was not money, and the sales list reloads;
- **not recorded** → «The refund was not recorded. You can refund again: it won't be recorded
  twice.» The retry reuses the same key, so a write that lands late and the retry are one document;
- **cannot ask** → the doubt stays on screen: pressing **Devolver** again won't record it twice.

The attempt's key **survives closing the screen** on that device (and a reload): it is written down
before the refund is sent and dropped only once the hub has answered. Opening the refund of that
sale again asks the hub about that key first — if it was recorded, the screen says so above what
is still left to refund and a new refund gets a new key; if not, or if the hub still does not
answer, the new attempt reuses the old key, so repeating a partial refund cannot send the money
twice. Another till does not know the key: there, check the sale before refunding again.

When that recovered refund covered lines paid another way (a voucher session), the screen that
would have given them back was closed before the hub answered (sales#462). The reopened screen
paints those lines again with their hole, the operator decides again what goes back, and a
**Give back what was paid another way** button hands the **recovered** refund document to them —
no money moves and the screen stays open. It shows only while some line says it goes back. If it
fails, or if those lines cannot even be read, the screen says «The money is back, but what was paid
another way could not be returned. Check it from its own module.»

That offer is **not lost by closing** (sales#465). If the screen is closed while the hub is still
answering and some line was set to go back at that moment, the refund still goes through but its
holes are gone with the screen, so the attempt stays pending: the till says «The refund is
recorded, but what was paid another way has not been given back yet. Open this sale's refund again
on this device to give it back.», and the next refund screen of that sale recovers the document and
offers the button. The same happens if the reopened screen is closed without pressing it, or if the
give-back failed, or if the screen is closed before it has learnt whether the session goes back.
It stops being offered once it went back, once the operator un-ticks the line and closes, once the
line says its session already came back, or when there is no line paid another way.

When the money of the sale has **already gone back entirely** (sales#492), the money half asks for
nothing: no amount boxes, no reason, no «Refund 0,00 €» button and no «Type how much goes back.»
warning. Each payment still shows «Already given back in full.» and the screen says «There is no money
left to refund on this sale.»; the only action left, when there is one, is **Give back what was
paid another way**.

That button is offered there even when **no refund was recovered** (sales#507): the money went back
from another device or through the assistant, the operator un-ticked the session and the customer
claims it later, or its give-back failed the first time. While some line says its session goes
back, the button hands the **newest refund document of the sale** to it — no money moves and no new
refund is written. If the sale's refund documents cannot be read (or there is none), nothing is
handed and the screen says «The money is back, but what was paid another way could not be
returned. Check it from its own module.»; the button stays, so it can be tried again. Once handed,
the button goes; if another line is ticked afterwards (two sessions on one ticket, one un-ticked at
first), it comes back for that line. With money still left to refund, the session goes back with
that refund's own **Refund** button instead.

Closing the refund screen, for whatever reason, reloads the sales list, so the row shows the
refund if it went through.

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

### What else a void or a full refund undoes (services#157)

Voiding a sale, or refunding it in full, can undo what another module sold on it: a voucher sold
on the ticket is voided with it, sessions already used included. The operator has to read that
**before** confirming. Both the **Void sale** window (`erp-sale-void`, an inline window that replaced
the old global alert) and the **Refund** window host the slot `sales.reversal.notice` right above
the confirm button. Each filler gets two JS properties, set before the insert: `saleId` and
`action` (`'void'` or `'refund'`; a partial refund leaves what was sold alive, and the filler says
so). It warns and never blocks or delays the window: with nobody filling it, or a registry that
fails, there is no hole and the void or refund goes on as before.

## Sell — the till

The touch point of sale. It opens **full screen**: the shell hides its own chrome and gives a
fullscreen control to the view.

The screen is two zones. **Catalogue** on the left: a horizontal strip of categories (each showing
how many products it holds) and a search box, with products as cards carrying photo, SKU, unit, name
and price. **Check** on the right: the lines of the current order, a quantity stepper on each one,
and a fixed footer with the running total and the **Cobrar** (charge) button.

On a phone the check is a drawer opened from the cart button, which shows the running total and
always sits above the tab bar (sales#412 / sales#418). The open drawer spans only what the screen
shows between the header and the tab bar — also on a low phone under the «You can't invoice yet»
strip, or a phone on its side: the total and **Cobrar** stay on screen and the lines scroll inside.
Where even that does not leave room for the first line, the drawer scrolls on its own, still above
the tab bar (sales#420) — and its footer stays pinned: what scrolls is the header and the lines,
never the total and **Cobrar**. A phone on its side (a screen 500 px tall or less) always gets this
phone till, whatever its width. When the drawer is low (24rem or less: a small phone under the
«You can't invoice yet» strip, any phone on its side) its header shrinks to one row — the check's
name, then the table/customer chips scrolling sideways — and its footer gets thinner, with
**Cobrar** over the amount still owed on two short lines so any amount fits; on a phone on its
side the footer is a single row, the total and then the actions (sales#423).

### Sell something and charge it

1. Pick a category, or search for the product by name.
2. Tap the product. It becomes a line on the check; tap again or use the stepper to raise the
   quantity.
3. **To remove a line, set its quantity to zero.** There is no separate delete.
4. Optionally assign a customer or a table — those controls appear only if `customers` / `tables` are
   installed.
5. Press **Cobrar**. Choose the payment method, and for cash enter the amount tendered; the change is
   computed for you. The **Print receipt** switch decides whether this sale's receipt is printed:
   it starts from the printing app's «print on sale» setting, and what you leave on it applies to
   this sale only — on prints even with the setting off, off prints nothing.
6. Confirm. The sale is recorded, the receipt is available, and the check closes.

The sheets the till opens — charge, discount, open price, the note on a line, supplements, combo —
always sit between the header and the tab bar, also on a low phone under the «You can't invoice yet»
strip or on a phone on its side, and they follow the screen when it scrolls. Their confirm button
(**Cobrar**, **Aplicar**…) is always on screen at the foot of the sheet; when the screen is too low
for the whole sheet, its middle (the keypad, the payment methods) scrolls behind that foot
(sales#422).

With VeriFactu on, the document carries the fiscal QR: «QR tributario:» above it, «VERI*FACTU»
under it, and a note that names the document the customer holds — «Scan to check this receipt at
the AEAT» on a receipt, «…this invoice…» on an invoice (sales#411). Once the AEAT has answered, the
note becomes its CSV code.

Requires `sales.add_sale` to build the check and `sales.take_payment` to charge it.

### Selling by weight, with or without a scale (sales#28)

An article whose unit belongs to the **mass** category of the hub's unit registry
(`inventory.units.list` → `category = 'mass'`: `kg`, `g`) is sold by weight. Nothing else has to be
configured: the till reads the unit the article already carries.

**Without a scale — this is the product, and it always works.** Tap the article and type the
quantity on the line's stepper: `0,532`. The step of the unit validates it (`increment_value`), the
line freezes its unit, and the paper prints «0,532 kg × 12,00 € / kg».

**With a scale**, the gesture is the one every till in the market uses (Square, Odoo, Clover, Toast,
Lightspeed, Glop): **tap the article first, then put it on the platter**. The weight lands on that
line by itself.

1. Tap the article. It becomes a line, as always.
2. Put it on the scale. When the platter settles, the weight becomes that line's quantity and the
   amount is recomputed.
3. Press **Cobrar** as usual.

Details that are decisions, not accidents:

- **The last open line priced by weight** is the one that takes the reading — the one just tapped.
  A line already fired to the kitchen is skipped, and a reading never creates a line: with nothing
  weighable on the check, the platter can hold whatever it likes and nothing happens.
- **The tare belongs to the scale.** What reaches the till is the net weight; the till has no
  container registry.
- **The unit is never converted.** A scale weighing in `g` against a line priced in `kg` is refused
  out loud («La báscula pesa en g y esta línea va en kg»): dividing silently is how a 1000× error
  reaches a fiscal document.
- **A weight is judged exactly like a typed quantity.** It goes through the same door, so one that
  does not fit the article's step is refused with the same message and the check is left untouched.
- **A hub without a scale is the till of today**, byte for byte. There is nothing to install, no
  setting to switch on, and no screen that changes.

Reading a scale is the **installed app**'s job (`erplora-app` → `crates/peripherals`, ADR-0196/0204);
`sales` only owns the door the measured weight comes in through.

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
- With the **Staff** app installed, the list also offers the **team** (sales#318): the professionals
  the agenda books, first and in the agenda's order, whether or not they ever sign in. Choosing one
  attributes the check and every new line to her **team record** — the same id an appointment
  carries — so walk-ins and booked services add up as one person in the per-professional close. A
  professional whose record is linked to a hub user appears **once**; a record that is terminated or
  inactive is not offered (her past lines keep her name). If the team cannot be read, the picker
  says so and still offers the people who sign in. The same list serves the professional of a
  single **line** (tap the name under it).
- A till opened from an **appointment** shows the booked professional, and that is who the sale is
  attributed to.
- The chosen person travels to the **kitchen ticket** too (`order.fired` carries `waiter_id`), and
  is what makes the per-person report (`sales.by_staff`) come back with data. A professional who is
  on the team **and** signs in goes to the kitchen as her **hub user** — the id the pass can name —
  while the sale keeps her team record.

Closing the sale returns the chip to the default: the next check does not inherit the previous
waiter.

### El cliente obligatorio se pide al COBRAR (sales#222)

Con **«Exigir cliente en cada venta»** activado (`require_customer`, ajustes del TPV), el cobro
**empieza pidiendo el cliente** en vez de terminar rechazado:

- **«Cobrar» no abre la hoja de cobro** mientras falte el cliente. El botón se ve bloqueado, pero es
  `aria-disabled` y **nunca** el `disabled` nativo (sales#58): el toque llega y **contesta** con el
  aviso, y además dispara el enganche `erp:customer-required` sobre el relleno del slot
  `sales.pos.assign` — `sales` no conoce a `customers`, solo se lo pide (ADR-0043).
- En la fila de contextos de la cuenta, donde va el cliente, aparece el chip **«Falta el cliente»**,
  que pide el cliente igual al tocarlo. Un bloqueo cuya única señal es un aviso que se va no lo puede
  resolver nadie.
- **La regla sigue siendo del servidor**: `sales.complete_sale` rechaza con `sales.customer_required`
  desde sus propias `reads`. Esto es la primera cerradura, no la única — `confirm()` la revalida,
  porque al cobro se llega también por atajo sin pasar por «Cobrar».
- Sin el ajuste, el TPV se comporta exactamente igual que antes: un comercio que no lo pidió no se
  entera de que esto existe.
- Si la app **Clientes** no está instalada, no hay cliente que elegir en esta pantalla: el aviso lo
  dice nombrando la app, como con la app de impuestos (sales#185).

Es lo que hace el mercado: en Odoo (`pos_required_customer`) el aviso salta al pulsar **Pago**; en
Shopify POS la información obligatoria se pide «antes de completar el cobro», no al montar el
carrito; y los *service prompts* de Toast bloquean el paso de pago hasta cumplirse. Lo que **no** se
hace en ningún sitio es un modal al abrir el TPV.

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
- Parking a check, leaving it at its table or deleting it also clears its customer from the screen:
  the next check starts with no customer (and offers none of her vouchers). Customers gives her back
  when the parked or table check is resumed, from the drawer or by touching its table.
- Give a check an editable title to recognise it later ("Mesa 4", "Ana — terraza", "15:07"). It is
  just a label; nothing interprets it.
- Switching to another check (from the drawer or by touching a table) with a check without a table
  in front asks **Park** or **Delete**; a check with a table is left at its table. If the hub
  refuses any of the three, nothing happens: the check stays on screen as it was, the switch does
  not take place, and the reason is shown where you are looking (the cart, the open checks drawer
  or the page). A refused name in the park prompt keeps the prompt open with what you typed and the
  reason inside it.

### Fire an order to the kitchen

Available only when `kitchen` is installed — a **Cuenta / Comanda actual** segment appears.

1. Add the lines the customer ordered.
2. Switch to **Comanda actual**. It shows only the lines not yet sent.
3. Press **Enviar comanda**. Only those pending lines are fired; each press is a new round.
4. Previously fired rounds and their status stay visible in the order history.

The kitchen ticket is born when the waiter **takes** the order, not when the customer pays. While
there are pending lines you cannot park the check or switch to another one, and the table cannot be
changed.

**Voiding a line already sent** (sales#521). A fired line is locked — no quantity, note, discount or
comp — but it carries a ⊗ **Anular este artículo** button. It opens a sheet with four one-tap
reasons («Error al pedir», «El cliente lo cambia», «Agotado», «Pedido dos veces») and a free text
box; **Anular artículo** stays disabled until there is a reason. Voiding needs `sales.void_sale`
(the same permission as voiding a whole check), so an employee gets the manager's PIN prompt. The
line leaves the check, the provisional total drops, and the order row keeps the reason, who approved
it and when. This is what Toast, Square, TouchBistro, Lightspeed K-Series and LS Central do: a sent
item is voided with a reason and a manager, never silently deleted. On the server,
`sales.order.void_line` refuses a line not sent yet, already paid or voided, on a closed check, or
without a reason (`sales.order_line_not_voidable`), and `sales.order.remove_line` now refuses a sent
line (`sales.order_line_not_removable`) instead of answering ok and removing nothing. A void raises
`sales.order.line_removed` and **`sales.order.line_voided`** (`order_id`, `line_id`, `reason`). The
kitchen display strikes that dish with «Voided» and the reason, and the round goes on with what is
left (kitchen#161). The kitchen printer that printed the round prints a void slip for that dish
(«VOID ITEM · Table 4» — «PLATO ANULADO · Mesa 4» in Spanish — with the dish at a negative
quantity).

**Charging a check with pending lines sends them first** (sales#439). The **Cobrar** sheet says so
before the tap — «El producto pendiente de la comanda se enviará a cocina al cobrar» (or «Los N
productos pendientes…») — and **Cobrar** fires that last round before closing the sale, as Odoo,
Square and Toast do. If that send fails, **nothing is charged**: the sheet stays open with «No se ha
podido enviar la comanda a cocina, así que no se ha cobrado» so the cashier can try again. Once the
check is closed there is no order left to send it from, so charging anyway would lose the order.
If the round was already on its way (the **Enviar comanda** button or the table picker a moment
before), Charge waits for it instead of sending it twice — and anything added while it was on its
way goes in its own round before the check closes.

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

A line is selected by tapping **the line itself**. The buttons inside it — comp, note, discount, the
quantity stepper and the professional — only do their own job and never select or unselect the line
(sales#449): with nothing selected, **Charge** charges the whole check. A selected line taken off the check
(the stepper down to 0) leaves the selection, and with a single line left there is nothing to split.

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

**Splitting that line splits what the check holds now, or nothing** (sales#554). «Split into N
lines» waits for the check like every other change; if, meanwhile, another device changed that
line's quantity, comp or discount, the split is refused (`sales.order_changed`) instead of cutting
the stale row: no unit is lost or invented. The sheet says so, reloads the check, and a retry that
goes through clears the warning.

**And when the line leaves, the till says so** (services#84). Take a covered line out of the cart —
or cancel the whole ticket — and the till stops charging it, but whoever covered it is still holding
something nobody told it to let go of: in `services` that was a voucher session left spent until a
deadline swept it, up to a day later. So the two server-side gestures announce the fact:
`sales.order.remove_line` raises **`sales.order.line_removed`** (`order_id` + `line_id`) and
`sales.order.void` raises **`sales.order.voided`** (`order_id`). It is an announcement, never a
call: `sales` still knows nothing about vouchers, and the filler cannot do it itself because it is
mounted per line — it is torn down *with* the line and cannot tell that apart from the tear-down
that happens when the sheet closes, where the hold must survive. Announcing it also covers what no
screen could: a cart cleared from another device, a tablet that died, a ticket voided with the sheet
closed.

### The note on a line (sales#156 / sales#206)

The selected line carries a **Nota** button, next to the supplements and the comp. It opens a sheet
with a free keyboard: what is typed reaches the kitchen on the docket and is frozen on the sale when
the check is charged. Reopening it shows the note the line already has, so correcting it does not
mean retyping the whole allergy. Emptying it removes it — a note that cannot be removed leaves the
kitchen cooking to a request that was cancelled.

Above the keyboard, the sheet paints the **quick notes** the business configured (see *Notas
rápidas* below) as chips:

- Tapping a chip **adds** its text to what is in the box, joined by «, ». It never replaces:
  «poco hecho» + «sin sal» is one request and the line carries one note.
- Tapping it again **takes it out**, so the same instruction is never printed twice. The chips that
  are in the note are shown filled in.
- The keyboard keeps working before and after any chip.
- With **no** quick notes configured, no chip is painted and the sheet is the plain one. While they
  load, or if the read fails, the sheet says so and the keyboard still works.

The chips are read with `sales.quick_notes.list`, which only needs `sales.view_sale`: the people
tapping them are the `cashier` and the `employee`, and neither has `sales.manage_settings`.

### Merge two checks

When two tables that both ordered are merged, every unpaid line of one check moves into the other and
the empty one is voided. Lines are moved, never re-created. Doing it twice changes nothing. The merge
is announced with `sales.order.merged` (`from_order_id`, `to_order_id`): the kitchen hands the rounds
fired from the absorbed check to the one that stays, so they close when that check is charged
(kitchen#162).

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
`sales.void_sale` and opens the **Void sale** window: a mandatory reason, what other modules undo
with it (slot `sales.reversal.notice`), and **Void** / **Cancel**; a refusal is read in the window.

**Reprint** (the printer icon on each row, also on the cards on a phone) sends that sale's receipt
to the receipt printer without opening it (sales#347). It is a copy: the paper says «duplicado»,
and it carries the invoice number and the VeriFactu QR, waiting a few seconds for them if the sale
was just charged. If no printer takes it, a notice says so — the same as the Print button of the
document. While it is on its way the icon of that row turns into a spinner, so two taps never make two copies.

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

The till itself never reads this query. It reads the whole operational policy — every setting in
the table below — through **`sales.pos_settings.get`**, which only needs `sales.view_sale`, and the
receipt viewer reads it from there too. Reading it through `sales.settings.get` left the till blind
for the `cashier` and `employee` roles, which do not have `sales.manage_settings`: a shop that had
switched card-only, no discounts, no parked tickets or net prices handed the person at the counter
a till with every one of those back at the factory default (sales#203). Same reason
`sales.business.get` exists apart (sales#180).

The counter read is a NARROWER door, never a wider one: read-only, no `expose_api`, and it does not
carry the settings row's `id` — **writing** stays on `sales.settings.update` behind
`sales.manage_settings`.

| Setting | Meaning | Default |
|---|---|---|
| Permitir efectivo / tarjeta / transferencia | Which payment methods the till offers | cash on, card on, transfer off |
| Mostrar productos en el TPV | Show the `inventory` catalogue in the grid. Off = the till sells services and free-price lines only | On |
| Mostrar servicios en el TPV | Show the `services` catalogue in the grid. Off = the till sells products only | On |
| Exigir cliente en cada venta | El TPV pide el cliente al pulsar «Cobrar» y el servidor rechaza la venta sin él (sales#222) | Off |
| Permitir descuentos | Allow discounts at the till | On |
| Descuento máximo que puede aplicar solo quien cobra, por descuento (%) | Above it the till asks for the manager's PIN (sales#269). Each discount is checked on its own — a line's, the ticket's, a fixed amount — so stacked discounts can save the customer more than the cap (sales#287) | 100 = no limit |
| Permitir tiques aparcados | Allow parking checks | On |
| Precios con IVA incluido por defecto | Whether prices are gross or net by default | On |
| Emitir factura si el cliente tiene NIF | Auto-issue a full invoice when the customer has a tax id | Off |
| Documento por defecto | `ticket` (simplified invoice) or `invoice` (full invoice) | ticket |
| Cabecera / pie del recibo, imagen de pie | Free text and image printed on the receipt | empty |
| URL y texto del QR promocional | A marketing QR on the receipt — reviews, social, website. Empty = no QR | empty |

## Notas rápidas — the quick-note catalogue

A tab of its own, served only to whoever holds `sales.manage_settings` (`navigation[].permission`,
hub#1052): the cashier is never shown a door that is locked. It is the same CRUD as every catalogue
of the hub — the **+** opens the create panel, tapping a row (or its **Editar**) pre-fills the same
form, and **Eliminar** confirms before it runs.

| Field | Meaning | Default |
|---|---|---|
| Nota | The text of the chip, up to 80 characters. It is what the kitchen reads | — |
| Posición | The order the chips are painted in at the till. Ties break by text | 0 |

Deleting is a **soft delete**: the chip stops being offered, and the notes already typed on open
checks and on charged sales keep their text — they are text on their own rows and do not point at
this catalogue. Editing or deleting a note that is no longer there fails with
`sales.quick_note_not_found` instead of reporting a change it did not make.

Where this comes from: of the eight tills surveyed, only **Lightspeed Restaurant (K-Series)** ships
preconfigured notes as a feature — created in the Back Office (add, edit, delete, reorder), applied
with one tap on the POS, printed on the docket and shown on the KDS. Toast, Square, Clover, Revel,
Simphony and SumUp offer free text only, Odoo needs its configuration or an app, and Shopify POS
needs an app. So this screen copies Lightspeed and nobody else.
