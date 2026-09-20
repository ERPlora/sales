#!/usr/bin/env python3
"""The receipt text a shop typed in Printing lands here — and never on top of its own (printing#44).

Until hub#1921 the ticket that came out on its own at checkout was built by the shell from
`printing.settings.get` → `receipt_header`/`receipt_footer`. Since then BOTH papers — the automatic
one and the one the print button sends — are the sales viewer's document, and that one reads
`sales.pos_settings.get`. So the two boxes on the Printing screen stopped reaching any paper, and
the shops that typed their branding there have it stranded in another module's table.

`sales.settings.adopt_receipt_text` is the one-way door that moves it: Printing offers it, the
owner presses it, and the text lands in the settings the paper actually reads. It is deliberately
NOT `sales.settings.update`:

  * that command takes the WHOLE snapshot (the screen always sends every column), so a caller that
    only has two strings would blank the other sixteen settings with the schema defaults;
  * and it overwrites. This one only ever FILLS AN EMPTY FIELD, per field: what the shop wrote in
    Sales is the shop's, and a migration that can overwrite it would turn a blueprint's demo header
    into somebody's real ticket.

What is pinned here:

  1. NO ROW AT ALL. The commonest case — the singleton is written by the first save on the settings
     screen, and a shop that configured its receipt in Printing never had to visit it.
  2. THE ROW IS THERE, THE RECEIPT IS BLANK. The text lands and NOTHING else of the policy moves.
  3. WHAT THE SHOP WROTE IN SALES WINS, per field: a header of its own is kept verbatim while the
     footer it never wrote is still adopted.
  4. BLANKS ARE NOT TEXT, on both sides: a stored header of spaces is empty (it prints nothing), an
     incoming header of spaces is not worth adopting. Same trimming the checklist's `truthy()` does.
  5. TENANCY, with its negative control: the neighbour's receipt is untouched, and the same call
     made for the neighbour writes the NEIGHBOUR's row.
  6. A SOFT-DELETED SINGLETON comes back alive, because `uq_sales_settings_hub` is not a partial
     index: the row keeps the `ON CONFLICT` slot, so without the revive the command would report
     success and write into a row `sales.pos_settings.get` filters out. Exactly the trap
     `printing.settings.update` fell into (printing#25).
  7. NOTHING TO ADOPT ⇒ NOTHING TOUCHED. A call carrying only blanks does not revive the row, does
     not bump `updated_at` and does not create one: the move is the shop's decision about ITS text,
     never an excuse to write.
  8. IT IS IDEMPOTENT. Pressing the button twice does not re-migrate: the second call finds the
     field filled and keeps it.

Usage: tests/adopt_receipt_text.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail. It NEVER skips itself: a
  battery that goes green because it could not reach Postgres is worse than no battery at all.
"""

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-owner"
NOW = "2026-09-20T09:00:00+00:00"

ADOPT = "sales.settings.adopt_receipt_text"
COUNTER_READ = "sales.pos_settings.get"

HEADER = "Bar Manolo\nC/ Mayor 1"
FOOTER = "Gracias por su visita"

# The rest of the policy, which the settings screen always sends whole: the upsert binds every
# column and a NOT NULL column bound NULL is how a save turns into a traceback.
POLICY = {
    "allow_cash": 1,
    "allow_card": 0,
    "allow_transfer": 1,
    "sync_products": 0,
    "sync_services": 1,
    "require_customer": 1,
    "allow_discounts": 0,
    "max_discount_percent": 10,
    "enable_parked_tickets": 0,
    "default_tax_included": 0,
    "receipt_header": "",
    "receipt_footer": "",
    "receipt_footer_image": "",
    "receipt_marketing_url": "",
    "receipt_marketing_text": "",
    "default_document_format": "invoice",
    "auto_invoice_with_tax_id": 0,
}


def save_settings(s: Session, row_id: str, hub: str | None = None, **overrides) -> bool:
    """The settings screen saving, through the manifest command and nothing else."""
    return s.command_ok(
        f"the shop saves its till settings ({row_id})",
        "sales.settings.update",
        {"new_id": row_id, **POLICY, **overrides},
        hub=hub,
    )


