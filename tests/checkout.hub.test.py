#!/usr/bin/env python3
"""The checkout of `sales`, against the REAL kernel — ported from the hub's `sales_e2e.rs`
(ERPlora/hub#1264, contract «El Hub se CIERRA como KERNEL» §5: the module proves its own
behaviour; the hub keeps only the conformance of its fixture).

`sales.complete_sale` is a Tier 2 handler: it runs inside the runtime, with the ids the host
minted, the `reads` the dispatcher pre-loaded (the tax catalogue, the payment methods, the
idempotency probe) and the transaction the kernel wraps around its operations. So the only place
its promises can be checked is a running hub, through `POST /api/command` and `POST /api/query`.
Every number below is the one the hub's e2e asserted, in cents (ADR-0007/0123) and in 10^6
fixed-point quantities (ADR-0147):

  1. A charge writes the header, its lines, its payment leg and bumps the day's counter —
     `operations` = 5 (ADR-0386: the leg exists even for a single tender), the sale is readable by
     the id the runtime answered (`new_ids[0]`), and the line-level VAT is split from a tax-included
     price (2 × 1,21 € at 21 % → net 200, tax 42).
  2. The sale number is atomic and sequential within the day: the next charge is N + 1.
  3. The SAME charge attempt retried is a clean no-op (sales#20): one sale, and the retry answers
     the id of the first — the cashier's tablet may resend, the customer never pays twice.
  4. A quantity off the unit's increment grid is REFUSED with `sales.quantity_off_grid`
     (ADR-0147 §2.2: the increment validates, it never rounds) and NOTHING is written — the code,
     not the sentence (ADR-0398 §6; sales#201 is the regression this used to miss).
  5. Half a kilo costs half (one HALF_UP per line, ADR-0123) and the line freezes the fixed-point
     quantity and its unit.
  6. Every sale says WHO attended (sales#179/#196): the named professional wins, the unnamed
     counter sale goes to the session user, and `sales.by_staff` finds both — bounded by its range.
  7. A sale created from an appointment carries the professional and the appointment, and emits
     `sales.sale.created_from_appointment` with both, so `appointments` can mark it converted in
     ITS listener (sales never touches appointments).

Where an assertion of the old e2e belonged to ANOTHER module it is not here: what `inventory`
does with `sale.completed` (stock) and what `customers` does with it (purchase ledger) are those
modules' batteries. What IS here is the sales half of that seam — the event is emitted and carries
its totals, read through `GET /api/hub/events/shape` (hub#715), which samples the newest event.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on
its own: without a runtime it fails, it does not skip.
"""

import sys
import time
import uuid

import hub_harness
from hub_harness import (
    ONE,
    Hub,
    cash_method_id,
    cents,
    ensure_business_identity,
    key,
    sale_by_key,
    wait_until,
)

#: One relay tick, plus slack. A listener arrives through the outbox, which the server ticks once a
#: second; the only way to assert that a retry created NO second invoice is to give the relay time
#: to have created one and then look (`hub_harness.wait_until` can only wait FOR something).
RELAY_TICK = 2.5


def sale_number_suffix(sale_number: str) -> int:
    """`S-20260829-0007` → 7: the atomic per-day counter is the last dash-separated group."""
    return int(sale_number.rsplit("-", 1)[1])


def settled_invoice_total(hub: Hub) -> int:
    """`invoice.list`'s total once it has stopped moving — the only honest baseline for a NEGATIVE.

    Every completed sale becomes an invoice asynchronously, so at any instant this battery has a
    tail of them still in flight. Reading the total mid-drain and then blaming the growth on the
    retry is exactly the false red the runner warns about (`invoice/tests/from_sale.hub.test.py`
    reading N+2 where it asserts N+1, `scripts/ci/run-module-hub-batteries.sh`)."""
    seen = hub.page("invoice.list")["total"]
    for _ in range(20):
        time.sleep(RELAY_TICK)
        again = hub.page("invoice.list")["total"]
        if again == seen:
            return seen
        seen = again
    return seen

