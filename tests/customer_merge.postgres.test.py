#!/usr/bin/env python3
"""customers#86 (sales layer) — when two customer sheets are merged, the sales follow the survivor.

`customers.merge` retires the absorbed sheet (soft delete) and publishes `customer.merged` with
`{surviving_id, absorbed_id, hub_id}` (customers#87). `sales` stores the customer as an OPAQUE id
(no cross-module foreign key) in ONE table: `sales_sale`. The open order (`sales_order`) carries no
customer by design (ADR-0141: `customers` owns that link in its own junction) and the legacy cart
blobs were dropped (013). Unless this module re-points `sales_sale.customer_id`, the survivor's
purchase history misses every ticket and invoice charged under the duplicate sheet.

🔴 THE FISCAL RULE: a sale already filed with the AEAT (VeriFactu) does NOT change the customer it
was issued to. The only customer data the sale keeps is `customer_name`, the name printed on the
ticket or invoice — a frozen snapshot. The merge moves the LINK (`customer_id`) so the history is
complete, and never rewrites what was issued: name, number, document type, totals, tax breakdown,
status, void data and creation time stay exactly as they were written.

WHAT IS PROVEN HERE, against a REAL Postgres, running the module's own SQL:

  1. The manifest listens to `customer.merged` with an internal, transactional command that emits
     nothing and has no `expect_rows` (merging a customer who never bought is normal), gated by a
     permission the module declares; one statement per `sql[]` file.
  2. Sales of every state — completed ticket, completed invoice, voided, refunded, soft-deleted —
     move to the survivor, stamped with who and when.
  3. The fiscal snapshot of every moved sale is byte-for-byte what it was (the test fails if the
     merge touches the printed name or any fiscal column).
  4. It does not require the absorbed sheet to exist: no `customers` table in this database.
  5. Sales of other customers and walk-in sales (no customer) are untouched.
  6. IDEMPOTENCE — the outbox is at-least-once; a redelivery changes nothing (not even updated_at).
  7. A degenerate event (`surviving_id = absorbed_id`) is a no-op.
  8. TENANCY — sales of the hub next door carrying the absorbed id are NOT re-pointed: the same
     opaque string may name someone else there.

Uses `erplora-test-pg-5433` (override: SALES_TEST_PG_CONTAINER); scratch DB dropped at the end.
"""

import pathlib
import re
import sys
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from pg_harness import MANIFEST, MODULE_DIR, Session  # noqa: E402

EVENT = "customer.merged"
LISTENER = "sales._on_customer_merged"
HUB = "hub-test"
OTHER_HUB = "hub-other"
SURVIVOR = "cust-ana"
ABSORBED = "cust-ana-dup"
CREATED = "2026-08-01T00:00:00+00:00"
NOW = "2026-09-26T10:00:00+00:00"
LATER = "2026-09-26T11:00:00+00:00"

# What the sale ISSUED: the snapshot printed on the paper and filed with the AEAT. A merge must
# leave every one of these exactly as it was.
FISCAL_COLS = (
    "sale_number",
    "document_type",
    "status",
    "customer_name",
    "subtotal",
    "tax_amount",
    "tax_breakdown",
    "discount_amount",
    "total",
    "payment_method_name",
    "voided_at",
    "voided_by",
    "void_reason",
    "is_deleted",
    "created_at",
    "created_by",
)


def statement_count(sql: str) -> int:
    """Statements in a SQL file once `--` comments are gone (the listener's SQL has no literals)."""
    body = re.sub(r"--[^\n]*", "", sql)
    return len([x for x in body.split(";") if x.strip()])


