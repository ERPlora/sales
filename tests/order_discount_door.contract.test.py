#!/usr/bin/env python3
"""The discount on an open check has TWO doors, like the checkout (sales#284).

The handler cannot tell which command called it — the guest gets `{payload, context}` and no
command name — so the manager's door is a separate COMMAND bound to a separate exported FUNCTION,
behind `sales.discount.over_limit`. A flag in the payload would be the client granting itself the
permission. This battery pins the wiring no unit test sees: the handler's tests drive the pure
functions directly and would stay green with the manifest pointing both doors at one function,
with the cap read missing (the cap would always be 100), or with the write losing its gate.

Usage: tests/order_discount_door.contract.test.py
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


def read_names(cmd: dict) -> list[str]:
    return [r if isinstance(r, str) else r.get("query") for r in cmd.get("reads", [])]


def main() -> int:
    usual = COMMANDS.get("sales.order.set_discount", {})
    manager = COMMANDS.get("sales.order.set_discount_over_limit", {})

    print("\n1 · two doors, two functions, two permissions")
    check("usual door permission", usual.get("permission"), "sales.add_sale")
    check("manager door permission", manager.get("permission"), "sales.discount.over_limit")
    check("usual door function", (usual.get("handler") or {}).get("function"), "set_order_discount")
    check(
        "manager door function",
        (manager.get("handler") or {}).get("function"),
        "set_order_discount_over_limit",
    )
    check("the manager door is not a public API", manager.get("expose_api", False), False)

    print("\n2 · both doors read the cap and the open lines it is judged against")
    for name, cmd in (("usual", usual), ("manager", manager)):
        check(f"{name} door reads the settings", "sales.settings.get" in read_names(cmd), True)
        lines = next(
            (r for r in cmd.get("reads", []) if isinstance(r, dict) and r.get("query") == "sales.order.lines"),
            {},
        )
        check(f"{name} door reads THIS order's lines", (lines.get("params") or {}).get("order_id"), "payload.order_id")

    print("\n3 · the write keeps its gate: an order that is not open is refused, not ignored")
    write = COMMANDS.get("sales._set_order_discount", {})
    check("the write's gate code", (write.get("expect_rows") or {}).get("error"), "sales.order_unavailable")
    sql = "".join((MODULE_DIR / p).read_text() for p in write.get("sql", []))
    check("the write is scoped to the hub", "hub_id = :hub_id" in sql, True)
    check("the write only touches OPEN orders", "status = 'open'" in sql, True)

    print()
    if failures:
        print(f"✗ {len(failures)} failure(s)")
        return 1
    print("✓ the discount on an open check has the checkout's two doors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
