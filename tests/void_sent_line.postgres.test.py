#!/usr/bin/env python3
"""A line already sent to the kitchen is VOIDED with a reason, not silently kept (sales#521).

Until sales#521 a line fired to the kitchen could not leave the check from the POS: the screen
locked it, and `sales.order.remove_line` — the only door that takes a line away — matched nothing
on it (`fired_at IS NULL`), answered «ok» anyway and STILL announced `sales.order.line_removed`, so
Services let go of a voucher session for a line that stayed on the bill.

The market (Toast, Square, TouchBistro, Lightspeed K-Series, LS Central, Aloha, Odoo POS) voids a
sent item with a mandatory reason and a manager's permission, and the kitchen sees it struck out.
`sales.order.void_line` is that door. This battery plays its SQL the way the kernel does — one
transaction, `hub_id` injected, `expect_rows` judged by the rows ITS statement touched — and pins:

  1. a fired line on an open check is voided: it leaves the check, keeps WHY and WHO (the manager
     the runtime names in `:approved_by`, or the caller when they hold the permission themselves),
     and the provisional total follows;
  2. nothing else can be voided through it — a line not yet sent (that one is just removed), a line
     already paid, a line on a check that is no longer open, a line already voided (its reason is
     not overwritten), a blank reason, and the neighbour's hub naming our ids — and in every one of
     those the gate statement touched no row, so the kernel answers with the declared error code
     instead of a silent «ok» and emits nothing;
  3. `sales.order.remove_line` on a fired line is no longer a silent «ok»: its gate statement
     touches no row and the manifest turns that into `sales.order_line_not_removable`.

Usage: tests/void_sent_line.postgres.test.py
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pg_harness import Session, bind

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text(encoding="utf-8"))

HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
NOW = "2026-10-07T12:00:00+00:00"
LATER = "2026-10-07T12:30:00+00:00"
VOID = "sales.order.void_line"
REMOVE = "sales.order.remove_line"


def open_check(s: Session, order_id: str, status: str = "open", hub: str = HUB) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order (id, hub_id, status, provisional_total, is_deleted,"
                " created_at, updated_at) VALUES (:id, :hub_id, :status, 0, 0, :now, :now)",
                {"id": order_id, "hub_id": hub, "status": status, "now": NOW},
            ),
        ]
    )


def add_line(
    s: Session,
    order_id: str,
    line_id: str,
    line_total: int,
    fired_at=NOW,
    sale_id=None,
    hub: str = HUB,
) -> None:
    s.psql(
        [
            "-c",
            bind(
                "INSERT INTO sales_order_item (id, hub_id, order_id, product_id, product_name,"
                " product_sku, quantity, unit_price, is_gift, gift_reason, line_total,"
                " tax_category_key, cost, round_no, fired_at, sale_id, is_deleted, created_by,"
                " updated_by, created_at, updated_at) VALUES (:id, :hub_id, :order_id, 'p-steak',"
                " 'Steak', '', 1000000, :line_total, 0, '', :line_total, '', 0, 1, :fired_at,"
                " :sale_id, 0, 'u-waiter', 'u-waiter', :now, :now)",
                {
                    "id": line_id,
                    "hub_id": hub,
                    "order_id": order_id,
                    "line_total": line_total,
                    "fired_at": fired_at,
                    "sale_id": sale_id,
                    "now": NOW,
                },
            ),
        ]
    )
    s.psql(
        [
            "-c",
            bind(
                "UPDATE sales_order SET provisional_total = provisional_total + :t"
                " WHERE id = :id AND hub_id = :hub_id",
                {"t": line_total, "id": order_id, "hub_id": hub},
            ),
        ]
    )


def line(s: Session, line_id: str):
    return s.rows(
        "SELECT is_deleted, void_reason, voided_by, voided_at FROM sales_order_item"
        f" WHERE id = '{line_id}'"
    )


def deleted(s: Session, line_id: str) -> int:
    return s.qi(f"SELECT is_deleted FROM sales_order_item WHERE id = '{line_id}'")


def total(s: Session, order_id: str):
    return s.qi(f"SELECT provisional_total FROM sales_order WHERE id = '{order_id}'")


def verdict(s: Session, command: str, payload: dict, hub=None, now=None):
    """Play `command` as the kernel does and return what it answers: `"ok"` when its gated
    statement touched at least `n` rows, otherwise the error code the manifest declares (the kernel
    rolls back and emits nothing in that case). A command with no gate answers `"ok"` always —
    which is exactly the silent success this battery exists to forbid."""
    spec = MANIFEST["commands"].get(command, {})
    gate = spec.get("expect_rows")
    ok, err, counts = s.chain([(command, payload)], hub=hub, now=now)
    if not ok:
        return f"<sql error: {err.splitlines()[-1] if err else ''}>"
    if not gate:
        return "ok"
    touched = [rows for (_cmd, rel, rows) in counts if rel == gate.get("statement")]
    if not touched:
        return f"<gate statement {gate.get('statement')!r} not in the chain>"
    return "ok" if touched[0] >= gate.get("n", 1) else gate.get("error")


def void(
    line_id: str,
    reason: str = "Wrong dish",
    approved_by: str = "u-manager",
    order_id="ord-1",
):
    return {
        "order_id": order_id,
        "line_id": line_id,
        "reason": reason,
        "approved_by": approved_by,
    }


NOT_VOIDABLE = "sales.order_line_not_voidable"


def scenario(s: Session) -> None:
    open_check(s, "ord-1")
    add_line(s, "ord-1", "l-steak", 1800)
    add_line(s, "ord-1", "l-wine", 1200)
    add_line(s, "ord-1", "l-pending", 500, fired_at=None)
    add_line(s, "ord-1", "l-paid", 900, sale_id="sale-1")

    print(
        "\n1 · a fired line on an open check is voided with its reason and who approved it"
    )
    s.check("the manager's void is accepted", verdict(s, VOID, void("l-steak")), "ok")
    s.check(
        "the line leaves the check and keeps why and who",
        line(s, "l-steak"),
        [
            {
                "is_deleted": 1,
                "void_reason": "Wrong dish",
                "voided_by": "u-manager",
                "voided_at": NOW,
            }
        ],
    )
    s.check(
        "the check's provisional total no longer counts it",
        total(s, "ord-1"),
        1200 + 500 + 900,
    )
    s.check(
        "sales.order.lines no longer lists it (a paid line was never listed)",
        sorted(r["id"] for r in s.query("sales.order.lines", {"order_id": "ord-1"})),
        ["l-pending", "l-wine"],
    )
    s.check(
        "a caller holding the permission themselves (no PIN) is the one recorded",
        verdict(
            s,
            VOID,
            void("l-wine", reason="  Customer changed their mind ", approved_by=""),
        ),
        "ok",
    )
    s.check(
        "the reason is stored trimmed and the caller is who voided it",
        line(s, "l-wine"),
        [
            {
                "is_deleted": 1,
                "void_reason": "Customer changed their mind",
                "voided_by": "u-waiter",
                "voided_at": NOW,
            }
        ],
    )

    print("\n2 · nothing else goes through the void door")
    s.check(
        "a line not yet sent is refused (it is removed, not voided)",
        verdict(s, VOID, void("l-pending")),
        NOT_VOIDABLE,
    )
    s.check("and stays on the check", deleted(s, "l-pending"), 0)
    s.check(
        "a line already paid is refused",
        verdict(s, VOID, void("l-paid")),
        NOT_VOIDABLE,
    )
    s.check("and stays on the check", deleted(s, "l-paid"), 0)
    s.check(
        "a line already voided is refused",
        verdict(
            s,
            VOID,
            void("l-steak", reason="Another reason", approved_by="u-other"),
            now=LATER,
        ),
        NOT_VOIDABLE,
    )
    s.check(
        "and its first reason, voider and time are not overwritten",
        line(s, "l-steak"),
        [
            {
                "is_deleted": 1,
                "void_reason": "Wrong dish",
                "voided_by": "u-manager",
                "voided_at": NOW,
            }
        ],
    )

    open_check(s, "ord-blank")
    add_line(s, "ord-blank", "l-blank", 700)
    s.check(
        "a blank reason is refused",
        verdict(s, VOID, void("l-blank", reason="   ", order_id="ord-blank")),
        NOT_VOIDABLE,
    )
    s.check("and the line stays on the check", deleted(s, "l-blank"), 0)
    s.check(
        "a line named under another check is refused",
        verdict(s, VOID, void("l-blank", order_id="ord-1")),
        NOT_VOIDABLE,
    )
    s.check("and the line stays on its check", deleted(s, "l-blank"), 0)

    for status in ("voided", "completed"):
        oid = f"ord-{status}"
        open_check(s, oid, status=status)
        add_line(s, oid, f"l-{status}", 600)
        s.check(
            f"a line on a {status} check is refused",
            verdict(s, VOID, void(f"l-{status}", order_id=oid)),
            NOT_VOIDABLE,
        )
        s.check("and is not touched", deleted(s, f"l-{status}"), 0)

    open_check(s, "ord-deleted")
    add_line(s, "ord-deleted", "l-deleted-check", 600)
    s.psql(["-c", "UPDATE sales_order SET is_deleted = 1 WHERE id = 'ord-deleted'"])
    s.check(
        "a line on a deleted check is refused",
        verdict(s, VOID, void("l-deleted-check", order_id="ord-deleted")),
        NOT_VOIDABLE,
    )
    s.check("and is not touched", deleted(s, "l-deleted-check"), 0)

    print(
        "\n2b · the neighbour cannot void our line by its ids, nor reach it through his check"
    )
    s.check(
        "the neighbour naming our check and line is refused",
        verdict(s, VOID, void("l-blank", order_id="ord-blank"), hub=OTHER_HUB),
        NOT_VOIDABLE,
    )
    s.check("and our line is untouched", deleted(s, "l-blank"), 0)
    # Ids are unique across hubs, so the check's own `hub_id` is pinned with a line of OURS that
    # names a check of the NEIGHBOUR's: his check being open must not make our line voidable.
    open_check(s, "ord-theirs", hub=OTHER_HUB)
    add_line(s, "ord-theirs", "l-shared", 650)
    s.check(
        "our line hanging from the neighbour's open check is refused",
        verdict(s, VOID, void("l-shared", order_id="ord-theirs")),
        NOT_VOIDABLE,
    )
    s.check("and our line is untouched", deleted(s, "l-shared"), 0)
    # And from his side: his check is open and the line names it, but the LINE is ours — only the
    # line's own `hub_id` keeps him out.
    s.check(
        "the neighbour voiding our line through his open check is refused",
        verdict(s, VOID, void("l-shared", order_id="ord-theirs"), hub=OTHER_HUB),
        NOT_VOIDABLE,
    )
    s.check("and our line is still untouched", deleted(s, "l-shared"), 0)

    print("\n3 · removing a fired line is an error, not a silent «ok»")
    open_check(s, "ord-rm")
    add_line(s, "ord-rm", "l-rm-fired", 400)
    add_line(s, "ord-rm", "l-rm-pending", 300, fired_at=None)
    s.check(
        "remove_line on a fired line answers sales.order_line_not_removable",
        verdict(s, REMOVE, {"order_id": "ord-rm", "line_id": "l-rm-fired"}),
        "sales.order_line_not_removable",
    )
    s.check("and the fired line stays", deleted(s, "l-rm-fired"), 0)
    s.check(
        "remove_line on a pending line still removes it",
        verdict(s, REMOVE, {"order_id": "ord-rm", "line_id": "l-rm-pending"}),
        "ok",
    )
    s.check("and the pending line is gone", deleted(s, "l-rm-pending"), 1)
    s.check("the check's total follows", total(s, "ord-rm"), 400)


def main() -> int:
    s = Session(
        f"sales_void_sent_line_{os.getpid()}", hub=HUB, user="u-waiter", now=NOW
    )
    try:
        s.create()
    except RuntimeError as exc:
        print(f"✗ cannot reach Postgres: {exc}")
        return 1
    try:
        scenario(s)
    finally:
        s.drop()
    return s.report(
        "a sent line is voided with a reason and nothing else goes through that door"
    )


if __name__ == "__main__":
    sys.exit(main())