def adopt(s: Session, row_id: str, header=None, footer=None, hub=None, now=None) -> bool:
    payload = {"new_id": row_id}
    if header is not None:
        payload["receipt_header"] = header
    if footer is not None:
        payload["receipt_footer"] = footer
    return s.command_ok(
        f"Printing hands its receipt text over ({row_id})", ADOPT, payload, hub=hub, now=now
    )


def receipt_through_counter(s: Session, hub=None):
    """Header and footer as the door the PAPER reads hands them back — `<no row>` when the counter
    sees no settings at all, which is a different answer from an empty receipt."""
    rows = s.query(COUNTER_READ, {}, hub=hub)
    if not rows:
        return "<no row>"
    return (
        rows[0].get("receipt_header", "<absent>"),
        rows[0].get("receipt_footer", "<absent>"),
    )


def scenario(s: Session) -> None:
    print("\n1 · NO ROW AT ALL — the shop configured its receipt in Printing and never came here")
    s.check("the counter starts with no settings row", receipt_through_counter(s), "<no row>")
    adopt(s, "set-1", HEADER, FOOTER)
    s.check(
        "the receipt the paper reads now carries the shop's own text",
        receipt_through_counter(s),
        (HEADER, FOOTER),
    )
    s.check(
        "and it is a live singleton of THIS hub",
        s.rows(
            f"SELECT id, is_deleted FROM sales_settings WHERE hub_id = '{HUB}'"
        ),
        [{"id": "set-1", "is_deleted": 0}],
    )

    print("\n2 · THE ROW IS THERE AND THE RECEIPT IS BLANK — the text lands, the policy does not move")
    s.psql(["-c", f"DELETE FROM sales_settings WHERE hub_id = '{HUB}'"])
    save_settings(s, "set-2")
    before = s.rows(
        "SELECT allow_cash, allow_card, allow_transfer, sync_products, sync_services, "
        "require_customer, allow_discounts, max_discount_percent, enable_parked_tickets, "
        "default_tax_included, default_document_format, auto_invoice_with_tax_id "
        f"FROM sales_settings WHERE hub_id = '{HUB}'"
    )
    adopt(s, "set-2b", HEADER, FOOTER)
    s.check("the blank receipt is filled", receipt_through_counter(s), (HEADER, FOOTER))
    s.check(
        "and every other setting the shop chose is exactly as it was",
        s.rows(
            "SELECT allow_cash, allow_card, allow_transfer, sync_products, sync_services, "
            "require_customer, allow_discounts, max_discount_percent, enable_parked_tickets, "
            "default_tax_included, default_document_format, auto_invoice_with_tax_id "
            f"FROM sales_settings WHERE hub_id = '{HUB}'"
        ),
        before,
    )
    s.check(
        "no second singleton was created",
        s.qi(f"SELECT count(*) FROM sales_settings WHERE hub_id = '{HUB}'"),
        1,
    )

    print("\n3 · WHAT THE SHOP WROTE HERE WINS — per field, never all-or-nothing")
    s.psql(["-c", f"DELETE FROM sales_settings WHERE hub_id = '{HUB}'"])
    save_settings(s, "set-3", receipt_header="Peluquería Aurora")
    adopt(s, "set-3b", HEADER, FOOTER)
    s.check(
        "the header it typed here is kept verbatim and the footer it never wrote is adopted",
        receipt_through_counter(s),
        ("Peluquería Aurora", FOOTER),
    )

    print("\n4 · BLANKS ARE NOT TEXT — on both sides of the move")
    s.psql(["-c", f"DELETE FROM sales_settings WHERE hub_id = '{HUB}'"])
    save_settings(s, "set-4", receipt_header="   ")
    adopt(s, "set-4b", HEADER, FOOTER)
    s.check(
        "a header of spaces prints nothing, so it is empty and the real text takes its place",
        receipt_through_counter(s),
        (HEADER, FOOTER),
    )
    s.psql(["-c", f"DELETE FROM sales_settings WHERE hub_id = '{HUB}'"])
    save_settings(s, "set-5")
    adopt(s, "set-5b", "   ", "  \n ")
    s.check(
        "and spaces coming from Printing are not worth adopting",
        receipt_through_counter(s),
        ("", ""),
    )

    print("\n5 · TENANCY — with the control that proves the check can fail")
    s.psql(["-c", "DELETE FROM sales_settings"])
    save_settings(s, "set-6", hub=OTHER_HUB, receipt_header="Neighbour SL")
    adopt(s, "set-7", HEADER, FOOTER)
    s.check(
        "the neighbour's receipt is untouched",
        receipt_through_counter(s, hub=OTHER_HUB),
        ("Neighbour SL", ""),
    )
    s.check("while this hub got its own", receipt_through_counter(s), (HEADER, FOOTER))
    adopt(s, "set-8", "Neighbour's own footer test", "Hasta pronto", hub=OTHER_HUB)
    s.check(
        "and the same call made FOR the neighbour writes the neighbour's row",
        receipt_through_counter(s, hub=OTHER_HUB),
        ("Neighbour SL", "Hasta pronto"),
    )

    print("\n6 · A SOFT-DELETED SINGLETON — the ON CONFLICT slot is still taken (printing#25)")
    s.psql(["-c", "DELETE FROM sales_settings"])
    save_settings(s, "set-9")
    s.psql(
        [
            "-c",
            "UPDATE sales_settings SET is_deleted = 1, deleted_at = "
            f"'{NOW}' WHERE hub_id = '{HUB}'",
        ]
    )
    s.check("the counter sees no settings", receipt_through_counter(s), "<no row>")
    adopt(s, "set-10", HEADER, FOOTER)
    s.check(
        "adopting brings the singleton back alive with the text",
        receipt_through_counter(s),
        (HEADER, FOOTER),
    )
    s.check(
        "and there is still exactly one row for this hub",
        s.qi(f"SELECT count(*) FROM sales_settings WHERE hub_id = '{HUB}'"),
        1,
    )

    print("\n7 · NOTHING TO ADOPT, NOTHING TOUCHED — not even the row's own state")
    s.psql(["-c", "DELETE FROM sales_settings"])
    save_settings(s, "set-12")
    s.psql(
        [
            "-c",
            "UPDATE sales_settings SET is_deleted = 1, deleted_at = "
            f"'{NOW}', updated_at = '{NOW}' WHERE hub_id = '{HUB}'",
        ]
    )
    adopt(s, "set-13", "   ", "")
    s.check(
        "a call with nothing to move does not revive the row behind the shop's back",
        s.rows(
            f"SELECT is_deleted, updated_at FROM sales_settings WHERE hub_id = '{HUB}'"
        ),
        [{"is_deleted": 1, "updated_at": NOW}],
    )
    # …and the same when the call DOES carry text, but this hub already has its own: there is
    # nothing to adopt, so the row is not written — not its text, not its state, not its clock.
    s.psql(["-c", "DELETE FROM sales_settings"])
    save_settings(s, "set-13b", receipt_header="Peluquería Aurora", receipt_footer="Hasta pronto")
    s.psql(
        [
            "-c",
            "UPDATE sales_settings SET is_deleted = 1, deleted_at = "
            f"'{NOW}', updated_at = '{NOW}' WHERE hub_id = '{HUB}'",
        ]
    )
    adopt(s, "set-13c", HEADER, FOOTER, now="2026-09-21T09:00:00+00:00")
    s.check(
        "a receipt this hub already wrote is not overwritten, revived or re-dated",
        s.rows(
            "SELECT receipt_header, receipt_footer, is_deleted, updated_at "
            f"FROM sales_settings WHERE hub_id = '{HUB}'"
        ),
        [
            {
                "receipt_header": "Peluquería Aurora",
                "receipt_footer": "Hasta pronto",
                "is_deleted": 1,
                "updated_at": NOW,
            }
        ],
    )

    print("\n8 · IDEMPOTENT — pressing the button twice does not re-migrate")
    s.psql(["-c", "DELETE FROM sales_settings"])
    adopt(s, "set-14", HEADER, FOOTER)
    adopt(s, "set-15", "Something else entirely", "And another footer")
    s.check(
        "the second run keeps what the first one moved",
        receipt_through_counter(s),
        (HEADER, FOOTER),
    )


def main() -> int:
    db = f"sales_adopt_receipt_text_{os.getpid()}"
    print(f"Postgres battery · the receipt text moves in from Printing (printing#44) · db {db}")
    s = Session(db, hub=HUB, user=USER, now=NOW)
    s.create()
    try:
        scenario(s)
    finally:
        s.drop()
    return s.report(
        "the receipt text lands where the paper reads it, and never on top of the shop's own"
    )


if __name__ == "__main__":
    sys.exit(main())
