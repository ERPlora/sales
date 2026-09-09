#!/usr/bin/env python3
"""The DOOR lets a line name its professional (sales#273).

`schemas/complete_sale.json` closes its item shape with `additionalProperties: false`, which is the
right call — a typo in a line should be refused, not silently dropped. It also means the schema is
the door: an item property that is not declared there NEVER reaches the handler, however well the
handler, the command and the migration are wired underneath.

So this is the one link in the per-line attribution chain that no other battery covers. The
postgres battery proves the column, the command and the report behave; the handler's unit tests
prove the decision. Both drive the handler DIRECTLY and never pass through the schema, so with
`staff_id` missing here every one of them would stay green while the till's payload was rejected at
the runtime with `validation_failed` and the salon still could not split a ticket.

Usage: tests/line_staff_door.contract.test.py
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = json.loads((MODULE_DIR / "schemas" / "complete_sale.json").read_text())

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


def main() -> int:
    item = SCHEMA["properties"]["items"]["items"]

    print("\n1 · the item shape is CLOSED — which is why the property has to be declared")
    check(
        "an undeclared property on a line is refused, not dropped",
        item.get("additionalProperties"),
        False,
    )

    print("\n2 · and it declares the professional of the line")
    check("`staff_id` is a property of an item", "staff_id" in item.get("properties", {}), True)
    check(
        "with the same shape as the sale's own attribution: a string, or nothing",
        item.get("properties", {}).get("staff_id", {}).get("type"),
        ["string", "null"],
    )

    print("\n3 · the sale-wide attribution stays exactly where it was (sales#179)")
    check(
        "`staff_id` is still a property of the SALE too",
        SCHEMA["properties"].get("staff_id", {}).get("type"),
        ["string", "null"],
    )
    check(
        "and it is not required — a bar attributes nothing and still charges",
        "staff_id" in SCHEMA.get("required", []),
        False,
    )

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  · {f}")
        return 1
    print("PASS — a line can name its professional through the door the till actually uses")
    return 0


if __name__ == "__main__":
    sys.exit(main())
