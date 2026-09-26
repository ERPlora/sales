#!/usr/bin/env python3
"""Adding a line to an open check refuses a quantity that is not fixed-point (sales#401).

`sales.order.add_line` and `sales.order.add_open_line` read `quantity` with the handler's lenient
parse (`as_qty`): a float (2.5) or a decimal string ("2.5") is not an i64, so it fell back to the
default of ONE unit and the command answered 200. An API client that asked for 2,5 waters got one
and nobody noticed. The runtime only turns that into `invalid_payload` if the command declares a
payload schema that types `quantity` as an integer — as `sales.order.open`, `complete_sale` and
(since rv-397) `sales.order.update_line` already do. This battery pins that wiring; the behaviour
against the real kernel is `orders.hub.test.py` §3c.

Usage: tests/order_add_line_door.contract.test.py
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
COMMANDS = MANIFEST["commands"]
DOORS = ("sales.order.add_line", "sales.order.add_open_line")

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


def types_of(prop: dict) -> list:
    t = prop.get("type")
    return t if isinstance(t, list) else [t]


def main() -> int:
    for door in DOORS:
        cmd = COMMANDS.get(door, {})
        print(f"\n· {door}")
        path = cmd.get("schema")
        check(
            f"{door} declares a payload schema",
            isinstance(path, str) and bool(path),
            True,
        )
        if not isinstance(path, str) or not (MODULE_DIR / path).is_file():
            check(f"{door} schema file exists", False, True)
            continue
        schema = json.loads((MODULE_DIR / path).read_text())
        props = schema.get("properties") or {}
        qty = types_of(props.get("quantity") or {})
        check(f"{door}: quantity is typed as integer", "integer" in qty, True)
        check(f"{door}: quantity is never a bare number", "number" in qty, False)
        check(f"{door}: quantity is never a string", "string" in qty, False)
        check(f"{door}: quantity may be omitted/null (one unit)", "null" in qty, True)
        # The payload is FLAT and carries many optional columns (unit context, modifiers, combo…):
        # the schema closes the quantity hole, it does not whitelist the rest of the shape.
        check(
            f"{door}: the rest of the flat payload still goes through",
            schema.get("additionalProperties", True),
            True,
        )
        check(
            f"{door}: order_id is required",
            "order_id" in (schema.get("required") or []),
            True,
        )

    if failures:
        print(f"\n{len(failures)} failure(s)")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
