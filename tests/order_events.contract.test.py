#!/usr/bin/env python3
"""The open ticket ANNOUNCES what it takes away (services#84 · sales#162 / ADR-0386).

WHY `sales` HAS TO RAISE THIS. A module can hang a per-line tender on `sales.pos.tender` and cover
a line with something of its own — `services` covers it with a session of a customer's voucher, and
that session is spent from the moment the cashier taps it. Take the line out of the cart, or cancel
the whole ticket, and this module correctly stops charging it — but the OTHER module is left holding
something nobody told it to let go of. In `services` that meant a session stayed spent until a
deadline swept it, up to a day later; the market gives it back on the spot (Zenoti reopens the
package on `Remove`).

🔴 AND WHY IT CANNOT BE A CALL. `sales` hosts a slot and knows nothing about vouchers, sessions or
balances, and it must keep knowing nothing — a call into `services` would be exactly the hard
dependency ADR-0386 exists to avoid. Nor can the FILLER do it on its own: it is mounted per line, so
it is torn down WITH the line and cannot tell that tear-down apart from the one that happens when the
payment sheet closes, where its hold must survive. So this module states the FACT — a line left the
ticket, a ticket was cancelled — and whoever cares listens. Same shape as `sale.completed`, which
`services` already listens to in order to settle.

WHAT THIS PINS:

  1. both commands declare their event, and the names are the ones the listeners bind to. A rename
     here is a rename of a published contract and has to be a visible change, not a silent one;
  2. the names are in `events.emits`. The runtime puts a module that declares that list into STRICT
     mode (`crates/runtime/src/commands.rs`), so an event missing from it is refused at emit time —
     the command would fail, not just go unheard;
  3. 🔴 the PAYLOAD a listener needs is really in the event. The outbox row carries the emitting
     command's BOUND PARAMS, so what travels is exactly what that command's SQL binds. A listener
     keys on `order_id` (and, for a line, `line_id`); if a refactor here stopped binding one of
     them, the event would still fire, the listener would still run, its parameter would bind NULL
     and its conditional UPDATE would match nothing — a session lost with every check green. That
     is the failure this assertion exists for, and it is checked against the SQL, not against a
     comment;
  4. and a positive control: a run that inspected no command FAILS. A guard that passes because it
     compared nothing is worse than no guard.

Usage: tests/order_events.contract.test.py   (exit 0 = green)
"""

import json
import pathlib
import re
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text(encoding="utf-8"))

# command → (events it must raise, params a listener keys on and therefore needs in the payload)
CONTRACT = {
    "sales.order.remove_line": (["sales.order.line_removed"], {"order_id", "line_id"}),
    "sales.order.void": (["sales.order.voided"], {"order_id"}),
    # sales#521: voiding a line already sent to the kitchen takes it off the check too, so the
    # module that covered it lets it go on `line_removed` (same contract); `line_voided` is the
    # fact the kitchen keys on, and it carries WHY.
    "sales.order.void_line": (
        ["sales.order.line_removed", "sales.order.line_voided"],
        {"order_id", "line_id", "reason"},
    ),
    # kitchen#162: joining two checks takes the absorbed one away; the kitchen hands its rounds to
    # the check that stays, so it needs both ids.
    "sales.order.merge": (["sales.order.merged"], {"from_order_id", "to_order_id"}),
}

failures: list[str] = []
checked = 0


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def binds_of(rel: str) -> set[str]:
    """The `:name` parameters a statement binds — `::` casts are not parameters."""
    return set(re.findall(r"(?<!:):([a-z_][a-z0-9_]*)", (MODULE_DIR / rel).read_text()))


print("1. the gestures that take a line away announce it")
declared = set(MANIFEST.get("events", {}).get("emits", []))
for command, (events, needed) in CONTRACT.items():
    cmd = MANIFEST["commands"].get(command)
    if cmd is None:
        failures.append(f"{command}: not in the manifest")
        print(f"  FAIL: {command} is not in the manifest")
        continue
    checked += 1
    check(f"{command} raises its events", events, cmd.get("emit"))
    bound: set[str] = set()
    for rel in cmd.get("sql", []):
        bound |= binds_of(rel)
    for event in events:
        # Strict mode: with `events.emits` declared, a name outside it is refused when the command
        # runs.
        check(f"`{event}` is declared in events.emits", True, event in declared)
        check(f"`{event}` carries what a listener keys on", set(), needed - bound)

# 4. The positive control.
check("commands inspected", len(CONTRACT), checked)

print()
if failures:
    print(f"FAILED — {len(failures)} contract violation(s):")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)
print("PASS — the open ticket announces the lines it takes away")
