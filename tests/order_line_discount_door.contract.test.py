#!/usr/bin/env python3
"""A LINE discount on an open check has the same two doors as the ticket one (sales#385).

Until sales#385 the till wrote a line discount through `sales.order.update_line`, a bare SQL
UPDATE with no cap: the reduced line showed on the screen before anybody authorised it, and the
manager's PIN only came at Charge. Now the discount goes through `sales.order.set_line_discount`
(the cashier's door, capped) and `sales.order.set_line_discount_over_limit` (the manager's,
`sales.discount.over_limit`), each bound to its own exported function — a flag in the payload
would be the client granting itself the permission. The handler's unit tests drive the pure
functions directly and would stay green with the manifest miswired; this battery pins the wiring.

Usage: tests/order_line_discount_door.contract.test.py
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
COMMANDS = MANIFEST["commands"]

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


def read_of(cmd: dict, query: str) -> dict | None:
    for r in cmd.get("reads", []):
        if r == query:
            return {"query": r}
        if isinstance(r, dict) and r.get("query") == query:
            return r
    return None


def sql_of(cmd: dict) -> str:
    return "".join((MODULE_DIR / p).read_text() for p in cmd.get("sql", []))


def main() -> int:
    usual = COMMANDS.get("sales.order.set_line_discount", {})
    manager = COMMANDS.get("sales.order.set_line_discount_over_limit", {})

    print("\n1 · two doors, two functions, two permissions")
    check("usual door permission", usual.get("permission"), "sales.add_sale")
    check(
        "manager door permission",
        manager.get("permission"),
        "sales.discount.over_limit",
    )
    check(
        "usual door function",
        (usual.get("handler") or {}).get("function"),
        "set_order_line_discount",
    )
    check(
        "manager door function",
        (manager.get("handler") or {}).get("function"),
        "set_order_line_discount_over_limit",
    )
    check(
        "the manager door is not a public API", manager.get("expose_api", False), False
    )

    print("\n2 · both doors read the cap, THIS check and THIS check's lines")
    for name, cmd in (("usual", usual), ("manager", manager)):
        check(
            f"{name} door reads the settings",
            read_of(cmd, "sales.settings.get") is not None,
            True,
        )
        for query in ("sales.order.get", "sales.order.lines"):
            r = read_of(cmd, query) or {}
            check(
                f"{name} door reads {query} of THIS order",
                (r.get("params") or {}).get("order_id"),
                "payload.order_id",
            )
            check(f"{name} door needs {query} (fails closed)", r.get("required"), True)

    print(
        "\n3 · the write keeps its gate: a line that is not live and unfired is refused, not ignored"
    )
    write = COMMANDS.get("sales._set_order_line_discount", {})
    check(
        "the write's gate code",
        (write.get("expect_rows") or {}).get("error"),
        "sales.order_line_not_available",
    )
    check("the write and the total move together", write.get("transaction"), True)
    # hub#1091: `expect_rows` counts the WHOLE batch unless anchored. The recompute UPDATE always
    # touches the order row, so it would satisfy `min 1` by itself and a refused line write would
    # come back 200 with nothing written. The guard must count the line write alone.
    write_sqls = write.get("sql") if isinstance(write.get("sql"), list) else [write.get("sql")]
    guarded = (write.get("expect_rows") or {}).get("statement") == "commands/order_set_line_discount.sql"
    check(
        "the gate counts the line write alone (single statement or anchored)",
        write_sqls == ["commands/order_set_line_discount.sql"] or guarded,
        True,
    )
    sql = sql_of(write)
    check("the write is scoped to the hub", "hub_id = :hub_id" in sql, True)
    check("the write only touches unfired lines", "fired_at IS NULL" in sql, True)
    check(
        "the write recomputes the check's total",
        "order_recompute_total.sql" in " ".join(write.get("sql", [])),
        True,
    )

    print("\n4 · the old ungated door no longer writes a discount")
    update = COMMANDS.get("sales.order.update_line", {})
    check(
        "update_line SQL does not write discount_percent",
        ":discount_percent" in sql_of(update),
        False,
    )
    schema_path = update.get("schema")
    schema = json.loads((MODULE_DIR / schema_path).read_text()) if schema_path else {}
    check(
        "update_line refuses a payload that carries discount_percent",
        "discount_percent" in ((schema.get("not") or {}).get("required") or []),
        True,
    )

    print("\n5 · the approval lives on the LINE and comes back with it")
    migrations = " ".join(
        MANIFEST.get("migrations", {}).get("postgres", [])
        if isinstance(MANIFEST.get("migrations"), dict)
        else []
    )
    mig = next((p for p in migrations.split() if "line_discount_approval" in p), None)
    check("a migration adds the line approval", mig is not None, True)
    if mig:
        text = (MODULE_DIR / mig).read_text()
        check(
            "it adds sales_order_item.discount_approved_by",
            "sales_order_item" in text and "discount_approved_by" in text,
            True,
        )
    lines_sql = (
        MODULE_DIR / MANIFEST["queries"]["sales.order.lines"]["sql"]
    ).read_text()
    check(
        "sales.order.lines hands the approval back",
        "discount_approved_by" in lines_sql,
        True,
    )

    print(
        "\n6 · the till names both doors LITERALLY (contracts.json is extracted statically)"
    )
    ui = "".join(
        p.read_text()
        for p in (MODULE_DIR / "ui").rglob("*.ts")
        if ".test." not in p.name
    )
    check(
        "the usual door is called by name",
        "'sales.order.set_line_discount'" in ui,
        True,
    )
    check(
        "the manager door is called by name",
        "'sales.order.set_line_discount_over_limit'" in ui,
        True,
    )

    print()
    if failures:
        print(f"✗ {len(failures)} failure(s)")
        return 1
    print("✓ the line discount on an open check has the checkout's two doors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