def test_a_charge_writes_header_lines_and_payment(hub: Hub, cash: str) -> str:
    print("\n1 · complete_sale writes the header, the lines and the payment leg")
    k = key("header-lines")
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": k,
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": 2000,
            "customer_name": "Bar Manolo",
            "items": [
                {
                    "product_name": "Café",
                    "price": 121,
                    "quantity": 2 * ONE,
                    "tax_rate": 21.0,
                },
                {
                    "product_name": "Agua",
                    "price": 110,
                    "quantity": ONE,
                    "tax_rate": 10.0,
                },
            ],
        },
    )
    # counter + sale + 2 lines + 1 payment leg (ADR-0386 / sales#158)
    hub.check("operations of a two-line cash sale", out.get("operations"), 5)
    sale_id = (out.get("new_ids") or [None])[0]
    hub.check_true(
        "new_ids[0] names the sale",
        isinstance(sale_id, str) and sale_id != "",
        str(out),
    )

    sale = hub.query("sales.get", {"sale_id": sale_id})
    hub.check("the sale is readable by that id", len(sale), 1)
    sale = sale[0] if sale else {}
    hub.check("total = 2 × 1,21 € + 1,10 € (cents)", cents(sale.get("total")), 352)
    hub.check("status", sale.get("status"), "completed")
    hub.check(
        "the idempotency key resolves to this sale",
        [r["id"] for r in sale_by_key(hub, k)],
        [sale_id],
    )
    number = sale.get("sale_number") or ""
    hub.check_true(
        "sale_number carries the per-day counter",
        number.rsplit("-", 1)[-1].isdigit(),
        number,
    )

    payments = hub.query("sales.payments", {"sale_id": sale_id})
    hub.check("a single-tender sale still has its payment leg", len(payments), 1)
    leg = payments[0] if payments else {}
    hub.check("leg amount", cents(leg.get("amount")), 352)
    hub.check("leg method type", leg.get("payment_method_type"), "cash")
    hub.check("leg tendered", cents(leg.get("amount_tendered")), 2000)
    hub.check("change goes to the cash leg", cents(leg.get("change_due")), 1648)

    lines = hub.query("sales.lines", {"sale_id": sale_id})
    hub.check("two lines", len(lines), 2)
    cafe = next((l for l in lines if l.get("product_name") == "Café"), {})
    hub.check("Café net (242 / 1.21)", cents(cafe.get("net_amount")), 200)
    hub.check("Café tax", cents(cafe.get("tax_amount")), 42)

    # The event the rest of the hub composes on: emitted with the totals, sampled from THIS sale.
    total = hub.event_field("sale.completed", "total")
    hub.check_true(
        "sale.completed was emitted with a `total`",
        total is not None,
        str(hub.event_shape("sale.completed")),
    )
    if total is not None:
        hub.check(
            "sale.completed.total of the newest event", cents(total.get("sample")), 352
        )
    shape = hub.event_shape("sale.completed") or {}
    hub.check_true(
        "sale.completed is declared by sales",
        "sales" in shape.get("declared_by", []),
        str(shape.get("declared_by")),
    )
    return number


def test_the_next_charge_gets_the_next_number(
    hub: Hub, cash: str, previous: str
) -> None:
    print("\n2 · the sale number is atomic and sequential within the day")
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key("next-number"),
            "payment_method_id": cash,
            "items": [
                {"product_name": "X", "price": 1000, "quantity": ONE, "tax_rate": 21.0}
            ],
        },
    )
    sale = hub.query("sales.get", {"sale_id": out["new_ids"][0]})[0]
    number = sale["sale_number"]
    same_day = number.rsplit("-", 1)[0] == previous.rsplit("-", 1)[0]
    if same_day:
        hub.check(
            "counter = previous + 1",
            sale_number_suffix(number),
            sale_number_suffix(previous) + 1,
        )
    else:
        # Midnight passed between the two charges: the counter restarted with the day.
        hub.check("a new day starts its counter at 1", sale_number_suffix(number), 1)


