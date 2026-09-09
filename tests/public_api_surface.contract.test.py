#!/usr/bin/env python3
"""What `sales` publishes to THIRD PARTIES, pinned as a reviewed list (sales#272, ADR-0057/0263).

An `expose_api` flag is not a detail of one command: it is the difference between «only this hub's
own screens may do this» and «anybody holding an API key with write scope on `sales` may do this,
from the internet». The runtime expands a key's scope into the `permission` of every `expose_api`
query (`read`) and command (`write`) of the module — `crates/runtime/src/api_keys.rs` — so the
manifest, and nothing else, decides the public surface. That makes the flag a **published
contract**, and this battery is what stops it from growing by accident.

WHAT THIS PINS:

  1. **The door `sales#272` opened.** `sales.complete_sale` is exposed for writing. Without it a
     shop could read everybody's sales and register none of its own — 12 queries out, zero commands
     in — and the WooCommerce/PrestaShop plugins, ERPlora's own invoicing and every customer
     integration have nowhere to land.

  2. 🔴 **And NOTHING else.** The exposed sets are compared whole, not merely searched for what
     should be there: a guard that only checks presence lets the next command through in silence.
     Adding a name below is a deliberate act with a review attached; that is the entire point.

  3. **No internal command is reachable from outside.** A `_`-prefixed command (`sales._insert_sale`)
     is a step the dispatcher composes, not an operation — several skip validation precisely because
     the command that calls them already validated. Exposing one would hand a third party the
     pieces of a sale without the sale.

  4. **`expose_api` relaxes NOTHING.** Every exposed operation keeps its own `permission`; the key's
     scope expands INTO those permissions, it does not replace them.

  5. 🔴 **Every exposed command demands an `idempotency_key`.** Through the till a double tap is an
     annoyance; over HTTP a network retry is a second sale — and with it a second invoice and a
     second entry in an immutable fiscal chain, which has no undo (ADR-0189). Idempotency stops
     being good practice and becomes the only defence, so it is required STRUCTURALLY: any command
     exposed here in the future has to carry the key, or this battery goes red. The behaviour
     itself — retry writes nothing, one sale, one invoice, one record — is `checkout.hub.test.py` §3.

  6. And a positive control: a run that inspected no operation FAILS. A guard that passes because it
     compared nothing is worse than no guard.

Usage: tests/public_api_surface.contract.test.py   (exit 0 = green)
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text(encoding="utf-8"))

#: The reviewed WRITE surface: what a third party may DO. One operation — a shop registers the sale
#: it just made, and the hub turns it into an invoice and a VeriFactu record (ADR-0478).
EXPOSED_COMMANDS = {"sales.complete_sale"}

#: The reviewed READ surface: what a third party may SEE. These predate sales#272; they are listed
#: so that opening the write door did not quietly widen the read one either.
EXPOSED_QUERIES = {
    "sales.list",
    "sales.get",
    "sales.lines",
    "sales.payments",
    "sales.orders.list",
    "sales.order.get",
    "sales.order.lines",
    "sales.payment_methods",
    "sales.by_staff",
    "sales.refund_options",
    "sales.refunds",
    "sales.refund_by_idempotency_key",
}

failures: list[str] = []
inspected = 0


def fail(message: str) -> None:
    failures.append(message)
    print(f"  FAIL: {message}")


def check(label: str, got, want) -> None:
    if got == want:
        print(f"  ok: {label}")
    else:
        fail(f"{label} — expected {want!r}, got {got!r}")


def exposed(section: str) -> set[str]:
    return {
        name
        for name, spec in MANIFEST.get(section, {}).items()
        if isinstance(spec, dict) and spec.get("expose_api") is True
    }


def main() -> int:
    global inspected

    print("\n1 · the public surface is EXACTLY the reviewed list")
    commands = exposed("commands")
    queries = exposed("queries")
    check("commands a third party may call", commands, EXPOSED_COMMANDS)
    check("queries a third party may read", queries, EXPOSED_QUERIES)

    print("\n2 · nothing internal is reachable from outside")
    for name in sorted(commands):
        spec = MANIFEST["commands"][name]
        inspected += 1
        leaf = name.rsplit(".", 1)[-1]
        if leaf.startswith("_"):
            fail(f"{name} is an internal step (`_` prefix) and must never be exposed")
        if spec.get("internal") is True:
            fail(f"{name} is declared `internal: true` and must never be exposed")

    print("\n3 · being public relaxes no permission")
    for name in sorted(commands | queries):
        section = "commands" if name in commands else "queries"
        spec = MANIFEST[section][name]
        inspected += 1
        if not isinstance(spec.get("permission"), str) or not spec["permission"]:
            fail(f"{name} is exposed without a `permission`: the key would gate nothing")

    print("\n4 · every exposed command demands an idempotency_key")
    for name in sorted(commands):
        spec = MANIFEST["commands"][name]
        inspected += 1
        schema_path = spec.get("schema")
        if not schema_path:
            fail(f"{name} is exposed with no `schema`: nothing validates what arrives")
            continue
        schema_file = MODULE_DIR / schema_path
        if not schema_file.is_file():
            fail(f"{name} points at a schema that does not exist: {schema_path}")
            continue
        schema = json.loads(schema_file.read_text(encoding="utf-8"))
        required = schema.get("required", [])
        if "idempotency_key" not in required:
            fail(
                f"{name} is exposed but its schema does not REQUIRE `idempotency_key` "
                f"(required: {required}); over HTTP a retry would write a second sale, "
                "a second invoice and a second fiscal record"
            )
        else:
            print(f"  ok: {name} requires `idempotency_key`")

    print("\n5 · positive control")
    if inspected == 0:
        fail(
            "this run inspected NO operation — the manifest sections were empty or renamed, "
            "so every check above passed by comparing nothing"
        )
    else:
        print(f"  ok: {inspected} operation checks actually ran")

    print()
    if failures:
        print(f"✗ public_api_surface: {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("✓ public_api_surface: the third-party surface is the reviewed one, and no wider")
    return 0


if __name__ == "__main__":
    sys.exit(main())