def sale(
    s, sid, hub, customer, name, document_type="ticket", status="completed", deleted=0
):
    s.psql(
        [],
        stdin=(
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, subtotal, tax_amount, tax_breakdown, "
            "discount_amount, total, payment_method_name, customer_id, customer_name, document_type, "
            "voided_at, voided_by, void_reason, is_deleted, created_by, created_at, updated_at) VALUES ("
            f"'{sid}', '{hub}', 'T-{sid}', '{status}', 1000, 210, '{{\"21\":{{\"base\":1000,\"tax\":210}}}}', "
            f"0, 1210, 'Cash', {'NULL' if customer is None else repr(customer)}, '{name}', "
            f"'{document_type}', "
            + (
                "'2026-08-02T00:00:00+00:00', 'u-boss', 'wrong table'"
                if status == "voided"
                else "NULL, NULL, NULL"
            )
            + f", {deleted}, 'u-cashier', '{CREATED}', '{CREATED}');"
        ),
    )


def cols(s, sid, names) -> dict:
    rows = s.rows(f"SELECT {', '.join(names)} FROM sales_sale WHERE id = '{sid}'")
    return rows[0] if rows else {}


def fingerprint(s, hub) -> str:
    """Every sale of one hub with its link and its stamp, in a byte-stable order (COLLATE "C")."""
    return s.q(
        "SELECT COALESCE(string_agg(x, '|' ORDER BY x COLLATE \"C\"), '') FROM ("
        " SELECT id || ':' || COALESCE(customer_id, '-') || ':' || customer_name || ':'"
        " || COALESCE(updated_by, '-') || ':' || COALESCE(updated_at, '-') AS x"
        f"   FROM sales_sale WHERE hub_id = '{hub}') t;"
    )


def merge(s, hub=HUB, surviving=SURVIVOR, absorbed=ABSORBED, now=NOW) -> bool:
    """Deliver `customer.merged` the way the outbox relay does: the payload IS the emitter's params,
    and the runtime injects `hub_id`/`current_user_id`/`now` from the event's context."""
    return s.command_ok(
        f"deliver {EVENT} ({absorbed} → {surviving}) in {hub}",
        LISTENER,
        {"surviving_id": surviving, "absorbed_id": absorbed},
        hub=hub,
        now=now,
    )


def manifest_half(s) -> bool:
    print("== the manifest declares the ear ==")
    listen = (MANIFEST.get("events") or {}).get("listen", {})
    s.check(
        f"`{EVENT}` is listened to", (listen.get(EVENT) or {}).get("command"), LISTENER
    )
    cmd = MANIFEST["commands"].get(LISTENER)
    if not s.check(f"`{LISTENER}` exists", cmd is not None, True):
        return False
    s.check(
        "it is internal (leading `_`)", LISTENER.rsplit(".", 1)[1].startswith("_"), True
    )
    s.check("it is transactional", cmd.get("transaction"), True)
    s.check("it carries SQL", bool(cmd.get("sql")), True)
    for rel in cmd.get("sql") or []:
        s.check(
            f"{rel} holds a single statement (one prepared statement in Postgres)",
            statement_count((MODULE_DIR / rel).read_text()),
            1,
        )
    s.check("it emits nothing", cmd.get("emit"), None)
    s.check(
        "it has no expect_rows (a customer who never bought is normal)",
        cmd.get("expect_rows"),
        None,
    )
    declared = {
        p if isinstance(p, str) else p.get("codename")
        for p in MANIFEST.get("permissions", [])
    }
    s.check(
        "its permission is declared by the module",
        cmd.get("permission") in declared,
        True,
    )
    return True