def test_the_same_attempt_retried_charges_once(hub: Hub, cash: str) -> None:
    print("\n3 · the same charge attempt retried leaves ONE sale (sales#20)")
    attempt = {
        "idempotency_key": key("retry"),
        "payment_method_id": cash,
        "amount_tendered": 1000,
        "items": [
            {"product_name": "X", "price": 1000, "quantity": ONE, "tax_rate": 21.0}
        ],
    }
    before = hub.page("sales.list")["total"]
    first = hub.run("sales.complete_sale", attempt)
    second = hub.run("sales.complete_sale", attempt)  # a clean no-op, never an error
    after = hub.page("sales.list")["total"]
    hub.check("sales in the hub: exactly one more", after, before + 1)
    rows = sale_by_key(hub, attempt["idempotency_key"])
    hub.check("the key resolves to one sale", len(rows), 1)
    hub.check("…the FIRST one", [r["id"] for r in rows], [first["new_ids"][0]])
    # The retry is a no-op, not a second charge: it wrote nothing and minted nothing (hub#776 —
    # `new_ids` lists only ids that became rows). The till recovers the sale it already charged
    # through `sales.by_idempotency_key`, which is exactly what the row above proves.
    hub.check("the retry wrote nothing", second.get("operations"), 0)
    hub.check("…and minted no id", second.get("new_ids"), [])


def test_a_retried_charge_leaves_one_invoice_too(hub: Hub, cash: str) -> None:
    print("\n3b · …and ONE invoice: the retry does not reach the fiscal chain either")
    # §3 proves the retry writes no second SALE. That was enough while the only caller was a
    # cashier's tablet recovering from a tap. sales#272 opens `complete_sale` to the public API
    # (`expose_api`), and over HTTP a retry is not a tap: it is a network client re-sending a
    # request whose answer it never saw. What it would duplicate is not a row on a screen — it is
    # an INVOICE, and behind it an entry in an immutable fiscal chain that has no undo (ADR-0189).
    #
    # `invoice` guards its own half with `uq_invoice_source` and proves it in
    # `invoice/tests/from_sale.hub.test.py` §3. What is asserted here is the thing that is only
    # true of the CHAIN: one retried charge leaves one of each, end to end. Both halves being
    # green does not say the whole is — that is the same reason `void_chain.hub.test.py` exists.
    attempt = {
        "idempotency_key": key("retry-chain"),
        "payment_method_id": cash,
        "amount_tendered": 1000,
        "tax_included": True,
        "items": [
            {"product_name": "X", "price": 1000, "quantity": ONE, "tax_rate": 21.0}
        ],
    }
    first = hub.run("sales.complete_sale", attempt)
    sale_id = first["new_ids"][0]

    # Wait FOR the chain: a listener arrives through the outbox relay, which the server ticks once
    # a second and no HTTP door drains on demand (module-toolkit#135).
    invoice = wait_until(
        lambda: hub.query("invoice.by_source", {"source_id": sale_id}),
        lambda rows: len(rows) == 1,
    )
    hub.check("the sale became an invoice", len(invoice), 1)

    # The baseline is taken once the relay has gone QUIET, not right after the call: every sale
    # this battery made above is still turning into its own invoice in the background, so a total
    # read mid-drain would move on its own and blame the retry for it.
    invoices_before = settled_invoice_total(hub)

    second = hub.run("sales.complete_sale", attempt)
    hub.check("the retry still wrote nothing", second.get("operations"), 0)
    # `wait_until` can only wait FOR something: «no second invoice» never resolves by polling, so
    # the relay gets its tick outright and we look afterwards.
    time.sleep(RELAY_TICK)

    hub.check(
        "the retry added no invoice", hub.page("invoice.list")["total"], invoices_before
    )
    hub.check(
        "…and the sale still has exactly one",
        len(hub.query("invoice.by_source", {"source_id": sale_id})),
        1,
    )


