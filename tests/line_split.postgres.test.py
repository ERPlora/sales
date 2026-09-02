#!/usr/bin/env python3
"""SEPARAR una línea de N servicios en N líneas de UNA, contra un Postgres 18 REAL (sales#242 / ADR-0422).

The handler's unit tests prove what the split DECIDES: how many parts come out, what each one is
worth, and which lines it refuses. What they cannot prove is that the parameters it emits BIND — and
that is the whole risk of this change, because the split is the first caller of two doors it did not
own before:

  1. `sales._update_order_line`, a new internal command over the SQL `sales.order.update_line`
     already runs. A statement Postgres cannot prepare is a command that does not exist in any hub
     (ADR-0154), and here it would leave the source row AT TWO with a clone already in — the check
     charging three haircuts for two.
  2. `sales._insert_order_line` with a row built by CLONING another row instead of by pricing a
     payload. Every frozen column travels: one parameter missing its `:name` and the clone lands
     with a NULL where a number belongs, or the INSERT is rejected halfway through the split.

And one arithmetic fact that only the database can settle: `order_recompute_total.sql` sums the LIVE
lines, so after the split `provisional_total` has to be the very number it was before. That is the
money gate of sales#246 seen from this operation — what the check is worth does not change because
the cashier separated a line.

Six points, every one through the module's OWN declared doors:

  1. THE CHECK. A haircut rung up twice is ONE line of two, worth 36,00 €.
  2. THE SOURCE ROW drops to one unit and KEEPS ITS ID — it is what a redemption will hold against,
     and what the cashier is looking at.
  3. THE CLONE goes in with the frozen snapshot: price, tax category, service flag, category, note
     and unit context (sales#175 / ADR-0085 / sales#89 / sales#12 / sales#156 / ADR-0147 §2.4).
  4. THE MONEY DOES NOT MOVE. `provisional_total` is 36,00 € before and after.
  5. THE WAY BACK. `sales.order.lines` returns two live rows of one unit, which is what the till
     re-reads and what mounts a redemption slot on each.
  6. A LINE ALREADY FIRED IS NOT REWRITTEN. `order_update_line.sql` carries `fired_at IS NULL`, and
     that guard is the reason the handler refuses to split such a line at all — proved here rather
     than assumed, because a silent no-op on the source row is exactly the shape of the bug.

🔴 CONTROL INCORPORADO: the same split done the way a browser would have to do it — clone first,
source untouched — and the battery shows the check jumping to 54,00 €. A gate that cannot see the
defect it exists for is not a gate.

Usage: tests/line_split.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER; the
  toolkit sets it per CI job). Creates scratch databases and DROPS them at the end, pass or fail.
  It NEVER skips itself: a battery that goes green because it could not reach Postgres is worse
  than no battery at all.
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session, UNITS, order_line_params

HUB = "hub-test"
USER = "u-cashier"
NOW = "2026-09-02T10:00:00+00:00"
LATER = "2026-09-02T10:04:00+00:00"

ORDER = "ord-1"
SOURCE = "line-1"
CLONE = "line-2"

# What the handler already resolved against `services`' catalogue (sales#175): 18,00 € a haircut.
HAIRCUT = 1800
ONE = 1_000_000  # one unit, fixed point 10⁶ (ADR-0147)


def check_row(s: Session, label: str, line_id: str, column: str, want) -> None:
    s.check(
        label,
        s.q(f"SELECT {column} FROM sales_order_item WHERE id = '{line_id}'"),
        want,
    )


def open_the_check(s: Session, quantity: int, fired: bool = False) -> None:
    """«Corte de señora» rung up `quantity/ONE` times: ONE line, which is what the till builds."""
    s.command_ok(
        "the cashier opens the check",
        "sales._insert_order",
        {
            "id": ORDER,
            "status": "open",
            "provisional_total": 0,
            "notes": "",
            "label": "Ana",
            "source_module": "pos",
        },
    )
    s.command_ok(
        "«Corte de señora», rung up twice into one line",
        "sales._insert_order_line",
        order_line_params(
            id=SOURCE,
            order_id=ORDER,
            product_id="s-corte",
            product_name="Corte de señora",
            quantity=quantity,
            unit_price=HAIRCUT,
            line_total=HAIRCUT * (quantity // ONE),
            tax_category_key="service.generic",
            is_service=1,
            category_id="sc-pelo",
            notes="con Marta",
        ),
    )
    s.command_ok(
        "the check is worth what its line is worth",
        "sales._recompute_order_total",
        {"order_id": ORDER},
    )
    if fired:
        # The command the round uses (`sales._mark_lines_fired`) needs the round's own payload; this
        # sets the same column the way production leaves it, because what is under test here is the
        # GUARD in `order_update_line.sql`, not how the line got fired.
        s.psql(
            [],
            stdin=f"UPDATE sales_order_item SET fired_at = '{NOW}', round_no = 1 WHERE id = '{SOURCE}';",
        )


def split_the_line(s: Session, rewrite_source: bool = True) -> None:
    """The operations the handler emits: the source row down to one unit, then the clone.

    `rewrite_source=False` plays the HALF split — the clone in, the source untouched — which is what
    a round-trip that dies between two commands leaves behind, and the defect this battery has to be
    able to see."""
    source_op = (
        "the source row drops to ONE unit and keeps its id",
        "sales._update_order_line",
        {
            "order_id": ORDER,
            "line_id": SOURCE,
            "quantity": ONE,
            "line_total": HAIRCUT,
            # Everything the statement COALESCEs travels as NULL: the split changes the quantity and
            # the amount, and nothing else about the line.
            "is_gift": None,
            "gift_reason": None,
            "discount_percent": None,
            "notes": None,
        },
    )
    clone_op = (
        "and the second haircut goes in as its own line",
        "sales._insert_order_line",
        order_line_params(
            id=CLONE,
            order_id=ORDER,
            product_id="s-corte",
            product_name="Corte de señora",
            quantity=ONE,
            unit_price=HAIRCUT,
            line_total=HAIRCUT,
            tax_category_key="service.generic",
            is_service=1,
            category_id="sc-pelo",
            notes="con Marta",
        ),
    )
    for label, name, payload in ([source_op, clone_op] if rewrite_source else [clone_op]):
        s.command_ok(label, name, payload, now=LATER)
    s.command_ok(
        "and the check is recomposed from its live lines",
        "sales._recompute_order_total",
        {"order_id": ORDER},
        now=LATER,
    )


def scenario_split(s: Session) -> None:
    print("\n«Corte de señora × 2» se separa en dos líneas de una")
    open_the_check(s, 2 * ONE)
    s.check(
        "one line of two, 36,00 €",
        s.qi("SELECT provisional_total FROM sales_order WHERE id = 'ord-1'"),
        3600,
    )
    s.check(
        "and it IS one line",
        s.qi(
            "SELECT count(*) FROM sales_order_item WHERE order_id = 'ord-1' AND is_deleted = 0"
        ),
        1,
    )

    split_the_line(s)

    # 2 · the source keeps its id, which is what a redemption holds against.
    check_row(s, "the source row is now one unit", SOURCE, "quantity", str(ONE))
    check_row(s, "worth one haircut", SOURCE, "line_total", str(HAIRCUT))
    check_row(
        s, "and its note was NOT wiped by the update", SOURCE, "notes", "con Marta"
    )

    # 3 · the clone carries the frozen snapshot, column by column.
    check_row(
        s,
        "the clone froze the same price (sales#175)",
        CLONE,
        "unit_price",
        str(HAIRCUT),
    )
    check_row(
        s,
        "the same VAT authority (ADR-0085)",
        CLONE,
        "tax_category_key",
        "service.generic",
    )
    check_row(s, "still a service, still no stock (sales#89)", CLONE, "is_service", "1")
    check_row(
        s, "the kitchen routing survives (sales#12)", CLONE, "category_id", "sc-pelo"
    )
    check_row(
        s,
        "the note is on the second haircut too (sales#156)",
        CLONE,
        "notes",
        "con Marta",
    )
    check_row(
        s,
        "the unit context is frozen (ADR-0147 §2.4)",
        CLONE,
        "price_quantity_value",
        str(UNITS["price_quantity_value"]),
    )
    check_row(s, "it is nobody's set menu", CLONE, "combo", "{}")
    check_row(s, "and it was never fired", CLONE, "fired_at", "")

    # 4 · THE MONEY GATE (sales#246): separating a line charges nothing and forgives nothing.
    s.check(
        "the check is worth the SAME 36,00 € after the split",
        s.qi("SELECT provisional_total FROM sales_order WHERE id = 'ord-1'"),
        3600,
    )
    s.check(
        "and it is the sum of the two live lines",
        s.qi(
            "SELECT COALESCE(SUM(line_total), 0) FROM sales_order_item "
            "WHERE order_id = 'ord-1' AND is_deleted = 0"
        ),
        3600,
    )

    # 5 · the way back: what the till re-reads, and what mounts a slot on each haircut.
    lines = s.query("sales.order.lines", {"order_id": ORDER})
    s.check("two live lines come back", len(lines), 2)
    s.check("both of one unit", sorted(int(l["quantity"]) for l in lines), [ONE, ONE])
    s.check(
        "both worth one haircut",
        sorted(int(l["line_total"]) for l in lines),
        [HAIRCUT, HAIRCUT],
    )
    s.check(
        "and the source is still one of them", SOURCE in [l["id"] for l in lines], True
    )


def scenario_fired(s: Session) -> None:
    print(
        "\nuna línea YA ENVIADA a producción no se reescribe — por eso el handler la rechaza"
    )
    open_the_check(s, 2 * ONE, fired=True)
    ok, _ = s.command(
        "sales._update_order_line",
        {
            "order_id": ORDER,
            "line_id": SOURCE,
            "quantity": ONE,
            "line_total": HAIRCUT,
            "is_gift": None,
            "gift_reason": None,
            "discount_percent": None,
            "notes": None,
        },
        now=LATER,
    )
    # The statement runs and matches NOTHING: `fired_at IS NULL`. It is a SILENT no-op, which is
    # exactly why the split cannot be attempted on such a line — the clone would go in anyway.
    s.check("the command itself does not fail", ok, True)
    check_row(s, "the fired line kept its two units", SOURCE, "quantity", str(2 * ONE))
    s.check(
        "so the check would have grown by a whole haircut had a clone gone in",
        s.qi("SELECT provisional_total FROM sales_order WHERE id = 'ord-1'"),
        3600,
    )


def scenario_control(s: Session) -> None:
    print("\n\U0001f534 control · el desdoble a medias, que es lo \u00fanico que un navegador puede hacer")
    open_the_check(s, 2 * ONE)
    # Two commands, two round trips: the clone lands and the rewrite of the source never arrives —
    # a dropped connection, a tab closed, a refusal on the second call. Nothing here FAILS, and the
    # only thing wrong is that the check is worth eighteen euros more than the customer bought.
    # This is why the split is ONE server transaction and not a loop in the browser.
    split_the_line(s, rewrite_source=False)
    s.check(
        "control: the money gate FIRES — three haircuts on a check that has two",
        s.qi("SELECT provisional_total FROM sales_order WHERE id = 'ord-1'"),
        5400,
    )
    s.check(
        "control: over by exactly one haircut",
        s.qi("SELECT provisional_total FROM sales_order WHERE id = 'ord-1'") - 3600,
        HAIRCUT,
    )
    s.check(
        "control: and the source row is still the line of two",
        s.q(f"SELECT quantity FROM sales_order_item WHERE id = '{SOURCE}'"),
        str(2 * ONE),
    )


def main() -> int:
    prefix = f"sales_line_split_{os.getpid()}"
    split = Session(f"{prefix}_split", hub=HUB, user=USER, now=NOW)
    fired = Session(f"{prefix}_fired", hub=HUB, user=USER, now=NOW)
    control = Session(f"{prefix}_control", hub=HUB, user=USER, now=NOW)
    sessions = [split, fired, control]
    try:
        for s in sessions:
            s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        scenario_split(split)
        scenario_fired(fired)
        scenario_control(control)
    finally:
        for s in sessions:
            s.drop()

    for s in sessions[1:]:
        split.failures.extend(s.failures)
    return split.report(
        "separar «Corte × 2» deja dos líneas de una con el mismo dinero, y la batería sigue viendo "
        "el desdoble a medias cuando lo hay"
    )


if __name__ == "__main__":
    sys.exit(main())