def main() -> int:
    s = Session(
        f"sales_merge_{uuid.uuid4().hex[:8]}", hub=HUB, user="user-merger", now=NOW
    )
    if not manifest_half(s):
        return s.report("")
    s.create()
    try:
        # This hub: the survivor bought once; the duplicate sheet bought under the other spelling,
        # including an invoice already filed with the AEAT under the name it was issued to.
        sale(s, "s-surv", HUB, SURVIVOR, "Ana Garcia")
        sale(s, "s-abs-ticket", HUB, ABSORBED, "ana garcia")
        sale(
            s,
            "s-abs-invoice",
            HUB,
            ABSORBED,
            "ANA GARCIA LOPEZ",
            document_type="invoice",
        )
        sale(s, "s-abs-voided", HUB, ABSORBED, "ana garcia", status="voided")
        sale(s, "s-abs-refunded", HUB, ABSORBED, "ana garcia", status="refunded")
        sale(s, "s-abs-deleted", HUB, ABSORBED, "ana garcia", deleted=1)
        sale(s, "s-someone", HUB, "cust-luis", "Luis")
        sale(s, "s-walk-in", HUB, None, "")
        # The hub next door: the SAME opaque ids name other people there.
        sale(s, "n-abs", OTHER_HUB, ABSORBED, "Anabel")
        sale(s, "n-abs-deleted", OTHER_HUB, ABSORBED, "Anabel", deleted=1)
        sale(s, "n-surv", OTHER_HUB, SURVIVOR, "Anna")
        neighbour_before = fingerprint(s, OTHER_HUB)
        s.check(
            "no `customers` table here: the listener cannot depend on the absorbed sheet",
            s.q("SELECT COALESCE(to_regclass('customers_customer')::text, '')"),
            "",
        )
        s.check(
            "the neighbour really holds sales on the absorbed id (the control is armed)",
            s.q(
                f"SELECT count(*) FROM sales_sale WHERE hub_id = '{OTHER_HUB}' AND customer_id = '{ABSORBED}'"
            ),
            "2",
        )
        moved = (
            "s-abs-ticket",
            "s-abs-invoice",
            "s-abs-voided",
            "s-abs-refunded",
            "s-abs-deleted",
        )
        issued = {sid: cols(s, sid, FISCAL_COLS) for sid in moved}

        print("\n== the sales follow the survivor ==")
        merge(s)
        for sid in moved:
            s.check(
                f"{sid} now belongs to the survivor, stamped with who and when",
                cols(s, sid, ("customer_id", "updated_by", "updated_at")),
                {
                    "customer_id": SURVIVOR,
                    "updated_by": "user-merger",
                    "updated_at": NOW,
                },
            )

        print("\n== what was issued is not rewritten (VeriFactu) ==")
        for sid in moved:
            s.check(
                f"{sid}: the printed name and every fiscal column are exactly as issued",
                cols(s, sid, FISCAL_COLS),
                issued[sid],
            )

        print("\n== nobody else moves ==")
        s.check(
            "the survivor's own sale is untouched",
            cols(s, "s-surv", ("customer_id", "updated_at")),
            {"customer_id": SURVIVOR, "updated_at": CREATED},
        )
        s.check(
            "another customer's sale is untouched",
            cols(s, "s-someone", ("customer_id", "updated_at")),
            {"customer_id": "cust-luis", "updated_at": CREATED},
        )
        s.check(
            "a walk-in sale stays without customer",
            cols(s, "s-walk-in", ("customer_id", "updated_at")),
            {"customer_id": None, "updated_at": CREATED},
        )
        s.check(
            "nothing is left on the absorbed id in this hub",
            s.q(
                f"SELECT count(*) FROM sales_sale WHERE hub_id = '{HUB}' AND customer_id = '{ABSORBED}'"
            ),
            "0",
        )

        print("\n== tenancy: the hub next door is not touched ==")
        s.check(
            "hub B rows pointing at the absorbed id are NOT re-pointed",
            fingerprint(s, OTHER_HUB),
            neighbour_before,
        )

        print("\n== idempotent: a redelivery changes nothing ==")
        after_first = fingerprint(s, HUB)
        merge(s, now=LATER)
        s.check(
            "a second delivery moves nothing and stamps nothing",
            fingerprint(s, HUB),
            after_first,
        )

        print("\n== a degenerate event (surviving = absorbed) is a no-op ==")
        merge(s, surviving=SURVIVOR, absorbed=SURVIVOR, now=LATER)
        s.check(
            "the survivor's sales are not re-stamped", fingerprint(s, HUB), after_first
        )
    finally:
        s.drop()

    return s.report(
        "a merged customer keeps every sale, and nothing issued is rewritten (customers#86)"
    )


if __name__ == "__main__":
    sys.exit(main())