def test_off_grid_quantity_is_refused_and_writes_nothing(hub: Hub, cash: str) -> None:
    print(
        "\n4 · a quantity off the increment grid is refused by CODE and writes nothing"
    )
    k = key("off-grid")
    before = hub.page("sales.list")["total"]
    hub.refused(
        "half a gram on a gram grid",
        "sales.complete_sale",
        {
            "idempotency_key": k,
            "payment_method_id": cash,
            "items": [
                {
                    "product_name": "Azafrán",
                    "price": 900_000,
                    "quantity": 500,  # 0,0005 kg
                    "unit_code": "kg",
                    "increment_value": 1_000,  # 0,001 kg
                    "tax_rate": 21.0,
                }
            ],
        },
        "sales.quantity_off_grid",
    )
    hub.check("no half-written sale under that key", sale_by_key(hub, k), [])
    hub.check("the sales count did not move", hub.page("sales.list")["total"], before)


def test_half_a_kilo_costs_half_and_freezes_the_unit(hub: Hub, cash: str) -> None:
    print(
        "\n5 · half a kilo costs half; the line keeps the fixed-point quantity and its unit"
    )
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key("half-kilo"),
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": 600,
            "items": [
                {
                    "product_name": "Gambas",
                    "price": 1200,  # €/kg
                    "quantity": ONE // 2,  # 0,5 kg
                    "unit_code": "kg",
                    "unit_name": "Kilogram",
                    "increment_value": 1_000,
                    "tax_rate": 21.0,
                }
            ],
        },
    )
    sale_id = out["new_ids"][0]
    sale = hub.query("sales.get", {"sale_id": sale_id})[0]
    hub.check("1200 × 0,5 = 600 cents, one HALF_UP per line", cents(sale["total"]), 600)
    line = hub.query("sales.lines", {"sale_id": sale_id})[0]
    hub.check(
        "the line persists the fixed-point quantity", line.get("quantity"), ONE // 2
    )
    hub.check("…and its frozen unit", line.get("unit_code"), "kg")
    total = hub.event_field("sale.completed", "total")
    hub.check(
        "sale.completed carries the same money", cents((total or {}).get("sample")), 600
    )


def test_every_sale_says_who_attended(hub: Hub, cash: str) -> None:
    print(
        "\n6 · attribution: the named professional wins, the unnamed sale goes to the session user"
    )
    run_tag = uuid.uuid4().hex[:6]
    staff_a = f"staff-A-{run_tag}"
    staff_b = f"staff-B-{run_tag}"

    def sale(staff: str | None, price: int, tag: str) -> str:
        payload = {
            "idempotency_key": key(f"by-staff-{tag}"),
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": 0,
            "items": [
                {
                    "product_name": "Corte",
                    "price": price,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                    "is_service": True,
                }
            ],
        }
        if staff is not None:
            payload["staff_id"] = staff
        return hub.run("sales.complete_sale", payload)["new_ids"][0]

    def session_user_count() -> int:
        rows = hub.query(
            "sales.by_staff", {"date_from": "2026-01-01", "date_to": "2030-12-31"}
        )
        return next((r["sales_count"] for r in rows if r["staff_id"] == hub.user), 0)

    # Every unnamed charge of this battery so far already went to the session user (sections 1-5):
    # the promise is «one more», not «exactly one».
    session_before = session_user_count()
    a1 = sale(staff_a, 2000, "a1")
    sale(staff_a, 3000, "a2")
    sale(staff_b, 1000, "b1")
    unnamed = sale(None, 121, "nobody")

    hub.check(
        "sales.get exposes staff_id",
        hub.query("sales.get", {"sale_id": a1})[0].get("staff_id"),
        staff_a,
    )
    hub.check(
        "the unnamed sale is attributed to the session user (sales#196)",
        hub.query("sales.get", {"sale_id": unnamed})[0].get("staff_id"),
        hub.user,
    )

    rows = hub.query(
        "sales.by_staff", {"date_from": "2026-01-01", "date_to": "2030-12-31"}
    )
    by_person = {r["staff_id"]: r for r in rows}
    hub.check_true(
        "A is in the breakdown", staff_a in by_person, str(sorted(by_person))
    )
    hub.check_true(
        "B is in the breakdown", staff_b in by_person, str(sorted(by_person))
    )
    hub.check_true(
        "the session user is in the breakdown",
        hub.user in by_person,
        str(sorted(by_person)),
    )
    if staff_a in by_person:
        hub.check("A: two sales", by_person[staff_a]["sales_count"], 2)
        hub.check(
            "A: gross 20 € + 30 €", cents(by_person[staff_a]["gross_total"]), 5000
        )
    if staff_b in by_person:
        hub.check("B: gross 10 €", cents(by_person[staff_b]["gross_total"]), 1000)
    if hub.user in by_person:
        hub.check(
            "session user: one more sale, the unnamed one",
            by_person[hub.user]["sales_count"],
            session_before + 1,
        )

    past = hub.query(
        "sales.by_staff", {"date_from": "2020-01-01", "date_to": "2020-12-31"}
    )
    hub.check(
        "a past range holds none of today's sales",
        [r["staff_id"] for r in past if r["staff_id"] in (staff_a, staff_b, hub.user)],
        [],
    )


