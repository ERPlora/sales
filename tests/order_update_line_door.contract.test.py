#!/usr/bin/env python3
"""Changing the QUANTITY of a line on an open check is priced by the server (sales#394).

Until sales#394 `sales.order.update_line` was a bare SQL UPDATE that wrote `line_total = :line_total`
exactly as the till sent it: a tampered till, or an API client that got the sum wrong, left the open
check showing a provisional total nobody had checked. The line is now priced by the WASM handler
`update_order_line` from the row itself (frozen unit price + frozen supplements × the new quantity,
with the discount the row carries), like the split (sales#242) and the line discount (sales#385).
The handler's unit tests drive the pure function directly and would stay green with the manifest
still pointing at the old SQL; this battery pins the wiring.

Usage: tests/order_update_line_door.contract.test.py
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


def main() -> int:
    update = COMMANDS.get("sales.order.update_line", {})

    print("\n1 · the public door is the handler, not a bare UPDATE")
    check("permission", update.get("permission"), "sales.add_sale")
    check("handler type", (update.get("handler") or {}).get("type"), "wasm")
    check(
        "handler function", (update.get("handler") or {}).get("function"), "update_order_line"
    )
    check("no SQL of its own that could bind a line_total", update.get("sql"), None)
    check("the payload schema still guards it", update.get("schema"), "schemas/update_order_line.json")

    print("\n2 · it reads THIS check and THIS check's lines, and fails closed without them")
    for query in ("sales.order.get", "sales.order.lines"):
        r = read_of(update, query) or {}
        check(
            f"reads {query} of THIS order",
            (r.get("params") or {}).get("order_id"),
            "payload.order_id",
        )
        check(f"needs {query} (fails closed)", r.get("required"), True)

    print("\n3 · the write the handler emits stays scoped and guarded")
    write = COMMANDS.get("sales._update_order_line", {})
    files = write.get("sql") or []
    sql = "".join((MODULE_DIR / p).read_text() for p in files)
    check("the internal write exists", files, ["commands/order_update_line.sql"])
    check("the write is scoped to the hub", "hub_id = :hub_id" in sql, True)
    check("the write only touches unfired lines", "fired_at IS NULL" in sql, True)
    check("the write never binds a discount", ":discount_percent" in sql, False)
    check(
        "the internal write is not a public API", write.get("expose_api", False), False
    )

    print("\n4 · the payload never carries a discount (sales#385)")
    schema = json.loads((MODULE_DIR / "schemas/update_order_line.json").read_text())
    check(
        "update_line refuses a payload that carries discount_percent",
        "discount_percent" in ((schema.get("not") or {}).get("required") or []),
        True,
    )

    print("\n5 · the quantity is fixed-point INTEGER or absent, never a float (ADR-0147)")
    # Probed against hub:stable (rv-397): `quantity: 2.5` slipped past the schema and the handler's
    # lenient parse fell back to ONE unit — the till asked for 2,5 and the check silently sold 1.
    # `open_order.json` / `complete_sale.json` / `fire_order.json` already type it as integer.
    qty = (schema.get("properties") or {}).get("quantity") or {}
    types = qty.get("type")
    types = types if isinstance(types, list) else [types]
    check("quantity is typed as integer", "integer" in types, True)
    check("quantity is never a bare number", "number" in types, False)
    check("quantity may be omitted/null (note-only edit keeps the row's)", "null" in types, True)

    if failures:
        print(f"\n{len(failures)} failure(s)")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
