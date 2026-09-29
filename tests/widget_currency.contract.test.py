#!/usr/bin/env python3
"""A home-screen panel of this module never pins a currency or a locale (sales#469, born from
hub#2387; same guard as cash_register#121).

Since hub#2387 the dashboard shell (`apps/web/src/lib/dashboard-widgets.ts`) formats a money
widget in the HUB's currency — scaled by that currency's minor unit — and in the language of the
UI, whenever the widget leaves `options.currency` / `options.locale` unset. A value the widget sets
still wins. «Today» set `"currency": "EUR"` and `"locale": "es-ES"`, so a business working in
dollars or yen read today's sales in euros, Spanish style, on the home screen while every other
screen of the app used its own currency; «Tickets» set `"locale": "es-ES"`, so the count kept
Spanish thousands separators under an English UI.

The amounts are the sales', always in the hub's currency: no sales panel can know better than the
hub which one that is, nor which language the person reading it uses.

What this file pins:
  1. no widget whose value is money (`format` or `valueFormat` = "currency") declares
     `options.currency` or `options.locale`;
  2. no widget at all declares `options.locale` (a count follows the UI language too);
  3. and a positive control: a run that found no money widget FAILS — a guard that compared
     nothing would pass for the wrong reason.

Usage: tests/widget_currency.contract.test.py   (exit 0 = green)
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
widgets = (
    json.loads((ROOT / "module.json").read_text(encoding="utf-8")).get("widgets") or {}
)

PINNED = ("currency", "locale")

errors = []
money = []
for wid, w in sorted(widgets.items()):
    opts = w.get("options") or {}
    is_money = "currency" in (opts.get("format"), opts.get("valueFormat"))
    if is_money:
        money.append(wid)
    for key in PINNED:
        if key not in opts or (key == "currency" and not is_money):
            continue
        errors.append(
            f"{wid}: options.{key} = {opts[key]!r} pins the panel; leave it unset so the "
            "home screen uses the hub currency and the language of the UI"
        )

if not money:
    errors.append("no widget formats money — nothing was checked")

for e in errors:
    print("FAIL:", e)
print(
    f"widget currency ({len(money)} money widgets: {', '.join(money)}):",
    "OK" if not errors else f"{len(errors)} error(s)",
)
sys.exit(1 if errors else 0)
