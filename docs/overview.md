# Sales & POS — Overview

## What this module does

Sales is the transactional core of the point of sale. It owns two things and only two: **open checks
(orders)** with their lines, and the **completed sales** those checks turn into when someone pays. It
decides the money — line totals, discounts, tax, change, the receipt number — and announces the
result to the rest of the hub with `sale.completed`, which is the canonical end-of-sale event of the
whole product.

## What this module does NOT do

- **It does not know about tables.** A sale carries no table. Seating, moving and merging tables
  belongs to `tables`; Sales only owns the lines and the amounts.
- **It does not own customers.** A customer travels into a sale as a **fiscal snapshot** (name, tax
  id, address) frozen at checkout — not as a link. Which customer owns which check is recorded by
  `customers`.
- **It does not issue invoices and it does not talk to the tax authority.** It produces a sale;
  `invoice` turns it into a fiscal document and `verifactu` reports it.
- **It does not move stock.** It emits `sale.completed`; `inventory` decides what to subtract.
- **It does not print.** It publishes the receipt data; `printing` puts it on paper.
- **It does not set prices.** The price of a catalogue line is read from `inventory` at checkout, not
  taken from what the screen sent.
- **It does not split by amount or by diner.** Splitting moves whole lines. Splitting a quantity
  inside one line is not implemented. <!-- TODO: verify -->

## Modules it connects to

**Depends on `inventory` and `taxes`** — installing Sales installs both automatically. It needs
`inventory` for the authoritative price of every catalogue line and `taxes` for the authoritative
rate of every line.

**Events it emits**

| Event | When | Carries |
|---|---|---|
| `sale.completed` | a sale is completed | sale id, order id and number, totals, tax amount, the lines, customer, `staff_id` |
| `sale.voided` | a sale is voided (sales#26: emitted exactly once; a second void of the same sale is refused) | sale id, sale number, reason, voided_by, voided_at, total, payment method, order id, document type |
| `order.fired` | an open check is fired to production | order id, an opaque label, channel, the lines of that round |
| `sales.order.merged` | two open checks are merged (kitchen#162); a replay raises it again, so a listener checks the absorbed check is voided | `from_order_id` (absorbed, now voided), `to_order_id` (the one that stays) |
| `sales.sale.created_from_appointment` | a sale is completed carrying an `appointment_id` | sale id, appointment id, staff id, total |

`sales.sale.created_from_appointment` is **additive** — a sale born from an appointment emits both it
and `sale.completed`.

**Events it listens to**

| Event | Command | What it does |
|---|---|---|
| `customer.merged` (from `customers`) | `sales._on_customer_merged` | When two customer sheets are merged, every sale of the absorbed sheet (any status, live or deleted) moves to the surviving one, in this hub only. What was issued is not rewritten: the name printed on the ticket or invoice, its number and its amounts stay exactly as they were filed (customers#86) |

**Who reacts to `sale.completed`**: `inventory` (subtract stock), `customers` (loyalty),
`cash_register` (till reconciliation), `invoice` / `verifactu` (fiscal record), `kitchen`. Each is
documented in its own module.

**The POS screen hosts other modules.** Four named slots let installed modules add capability
without Sales knowing they exist:

| Modules installed | What the POS gains |
|---|---|
| `sales` alone | catalogue, open and parked checks, lines, payment |
| `+ customers` | search, assign or remove a customer |
| `+ tables` | assign, move and merge a table and its service session |
| `+ kitchen` | "current order" view, fire only pending lines, order history and status |
| `+ services` | a per-LINE tender in the checkout: a prepaid voucher covers one service line whole |

These are independent. Turning off `tables` does not turn off Kitchen — a takeaway pizzeria runs
`sales + kitchen` with no dining room. Records of a deactivated module are kept; only its surface
disappears. Because the POS resolves its slots when it mounts, after installing or removing one of
these modules you must leave the screen and come back for it to appear.

## Where its numbers come from

- **All money is integer cents** (ADR-0123). `total`, `subtotal`, `tax_amount`, `unit_price`,
  `line_total`, `amount_tendered` and change are cents: `1250` is 12,50 €.
- **All quantities are fixed-point integers scaled by 1 000 000** (ADR-0147), so half a kilo is
  `500000`.
- **Sale numbers are per-day counters**, `YYYYMMDD-NNNN`, produced atomically so two tills cannot
  take the same number. The four digits are a **minimum width**: sale 10.000 of a day is
  `YYYYMMDD-10000` and nothing already issued is rewritten (sales#241). The day is the
  **business day** in the hub's time zone, and so is every «today» (sales#323).