def test_a_sale_from_an_appointment_is_tagged_and_announced(
    hub: Hub, cash: str
) -> None:
    print(
        "\n7 · appointment → sale: tagged with professional + appointment, conversion emitted"
    )
    appointment = f"appt-{uuid.uuid4().hex[:8]}"
    out = hub.run(
        "sales.complete_sale",
        {
            "idempotency_key": key("from-appointment"),
            "payment_method_id": cash,
            "tax_included": True,
            "amount_tendered": 0,
            "staff_id": "stylist-1",
            "appointment_id": appointment,
            "customer_id": "cust-9",
            "customer_name": "Ana",
            "items": [
                {
                    "product_name": "Tinte",
                    "price": 4500,
                    "quantity": ONE,
                    "tax_rate": 21.0,
                    "is_service": True,
                }
            ],
        },
    )
    sale = hub.query("sales.get", {"sale_id": out["new_ids"][0]})[0]
    hub.check("staff_id", sale.get("staff_id"), "stylist-1")
    hub.check("appointment_id", sale.get("appointment_id"), appointment)

    shape = hub.event_shape("sales.sale.created_from_appointment")
    hub.check_true(
        "sales.sale.created_from_appointment was emitted",
        shape is not None and shape.get("samples", 0) >= 1,
        str(shape),
    )
    appt = (
        hub.event_field("sales.sale.created_from_appointment", "appointment_id") or {}
    )
    hub.check("the conversion names the appointment", appt.get("sample"), appointment)
    staff = hub.event_field("sales.sale.created_from_appointment", "staff_id")
    hub.check_true(
        "…and the professional (withheld as personal by the shape, but present)",
        staff is not None,
        str(shape),
    )


def main() -> int:
    # `invoice` because §3b walks the chain past this module; a battery that quietly skipped it
    # would report a fiscal promise it never checked.
    hub = Hub("checkout.hub", needs=("taxes", "sales", "invoice"))
    print(
        f"Hub battery · checkout (hub#1264 ← sales_e2e.rs) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    # The KERNEL's fiscal precondition, set BEFORE the first charge (ADR-0203, hub#328): without
    # it `invoice.create_from_sale` refuses and every `sale.completed` piles up in the outbox,
    # only to drain the moment something does set it — which would move §3b's totals under it.
    ensure_business_identity(hub)
    cash = cash_method_id(hub)
    first_number = test_a_charge_writes_header_lines_and_payment(hub, cash)
    test_the_next_charge_gets_the_next_number(hub, cash, first_number)
    test_the_same_attempt_retried_charges_once(hub, cash)
    test_a_retried_charge_leaves_one_invoice_too(hub, cash)
    test_off_grid_quantity_is_refused_and_writes_nothing(hub, cash)
    test_half_a_kilo_costs_half_and_freezes_the_unit(hub, cash)
    test_every_sale_says_who_attended(hub, cash)
    test_a_sale_from_an_appointment_is_tagged_and_announced(hub, cash)
    return hub.finish(
        "the checkout keeps every promise the hub's e2e used to assert, against the real kernel"
    )


if __name__ == "__main__":
    sys.exit(main())
