#!/usr/bin/env python3
"""A refund can send back SOME units of a line, not only the whole line (sales#571).

The handler (`refund_returned_lines`) and `_insert_refund_line.sql` take `lines[].quantity` and
refuse more than what is left of the line with `sales.refund_line_quantity_exceeded`. Their own
tests drive them directly and would stay green with the door still closed: the payload schema has
`additionalProperties: false`, so without `quantity` declared there the dispatcher rejects the
partial refund before the handler sees it. This battery pins the door: the schema field, the error
code in the manifest and its message in both locales.

Usage: tests/refund_line_units_door.contract.test.py
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
SCHEMA = json.loads((MODULE_DIR / "schemas" / "refund_sale.json").read_text())
CODE = "sales.refund_line_quantity_exceeded"

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


def flat_keys(tree: dict, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for k, v in tree.items():
        full = f"{prefix}{k}"
        if isinstance(v, dict):
            keys |= flat_keys(v, f"{full}.")
        keys.add(full)
    return keys


def main() -> int:
    print("\n1 · the refund payload takes how many units of each line go back")
    item = SCHEMA["properties"]["lines"]["items"]
    qty = item["properties"].get("quantity") or {}
    check("lines[].quantity type", qty.get("type"), "integer")
    check("lines[].quantity minimum", qty.get("minimum"), 1)
    check("lines[].quantity is optional", "quantity" in item.get("required", []), False)
    check("lines[] stays closed", item.get("additionalProperties"), False)

    print("\n2 · asking for more than is left has its own code")
    check(f"{CODE} declared in errors", CODE in MANIFEST.get("errors", {}), True)
    for lang in ("en", "es"):
        keys = flat_keys(
            json.loads((MODULE_DIR / "locales" / f"{lang}.json").read_text())
        )
        check(f"{CODE} translated ({lang})", any(k.endswith(CODE) for k in keys), True)

    if failures:
        print(f"\n✗ {len(failures)} failure(s)")
        return 1
    print("\n✓ refund line units door")
    return 0


if __name__ == "__main__":
    sys.exit(main())
